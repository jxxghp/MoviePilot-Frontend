import { normalizePluginAccentColor, normalizeThemeMaterialAccent } from '@/utils/glassColor'
import { describe, expect, it } from 'vitest'

interface OklchColor {
  lightness: number
  chroma: number
  hue: number
}

function srgbToLinear(channel: number) {
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
}

function hexToOklch(color: string): OklchColor {
  const channels = [color.slice(1, 3), color.slice(3, 5), color.slice(5, 7)].map(channel =>
    srgbToLinear(Number.parseInt(channel, 16) / 255),
  )
  const [red, green, blue] = channels
  const l = Math.cbrt(0.4122214708 * red + 0.5363325363 * green + 0.0514459929 * blue)
  const m = Math.cbrt(0.2119034982 * red + 0.6806995451 * green + 0.1073969566 * blue)
  const s = Math.cbrt(0.0883024619 * red + 0.2817188376 * green + 0.6299787005 * blue)
  const lightness = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
  const b = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s

  return { lightness, chroma: Math.hypot(a, b), hue: Math.atan2(b, a) }
}

function hueDistanceDegrees(first: number, second: number) {
  const radians = Math.abs(Math.atan2(Math.sin(first - second), Math.cos(first - second)))

  return (radians * 180) / Math.PI
}

describe('normalizePluginAccentColor', () => {
  it.each(['#ff0000', '#00ff00', '#0000ff', '#00ffff', '#ff00ff', '#f5c400'])(
    'keeps chromatic %s within the plugin accent contract',
    sourceHex => {
      const normalized = normalizePluginAccentColor(sourceHex)

      expect(normalized).toBeDefined()
      expect(normalized?.hex).toMatch(/^#[0-9a-f]{6}$/)
      expect(normalized?.rgb).toMatch(/^\d{1,3}, \d{1,3}, \d{1,3}$/)

      const source = hexToOklch(sourceHex)
      const output = hexToOklch(normalized!.hex)
      expect(output.lightness).toBeGreaterThanOrEqual(0.475)
      expect(output.lightness).toBeLessThanOrEqual(0.765)
      expect(output.chroma).toBeLessThanOrEqual(Math.min(source.chroma, 0.18) + 0.005)
      if (source.chroma >= 0.03 && output.chroma >= 0.03)
        expect(hueDistanceDegrees(source.hue, output.hue)).toBeLessThanOrEqual(2)
    },
  )

  it.each(['#000000', '#ffffff', '#7d7d7d'])('keeps neutral %s neutral without inventing chroma', sourceHex => {
    const normalized = normalizePluginAccentColor(sourceHex)
    const source = hexToOklch(sourceHex)
    const output = hexToOklch(normalized!.hex)

    expect(output.lightness).toBeGreaterThanOrEqual(0.475)
    expect(output.lightness).toBeLessThanOrEqual(0.765)
    expect(output.chroma).toBeLessThanOrEqual(source.chroma + 0.003)
  })

  it('is deterministic, case-insensitive, and rejects non-contract inputs', () => {
    expect(normalizePluginAccentColor('#12ABef')).toEqual(normalizePluginAccentColor('#12abef'))
    expect(normalizePluginAccentColor('#fff')).toBeUndefined()
    expect(normalizePluginAccentColor('12abef')).toBeUndefined()
    expect(normalizePluginAccentColor('#gg0000')).toBeUndefined()
  })
})

describe('normalizeThemeMaterialAccent', () => {
  it.each([
    '#8D51F9',
    '#3F51B5',
    '#1976D2',
    '#00BCD4',
    '#009688',
    '#4CAF50',
    '#FFB400',
    '#FF9800',
    '#FF4C51',
    '#E91E63',
    '#16B1FF',
    '#607D8B',
  ])('keeps preset %s within the material tone contract', sourceHex => {
    const normalized = normalizeThemeMaterialAccent(sourceHex)

    expect(normalized).toBeDefined()
    expect(normalized?.hex).toMatch(/^#[0-9a-f]{6}$/)
    expect(normalized?.rgb).toMatch(/^\d{1,3}, \d{1,3}, \d{1,3}$/)

    const source = hexToOklch(sourceHex)
    const output = hexToOklch(normalized!.hex)
    expect(output.lightness).toBeGreaterThanOrEqual(0.555)
    expect(output.lightness).toBeLessThanOrEqual(0.725)
    expect(output.chroma).toBeLessThanOrEqual(Math.min(source.chroma, 0.14) + 0.005)
    if (source.chroma >= 0.03 && output.chroma >= 0.03)
      expect(hueDistanceDegrees(source.hue, output.hue)).toBeLessThanOrEqual(2)
  })

  it.each(['#000000', '#ffffff', '#7d7d7d', '#ffff00', '#00ffff', '#ff0000'])(
    'keeps extreme %s in gamut without inventing chroma',
    sourceHex => {
      const normalized = normalizeThemeMaterialAccent(sourceHex)
      const source = hexToOklch(sourceHex)
      const output = hexToOklch(normalized!.hex)

      expect(output.lightness).toBeGreaterThanOrEqual(0.555)
      expect(output.lightness).toBeLessThanOrEqual(0.725)
      expect(output.chroma).toBeLessThanOrEqual(Math.min(source.chroma, 0.14) + 0.005)
      if (source.chroma >= 0.03 && output.chroma >= 0.03)
        expect(hueDistanceDegrees(source.hue, output.hue)).toBeLessThanOrEqual(2)
    },
  )

  it('is deterministic, case-insensitive, and rejects non-contract inputs', () => {
    expect(normalizeThemeMaterialAccent('#12ABef')).toEqual(normalizeThemeMaterialAccent('#12abef'))
    expect(normalizeThemeMaterialAccent('#fff')).toBeUndefined()
    expect(normalizeThemeMaterialAccent('12abef')).toBeUndefined()
    expect(normalizeThemeMaterialAccent('#gg0000')).toBeUndefined()
  })
})
