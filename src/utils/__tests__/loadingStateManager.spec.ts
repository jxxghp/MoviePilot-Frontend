import { PWALoadingStateManager } from '@/utils/loadingStateManager'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('loading state deadline', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())
  it('settles without recurring polls or retained listeners when work never finishes', async () => {
    const manager = new PWALoadingStateManager()
    manager.setLoadingState('pending', true)
    const remove = vi.spyOn(manager, 'removeListener')
    const wait = manager.waitForAllComplete(1200)
    await vi.advanceTimersByTimeAsync(1200)
    await wait
    expect(manager.isAnyLoading()).toBe(true)
    expect(remove).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
  })
  it('cleans the deadline as soon as all real tasks finish', async () => {
    const manager = new PWALoadingStateManager()
    manager.setLoadingState('pending', true)
    const wait = manager.waitForAllComplete(1200)
    manager.setLoadingState('pending', false)
    await wait
    expect(vi.getTimerCount()).toBe(0)
  })
})
