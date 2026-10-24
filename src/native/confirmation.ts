import type { NativeConfirmation } from './protocol'
import { closeNativeMenus } from './menu'

/** 确认框只投影纯文字与当前按钮标识；Vue 组件继续拥有 Promise 和业务回调。 */
export class NativeConfirmationAdapter {
  private sequence = 0
  private ids = new WeakMap<Element, string>()
  private answered = new WeakSet<Element>()
  private active = false
  private root?: HTMLElement

  /** 每个适配器只读取当前主文档，不能查找其他 frame 或实例。 */
  constructor(private document: Document) {}

  /** 可选能力协商成功后才隐藏网页确认框；释放时原 DOM 自动恢复可操作。 */
  setActive(active: boolean) {
    this.active = active
    if (active) this.document.documentElement.setAttribute('data-native-confirmations', 'active')
    else {
      this.document.documentElement.removeAttribute('data-native-confirmations')
      this.root = undefined
    }
  }

  /** 只读取最上层声明过的确认框，保留换行并限制桥接文字总量。 */
  read(): NativeConfirmation | undefined {
    const root = this.current()
    if (root && root !== this.root) closeNativeMenus()
    this.root = root
    if (!root) return
    const confirm = root.querySelector<HTMLButtonElement>('[data-native-confirm-accept]')
    const cancel = root.querySelector<HTMLButtonElement>('[data-native-confirm-cancel]')
    if (!confirm || !cancel) return
    let id = this.ids.get(root)
    if (!id) this.ids.set(root, (id = `confirmation-${++this.sequence}`))
    return {
      id,
      title: this.text(root.querySelector('[data-native-confirm-title]')?.textContent, 512) || 'MoviePilot',
      message: this.text(root.querySelector('[data-native-confirm-message]')?.textContent, 8192, true),
      confirmText: this.text(confirm.textContent, 512) || '确认',
      cancelText: this.text(cancel.textContent, 512) || '取消',
      confirmEnabled: !confirm.disabled,
      cancelEnabled: !cancel.disabled,
      destructive: root.getAttribute('data-native-confirm-kind') === 'error',
    }
  }

  /** 最上层、身份与按钮可用性再次核验；重复或迟到命令不能执行已完成的业务。 */
  respond(payload: Record<string, unknown>): boolean {
    const root = this.current()
    if (!root || this.ids.get(root) !== payload.id || typeof payload.confirmed !== 'boolean') return false
    const button = root.querySelector<HTMLButtonElement>(
      payload.confirmed ? '[data-native-confirm-accept]' : '[data-native-confirm-cancel]',
    )
    if (!button?.isConnected || button.disabled) return false
    this.answered.add(root)
    button.click()
    return true
  }

  /** 其他弹窗覆盖时不允许穿透确认；关闭子层后才能恢复父层确认。 */
  private current(): HTMLElement | undefined {
    if (!this.active) return
    const roots = [...this.document.querySelectorAll<HTMLElement>('.v-overlay--active.v-dialog')]
    const root = roots.sort((a, b) => this.zIndex(a) - this.zIndex(b)).at(-1)
    return root?.hasAttribute('data-native-confirm-dialog') && !this.answered.has(root) ? root : undefined
  }

  /** 与 Vuetify 实际层级一致，同层级采用文档顺序。 */
  private zIndex(root: HTMLElement): number {
    return Number.parseInt(this.document.defaultView?.getComputedStyle(root).zIndex || '0') || 0
  }

  /** 文案仅作为系统 label/message，不接受 HTML、脚本或控制字符。 */
  private text(value: string | null | undefined, maximum: number, multiline = false): string {
    let result = ''
    let bytes = 0
    const encoder = new TextEncoder()
    for (const character of (value || '')
      .replace(/[\p{Cc}\p{Cf}]/gu, character => (multiline && /[\n\r\t]/u.test(character) ? character : ' '))
      .trim()) {
      bytes += encoder.encode(character).length
      if (bytes > maximum) break
      result += character
    }
    return result
  }
}
