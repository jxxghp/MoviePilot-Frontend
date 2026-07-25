import { commitPreloadedBackgroundRotation, preloadBackgroundRotationImages } from '@/utils/backgroundRotation'
import { describe, expect, it, vi } from 'vitest'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(promiseResolve => {
    resolve = promiseResolve
  })

  return { promise, resolve }
}

describe('commitPreloadedBackgroundRotation', () => {
  it('drops a successful preload when the rotation becomes inactive before completion', async () => {
    const preload = deferred<boolean>()
    const commit = vi.fn()
    let active = true
    const result = commitPreloadedBackgroundRotation({
      canCommit: () => active,
      commit,
      preload: () => preload.promise,
    })

    active = false
    preload.resolve(true)

    await expect(result).resolves.toBe(false)
    expect(commit).not.toHaveBeenCalled()
  })

  it('commits a successful preload while the request remains current', async () => {
    const commit = vi.fn()

    await expect(
      commitPreloadedBackgroundRotation({
        canCommit: () => true,
        commit,
        preload: async () => true,
      }),
    ).resolves.toBe(true)
    expect(commit).toHaveBeenCalledOnce()
  })

  it('drops an obsolete preload even when decorative motion becomes active again', async () => {
    const preload = deferred<boolean>()
    const commit = vi.fn()
    const requestVersion = 1
    let currentVersion = requestVersion
    const result = commitPreloadedBackgroundRotation({
      canCommit: () => requestVersion === currentVersion,
      commit,
      preload: () => preload.promise,
    })

    currentVersion += 1
    preload.resolve(true)

    await expect(result).resolves.toBe(false)
    expect(commit).not.toHaveBeenCalled()
  })
})

describe('preloadBackgroundRotationImages', () => {
  it('does not let an unused optical texture block the visible wallpaper', async () => {
    const preload = vi.fn(async (url: string) => url === 'display.jpg')

    await expect(
      preloadBackgroundRotationImages({
        displayUrl: 'display.jpg',
        preload,
      }),
    ).resolves.toBe(true)
    expect(preload).toHaveBeenCalledOnce()
    expect(preload).toHaveBeenCalledWith('display.jpg')
  })

  it('requires both textures when the optical renderer consumes the derived wallpaper', async () => {
    const preload = vi.fn(async (url: string) => url === 'display.jpg')

    await expect(
      preloadBackgroundRotationImages({
        displayUrl: 'display.jpg',
        opticalUrl: 'optical.jpg',
        preload,
      }),
    ).resolves.toBe(false)
    expect(preload).toHaveBeenCalledTimes(2)
  })
})
