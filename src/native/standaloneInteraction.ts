import { nextTick } from 'vue'
import { nativeStandaloneMenus, type NativeStandaloneMenuRegistry } from './standalone'
import { closeNativeMenus, type NativeMenuChannel, type NativeMenuContext } from './menu'
import { isNativeIdentifier, type NativeEnvelope, type NativeOperationItem, type NativeOperationMenu } from './protocol'

/** 当前系统列表的单次票据；等待关闭动画时也必须能被导航或来源变化撤销。 */
interface StandalonePresentation {
  menu: NativeOperationMenu
  selecting: boolean
  shown: boolean
}

/** 普通菜单点击只在可选能力生效且来源完整可见时交给系统，原回调仍由注册表执行。 */
export class NativeStandaloneMenuAdapter implements NativeMenuChannel {
  private context?: NativeMenuContext
  private current?: StandalonePresentation
  private observer?: MutationObserver
  private unregister?: () => void
  private expiry?: ReturnType<typeof setTimeout>
  private frame = 0
  /** 将 Vue、DOM 和布局变化合并到提交后的一帧，不轮询业务状态。 */
  private readonly schedule = () => {
    if (!this.context || this.frame) return
    this.frame = requestAnimationFrame(() => {
      this.frame = 0
      this.synchronize()
    })
  }
  /** 捕获实际激活器点击，键盘和辅助功能产生的 click 使用同一路径。 */
  private readonly click = (event: MouseEvent) => {
    if (event.button !== 0 || event.defaultPrevented || !(event.target instanceof Element)) return
    const target = this.registry.targetForElement(event.target)
    if (!target) return
    const menu = this.current ? undefined : this.registry.menus.open(target.ownerId, target.menuId)
    if (!this.current && !menu) return
    event.preventDefault()
    event.stopImmediatePropagation()
    // 重复点击不叠加弹窗，也不让原 HTML 菜单从系统列表背后打开。
    if (this.current || !menu) return
    const current = { menu, selecting: false, shown: false }
    this.current = current
    void this.present(current)
  }
  /** 网页不可见时先撤销菜单，等待宿主前台状态重新开通。 */
  private readonly visibility = () => {
    if (document.hidden) this.cancel()
  }

  /** 发送方仅提供封闭菜单通道；未协商的网页不会创建本适配器或监听器。 */
  constructor(
    private readonly post: (type: string, payload: Record<string, unknown>) => boolean,
    private readonly registry: NativeStandaloneMenuRegistry = nativeStandaloneMenus,
  ) {}

  /** 路由、身份、前后台变化同步撤销旧票据，新的范围只登记实际连接的按钮。 */
  setContext(context: NativeMenuContext | undefined) {
    if (this.context?.sessionId === context?.sessionId && this.context?.routeRevision === context?.routeRevision) return
    this.cancel()
    this.removeListeners()
    this.context = context && { ...context }
    this.registry.setContext(context)
    if (!context) return
    this.unregister = this.registry.onChange(this.schedule)
    document.addEventListener('click', this.click, true)
    document.addEventListener('visibilitychange', this.visibility)
    document.addEventListener('scroll', this.schedule, true)
    window.addEventListener('resize', this.schedule)
    this.observer = new MutationObserver(this.schedule)
    this.observer.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'disabled', 'aria-disabled', 'hidden', 'inert'],
    })
    this.schedule()
  }

  /** 只接受当前展示的系统意图；动画交接后再次核对原声明，重复和迟到选择无效。 */
  async receive(message: NativeEnvelope) {
    const current = this.current
    const id = message.payload.presentationId
    if (!this.context || !current || id !== current.menu.presentationId || !isNativeIdentifier(id)) return
    if (message.type === 'standaloneMenu.opened') {
      current.shown = true
      clearTimeout(this.expiry)
      return
    }
    if (message.type === 'standaloneMenu.dismissed') {
      this.cancel(false)
      return
    }
    const itemId = message.payload.itemId
    if (message.type !== 'standaloneMenu.select' || !isNativeIdentifier(itemId) || current.selecting) return
    current.selecting = true
    clearTimeout(this.expiry)
    const item = this.findAction(current.menu.items, itemId)
    let accepted = false
    try {
      accepted = await this.registry.menus.select(id, itemId, () => this.settleMenus())
    } catch {
      // 原业务继续使用自己的失败提示，不因一次操作异常断开整个导航桥。
    }
    if (this.current !== current) return
    if (accepted && item?.keepOpen) {
      const menu = this.registry.menus.open(current.menu.ownerId, current.menu.menuId)
      if (menu) {
        this.current = { menu, selecting: false, shown: true }
        if (this.post('standaloneMenu.refresh', { menu })) return
      }
    }
    this.cancel()
  }

  /** 原生展示前等 HTML 菜单真实关闭，来源在等待期间失效则不再发送。 */
  private async present(current: StandalonePresentation) {
    await this.settleMenus()
    if (this.current !== current) return
    if (!this.registry.menus.isCurrent(current.menu.presentationId)) {
      this.cancel(false)
      return
    }
    if (!this.post('standaloneMenu.open', { menu: current.menu })) {
      this.cancel(false)
      return
    }
    this.expiry = setTimeout(() => {
      if (this.current === current && !current.shown) this.cancel()
    }, 3000)
  }

  /** 显式来源更新、隐藏或卸载会结束旧列表，不让当前选择套到新项目。 */
  private synchronize() {
    if (!this.context) return
    this.registry.synchronize()
    if (this.current && !this.current.selecting && !this.registry.menus.isCurrent(this.current.menu.presentationId))
      this.cancel()
  }

  /** 等待 Vue 模型更新及双绘制帧，业务弹窗不会叠在 HTML 菜单退出动画上。 */
  private async settleMenus() {
    closeNativeMenus()
    await nextTick()
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
  }

  /** 分组和子菜单自身不执行，保持展开语义只从原动作读取。 */
  private findAction(items: NativeOperationItem[], id: string): NativeOperationItem | undefined {
    for (const item of items) {
      if (item.id === id && item.kind === 'action') return item
      const nested = item.items && this.findAction(item.items, id)
      if (nested) return nested
    }
  }

  /** 仅撤销当前票据，迟到的关闭不能影响下一次点击。 */
  private cancel(notify = true) {
    clearTimeout(this.expiry)
    const current = this.current
    this.current = undefined
    if (!current) return
    this.registry.menus.dismiss(current.menu.presentationId)
    if (notify) this.post('standaloneMenu.invalidate', { presentationId: current.menu.presentationId })
  }

  /** 停止接管后释放监听器、观察器和帧任务，原菜单点击自然恢复。 */
  private removeListeners() {
    this.unregister?.()
    this.unregister = undefined
    this.observer?.disconnect()
    this.observer = undefined
    cancelAnimationFrame(this.frame)
    this.frame = 0
    document.removeEventListener('click', this.click, true)
    document.removeEventListener('visibilitychange', this.visibility)
    document.removeEventListener('scroll', this.schedule, true)
    window.removeEventListener('resize', this.schedule)
  }
}
