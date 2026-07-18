import { useAuthStore } from '@/stores/auth'
import {
  getCachedMediaExistsStatus,
  getCachedMediaSubscribeStatus,
  setCachedMediaExistsStatus,
  setCachedMediaSubscribeStatus,
} from '@/utils/mediaStatusCache'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

let keySequence = 0

function nextKey(label: string) {
  keySequence += 1
  return `${label}:${keySequence}`
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

describe('media status cache', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-18T00:00:00Z'))
  })

  it('isolates exists and subscribe values by cache and key within the TTL', async () => {
    const sharedKey = nextKey('isolated')
    const otherKey = nextKey('other')
    const existsLoader = vi.fn().mockResolvedValue(true)
    const subscribeLoader = vi.fn().mockResolvedValue(false)
    const otherLoader = vi.fn().mockResolvedValue(true)

    await expect(getCachedMediaExistsStatus(sharedKey, existsLoader)).resolves.toBe(true)
    await expect(getCachedMediaSubscribeStatus(sharedKey, subscribeLoader)).resolves.toBe(false)
    await expect(getCachedMediaSubscribeStatus(otherKey, otherLoader)).resolves.toBe(true)

    await expect(getCachedMediaExistsStatus(sharedKey, vi.fn().mockResolvedValue(false))).resolves.toBe(true)
    await expect(getCachedMediaSubscribeStatus(sharedKey, vi.fn().mockResolvedValue(true))).resolves.toBe(false)
    expect(existsLoader).toHaveBeenCalledOnce()
    expect(subscribeLoader).toHaveBeenCalledOnce()
    expect(otherLoader).toHaveBeenCalledOnce()
  })

  it('coalesces concurrent requests and retries after a rejected loader', async () => {
    const key = nextKey('concurrent')
    const first = deferred<boolean>()
    const loader = vi.fn().mockReturnValue(first.promise)

    const requestA = getCachedMediaExistsStatus(key, loader)
    const requestB = getCachedMediaExistsStatus(key, loader)
    expect(loader).toHaveBeenCalledOnce()

    first.reject(new Error('temporary failure'))
    await expect(requestA).rejects.toThrow('temporary failure')
    await expect(requestB).rejects.toThrow('temporary failure')

    const retryLoader = vi.fn().mockResolvedValue(true)
    await expect(getCachedMediaExistsStatus(key, retryLoader)).resolves.toBe(true)
    expect(retryLoader).toHaveBeenCalledOnce()
  })

  it('reloads expired values and lets explicit values replace cached values', async () => {
    const existsKey = nextKey('expired')
    const subscribeKey = nextKey('explicit')

    await expect(getCachedMediaExistsStatus(existsKey, vi.fn().mockResolvedValue(false))).resolves.toBe(false)
    vi.advanceTimersByTime(3 * 60 * 1000)
    const expiredLoader = vi.fn().mockResolvedValue(true)
    await expect(getCachedMediaExistsStatus(existsKey, expiredLoader)).resolves.toBe(true)

    setCachedMediaExistsStatus(existsKey, false)
    await expect(getCachedMediaExistsStatus(existsKey, vi.fn().mockResolvedValue(true))).resolves.toBe(false)
    setCachedMediaSubscribeStatus(subscribeKey, true)
    await expect(getCachedMediaSubscribeStatus(subscribeKey, vi.fn().mockResolvedValue(false))).resolves.toBe(true)
  })

  it('keeps an explicit mutation result when an older status request resolves later', async () => {
    const key = nextKey('mutation-race')
    const staleRequest = deferred<boolean>()
    const pendingStatus = getCachedMediaSubscribeStatus(key, () => staleRequest.promise)

    setCachedMediaSubscribeStatus(key, true)
    staleRequest.resolve(false)

    await expect(pendingStatus).resolves.toBe(true)
    await expect(getCachedMediaSubscribeStatus(key, vi.fn().mockResolvedValue(false))).resolves.toBe(true)
  })

  it('keeps an explicit mutation result after its cache TTL when an older request resolves', async () => {
    const key = nextKey('expired-mutation-race')
    const staleRequest = deferred<boolean>()
    const pendingStatus = getCachedMediaSubscribeStatus(key, () => staleRequest.promise)

    setCachedMediaSubscribeStatus(key, false)
    vi.advanceTimersByTime(3 * 60 * 1000)
    staleRequest.resolve(true)

    await expect(pendingStatus).resolves.toBe(false)
    await expect(getCachedMediaSubscribeStatus(key, vi.fn().mockResolvedValue(true))).resolves.toBe(true)
  })

  it('reloads a completed subscription value after logout and login', async () => {
    const key = nextKey('completed-session')
    const authStore = useAuthStore()

    authStore.login({ token: 'account-a', remember: false })
    await expect(getCachedMediaSubscribeStatus(key, vi.fn().mockResolvedValue(true))).resolves.toBe(true)

    authStore.logout()
    authStore.login({ token: 'account-b', remember: false })
    const accountBLoader = vi.fn().mockResolvedValue(false)

    await expect(getCachedMediaSubscribeStatus(key, accountBLoader)).resolves.toBe(false)
    expect(accountBLoader).toHaveBeenCalledOnce()
    await expect(getCachedMediaSubscribeStatus(key, vi.fn().mockResolvedValue(true))).resolves.toBe(false)
  })

  it('does not reuse a previous account subscription request or value after logout and login', async () => {
    const key = nextKey('session')
    const oldAccountRequest = deferred<boolean>()
    const newAccountRequest = deferred<boolean>()
    const authStore = useAuthStore()

    authStore.login({ token: 'account-a', remember: false })
    const accountAStatus = getCachedMediaSubscribeStatus(key, () => oldAccountRequest.promise)

    authStore.logout()
    authStore.login({ token: 'account-b', remember: false })
    const accountBLoader = vi.fn().mockReturnValue(newAccountRequest.promise)
    const accountBStatus = getCachedMediaSubscribeStatus(key, accountBLoader)
    let accountASettled = false
    void accountAStatus.then(() => {
      accountASettled = true
    })

    oldAccountRequest.resolve(true)
    await Promise.resolve()
    await Promise.resolve()

    expect(accountASettled).toBe(false)
    const repeatedAccountBStatus = getCachedMediaSubscribeStatus(key, accountBLoader)
    expect(accountBLoader).toHaveBeenCalledOnce()

    newAccountRequest.resolve(false)

    await expect(accountAStatus).resolves.toBe(false)
    await expect(accountBStatus).resolves.toBe(false)
    await expect(repeatedAccountBStatus).resolves.toBe(false)
    expect(accountBLoader).toHaveBeenCalledOnce()
    await expect(getCachedMediaSubscribeStatus(key, vi.fn().mockResolvedValue(true))).resolves.toBe(false)
  })
})
