import type { PluginSidebarNavItem } from '@/api/types'
import { usePluginSidebarNavStore } from '@/stores/pluginSidebarNav'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const apiMocks = vi.hoisted(() => ({
  get: vi.fn(),
}))

vi.mock('@/api', () => ({
  default: createDataApiMock({
    get: apiMocks.get,
  }),
}))

function createNavItem(overrides: Partial<PluginSidebarNavItem> = {}): PluginSidebarNavItem {
  return {
    icon: 'mdi-puzzle-outline',
    nav_key: 'main',
    order: 1,
    plugin_id: 'demo',
    section: 'system',
    title: 'Demo',
    ...overrides,
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })

  return { promise, reject, resolve }
}

describe('plugin sidebar navigation store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    apiMocks.get.mockReset()
  })

  it('shares one request between concurrent callers and caches an empty successful snapshot', async () => {
    const response = deferred<PluginSidebarNavItem[]>()
    apiMocks.get.mockReturnValueOnce(response.promise)
    const store = usePluginSidebarNavStore()

    const first = store.ensureSidebarNav()
    const second = store.ensureSidebarNav()

    expect(apiMocks.get).toHaveBeenCalledTimes(1)
    expect(apiMocks.get).toHaveBeenCalledWith('plugin/sidebar_nav')

    response.resolve([])
    await Promise.all([first, second])

    expect(store.items).toEqual([])
    expect(store.loaded).toBe(true)
    expect(store.inflight).toBeNull()

    await store.ensureSidebarNav()
    expect(apiMocks.get).toHaveBeenCalledTimes(1)
  })

  it('permanently ignores a response from before reset when a new generation is loading', async () => {
    const staleResponse = deferred<PluginSidebarNavItem[]>()
    const currentResponse = deferred<PluginSidebarNavItem[]>()
    apiMocks.get.mockReturnValueOnce(staleResponse.promise).mockReturnValueOnce(currentResponse.promise)
    const store = usePluginSidebarNavStore()

    const staleRequest = store.ensureSidebarNav()
    store.reset()
    const currentRequest = store.ensureSidebarNav()

    expect(apiMocks.get).toHaveBeenCalledTimes(2)

    staleResponse.resolve([createNavItem({ plugin_id: 'stale', title: 'Stale' })])
    await staleRequest
    expect(store.items).toEqual([])
    expect(store.loaded).toBe(false)

    currentResponse.resolve([createNavItem({ plugin_id: 'current', title: 'Current' })])
    await currentRequest
    expect(store.items.map(item => item.plugin_id)).toEqual(['current'])
    expect(store.loaded).toBe(true)
  })

  it('does not retry an old failure after reset interrupts its retry delay', async () => {
    vi.useFakeTimers()
    const staleResponse = deferred<PluginSidebarNavItem[]>()
    const currentResponse = deferred<PluginSidebarNavItem[]>()
    apiMocks.get.mockReturnValueOnce(staleResponse.promise).mockReturnValueOnce(currentResponse.promise)
    const store = usePluginSidebarNavStore()

    const staleRequest = store.ensureSidebarNav()
    staleResponse.reject(new Error('stale request'))
    await vi.advanceTimersByTimeAsync(0)

    store.reset()
    const currentRequest = store.ensureSidebarNav()

    await vi.advanceTimersByTimeAsync(500)
    await staleRequest
    expect(apiMocks.get).toHaveBeenCalledTimes(2)

    currentResponse.resolve([createNavItem({ plugin_id: 'current', title: 'Current' })])
    await currentRequest

    expect(store.items.map(item => item.plugin_id)).toEqual(['current'])
    expect(store.loaded).toBe(true)
  })

  it('starts a new generation when force refresh overlaps an older inflight request', async () => {
    const staleResponse = deferred<PluginSidebarNavItem[]>()
    const forcedResponse = deferred<PluginSidebarNavItem[]>()
    apiMocks.get.mockReturnValueOnce(staleResponse.promise).mockReturnValueOnce(forcedResponse.promise)
    const store = usePluginSidebarNavStore()

    const staleRequest = store.ensureSidebarNav()
    const forcedRequest = store.ensureSidebarNav(true)

    expect(apiMocks.get).toHaveBeenCalledTimes(2)

    forcedResponse.resolve([createNavItem({ plugin_id: 'fresh', title: 'Fresh' })])
    await forcedRequest
    staleResponse.resolve([createNavItem({ plugin_id: 'stale', title: 'Stale' })])
    await staleRequest

    expect(store.items.map(item => item.plugin_id)).toEqual(['fresh'])
    expect(store.loaded).toBe(true)
    expect(store.inflight).toBeNull()
  })

  it('preserves the last successful snapshot after force failure and remains retryable', async () => {
    const previous = [createNavItem({ plugin_id: 'previous', title: 'Previous' })]
    apiMocks.get.mockResolvedValueOnce(previous)
    const store = usePluginSidebarNavStore()
    await store.ensureSidebarNav()

    vi.useFakeTimers()
    apiMocks.get.mockRejectedValueOnce(new Error('temporary')).mockRejectedValueOnce(new Error('still unavailable'))
    const failedRefresh = store.ensureSidebarNav(true)
    await vi.advanceTimersByTimeAsync(500)
    await failedRefresh

    expect(store.items).toEqual(previous)
    expect(store.loaded).toBe(true)
    expect(store.inflight).toBeNull()

    const recovered = [createNavItem({ plugin_id: 'recovered', title: 'Recovered' })]
    apiMocks.get.mockResolvedValueOnce(recovered)
    await store.ensureSidebarNav(true)

    expect(store.items).toEqual(recovered)
    expect(store.loaded).toBe(true)
  })

  it('does not cache an initial HTTP failure and retries on a later ensure', async () => {
    vi.useFakeTimers()
    apiMocks.get.mockRejectedValueOnce(new Error('temporary')).mockRejectedValueOnce(new Error('still unavailable'))
    const store = usePluginSidebarNavStore()

    const failedRequest = store.ensureSidebarNav()
    await vi.advanceTimersByTimeAsync(500)
    await failedRequest

    expect(store.items).toEqual([])
    expect(store.loaded).toBe(false)
    expect(store.inflight).toBeNull()

    apiMocks.get.mockResolvedValueOnce([createNavItem({ plugin_id: 'retry' })])
    await store.ensureSidebarNav()
    expect(apiMocks.get).toHaveBeenCalledTimes(3)
    expect(store.items.map(item => item.plugin_id)).toEqual(['retry'])
  })
})
