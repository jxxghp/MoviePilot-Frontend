/** 原生导航只接收声明；业务回调不参与 JSON 序列化。 */
export interface NativeAction {
  actionId: string
  ownerId: string
  title: string
  icon: string
  position: 'leading' | 'trailing' | 'accessory'
  /** 区分跨页面入口和当前页面操作；旧容器可以忽略。 */
  scope?: 'global' | 'page'
  enabled: boolean
  loading: boolean
  dataAttr?: string
  menu?: Array<{ actionId: string; title: string; icon: string; enabled: boolean }>
  panel?: NativePanel
}

/** 系统面板只接收展示数据和稳定标识，业务回调留在网页内。 */
export interface NativePanelItem {
  id: string
  title: string
  subtitle?: string
  icon?: string
  /** 通知等现有内容的图片地址，仅用于展示，不能作为导航或业务命令。 */
  image?: string
  enabled?: boolean
  selected?: boolean
  destructive?: boolean
  keepOpen?: boolean
  /** 当前层级唯一的主要动作；新容器固定显示为原生按钮，旧容器仍可作为列表项执行。 */
  primary?: boolean
  children?: NativePanelItem[]
}

/** 快捷入口共用系统列表与搜索控件，分组内容来自现有业务组件。 */
export interface NativePanel {
  title: string
  /** 仅原生容器使用网格和半屏系统 Sheet，缺省仍为锚定列表。 */
  layout?: 'grid'
  /** 长正文面板可请求接近安全区全宽，短菜单仍按内容量测。 */
  width?: 'full'
  subtitle?: string
  profile?: { name: string; detail?: string; image?: string }
  search?: { text: string; placeholder: string }
  sections: Array<{ id: string; title?: string; items: NativePanelItem[] }>
  loading?: boolean
  hasMore?: boolean
  /** 连续列表只发送当前有界分片；会话内的旧行由原生保留。 */
  feed?: { id: string; offset: number; revision: number; sectionIds: string[] }
  /** 加载失败时停止自动请求，只保留显式重试。 */
  loadError?: string
  emptyText?: string
}

/** 原生 Sheet 只搬运现有 WebView；标题栏命令限定到当前实际弹窗及其按钮。 */
export interface NativeSheet {
  id: string
  title: string
  fullscreen: boolean
  canDismiss: boolean
  /** 简短设置使用系统中等高度，未提供时保持原业务弹窗高度。 */
  prefersMediumDetent?: boolean
  /** 可选的底页准备握手；不提供时容器沿用直接接管流程。 */
  backdropReady?: boolean
  actions: Array<{ id: string; title: string; enabled: boolean }>
}

/** 系统确认框只声明当前 Vue 提示文字和按钮；响应返回原始组件结算。 */
export interface NativeConfirmation {
  id: string
  title: string
  message: string
  confirmText: string
  cancelText: string
  confirmEnabled: boolean
  cancelEnabled: boolean
  destructive: boolean
}

/** 已经经过网页权限过滤和路由守卫的完整原生显示状态。 */
export interface NativeSnapshot {
  route: { fullPath: string; rootId: string | null; title: string; canGoBack: boolean; backTarget?: string }
  roots: Array<{ id: string; path: string; title: string; icon: string }>
  headerTabs?: { ownerId: string; selectedId: string; items: Array<{ id: string; title: string }> }
  actions: NativeAction[]
  moreMenu?: NativeMenuSection[]
  presentation?: {
    overlayOpen: boolean
    fullscreen?: boolean
    requestedPanel?: string
    sheet?: NativeSheet
    confirmation?: NativeConfirmation
  }
  chrome: {
    topVisible: boolean
    bottomVisible: boolean
    theme: 'system' | 'light' | 'dark'
    content?: 'web' | 'menu'
    accentColor?: string
    backgroundColor?: string
    surfaceColor?: string
  }
}

/** 原生更多页只呈现已授权的入口；实际目的地仍由 Vue Router 和业务守卫处理。 */
export interface NativeMenuSection {
  id: string
  title: string
  items: Array<{ id: string; path: string; title: string; icon: string; subtitle?: string }>
}

/** 系统 point 几何；网页通过实际 viewport 宽度换算 CSS 像素。 */
export interface NativeLayout {
  layoutRevision: number
  viewportPoints: { width: number; height: number }
  contentInsets: { top: number; left: number; bottom: number; right: number }
  systemSafeArea: { top: number; left: number; bottom: number; right: number }
  chromeOcclusion: { top: number; left: number; bottom: number; right: number }
  keyboardOcclusion: number
  consumedByNativeFrame: boolean
}

/** v1 消息外壳；会话仅用于隔离不同文档，不作为认证凭据。 */
export interface NativeEnvelope {
  protocol: 'moviepilot.chrome'
  major: 1
  type: string
  requestId: string
  sessionId?: string
  routeRevision?: number
  stateRevision?: number
  payload: Record<string, unknown>
}

/** 由主文档开始时注入的最小 WebKit 传输门面。 */
export interface NativeTransport {
  transportVersion: 1
  /** 可选原生快捷面板能力；旧容器仍使用原有 HTML 回调。 */
  panelsVersion?: 1
  /** 连续列表的分片保留和触底加载；旧容器仍使用已有分页。 */
  panelFeedsVersion?: 1
  /** 可选原生业务弹窗容器；未协商时完整保留网页弹窗。 */
  sheetsVersion?: 1
  /** 可选系统确认框，不支持时仍由原 HTML 弹窗结算。 */
  confirmationsVersion?: 1
  /** 路由提交前可短暂等待原生保存离页预览；旧容器不等待。 */
  navigationPreviewVersion?: 1
  /** 可选小组件登记桥；凭据只走相关的一次性结果，不进入导航快照。 */
  widgetsVersion?: 1
  /** 非敏感安装标识，仅用于退出当前账号时撤销对应通知绑定。 */
  notificationInstallation?: string
  /** 只发送 JSON 声明，不暴露任意原生方法。 */
  postMessage(message: NativeEnvelope): void
  /** 只通知宿主显示登录框架，不携带令牌或用户输入。 */
  authenticationRequired?(): void
}

declare global {
  interface Window {
    /** 普通浏览器和 PWA 中不存在；存在也不代表已完成接管。 */
    MoviePilotNative?: NativeTransport
  }
}

/** 桥接对象必须是普通 JSON 对象，不能把 null 或数组当作消息。 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/** 关联标识保持与 Swift 相同的短 ASCII 范围。 */
export function isNativeIdentifier(value: unknown): value is string {
  return typeof value === 'string' && /^[\x21-\x7e]{1,128}$/.test(value)
}

/** 内部路由不接受绝对来源、反斜杠或控制字符。 */
export function isNativeRoute(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.startsWith('/') &&
    !value.startsWith('//') &&
    !value.includes('\\') &&
    !/[\p{Cc}\p{Cf}]/u.test(value) &&
    new TextEncoder().encode(value).length <= 4096
  )
}
