import {
  canUseGlassWallpaperTexture,
  getGlassCoverScale,
  getGlassOpticalDecay,
  getGlassOpticalBufferSize,
  getGlassOpticalMotionEnergy,
  getGlassOpticalRenderProfile,
  getGlassOpticalSurfaceTransitionWeights,
  getGlassOpticalWakeDirection,
  getGlassOpticalWakeSample,
  normalizeGlassOpticalRect,
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
  })

  it('matches cover cropping on wide and tall images', () => {
    expect(getGlassCoverScale(1600, 900, 2400, 1600)).toEqual({ x: 1, y: 0.84375 })
    expect(getGlassCoverScale(900, 1600, 2400, 1600)).toEqual({ x: 0.375, y: 1 })
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
    expect(getGlassOpticalSurfaceTransitionWeights(0, 96)).toEqual({ incoming: 0.35, outgoing: 1 })
    expect(getGlassOpticalSurfaceTransitionWeights(48, 96)).toEqual({ incoming: 0.675, outgoing: 0.5 })
    expect(getGlassOpticalSurfaceTransitionWeights(96, 96)).toEqual({ incoming: 1, outgoing: 0 })
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
