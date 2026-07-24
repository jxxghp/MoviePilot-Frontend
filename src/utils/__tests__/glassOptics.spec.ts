import {
  canUseGlassWallpaperTexture,
  getGlassCoverScale,
  getGlassOpticalDecay,
  getGlassOpticalBufferSize,
  getGlassOpticalMotionEnergy,
  getGlassOpticalRenderProfile,
  normalizeGlassOpticalRect,
  selectGlassOpticalRects,
  type GlassOpticalRect,
} from '@/utils/glassOptics'
import { describe, expect, it } from 'vitest'

describe('glass optics geometry', () => {
  it('caps the renderer buffer independently from device pixel ratio', () => {
    expect(getGlassOpticalBufferSize(3456, 2234, false)).toEqual({ height: 931, width: 1440 })
    expect(getGlassOpticalBufferSize(390, 844, true)).toEqual({ height: 844, width: 390 })
    expect(getGlassOpticalBufferSize(1920, 1080, false, 'high', 2)).toEqual({ height: 1080, width: 1920 })
    expect(getGlassOpticalBufferSize(390, 844, true, 'high', 3)).toEqual({ height: 1266, width: 585 })
  })

  it('matches cover cropping on wide and tall images', () => {
    expect(getGlassCoverScale(1600, 900, 2400, 1600)).toEqual({ x: 1, y: 0.84375 })
    expect(getGlassCoverScale(900, 1600, 2400, 1600)).toEqual({ x: 0.375, y: 1 })
  })

  it('keeps the selected optical quality on every route', () => {
    expect(getGlassOpticalRenderProfile('high', '/dashboard')).toEqual({
      bufferQuality: 'high',
      flowField: true,
      flowHalfLife: 130,
      motionDuration: 680,
      motionHalfLife: 145,
      pixelRatioCap: 1.5,
      textureLimit: 4096,
      textureSource: 'wallpaper',
      trailCount: 4,
    })
    expect(getGlassOpticalRenderProfile('high', '/recommend?source=tmdb')).toEqual({
      bufferQuality: 'high',
      flowField: true,
      flowHalfLife: 130,
      motionDuration: 680,
      motionHalfLife: 145,
      pixelRatioCap: 1.5,
      textureLimit: 4096,
      textureSource: 'wallpaper',
      trailCount: 4,
    })
    expect(getGlassOpticalRenderProfile('high', '/subscribe/movie')).toEqual({
      bufferQuality: 'high',
      flowField: true,
      flowHalfLife: 130,
      motionDuration: 680,
      motionHalfLife: 145,
      pixelRatioCap: 1.5,
      textureLimit: 4096,
      textureSource: 'wallpaper',
      trailCount: 4,
    })
    expect(getGlassOpticalRenderProfile('balanced', '/dashboard')).toEqual({
      bufferQuality: 'balanced',
      flowField: false,
      flowHalfLife: 0,
      motionDuration: 420,
      motionHalfLife: 90,
      pixelRatioCap: 1,
      textureLimit: 3072,
      textureSource: 'wallpaper',
      trailCount: 2,
    })
    expect(getGlassOpticalRenderProfile('high', '/login')).toEqual({
      bufferQuality: 'high',
      flowField: true,
      flowHalfLife: 130,
      motionDuration: 680,
      motionHalfLife: 145,
      pixelRatioCap: 1.5,
      textureLimit: 4096,
      textureSource: 'auto',
      trailCount: 4,
    })
  })

  it('uses refresh-rate independent decay and reaches a deterministic static state', () => {
    expect(getGlassOpticalDecay(100, 100)).toBeCloseTo(0.5)
    expect(getGlassOpticalDecay(100, 50) ** 2).toBeCloseTo(getGlassOpticalDecay(100, 100))
    expect(getGlassOpticalMotionEnergy(0, 420, 90)).toBe(1)
    expect(getGlassOpticalMotionEnergy(90, 420, 90)).toBeCloseTo(0.5)
    expect(getGlassOpticalMotionEnergy(400, 420, 90)).toBeLessThan(0.005)
    expect(getGlassOpticalMotionEnergy(410, 420, 90)).toBeLessThan(getGlassOpticalMotionEnergy(400, 420, 90))
    expect(getGlassOpticalMotionEnergy(420, 420, 90)).toBe(0)

    const samples = Array.from({ length: 29 }, (_, index) => getGlassOpticalMotionEnergy(index * 15, 420, 90))
    expect(samples.every((sample, index) => index === 0 || sample <= samples[index - 1])).toBe(true)
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
      { height: 900, radii: [0, 0, 0, 0], rank: 2, width: 260, x: 0, y: 0 },
      { height: 300, radii: [16, 16, 16, 16], rank: 4, width: 500, x: 300, y: 100 },
      { height: 100, radii: [12, 12, 12, 12], rank: 5, width: 200, x: 320, y: 120 },
      { height: 120, radii: [12, 12, 12, 12], rank: 1, width: 400, x: 500, y: 700 },
    ]

    const selected = selectGlassOpticalRects(candidates, 1440, 900, false)

    expect(selected).toHaveLength(3)
    expect(selected.map(rect => rect.rank)).toEqual([1, 2, 4])
  })

  it('keeps original geometry while using the viewport intersection for visibility', () => {
    const selected = selectGlassOpticalRects(
      [{ height: 160, radii: [20, 20, 20, 20], rank: 1, width: 180, x: -30, y: -40 }],
      320,
      240,
      false,
    )

    expect(selected).toEqual([{ height: 160, radii: [20, 20, 20, 20], rank: 1, width: 180, x: -30, y: -40 }])
  })

  it('budgets partially visible surfaces by their visible pixels', () => {
    const selected = selectGlassOpticalRects(
      [
        { height: 1000, radii: [20, 20, 20, 20], rank: 1, width: 1000, x: -950, y: -900 },
        { height: 120, radii: [16, 16, 16, 16], rank: 2, width: 200, x: 80, y: 80 },
      ],
      320,
      240,
      false,
    )

    expect(selected.map(rect => rect.rank)).toEqual([1, 2])
  })

  it('converts DOM top-origin rectangles while preserving pixel radius', () => {
    expect(
      normalizeGlassOpticalRect(
        { height: 100, radii: [20, 18, 16, 14], rank: 1, width: 200, x: 100, y: 50 },
        1000,
        500,
      ),
    ).toEqual({ radii: [20, 18, 16, 14], rect: [0.1, 0.7, 0.2, 0.2] })

    expect(
      normalizeGlassOpticalRect(
        { height: 100, radii: [80, 70, 60, 40], rank: 1, width: 200, x: -20, y: 50 },
        1000,
        500,
      ),
    ).toEqual({ radii: [50, 50, 50, 40], rect: [-0.02, 0.7, 0.2, 0.2] })
  })

  it('keeps visible surfaces without an area-based hard cutoff', () => {
    const selected = selectGlassOpticalRects(
      [
        { height: 400, radii: [20, 20, 20, 20], rank: 1, width: 700, x: 0, y: 0 },
        { height: 400, radii: [20, 20, 20, 20], rank: 2, width: 700, x: 0, y: 400 },
      ],
      700,
      800,
      false,
    )

    expect(selected).toHaveLength(2)
  })

  it('prioritizes the surface under the current interaction when the count is capped', () => {
    const candidates = Array.from({ length: 9 }, (_, index): GlassOpticalRect => ({
      height: 80,
      radii: [12, 12, 12, 12],
      rank: index + 1,
      width: 100,
      x: index * 110,
      y: 20,
    }))

    const selected = selectGlassOpticalRects(candidates, 1000, 200, false, { x: 930, y: 60 })

    expect(selected).toHaveLength(8)
    expect(selected).toContain(candidates[8])
    expect(selected).not.toContain(candidates[7])
  })
})
