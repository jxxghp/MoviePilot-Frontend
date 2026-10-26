import { getSharedData, invalidateSharedData } from '@/utils/sharedDataCache'
import { beforeEach, describe, expect, it, vi } from 'vitest'

describe('shared read snapshots', () => {
  beforeEach(() => invalidateSharedData())

  it('shares concurrent reads and returns independent editable snapshots', async () => {
    const loader = vi.fn(async () => ({ sites: [{ id: 1 }] }))
    const [first, second] = await Promise.all([
      getSharedData('configuration:test', loader),
      getSharedData('configuration:test', loader),
    ])
    first.sites[0].id = 99
    expect(second.sites[0].id).toBe(1)
    expect((await getSharedData('configuration:test', loader)).sites[0].id).toBe(1)
    expect(loader).toHaveBeenCalledOnce()
  })

  it('retries failures and refreshes successful values after thirty seconds', async () => {
    vi.useFakeTimers()
    const loader = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ value: 1 })
    await expect(getSharedData('configuration:test', loader)).rejects.toThrow('offline')
    await expect(getSharedData('configuration:test', loader)).resolves.toEqual({ value: 1 })
    await vi.advanceTimersByTimeAsync(30_000)
    await getSharedData('configuration:test', loader)
    expect(loader).toHaveBeenCalledTimes(3)
  })

  it('rejects an old response after a session or mutation invalidates its snapshot', async () => {
    let resolve!: (value: { secret: string }) => void
    const request = getSharedData(
      'configuration:session',
      () =>
        new Promise<{ secret: string }>(done => {
          resolve = done
        }),
    )
    const assertion = expect(request).rejects.toMatchObject({ code: 'ERR_CANCELED' })
    invalidateSharedData()
    const current = await getSharedData('configuration:session', async () => ({ secret: 'new-account' }))
    resolve({ secret: 'old-account' })
    await assertion
    expect(current.secret).toBe('new-account')
    await expect(getSharedData('configuration:session', vi.fn())).resolves.toEqual(current)
  })

  it('refreshes an explicit read immediately while coalescing simultaneous panel refreshes', async () => {
    const loader = vi.fn(async () => ({ value: 1 }))
    await getSharedData('configuration:refresh', loader)
    loader.mockResolvedValue({ value: 2 })
    const values = await Promise.all([
      getSharedData('configuration:refresh', loader, undefined, true),
      getSharedData('configuration:refresh', loader, undefined, true),
    ])
    expect(values).toEqual([{ value: 2 }, { value: 2 }])
    expect(loader).toHaveBeenCalledTimes(2)
  })

  it('keeps configuration reads available when a subscription change invalidates media status', async () => {
    const loader = vi.fn(async () => ({ value: 1 }))
    const reading = getSharedData('configuration:env', loader)
    await getSharedData('media-status:movie', loader)
    invalidateSharedData('media-status')
    await expect(reading).resolves.toEqual({ value: 1 })
    await getSharedData('configuration:env', loader)
    expect(loader).toHaveBeenCalledTimes(2)
    await getSharedData('media-status:movie', loader)
    expect(loader).toHaveBeenCalledTimes(3)
  })
})
