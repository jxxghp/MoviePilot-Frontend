import { describe, expect, it } from 'vitest'
import {
  FLOATING_NAVBAR_INSET_PX,
  getHorizontalNavbarGeometry,
  getHorizontalNavbarProgress,
  HORIZONTAL_NAVBAR_CONTENT_MAX_WIDTH_PX,
} from '../horizontalNavbarMotion'

describe('horizontal navbar scroll motion', () => {
  it.each([
    [1280, 1280, 0, 16, 200],
    [1920, 1440, 240, 16, 224],
    [2560, 1440, 560, 16, 544],
    [3440, 1440, 1000, 440, 560],
    [5120, 1440, 1840, 1280, 560],
  ])('caps the internal layout at viewport %ipx', (viewport, content, topGutter, floatingGutter, distance) => {
    const geometry = getHorizontalNavbarGeometry(viewport, content)
    expect(geometry).toEqual({ topGutter, floatingGutter, scrollDistance: distance })
    expect(viewport - geometry.floatingGutter * 2).toBeLessThanOrEqual(HORIZONTAL_NAVBAR_CONTENT_MAX_WIDTH_PX)
    expect(geometry.floatingGutter).toBeGreaterThanOrEqual(FLOATING_NAVBAR_INSET_PX)
  })

  it('keeps the curve bounded, symmetric and strictly increasing inside the travel range', () => {
    expect(getHorizontalNavbarProgress(-10, 224)).toBe(0)
    expect(getHorizontalNavbarProgress(1000, 224)).toBe(1)
    const samples = Array.from({ length: 101 }, (_, i) => getHorizontalNavbarProgress((224 * i) / 100, 224))
    expect(samples[0]).toBe(0)
    expect(samples[50]).toBe(0.5)
    expect(samples[100]).toBe(1)
    for (let i = 1; i < samples.length; i++) {
      expect(samples[i]).toBeGreaterThan(samples[i - 1])
      expect(samples[i] + samples[100 - i]).toBeCloseTo(1)
    }
    expect(samples[1]).toBeLessThan(0.001)
    expect(1 - samples[99]).toBeLessThan(0.001)
  })

  it('uses the same viewport trajectory for inset and counter-scaled shells at every progress', () => {
    const viewport = 3440
    const { topGutter, floatingGutter, scrollDistance } = getHorizontalNavbarGeometry(viewport, 1440)
    for (const scrollY of [0, 56, 140, 280, 420, 504, 560]) {
      const p = getHorizontalNavbarProgress(scrollY, scrollDistance)
      const inset = FLOATING_NAVBAR_INSET_PX * p
      const targetLeft = 24 + topGutter * (1 - p) + floatingGutter * p
      const insetPadding = targetLeft - inset
      const shellScale = (viewport - 2 * inset) / viewport
      const counterScale = 1 / shellScale
      expect(inset + insetPadding).toBeCloseTo(targetLeft)
      expect(shellScale * counterScale).toBeCloseTo(1)
      expect(280 * shellScale * counterScale).toBeCloseTo(280)
    }
  })
})
