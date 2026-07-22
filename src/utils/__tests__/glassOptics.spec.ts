import {
  canUseGlassWallpaperTexture,
  getGlassCoverScale,
  getGlassOpticalBufferSize,
  getGlassOpticalRenderProfile,
  normalizeGlassOpticalRect,
  selectGlassOpticalRects,
  type GlassOpticalRect,
} from '@/utils/glassOptics'
import { describe, expect, it } from 'vitest'

describe('glass optics geometry', () => {
  it('caps the renderer buffer independently from device pixel ratio', () => {
    expect(getGlassOpticalBufferSize(3456, 2234, false)).toEqual({ height: 621, width: 960 })
    expect(getGlassOpticalBufferSize(390, 844, true)).toEqual({ height: 720, width: 333 })
    expect(getGlassOpticalBufferSize(3456, 2234, false, 'high')).toEqual({ height: 931, width: 1440 })
    expect(getGlassOpticalBufferSize(390, 844, true, 'high')).toEqual({ height: 844, width: 390 })
  })

  it('matches cover cropping on wide and tall images', () => {
    expect(getGlassCoverScale(1600, 900, 2400, 1600)).toEqual({ x: 1, y: 0.84375 })
    expect(getGlassCoverScale(900, 1600, 2400, 1600)).toEqual({ x: 0.375, y: 1 })
  })

  it('keeps high quality optics while reducing the media-dense recommendation budget', () => {
    expect(getGlassOpticalRenderProfile('high', '/dashboard')).toEqual({
      bufferQuality: 'high',
      textureLimit: 3072,
      textureSource: 'wallpaper',
    })
    expect(getGlassOpticalRenderProfile('high', '/recommend?source=tmdb')).toEqual({
      bufferQuality: 'balanced',
      textureLimit: 2048,
      textureSource: 'wallpaper',
    })
    expect(getGlassOpticalRenderProfile('balanced', '/dashboard')).toEqual({
      bufferQuality: 'balanced',
      textureLimit: 2048,
      textureSource: 'wallpaper',
    })
    expect(getGlassOpticalRenderProfile('high', '/login')).toEqual({
      bufferQuality: 'high',
      textureLimit: 3072,
      textureSource: 'auto',
    })
  })

  it('only uploads browser-readable login wallpapers to WebGL', () => {
    const documentUrl = 'https://moviepilot.example/login'

    expect(canUseGlassWallpaperTexture('/api/v1/login/wallpaper/0', documentUrl)).toBe(true)
    expect(canUseGlassWallpaperTexture('https://moviepilot.example/assets/login.jpg', documentUrl)).toBe(true)
    expect(canUseGlassWallpaperTexture('blob:https://moviepilot.example/texture', documentUrl)).toBe(true)
    expect(canUseGlassWallpaperTexture('data:image/png;base64,AA==', documentUrl)).toBe(true)
    expect(canUseGlassWallpaperTexture('https://image.tmdb.org/t/p/original/poster.jpg', documentUrl)).toBe(false)
    expect(canUseGlassWallpaperTexture('', documentUrl)).toBe(false)
  })

  it('keeps high-value outer surfaces and removes nested repeats', () => {
    const candidates: GlassOpticalRect[] = [
      { height: 900, radius: 0, rank: 2, width: 260, x: 0, y: 0 },
      { height: 300, radius: 16, rank: 4, width: 500, x: 300, y: 100 },
      { height: 100, radius: 12, rank: 5, width: 200, x: 320, y: 120 },
      { height: 120, radius: 12, rank: 1, width: 400, x: 500, y: 700 },
    ]

    const selected = selectGlassOpticalRects(candidates, 1440, 900, false)

    expect(selected).toHaveLength(3)
    expect(selected.map(rect => rect.rank)).toEqual([1, 2, 4])
  })

  it('keeps original geometry while using the viewport intersection for visibility', () => {
    const selected = selectGlassOpticalRects(
      [{ height: 160, radius: 20, rank: 1, width: 180, x: -30, y: -40 }],
      320,
      240,
      false,
    )

    expect(selected).toEqual([{ height: 160, radius: 20, rank: 1, width: 180, x: -30, y: -40 }])
  })

  it('budgets partially visible surfaces by their visible pixels', () => {
    const selected = selectGlassOpticalRects(
      [
        { height: 1000, radius: 20, rank: 1, width: 1000, x: -950, y: -900 },
        { height: 120, radius: 16, rank: 2, width: 200, x: 80, y: 80 },
      ],
      320,
      240,
      false,
    )

    expect(selected.map(rect => rect.rank)).toEqual([1, 2])
  })

  it('converts DOM top-origin rectangles while preserving pixel radius', () => {
    expect(
      normalizeGlassOpticalRect({ height: 100, radius: 20, rank: 1, width: 200, x: 100, y: 50 }, 1000, 500),
    ).toEqual({ radius: 20, rect: [0.1, 0.7, 0.2, 0.2] })

    expect(
      normalizeGlassOpticalRect({ height: 100, radius: 80, rank: 1, width: 200, x: -20, y: 50 }, 1000, 500),
    ).toEqual({ radius: 50, rect: [-0.02, 0.7, 0.2, 0.2] })
  })
})
