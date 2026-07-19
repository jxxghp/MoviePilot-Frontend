import { getCachedSiteIcon } from '@/utils/siteIconCache'
import { beforeEach, describe, expect, it, vi } from 'vitest'

let keySeed = 0

function nextKey() {
  keySeed += 1
  return `site-icon-${keySeed}`
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

describe('site icon cache', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-19T00:00:00Z'))
  })

  it('isolates site ids and reuses each value within the TTL', async () => {
    const firstLoader = vi.fn().mockResolvedValue('first-icon')
    const secondLoader = vi.fn().mockResolvedValue('second-icon')
    const firstKey = nextKey()
    const secondKey = nextKey()

    await expect(getCachedSiteIcon(firstKey, firstLoader)).resolves.toBe('first-icon')
    await expect(getCachedSiteIcon(secondKey, secondLoader)).resolves.toBe('second-icon')
    await expect(getCachedSiteIcon(firstKey, vi.fn().mockResolvedValue('stale'))).resolves.toBe('first-icon')

    expect(firstLoader).toHaveBeenCalledOnce()
    expect(secondLoader).toHaveBeenCalledOnce()
  })

  it('coalesces concurrent requests for the same site', async () => {
    const pending = deferred<string>()
    const loader = vi.fn().mockReturnValue(pending.promise)
    const key = nextKey()

    const firstRequest = getCachedSiteIcon(key, loader)
    const secondRequest = getCachedSiteIcon(key, loader)
    expect(loader).toHaveBeenCalledOnce()

    pending.resolve('shared-icon')
    await expect(firstRequest).resolves.toBe('shared-icon')
    await expect(secondRequest).resolves.toBe('shared-icon')
  })

  it('reloads an expired value after ten minutes', async () => {
    const key = nextKey()
    await expect(getCachedSiteIcon(key, vi.fn().mockResolvedValue('old-icon'))).resolves.toBe('old-icon')

    vi.advanceTimersByTime(10 * 60 * 1000)
    const refreshedLoader = vi.fn().mockResolvedValue('fresh-icon')

    await expect(getCachedSiteIcon(key, refreshedLoader)).resolves.toBe('fresh-icon')
    expect(refreshedLoader).toHaveBeenCalledOnce()
  })

  it('allows a retry after the loader rejects', async () => {
    const key = nextKey()
    await expect(getCachedSiteIcon(key, vi.fn().mockRejectedValue(new Error('temporary failure')))).rejects.toThrow(
      'temporary failure',
    )

    const retryLoader = vi.fn().mockResolvedValue('recovered-icon')
    await expect(getCachedSiteIcon(key, retryLoader)).resolves.toBe('recovered-icon')
    expect(retryLoader).toHaveBeenCalledOnce()
  })
})
