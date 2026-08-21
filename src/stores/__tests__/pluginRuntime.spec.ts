import type { PluginRuntimeSummary } from '@/api/types'
import { usePluginRuntimeStore } from '@/stores/pluginRuntime'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const apiMocks = vi.hoisted(() => ({
  get: vi.fn(),
}))

vi.mock('@/api', () => ({
  default: createDataApiMock({
    get: apiMocks.get,
  }),
}))

function createSummary(overrides: Partial<PluginRuntimeSummary> = {}): PluginRuntimeSummary {
  return {
    failed_count: 0,
    generation: 1,
    pending_count: 0,
    ready: true,
    ...overrides,
  }
}

describe('plugin runtime store', () => {
  let store: ReturnType<typeof usePluginRuntimeStore>

  beforeEach(() => {
    setActivePinia(createPinia())
    apiMocks.get.mockReset()
    store = usePluginRuntimeStore()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    store.stop()
    vi.useRealTimers()
  })

  it('reconciles the first snapshot and each later generation exactly once', async () => {
    apiMocks.get
      .mockResolvedValueOnce(createSummary({ generation: 4 }))
      .mockResolvedValueOnce(createSummary({ generation: 4 }))
      .mockResolvedValueOnce(createSummary({ generation: 5 }))

    await store.refresh()
    expect(store.reconciliation).toBe(1)
    expect(store.summary?.generation).toBe(4)

    await store.refresh()
    expect(store.reconciliation).toBe(1)

    await store.refresh()
    expect(store.reconciliation).toBe(2)
    expect(store.summary?.generation).toBe(5)
  })

  it('does not let an older backend generation replace the current snapshot', async () => {
    apiMocks.get
      .mockResolvedValueOnce(createSummary({ generation: 8, ready: true }))
      .mockResolvedValueOnce(createSummary({ generation: 7, pending_count: 1, ready: false }))

    await store.refresh()
    await store.refresh()

    expect(store.summary).toEqual(createSummary({ generation: 8, ready: true }))
    expect(store.reconciliation).toBe(1)
  })

  it('polls pending runtime state quickly and settled state at a lower frequency', async () => {
    vi.useFakeTimers()
    apiMocks.get
      .mockResolvedValueOnce(createSummary({ generation: 1, pending_count: 1, ready: false }))
      .mockResolvedValueOnce(createSummary({ generation: 2, ready: true }))
      .mockResolvedValueOnce(createSummary({ generation: 2, ready: true }))

    store.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(apiMocks.get).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(2000)
    expect(apiMocks.get).toHaveBeenCalledTimes(2)

    await vi.advanceTimersByTimeAsync(14999)
    expect(apiMocks.get).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(1)
    expect(apiMocks.get).toHaveBeenCalledTimes(3)
  })

  it('invalidates a pending response when the authenticated layout stops', async () => {
    let resolveSummary!: (summary: PluginRuntimeSummary) => void
    apiMocks.get.mockReturnValueOnce(
      new Promise<PluginRuntimeSummary>(resolve => {
        resolveSummary = resolve
      }),
    )

    store.start()
    store.stop()
    resolveSummary(createSummary({ generation: 9 }))
    await Promise.resolve()
    await Promise.resolve()

    expect(store.summary).toBeNull()
    expect(store.reconciliation).toBe(0)
  })
})
