import { afterEach, describe, expect, it, vi } from 'vitest'

type RouteContext = { request: Request; url: URL }
type StrategyOptions = { cacheName?: string; fetchOptions?: RequestInit }
type Strategy = { options: StrategyOptions }
type LifecycleEvent = { waitUntil: (promise: Promise<unknown>) => void }
const state = vi.hoisted(() => ({
  routes: [] as Array<{ match: (context: RouteContext) => boolean; strategy: Strategy }>,
  listeners: {} as Record<string, (event: LifecycleEvent) => void>,
}))
vi.mock('workbox-precaching', () => ({ cleanupOutdatedCaches: vi.fn(), precacheAndRoute: vi.fn() }))
vi.mock('workbox-routing', () => ({
  registerRoute: (match: (context: RouteContext) => boolean, strategy: Strategy) =>
    state.routes.push({ match, strategy }),
  setCatchHandler: vi.fn(),
}))
vi.mock('workbox-strategies', () => {
  class Strategy {
    options: StrategyOptions
    constructor(options: StrategyOptions) {
      this.options = options
    }
  }
  return {
    CacheFirst: class extends Strategy {},
    NetworkFirst: class extends Strategy {},
    NetworkOnly: class extends Strategy {},
    StaleWhileRevalidate: class extends Strategy {},
  }
})
vi.mock('workbox-expiration', () => ({ ExpirationPlugin: class {} }))
vi.mock('workbox-cacheable-response', () => ({ CacheableResponsePlugin: class {} }))
vi.mock('workbox-navigation-preload', () => ({ enable: vi.fn() }))

async function loadWorker() {
  state.routes = []
  state.listeners = {}
  vi.stubGlobal('self', {
    __WB_MANIFEST: [],
    addEventListener: (event: string, listener: (event: LifecycleEvent) => void) => {
      state.listeners[event] = listener
    },
    skipWaiting: vi.fn(),
    clients: { claim: vi.fn() },
    location: { origin: 'https://moviepilot.test' },
  })
  vi.resetModules()
  await import('@/service-worker')
}

afterEach(() => vi.unstubAllGlobals())

describe('Service Worker private API boundary', () => {
  it.each(['site/', 'user/current', 'recommend/tmdb_trending', 'storage/avatars/private.png'])(
    'never reads or writes URL-only runtime caches for %s',
    async path => {
      await loadWorker()
      const request = new Request(`https://moviepilot.test/api/v1/${path}`, {
        headers: { Authorization: 'Bearer account-b' },
      })
      if (path.endsWith('.png')) Object.defineProperty(request, 'destination', { value: 'image' })
      const route = state.routes.find(({ match }) => match({ request, url: new URL(request.url) }))
      expect(route?.strategy.constructor.name).toBe('NetworkOnly')
      expect(route?.strategy.options.fetchOptions?.cache).toBe('no-store')
    },
  )

  it('deletes even a current-version legacy API cache during activation while preserving static caches', async () => {
    await loadWorker()
    const currentApiCache = state.routes
      .find(route => route.strategy.options.cacheName?.startsWith('app-shell-'))!
      .strategy.options.cacheName!.replace('app-shell-', 'api-cache-')
    const deleteCache = vi.fn(async (name: string) => Boolean(name))
    vi.stubGlobal('caches', {
      keys: async () => ['api-cache-old', currentApiCache, 'image-cache-V2', 'unrelated-cache'],
      delete: deleteCache,
    })
    let completed!: Promise<unknown>
    state.listeners.activate({
      waitUntil: (promise: Promise<unknown>) => {
        completed = promise
      },
    })
    await completed
    expect(deleteCache.mock.calls.map(([name]) => name)).toEqual(
      expect.arrayContaining(['api-cache-old', currentApiCache]),
    )
    expect(deleteCache).not.toHaveBeenCalledWith('image-cache-V2')
    expect(deleteCache).not.toHaveBeenCalledWith('unrelated-cache')
  })
})
