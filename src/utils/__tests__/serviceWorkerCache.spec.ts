import { describe, expect, it } from 'vitest'

import { corsSafeCachePlugin, selectCorsSafeCachedResponse } from '../serviceWorkerCache'

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
