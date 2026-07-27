import { vi } from 'vitest'

vi.mock('colorthief', () => ({
  default: class ColorThief {},
}))

import { preloadCorsImage } from '@/@core/utils/image'
import { afterEach, describe, expect, it } from 'vitest'

describe('preloadCorsImage', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('uses a CORS-clean cached response without reloading it', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      blob: vi.fn().mockResolvedValue(new Blob(['image'])),
      ok: true,
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(preloadCorsImage('https://image.example/wallpaper.jpg')).resolves.toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith(
      new URL('https://image.example/wallpaper.jpg'),
      expect.objectContaining({ cache: 'force-cache', credentials: 'omit', mode: 'cors' }),
    )
  })

  it('reloads a response when an earlier non-CORS cache entry blocks the first request', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce({
        blob: vi.fn().mockResolvedValue(new Blob(['image'])),
        ok: true,
      })
    vi.stubGlobal('fetch', fetchMock)

    await expect(preloadCorsImage('/wallpaper.jpg')).resolves.toBe(true)
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      new URL('/wallpaper.jpg', window.location.href),
      expect.objectContaining({ cache: 'reload', credentials: 'same-origin', mode: 'cors' }),
    )
  })

  it('returns false when the source cannot be read with CORS', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

    await expect(preloadCorsImage('https://image.example/wallpaper.jpg')).resolves.toBe(false)
  })
})
