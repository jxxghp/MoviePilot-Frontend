import { describe, expect, it } from 'vitest'

import {
  corsSafeCachePlugin,
  jsonOnlyCachePlugin,
  selectCorsSafeCachedResponse,
  shouldCacheJsonResponse,
} from '../serviceWorkerCache'

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
