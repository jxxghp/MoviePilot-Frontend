import type { NativeSheet } from './protocol'

/** 投影真实 Vue 弹窗及标题栏，持有 DOM 引用而不复制内容、事件或认证状态。 */
export class NativeSheetAdapter {
  private sequence = 0
  private ids = new WeakMap<Element, string>()
  private buttonIds = new WeakMap<Element, string>()
  private root?: HTMLElement
  private close?: HTMLButtonElement
  private buttons = new Map<string, HTMLButtonElement>()
  private attached?: string
  private prepared?: string

  /** 作用域限定当前文档；关闭文档或降级时必须调用 reset 恢复原页面。 */
  constructor(private document: Document) {}

  /** 每次重新读取活动最上层，嵌套弹窗撤销旧按钮的执行权限。 */
  read(fallbackTitle: string): NativeSheet | undefined {
    const roots = Array.from(
      this.document.querySelectorAll<HTMLElement>(
        '.v-overlay--active.v-dialog, .theme-customizer-panel-host[role="dialog"], .agent-assistant-panel.is-open[role="dialog"]',
      ),
    )
    const root = roots.sort((a, b) => this.zIndex(a) - this.zIndex(b)).at(-1)
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
    const header = root.querySelector<HTMLElement>(
      '[data-native-dialog-header], .v-card-item, .v-toolbar, .theme-customizer-header, .agent-assistant-header, :scope > .v-overlay__content > .v-card > .v-card-title',
    )
    const heading =
      root.querySelector('[data-native-dialog-title]') ??
      (header?.matches('.v-card-title') ? header : undefined) ??
      header?.querySelector('.v-card-title, .v-toolbar-title, .theme-customizer-title, .agent-assistant-title') ??
      root.querySelector(':scope > .v-overlay__content > .v-card > .v-card-title')
    heading?.setAttribute('data-native-sheet-heading', '')
    const title = this.label(root.getAttribute('aria-label') || heading?.textContent || fallbackTitle)
    const actions: NativeSheet['actions'] = []
    if (header) {
      header.setAttribute('data-native-sheet-header', '')
      for (const button of header.querySelectorAll<HTMLButtonElement>('button')) {
        if (button === this.close || button.closest('[aria-hidden="true"]')) continue
        const title = this.label(
          button.getAttribute('aria-label') || button.getAttribute('title') || button.textContent,
        )
        if (!title || actions.length >= 8) continue
        let actionId = this.buttonIds.get(button)
        if (!actionId) this.buttonIds.set(button, (actionId = `sheet-button-${++this.sequence}`))
        actions.push({ id: actionId, title, enabled: !button.disabled })
        this.buttons.set(actionId, button)
      }
      // 无法表达的标题栏控件继续留在内容中，避免删除插件自己的业务入口。
      if (header.querySelector('input, select, textarea, [role="tablist"], [aria-haspopup="menu"], [aria-owns]')) {
        header.removeAttribute('data-native-sheet-header')
        actions.length = 0
        this.buttons.clear()
      }
    }
    if (this.attached) this.mark(root)
    return {
      id,
      title: title || 'MoviePilot',
      fullscreen:
        root.classList.contains('v-dialog--fullscreen') ||
        root.matches('.theme-customizer-panel-host, .agent-assistant-panel'),
      canDismiss: Boolean(this.close && !this.close.disabled),
      backdropReady: this.prepared === id,
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
    this.attached = undefined
    this.clearMarkers()
    for (const header of this.document.querySelectorAll('[data-native-sheet-header]'))
      header.removeAttribute('data-native-sheet-header')
    for (const heading of this.document.querySelectorAll('[data-native-sheet-heading]'))
      heading.removeAttribute('data-native-sheet-heading')
  }

  /** 标记只影响当前活动弹窗，菜单仍在同一文档中保留原有交互。 */
  private mark(root: HTMLElement) {
    this.clearPreparation()
    for (const old of this.document.querySelectorAll('[data-native-sheet-current]'))
      if (old !== root) old.removeAttribute('data-native-sheet-current')
    root.setAttribute('data-native-sheet-current', '')
    this.document.documentElement.setAttribute('data-native-sheet', '')
  }

  /** 清除容器标记不关闭 Vue 弹窗，也不触发业务回调。 */
  private clearMarkers() {
    this.clearPreparation()
    this.document.documentElement.removeAttribute('data-native-sheet')
    for (const root of this.document.querySelectorAll('[data-native-sheet-current]'))
      root.removeAttribute('data-native-sheet-current')
  }

  /** 原生已保留底页或准备取消时恢复弹窗展示，不改变任何业务输入与回调。 */
  private clearPreparation() {
    this.prepared = undefined
    this.document.documentElement.removeAttribute('data-native-sheet-preparing')
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
