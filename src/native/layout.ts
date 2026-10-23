import { readonly, ref } from 'vue'
import { isRecord, type NativeLayout } from './protocol'

const active = ref(false)
const insets = ref({ top: 0, left: 0, bottom: 0, right: 0 })
/** 只有事务提交后才为 true；普通网页不依赖 UA 或查询参数改变布局。 */
export const nativeChromeActive = readonly(active)
/** 正文、固定浮层与菜单共用的 CSS 边距，已经包含导航和系统安全区。 */
export const nativeContentInsets = readonly(insets)

/** 对一份受控文档管理接管布局与不可见菜单锚点。 */
export class NativeLayoutAdapter {
  private revision = -1
  private scale = 1
  private readonly anchors = new Map<string, HTMLElement>()

  /** 文档和 viewport 显式传入，测试不依赖设备像素密度。 */
  constructor(
    private readonly document: Document,
    private readonly viewport: Window,
  ) {}

  /** 消费原生 point 量测；不叠加 env safe area 或旧网页 Dock 高度。 */
  apply(payload: Record<string, unknown>) {
    if (
      !Number.isSafeInteger(payload.layoutRevision) ||
      !isRecord(payload.viewportPoints) ||
      !this.validInsets(payload.contentInsets) ||
      !this.validInsets(payload.systemSafeArea) ||
      !this.validInsets(payload.chromeOcclusion) ||
      typeof payload.consumedByNativeFrame !== 'boolean' ||
      typeof payload.keyboardOcclusion !== 'number' ||
      !Number.isFinite(payload.keyboardOcclusion) ||
      payload.keyboardOcclusion < 0
    )
      throw new Error('invalid_layout')
    const layout = payload as unknown as NativeLayout
    if (layout.layoutRevision < this.revision) return
    const { width, height } = layout.viewportPoints
    if (
      ![width, height].every(
        value => typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= 10000,
      )
    )
      throw new Error('invalid_layout')
    this.revision = layout.layoutRevision
    this.scale = this.viewport.innerWidth / width
    const values = layout.consumedByNativeFrame ? { top: 0, left: 0, bottom: 0, right: 0 } : layout.contentInsets
    insets.value = Object.fromEntries(
      Object.entries(values).map(([edge, value]) => [edge, value * this.scale]),
    ) as typeof insets.value
    for (const [edge, value] of Object.entries(insets.value))
      this.document.documentElement.style.setProperty(`--native-${edge}`, `${value}px`)
    // WebKit 的 VisualViewport 已负责键盘缩放；这里只记录原生遮挡，不再扣一次高度。
    this.document.documentElement.style.setProperty(
      '--native-keyboard-occlusion',
      `${layout.keyboardOcclusion * this.scale}px`,
    )
  }

  /** 改变 DOM 模式只允许由桥接事务调用，释放时清理所有兼容锚点。 */
  setActive(value: boolean) {
    active.value = value
    if (value) this.document.documentElement.dataset.nativeChrome = 'active'
    else {
      delete this.document.documentElement.dataset.nativeChrome
      insets.value = { top: 0, left: 0, bottom: 0, right: 0 }
      for (const edge of ['top', 'left', 'bottom', 'right', 'keyboard-occlusion'])
        this.document.documentElement.style.removeProperty(`--native-${edge}`)
      for (const anchor of this.anchors.values()) anchor.remove()
      this.anchors.clear()
      this.revision = -1
    }
  }

  /** 保留当前动作需要的可量测 DOM 锚点，注销后立即删除旧 owner 的锚点。 */
  syncAnchors(attributes: string[]) {
    const current = new Set(attributes)
    for (const [key, anchor] of this.anchors) {
      if (!current.has(key)) {
        anchor.remove()
        this.anchors.delete(key)
      }
    }
    for (const attribute of attributes) {
      if (!/^[a-zA-Z0-9_-]{1,128}$/.test(attribute)) throw new Error('invalid_anchor')
      if (this.anchors.has(attribute)) continue
      const anchor = this.document.createElement('span')
      anchor.dataset.menuActivator = attribute
      anchor.dataset.nativeMenuAnchor = ''
      // Vuetify 用 aria-owns 将弹层归属到锚点；隐藏或 inert 会让 WebKit 连带移除整份菜单。
      // 空的展示节点本身不绘制内容、不参与顺序焦点，也不接收触控，但其菜单仍须可访问。
      anchor.setAttribute('role', 'presentation')
      anchor.style.cssText = 'position:fixed;pointer-events:none;width:1px;height:1px;'
      anchor.style.left = `${Math.max(0, this.viewport.innerWidth - 48 - insets.value.right)}px`
      anchor.style.top = `${insets.value.top}px`
      this.document.body.append(anchor)
      this.anchors.set(attribute, anchor)
    }
  }

  /** 将被点击原生控件的位置转换为 CSS 像素，并限制整个锚点在 viewport 范围。
   * 旧量测不用于新旋转布局，防止菜单锚定到屏幕外。
   */
  positionAnchor(attribute: string, frame: unknown, layoutRevision: unknown) {
    const anchor = this.anchors.get(attribute)
    if (!anchor || !isRecord(frame) || layoutRevision !== this.revision) return
    const values = ['x', 'y', 'width', 'height'].map(key => frame[key])
    if (!values.every(value => typeof value === 'number' && Number.isFinite(value))) return
    const [x, y, width, height] = values as number[]
    const anchorWidth = Math.max(1, Math.min(44, width * this.scale))
    const anchorHeight = Math.max(1, Math.min(44, height * this.scale))
    const maxX = Math.max(insets.value.left, this.viewport.innerWidth - insets.value.right - anchorWidth)
    const maxY = Math.max(0, this.viewport.innerHeight - insets.value.bottom - anchorHeight)
    Object.assign(anchor.style, {
      left: `${Math.min(maxX, Math.max(insets.value.left, x * this.scale))}px`,
      top: `${Math.min(maxY, Math.max(0, y * this.scale))}px`,
      width: `${anchorWidth}px`,
      height: `${anchorHeight}px`,
    })
  }

  /** 非负、有限边距才可进入 CSS，拒绝 NaN 与恶意超大占位。
   */
  private validInsets(value: unknown): value is NativeLayout['contentInsets'] {
    return (
      isRecord(value) &&
      ['top', 'left', 'bottom', 'right'].every(
        edge =>
          typeof value[edge] === 'number' && Number.isFinite(value[edge]) && value[edge] >= 0 && value[edge] <= 10000,
      )
    )
  }
}
