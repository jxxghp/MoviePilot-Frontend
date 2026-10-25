import { describe, expect, it } from 'vitest'

import {
  bypassNativeApiCache,
  corsSafeCachePlugin,
  jsonOnlyCachePlugin,
  selectCorsSafeCachedResponse,
  shouldCacheStaticResource,
  shouldCacheJsonResponse,
} from '../serviceWorkerCache'

describe('App 短时内存缓存的 SW 边界', () => {
  it.each([
    [{}, false],
    [{ 'X-MoviePilot-Native': '1' }, false],
    [{ 'Cache-Control': 'no-store' }, false],
    [{ 'X-MoviePilot-Native': '0', 'Cache-Control': 'no-store' }, false],
    [{ 'X-MoviePilot-Native': '1', 'Cache-Control': 'no-cache' }, false],
    [{ 'X-MoviePilot-Native': '1', 'Cache-Control': 'no-store' }, true],
    [{ 'X-MoviePilot-Native': '1', 'Cache-Control': 'max-age=0, NO-STORE' }, true],
  ])('仅完整专用请求标记跳过落盘缓存 %#', (headers, expected) => {
    expect(
      bypassNativeApiCache(
        new Request('https://moviepilot/api/v1/recommend/tmdb_trending', { headers: headers as HeadersInit }),
      ),
    ).toBe(expected)
  })
})

function createResponse(type: ResponseType) {
  const response = new Response('image')
  Object.defineProperty(response, 'type', { value: type })
  return response
}

describe('Service Worker cache CORS boundary', () => {
  it('rejects an opaque cache entry for a CORS image request', () => {
    const request = new Request('https://image.example/wallpaper.jpg', { mode: 'cors' })
    const cachedResponse = createResponse('opaque')

    expect(selectCorsSafeCachedResponse(request, cachedResponse)).toBeUndefined()
  })

  it('keeps a CORS-clean cache entry for a CORS image request', () => {
    const request = new Request('https://image.example/wallpaper.jpg', { mode: 'cors' })
    const cachedResponse = createResponse('cors')

    expect(selectCorsSafeCachedResponse(request, cachedResponse)).toBe(cachedResponse)
  })

  it('keeps an opaque cache entry for an ordinary no-cors image request', () => {
    const request = new Request('https://image.example/poster.jpg', { mode: 'no-cors' })
    const cachedResponse = createResponse('opaque')

    expect(selectCorsSafeCachedResponse(request, cachedResponse)).toBe(cachedResponse)
  })

  it('returns a cache miss unchanged so CacheFirst can use its network and offline policy', () => {
    const request = new Request('https://image.example/wallpaper.jpg', { mode: 'cors' })

    expect(selectCorsSafeCachedResponse(request, undefined)).toBeUndefined()
  })

  it('exposes the boundary through the Workbox cached response lifecycle', async () => {
    const request = new Request('https://image.example/wallpaper.jpg', { mode: 'cors' })
    const cachedResponse = createResponse('opaque')

    await expect(
      corsSafeCachePlugin.cachedResponseWillBeUsed?.({
        cacheName: 'image-cache',
        cachedResponse,
        event: new Event('fetch') as ExtendableEvent,
        matchOptions: {},
        request,
      }),
    ).resolves.toBeUndefined()
  })
})

describe('Service Worker API cache JSON boundary', () => {
  function createJsonResponse(contentType: string) {
    return new Response('{"success":true,"message":"","data":null}', {
      headers: { 'content-type': contentType },
    })
  }

  it('accepts a standard JSON API response', () => {
    expect(shouldCacheJsonResponse(createJsonResponse('application/json; charset=utf-8'))).toBe(true)
  })

  it('rejects an HTML response that would break the envelope contract', () => {
    const html = new Response('<html><body>offline shell</body></html>', {
      headers: { 'content-type': 'text/html; charset=utf-8' },
    })

    expect(shouldCacheJsonResponse(html)).toBe(false)
  })

  it('rejects a binary response such as an image or blob', () => {
    const image = new Response(new Blob(['\x89PNG']), { headers: { 'content-type': 'image/png' } })

    expect(shouldCacheJsonResponse(image)).toBe(false)
  })

  it('exposes the boundary through the Workbox cache update lifecycle', async () => {
    const response = createJsonResponse('application/json')

    await expect(
      jsonOnlyCachePlugin.cacheWillUpdate?.({
        event: new Event('fetch') as ExtendableEvent,
        request: new Request('https://moviepilot/api/v1/resource'),
        response,
      }),
    ).resolves.toBe(response)
  })

  it('skips caching a non-JSON response through the Workbox lifecycle', async () => {
    const response = new Response('<html></html>', { headers: { 'content-type': 'text/html' } })

    await expect(
      jsonOnlyCachePlugin.cacheWillUpdate?.({
        event: new Event('fetch') as ExtendableEvent,
        request: new Request('https://moviepilot/api/v1/resource'),
        response,
      }),
    ).resolves.toBeNull()
  })
})

describe('Service Worker static resource routing', () => {
  it.each([
    ['script', true],
    ['style', true],
    ['worker', true],
  ] as const)('caches ordinary %s resources', (destination, expected) => {
    expect(shouldCacheStaticResource({ destination }, new URL('https://moviepilot.example/assets/app.js'))).toBe(
      expected,
    )
  })

  it('bypasses the application SWR cache for plugin federation files', () => {
    expect(
      shouldCacheStaticResource(
        { destination: 'script' },
        new URL('https://moviepilot.example/api/v1/plugin/file/demo/dist/assets/remoteEntry.js?v=1.2.3'),
      ),
    ).toBe(false)
  })
})
