import {
  BACKGROUND_ROTATION_GRACE_MS,
  commitPreloadedBackgroundRotation,
  preloadBackgroundRotationImages,
  preloadBackgroundSequence,
  shouldAllowBackgroundRotation,
} from '@/utils/backgroundRotation'
import { describe, expect, it, vi } from 'vitest'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(promiseResolve => {
    resolve = promiseResolve
  })

  return { promise, resolve }
}

describe('background rotation lifecycle', () => {
  it('keeps wallpaper rotation independent from paused interaction effects during the bounded grace period', () => {
    expect(BACKGROUND_ROTATION_GRACE_MS).toBe(60_000)
    expect(shouldAllowBackgroundRotation('active', false, false)).toBe(true)
    expect(shouldAllowBackgroundRotation('passive', true, false)).toBe(true)
    expect(shouldAllowBackgroundRotation('suspended', true, false)).toBe(true)
    expect(shouldAllowBackgroundRotation('passive', false, false)).toBe(false)
    expect(shouldAllowBackgroundRotation('idle', false, false)).toBe(false)
    expect(shouldAllowBackgroundRotation('active', false, true)).toBe(false)
  })
})

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

describe('preloadBackgroundSequence', () => {
  it('preloads remaining wallpapers sequentially in rotation order', async () => {
    const calls: string[] = []

    await expect(
      preloadBackgroundSequence({
        canContinue: () => true,
        preload: async url => {
          calls.push(url)
          return url !== 'two.jpg'
        },
        urls: ['one.jpg', 'two.jpg', 'three.jpg'],
      }),
    ).resolves.toEqual([true, false, true])
    expect(calls).toEqual(['one.jpg', 'two.jpg', 'three.jpg'])
  })

  it('stops an obsolete queue before starting the next image', async () => {
    let active = true
    const calls: string[] = []

    await preloadBackgroundSequence({
      canContinue: () => active,
      preload: async url => {
        calls.push(url)
        active = false
        return true
      },
      urls: ['one.jpg', 'two.jpg'],
    })

    expect(calls).toEqual(['one.jpg'])
  })
})
