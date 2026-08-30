import axios, {
  AxiosError,
  type AxiosInstance,
  type AxiosRequestConfig,
  type AxiosResponse,
  type CreateAxiosDefaults,
} from 'axios'
import type { ApiResponse } from './types'

/** 控制请求层是否展示成功或失败反馈。 */
export type ApiFeedbackMode = 'silent' | 'default' | 'all'

/** 请求层无法从后端取得 message 时使用的本地化文案类别。 */
export type ApiFallbackMessageKey = 'invalid-envelope' | 'network-error' | 'request-failed' | 'timeout'

/** 将请求层 fallback 类别解析为当前语言文案，避免基础客户端依赖 Vue i18n。 */
export type ApiFallbackMessageResolver = (key: ApiFallbackMessageKey) => string

declare module 'axios' {
  interface AxiosRequestConfig {
    feedback?: ApiFeedbackMode
    skipNavigationCancellation?: boolean
    skipConnectionTracking?: boolean
  }
}

/** 普通 API 客户端在响应拦截器解包后返回业务数据，而不是 AxiosResponse。 */
export interface DataApiClient extends Omit<
  AxiosInstance,
  'delete' | 'get' | 'head' | 'options' | 'patch' | 'patchForm' | 'post' | 'postForm' | 'put' | 'putForm' | 'request'
> {
  <T = unknown, R = T, D = AxiosRequestConfig['data']>(config: AxiosRequestConfig<D>): Promise<R>
  <T = unknown, R = T, D = AxiosRequestConfig['data']>(url: string, config?: AxiosRequestConfig<D>): Promise<R>
  request<T = unknown, R = T, D = AxiosRequestConfig['data']>(config: AxiosRequestConfig<D>): Promise<R>
  get<T = unknown, R = T, D = AxiosRequestConfig['data']>(url: string, config?: AxiosRequestConfig<D>): Promise<R>
  delete<T = unknown, R = T, D = AxiosRequestConfig['data']>(url: string, config?: AxiosRequestConfig<D>): Promise<R>
  head<T = unknown, R = T, D = AxiosRequestConfig['data']>(url: string, config?: AxiosRequestConfig<D>): Promise<R>
  options<T = unknown, R = T, D = AxiosRequestConfig['data']>(url: string, config?: AxiosRequestConfig<D>): Promise<R>
  post<T = unknown, R = T, D = AxiosRequestConfig['data']>(
    url: string,
    data?: D,
    config?: AxiosRequestConfig<D>,
  ): Promise<R>
  put<T = unknown, R = T, D = AxiosRequestConfig['data']>(
    url: string,
    data?: D,
    config?: AxiosRequestConfig<D>,
  ): Promise<R>
  patch<T = unknown, R = T, D = AxiosRequestConfig['data']>(
    url: string,
    data?: D,
    config?: AxiosRequestConfig<D>,
  ): Promise<R>
  postForm<T = unknown, R = T, D = AxiosRequestConfig['data']>(
    url: string,
    data?: D,
    config?: AxiosRequestConfig<D>,
  ): Promise<R>
  putForm<T = unknown, R = T, D = AxiosRequestConfig['data']>(
    url: string,
    data?: D,
    config?: AxiosRequestConfig<D>,
  ): Promise<R>
  patchForm<T = unknown, R = T, D = AxiosRequestConfig['data']>(
    url: string,
    data?: D,
    config?: AxiosRequestConfig<D>,
  ): Promise<R>
}

/** 插件与联邦组件接收 endpoint 最终 payload，方法签名不暴露 AxiosResponse 外壳。 */
export type PluginApiClient = DataApiClient

/** 请求层使用的反馈出口，由应用入口接到全局 Toast。 */
export interface ApiFeedbackNotifier {
  error(message: string): void
  success(message: string): void
}

/** 请求生命周期钩子用于隔离认证和离线状态等应用级副作用。 */
export interface ApiClientHooks {
  markServerOnline?(): void
  /** 返回 true 表示认证失败已由应用层接管，请求层不再弹出逐条错误提示。 */
  onForbidden?(error: ApiRequestError): boolean | void
  onUnauthorized?(error: ApiRequestError): boolean | void
  reportConnectionFailure?(reason: 'network-error' | 'timeout' | 'server-unreachable'): void
}

/** 创建内部数据客户端与插件最终 payload 客户端时所需的配置。 */
export interface CreateApiClientsOptions extends CreateAxiosDefaults {
  hooks?: ApiClientHooks
  notifier?: ApiFeedbackNotifier
  resolveFallbackMessage?: ApiFallbackMessageResolver
  setupInstance?(instance: AxiosInstance): void
}

const defaultFallbackMessages: Record<ApiFallbackMessageKey, string> = {
  'invalid-envelope': 'Invalid API response envelope',
  'network-error': 'Network connection failed',
  'request-failed': 'API request failed',
  timeout: 'Request timeout',
}

/** 技术类失败提示的去重窗口：后端异常时并发请求会得到相同错误，窗口内只提示一次避免刷屏。 */
const TECHNICAL_ERROR_DEDUP_MS = 15000

interface ApiRequestErrorOptions<T> {
  businessFailure?: boolean
  cause?: unknown
  code?: string
  config?: AxiosRequestConfig
  payload?: T
  request?: unknown
  response?: AxiosResponse<T>
}

/**
 * 统一表示业务失败、HTTP 失败和请求协议错误。
 *
 * 该类型继承 AxiosError，确保认证流程和既有调用方仍可读取 response、status、headers 与 config。
 */
export class ApiRequestError<T = unknown> extends AxiosError<T> {
  readonly businessFailure: boolean
  readonly headers?: AxiosResponse<T>['headers']
  readonly payload?: T

  /** 保留原始 Axios 元数据，并额外暴露已解析的响应载荷。 */
  constructor(message: string, options: ApiRequestErrorOptions<T> = {}) {
    super(
      message,
      options.code,
      options.config as AxiosResponse<T>['config'] | undefined,
      options.request,
      options.response,
    )
    this.name = 'ApiRequestError'
    this.businessFailure = options.businessFailure ?? false
    this.headers = options.response?.headers
    this.payload = options.payload
    this.status = options.response?.status
    if (options.cause instanceof Error) this.cause = options.cause
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

/** 返回 API 错误载荷中的业务消息，网络错误无响应时返回 undefined 供调用方使用连接 fallback。 */
export function getApiErrorMessage(error: unknown): string | undefined {
  if (!(error instanceof ApiRequestError)) return undefined
  const payload = error.payload ?? error.response?.data
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return undefined
  const record = payload as Record<string, unknown>
  for (const key of ['message', 'detail']) {
    const message = record[key]
    if (typeof message === 'string' && message.trim()) return message
  }
  return undefined
}

/** 仅返回后端在成功 HTTP 响应中声明的业务失败消息。 */
export function getApiBusinessErrorMessage(error: unknown): string | undefined {
  if (!(error instanceof ApiRequestError) || !error.businessFailure) return undefined
  return getApiErrorMessage(error)
}

/** 判断错误是否来自 HTTP 200 响应中的业务失败。 */
export function isApiBusinessFailure(error: unknown): error is ApiRequestError {
  return error instanceof ApiRequestError && error.businessFailure
}

/** 判断未知值是否为 MoviePilot 标准响应 envelope。 */
export function isApiResponse<T = unknown>(value: unknown): value is ApiResponse<T> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  const keys = Object.keys(record)
  if (keys.length !== 3 || !keys.every(key => key === 'success' || key === 'message' || key === 'data')) return false
  return typeof record.success === 'boolean' && typeof record.message === 'string' && 'data' in record
}

/**
 * 将 Axios 连接错误归类为全局服务探测可识别的原因。
 *
 * 网关不可用状态码（502/503/504）同样视为服务不可达：后端重启或崩溃时网关
 * 会返回这类响应，若只按“无响应”判断会漏掉重启场景的离线检测。
 */
export function resolveConnectionFailureReason(
  error: AxiosError,
): 'network-error' | 'timeout' | 'server-unreachable' | null {
  if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') return 'timeout'
  if (error.code === 'NETWORK_ERROR' || error.code === 'ERR_NETWORK' || error.name === 'NetworkError') {
    return 'network-error'
  }
  const status = error.response?.status
  if (status === 502 || status === 503 || status === 504) return 'server-unreachable'
  return null
}

/** 创建普通数据客户端和保持插件自由响应 ABI 的最终 payload 客户端。 */
export function createApiClients(options: CreateApiClientsOptions = {}): {
  api: DataApiClient
  pluginApi: PluginApiClient
} {
  const { hooks, notifier, resolveFallbackMessage, setupInstance, ...axiosConfig } = options
  const api = axios.create(axiosConfig)
  const pluginApi = axios.create(axiosConfig)

  // 技术类失败提示的去重缓存：同一消息在窗口内只提示一次，避免后端异常时大量并发请求刷屏。
  // 两个客户端共用同一份缓存，保证重复提示被整体收敛。
  const technicalErrorDedup = new Map<string, number>()

  // 优化器等底层拦截器必须先安装，确保它们在业务数据解包前仍能看到完整 AxiosResponse。
  setupInstance?.(api)
  setupInstance?.(pluginApi)
  installResponseInterceptors(api, 'data', hooks, notifier, resolveFallbackMessage, technicalErrorDedup)
  installResponseInterceptors(pluginApi, 'envelope', hooks, notifier, resolveFallbackMessage, technicalErrorDedup)

  return {
    api: api as DataApiClient,
    pluginApi: pluginApi as PluginApiClient,
  }
}

/** 为客户端安装统一的可达性、反馈、解包和错误标准化处理。 */
function installResponseInterceptors(
  instance: AxiosInstance,
  responseMode: 'data' | 'envelope',
  hooks?: ApiClientHooks,
  notifier?: ApiFeedbackNotifier,
  resolveFallbackMessage?: ApiFallbackMessageResolver,
  technicalErrorDedup?: Map<string, number>,
) {
  instance.interceptors.response.use(
    response => {
      hooks?.markServerOnline?.()

      if (isBinarySuccess(response)) return response.data

      const payload: unknown = response.data
      if (!isApiResponse(payload)) {
        // 联邦插件自行声明 API 响应；非宿主 envelope 必须原样交给插件调用方。
        if (responseMode === 'envelope') return payload
        const error = new ApiRequestError(resolveFallback('invalid-envelope', resolveFallbackMessage), {
          code: AxiosError.ERR_BAD_RESPONSE,
          config: response.config,
          payload,
          request: response.request,
          response,
        })
        // 无效 envelope 本身就是技术错误，必须留在去重窗口内收敛；
        // 此处绝不能清空去重缓存，否则每个坏响应都会重置窗口并逐条弹 Toast 刷屏。
        notifyFailure(response.config.feedback, notifier, error.message, technicalErrorDedup)
        return Promise.reject(error)
      }

      // 只有通过 envelope 校验的真实响应才算“服务恢复在线”的证据，
      // 此时清空技术错误去重缓存，让新一轮故障可以再次提示，避免永久静默。
      technicalErrorDedup?.clear()

      if (!payload.success) {
        notifyFailure(response.config.feedback, notifier, payload.message)
        if (responseMode === 'envelope') return payload
        return Promise.reject(
          new ApiRequestError(payload.message || resolveFallback('request-failed', resolveFallbackMessage), {
            businessFailure: true,
            code: AxiosError.ERR_BAD_RESPONSE,
            config: response.config,
            payload,
            request: response.request,
            response,
          }),
        )
      }

      notifySuccess(response.config.feedback, notifier, payload.message)
      return responseMode === 'envelope' ? payload : payload.data
    },
    async (reason: unknown) => {
      if (isCancellation(reason)) return Promise.reject(reason)
      // fulfilled 分支生成的协议错误已经携带完整上下文，不应再次按响应 message 包装。
      if (reason instanceof ApiRequestError) return Promise.reject(reason)

      const original = reason instanceof AxiosError ? reason : undefined
      const response = original?.response ? await normalizeErrorResponse(original.response) : undefined
      // 只有成功响应才算服务在线证据；网关错误响应说明后端当前不可达，不能恢复在线状态。
      if (response && response.status >= 200 && response.status < 300) hooks?.markServerOnline?.()

      const payload = response?.data
      const error = new ApiRequestError(resolveErrorMessage(payload, original, resolveFallbackMessage), {
        cause: reason,
        code: original?.code,
        config: original?.config,
        payload,
        request: original?.request,
        response,
      })

      const requestConfig = original?.config
      const failureReason = original ? resolveConnectionFailureReason(original) : null
      if (!requestConfig?.skipConnectionTracking && failureReason) {
        hooks?.reportConnectionFailure?.(failureReason)
      }
      // 认证失败由应用层统一签退或交给登录流程处理，避免在登录页暴露技术错误。
      const authenticationHandled =
        (response?.status === 401 && hooks?.onUnauthorized?.(error) === true) ||
        (response?.status === 403 && hooks?.onForbidden?.(error) === true)
      if (authenticationHandled) {
        return Promise.reject(error)
      }

      // 连接类失败（无响应、超时、网关不可用）统一交给离线状态系统按阈值提示，
      // 不在请求层逐个弹出，避免后端重启时刷屏。
      if (!failureReason) notifyFailure(requestConfig?.feedback, notifier, error.message, technicalErrorDedup)
      return Promise.reject(error)
    },
  )
}

/** 二进制成功响应不参与 JSON envelope 校验和解包。 */
function isBinarySuccess(response: AxiosResponse): boolean {
  if (typeof Blob !== 'undefined' && response.data instanceof Blob) return true
  return response.config.responseType === 'arraybuffer' || response.config.responseType === 'stream'
}

/** 将 Blob 形式的 JSON 错误响应解析为结构化载荷，便于调用方读取错误元数据。 */
async function normalizeErrorResponse(response: AxiosResponse): Promise<AxiosResponse> {
  if (typeof Blob === 'undefined' || !(response.data instanceof Blob) || !isJsonBlob(response)) return response

  try {
    const data = JSON.parse(await readBlobText(response.data)) as unknown
    return { ...response, data }
  } catch {
    return response
  }
}

/** 优先使用现代 Blob API，并为测试环境和旧浏览器保留 FileReader 回退。 */
function readBlobText(blob: Blob): Promise<string> {
  if (typeof blob.text === 'function') return blob.text()

  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read response Blob'))
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '')
    reader.readAsText(blob)
  })
}

/** 根据响应头或 Blob 自身类型识别 JSON 错误载荷。 */
function isJsonBlob(response: AxiosResponse): boolean {
  const blobType = response.data instanceof Blob ? response.data.type : ''
  const headers = response.headers as AxiosResponse['headers'] & { get?: (name: string) => unknown }
  const rawContentType = typeof headers.get === 'function' ? headers.get('content-type') : headers['content-type']
  const contentType = typeof rawContentType === 'string' ? rawContentType : ''
  return blobType.includes('json') || contentType.includes('json')
}

/** 取消属于正常控制流，保持原始取消对象且不触发 Toast 或离线探测。 */
function isCancellation(reason: unknown): boolean {
  if (axios.isCancel(reason)) return true
  if (!(reason instanceof Error)) return false
  return reason.name === 'AbortError' || reason.name === 'CanceledError'
}

/** 优先使用后端 message，并兼容尚未进入统一 envelope 的 detail 错误。 */
function resolveErrorMessage(
  payload: unknown,
  error?: AxiosError,
  resolveFallbackMessage?: ApiFallbackMessageResolver,
): string {
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    const record = payload as Record<string, unknown>
    if (typeof record.message === 'string' && record.message) return record.message
    if (typeof record.detail === 'string' && record.detail) return record.detail
  }
  if (error?.code === 'ECONNABORTED' || error?.code === 'ETIMEDOUT') {
    return resolveFallback('timeout', resolveFallbackMessage)
  }
  if (error?.code === 'NETWORK_ERROR' || error?.code === 'ERR_NETWORK') {
    return resolveFallback('network-error', resolveFallbackMessage)
  }
  if (error?.message) return error.message
  return resolveFallback('request-failed', resolveFallbackMessage)
}

/** 调用应用注入的本地化 resolver，并为独立使用保留稳定默认值。 */
function resolveFallback(key: ApiFallbackMessageKey, resolver?: ApiFallbackMessageResolver): string {
  return resolver?.(key) || defaultFallbackMessages[key]
}

/** 默认模式只提示失败，silent 模式完全关闭请求层反馈。 */
function notifyFailure(
  mode: ApiFeedbackMode | undefined,
  notifier: ApiFeedbackNotifier | undefined,
  message: string,
  technicalErrorDedup?: Map<string, number>,
) {
  if (mode !== 'silent' && message && !isTechnicalErrorCached(message, technicalErrorDedup)) {
    notifier?.error(message)
  }
}

/**
 * 技术错误去重：相同消息在窗口内只提示一次。
 *
 * 后端异常或重启时大量并发请求会携带同一技术错误（协议错误、HTTP 5xx 等），
 * 逐条弹出会占满屏幕；此处以消息为键缓存最近提示时间，窗口内重复消息不再提示。
 */
function isTechnicalErrorCached(message: string, dedup?: Map<string, number>): boolean {
  if (!dedup) return false
  const now = Date.now()
  const lastShownAt = dedup.get(message)
  dedup.set(message, now)
  if (lastShownAt !== undefined && now - lastShownAt < TECHNICAL_ERROR_DEDUP_MS) {
    return true
  }
  // 顺带清理过期缓存项，避免长时间运行后缓存无限增长。
  if (dedup.size > 64) {
    for (const [key, at] of dedup) {
      if (now - at >= TECHNICAL_ERROR_DEDUP_MS) dedup.delete(key)
    }
  }
  return false
}

/** all 模式用于显式要求请求层展示后端成功消息。 */
function notifySuccess(mode: ApiFeedbackMode | undefined, notifier: ApiFeedbackNotifier | undefined, message: string) {
  if (mode === 'all' && message) notifier?.success(message)
}
