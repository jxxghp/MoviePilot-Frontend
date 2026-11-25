import type { PluginAPI, PluginRequestOptions } from '@/sdk/plugin'
import { PluginBridgeError, type PluginHostBridgeClient } from './bridgeClient'
import type { BridgeApiRequestPayload } from './types'

export interface BridgeScopedApi extends PluginAPI {
  <T = unknown>(config: BridgeRequestConfig | string): Promise<T>
  request<T = unknown>(config: BridgeRequestConfig): Promise<T>
  postForm<T = unknown>(url: string, data?: unknown, options?: PluginRequestOptions): Promise<T>
  putForm<T = unknown>(url: string, data?: unknown, options?: PluginRequestOptions): Promise<T>
  patchForm<T = unknown>(url: string, data?: unknown, options?: PluginRequestOptions): Promise<T>
}

export interface BridgeRequestConfig extends PluginRequestOptions {
  url?: string
  method?: string
  data?: unknown
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** 规范化相对或同源 API 路径为 `/api/v1/...`，并执行虚拟实例命名空间改写。 */
export function normalizeScopedApiPath(rawUrl: string, instanceId?: string, sourcePluginId?: string): string {
  let path = rawUrl.trim()
  if (!path) throw new PluginBridgeError('API path cannot be empty', { code: 'INVALID_PATH' })

  if (/^https?:\/\//i.test(path) || path.startsWith('//')) {
    const parsed = new URL(path, window.location.origin)
    if (parsed.origin !== window.location.origin) {
      throw new PluginBridgeError('Cross-origin API request rejected', { code: 'FORBIDDEN_ORIGIN' })
    }
    path = `${parsed.pathname}${parsed.search}`
  }

  if (path.startsWith('/api/v1/')) {
    // already normalized
  } else if (path.startsWith('api/v1/')) {
    path = `/${path}`
  } else if (path.startsWith('/')) {
    path = path.startsWith('/api/') ? path : `/api/v1${path}`
  } else {
    path = `/api/v1/${path}`
  }

  if (path.includes('..')) {
    throw new PluginBridgeError('Path traversal rejected', { code: 'INVALID_PATH' })
  }

  if (instanceId && sourcePluginId && instanceId !== sourcePluginId) {
    const pattern = new RegExp(`(^|/)plugin/${escapeRegExp(sourcePluginId)}(?=/|[?#]|$)`, 'i')
    path = path.replace(pattern, `$1plugin/${instanceId}`)
  }

  return path
}

async function encodeBody(data: unknown): Promise<{
  body?: unknown
  bodyEncoding?: BridgeApiRequestPayload['bodyEncoding']
}> {
  if (data === undefined || data === null) return {}

  if (typeof FormData !== 'undefined' && data instanceof FormData) {
    const parts: Array<{
      name: string
      value?: string
      filename?: string
      contentType?: string
      base64?: string
    }> = []
    for (const [name, value] of data.entries()) {
      if (typeof value === 'string') {
        parts.push({ name, value })
      } else {
        const buf = await value.arrayBuffer()
        parts.push({
          name,
          filename: value.name || 'file',
          contentType: value.type || 'application/octet-stream',
          base64: arrayBufferToBase64(buf),
        })
      }
    }
    return { body: parts, bodyEncoding: 'multipart' }
  }

  if (typeof URLSearchParams !== 'undefined' && data instanceof URLSearchParams) {
    return { body: data.toString(), bodyEncoding: 'text' }
  }

  if (typeof Blob !== 'undefined' && data instanceof Blob) {
    const buf = await data.arrayBuffer()
    return { body: arrayBufferToBase64(buf), bodyEncoding: 'base64' }
  }

  if (data instanceof ArrayBuffer) {
    return { body: arrayBufferToBase64(data), bodyEncoding: 'base64' }
  }

  if (ArrayBuffer.isView(data)) {
    const view = new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
    return { body: uint8ToBase64(view), bodyEncoding: 'base64' }
  }

  if (typeof data === 'string') {
    return { body: data, bodyEncoding: 'text' }
  }

  return { body: data, bodyEncoding: 'json' }
}

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const slice = bytes.subarray(i, Math.min(i + chunkSize, bytes.length))
    binary += String.fromCharCode(...slice)
  }
  return btoa(binary)
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  return uint8ToBase64(new Uint8Array(buffer))
}

function base64ToUint8(encoded: string): Uint8Array {
  const binary = atob(encoded)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    out[i] = binary.charCodeAt(i)
  }
  return out
}

function decodeResponsePayload(
  data: { body?: unknown; bodyEncoding?: string; headers?: Record<string, string> },
  responseType?: PluginRequestOptions['responseType'],
): unknown {
  if (responseType === 'arraybuffer' && typeof data.body === 'string' && data.bodyEncoding === 'base64') {
    return base64ToUint8(data.body).buffer
  }
  if (responseType === 'blob' && typeof data.body === 'string' && data.bodyEncoding === 'base64') {
    const contentType = data.headers?.['content-type'] || data.headers?.['Content-Type'] || 'application/octet-stream'
    return new Blob([base64ToUint8(data.body)], { type: contentType })
  }
  if (responseType === 'text') {
    if (typeof data.body === 'string') return data.body
    return data.body === undefined || data.body === null ? '' : JSON.stringify(data.body)
  }
  return data.body
}

/**
 * 构造走 Native Bridge (`api.request`) 的实例作用域 API 客户端。
 * 兼容 axios/PluginAPI 调用方式，不在 WebView 内持有任何 Bearer Token。
 */
export function createBridgeScopedApi(
  bridge: PluginHostBridgeClient,
  getScope: () => { pluginId: string; sourcePluginId?: string },
): BridgeScopedApi {
  const dispatch = async <T = unknown>(config: BridgeRequestConfig): Promise<T> => {
    const scope = getScope()
    const method = (config.method || 'GET').toUpperCase()
    const path = normalizeScopedApiPath(config.url || '', scope.pluginId, scope.sourcePluginId)
    const encoded = await encodeBody(config.data)

    const headers: Record<string, string> = { ...(config.headers || {}) }
    if (typeof URLSearchParams !== 'undefined' && config.data instanceof URLSearchParams && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/x-www-form-urlencoded; charset=utf-8'
    }

    const response = await bridge.requestApi(
      {
        method,
        path,
        query: config.params,
        headers,
        body: encoded.body,
        bodyEncoding: encoded.bodyEncoding,
        responseType: config.responseType || 'json',
        timeoutMs: config.timeout,
      },
      config.signal,
    )

    if (response.status >= 400) {
      const errBody = response.body as { detail?: string; message?: string } | undefined
      const msg = errBody?.detail || errBody?.message || `HTTP ${response.status}`
      if (config.feedback !== 'silent') {
        bridge.toast('error', msg)
      }
      throw new PluginBridgeError(msg, { status: response.status, data: response.body })
    }

    return decodeResponsePayload(response, config.responseType) as T
  }

  const callable = ((configOrUrl: BridgeRequestConfig | string) => {
    if (typeof configOrUrl === 'string') {
      return dispatch({ url: configOrUrl, method: 'GET' })
    }
    return dispatch(configOrUrl)
  }) as BridgeScopedApi

  callable.request = config => dispatch(config)
  callable.get = (url, options) => dispatch({ ...options, url, method: 'GET' })
  callable.delete = (url, options) => dispatch({ ...options, url, method: 'DELETE' })
  callable.head = (url, options) => dispatch({ ...options, url, method: 'HEAD' })
  callable.options = (url, options) => dispatch({ ...options, url, method: 'OPTIONS' })
  callable.post = (url, data, options) => dispatch({ ...options, url, data, method: 'POST' })
  callable.put = (url, data, options) => dispatch({ ...options, url, data, method: 'PUT' })
  callable.patch = (url, data, options) => dispatch({ ...options, url, data, method: 'PATCH' })
  callable.postForm = (url, data, options) => dispatch({ ...options, url, data, method: 'POST' })
  callable.putForm = (url, data, options) => dispatch({ ...options, url, data, method: 'PUT' })
  callable.patchForm = (url, data, options) => dispatch({ ...options, url, data, method: 'PATCH' })

  return callable
}

let fetchShimInstalled = false

/**
 * 安装轻量 fetch 同源垫片：若存量插件绕过 props.api 直接调用 fetch('/api/v1/...')，
 * 自动将其转发至 Native Bridge (`api.request`)，避免 401/CORS 与 POST body 丢失。
 */
export function installSameOriginApiFetchShim(
  bridge: PluginHostBridgeClient,
  getScope: () => { pluginId: string; sourcePluginId?: string },
): void {
  if (fetchShimInstalled || typeof window === 'undefined' || typeof window.fetch !== 'function') return
  fetchShimInstalled = true

  const nativeFetch = window.fetch.bind(window)
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const rawUrl = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
    let parsed: URL
    try {
      parsed = new URL(rawUrl, window.location.href)
    } catch {
      return nativeFetch(input, init)
    }

    const isSameOriginApi =
      parsed.origin === window.location.origin && parsed.pathname.startsWith('/api/v1/')
    if (!isSameOriginApi) {
      return nativeFetch(input, init)
    }

    const method = (init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase()
    const scope = getScope()
    const normalizedPath = normalizeScopedApiPath(
      `${parsed.pathname}${parsed.search}`,
      scope.pluginId,
      scope.sourcePluginId,
    )

    const headers: Record<string, string> = {}
    const rawHeaders = init?.headers ?? (input instanceof Request ? input.headers : undefined)
    if (rawHeaders instanceof Headers) {
      rawHeaders.forEach((value, key) => {
        headers[key] = value
      })
    } else if (Array.isArray(rawHeaders)) {
      for (const [key, value] of rawHeaders) {
        headers[key] = value
      }
    } else if (rawHeaders && typeof rawHeaders === 'object') {
      for (const [key, value] of Object.entries(rawHeaders)) {
        if (typeof value === 'string') headers[key] = value
      }
    }

    let bodyInput: unknown = init?.body
    if (bodyInput === undefined && input instanceof Request && method !== 'GET' && method !== 'HEAD') {
      try {
        bodyInput = await input.clone().text()
      } catch {
        bodyInput = undefined
      }
    }
    const encoded = await encodeBody(bodyInput)

    const result = await bridge.requestApi(
      {
        method,
        path: normalizedPath,
        headers,
        body: encoded.body,
        bodyEncoding: encoded.bodyEncoding,
        responseType: 'text',
      },
      init?.signal ?? undefined,
    )

    const responseHeaders = new Headers(result.headers || {})
    let payload: BodyInit | null = null
    if (result.body !== undefined && result.body !== null) {
      if (result.bodyEncoding === 'base64' && typeof result.body === 'string') {
        payload = base64ToUint8(result.body)
      } else if (typeof result.body === 'string') {
        payload = result.body
      } else {
        payload = JSON.stringify(result.body)
        if (!responseHeaders.has('content-type')) {
          responseHeaders.set('content-type', 'application/json; charset=utf-8')
        }
      }
    }
    return new Response(payload, { status: result.status || 200, headers: responseHeaders })
  }
}
