import { describe, expect, it } from 'vitest'
import {
  MEDAL_ART_META,
  medalDial,
  medalSpin,
  medalSpinMode,
  spinAngleAt,
  tickEase,
  resolveMedalArt,
  supportsRelief,
  type MedalShape,
} from '@/utils/communityMedalArt'

const shape: MedalShape = {
  outline: [
    [0.2, 0.2],
    [0.8, 0.2],
    [0.5, 0.8],
  ],
  gem: null,
}

/** 按文件名构造一组资产，模拟 import.meta.glob 收录的结果。 */
function files(names: string[]) {
  return {
    images: new Map(names.filter(name => name.endsWith('.webp')).map(name => [name, '/assets/' + name])),
    outlines: new Map(
      names.filter(name => name.endsWith('.outline.json')).map(name => [name, () => Promise.resolve(shape)]),
    ),
  }
}

describe('community medal art registry', () => {
  it('falls back to the page-drawn medal when either face is missing', () => {
    expect(resolveMedalArt('helper', undefined, files([]))).toBeNull()
    expect(resolveMedalArt('helper', undefined, files(['helper-front.webp']))).toBeNull()
  })

  it('uses a tilt card when height maps or outlines are incomplete', () => {
    const art = resolveMedalArt(
      'pioneer',
      undefined,
      files(['pioneer-front.webp', 'pioneer-back.webp', 'pioneer-front-height.webp']),
    )
    expect(art?.front).toBe('/assets/pioneer-front.webp')
    expect(art?.tier).toBeNull()
    expect(art?.heights).toBeNull()
    expect(supportsRelief(art)).toBe(false)
  })

  it('enables relief with both height maps and outlines, leaving ink and dial to be derived', async () => {
    const art = resolveMedalArt(
      'security',
      undefined,
      files([
        'security-front.webp',
        'security-back.webp',
        'security-front-height.webp',
        'security-back-height.webp',
        'security-front.outline.json',
        'security-back.outline.json',
      ]),
    )
    expect(supportsRelief(art)).toBe(true)
    expect(art?.ink).toBeNull()
    expect(art?.dial).toBeNull()
    await expect(art!.shapes!()).resolves.toEqual({ front: shape, back: shape })
  })

  it('uses the held tier front for ladder medals and falls back to the nearest lower tier', async () => {
    const set = files([
      'code-front-t1.webp',
      'code-front-t3.webp',
      'code-front-t3-height.webp',
      'code-front-t3.outline.json',
      'code-back.webp',
      'code-back-height.webp',
      'code-back.outline.json',
    ])
    const exact = resolveMedalArt('code', 3, set)
    expect(exact?.front).toBe('/assets/code-front-t3.webp')
    expect(exact?.tier).toBe(3)
    expect(exact?.heights).toEqual({
      front: '/assets/code-front-t3-height.webp',
      back: '/assets/code-back-height.webp',
    })
    expect(supportsRelief(exact)).toBe(true)

    const lower = resolveMedalArt('code', 4, set)
    expect(lower?.front).toBe('/assets/code-front-t3.webp')
    expect(lower?.tier).toBe(3)

    const gap = resolveMedalArt('code', 2, set)
    expect(gap?.front).toBe('/assets/code-front-t1.webp')
    expect(gap?.heights).toBeNull()
    expect(gap?.back).toBe('/assets/code-back.webp')
  })

  it('pairs each front with its pre-downscaled badge of the same tier', () => {
    const set = files(['code-front-t1.webp', 'code-front-t3.webp', 'code-badge-t3.webp', 'code-back.webp'])
    expect(resolveMedalArt('code', 4, set)?.badge).toBe('/assets/code-badge-t3.webp')
    expect(resolveMedalArt('code', 2, set)?.badge).toBeNull()
    const single = files(['helper-front.webp', 'helper-badge.webp', 'helper-back.webp'])
    expect(resolveMedalArt('helper', undefined, single)?.badge).toBe('/assets/helper-badge.webp')
  })

  it('falls back to the page-drawn medal when no tier front fits or the shared back is missing', () => {
    expect(resolveMedalArt('plugin', 2, files(['plugin-front-t3.webp', 'plugin-back.webp']))).toBeNull()
    expect(resolveMedalArt('plugin', 3, files(['plugin-front-t3.webp']))).toBeNull()
    // 阶梯勋章不认独枚勋章的命名。
    expect(resolveMedalArt('plugin', 1, files(['plugin-front.webp', 'plugin-back.webp']))).toBeNull()
  })

  it('takes the engraving plate from the back outline unless an override is registered', () => {
    const plate = { x: 0.5, y: 0.52, width: 0.56, height: 0.22 }
    const back: MedalShape = { ...shape, dial: plate }
    const names = ['helper-front.webp', 'helper-back.webp']
    expect(medalDial(resolveMedalArt('helper', undefined, files(names)), back)).toEqual(plate)
    const fallback = medalDial(null, shape)
    expect(fallback.width).toBeGreaterThan(0)
    expect(fallback.height).toBeGreaterThan(0)
    expect(medalDial(null, { ...shape, dial: { ...plate, height: 0 } })).toEqual(fallback)
    const override = { x: 0.48, y: 0.5, width: 0.4, height: 0.2 }
    MEDAL_ART_META.helper = { dial: override, ink: '#3a2a10' }
    try {
      const art = resolveMedalArt('helper', undefined, files(names))
      expect(medalDial(art, back)).toEqual(override)
      expect(art?.ink).toBe('#3a2a10')
    } finally {
      delete MEDAL_ART_META.helper
    }
  })

  it('reads a valid spin ring from the front outline and ignores broken ones', () => {
    const spin = { x: 0.497, y: 0.483, r: 0.353, period: 180 }
    expect(medalSpin({ ...shape, spin })).toEqual(spin)
    expect(medalSpin(shape)).toBeNull()
    expect(medalSpin({ ...shape, spin: { ...spin, period: 0 } })).toBeNull()
    expect(medalSpin({ ...shape, spin: { ...spin, r: Number.NaN } })).toBeNull()
  })
})

describe('community medal ring spin', () => {
  const spin = { x: 0.5, y: 0.5, r: 0.35, period: 180 }
  const degrees = (radians: number) => (radians * 180) / Math.PI

  it('advances one graduation per interval and rests between steps', () => {
    expect(degrees(spinAngleAt(spin, 0))).toBeCloseTo(0)
    expect(degrees(spinAngleAt(spin, 0.35))).toBeCloseTo(6)
    expect(degrees(spinAngleAt(spin, 1.9))).toBeCloseTo(6)
    expect(degrees(spinAngleAt(spin, 2.35))).toBeCloseTo(12)
    expect(degrees(spinAngleAt({ ...spin, step: 10, interval: 3 }, 3.5))).toBeCloseTo(20)
  })

  it('eases each step in and out with a small overshoot that settles', () => {
    const peak = Math.max(...Array.from({ length: 36 }, (_, index) => degrees(spinAngleAt(spin, index / 100))))
    expect(peak).toBeGreaterThan(6)
    expect(peak).toBeLessThanOrEqual(6.4 + 1e-9)
    expect(tickEase(0.5 * 0.7, 0)).toBeCloseTo(0.5)
    expect(tickEase(1, 0.1)).toBeCloseTo(1)
  })

  it('keeps continuous mode available and honours the debug override', () => {
    expect(degrees(spinAngleAt(spin, 45, 'continuous'))).toBeCloseTo(90)
    expect(medalSpinMode(spin)).toBe('tick')
    expect(medalSpinMode({ ...spin, mode: 'continuous' })).toBe('continuous')
    localStorage.setItem('community-medal-spin-mode', 'continuous')
    expect(medalSpinMode(spin)).toBe('continuous')
  })
})
