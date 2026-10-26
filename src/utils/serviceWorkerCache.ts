import type { WorkboxPlugin } from 'workbox-core'

/** 识别原生榜单的专用 no-store 标记；业务 API 现统一走 NetworkOnly，不以此标记授予缓存权限。 */
export function bypassNativeApiCache(request: Pick<Request, 'headers'>): boolean {
  return (
    request.headers.get('X-MoviePilot-Native') === '1' &&
    (request.headers.get('Cache-Control') ?? '').split(',').some(value => value.trim().toLowerCase() === 'no-store')
  )
}

/**
 * 插件联邦静态文件由后端版本参数和 HTTP 缓存策略管理，不能进入应用脚本的 SWR 缓存。
 */
export function shouldCacheStaticResource(request: Pick<Request, 'destination'>, url: Pick<URL, 'pathname'>): boolean {
  return ['style', 'script', 'worker'].includes(request.destination) && !url.pathname.includes('/api/v1/plugin/file/')
}

/**
 * CORS 请求不得采用 opaque 响应，否则浏览器无法读取其内容。
 * 普通 no-cors 请求仍保留 opaque 缓存能力；缓存未命中时继续交给策略决定网络或离线回退。
 */
export function selectCorsSafeCachedResponse(
  request: Request,
  cachedResponse: Response | undefined,
): Response | undefined {
  if (request.mode === 'cors' && cachedResponse?.type === 'opaque') return undefined

  return cachedResponse
}

/** 在 Workbox 采用缓存前执行响应的 CORS 可读性边界。 */
export const corsSafeCachePlugin: WorkboxPlugin = {
  async cachedResponseWillBeUsed({ cachedResponse, request }) {
    return selectCorsSafeCachedResponse(request, cachedResponse)
  },
}

/**
 * 保留旧缓存插件的 JSON 格式校验合同；当前 Worker 不再为业务 API 启用运行时缓存。
 *
 * API 缓存的消费方要求 JSON envelope；SPA 回退页等 HTML 或损坏体一旦被写入，
 * NetworkFirst 超时回退时会以 200 返回坏体，前端 envelope 校验失败后逐条弹
 * “服务器返回了无效响应”（仅清浏览器缓存可解）。写入前校验 Content-Type
 * 可以从源头阻断非 JSON 响应进入缓存。
 */
export function shouldCacheJsonResponse(response: Response): boolean {
  return (response.headers.get('content-type') ?? '').includes('json')
}

/** API 缓存专用：只写入声明为 JSON 的响应，HTML、图片等一律不落缓存。 */
export const jsonOnlyCachePlugin: WorkboxPlugin = {
  async cacheWillUpdate({ response }) {
    return shouldCacheJsonResponse(response) ? response : null
  },
}
