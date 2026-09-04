import { describe, expect, it } from 'vitest'
import { createGlassNavbarDisplacementField, supportsGlassNavbarLiveRefraction } from '@/utils/glassNavbarRefraction'

describe('createGlassNavbarDisplacementField', () => {
  function pixelAt(field: ReturnType<typeof createGlassNavbarDisplacementField>, x: number, y: number) {
    const offset = (y * field.width + x) * 4

    return [...field.pixels.slice(offset, offset + 4)]
  }

  it('keeps both contour boundary and interior neutral while bending only the narrow rim', () => {
    const field = createGlassNavbarDisplacementField({ height: 41, radius: 12, width: 101 })

    expect(field.width).toBe(101)
    expect(field.height).toBe(41)
    expect(pixelAt(field, 50, 0)).toEqual([128, 128, 128, 255])
    expect(pixelAt(field, 50, 20)).toEqual([128, 128, 128, 255])
    expect(pixelAt(field, 50, 5)[2]).toBeLessThan(64)
    expect(pixelAt(field, 5, 20)[0]).toBeLessThan(64)
    expect(pixelAt(field, 95, 20)[0]).toBeGreaterThan(192)
    expect(pixelAt(field, 50, 35)[2]).toBeGreaterThan(192)
  })

  it('clamps invalidly small geometry to a renderable pixel surface', () => {
    const field = createGlassNavbarDisplacementField({ height: 0, radius: 20, width: -10 })

    expect(field.width).toBe(1)
    expect(field.height).toBe(1)
    expect([...field.pixels]).toEqual([128, 128, 128, 255])
  })
})

describe('supportsGlassNavbarLiveRefraction', () => {
  it('enables the verified Chromium engine path for Chrome and Edge', () => {
    expect(
      supportsGlassNavbarLiveRefraction({
        userAgent: 'Mozilla/5.0 Chrome/140.0.0.0 Safari/537.36',
        userAgentData: {
          brands: [{ brand: 'Chromium' }, { brand: 'Google Chrome' }],
        },
      }),
    ).toBe(true)
    expect(
      supportsGlassNavbarLiveRefraction({
        userAgent: 'Mozilla/5.0 Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0',
        userAgentData: {
          brands: [{ brand: 'Chromium' }, { brand: 'Microsoft Edge' }],
        },
      }),
    ).toBe(true)
  })

  it.each([
    ['Safari', 'Mozilla/5.0 Version/26.4 Safari/605.1.15'],
    ['iOS Chrome', 'Mozilla/5.0 CriOS/140.0.0.0 Mobile/15E148 Safari/604.1'],
    ['Firefox', 'Mozilla/5.0 Firefox/142.0'],
  ])('keeps %s on the stable Goal 1 material', (_browser, userAgent) => {
    expect(supportsGlassNavbarLiveRefraction({ userAgent })).toBe(false)
  })
})
