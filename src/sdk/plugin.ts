/**
 * 联邦插件前端 SDK v1 的公开契约与纯运行时工具。
 *
 * 本模块不依赖宿主实现；同源公开产物由 build:plugin-sdk 从这里生成。
 */
import type { Component } from 'vue'
import type { AgentPetContext, MoviePilotAgentHost } from '../types/agentHost'

/** SDK 主版本；不兼容变更使用新的主版本和公开目录。 */
export const PLUGIN_HOST_SDK_VERSION = 1
/** 字符串键可在宿主与独立构建的插件之间共享。 */
export const PLUGIN_HOST_SDK_KEY = 'moviepilot:sdk'
/** 兼容已有插件的独立能力注入键。 */
export const PLUGIN_HOST_KEYS = {
  toast: 'moviepilot:toast',
  dialog: 'moviepilot:dialog',
  confirm: 'moviepilot:confirm',
  nativeSubscribe: 'moviepilot:nativeSubscribe',
  subscriptionManager: 'moviepilot:subscriptionManager',
  agent: 'moviepilot:agent',
} as const

/** 宿主实际实现的现有订阅管理操作。 */
export const PLUGIN_SUBSCRIPTION_ACTIONS = [
  'edit',
  'search',
  'pause',
  'resume',
  'reset',
  'activity',
  'detail',
  'delete',
  'logs',
  'files',
  'execution',
  'share',
] as const
/** 现有订阅管理操作名称。 */
export type NativeSubscriptionAction = (typeof PLUGIN_SUBSCRIPTION_ACTIONS)[number]
/** SDK 所在的联邦宿主界面。 */
export type PluginHostSurface = 'page' | 'config' | 'dashboard' | 'app' | 'agent-pet'
/** 能力表示宿主实现可用，不表示当前用户已经获得操作权限。 */
export type PluginHostCapability =
  | 'api'
  | 'ui.toast'
  | 'ui.dialog'
  | 'ui.confirm'
  | 'subscription.create'
  | 'subscription.manage'
  | `subscription.manage.${NativeSubscriptionAction}`
  | 'agent'
  | 'agent.pet'
  | 'subscription.create.music'
  | `media.${keyof PluginMediaServices}`
  | `resources.${keyof PluginResourceServices}`
  | `files.${keyof PluginFileServices}`
  | `catalogs.${keyof PluginCatalogServices}`
  | 'navigation'
  | 'environment'
  | 'preferences'
  | 'events'
  | 'shell.button'
  | 'shell.tabs'
  | 'workflows'

/** 插件请求的公开选项；认证和实例路径由宿主管理。 */
export interface PluginRequestOptions {
  params?: Record<string, unknown>
  headers?: Record<string, string>
  signal?: AbortSignal
  timeout?: number
  feedback?: 'silent' | 'default' | 'all'
  responseType?: 'json' | 'text' | 'blob' | 'arraybuffer'
}

/** 返回端点最终业务数据，保留插件自己的 payload，不返回 AxiosResponse 外壳。 */
export interface PluginAPI {
  get<T = unknown>(url: string, options?: PluginRequestOptions): Promise<T>
  delete<T = unknown>(url: string, options?: PluginRequestOptions): Promise<T>
  head<T = unknown>(url: string, options?: PluginRequestOptions): Promise<T>
  options<T = unknown>(url: string, options?: PluginRequestOptions): Promise<T>
  post<T = unknown>(url: string, data?: unknown, options?: PluginRequestOptions): Promise<T>
  put<T = unknown>(url: string, data?: unknown, options?: PluginRequestOptions): Promise<T>
  patch<T = unknown>(url: string, data?: unknown, options?: PluginRequestOptions): Promise<T>
}

/** 宿主通知的稳定公共子集，通知容器与主题由宿主管理。 */
export interface PluginToast {
  success(message: string): unknown
  info(message: string): unknown
  warning(message: string): unknown
  error(message: string): unknown
}

/** 主应用确认弹窗支持的配置。 */
export interface PluginConfirmOptions {
  type?: 'info' | 'warn' | 'error'
  icon?: string
  title?: string
  content?: string
  confirmText?: string
  cancelText?: string
  width?: string | number
}
/** 取消、遮罩关闭和 Esc 均返回 false。 */
export type PluginConfirm = (options?: PluginConfirmOptions) => Promise<boolean>

/** 公共弹窗事件参数由插件组件定义。 */
export type PluginDialogEvent = (...args: unknown[]) => unknown
/** 公共弹窗关闭策略。 */
export interface PluginDialogOptions {
  closeOn?: string[] | false
  replace?: boolean
}
/** 仅控制本次打开的公共弹窗。 */
export interface PluginDialogController {
  id: number
  close(): void
  updateProps(props: Record<string, unknown>): void
}
/** 在宿主公共弹窗层挂载插件组件，不让插件复制全局弹窗宿主。 */
export type PluginDialog = (
  component: Component,
  props?: Record<string, unknown>,
  events?: Record<string, PluginDialogEvent>,
  options?: PluginDialogOptions,
) => PluginDialogController

/** 新增订阅使用统一主身份；字段缺失时由宿主返回 INVALID_MEDIA。 */
export interface NativeSubscribeMediaInfo {
  media_source?: string
  media_id?: string | number
  type?: string
  title?: string
  year?: string | number
  season?: number
  episode_group?: string
  poster_path?: string
  /** 允许宿主媒体对象附带展示字段；辅助来源 ID 不能替代统一主身份。 */
  [key: string]: unknown
}
/** success 表示宿主接受新增交互，不表示用户已经保存订阅。 */
export type NativeSubscribeResult =
  | { success: true }
  | {
      success: false
      code: 'INVALID_MEDIA' | 'PERMISSION_DENIED' | 'HOST_DISPOSED' | 'REQUEST_FAILED'
      message: string
    }
/** 复用主程序电影订阅或电视剧选季流程。 */
export type NativeSubscribe = (media: NativeSubscribeMediaInfo) => Promise<NativeSubscribeResult>

export type NativeMusicSubscribe = (
  media: NativeSubscribeMediaInfo & { type: '音乐' | 'music'; music_type: 'album' | 'recording' },
) => Promise<NativeSubscribeResult>

/** 请求只接受订阅 ID，宿主重新读取记录，不能信任插件传入的归属和媒体快照。 */
export interface NativeSubscriptionRequest {
  action: NativeSubscriptionAction
  subscriptionId: number
  /** 保存、移除或其他实际变更成功后调用；只打开编辑弹窗不会调用。 */
  onChanged?: () => unknown
}
/** 可供插件稳定分支处理的错误原因。 */
export type NativeSubscriptionErrorCode =
  'INVALID_REQUEST' | 'PERMISSION_DENIED' | 'CANCELLED' | 'BUSY' | 'HOST_DISPOSED' | 'REQUEST_FAILED'
/** 区分弹窗已打开和操作已完成；取消不会被当作实际变更。 */
export type NativeSubscriptionResult =
  | { success: true; status: 'opened' | 'completed' }
  | { success: false; code: NativeSubscriptionErrorCode; cancelled?: boolean; message?: string }
/** 复用主程序的订阅编辑、活动、路由及管理 API。 */
export type NativeSubscriptionManager = (request: NativeSubscriptionRequest) => Promise<NativeSubscriptionResult>

/** 原生交互的结构化结果；opened 不代表用户已保存，completed 不代表后台任务已结束。 */
export type PluginOperationResult<T = undefined> =
  | { success: true; status: 'opened' | 'completed'; data?: T }
  | { success: false; code: NativeSubscriptionErrorCode; message?: string; cancelled?: boolean }

export interface PluginMediaIdentity {
  media_source: string
  media_id: string | number
  type?: string
  title?: string
  year?: string | number
  season?: number
  music_type?: 'recording' | 'album' | 'artist'
}
export interface PluginSelectedMedia extends PluginMediaIdentity {
  title: string
  poster?: string
}
export interface PluginMediaServices {
  detail(media: PluginMediaIdentity): Promise<PluginOperationResult>
  select(options: {
    media_source: string
    keyword?: string
    musicTypes?: ('recording' | 'album' | 'artist')[]
  }): Promise<PluginOperationResult<PluginSelectedMedia>>
  recognize(options: { path: string }): Promise<PluginOperationResult>
}
export interface PluginResourceServices {
  search(options: { keyword?: string; media?: PluginMediaIdentity; sites?: number[] }): Promise<PluginOperationResult>
  download(options: {
    title?: string
    media?: PluginMediaIdentity
    torrent?: Record<string, unknown>
  }): Promise<PluginOperationResult>
}
/** 文件来自宿主存储目录，除 path 外须保留云盘 fileid/pickcode 等原生字段。 */
export interface PluginFileItem {
  storage: string
  type: string
  name: string
  path: string
  basename?: string
  extension?: string
  size?: number
  fileid?: string
  parent_fileid?: string
  pickcode?: string
  drive_id?: string
}
export interface PluginFileServices {
  browse(): Promise<PluginOperationResult>
  select(options?: {
    storage?: string
    initial?: PluginFileItem
    kind?: 'file' | 'directory' | 'any'
    multiple?: boolean
  }): Promise<PluginOperationResult<PluginFileItem[]>>
  reorganize(options: {
    items: PluginFileItem[]
    targetStorage?: string
    targetPath?: string
  }): Promise<PluginOperationResult>
  scrape(options: { items: PluginFileItem[]; onChanged?: () => unknown }): Promise<PluginOperationResult>
}
/** 只公开选择器所需的字段，不返回连接配置和凭据。 */
export interface PluginCatalogOption {
  id: string | number
  name: string
}
export interface PluginMediaSourceOption extends PluginCatalogOption {
  mediaTypes: string[]
}
export interface PluginDirectoryOption extends PluginCatalogOption {
  storage?: string
  path?: string
  downloadPath?: string
  libraryPath?: string
  mediaType?: string
  priority?: number
}
export interface PluginCatalogServices {
  mediaSources(): Promise<PluginMediaSourceOption[]>
  storages(): Promise<PluginCatalogOption[]>
  downloadDirectories(): Promise<PluginDirectoryOption[]>
  directories(query?: {
    directory_type?: 'all' | 'download' | 'library'
    name?: string
    storage_type?: 'all' | 'local' | 'remote'
  }): Promise<PluginDirectoryOption[]>
  ruleGroups(): Promise<PluginCatalogOption[]>
}
/** 导航限于宿主内部路径；插件不需要持有宿主 router。 */
export interface PluginNavigationServices {
  push(target: {
    path: string
    query?: Record<string, string | number | boolean | undefined>
  }): Promise<PluginOperationResult>
  replace(target: {
    path: string
    query?: Record<string, string | number | boolean | undefined>
  }): Promise<PluginOperationResult>
}
export type PluginPermission = 'discovery' | 'search' | 'subscribe' | 'manage' | 'admin'
export interface PluginEnvironmentSnapshot {
  locale: string
  theme: 'light' | 'dark'
  isMobile: boolean
  online: boolean
  user: { id: number; name: string; isAdmin: boolean }
  permissions: Readonly<Record<PluginPermission, boolean>>
  features: Readonly<Record<string, boolean>>
}
export interface PluginEnvironmentServices {
  getSnapshot(): Readonly<PluginEnvironmentSnapshot>
  /** 立即发送一次快照；返回取消函数，宿主失效时自动清理。 */
  subscribe(listener: (state: Readonly<PluginEnvironmentSnapshot>) => void): () => void
  hasPermission(permission: PluginPermission, feature?: string): boolean
}
export interface PluginPreferenceServices {
  /** 每个 key 独立保存，按当前用户及插件实例隔离。remove 将其置为 null。 */
  get<T = unknown>(key: string): Promise<T | null>
  set(key: string, value: unknown): Promise<void>
  remove(key: string): Promise<void>
}
export interface PluginStreamController {
  close(): void
  reconnect(): void
}
export interface PluginEventServices {
  /** 相对 API 根路径，不接受外站地址或查询中的认证凭据。 */
  subscribe(options: {
    path: string
    onMessage: (event: { data: string; type: string; lastEventId: string }) => void
    onStatus?: (status: 'idle' | 'connecting' | 'open' | 'error' | 'closed') => void
  }): PluginStreamController
  progress(options: {
    type: string
    onProgress: (progress: { text: string; value?: number }) => void
  }): PluginStreamController
}
export interface PluginShellCommand {
  title: string
  icon: string
  action: () => void
  permission?: PluginPermission
  feature?: string
  disabled?: boolean
}
export interface PluginShellServices {
  /** 每次注册具有独立所有权，返回仅注销本次注册的函数。 */
  registerButton(command: PluginShellCommand & { menuItems?: PluginShellCommand[] }): () => void
  registerTabs(options: {
    items: { title: string; tab: string; icon?: string }[]
    selected: string
    onSelect: (tab: string) => void
    buttons?: PluginShellCommand[]
  }): { update(selected: string): void; dispose(): void }
}
export interface PluginWorkflowServices {
  manage(request: {
    action: 'create' | 'edit' | 'design' | 'run' | 'execution' | 'logs'
    workflowId?: number
    fromBeginning?: boolean
    onChanged?: () => unknown
  }): Promise<PluginOperationResult>
}

/** 实例身份是路由信息，不是服务端授权凭据。 */
export interface PluginHostContext {
  pluginId: string
  sourcePluginId?: string
  surface: PluginHostSurface
}
/** 宿主提供的公共界面能力。 */
export interface PluginHostUI {
  toast: PluginToast
  dialog: PluginDialog
  confirm: PluginConfirm
}
/** 宿主可以按界面提供部分订阅能力，插件应先检测。 */
export interface PluginHostSubscriptions {
  create?: NativeSubscribe
  manage?: NativeSubscriptionManager
  createMusic?: NativeMusicSubscribe
}
/** SDK 的公开入口，实例身份与 API 客户端随宿主当前实例更新。 */
export interface PluginHostSDK {
  readonly apiVersion: typeof PLUGIN_HOST_SDK_VERSION
  readonly hostVersion: string
  readonly context: Readonly<PluginHostContext>
  readonly capabilities: readonly PluginHostCapability[]
  readonly api: PluginAPI
  readonly ui?: Readonly<PluginHostUI>
  readonly subscriptions?: Readonly<PluginHostSubscriptions>
  readonly agent?: MoviePilotAgentHost
  readonly media?: Readonly<PluginMediaServices>
  readonly resources?: Readonly<PluginResourceServices>
  readonly files?: Readonly<PluginFileServices>
  readonly catalogs?: Readonly<PluginCatalogServices>
  readonly navigation?: Readonly<PluginNavigationServices>
  readonly environment?: Readonly<PluginEnvironmentServices>
  readonly preferences?: Readonly<PluginPreferenceServices>
  readonly events?: Readonly<PluginEventServices>
  readonly shell?: Readonly<Partial<PluginShellServices>>
  readonly workflows?: Readonly<PluginWorkflowServices>
  readonly pet?: AgentPetContext
  /** 未识别的能力名返回 false，不能按主程序版本猜测接口是否存在。 */
  supports(capability: string): boolean
}
/** 页面、配置、仪表盘及侧栏宿主提供完整的原生界面交互能力。 */
export interface InteractivePluginHostSDK extends PluginHostSDK {
  readonly ui: Readonly<PluginHostUI>
  readonly subscriptions: Readonly<
    PluginHostSubscriptions & { create: NativeSubscribe; manage: NativeSubscriptionManager }
  >
}
/** 联邦组件可以通过 prop 取得 SDK，也可通过 PLUGIN_HOST_SDK_KEY 注入。 */
export interface PluginHostProps {
  hostSdk?: PluginHostSDK
  subscriptionManager?: NativeSubscriptionManager
  nativeSubscribe?: NativeSubscribe
  pluginId?: string
  sourcePluginId?: string
}

/** 构造 SDK 时由宿主显式注入已实现的服务，不创建另一套业务实现。 */
export interface PluginHostServices {
  hostVersion: string
  context: () => PluginHostContext
  api: () => PluginAPI
  ui?: PluginHostUI
  subscriptions?: PluginHostSubscriptions
  agent?: MoviePilotAgentHost
  pet?: AgentPetContext
  media?: PluginMediaServices
  resources?: PluginResourceServices
  files?: PluginFileServices
  catalogs?: PluginCatalogServices
  navigation?: PluginNavigationServices
  environment?: PluginEnvironmentServices
  preferences?: PluginPreferenceServices
  events?: PluginEventServices
  shell?: Partial<PluginShellServices>
  workflows?: PluginWorkflowServices
}

/** 根据实际服务生成 SDK，保留动态实例 getter，防止路由切换后仍绑定旧实例。 */
export function createPluginHostSDK(
  services: PluginHostServices & {
    ui: PluginHostUI
    subscriptions: PluginHostSubscriptions & { create: NativeSubscribe; manage: NativeSubscriptionManager }
  },
): InteractivePluginHostSDK
export function createPluginHostSDK(services: PluginHostServices): PluginHostSDK
export function createPluginHostSDK(services: PluginHostServices): PluginHostSDK {
  const capabilities: PluginHostCapability[] = ['api']
  if (services.ui) capabilities.push('ui.toast', 'ui.dialog', 'ui.confirm')
  if (services.subscriptions?.create) capabilities.push('subscription.create')
  if (services.subscriptions?.manage) {
    capabilities.push(
      'subscription.manage',
      ...PLUGIN_SUBSCRIPTION_ACTIONS.map(action => `subscription.manage.${action}` as const),
    )
  }
  if (services.subscriptions?.createMusic) capabilities.push('subscription.create.music')
  for (const namespace of ['media', 'resources', 'files', 'catalogs'] as const) {
    const service = services[namespace]
    if (service)
      for (const method of Object.keys(service)) {
        if (typeof service[method as keyof typeof service] === 'function')
          capabilities.push(`${namespace}.${method}` as PluginHostCapability)
      }
  }
  for (const namespace of ['navigation', 'environment', 'preferences', 'events', 'workflows'] as const) {
    if (services[namespace]) capabilities.push(namespace)
  }
  if (services.shell?.registerButton) capabilities.push('shell.button')
  if (services.shell?.registerTabs) capabilities.push('shell.tabs')
  if (services.agent) capabilities.push('agent')
  if (services.pet) capabilities.push('agent.pet')
  const available = new Set<string>(capabilities)
  return Object.freeze({
    apiVersion: PLUGIN_HOST_SDK_VERSION,
    hostVersion: services.hostVersion,
    get context() {
      return Object.freeze({ ...services.context() })
    },
    get api() {
      return services.api()
    },
    capabilities: Object.freeze(capabilities),
    ui: services.ui ? Object.freeze({ ...services.ui }) : undefined,
    subscriptions: services.subscriptions ? Object.freeze({ ...services.subscriptions }) : undefined,
    media: services.media ? Object.freeze({ ...services.media }) : undefined,
    resources: services.resources ? Object.freeze({ ...services.resources }) : undefined,
    files: services.files ? Object.freeze({ ...services.files }) : undefined,
    catalogs: services.catalogs ? Object.freeze({ ...services.catalogs }) : undefined,
    navigation: services.navigation ? Object.freeze({ ...services.navigation }) : undefined,
    environment: services.environment ? Object.freeze({ ...services.environment }) : undefined,
    preferences: services.preferences ? Object.freeze({ ...services.preferences }) : undefined,
    events: services.events ? Object.freeze({ ...services.events }) : undefined,
    shell: services.shell ? Object.freeze({ ...services.shell }) : undefined,
    workflows: services.workflows ? Object.freeze({ ...services.workflows }) : undefined,
    agent: services.agent,
    pet: services.pet,
    supports: (capability: string) => available.has(capability),
  })
}

/** 识别可消费的 SDK 主版本；旧宿主或未知版本不能被当作 v1 调用。 */
export function isPluginHostSDK(value: unknown): value is PluginHostSDK {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<PluginHostSDK>
  return (
    candidate.apiVersion === PLUGIN_HOST_SDK_VERSION &&
    typeof candidate.hostVersion === 'string' &&
    typeof candidate.supports === 'function' &&
    Array.isArray(candidate.capabilities) &&
    !!candidate.context &&
    typeof candidate.context.pluginId === 'string' &&
    !!candidate.api &&
    typeof candidate.api.get === 'function'
  )
}
