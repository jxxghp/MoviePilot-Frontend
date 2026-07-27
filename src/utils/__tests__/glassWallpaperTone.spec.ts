import { DEFAULT_GLASS_WALLPAPER_TONE_PROFILE, getGlassWallpaperToneProfile } from '@/utils/glassWallpaperTone'
import { describe, expect, it } from 'vitest'

describe('glass wallpaper tone profile', () => {
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
})
