import {
  BACKGROUND_ROTATION_GRACE_MS,
  createBackgroundCandidateOrderResolver,
  findFirstAvailableBackground,
  preloadBackgroundRotationImages,
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

describe('createBackgroundCandidateOrderResolver', () => {
  it('shuffles a source list without mutating the backend response', () => {
    const urls = ['one.jpg', 'two.jpg', 'three.jpg']
    const resolveOrder = createBackgroundCandidateOrderResolver(() => 0)

    expect(resolveOrder(urls)).toEqual(['two.jpg', 'three.jpg', 'one.jpg'])
    expect(urls).toEqual(['one.jpg', 'two.jpg', 'three.jpg'])
  })

  it('keeps the same order across retries and reshuffles only after the source list changes', () => {
    const random = vi.fn().mockReturnValueOnce(0).mockReturnValueOnce(0).mockReturnValueOnce(0.5)
    const resolveOrder = createBackgroundCandidateOrderResolver(random)
    const firstOrder = resolveOrder(['one.jpg', 'two.jpg', 'three.jpg'])

    expect(resolveOrder(['one.jpg', 'two.jpg', 'three.jpg'])).toEqual(firstOrder)
    expect(random).toHaveBeenCalledTimes(2)
    expect(resolveOrder(['one.jpg', 'two.jpg'])).toEqual(['one.jpg', 'two.jpg'])
    expect(random).toHaveBeenCalledTimes(3)
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

describe('findFirstAvailableBackground', () => {
  it('skips invalid entries without changing the original sequence', async () => {
    const preload = vi.fn(async (url: string) => url === 'two.jpg')

    await expect(
      findFirstAvailableBackground({
        urls: ['one.jpg', 'two.jpg', 'three.jpg'],
        canContinue: () => true,
        preload,
      }),
    ).resolves.toBe(1)
    expect(preload.mock.calls.map(([url]) => url)).toEqual(['one.jpg', 'two.jpg'])
  })

  it('drops an obsolete batch before trying another image', async () => {
    const pending = deferred<boolean>()
    let current = true
    const preload = vi.fn(() => pending.promise)
    const result = findFirstAvailableBackground({
      urls: ['one.jpg', 'two.jpg'],
      canContinue: () => current,
      preload,
    })

    current = false
    pending.resolve(true)

    await expect(result).resolves.toBeNull()
    expect(preload).toHaveBeenCalledOnce()
  })
})
