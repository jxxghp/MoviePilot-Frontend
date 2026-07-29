import {
  DEFAULT_GLASS_WALLPAPER_TONE_PROFILE,
  getGlassWallpaperToneProfile,
  loadGlassWallpaperTone,
  takeGlassWallpaperDecodedSource,
} from '@/utils/glassWallpaperTone'
import { afterEach, describe, expect, it, vi } from 'vitest'

describe('glass wallpaper tone profile', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('keeps a representative mid-tone wallpaper near neutral exposure', () => {
    const profile = getGlassWallpaperToneProfile([0.18, 0.3, 0.36, 0.4, 0.52, 0.72, 0.82])

    expect(profile.medianLuminance).toBeCloseTo(0.4)
    expect(profile.highlightLuminance).toBeCloseTo(0.72)
    expect(profile.exposure).toBeGreaterThan(0.98)
    expect(profile.exposure).toBeLessThan(1.04)
  })

  it('uses bounded compensation without erasing bright and dark wallpaper character', () => {
    const dark = getGlassWallpaperToneProfile([0.01, 0.03, 0.06, 0.1, 0.14, 0.22, 0.32])
    const bright = getGlassWallpaperToneProfile([0.42, 0.58, 0.7, 0.78, 0.86, 0.94, 1])

    expect(dark.exposure).toBe(1.14)
    expect(bright.exposure).toBeGreaterThanOrEqual(0.88)
    expect(bright.exposure).toBeLessThan(0.92)
    expect(dark.exposure).toBeGreaterThan(bright.exposure)
  })

  it('uses the highlight percentile to lower exposure for locally overbright wallpapers', () => {
    const controlled = getGlassWallpaperToneProfile([0.2, 0.28, 0.34, 0.38, 0.42, 0.5, 0.58])
    const highlighted = getGlassWallpaperToneProfile([0.2, 0.28, 0.34, 0.38, 0.42, 0.95, 1])

    expect(highlighted.medianLuminance).toBe(controlled.medianLuminance)
    expect(highlighted.exposure).toBeLessThan(controlled.exposure)
  })

  it('falls back to the neutral profile when no valid samples exist', () => {
    expect(getGlassWallpaperToneProfile([Number.NaN])).toEqual(DEFAULT_GLASS_WALLPAPER_TONE_PROFILE)
  })

  it('reuses the successful CORS image decode for readiness and tone analysis', async () => {
    const pixels = new Uint8ClampedArray(64 * 64 * 4)
    for (let offset = 0; offset < pixels.length; offset += 4) {
      pixels[offset] = 128
      pixels[offset + 1] = 128
      pixels[offset + 2] = 128
      pixels[offset + 3] = 255
    }
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage: vi.fn(),
      getImageData: vi.fn(() => ({ data: pixels })),
    } as unknown as CanvasRenderingContext2D)
    const fetchMock = vi.fn()
    let imageCount = 0
    class SuccessfulImage {
      crossOrigin = ''
      decoding = ''
      height = 64
      naturalHeight = 64
      naturalWidth = 64
      onerror: (() => void) | null = null
      onload: (() => void) | null = null
      width = 64

      set src(_value: string) {
        imageCount += 1
        queueMicrotask(() => this.onload?.())
      }
    }
    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal('Image', SuccessfulImage)

    const result = await loadGlassWallpaperTone('https://image.example/success.jpg')

    expect(result.corsReady).toBe(true)
    expect(result.profile.medianLuminance).toBeCloseTo(128 / 255)
    expect(imageCount).toBe(1)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(takeGlassWallpaperDecodedSource('https://image.example/success.jpg')?.profile).toEqual(result.profile)
    expect(takeGlassWallpaperDecodedSource('https://image.example/success.jpg')).toBeUndefined()
  })

  it('repairs a polluted browser cache before retrying the CORS image decode', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage: vi.fn(),
      getImageData: vi.fn(() => ({ data: new Uint8ClampedArray([128, 128, 128, 255]) })),
    } as unknown as CanvasRenderingContext2D)
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce({
        blob: vi.fn().mockResolvedValue(new Blob(['image'])),
        ok: true,
      })
    let imageCount = 0
    class RecoverableImage {
      crossOrigin = ''
      decoding = ''
      height = 64
      naturalHeight = 64
      naturalWidth = 64
      onerror: (() => void) | null = null
      onload: (() => void) | null = null
      width = 64

      set src(_value: string) {
        imageCount += 1
        const succeeds = imageCount > 1
        queueMicrotask(() => (succeeds ? this.onload?.() : this.onerror?.()))
      }
    }
    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal('Image', RecoverableImage)

    const result = await loadGlassWallpaperTone('https://image.example/recovered.jpg')

    expect(result.corsReady).toBe(true)
    expect(imageCount).toBe(2)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock).toHaveBeenLastCalledWith(
      new URL('https://image.example/recovered.jpg'),
      expect.objectContaining({ cache: 'reload', credentials: 'omit', mode: 'cors' }),
    )
  })

  it('retries a transiently failed CORS decode instead of caching the fallback', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage: vi.fn(),
      getImageData: vi.fn(() => ({ data: new Uint8ClampedArray([128, 128, 128, 255]) })),
    } as unknown as CanvasRenderingContext2D)
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        blob: vi.fn().mockResolvedValue(new Blob()),
        ok: false,
      }),
    )
    let imageCount = 0
    class TransientImage {
      crossOrigin = ''
      decoding = ''
      height = 64
      naturalHeight = 64
      naturalWidth = 64
      onerror: (() => void) | null = null
      onload: (() => void) | null = null
      width = 64

      set src(_value: string) {
        imageCount += 1
        queueMicrotask(() => (imageCount === 1 ? this.onerror?.() : this.onload?.()))
      }
    }
    vi.stubGlobal('Image', TransientImage)

    const failed = await loadGlassWallpaperTone('https://image.example/transient.jpg')
    const recovered = await loadGlassWallpaperTone('https://image.example/transient.jpg')

    expect(failed.corsReady).toBe(false)
    expect(recovered.corsReady).toBe(true)
    expect(imageCount).toBe(2)
  })
})
