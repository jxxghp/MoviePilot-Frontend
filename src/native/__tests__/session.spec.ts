import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { isProxy, reactive } from 'vue'
import { NativeChromeSession, type NativeSessionOptions } from '../session'
import type { NativeEnvelope, NativeSnapshot } from '../protocol'

const snapshot: NativeSnapshot = {
  route: { fullPath: '/apps', rootId: '/apps', title: '更多', canGoBack: false },
  roots: [{ id: '/apps', path: '/apps', title: '更多', icon: 'apps' }],
  actions: [],
  chrome: { topVisible: true, bottomVisible: true, theme: 'system' },
}
const cleanups: Array<() => Promise<void>> = []

/** 用宿主固定入口发送消息，不越过会话的实际事件监听路径。 */
async function send(type: string, payload: Record<string, unknown> = {}, extra: Partial<NativeEnvelope> = {}) {
  window.dispatchEvent(
    new CustomEvent('moviepilot:native-message', {
      detail: {
        protocol: 'moviepilot.chrome',
        major: 1,
        type,
        requestId: 'native-1',
        sessionId: 'session-1',
        routeRevision: 1,
        payload,
        ...extra,
      },
    }),
  )
  await flushPromises()
}

/** 每个测试拥有独立回调和文档会话，便于验证重复分派与权限代次变化。 */
function harness(overrides: Partial<NativeSessionOptions> = {}) {
  const messages: NativeEnvelope[] = []
  const options: NativeSessionOptions = {
    target: window,
    transport: { transportVersion: 1, postMessage: message => messages.push(message) },
    readState: () => ({ routeRevision: 1, snapshot }),
    setActive: vi.fn(),
    applyLayout: vi.fn(),
    execute: vi.fn(() => true),
    lifecycle: vi.fn(),
    ...overrides,
  }
  const session = new NativeChromeSession(options)
  cleanups.push(() => session.stop())
  session.start()
  return { session, options, messages }
}

/** 宿主协商和布局确认都必须经事件入口完成。 */
async function activate(widgets = false) {
  await send('host.configure', {
    sessionId: 'session-1',
    major: 1,
    capabilities: ['navigation.v1', 'actions.v1', 'layout.v1', 'menu.v1', ...(widgets ? ['widgets.v1'] : [])],
  })
  await send('chrome.prepare', { layoutRevision: 7 })
}

/** 小组件测试仍走真实事件协商，只有双方版本一致才提供专用处理器。 */
function widgetHarness(request: NonNullable<NativeSessionOptions['widgetRequest']>) {
  const messages: NativeEnvelope[] = []
  const current = harness({
    transport: { transportVersion: 1, widgetsVersion: 1, postMessage: message => messages.push(message) },
    widgetRequest: request,
  })
  return { ...current, messages }
}

afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup()
})

describe('小组件专用会话与一次性结果', () => {
  const value = {
    success: true as const,
    data: { version: 1 as const, owner: 'a'.repeat(32), availableContents: [], secret: 'synthetic-private-secret' },
  }

  it('仅新容器与网页双向协商后执行，旧会话和重复请求不能重放登记', async () => {
    const request = vi.fn(async () => value)
    const first = widgetHarness(request)
    expect(first.messages[0].payload.capabilities).toContain('widgets.v1')
    await activate()
    await send('widget.request', { operation: 'register' }, { requestId: 'widget-1' })
    expect(request).not.toHaveBeenCalled()
    await first.session.stop()
    const h = widgetHarness(request)
    await activate(true)
    await send('widget.request', { operation: 'register' }, { requestId: 'widget-1', sessionId: 'old' })
    expect(request).not.toHaveBeenCalled()
    await send('widget.request', { operation: 'register' }, { requestId: 'widget-1' })
    await send('widget.request', { operation: 'register' }, { requestId: 'widget-1' })
    expect(request).toHaveBeenCalledOnce()
    const replies = h.messages.filter(message => message.type === 'widget.result')
    expect(replies).toHaveLength(1)
    expect(replies[0].payload).toEqual({ requestId: 'widget-1', ...value })
    expect(JSON.stringify(h.messages.filter(message => message.type !== 'widget.result'))).not.toContain(
      value.data.secret,
    )
    expect(h.messages.some(message => message.type === 'command.result')).toBe(false)
  })

  it('一个在途请求期间只返回忙碌，旧路由与重复ID都不执行', async () => {
    let finish!: (result: typeof value) => void
    const request = vi.fn(() => new Promise<typeof value>(resolve => (finish = resolve)))
    const h = widgetHarness(request)
    await activate(true)
    await send('widget.request', { operation: 'register' }, { requestId: 'widget-1' })
    await send('widget.request', { operation: 'register' }, { requestId: 'widget-1' })
    await send('widget.request', { operation: 'register' }, { requestId: 'widget-2' })
    await send('widget.request', { operation: 'register' }, { requestId: 'widget-3', routeRevision: 0 })
    expect(request).toHaveBeenCalledOnce()
    expect(h.messages.filter(message => message.type === 'widget.result').map(message => message.payload)).toEqual([
      { requestId: 'widget-2', success: false, error: 'busy' },
      { requestId: 'widget-3', success: false, error: 'stale_request' },
    ])
    finish(value)
    await flushPromises()
    await send('widget.request', { operation: 'register' }, { requestId: 'widget-2' })
    expect(request).toHaveBeenCalledOnce()
    expect(h.messages.filter(message => message.type === 'widget.result')).toHaveLength(3)
  })

  it.each(['identity', 'background', 'inactive', 'release', 'stop', 'logout', 'rekey', 'cancel'])(
    '%s 取消等待；处理器迟到的凭据不能跨会话交付',
    async change => {
      let finish!: (result: typeof value) => void
      let signal!: AbortSignal
      const request = vi.fn((_payload, currentSignal: AbortSignal) => {
        signal = currentSignal
        return new Promise<typeof value>(resolve => (finish = resolve))
      })
      const h = widgetHarness(request)
      await activate(true)
      await send('widget.request', { operation: 'register' }, { requestId: 'widget-1' })
      if (change === 'identity') h.session.identityChanged()
      if (change === 'background' || change === 'inactive') await send('host.lifecycle', { state: change })
      if (change === 'release') await send('chrome.release')
      if (change === 'stop') await h.session.stop()
      if (change === 'logout') window.dispatchEvent(new Event('moviepilot:widget-logout'))
      if (change === 'rekey') await send('host.rekey', { sessionId: 'session-2' })
      if (change === 'cancel') {
        await send('widget.cancel', { requestId: 'other-request' })
        expect(signal.aborted).toBe(false)
        await send('widget.cancel', { requestId: 'widget-1' }, { sessionId: 'old' })
        expect(signal.aborted).toBe(false)
        await send('widget.cancel', { requestId: 'widget-1' })
      }
      expect(signal.aborted).toBe(true)
      finish(value)
      await flushPromises()
      expect(h.messages.some(message => message.type === 'widget.result')).toBe(false)
      expect(JSON.stringify(h.messages)).not.toContain(value.data.secret)
      if (change === 'logout') {
        expect(h.messages.find(message => message.type === 'widget.logout')?.payload).toEqual({})
        await send('widget.request', { operation: 'context' }, { requestId: 'widget-2' })
        expect(request).toHaveBeenCalledOnce()
      }
    },
  )

  it('超时立即结算且不接收迟到结果，后台恢复也不能重放旧ID', async () => {
    let finish!: (result: typeof value) => void
    const request = vi.fn(() => new Promise<typeof value>(resolve => (finish = resolve)))
    const h = widgetHarness(request)
    await activate(true)
    vi.useFakeTimers()
    try {
      await send('widget.request', { operation: 'register' }, { requestId: 'widget-1' })
      await vi.advanceTimersByTimeAsync(15001)
      expect(h.messages.filter(message => message.type === 'widget.result').map(message => message.payload)).toEqual([
        { requestId: 'widget-1', success: false, error: 'cancelled' },
      ])
      finish(value)
      await flushPromises()
      await send('host.lifecycle', { state: 'background' })
      await send('host.lifecycle', { state: 'active' })
      await send('widget.request', { operation: 'register' }, { requestId: 'widget-1' })
      expect(request).toHaveBeenCalledOnce()
      expect(h.messages.filter(message => message.type === 'widget.result')).toHaveLength(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('请求账本与响应都有上限，超限不能执行额外操作或输出正文', async () => {
    const request = vi.fn(async () => value)
    const h = widgetHarness(request)
    await activate(true)
    for (let index = 0; index < 129; index++)
      await send('widget.request', { operation: 'context' }, { requestId: `widget-${index}` })
    expect(request).toHaveBeenCalledTimes(128)
    expect(h.messages.at(-1)?.payload).toEqual({ requestId: 'widget-128', success: false, error: 'request_limit' })
    await h.session.stop()
    const oversized = widgetHarness(async () => ({ ...value, data: { ...value.data, owner: 'x'.repeat(3000) } }))
    await activate(true)
    await send('widget.request', { operation: 'context' }, { requestId: 'widget-1' })
    expect(oversized.messages.at(-1)?.payload).toEqual({ requestId: 'widget-1', success: false, error: 'invalid_data' })
  })
})

describe('原生导航接管事务', () => {
  it('离页只等待支持预览的新容器，确认必须属于当前会话且不执行任何业务命令', async () => {
    const legacy = harness()
    await activate()
    await legacy.session.prepareNavigation()
    expect(legacy.messages.some(message => message.type === 'navigation.departing')).toBe(false)
    await legacy.session.stop()
    const messages: NativeEnvelope[] = []
    const { session, options } = harness({
      transport: { transportVersion: 1, navigationPreviewVersion: 1, postMessage: message => messages.push(message) },
    })
    await activate()
    const done = vi.fn()
    const pending = session.prepareNavigation().then(done)
    const request = messages.find(message => message.type === 'navigation.departing')!
    expect(request.routeRevision).toBe(1)
    await send('navigation.previewed', request.payload, { sessionId: 'old-session' })
    expect(done).not.toHaveBeenCalled()
    await send('navigation.previewed', request.payload)
    await pending
    expect(done).toHaveBeenCalledOnce()
    expect(options.execute).not.toHaveBeenCalled()
    const changed = session.prepareNavigation()
    session.identityChanged()
    await changed
  })

  it('预览确认丢失时有界放行路由，停止会话也不遗留等待', async () => {
    const { session } = harness({
      transport: { transportVersion: 1, navigationPreviewVersion: 1, postMessage: vi.fn() },
    })
    await activate()
    vi.useFakeTimers()
    try {
      const done = vi.fn()
      const pending = session.prepareNavigation().then(done)
      await vi.advanceTimersByTimeAsync(151)
      await pending
      expect(done).toHaveBeenCalledOnce()
      const stopped = session.prepareNavigation()
      await session.stop()
      await stopped
    } finally {
      vi.useRealTimers()
    }
  })

  it('展示快照脱离 Vue 代理，传输后修改原状态不会改变已经交付的消息', async () => {
    const source = reactive<NativeSnapshot>({
      ...snapshot,
      presentation: {
        overlayOpen: true,
        sheet: { id: 'sheet-1', title: '名称识别', fullscreen: false, canDismiss: true, actions: [] },
      },
    })
    const { messages } = harness({ readState: () => ({ routeRevision: 1, snapshot: source }) })
    await activate()
    const delivered = messages.find(message => message.type === 'navigation.state')!
    expect(isProxy(delivered.payload)).toBe(false)
    const presentation = delivered.payload.presentation as NativeSnapshot['presentation']
    expect(isProxy(presentation?.sheet)).toBe(false)
    source.presentation!.sheet!.title = '后续弹窗'
    expect(presentation?.sheet?.title).toBe('名称识别')
  })

  it('先保留网页，只有完整配置与布局确认后才提交接管', async () => {
    const { options, messages } = harness()
    expect(messages[0].type).toBe('web.ready')
    expect(options.setActive).not.toHaveBeenCalled()
    await send('chrome.prepare', { layoutRevision: 1 })
    expect(options.setActive).not.toHaveBeenCalled()
    await activate()
    expect(messages.map(message => message.type)).toEqual(['web.ready', 'navigation.state', 'chrome.accepted'])
    expect(options.applyLayout).toHaveBeenCalledBefore(options.setActive as ReturnType<typeof vi.fn>)
    expect(options.setActive).toHaveBeenCalledWith(true)
    expect(messages.at(-1)?.payload.layoutRevision).toBe(7)
  })

  it('过期会话和过期路由不能执行动作，重复请求只分派一次', async () => {
    const { options, messages } = harness()
    await activate()
    await send('action.invoke', {}, { sessionId: 'old' })
    await send('action.invoke', {}, { routeRevision: 0, requestId: 'old-route' })
    expect(options.execute).not.toHaveBeenCalled()
    expect(messages.find(message => message.payload.requestId === 'old-route')?.payload.error).toBe('stale_route')
    await send('action.invoke', {}, { requestId: 'once' })
    await send('action.invoke', {}, { requestId: 'once' })
    expect(options.execute).toHaveBeenCalledTimes(1)
    expect(
      messages.filter(message => message.type === 'command.result' && message.payload.requestId === 'once'),
    ).toHaveLength(2)
  })

  it('仍在等待回调的重复命令也不会重复分派', async () => {
    let finish!: (value: boolean) => void
    const { options } = harness({
      execute: vi.fn(
        () =>
          new Promise<boolean>(resolve => {
            finish = resolve
          }),
      ),
    })
    await activate()
    await send('action.invoke', {}, { requestId: 'waiting' })
    await send('action.invoke', {}, { requestId: 'waiting' })
    expect(options.execute).toHaveBeenCalledTimes(1)
    finish(true)
    await flushPromises()
  })

  it('结果缓存周转不会驱逐仍在执行的请求并重复分派', async () => {
    let finish!: (value: boolean) => void
    const execute = vi.fn((message: NativeEnvelope) =>
      message.requestId === 'waiting'
        ? new Promise<boolean>(resolve => {
            finish = resolve
          })
        : true,
    )
    harness({ execute })
    await activate()
    await send('action.invoke', {}, { requestId: 'waiting' })
    for (let index = 0; index < 260; index++) await send('action.invoke', {}, { requestId: `finished-${index}` })
    await send('action.invoke', {}, { requestId: 'waiting' })
    expect(execute.mock.calls.filter(([message]) => message.requestId === 'waiting')).toHaveLength(1)
    finish(true)
    await flushPromises()
  })

  it('恢复网页 DOM 完成后才确认释放，之后命令失效', async () => {
    const { options, messages } = harness()
    await activate()
    await send('chrome.release')
    expect(options.setActive).toHaveBeenLastCalledWith(false)
    expect(messages.at(-1)?.type).toBe('chrome.released')
    await send('action.invoke')
    expect(options.execute).not.toHaveBeenCalled()
  })

  it('失配能力或布局错误保持网页模式', async () => {
    const { options } = harness({
      applyLayout: () => {
        throw new Error('invalid')
      },
    })
    await send('host.configure', { sessionId: 'session-1', major: 1, capabilities: [] })
    expect(options.setActive).not.toHaveBeenCalled()
    await activate()
    expect(options.setActive).not.toHaveBeenCalledWith(true)
    expect(options.setActive).toHaveBeenCalledWith(false)
  })

  it('准备与释放交错时不会迟到接管', async () => {
    let finish!: () => void
    const { messages } = harness({
      setActive: value =>
        value
          ? new Promise<void>(resolve => {
              finish = resolve
            })
          : undefined,
    })
    await send('host.configure', {
      sessionId: 'session-1',
      major: 1,
      capabilities: ['navigation.v1', 'actions.v1', 'layout.v1', 'menu.v1'],
    })
    await send('chrome.prepare', { layoutRevision: 7 })
    await send('chrome.release')
    finish()
    await flushPromises()
    expect(messages.some(message => message.type === 'chrome.accepted')).toBe(false)
  })

  it('身份轮换后拒绝旧文档关联，并能从适配失败中确认恢复网页', async () => {
    const { session, options, messages } = harness()
    await activate()
    session.identityChanged()
    expect(messages.at(-1)?.type).toBe('session.state')
    await send('host.rekey', { sessionId: 'session-2' })
    expect(messages.at(-1)?.sessionId).toBe('session-2')
    await send('action.invoke', {}, { requestId: 'old-user' })
    expect(options.execute).not.toHaveBeenCalled()
    session.fallback()
    await flushPromises()
    expect(messages.at(-1)?.type).toBe('chrome.failed')
    await send('chrome.release', {}, { sessionId: 'session-2' })
    expect(messages.at(-1)?.type).toBe('chrome.released')
  })

  it('当前注册无法形成快照时撤销接管且不执行命令，不遗留未处理的结果拒绝', async () => {
    const { options, messages } = harness()
    await activate()
    options.readState = () => {
      throw new Error('unsupported_header_registration')
    }
    await send('action.invoke', {}, { requestId: 'broken-registration' })
    expect(options.execute).not.toHaveBeenCalled()
    expect(options.setActive).toHaveBeenLastCalledWith(false)
    expect(messages.at(-1)?.type).toBe('chrome.failed')
    expect(messages.at(-1)?.routeRevision).toBe(1)
    await send('chrome.release')
    expect(messages.at(-1)?.type).toBe('chrome.released')
  })
})
