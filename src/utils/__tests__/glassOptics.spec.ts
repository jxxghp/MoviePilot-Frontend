import {
  canUseGlassWallpaperTexture,
  GLASS_OPTICAL_MOTION_MAX_SCALE,
  GLASS_OPTICAL_REFLECTION_MAX_SCALE,
  getAvailableGlassOpticalPresets,
  getGlassCssFrostBlur,
  getGlassCoverScale,
  getGlassMaterialResponse,
  getGlassOverlayClarityBlur,
  getGlassOpticalCssTransmissionBrightness,
  getGlassOpticalDecay,
  getGlassOpticalBufferSize,
  getGlassOpticalMaxRefractionPixels,
  getGlassOpticalMotionEnergy,
  getGlassOpticalMotionExpansion,
  getGlassOpticalMotionStrengthScale,
  getGlassOpticalPresetParameters,
  getGlassOpticalPresetParametersWithOverrides,
  getGlassOpticalPresetKey,
  getGlassOpticalReflectionStrengthScale,
  getGlassOpticalRenderProfile,
  getGlassOpticalTransparency,
  getGlassOpticalTransmissionStrength,
  getGlassOpticalSurfaceTransitionWeights,
  getGlassOpticalWakeDirection,
  getGlassOpticalWakeSample,
  getGlassScrollBufferSize,
  getGlassWallpaperTransitionProgress,
  normalizeGlassOpticalRect,
  normalizeGlassOpticalStrength,
  reconcileGlassOpticalSurfaceSlots,
  selectGlassOpticalRects,
  stepGlassOpticalSpring,
  type GlassOpticalRect,
} from '@/utils/glassOptics'
import { describe, expect, it } from 'vitest'

describe('glass optics geometry', () => {
  it('caps the renderer buffer independently from device pixel ratio', () => {
    expect(getGlassOpticalBufferSize(3456, 2234, false)).toEqual({ height: 931, width: 1440 })
    expect(getGlassOpticalBufferSize(390, 844, true)).toEqual({ height: 844, width: 390 })
    expect(getGlassOpticalBufferSize(1920, 1080, false, 'high', 2)).toEqual({ height: 1080, width: 1920 })
    expect(getGlassOpticalBufferSize(390, 844, true, 'high', 3)).toEqual({ height: 1266, width: 585 })
    expect(getGlassScrollBufferSize(1440, 4200, 'balanced', 2)).toEqual({ height: 3072, width: 1440 })
    expect(getGlassScrollBufferSize(1440, 4200, 'high', 2)).toEqual({ height: 4096, width: 1920 })
  })

  it('matches cover cropping on wide and tall images', () => {
    expect(getGlassCoverScale(1600, 900, 2400, 1600)).toEqual({ x: 1, y: 0.84375 })
    expect(getGlassCoverScale(900, 1600, 2400, 1600)).toEqual({ x: 0.375, y: 1 })
  })

  it('maps user strength sliders to accelerated high-range optical response', () => {
    expect(normalizeGlassOpticalStrength(Number.NaN)).toBe(50)
    expect(normalizeGlassOpticalStrength(-12)).toBe(0)
    expect(normalizeGlassOpticalStrength(44.6)).toBe(45)
    expect(normalizeGlassOpticalStrength(160)).toBe(100)
    expect(getGlassOpticalMotionStrengthScale(0)).toBe(0)
    expect(getGlassOpticalMotionStrengthScale(50)).toBe(1)
    expect(getGlassOpticalMotionStrengthScale(80)).toBeGreaterThan(2)
    expect(getGlassOpticalMotionStrengthScale(100)).toBeCloseTo(GLASS_OPTICAL_MOTION_MAX_SCALE)
    expect(getGlassOpticalMotionStrengthScale(75) - getGlassOpticalMotionStrengthScale(50)).toBeGreaterThan(
      getGlassOpticalMotionStrengthScale(50) - getGlassOpticalMotionStrengthScale(25),
    )
    expect(getGlassOpticalMotionExpansion(0)).toBe(0)
    expect(getGlassOpticalMotionExpansion(50)).toBeGreaterThan(0.3)
    expect(getGlassOpticalMotionExpansion(50)).toBeLessThan(0.4)
    expect(getGlassOpticalMotionExpansion(80)).toBeGreaterThan(0.4)
    expect(getGlassOpticalMotionExpansion(100)).toBe(1)
    expect(getGlassOpticalMaxRefractionPixels(9, 50)).toBe(9)
    expect(getGlassOpticalMaxRefractionPixels(9, 80)).toBe(9)
    expect(getGlassOpticalMaxRefractionPixels(9, 100)).toBe(9)
    expect(getGlassOpticalReflectionStrengthScale(0)).toBe(0)
    expect(getGlassOpticalReflectionStrengthScale(50)).toBe(1)
    expect(getGlassOpticalReflectionStrengthScale(100)).toBeCloseTo(GLASS_OPTICAL_REFLECTION_MAX_SCALE)
    expect(getGlassOpticalTransparency(0)).toBe(0)
    expect(getGlassOpticalTransparency(50)).toBeGreaterThan(0.6)
    expect(getGlassOpticalTransparency(70)).toBeCloseTo(0.96)
    expect(getGlassOpticalTransparency(100)).toBeCloseTo(1.1)
    expect(getGlassOpticalTransparency(100) - getGlassOpticalTransparency(70)).toBeLessThan(
      getGlassOpticalTransparency(70) - getGlassOpticalTransparency(50),
    )
    expect(getGlassOpticalTransmissionStrength(0)).toBe(0)
    expect(getGlassOpticalTransmissionStrength(70)).toBe(1)
    expect(getGlassOpticalTransmissionStrength(100)).toBe(1.3)
    expect(getGlassOpticalCssTransmissionBrightness(0)).toBeCloseTo(0.84)
    expect(getGlassOpticalCssTransmissionBrightness(70)).toBeCloseTo(1)
    expect(getGlassOpticalCssTransmissionBrightness(100)).toBeCloseTo(1.08)
  })

  it('keeps presets as concrete six-parameter values', () => {
    const natural = getGlassOpticalPresetParameters('clear', 'balanced', 'natural')
    const glide = getGlassOpticalPresetParameters('clear', 'balanced', 'glide')
    const liquid = getGlassOpticalPresetParameters('frosted', 'high', 'liquid')

    expect(natural).toEqual({
      deformation: 48,
      flow: 48,
      reflection: 42,
      transmission: 65,
      translation: 48,
      transparency: 50,
    })
    expect(glide.translation).toBeGreaterThan(glide.deformation)
    expect(liquid.deformation).toBeGreaterThan(glide.deformation)
    expect(liquid.flow).toBeGreaterThan(glide.flow)
    expect(getAvailableGlassOpticalPresets('css')).toEqual(['natural'])
    expect(getAvailableGlassOpticalPresets('balanced')).toEqual(['natural', 'glide', 'liquid'])
  })

  it('keeps every preset dynamic parameter at the approved material calibration', () => {
    const expected = {
      clear: {
        css: { natural: { deformation: 48, flow: 48, translation: 48 } },
        balanced: {
          natural: { deformation: 48, flow: 48, translation: 48 },
          glide: { deformation: 29, flow: 42, translation: 70 },
          liquid: { deformation: 67, flow: 73, translation: 54 },
        },
        high: {
          natural: { deformation: 48, flow: 48, translation: 48 },
          glide: { deformation: 31, flow: 44, translation: 71 },
          liquid: { deformation: 71, flow: 77, translation: 55 },
        },
      },
      tinted: {
        css: { natural: { deformation: 48, flow: 48, translation: 48 } },
        balanced: {
          natural: { deformation: 50, flow: 48, translation: 48 },
          glide: { deformation: 31, flow: 42, translation: 67 },
          liquid: { deformation: 70, flow: 73, translation: 54 },
        },
        high: {
          natural: { deformation: 50, flow: 48, translation: 48 },
          glide: { deformation: 32, flow: 44, translation: 70 },
          liquid: { deformation: 73, flow: 77, translation: 55 },
        },
      },
      frosted: {
        css: { natural: { deformation: 48, flow: 48, translation: 48 } },
        balanced: {
          natural: { deformation: 55, flow: 50, translation: 46 },
          glide: { deformation: 36, flow: 42, translation: 65 },
          liquid: { deformation: 74, flow: 73, translation: 50 },
        },
        high: {
          natural: { deformation: 58, flow: 50, translation: 46 },
          glide: { deformation: 38, flow: 44, translation: 67 },
          liquid: { deformation: 79, flow: 77, translation: 52 },
        },
      },
    } as const

    for (const [appearance, qualities] of Object.entries(expected)) {
      for (const [quality, presets] of Object.entries(qualities)) {
        for (const [preset, parameters] of Object.entries(presets)) {
          expect(
            getGlassOpticalPresetParameters(
              appearance as 'clear' | 'frosted' | 'tinted',
              quality as 'balanced' | 'css' | 'high',
              preset as 'glide' | 'liquid' | 'natural',
            ),
          ).toMatchObject(parameters as object)
        }
      }
    }
  })

  it('restores per-combination overrides and keeps standard quality on natural', () => {
    const key = getGlassOpticalPresetKey('tinted', 'high', 'glide')
    const override = {
      deformation: 11,
      flow: 22,
      reflection: 33,
      transmission: 44,
      translation: 55,
      transparency: 66,
    }

    expect(key).toBe('tinted:high:glide')
    expect(getGlassOpticalPresetKey('frosted', 'css', 'liquid')).toBe('frosted:css:natural')
    expect(getGlassOpticalPresetParametersWithOverrides('tinted', 'high', 'glide', { [key]: override })).toEqual(
      override,
    )
    expect(getGlassOpticalPresetParametersWithOverrides('clear', 'balanced', 'natural', {})).toEqual(
      getGlassOpticalPresetParameters('clear', 'balanced', 'natural'),
    )
  })

  it('uses the approved transparency and transmission matrix for all effective presets', () => {
    const expected = {
      clear: {
        css: { natural: [52, 67] },
        balanced: { natural: [50, 65], glide: [60, 70], liquid: [55, 61] },
        high: { natural: [49, 64], glide: [59, 67], liquid: [54, 60] },
      },
      tinted: {
        css: { natural: [37, 65] },
        balanced: { natural: [34, 67], glide: [43, 73], liquid: [39, 64] },
        high: { natural: [32, 65], glide: [41, 71], liquid: [37, 61] },
      },
      frosted: {
        css: { natural: [43, 60] },
        balanced: { natural: [40, 62], glide: [55, 67], liquid: [47, 59] },
        high: { natural: [37, 60], glide: [53, 65], liquid: [44, 56] },
      },
    } as const

    for (const [appearance, qualities] of Object.entries(expected)) {
      for (const [quality, presets] of Object.entries(qualities)) {
        for (const [preset, values] of Object.entries(presets)) {
          const [transparency, transmission] = values as readonly [number, number]

          expect(
            getGlassOpticalPresetParameters(
              appearance as 'clear' | 'frosted' | 'tinted',
              quality as 'balanced' | 'css' | 'high',
              preset as 'glide' | 'liquid' | 'natural',
            ),
          ).toMatchObject({ transmission, transparency })
        }
      }
    }
  })

  it('derives independent material responses from piecewise smooth transparency anchors', () => {
    expect(getGlassMaterialResponse('clear', 0)).toMatchObject({
      backgroundVisibility: 0.18,
      surfaceDensity: 1,
    })
    expect(getGlassMaterialResponse('tinted', 50)).toMatchObject({
      backgroundVisibility: 0.48,
      tintDensity: 0.65,
    })
    const frostedLow = getGlassMaterialResponse('frosted', 20)
    expect(frostedLow).toMatchObject({
      backgroundVisibility: 0.22,
      frostBlurScale: 1.384,
      surfaceDensity: 0.9,
    })
    expect(frostedLow.frostDetailLevel).toBeCloseTo(0.18)
    const frostedMid = getGlassMaterialResponse('frosted', 50)
    expect(frostedMid).toMatchObject({
      backgroundVisibility: 0.52,
      frostBlurScale: 1.06,
      surfaceDensity: 0.7,
    })
    expect(frostedMid.frostDetailLevel).toBeCloseTo(0.45)
    expect(getGlassMaterialResponse('frosted', 100)).toMatchObject({
      backgroundVisibility: 0.98,
      frostBlurScale: 0.43,
      frostDetailLevel: 0.975,
      surfaceDensity: 0.22,
    })
    expect(getGlassCssFrostBlur(0)).toEqual({ raised: 84, surface: 64 })
    expect(getGlassCssFrostBlur(50)).toEqual({ raised: 50, surface: 36 })
    expect(getGlassCssFrostBlur(100)).toEqual({ raised: 16, surface: 8 })

    const samples = [0, 10, 20, 35, 50, 60, 70, 78, 85, 92, 100].map(value =>
      getGlassMaterialResponse('frosted', value),
    )
    expect(
      samples.every(
        (sample, index) =>
          index === 0 ||
          (sample.backgroundVisibility > samples[index - 1].backgroundVisibility &&
            sample.frostDetailLevel > samples[index - 1].frostDetailLevel &&
            sample.surfaceDensity < samples[index - 1].surfaceDensity),
      ),
    ).toBe(true)
  })

  it('derives a continuous overlay clarity floor from transparency anchors', () => {
    const anchors = [
      [0, 8.9],
      [20, 7.8],
      [50, 6.7],
      [70, 5.8],
      [85, 5.4],
      [100, 5],
    ] as const

    for (const [transparency, blur] of anchors) {
      expect(getGlassOverlayClarityBlur(transparency)).toBe(blur)
    }

    expect(getGlassOverlayClarityBlur(-1)).toBe(8.9)
    expect(getGlassOverlayClarityBlur(101)).toBe(5)
    expect(getGlassOverlayClarityBlur(Number.NaN)).toBe(6.7)

    const samples = Array.from({ length: 101 }, (_, value) => getGlassOverlayClarityBlur(value))
    expect(samples.every((sample, index) => index === 0 || sample <= samples[index - 1])).toBe(true)

    for (const anchor of [20, 50, 70, 85]) {
      const blur = getGlassOverlayClarityBlur(anchor)
      expect(Math.abs(getGlassOverlayClarityBlur(anchor - 1) - blur)).toBeLessThan(0.02)
      expect(Math.abs(getGlassOverlayClarityBlur(anchor + 1) - blur)).toBeLessThan(0.03)
    }
  })

  it('returns preset copies so previews cannot mutate the shared matrix', () => {
    const first = getGlassOpticalPresetParameters('tinted', 'high', 'glide')
    first.translation = 0

    expect(getGlassOpticalPresetParameters('tinted', 'high', 'glide').translation).toBe(70)
  })

  it('matches the monotonic CSS ease timeline used by wallpaper crossfades', () => {
    const samples = [0, 250, 750, 1250, 1500].map(elapsed => getGlassWallpaperTransitionProgress(elapsed, 1500))

    expect(samples[0]).toBe(0)
    expect(samples.at(-1)).toBe(1)
    expect(samples[2]).toBeGreaterThan(0.5)
    expect(samples.every((sample, index) => index === 0 || sample > samples[index - 1])).toBe(true)
  })

  it('keeps the selected optical quality on every route', () => {
    expect(getGlassOpticalRenderProfile('high', '/dashboard')).toEqual({
      bufferQuality: 'high',
      contentProtection: true,
      diffusionSamples: 9,
      flowField: true,
      flowHalfLife: 130,
      maxRefractionPixels: 9,
      motionDuration: 540,
      motionHalfLife: 125,
      pixelRatioCap: 1.5,
      pointerImmediateResponse: 0.58,
      springDamping: 0.78,
      springFrequency: 18,
      textureLimit: 4096,
      textureSource: 'wallpaper',
      trailCount: 4,
    })
    expect(getGlassOpticalRenderProfile('high', '/recommend?source=tmdb')).toEqual({
      bufferQuality: 'high',
      contentProtection: true,
      diffusionSamples: 9,
      flowField: true,
      flowHalfLife: 130,
      maxRefractionPixels: 9,
      motionDuration: 540,
      motionHalfLife: 125,
      pixelRatioCap: 1.5,
      pointerImmediateResponse: 0.58,
      springDamping: 0.78,
      springFrequency: 18,
      textureLimit: 4096,
      textureSource: 'wallpaper',
      trailCount: 4,
    })
    expect(getGlassOpticalRenderProfile('high', '/subscribe/movie')).toEqual({
      bufferQuality: 'high',
      contentProtection: true,
      diffusionSamples: 9,
      flowField: true,
      flowHalfLife: 130,
      maxRefractionPixels: 9,
      motionDuration: 540,
      motionHalfLife: 125,
      pixelRatioCap: 1.5,
      pointerImmediateResponse: 0.58,
      springDamping: 0.78,
      springFrequency: 18,
      textureLimit: 4096,
      textureSource: 'wallpaper',
      trailCount: 4,
    })
    expect(getGlassOpticalRenderProfile('balanced', '/dashboard')).toEqual({
      bufferQuality: 'balanced',
      contentProtection: false,
      diffusionSamples: 5,
      flowField: false,
      flowHalfLife: 0,
      maxRefractionPixels: 6,
      motionDuration: 360,
      motionHalfLife: 82,
      pixelRatioCap: 1,
      pointerImmediateResponse: 0.7,
      springDamping: 0.9,
      springFrequency: 24,
      textureLimit: 3072,
      textureSource: 'wallpaper',
      trailCount: 2,
    })
    expect(getGlassOpticalRenderProfile('high', '/login')).toEqual({
      bufferQuality: 'high',
      contentProtection: true,
      diffusionSamples: 9,
      flowField: true,
      flowHalfLife: 130,
      maxRefractionPixels: 9,
      motionDuration: 540,
      motionHalfLife: 125,
      pixelRatioCap: 1.5,
      pointerImmediateResponse: 0.58,
      springDamping: 0.78,
      springFrequency: 18,
      textureLimit: 4096,
      textureSource: 'auto',
      trailCount: 4,
    })
  })

  it('spends high-quality cost on visible detail and content protection', () => {
    const balanced = getGlassOpticalRenderProfile('balanced', '/dashboard')
    const high = getGlassOpticalRenderProfile('high', '/dashboard')

    expect(balanced).toMatchObject({
      contentProtection: false,
      diffusionSamples: 5,
      flowField: false,
      maxRefractionPixels: 6,
      trailCount: 2,
    })
    expect(high).toMatchObject({
      contentProtection: true,
      diffusionSamples: 9,
      flowField: true,
      maxRefractionPixels: 9,
      trailCount: 4,
    })
    expect(high.motionDuration).toBeGreaterThan(balanced.motionDuration)
    expect(high.pixelRatioCap).toBeGreaterThan(balanced.pixelRatioCap)
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

  it('keeps one crest and one trough in the event-relative liquid wake', () => {
    const samples = Array.from({ length: 161 }, (_, index) => getGlassOpticalWakeSample(-4 + index * 0.05))
    const extrema = samples
      .slice(1, -1)
      .filter(
        (sample, index) =>
          (sample > samples[index] && sample > samples[index + 2]) ||
          (sample < samples[index] && sample < samples[index + 2]),
      )

    expect(extrema).toHaveLength(2)
    expect(Math.min(...samples)).toBeLessThan(0)
    expect(Math.max(...samples)).toBeGreaterThan(0)
    expect(getGlassOpticalWakeSample(0)).toBe(0)
  })

  it('locks wake direction until a deliberate turn starts a new impulse', () => {
    expect(
      getGlassOpticalWakeDirection({ x: 1, y: 0 }, { x: Math.cos(Math.PI / 8), y: Math.sin(Math.PI / 8) }, 0.04, false),
    ).toEqual({ x: 1, y: 0 })
    expect(getGlassOpticalWakeDirection({ x: 1, y: 0 }, { x: 0, y: 1 }, 0.04, false)).toEqual({ x: 0, y: 1 })
    expect(getGlassOpticalWakeDirection({ x: 1, y: 0 }, { x: 0, y: 1 }, 0.002, false)).toEqual({ x: 1, y: 0 })
    expect(getGlassOpticalWakeDirection({ x: 1, y: 0 }, { x: 0, y: 2 }, 0.04, true)).toEqual({ x: 0, y: 1 })
  })

  it('uses a frame-rate independent spring with at most one visible overshoot', () => {
    const profile = getGlassOpticalRenderProfile('high', '/dashboard')
    const simulate = (deltaMs: number) => {
      let state = { position: 0, velocity: 0 }
      const samples: number[] = []

      for (let elapsed = 0; elapsed < profile.motionDuration; elapsed += deltaMs) {
        state = stepGlassOpticalSpring(state, 1, deltaMs, profile.springFrequency, profile.springDamping)
        samples.push(state.position)
      }

      return { samples, state }
    }
    const sixtyHertz = simulate(1000 / 60)
    const oneTwentyHertz = simulate(1000 / 120)
    const visibleCrossings = sixtyHertz.samples.slice(1).filter((sample, index) => {
      const previousOffset = sixtyHertz.samples[index] - 1
      const currentOffset = sample - 1

      return previousOffset * currentOffset < 0 && Math.max(Math.abs(previousOffset), Math.abs(currentOffset)) > 0.002
    })

    expect(visibleCrossings.length).toBeLessThanOrEqual(1)
    expect(Math.max(...sixtyHertz.samples)).toBeLessThan(1.04)
    expect(sixtyHertz.state.position).toBeCloseTo(1, 2)
    expect(sixtyHertz.state.position).toBeCloseTo(oneTwentyHertz.state.position, 3)
  })

  it('reconciles capped surface slots without reshuffling stable cards', () => {
    const candidates = Array.from({ length: 10 }, (_, index) => ({
      key: `card-${index}`,
      rect: {
        height: 80,
        radii: [12, 12, 12, 12] as [number, number, number, number],
        rank: index + 1,
        width: 90,
        x: index * 100,
        y: 20,
      },
    }))
    const initial = reconcileGlassOpticalSurfaceSlots([], candidates, 8)
    const onCardA = reconcileGlassOpticalSurfaceSlots(initial, candidates, 8, 'card-8')
    const throughGap = reconcileGlassOpticalSurfaceSlots(onCardA, candidates, 8, 'card-8')
    const onCardB = reconcileGlassOpticalSurfaceSlots(throughGap, candidates, 8, 'card-9', 'card-8')

    expect(initial.map(slot => slot.key)).toEqual([
      'card-0',
      'card-1',
      'card-2',
      'card-3',
      'card-4',
      'card-5',
      'card-6',
      'card-7',
    ])
    expect(onCardA.map(slot => slot.key)).toEqual([
      'card-0',
      'card-1',
      'card-2',
      'card-3',
      'card-4',
      'card-5',
      'card-6',
      'card-8',
    ])
    expect(throughGap.map(slot => slot.key)).toEqual(onCardA.map(slot => slot.key))
    expect(onCardB.map(slot => slot.key)).toEqual([
      'card-0',
      'card-1',
      'card-2',
      'card-3',
      'card-4',
      'card-5',
      'card-8',
      'card-9',
    ])
    expect(onCardB.at(-2)?.role).toBe('outgoing')
    expect(onCardB.at(-1)?.role).toBe('active')
  })

  it('crossfades active surface weights monotonically', () => {
    expect(getGlassOpticalSurfaceTransitionWeights(0, 96)).toEqual({ incoming: 1, outgoing: 1 })
    expect(getGlassOpticalSurfaceTransitionWeights(48, 96)).toEqual({ incoming: 1, outgoing: 0.5 })
    expect(getGlassOpticalSurfaceTransitionWeights(96, 96)).toEqual({ incoming: 1, outgoing: 0 })
  })

  it('attempts browser-supported wallpaper protocols without allowing mixed content', () => {
    const documentUrl = 'https://moviepilot.example/login'

    expect(canUseGlassWallpaperTexture('/api/v1/login/wallpaper/0', documentUrl)).toBe(true)
    expect(canUseGlassWallpaperTexture('https://moviepilot.example/assets/login.jpg', documentUrl)).toBe(true)
    expect(canUseGlassWallpaperTexture('blob:https://moviepilot.example/texture', documentUrl)).toBe(true)
    expect(canUseGlassWallpaperTexture('data:image/png;base64,AA==', documentUrl)).toBe(true)
    expect(canUseGlassWallpaperTexture('https://image.tmdb.org/t/p/original/poster.jpg', documentUrl)).toBe(true)
    expect(canUseGlassWallpaperTexture('http://image.tmdb.org/t/p/original/poster.jpg', documentUrl)).toBe(false)
    expect(canUseGlassWallpaperTexture('ftp://image.tmdb.org/poster.jpg', documentUrl)).toBe(false)
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
    ).toEqual({
      radii: [80 * (10 / 13), 70 * (10 / 13), 60 * (10 / 13), 40 * (10 / 13)],
      rect: [-0.02, 0.7, 0.2, 0.2],
    })

    expect(
      normalizeGlassOpticalRect({ height: 100, radii: [80, 30, 0, 0], rank: 1, width: 100, x: 0, y: 0 }, 100, 100)
        .radii,
    ).toEqual([80 * (10 / 11), 30 * (10 / 11), 0, 0])
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
