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
  children?: NativePanelItem[]
}

/** 快捷入口共用系统列表与搜索控件，分组内容来自现有业务组件。 */
export interface NativePanel {
  title: string
  subtitle?: string
  search?: { text: string; placeholder: string }
  sections: Array<{ id: string; title?: string; items: NativePanelItem[] }>
  loading?: boolean
  hasMore?: boolean
  emptyText?: string
}

/** 原生 Sheet 只搬运现有 WebView；标题栏命令限定到当前实际弹窗及其按钮。 */
export interface NativeSheet {
  id: string
  title: string
  fullscreen: boolean
  canDismiss: boolean
  /** 可选的底页准备握手；不提供时容器沿用直接接管流程。 */
  backdropReady?: boolean
  actions: Array<{ id: string; title: string; enabled: boolean }>
}

/** 已经经过网页权限过滤和路由守卫的完整原生显示状态。 */
export interface NativeSnapshot {
  route: { fullPath: string; rootId: string | null; title: string; canGoBack: boolean; backTarget?: string }
  roots: Array<{ id: string; path: string; title: string; icon: string }>
  headerTabs?: { ownerId: string; selectedId: string; items: Array<{ id: string; title: string }> }
  actions: NativeAction[]
  moreMenu?: NativeMenuSection[]
  presentation?: { overlayOpen: boolean; fullscreen?: boolean; requestedPanel?: string; sheet?: NativeSheet }
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
  /** 可选原生业务弹窗容器；未协商时完整保留网页弹窗。 */
  sheetsVersion?: 1
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
