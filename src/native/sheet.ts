import type { NativeSheet } from './protocol'
import { closeNativeMenus } from './menu'

/** 投影真实 Vue 弹窗及标题栏，持有 DOM 引用而不复制内容、事件或认证状态。 */
export class NativeSheetAdapter {
  private sequence = 0
  private ids = new WeakMap<Element, string>()
  private buttonIds = new WeakMap<Element, string>()
  private root?: HTMLElement
  private close?: HTMLButtonElement
  private buttons = new Map<string, HTMLButtonElement>()
  private backgrounds = new Set<Element>()
  private attached?: string
  private prepared?: string
  private transition = 0

  /** 作用域限定当前文档；关闭文档或降级时必须调用 reset 恢复原页面。 */
  constructor(private document: Document) {}

  /** 只有协商成功的 Sheet 宿主隐藏待接管弹窗，普通网页和降级页面保持原显示。 */
  setActive(active: boolean) {
    if (active) this.document.documentElement.setAttribute('data-native-sheets', 'active')
    else {
      this.document.documentElement.removeAttribute('data-native-sheets')
      this.reset()
    }
  }

  /** 布局交接确认等待真正的绘制机会；原生不能在旧标题或空白底页仍可见时启动转场。 */
  async executeWhenPainted(type: string, payload: Record<string, unknown>): Promise<boolean> {
    if (!this.execute(type, payload)) return false
    if (!['presentation.prepare', 'presentation.attach', 'presentation.detach'].includes(type)) return true
    const transition = ++this.transition
    const root = this.root
    const view = this.document.defaultView
    if (!view) return false
    await new Promise<void>(resolve => view.requestAnimationFrame(() => view.requestAnimationFrame(() => resolve())))
    if (transition !== this.transition) return false
    if (type === 'presentation.detach') return !this.attached
    return Boolean(
      root?.isConnected &&
      root === this.root &&
      this.ids.get(root) === payload.id &&
      (type === 'presentation.prepare' ? this.prepared === payload.id : this.attached === payload.id),
    )
  }

  /** 每次重新读取活动最上层，嵌套弹窗撤销旧按钮的执行权限。 */
  read(fallbackTitle: string): NativeSheet | undefined {
    const roots = Array.from(
      this.document.querySelectorAll<HTMLElement>(
        '.v-overlay--active.v-dialog, .theme-customizer-panel-host[role="dialog"], .agent-assistant-panel.is-open[role="dialog"]',
      ),
    )
    const root = roots
      .filter(
        root =>
          !this.document.documentElement.hasAttribute('data-native-confirmations') ||
          !root.hasAttribute('data-native-confirm-dialog'),
      )
      .sort((a, b) => this.zIndex(a) - this.zIndex(b))
      .at(-1)
    if (root && root !== this.root) closeNativeMenus()
    this.root = root
    this.buttons.clear()
    this.close = undefined
    if (!root) {
      if (!this.attached) this.clearMarkers()
      return
    }
    let id = this.ids.get(root)
    if (!id) this.ids.set(root, (id = `sheet-${++this.sequence}`))
    if (this.prepared && this.prepared !== id) this.clearPreparation()
    this.close = root.querySelector<HTMLButtonElement>('[data-native-dialog-close]') ?? undefined
    const header = Array.from(
      root.querySelectorAll<HTMLElement>(
        '[data-native-dialog-header], .v-card-item, .v-toolbar, .theme-customizer-header, .agent-assistant-header, :scope > .v-overlay__content > .v-card > .v-card-title',
      ),
    ).find(element => !element.closest('[data-native-dialog-content]'))
    const heading =
      root.querySelector('[data-native-dialog-title]') ??
      (header?.matches('.v-card-title') ? header : undefined) ??
      header?.querySelector('.v-card-title, .v-toolbar-title, .theme-customizer-title, .agent-assistant-title') ??
      root.querySelector(':scope > .v-overlay__content > .v-card > .v-card-title')
    heading?.setAttribute('data-native-sheet-heading', '')
    const title = this.label(root.getAttribute('aria-label') || heading?.textContent || fallbackTitle)
    const actions: NativeSheet['actions'] = []
    if (header) {
      const explicitActions = header.hasAttribute('data-native-sheet-actions')
      header.setAttribute('data-native-sheet-header', '')
      for (const button of header.querySelectorAll<HTMLButtonElement>(
        explicitActions ? 'button[data-native-sheet-action]' : 'button',
      )) {
        if (button === this.close || button.closest('[aria-hidden="true"]')) continue
        const title = this.label(
          button.getAttribute('aria-label') || button.getAttribute('title') || button.textContent,
        )
        if (!title || actions.length >= 8) continue
        let actionId = this.buttonIds.get(button)
        if (!actionId) this.buttonIds.set(button, (actionId = `sheet-button-${++this.sequence}`))
        const icon = this.label(button.dataset.nativeSheetAction)
        actions.push({ id: actionId, title, enabled: !button.disabled, ...(icon ? { icon } : {}) })
        this.buttons.set(actionId, button)
      }
      // 无法表达的标题栏控件继续留在内容中，避免删除插件自己的业务入口。
      if (
        header.querySelector('input, select, textarea, [role="tablist"]') ||
        Array.from(header.querySelectorAll('[aria-haspopup="menu"], [aria-owns]')).some(
          control => !explicitActions || !control.matches('button[data-native-sheet-action]'),
        ) ||
        (explicitActions &&
          Array.from(header.querySelectorAll('button')).some(
            button => button !== this.close && !button.hasAttribute('data-native-sheet-action'),
          ))
      ) {
        header.removeAttribute('data-native-sheet-header')
        actions.length = 0
        this.buttons.clear()
      }
    }
    if (this.attached) this.mark(root)
    const progress =
      root.hasAttribute('data-native-progress') &&
      this.document.defaultView?.MoviePilotNative?.progressSheetsVersion === 1
        ? this.progress(root, title)
        : undefined
    root.toggleAttribute('data-native-sheet-progress', Boolean(progress))
    return {
      id,
      title: title || 'MoviePilot',
      fullscreen:
        root.classList.contains('v-dialog--fullscreen') ||
        root.matches('.theme-customizer-panel-host:not([data-native-sheet-size="medium"]), .agent-assistant-panel'),
      canDismiss: Boolean(this.close && !this.close.disabled),
      ...(root.dataset.nativeSheetSize === 'medium' ? { prefersMediumDetent: true } : {}),
      backdropReady: this.prepared === id,
      ...(progress ? { progress } : {}),
      actions,
    }
  }

  /** 只执行当前弹窗的可见按钮；旧层、关闭后的 ID 与任意选择器均不可执行。 */
  execute(type: string, payload: Record<string, unknown>) {
    if (type === 'presentation.detach') {
      if (payload.id !== this.attached) return false
      this.reset()
      return true
    }
    const root = this.root
    if (!root?.isConnected || this.ids.get(root) !== payload.id) return false
    if (type === 'presentation.prepare') {
      if (this.attached) return false
      this.prepared = payload.id as string
      this.document.documentElement.setAttribute('data-native-sheet-preparing', '')
      return true
    }
    if (type === 'presentation.attach') {
      this.attached = payload.id as string
      this.mark(root)
      return true
    }
    const button = type === 'presentation.dismiss' ? this.close : this.buttons.get(String(payload.actionId))
    if (!['presentation.dismiss', 'presentation.action'].includes(type) || !button?.isConnected || button.disabled)
      return false
    button.click()
    return true
  }

  /** 宿主退出或协商失效时立即恢复原来的网页弹窗标题、背景和布局。 */
  reset() {
    this.transition++
    this.attached = undefined
    this.clearMarkers()
    for (const header of this.document.querySelectorAll('[data-native-sheet-header]'))
      header.removeAttribute('data-native-sheet-header')
    for (const heading of this.document.querySelectorAll('[data-native-sheet-heading]'))
      heading.removeAttribute('data-native-sheet-heading')
    for (const progress of this.document.querySelectorAll('[data-native-sheet-progress]'))
      progress.removeAttribute('data-native-sheet-progress')
  }

  /** 标记只影响当前活动弹窗，菜单仍在同一文档中保留原有交互。 */
  private mark(root: HTMLElement) {
    this.clearPreparation()
    for (const old of this.document.querySelectorAll('[data-native-sheet-current]'))
      if (old !== root) old.removeAttribute('data-native-sheet-current')
    root.setAttribute('data-native-sheet-current', '')
    this.document.documentElement.setAttribute('data-native-sheet', '')
    this.isolate(root)
  }

  /** 隔离整条背景绘制分支，避免 WebKit 合成层穿透；保留 DOM、滚动和当前内容所属菜单。 */
  private isolate(root: HTMLElement) {
    const visible = new Set<Element>([root])
    const menus = Array.from(this.document.querySelectorAll<HTMLElement>('.v-menu.v-overlay--active[id]'))
    for (const owner of visible) {
      const owned = new Set(
        Array.from(owner.querySelectorAll('[aria-owns], [aria-controls]')).flatMap(element =>
          `${element.getAttribute('aria-owns') || ''} ${element.getAttribute('aria-controls') || ''}`.split(/\s+/),
        ),
      )
      for (const menu of menus) if (owned.has(menu.id)) visible.add(menu)
    }
    const ancestors = new Set<Element>()
    for (const content of visible)
      for (let parent = content.parentElement; parent && parent !== this.document.body; parent = parent.parentElement)
        ancestors.add(parent)
    const backgrounds = new Set<Element>()
    /** 只访问当前弹层路径，整个无关分支一次屏蔽，不逐项改动业务节点。 */
    const visit = (parent: Element) => {
      for (const child of parent.children) {
        if (visible.has(child) || child.matches('script, style, link')) continue
        if (ancestors.has(child)) visit(child)
        else backgrounds.add(child)
      }
    }
    visit(this.document.body)
    for (const previous of this.backgrounds)
      if (!backgrounds.has(previous)) previous.removeAttribute('data-native-sheet-background')
    for (const background of backgrounds)
      if (!this.backgrounds.has(background)) background.setAttribute('data-native-sheet-background', '')
    this.backgrounds = backgrounds
  }

  /** 清除容器标记不关闭 Vue 弹窗，也不触发业务回调。 */
  private clearMarkers() {
    this.clearPreparation()
    this.document.documentElement.removeAttribute('data-native-sheet')
    for (const root of this.document.querySelectorAll('[data-native-sheet-current]'))
      root.removeAttribute('data-native-sheet-current')
    for (const background of this.backgrounds) background.removeAttribute('data-native-sheet-background')
    this.backgrounds.clear()
  }

  /** 原生已保留底页或准备取消时恢复弹窗展示，不改变任何业务输入与回调。 */
  private clearPreparation() {
    this.prepared = undefined
    this.document.documentElement.removeAttribute('data-native-sheet-preparing')
  }

  /** 进度只读取当前真实控件的展示值；非法或未知百分比保留系统不确定加载状态。 */
  private progress(root: HTMLElement, title: string) {
    const raw = root.querySelector('[data-native-progress-value]')?.getAttribute('aria-valuenow')
    const value = raw !== null && raw !== undefined ? Number(raw) : undefined
    return {
      message: this.label(root.querySelector('[data-native-progress-text]')?.textContent) || title,
      ...(value !== undefined && Number.isFinite(value) && value >= 0 && value <= 100 ? { value } : {}),
    }
  }

  /** Vuetify 层级优先，未声明层级时保持文档中的后开弹窗在上。 */
  private zIndex(element: HTMLElement) {
    return Number.parseInt(this.document.defaultView?.getComputedStyle(element).zIndex || '0') || 0
  }

  /** 标题有界且没有控制字符，不能扩大桥接消息或成为原生命令。 */
  private label(value: string | null | undefined) {
    return (value || '')
      .replace(/[\p{Cc}\p{Cf}]/gu, ' ')
      .trim()
      .slice(0, 100)
  }
}
