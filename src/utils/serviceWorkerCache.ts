import type { WorkboxPlugin } from 'workbox-core'

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
