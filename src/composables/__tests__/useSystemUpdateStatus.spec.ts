import type { SystemUpdateStatus } from '@/api/types'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
}))

vi.mock('@/api', () => ({
  default: {
    get: (...args: unknown[]) => mocks.get(...args),
  },
}))

function updateStatus(state: SystemUpdateStatus['state']): SystemUpdateStatus {
  return {
    state,
    current_version: 'v3.0.0',
    version: null,
    frontend_version: null,
    downloaded_bytes: state === 'ready' ? 20 : 5,
    total_bytes: 20,
    progress: state === 'ready' ? 100 : 25,
    can_update: state === 'available',
    can_install: state === 'ready',
    updates: [
      {
        type: 'resources',
        state,
        version: '10',
        auth_version: '3.0.3',
        indexer_version: '3.0.8',
        downloaded_bytes: state === 'ready' ? 20 : 5,
        total_bytes: 20,
        progress: state === 'ready' ? 100 : 25,
        can_update: state === 'available',
        can_install: state === 'ready',
      },
    ],
  }
}

describe('useSystemUpdateStatus', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.resetModules()
    mocks.get.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('switches to active polling after a resource download starts and exposes ready state', async () => {
    mocks.get.mockResolvedValueOnce(updateStatus('available')).mockResolvedValueOnce(updateStatus('ready'))
    const { useSystemUpdateStatus } = await import('@/composables/useSystemUpdateStatus')
    const updates = useSystemUpdateStatus()

    updates.startPolling()
    await vi.waitFor(() => expect(mocks.get).toHaveBeenCalledOnce())

    updates.setStatus(updateStatus('downloading'))
    expect(updates.status.value?.updates?.[0].state).toBe('downloading')

    await vi.advanceTimersByTimeAsync(2999)
    expect(mocks.get).toHaveBeenCalledOnce()
    await vi.advanceTimersByTimeAsync(1)

    expect(mocks.get).toHaveBeenCalledTimes(2)
    expect(updates.status.value?.updates?.[0].state).toBe('ready')
    updates.stopPolling()
  })
})
