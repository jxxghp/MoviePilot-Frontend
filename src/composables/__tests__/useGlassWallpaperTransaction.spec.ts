import { effectScope } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useGlassWallpaperTransaction } from '@/composables/useGlassWallpaperTransaction'

afterEach(() => {
  vi.useRealTimers()
})

describe('useGlassWallpaperTransaction', () => {
  it('retains the request after prepared and retires it only after active', async () => {
    const scope = effectScope()
    const transaction = scope.run(() => useGlassWallpaperTransaction<number>())!
    const prepared = transaction.requestPreparation('/next.jpg')
    const revision = transaction.requestedRevision.value

    expect(transaction.acknowledgePrepared('/next.jpg', revision)).toBe(true)
    await expect(prepared).resolves.toBe(true)
    expect(transaction.requestedUrl.value).toBe('/next.jpg')
    expect(transaction.requestedRevision.value).toBe(revision)

    const activated = transaction.requestActivation(4)
    const result = transaction.acknowledgeActivated('/next.jpg', revision, 420)

    expect(result).toEqual({ payload: 4, startedAt: 420 })
    await expect(activated).resolves.toBe(true)
    expect(transaction.requestedUrl.value).toBe('')
    expect(transaction.requestedRevision.value).toBe(0)
    scope.stop()
  })

  it('ignores late prepared and active acknowledgements after a newer request', async () => {
    const scope = effectScope()
    const transaction = scope.run(() => useGlassWallpaperTransaction<number>())!
    const firstPrepared = transaction.requestPreparation('/a.jpg')
    const firstRevision = transaction.requestedRevision.value
    const secondPrepared = transaction.requestPreparation('/b.jpg')
    const secondRevision = transaction.requestedRevision.value

    await expect(firstPrepared).resolves.toBe(false)
    expect(transaction.acknowledgePrepared('/a.jpg', firstRevision)).toBe(false)
    expect(transaction.acknowledgeActivated('/a.jpg', firstRevision, 100)).toBeNull()
    expect(transaction.requestedUrl.value).toBe('/b.jpg')

    expect(transaction.acknowledgePrepared('/b.jpg', secondRevision)).toBe(true)
    await expect(secondPrepared).resolves.toBe(true)
    scope.stop()
  })

  it('uses revision rather than URL identity for consecutive requests of the same wallpaper', async () => {
    const scope = effectScope()
    const transaction = scope.run(() => useGlassWallpaperTransaction<number>())!
    const firstPrepared = transaction.requestPreparation('/same.jpg')
    const firstRevision = transaction.requestedRevision.value
    const secondPrepared = transaction.requestPreparation('/same.jpg')
    const secondRevision = transaction.requestedRevision.value

    await expect(firstPrepared).resolves.toBe(false)
    expect(secondRevision).toBeGreaterThan(firstRevision)
    expect(transaction.acknowledgePrepared('/same.jpg', firstRevision)).toBe(false)
    expect(transaction.acknowledgePrepared('/same.jpg', secondRevision)).toBe(true)
    await expect(secondPrepared).resolves.toBe(true)
    scope.stop()
  })

  it('cancels both waits on timeout and rejects a same-tick late acknowledgement', async () => {
    vi.useFakeTimers()
    const scope = effectScope()
    const transaction = scope.run(() => useGlassWallpaperTransaction<number>(50))!
    const prepared = transaction.requestPreparation('/next.jpg')
    const revision = transaction.requestedRevision.value

    await vi.advanceTimersByTimeAsync(50)

    await expect(prepared).resolves.toBe(false)
    expect(transaction.acknowledgePrepared('/next.jpg', revision)).toBe(false)
    expect(transaction.acknowledgeActivated('/next.jpg', revision, 50)).toBeNull()
    expect(transaction.requestedUrl.value).toBe('')
    scope.stop()
  })

  it('cancels an activation wait without treating prepared as active', async () => {
    const scope = effectScope()
    const transaction = scope.run(() => useGlassWallpaperTransaction<number>())!
    const prepared = transaction.requestPreparation('/next.jpg')
    const revision = transaction.requestedRevision.value

    transaction.acknowledgePrepared('/next.jpg', revision)
    await expect(prepared).resolves.toBe(true)
    const activated = transaction.requestActivation(2)

    expect(transaction.cancel(revision)).toBe(true)
    await expect(activated).resolves.toBe(false)
    expect(transaction.acknowledgeActivated('/next.jpg', revision, 100)).toBeNull()
    scope.stop()
  })

  it('keeps one deadline across prepared and activation instead of retaining GPU bundles indefinitely', async () => {
    vi.useFakeTimers()
    const scope = effectScope()
    const transaction = scope.run(() => useGlassWallpaperTransaction<number>(50))!
    const prepared = transaction.requestPreparation('/next.jpg')
    const revision = transaction.requestedRevision.value

    await vi.advanceTimersByTimeAsync(20)
    expect(transaction.acknowledgePrepared('/next.jpg', revision)).toBe(true)
    await expect(prepared).resolves.toBe(true)
    expect(transaction.requestedRevision.value).toBe(revision)

    await vi.advanceTimersByTimeAsync(30)

    expect(transaction.requestedUrl.value).toBe('')
    expect(transaction.requestedRevision.value).toBe(0)
    expect(await transaction.requestActivation(3, revision)).toBe(false)
    scope.stop()
  })

  it('rejects activation for a stale revision without replacing the current transaction payload', async () => {
    const scope = effectScope()
    const transaction = scope.run(() => useGlassWallpaperTransaction<number>())!
    const prepared = transaction.requestPreparation('/next.jpg')
    const revision = transaction.requestedRevision.value

    expect(await transaction.requestActivation(3, revision + 1)).toBe(false)
    expect(transaction.acknowledgePrepared('/next.jpg', revision)).toBe(true)
    await expect(prepared).resolves.toBe(true)
    const activated = transaction.requestActivation(4, revision)
    expect(transaction.acknowledgeActivated('/next.jpg', revision, 120)).toEqual({
      payload: 4,
      startedAt: 120,
    })
    await expect(activated).resolves.toBe(true)
    scope.stop()
  })
})
