import { ApiRequestError, type DataApiClient } from '@/api/client'
import { isNavigationFailure, NavigationFailureType, type Router } from 'vue-router'
import { isRecord } from './protocol'

/** 小组件只携带固定内容意图，实际页面仍经过原有 Router 守卫。 */
const widgetRoutes = {
  overview: '/dashboard',
  downloads: '/downloading',
  imports: '/history',
  movieSubscriptions: '/subscribe/movie',
  tvSubscriptions: '/subscribe/tv',
  musicSubscriptions: '/subscribe/music',
} as const

/** 与后端有界协议一致的内容枚举，不接受任意网页路径。 */
export type NativeWidgetContent = keyof typeof widgetRoutes

/** 当前主登录的不可变身份；读取不会登记或轮换凭据。 */
export interface NativeWidgetContext {
  version: 1
  owner: string
  availableContents: NativeWidgetContent[]
}

/** 一次性登记结果，仅允许相关原生请求接收，不能放入展示状态。 */
export interface NativeWidgetRegistration extends NativeWidgetContext {
  registrationId: string
  installationId: string
  secret: string
  expiresAt: number
}

/** 失败只传固定原因，不回显后端正文、令牌或内部异常。 */
export type NativeWidgetError =
  | 'unsupported'
  | 'unavailable'
  | 'unauthorized'
  | 'forbidden'
  | 'identity_changed'
  | 'invalid_request'
  | 'invalid_data'
  | 'cancelled'
  | 'busy'
  | 'stale_request'
  | 'request_limit'

/** 专用结果不加入普通命令的重放缓存。 */
export type NativeWidgetResult =
  | { success: true; data: NativeWidgetContext | NativeWidgetRegistration | { completed: true } }
  | { success: false; error: NativeWidgetError }

/** 只注入现有 API 和 Router，不复制认证、权限或业务查询。 */
export interface NativeWidgetOptions {
  api: DataApiClient
  apiBase: URL
  origin: string
  /** 只有当前网页完成原生接管并登录后才执行请求。 */
  isActive(): boolean
  /** 只在 JS 内比较当前主登录是否改变，值不进入原生响应。 */
  readToken(): string | null
  /** 弹层期间不抢占原有业务导航。 */
  canNavigate(): boolean
  /** 由原 Router 返回守卫结果，不能直接修改 WebView URL。 */
  navigate(path: string): Promise<boolean>
  /** 测试可注入 UTC Unix 秒，生产沿用系统时钟。 */
  now?(): number
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ownerPattern = /^[0-9a-f]{32}$/

/** 已在目标页也完成固定意图；取消或守卫拒绝继续失败，不重载页面或追加重复历史。 */
export async function navigateNativeWidget(router: Router, path: string): Promise<boolean> {
  const failure = await router.push(path)
  return !isNavigationFailure(failure) || isNavigationFailure(failure, NavigationFailureType.duplicated)
}

/** 规范 UUID 后仅用于固定资源路径，不把任意标识拼进 URL。 */
function uuid(value: unknown): string | undefined {
  return typeof value === 'string' && uuidPattern.test(value) ? value.toLowerCase() : undefined
}

/** 内容必须属于有限枚举，原型属性不属于可用业务入口。 */
function isContent(value: unknown): value is NativeWidgetContent {
  return typeof value === 'string' && Object.hasOwn(widgetRoutes, value)
}

/** 只投影有界白名单；服务端增加的字段不能意外进入原生桥。 */
function context(value: unknown): NativeWidgetContext {
  if (
    !isRecord(value) ||
    value.version !== 1 ||
    typeof value.owner !== 'string' ||
    !ownerPattern.test(value.owner) ||
    !Array.isArray(value.availableContents) ||
    value.availableContents.length > 6 ||
    !value.availableContents.every(isContent) ||
    new Set(value.availableContents).size !== value.availableContents.length
  )
    throw new Error('invalid_widget_data')
  return { version: 1, owner: value.owner, availableContents: [...value.availableContents] }
}

/** 写请求的密钥必须与本安装及本次登记匹配，且不能无限期有效。 */
function registration(value: unknown, installationId: string, owner: string, now: number): NativeWidgetRegistration {
  const current = context(value)
  if (!isRecord(value)) throw new Error('invalid_widget_data')
  const registrationId = uuid(value.registrationId)
  if (
    !registrationId ||
    uuid(value.installationId) !== installationId ||
    current.owner !== owner ||
    current.availableContents.length === 0 ||
    typeof value.secret !== 'string' ||
    !new RegExp(`^mpw_${registrationId}\\.[A-Za-z0-9_-]{43}$`).test(value.secret) ||
    typeof value.expiresAt !== 'number' ||
    !Number.isFinite(value.expiresAt) ||
    value.expiresAt <= now ||
    value.expiresAt > now + 30 * 24 * 60 * 60 + 300
  )
    throw new Error('invalid_widget_data')
  return { ...current, registrationId, installationId, secret: value.secret, expiresAt: value.expiresAt }
}

/** 仅在新容器明确协商后接收固定小组件操作，普通 Web/PWA 不产生请求。 */
export class NativeWidgetAdapter {
  /** 固定同源 API 根由宿主页面提供，后续请求不能采信载荷中的地址。 */
  constructor(private readonly options: NativeWidgetOptions) {}

  /** 当前身份、取消信号与容器阶段共同决定等待中的响应是否仍可交付。 */
  private current(token: string, signal: AbortSignal) {
    return !signal.aborted && this.options.isActive() && this.options.readToken() === token
  }

  /** 处理一项有界请求；不缓存结果，不重试写请求，也不把主 token 交给原生。 */
  async request(payload: Record<string, unknown>, signal: AbortSignal): Promise<NativeWidgetResult> {
    const { api, apiBase } = this.options
    if (
      !this.options.isActive() ||
      apiBase.origin !== this.options.origin ||
      !['http:', 'https:'].includes(apiBase.protocol) ||
      apiBase.username ||
      apiBase.password ||
      apiBase.search ||
      apiBase.hash ||
      !apiBase.pathname.endsWith('/api/v1/')
    )
      return { success: false, error: 'unsupported' }
    const token = this.options.readToken()
    if (!token) return { success: false, error: 'unauthorized' }
    if (signal.aborted) return { success: false, error: 'cancelled' }
    const operation = payload.operation
    const field = { context: undefined, register: 'installationId', revoke: 'registrationId', open: 'content' } as const
    if (typeof operation !== 'string' || !Object.hasOwn(field, operation))
      return { success: false, error: 'invalid_request' }
    const kind = operation as keyof typeof field
    const expected = kind === 'context' ? ['operation'] : ['operation', 'owner', field[kind]]
    if (
      Object.keys(payload).length !== expected.length ||
      Object.keys(payload).some(key => !expected.includes(key)) ||
      (kind !== 'context' && (typeof payload.owner !== 'string' || !ownerPattern.test(payload.owner))) ||
      (kind === 'register' && !uuid(payload.installationId)) ||
      (kind === 'revoke' && !uuid(payload.registrationId)) ||
      (kind === 'open' && !isContent(payload.content))
    )
      return { success: false, error: 'invalid_request' }
    const config = {
      baseURL: apiBase.href,
      signal,
      timeout: 15000,
      feedback: 'silent' as const,
      skipConnectionTracking: true,
      headers: { 'Cache-Control': 'no-store' },
    }
    try {
      const current = context(await api.get('widget/context', config))
      if (!this.current(token, signal)) return { success: false, error: 'identity_changed' }
      if (kind === 'context') return { success: true, data: current }
      if (current.owner !== payload.owner) return { success: false, error: 'identity_changed' }
      if (kind === 'register') {
        if (!current.availableContents.length) return { success: false, error: 'forbidden' }
        const installationId = uuid(payload.installationId)!
        const result = await api.post('widget/registrations', { installationId }, config)
        if (!this.current(token, signal)) return { success: false, error: 'identity_changed' }
        return {
          success: true,
          data: registration(result, installationId, current.owner, this.options.now?.() ?? Date.now() / 1000),
        }
      }
      if (kind === 'revoke') {
        await api.delete(`widget/registrations/${uuid(payload.registrationId)}`, config)
        if (!this.current(token, signal)) return { success: false, error: 'identity_changed' }
      } else {
        if (!isContent(payload.content) || !current.availableContents.includes(payload.content))
          return { success: false, error: 'forbidden' }
        if (!this.options.canNavigate()) return { success: false, error: 'busy' }
        const accepted = await this.options.navigate(widgetRoutes[payload.content])
        if (!this.current(token, signal)) return { success: false, error: 'identity_changed' }
        if (!accepted) return { success: false, error: 'unavailable' }
      }
      return { success: true, data: { completed: true } }
    } catch (error) {
      if (signal.aborted) return { success: false, error: 'cancelled' }
      if (!this.current(token, signal)) return { success: false, error: 'identity_changed' }
      if (error instanceof ApiRequestError) {
        const status = error.response?.status
        if (status === 401) return { success: false, error: 'unauthorized' }
        if (status === 403) return { success: false, error: 'forbidden' }
        if (status === 404 || status === 405) return { success: false, error: 'unsupported' }
        return { success: false, error: 'unavailable' }
      }
      return { success: false, error: 'invalid_data' }
    }
  }
}

/** 退出先通知当前原生会话清理组件，载荷不包含主 token 或账号资料。 */
export function endNativeWidgetSession() {
  if (window.MoviePilotNative?.widgetsVersion === 1) window.dispatchEvent(new Event('moviepilot:widget-logout'))
}
