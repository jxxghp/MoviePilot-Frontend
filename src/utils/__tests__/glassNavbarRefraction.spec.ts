import { describe, expect, it } from 'vitest'
import {
  createGlassNavbarDisplacementField,
  getGlassNavbarOpticalResponse,
  supportsGlassNavbarLiveRefraction,
} from '@/utils/glassNavbarRefraction'

describe('getGlassNavbarOpticalResponse', () => {
  it('prioritizes default reading while retaining the horizontal lens', () => {
    const optics = getGlassNavbarOpticalResponse({ deformation: 48, translation: 48 })
    expect(optics.translationPx).toBeCloseTo(1.880064)
    expect(optics.verticalRatio * 24).toBeLessThan(0.02)
    expect(optics.horizontalRatio * 24).toBeGreaterThan(2.9)
  })
  it.each([
    [0, 0],
    [50, 2.125],
    [80, 8.704],
    [99, 16.495083],
    [100, 17],
  ])('maps translation %s to the readable curve at %s pixels', (translation, pixels) => {
    expect(getGlassNavbarOpticalResponse({ deformation: 48, translation }).translationPx).toBeCloseTo(pixels)
  })
  it('keeps the midpoint deformation equivalent to the original 12.5% input', () => {
    const parameters = Object.freeze({ deformation: 50, translation: 50 })
    const optics = getGlassNavbarOpticalResponse(parameters)
    expect(optics.horizontalRatio).toBeCloseTo(0.1386328125)
    expect(optics.verticalRatio).toBeCloseTo(0.000859375)
    expect(parameters).toEqual({ deformation: 50, translation: 50 })
  })
  it('separates translation from deformation and limits the maximum translation', () => {
    expect(getGlassNavbarOpticalResponse({ deformation: 0, translation: 100 })).toEqual({
      horizontalRatio: 0,
      verticalRatio: 0,
      translationPx: 17,
    })
    expect(getGlassNavbarOpticalResponse({ deformation: 100, translation: 0 })).toEqual({
      horizontalRatio: 0.42,
      verticalRatio: 0.055,
      translationPx: 0,
    })
    expect(getGlassNavbarOpticalResponse({ deformation: -30, translation: 300 }).translationPx).toBe(17)
    expect(getGlassNavbarOpticalResponse({ deformation: 48, translation: 99 }).translationPx).toBeGreaterThan(16)
    expect(getGlassNavbarOpticalResponse({ deformation: 48, translation: 99 }).translationPx).toBeLessThan(17)
  })
})

describe('createGlassNavbarDisplacementField', () => {
  function pixelAt(field: ReturnType<typeof createGlassNavbarDisplacementField>, x: number, y: number) {
    const offset = (y * field.width + x) * 4

    return [...field.pixels.slice(offset, offset + 4)]
  }

  it('keeps both contour boundary and interior neutral while bending only the narrow rim', () => {
    const field = createGlassNavbarDisplacementField({
      height: 41,
      radius: 12,
      width: 101,
      optics: getGlassNavbarOpticalResponse({ deformation: 100, translation: 0 }),
    })

    expect(field.width).toBe(101)
    expect(field.height).toBe(41)
    expect(pixelAt(field, 50, 0)).toEqual([128, 128, 128, 255])
    expect(pixelAt(field, 50, 20)).toEqual([128, 128, 128, 255])
    expect(pixelAt(field, 50, 5)[2]).toBeLessThan(128)
    expect(pixelAt(field, 5, 20)[0]).toBeLessThan(120)
    expect(pixelAt(field, 95, 20)[0]).toBeGreaterThan(136)
    expect(pixelAt(field, 50, 35)[2]).toBeGreaterThan(128)
  })

  it.each([
    { width: 1423, height: 64, radius: 16 },
    { width: 401, height: 72, radius: 16 },
    { width: 127, height: 64, radius: 8 },
    { width: 127, height: 64, radius: 32 },
    { width: 260, height: 800, radius: 0 },
    { width: 68, height: 862, radius: 0 },
  ])('keeps two-dimensional sampling forward and inside the image for $width x $height r$radius', geometry => {
    for (const deformation of [0, 48, 100])
      for (const translation of [0, 48, 100])
        for (const scale of [-22, -34]) {
          const field = createGlassNavbarDisplacementField({
            ...geometry,
            optics: getGlassNavbarOpticalResponse({ deformation, translation }),
          })
          const source = (x: number, y: number) => {
            const pixel = pixelAt(field, x, y)
            return [x + 0.5 + scale * (pixel[0] / 255 - 0.5), y + 0.5 + scale * (pixel[2] / 255 - 0.5)]
          }
          let minimumDeterminant = Number.POSITIVE_INFINITY
          let minimumX = Number.POSITIVE_INFINITY
          let minimumY = Number.POSITIVE_INFINITY
          let maximumX = 0
          let maximumY = 0
          for (let y = 0; y < field.height; y += 1) {
            for (let x = 0; x < field.width; x += 1) {
              const point = source(x, y)
              minimumX = Math.min(minimumX, point[0])
              minimumY = Math.min(minimumY, point[1])
              maximumX = Math.max(maximumX, point[0])
              maximumY = Math.max(maximumY, point[1])
              if (x === field.width - 1 || y === field.height - 1) continue
              const nextX = source(x + 1, y)
              const nextY = source(x, y + 1)
              const determinant =
                (nextX[0] - point[0]) * (nextY[1] - point[1]) - (nextY[0] - point[0]) * (nextX[1] - point[1])
              minimumDeterminant = Math.min(minimumDeterminant, determinant)
            }
          }
          expect(minimumDeterminant).toBeGreaterThan(0.05)
          expect(minimumX).toBeGreaterThanOrEqual(0)
          expect(minimumY).toBeGreaterThanOrEqual(0)
          expect(maximumX).toBeLessThanOrEqual(field.width)
          expect(maximumY).toBeLessThanOrEqual(field.height)
        }
  })

  it('keeps a fixed rectangle optically active without substituting a rounded corner', () => {
    const field = createGlassNavbarDisplacementField({
      height: 800,
      radius: 0,
      width: 260,
      optics: getGlassNavbarOpticalResponse({ deformation: 100, translation: 0 }),
    })

    expect(pixelAt(field, 130, 0)).toEqual([128, 128, 128, 255])
    expect(pixelAt(field, 130, 8)[2]).toBeLessThan(128)
    expect(pixelAt(field, 8, 400)[0]).toBeLessThan(128)
    expect(pixelAt(field, 8, 8)[0]).toBeLessThan(128)
    expect(pixelAt(field, 8, 8)[2]).toBeLessThan(128)
  })

  it('clamps invalidly small geometry to a renderable pixel surface', () => {
    const field = createGlassNavbarDisplacementField({ height: 0, radius: 20, width: -10 })

    expect(field.width).toBe(1)
    expect(field.height).toBe(1)
    expect([...field.pixels]).toEqual([128, 128, 128, 255])
  })

  it('limits vertical text stretching without flattening the horizontal lens', () => {
    const field = createGlassNavbarDisplacementField({ width: 1423, height: 64, radius: 16 })
    const displacement = (x: number, y: number, channel: number) => -34 * (pixelAt(field, x, y)[channel] / 255 - 0.5)
    let maximumHorizontal = 0
    let maximumVertical = 0
    let minimumVerticalStep = Infinity
    let maximumVerticalStep = 0
    for (let y = 1; y < field.height; y += 1) {
      const previous = displacement(711, y - 1, 2)
      const current = displacement(711, y, 2)
      maximumVertical = Math.max(maximumVertical, Math.abs(current))
      minimumVerticalStep = Math.min(minimumVerticalStep, 1 + current - previous)
      maximumVerticalStep = Math.max(maximumVerticalStep, 1 + current - previous)
    }
    for (let x = 0; x < 32; x += 1) maximumHorizontal = Math.max(maximumHorizontal, Math.abs(displacement(x, 32, 0)))
    expect(maximumHorizontal).toBeGreaterThan(1.5)
    expect(maximumVertical).toBeLessThan(0.5)
    expect(minimumVerticalStep).toBeGreaterThan(0.85)
    expect(maximumVerticalStep).toBeLessThan(1.15)
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
