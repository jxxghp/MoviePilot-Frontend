import { getPosterToneFromPixels } from '@/utils/posterTone'
import { describe, expect, it } from 'vitest'

/** 按 RGBA 顺序重复生成指定数量的像素。 */
function pixels(...groups: Array<[number, [number, number, number, number]]>) {
  return groups.flatMap(([count, rgba]) => Array.from({ length: count }, () => rgba)).flat()
}

describe('getPosterToneFromPixels', () => {
  it('returns the hue of a saturated poster and caps saturation for a dark card base', () => {
    const tone = getPosterToneFromPixels(pixels([20, [200, 40, 40, 255]]))

    expect(tone).toEqual({ hue: 0, saturation: 55 })
  })

  it('lets saturated subject pixels outweigh large black borders', () => {
    const tone = getPosterToneFromPixels(pixels([80, [6, 6, 6, 255]], [20, [40, 90, 200, 255]]))

    expect(tone?.hue).toBeGreaterThanOrEqual(215)
    expect(tone?.hue).toBeLessThanOrEqual(225)
  })

  it('ignores transparent pixels and returns null when nothing is readable', () => {
    expect(getPosterToneFromPixels(pixels([10, [255, 0, 0, 0]]))).toBeNull()
    expect(getPosterToneFromPixels([])).toBeNull()
  })

  it('keeps grayscale posters neutral', () => {
    expect(getPosterToneFromPixels(pixels([10, [128, 128, 128, 255]]))).toEqual({ hue: 0, saturation: 0 })
  })
})
