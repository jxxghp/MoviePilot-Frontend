import {
  isNativeIdentifier,
  isRecord,
  type NativeEnvelope,
  type NativeSnapshot,
  type NativeTransport,
} from './protocol'
import type { NativeWidgetResult } from './widgets'

/** 桥接只操作导航声明及生命周期，所有业务操作由调用方回到既有回调。 */
export interface NativeSessionOptions {
  transport: NativeTransport
  target: Window
  /** 每次分派前读取当前状态，避免缓存权限或旧 owner。 */
  readState(): { routeRevision: number; snapshot: NativeSnapshot }
  /** 接管与释放使用同一个 DOM 提交入口。 */
  setActive(active: boolean): void | Promise<void>
  /** 校验并应用原生量测，失败时不能隐藏网页导航。 */
  applyLayout(payload: Record<string, unknown>): void
  /** 执行已复核的当前意图；确认仅表示分派，不等待业务网络完成。 */
  execute(message: NativeEnvelope): boolean | Promise<boolean>
  /** 通知现有网页生命周期管理器，不启动另一套后台时钟。 */
  lifecycle(state: 'active' | 'inactive' | 'background'): void
  /** 可选小组件窄接口；结果不进入普通命令重放缓存。 */
  widgetRequest?(payload: Record<string, unknown>, signal: AbortSignal): Promise<NativeWidgetResult>
}

/** 单主文档的事务桥；没有 WebKit 门面时不会创建此对象。 */
export class NativeChromeSession {
  private phase: 'web' | 'waiting' | 'configured' | 'preparing' | 'active' | 'closed' = 'web'
  private sessionId?: string
  private stateRevision = 0
  private routeRevision = 0
  private sequence = 0
  private timer?: ReturnType<typeof setTimeout>
  private runningCommands = 0
  private readonly results = new Map<string, Promise<{ accepted: boolean; error?: string }>>()
  private readonly completed = new Set<string>()
  private readonly navigationPreviews = new Map<string, () => void>()
  private widgetsNegotiated = false
  private widgetsPaused = false
  private widgetForeground = true
  private widgetEpoch = 0
  private widgetRequest?: AbortController
  private widgetRequestId?: string
  private readonly widgetRequests = new Set<string>()
  /** 网页退出先同步通知宿主，再阻止本代次产生任何新的组件凭据。 */
  private readonly widgetLogout = () => {
    if (this.phase !== 'active' || !this.widgetsNegotiated) return
    this.cancelWidgetRequest()
    this.widgetsPaused = true
    this.post('widget.logout', {})
  }
  private readonly listener = (event: Event) => {
    void this.receive((event as CustomEvent<unknown>).detail).catch(() => this.fail())
  }

  /** 所有外部能力通过窄接口注入，便于用真实 Router 和受控 DOM 验证。 */
  constructor(private readonly options: NativeSessionOptions) {}

  /** 网页仍显示完整导航，先协商双方版本与能力。 */
  start() {
    if (this.phase !== 'web') return
    this.phase = 'waiting'
    this.options.target.addEventListener('moviepilot:native-message', this.listener)
    this.options.target.addEventListener('moviepilot:widget-logout', this.widgetLogout)
    this.post('web.ready', {
      majors: [1],
      capabilities: [
        'navigation.v1',
        'actions.v1',
        'layout.v1',
        'menu.v1',
        'notifications.v1',
        ...(this.options.transport.widgetsVersion === 1 && this.options.widgetRequest ? ['widgets.v1'] : []),
      ],
    })
    this.timer = setTimeout(() => {
      void this.fail()
    }, 3000)
  }

  /** 使用全量状态且单调递增展示修订，不序列化回调或认证信息。 */
  publish() {
    if (!['configured', 'preparing', 'active'].includes(this.phase)) return
    const { routeRevision, snapshot } = this.options.readState()
    this.routeRevision = routeRevision
    this.stateRevision += 1
    this.post('navigation.state', snapshot as unknown as Record<string, unknown>)
  }

  /** 仅在已协商的容器中保留当前可见页面，超时放行导航而不重放路由或业务操作。 */
  async prepareNavigation() {
    if (this.phase !== 'active' || this.options.transport.navigationPreviewVersion !== 1) return
    const id = `preview-${++this.sequence}`
    await new Promise<void>(resolve => {
      const timer = setTimeout(done, 150)
      /** 确认、释放、身份变化和超时共享一次完成路径。 */
      function done() {
        clearTimeout(timer)
        resolve()
      }
      this.navigationPreviews.set(id, done)
      this.post('navigation.departing', { id })
    })
    this.navigationPreviews.delete(id)
  }

  /** 预览不属于业务写操作，任何会话变化都必须立即释放等待。 */
  private clearNavigationPreviews() {
    for (const done of this.navigationPreviews.values()) done()
    this.navigationPreviews.clear()
  }

  /** 卸载时撤销 DOM 模式及全部回调引用，不能把旧 owner 留给下一布局。 */
  async stop() {
    this.clearNavigationPreviews()
    this.cancelWidgetRequest()
    this.widgetsNegotiated = false
    clearTimeout(this.timer)
    this.options.target.removeEventListener('moviepilot:native-message', this.listener)
    this.options.target.removeEventListener('moviepilot:widget-logout', this.widgetLogout)
    this.phase = 'closed'
    await this.options.setActive(false)
    this.results.clear()
    this.completed.clear()
    this.sessionId = undefined
  }

  /** 当前认证或权限上下文变化时通知宿主清理旧命令，再发布新代次。 */
  identityChanged() {
    this.clearNavigationPreviews()
    this.cancelWidgetRequest()
    this.widgetsPaused = true
    if (!this.sessionId) return
    this.results.clear()
    this.completed.clear()
    this.post('session.state', { changed: true })
  }

  /** 当前页面注册超出协议表达范围时恢复完整网页导航。 */
  fallback() {
    void this.fail()
  }

  /** 取消只释放当前等待，不清除本会话的请求标识，避免恢复前台时重放写请求。 */
  private cancelWidgetRequest() {
    this.widgetEpoch += 1
    this.widgetRequest?.abort()
    this.widgetRequest = undefined
    this.widgetRequestId = undefined
  }

  /** 专用结果只发送一次；关闭、后台、身份变化和超时均不能留下旧凭据响应。 */
  private async receiveWidget(message: NativeEnvelope) {
    if (
      this.phase !== 'active' ||
      !this.widgetsNegotiated ||
      this.widgetsPaused ||
      !this.widgetForeground ||
      !this.options.widgetRequest ||
      this.widgetRequests.has(message.requestId)
    )
      return
    const reply = (result: NativeWidgetResult) =>
      this.post('widget.result', { requestId: message.requestId, ...result })
    if (this.widgetRequests.size >= 128) return reply({ success: false, error: 'request_limit' })
    this.widgetRequests.add(message.requestId)
    if (message.routeRevision !== this.options.readState().routeRevision)
      return reply({ success: false, error: 'stale_request' })
    if (this.widgetRequest) return reply({ success: false, error: 'busy' })
    const controller = new AbortController()
    this.widgetRequest = controller
    this.widgetRequestId = message.requestId
    const epoch = this.widgetEpoch
    const timer = setTimeout(() => controller.abort(), 15000)
    const cancelled = new Promise<NativeWidgetResult>(resolve => {
      controller.signal.addEventListener('abort', () => resolve({ success: false, error: 'cancelled' }), { once: true })
    })
    let result: NativeWidgetResult
    try {
      result = await Promise.race([this.options.widgetRequest(message.payload, controller.signal), cancelled])
      if (new TextEncoder().encode(JSON.stringify(result)).length > 2048)
        result = { success: false, error: 'invalid_data' }
    } catch {
      result = { success: false, error: 'unavailable' }
    } finally {
      clearTimeout(timer)
      if (this.widgetRequest === controller) {
        this.widgetRequest = undefined
        this.widgetRequestId = undefined
      }
    }
    if (
      epoch === this.widgetEpoch &&
      this.phase === 'active' &&
      message.sessionId === this.sessionId &&
      this.widgetsNegotiated &&
      !this.widgetsPaused &&
      this.widgetForeground
    )
      reply(result)
  }

  /** 只接受结构、大小、版本和当前会话均正确的封闭消息集合。 */
  private async receive(value: unknown) {
    if (
      !isRecord(value) ||
      (this.phase === 'closed' && value.type !== 'chrome.release') ||
      value.protocol !== 'moviepilot.chrome' ||
      value.major !== 1 ||
      !isNativeIdentifier(value.requestId) ||
      typeof value.type !== 'string' ||
      !isRecord(value.payload) ||
      new TextEncoder().encode(JSON.stringify(value)).length > 65536
    )
      return
    const message = value as unknown as NativeEnvelope
    if (message.type === 'host.configure') {
      const capabilities = message.payload.capabilities
      if (
        this.phase !== 'waiting' ||
        !isNativeIdentifier(message.sessionId) ||
        message.payload.sessionId !== message.sessionId ||
        message.payload.major !== 1 ||
        !Array.isArray(capabilities) ||
        !['navigation.v1', 'actions.v1', 'layout.v1', 'menu.v1'].every(capability => capabilities.includes(capability))
      )
        return
      clearTimeout(this.timer)
      this.sessionId = message.sessionId
      this.widgetsNegotiated = Boolean(
        this.options.transport.widgetsVersion === 1 &&
        this.options.widgetRequest &&
        capabilities.includes('widgets.v1'),
      )
      this.phase = 'configured'
      this.publish()
      this.timer = setTimeout(() => {
        void this.fail()
      }, 3000)
      return
    }
    if (!this.sessionId || message.sessionId !== this.sessionId) return
    if (
      message.type === 'widget.cancel' &&
      this.widgetsNegotiated &&
      isNativeIdentifier(message.payload.requestId) &&
      message.payload.requestId === this.widgetRequestId
    ) {
      this.cancelWidgetRequest()
      return
    }
    if (message.type === 'widget.request') {
      await this.receiveWidget(message)
      return
    }
    if (message.type === 'navigation.previewed') {
      if (this.phase === 'active' && typeof message.payload.id === 'string')
        this.navigationPreviews.get(message.payload.id)?.()
      return
    }
    if (message.type === 'host.rekey') {
      this.clearNavigationPreviews()
      this.cancelWidgetRequest()
      if (this.phase !== 'active' || !isNativeIdentifier(message.payload.sessionId)) {
        await this.fail()
        return
      }
      this.sessionId = message.payload.sessionId
      this.widgetRequests.clear()
      this.widgetsPaused = false
      this.stateRevision = 0
      this.results.clear()
      this.completed.clear()
      this.publish()
      return
    }
    if (message.type === 'chrome.release') {
      this.clearNavigationPreviews()
      this.cancelWidgetRequest()
      this.widgetsNegotiated = false
      this.phase = 'closed'
      clearTimeout(this.timer)
      await this.options.setActive(false)
      this.post('chrome.released', {})
      return
    }
    if (message.type === 'chrome.prepare') {
      if (this.phase !== 'configured') return
      this.options.applyLayout(message.payload)
      this.phase = 'preparing'
      await this.options.setActive(true)
      if (this.phase !== 'preparing') {
        await this.options.setActive(false)
        return
      }
      this.phase = 'active'
      clearTimeout(this.timer)
      this.post('chrome.accepted', { layoutRevision: message.payload.layoutRevision })
      return
    }
    if (message.type === 'host.layout' && this.phase === 'active') {
      this.options.applyLayout(message.payload)
      return
    }
    if (message.type === 'host.lifecycle') {
      const state = message.payload.state
      if (state === 'active' || state === 'inactive' || state === 'background') {
        this.widgetForeground = state === 'active'
        if (!this.widgetForeground) this.cancelWidgetRequest()
        this.options.lifecycle(state)
        clearTimeout(this.timer)
        if (state === 'active' && ['configured', 'preparing'].includes(this.phase))
          this.timer = setTimeout(() => {
            void this.fail()
          }, 3000)
      }
      return
    }
    if (
      ![
        'navigation.selectRoot',
        'navigation.back',
        'navigation.open',
        'navigation.waitForPaint',
        'notification.open',
        'headerTab.select',
        'action.invoke',
        'presentation.prepare',
        'presentation.attach',
        'presentation.detach',
        'presentation.dismiss',
        'presentation.action',
        'confirmation.respond',
        'state.request',
      ].includes(message.type)
    )
      return
    let result = this.results.get(message.requestId)
    if (!result) {
      if (this.runningCommands >= 16) {
        this.post('command.result', { requestId: message.requestId, accepted: false, error: 'busy' })
        return
      }
      this.runningCommands += 1
      result = this.dispatch(message).finally(() => {
        this.runningCommands -= 1
      })
      this.results.set(message.requestId, result)
      // 只清理已经完成的旧结果，不移除尚未确认的命令来腾出并发槽。
      void result.then(() => {
        if (this.results.get(message.requestId) !== result) return
        this.completed.add(message.requestId)
        while (this.results.size > 256 && this.completed.size) {
          const oldest = this.completed.values().next().value!
          this.completed.delete(oldest)
          this.results.delete(oldest)
        }
      })
    }
    const reply = await result
    if (message.sessionId === this.sessionId && this.phase === 'active') {
      this.post('command.result', { requestId: message.requestId, ...reply })
      this.publish()
    }
  }

  /** 分派前重新检查当前代次；重复 requestId 只返回第一次分派结果。 */
  private async dispatch(message: NativeEnvelope) {
    if (this.phase !== 'active') return { accepted: false, error: 'busy' }
    try {
      if (message.type !== 'state.request' && message.routeRevision !== this.options.readState().routeRevision)
        return { accepted: false, error: 'stale_route' }
      const accepted = message.type === 'state.request' || (await this.options.execute(message))
      return accepted ? { accepted: true } : { accepted: false, error: 'action_not_available' }
    } catch {
      return { accepted: false, error: 'navigation_cancelled' }
    }
  }

  /** 发送上限内 JSON；传输失败恢复网页并让原生执行释放事务。 */
  private post(type: string, payload: Record<string, unknown>) {
    const message: NativeEnvelope = {
      protocol: 'moviepilot.chrome',
      major: 1,
      type,
      requestId: `web-${++this.sequence}`,
      payload,
    }
    if (this.sessionId) {
      message.sessionId = this.sessionId
      // 恢复通知也必须能在当前注册损坏时发送，元数据使用最后一次成功读取的路由代次。
      message.routeRevision = this.routeRevision
      message.stateRevision = this.stateRevision
    }
    const serialized = JSON.stringify(message)
    if (new TextEncoder().encode(serialized).length > 65536) throw new Error('invalid_message')
    // WK 消息只接收独立的标准 JSON 值，不能直接传 Vue Proxy 或后续仍会变化的响应式对象。
    this.options.transport.postMessage(JSON.parse(serialized) as NativeEnvelope)
  }

  /** 只有仍可执行 JS 时才能恢复网页；宿主另行处理进程终止。 */
  private async fail() {
    this.clearNavigationPreviews()
    this.cancelWidgetRequest()
    this.widgetsNegotiated = false
    if (this.phase === 'closed') return
    this.phase = 'closed'
    clearTimeout(this.timer)
    await this.options.setActive(false)
    if (this.sessionId) {
      try {
        this.post('chrome.failed', { reason: 'adapter_unavailable' })
      } catch {
        /* 宿主超时将显示恢复出口。 */
      }
    }
  }
}
