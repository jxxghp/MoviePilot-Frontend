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

/** 请求层使用的反馈出口，由应用入口接到全局 Toast。 */
export interface ApiFeedbackNotifier {
  error(message: string): void
  success(message: string): void
}

/** 请求生命周期钩子用于隔离认证和离线状态等应用级副作用。 */
export interface ApiClientHooks {
  markServerOnline?(): void
  onForbidden?(error: ApiRequestError): void
  reportConnectionFailure?(reason: 'network-error' | 'timeout'): void
}

/** 创建内部数据客户端与插件原始协议客户端时所需的配置。 */
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

/** 仅返回后端在成功 HTTP 响应中声明的业务失败消息。 */
export function getApiBusinessErrorMessage(error: unknown): string | undefined {
  if (!(error instanceof ApiRequestError) || !error.businessFailure) return undefined
  const payload = error.payload
  if (!payload || typeof payload !== 'object') return undefined
  const message = (payload as { message?: unknown }).message
  return typeof message === 'string' && message.trim() ? message : undefined
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

/** 将 Axios 连接错误归类为全局服务探测可识别的原因。 */
export function resolveConnectionFailureReason(error: AxiosError): 'network-error' | 'timeout' | null {
  if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') return 'timeout'
  if (error.code === 'NETWORK_ERROR' || error.code === 'ERR_NETWORK' || error.name === 'NetworkError') {
    return 'network-error'
  }
  return null
}

/** 创建普通数据客户端和保持插件 ABI 的原始 envelope 客户端。 */
export function createApiClients(options: CreateApiClientsOptions = {}): {
  api: DataApiClient
  pluginApi: AxiosInstance
} {
  const { hooks, notifier, resolveFallbackMessage, setupInstance, ...axiosConfig } = options
  const api = axios.create(axiosConfig)
  const pluginApi = axios.create(axiosConfig)

  // 优化器等底层拦截器必须先安装，确保它们在业务数据解包前仍能看到完整 AxiosResponse。
  setupInstance?.(api)
  setupInstance?.(pluginApi)
  installResponseInterceptors(api, 'data', hooks, notifier, resolveFallbackMessage)
  installResponseInterceptors(pluginApi, 'envelope', hooks, notifier, resolveFallbackMessage)

  return {
    api: api as DataApiClient,
    pluginApi,
  }
}

/** 为客户端安装统一的可达性、反馈、解包和错误标准化处理。 */
function installResponseInterceptors(
  instance: AxiosInstance,
  responseMode: 'data' | 'envelope',
  hooks?: ApiClientHooks,
  notifier?: ApiFeedbackNotifier,
  resolveFallbackMessage?: ApiFallbackMessageResolver,
) {
  instance.interceptors.response.use(
    response => {
      hooks?.markServerOnline?.()

      if (isBinarySuccess(response)) return response.data

      const payload: unknown = response.data
      if (!isApiResponse(payload)) {
        if (responseMode === 'envelope') return payload
        const error = new ApiRequestError(resolveFallback('invalid-envelope', resolveFallbackMessage), {
          code: AxiosError.ERR_BAD_RESPONSE,
          config: response.config,
          payload,
          request: response.request,
          response,
        })
        notifyFailure(response.config.feedback, notifier, error.message)
        return Promise.reject(error)
      }

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
      if (response) hooks?.markServerOnline?.()

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
      if (!response && !requestConfig?.skipConnectionTracking && failureReason) {
        hooks?.reportConnectionFailure?.(failureReason)
      }
      if (response?.status === 403) hooks?.onForbidden?.(error)

      notifyFailure(requestConfig?.feedback, notifier, error.message)
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
function notifyFailure(mode: ApiFeedbackMode | undefined, notifier: ApiFeedbackNotifier | undefined, message: string) {
  if (mode !== 'silent' && message) notifier?.error(message)
}

/** all 模式用于显式要求请求层展示后端成功消息。 */
function notifySuccess(mode: ApiFeedbackMode | undefined, notifier: ApiFeedbackNotifier | undefined, message: string) {
  if (mode === 'all' && message) notifier?.success(message)
}
