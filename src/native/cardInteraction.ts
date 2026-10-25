import { nextTick } from 'vue'
import { nativeCardMenus, type NativeCardMenuRegistry, type NativeCardMenuTarget } from './card'
import { closeNativeMenus, type NativeMenuContext } from './menu'
import { isNativeIdentifier, type NativeEnvelope, type NativeOperationMenu } from './protocol'

/** 会话只给当前前台文档开通菜单通道，回调和业务对象仍留在网页内存。 */
export interface NativeCardMenuChannel {
  /** 上下文失效时同步撤销来源、样式、手势和待选菜单。 */
  setContext(context: NativeMenuContext | undefined): void
  /** 只接收系统菜单已展示、选择和取消三个窄意图。 */
  receive(message: NativeEnvelope): Promise<void>
}

/** 原生同步手势准备使用短寿命票据；已展示菜单另由系统明确结束。 */
interface CardPresentation {
  menu: NativeOperationMenu
  rect: NativeCardMenuTarget['rect']
  point: { x: number; y: number }
  started: number
  shown: boolean
  selecting: boolean
}

const controls = 'input, textarea, select, button, a, [role="button"], [contenteditable]:not([contenteditable="false"])'

/** 只有能力协商完成才监听手势；短按、滚动、输入和普通网页不被原生菜单劫持。 */
export class NativeCardMenuAdapter implements NativeCardMenuChannel {
  private context?: NativeMenuContext
  private readonly ready = new Map<HTMLElement, HTMLButtonElement>()
  private observer?: MutationObserver
  private frame = 0
  private expiry?: ReturnType<typeof setTimeout>
  private current?: CardPresentation
  private pointer?: number
  private blockedClick?: { element: HTMLElement; until: number }
  /** 多次 DOM 更新合并到提交后的同一帧，不在每次媒体进度更新时逐项改样式。 */
  private readonly schedule = () => {
    if (!this.context || this.frame) return
    this.frame = requestAnimationFrame(() => {
      this.frame = 0
      this.synchronize()
    })
  }
  /** 位置改变先撤销旧预览，再量测滚动后仍可操作的来源。 */
  private readonly invalidatePosition = () => {
    this.cancel()
    this.schedule()
  }
  /** 同步手势准备只接受主指针命中的卡片正文，独立控件保持原操作。 */
  private readonly pointerDown = (event: PointerEvent) => {
    if (!event.isPrimary || event.button !== 0 || !(event.target instanceof Element)) return
    const target = this.registry.targetFor(event.target)
    const root = target && this.registry.elementFor(target.ownerId)
    if (!target || !root || !this.ready.has(root)) return
    const control = event.target.closest(controls)
    if (control && control !== root && root.contains(control)) return
    if (!this.hit(root, event.clientX, event.clientY)) return
    void this.prepare(target, { x: event.clientX, y: event.clientY }, false)
    this.pointer = event.pointerId
  }
  /** 移动越过触摸容差即让给滚动，不等待长按阈值。 */
  private readonly pointerMove = (event: PointerEvent) => {
    if (event.pointerId !== this.pointer || !this.current || this.current.shown) return
    if (Math.hypot(event.clientX - this.current.point.x, event.clientY - this.current.point.y) > 10) this.cancel()
  }
  /** 短按撤销准备票据，原 click 继续；系统识别后的结束由明确回包结算。 */
  private readonly pointerUp = (event: PointerEvent) => {
    if (event.pointerId !== this.pointer || !this.current) return
    if (!this.current.shown && performance.now() - this.current.started < 400) this.cancel()
    this.pointer = undefined
  }
  /** 辅助入口只触发菜单，长按结束产生的合成 click 不误开卡片。 */
  private readonly click = (event: MouseEvent) => {
    const node = event.target instanceof Element ? event.target : undefined
    const accessible = node?.closest('[data-native-card-menu-accessible]')
    if (accessible) {
      const root = accessible.parentElement
      const target = root && this.registry.targetFor(root)
      if (target && root && this.ready.get(root) === accessible) {
        event.preventDefault()
        event.stopImmediatePropagation()
        const { x, y, width, height } = target.rect
        void this.prepare(target, { x: x + width / 2, y: y + height / 2 }, true)
      }
      return
    }
    if (
      node &&
      this.blockedClick &&
      performance.now() < this.blockedClick.until &&
      this.blockedClick.element.contains(node)
    ) {
      event.preventDefault()
      event.stopImmediatePropagation()
    }
  }
  /** 已接管的卡片正文不再弹 WebKit 的文字或图片菜单，输入控件不受影响。 */
  private readonly contextMenu = (event: MouseEvent) => {
    if (!(event.target instanceof Element)) return
    const target = this.registry.targetFor(event.target)
    const root = target && this.registry.elementFor(target.ownerId)
    const control = event.target.closest(controls)
    if (root && this.ready.has(root) && (!control || control === root || !root.contains(control)))
      event.preventDefault()
  }
  /** 浏览器可见性与原生生命周期任一先到，都不能保留旧候选。 */
  private readonly visibility = () => {
    if (document.hidden) this.cancel()
  }

  /** 发送函数只发布声明，宿主会再次核对会话、路由、能力和原生导航状态。 */
  constructor(
    private readonly post: (type: string, payload: Record<string, unknown>) => boolean,
    private readonly registry: NativeCardMenuRegistry = nativeCardMenus,
  ) {}

  /** 只在真实 DOM 提交后登记新范围；释放同步恢复原菜单及卡片选字能力。 */
  setContext(context: NativeMenuContext | undefined) {
    if (this.context?.sessionId === context?.sessionId && this.context?.routeRevision === context?.routeRevision) return
    this.cancel()
    this.removeListeners()
    this.context = context && { ...context }
    this.registry.setContext(context)
    for (const [element, button] of this.ready) {
      element.removeAttribute('data-native-card-menu-ready')
      button.remove()
    }
    this.ready.clear()
    if (!context) return
    document.addEventListener('pointerdown', this.pointerDown, true)
    document.addEventListener('pointermove', this.pointerMove, true)
    document.addEventListener('pointerup', this.pointerUp, true)
    document.addEventListener('click', this.click, true)
    document.addEventListener('contextmenu', this.contextMenu, true)
    document.addEventListener('scroll', this.invalidatePosition, true)
    document.addEventListener('visibilitychange', this.visibility)
    window.addEventListener('resize', this.invalidatePosition)
    this.observer = new MutationObserver(this.schedule)
    this.observer.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'disabled', 'hidden', 'inert'],
    })
    this.schedule()
  }

  /** 系统动画结束后才执行原回调；迟到、重复或声明变化的选择都不能生效。 */
  async receive(message: NativeEnvelope) {
    const current = this.current
    const id = message.payload.presentationId
    if (!this.context || !current || id !== current.menu.presentationId || !isNativeIdentifier(id)) return
    if (message.type === 'cardMenu.opened') {
      current.shown = true
      clearTimeout(this.expiry)
      const element = this.registry.elementFor(current.menu.ownerId)
      if (element) this.blockedClick = { element, until: performance.now() + 1500 }
      return
    }
    if (message.type === 'cardMenu.dismissed') {
      this.cancel(false)
      return
    }
    const itemId = message.payload.itemId
    if (message.type !== 'cardMenu.select' || !isNativeIdentifier(itemId) || current.selecting) return
    current.selecting = true
    clearTimeout(this.expiry)
    const item = this.findAction(current.menu.items, itemId)
    let accepted = false
    try {
      accepted = await this.registry.menus.select(id, itemId, () => this.settleMenus())
    } catch {
      // 原动作自己的失败不使导航桥断开；单次票据仍由注册表消费，不自动重试业务。
    }
    if (this.current !== current) return
    if (accepted && item?.keepOpen) {
      const menu = this.registry.menus.open(current.menu.ownerId, current.menu.menuId)
      if (menu) {
        this.current = { ...current, menu, selecting: false }
        if (this.post('cardMenu.refresh', { menu })) return
      }
    }
    this.cancel()
  }

  /** 量测和完整性同时通过的卡片才隐藏原入口；更新不更改 Vue 业务节点。 */
  private synchronize() {
    if (!this.context) return
    this.registry.synchronize()
    const present = new Set<HTMLElement>()
    for (const target of this.registry.targets()) {
      const element = this.registry.elementFor(target.ownerId)
      if (!element) continue
      present.add(element)
      let button = this.ready.get(element)
      if (!button) {
        button = document.createElement('button')
        button.type = 'button'
        button.setAttribute('data-native-card-menu-accessible', '')
        button.textContent = '操作菜单'
        element.append(button)
        this.ready.set(element, button)
        element.setAttribute('data-native-card-menu-ready', '')
      }
      // 已有标题可能来自动态媒体名；只在变化时更新，避免观察器自触发。
      const title = this.registry.titleFor(target.ownerId) || element.getAttribute('aria-label')
      const label = title ? `${title}，操作菜单` : '卡片操作菜单'
      if (button.getAttribute('aria-label') !== label) button.setAttribute('aria-label', label)
    }
    for (const [element, button] of this.ready) {
      if (present.has(element)) continue
      element.removeAttribute('data-native-card-menu-ready')
      button.remove()
      this.ready.delete(element)
    }
    if (this.current && !this.current.selecting) {
      const element = this.registry.elementFor(this.current.menu.ownerId)
      const rect = element?.getBoundingClientRect()
      if (
        !rect ||
        !this.registry.menus.isCurrent(this.current.menu.presentationId) ||
        ['x', 'y', 'width', 'height'].some(
          key =>
            Math.abs(
              (rect[key as keyof DOMRect] as number) - this.current!.rect[key as keyof NativeCardMenuTarget['rect']],
            ) > 1,
        )
      )
        this.cancel()
    }
  }

  /** 原生配置回调是同步的，因此在触摸开始预先发送完整声明和当时的位置。 */
  private async prepare(target: NativeCardMenuTarget, point: { x: number; y: number }, accessible: boolean) {
    this.cancel()
    const menu = this.registry.menus.open(target.ownerId, target.menuId)
    if (!menu) return
    const current = { menu, rect: target.rect, point, started: performance.now(), shown: accessible, selecting: false }
    this.current = current
    await this.settleMenus()
    if (this.current !== current || !this.registry.menus.isCurrent(menu.presentationId)) return
    if (
      !this.post(accessible ? 'cardMenu.accessible' : 'cardMenu.prepare', {
        menu,
        rect: target.rect,
        point,
        viewport: { width: innerWidth, height: innerHeight },
      })
    ) {
      this.cancel(false)
      return
    }
    if (!accessible)
      this.expiry = setTimeout(() => {
        if (this.current === current && !current.shown) this.cancel()
      }, 2000)
  }

  /** 不接受盖在卡片上方的其它弹层，原生系统栏以自身命中测试阻止触摸透传。 */
  private hit(root: HTMLElement, x: number, y: number) {
    const node = document.elementFromPoint(x, y)
    return !!node && root.contains(node)
  }

  /** 撤销本次票据，不让迟到的系统关闭影响下一张卡片。 */
  private cancel(notify = true) {
    clearTimeout(this.expiry)
    this.pointer = undefined
    const current = this.current
    this.current = undefined
    if (!current) return
    const element = this.registry.elementFor(current.menu.ownerId)
    if (current.shown && element) this.blockedClick = { element, until: performance.now() + 500 }
    this.registry.menus.dismiss(current.menu.presentationId)
    if (notify) this.post('cardMenu.invalidate', { presentationId: current.menu.presentationId })
  }

  /** 等真实 HTML 菜单结束 Vue 更新与绘制后再交给原生，避免残留浮层。 */
  private async settleMenus() {
    closeNativeMenus()
    await nextTick()
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
  }

  /** 只查找声明中的原动作，分组和子菜单本身不能执行业务。 */
  private findAction(
    items: NativeOperationMenu['items'],
    id: string,
  ): NativeOperationMenu['items'][number] | undefined {
    for (const item of items) {
      if (item.id === id && item.kind === 'action') return item
      const child = item.items && this.findAction(item.items, id)
      if (child) return child
    }
  }

  /** 同步卸载所有观察器和事件，不把旧组件或闭包带入下一文档范围。 */
  private removeListeners() {
    cancelAnimationFrame(this.frame)
    this.frame = 0
    this.observer?.disconnect()
    this.observer = undefined
    document.removeEventListener('pointerdown', this.pointerDown, true)
    document.removeEventListener('pointermove', this.pointerMove, true)
    document.removeEventListener('pointerup', this.pointerUp, true)
    document.removeEventListener('click', this.click, true)
    document.removeEventListener('contextmenu', this.contextMenu, true)
    document.removeEventListener('scroll', this.invalidatePosition, true)
    document.removeEventListener('visibilitychange', this.visibility)
    window.removeEventListener('resize', this.invalidatePosition)
  }
}
