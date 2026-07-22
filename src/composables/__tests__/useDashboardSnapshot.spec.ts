import { useDashboardSnapshot } from '@/composables/useDashboardSnapshot'
import { useUserStore } from '@/stores'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('dashboard snapshot', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-22T00:00:00Z'))
    localStorage.clear()
    setActivePinia(createPinia())
    useUserStore().userID = 7
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('expires a snapshot after 24 hours', () => {
    const snapshot = useDashboardSnapshot<string>('test-card-v1')
    snapshot.writeSnapshot('value')

    vi.advanceTimersByTime(24 * 60 * 60 * 1000)
    expect(snapshot.readSnapshot()?.value).toBe('value')

    vi.advanceTimersByTime(1)
    expect(snapshot.readSnapshot()).toBeUndefined()
  })

  it('isolates snapshots by login user', () => {
    const user7Snapshot = useDashboardSnapshot<string>('test-card-v1')
    user7Snapshot.writeSnapshot('user-7')

    useUserStore().userID = 8
    const user8Snapshot = useDashboardSnapshot<string>('test-card-v1')
    expect(user8Snapshot.readSnapshot()).toBeUndefined()
    user8Snapshot.writeSnapshot('user-8')

    expect(user7Snapshot.readSnapshot()?.value).toBe('user-7')
    expect(user8Snapshot.readSnapshot()?.value).toBe('user-8')
  })

  it('keeps a late write bound to the user that created the snapshot instance', () => {
    const user7Snapshot = useDashboardSnapshot<string>('test-card-v1')

    useUserStore().userID = 8
    const user8Snapshot = useDashboardSnapshot<string>('test-card-v1')
    user7Snapshot.writeSnapshot('late-user-7')

    expect(user8Snapshot.readSnapshot()).toBeUndefined()
    expect(user7Snapshot.readSnapshot()?.value).toBe('late-user-7')
  })
})
