import { describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import displacementFixtures from './fixtures/glass-displacement-fields.json'
import {
  createGlassNavbarDisplacementField,
  createGlassPanelBackdropField,
  getGlassNavbarOpticalResponse,
  getGlassSidebarOpticalResponse,
  supportsGlassNavbarLiveRefraction,
  type GlassNavbarDisplacementGeometry,
} from '@/utils/glassNavbarRefraction'

type GlassPanelBackdropGeometry = Parameters<typeof createGlassPanelBackdropField>[0]

function roundedRectangleSignedDistanceReference(x: number, y: number, width: number, height: number, radius: number) {
  const offsetX = Math.abs(x - width / 2) - (width / 2 - radius)
  const offsetY = Math.abs(y - height / 2) - (height / 2 - radius)
  const outsideX = Math.max(offsetX, 0)
  const outsideY = Math.max(offsetY, 0)
  const outsideDistance = outsideX === 0 && outsideY === 0 ? 0 : Math.hypot(outsideX, outsideY)

  return outsideDistance + Math.min(Math.max(offsetX, offsetY), 0) - radius
}

// 独立标量合成保护圆角裁剪、覆盖顺序和透明通道契约，避免优化路径与自身比较。
function createScalarGlassPanelBackdropReference({ width, height, panels, optics }: GlassPanelBackdropGeometry) {
  const pixelWidth = Number.isFinite(width) ? Math.max(1, Math.round(width)) : 1
  const pixelHeight = Number.isFinite(height) ? Math.max(1, Math.round(height)) : 1
  const pixels = new Uint8ClampedArray(pixelWidth * pixelHeight * 4)
  for (let offset = 0; offset < pixels.length; offset += 4) {
    pixels[offset] = 128
    pixels[offset + 1] = 255
    pixels[offset + 2] = 128
    pixels[offset + 3] = 255
  }

  for (const panel of panels) {
    const field = createGlassNavbarDisplacementField({ ...panel, optics, surface: 'panel' })
    const left = Math.round(panel.x)
    const top = Math.round(panel.y)
    const radius = Math.max(0, Math.min(panel.radius, field.width / 2, field.height / 2))
    for (let y = Math.max(0, -top); y < Math.min(field.height, pixelHeight - top); y += 1) {
      for (let x = Math.max(0, -left); x < Math.min(field.width, pixelWidth - left); x += 1) {
        if (roundedRectangleSignedDistanceReference(x + 0.5, y + 0.5, field.width, field.height, radius) > 0) continue
        const source = (y * field.width + x) * 4
        const destination = ((top + y) * pixelWidth + left + x) * 4
        pixels.set(field.pixels.subarray(source, source + 4), destination)
      }
    }
  }

  return { width: pixelWidth, height: pixelHeight, pixels }
}

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

describe('getGlassSidebarOpticalResponse', () => {
  it.each([0, 50, 99, 100])('keeps the same cubic sliders and equal corner axes at %s', strength => {
    const parameters = Object.freeze({ deformation: strength, translation: strength })
    const optics = getGlassSidebarOpticalResponse(parameters)
    expect(optics.horizontalRatio).toBe(optics.verticalRatio)
    expect(optics.horizontalRatio).toBeLessThanOrEqual(0.3)
    expect(optics.translationPx).toBe(getGlassNavbarOpticalResponse(parameters).translationPx)
  })
})

describe('createGlassNavbarDisplacementField', () => {
  // 完整图像指纹同时保护位移、圆角与散射权重，计算路径优化不能改变任何 RGBA 字节。
  it.each(displacementFixtures)(
    'preserves all RGBA bytes for $geometry.surface $geometry.width x $geometry.height r$geometry.radius at $parameters.translation',
    ({ geometry, parameters, sha256 }) => {
      const field = createGlassNavbarDisplacementField({
        ...(geometry as GlassNavbarDisplacementGeometry),
        optics:
          geometry.surface === 'navbar'
            ? getGlassNavbarOpticalResponse(parameters)
            : getGlassSidebarOpticalResponse(parameters),
      })
      expect(createHash('sha256').update(field.pixels).digest('hex')).toBe(sha256)
    },
  )

  function pixelAt(field: ReturnType<typeof createGlassNavbarDisplacementField>, x: number, y: number) {
    const offset = (y * field.width + x) * 4

    return [...field.pixels.slice(offset, offset + 4)]
  }

  type DisplacementField = ReturnType<typeof createGlassNavbarDisplacementField>
  type DisplacementPoint = [number, number]
  type DisplacementPointReader = (x: number, y: number) => DisplacementPoint

  function bilinearChannel(field: DisplacementField, x: number, y: number, channel: number) {
    const clampedX = Math.max(0, Math.min(field.width - 1, x))
    const clampedY = Math.max(0, Math.min(field.height - 1, y))
    const x0 = Math.floor(clampedX)
    const y0 = Math.floor(clampedY)
    const x1 = Math.min(field.width - 1, x0 + 1)
    const y1 = Math.min(field.height - 1, y0 + 1)
    const progressX = clampedX - x0
    const progressY = clampedY - y0
    const top = pixelAt(field, x0, y0)[channel] * (1 - progressX) + pixelAt(field, x1, y0)[channel] * progressX
    const bottom = pixelAt(field, x0, y1)[channel] * (1 - progressX) + pixelAt(field, x1, y1)[channel] * progressX

    return top * (1 - progressY) + bottom * progressY
  }

  function directDisplacementPoint(field: DisplacementField, x: number, y: number, scale: number): DisplacementPoint {
    const pixel = pixelAt(field, x, y)

    return [x + 0.5 + scale * (pixel[0] / 255 - 0.5), y + 0.5 + scale * (pixel[2] / 255 - 0.5)]
  }

  /** 模拟 feImage preserveAspectRatio=none 在目标 CSS 尺寸中的双线性取样。 */
  function scaledDisplacementPoint(
    field: DisplacementField,
    targetWidth: number,
    targetHeight: number,
    x: number,
    y: number,
    scale: number,
  ): DisplacementPoint {
    const mapX = (x + 0.5) * (field.width / targetWidth) - 0.5
    const mapY = (y + 0.5) * (field.height / targetHeight) - 0.5

    return [
      x + 0.5 + scale * (bilinearChannel(field, mapX, mapY, 0) / 255 - 0.5),
      y + 0.5 + scale * (bilinearChannel(field, mapX, mapY, 2) / 255 - 0.5),
    ]
  }

  function displacementSamplingMetrics(width: number, height: number, readPoint: DisplacementPointReader) {
    let minimumDeterminant = Number.POSITIVE_INFINITY
    let minimumX = Number.POSITIVE_INFINITY
    let minimumY = Number.POSITIVE_INFINITY
    let maximumX = Number.NEGATIVE_INFINITY
    let maximumY = Number.NEGATIVE_INFINITY

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const point = readPoint(x, y)
        minimumX = Math.min(minimumX, point[0])
        minimumY = Math.min(minimumY, point[1])
        maximumX = Math.max(maximumX, point[0])
        maximumY = Math.max(maximumY, point[1])
        if (x === width - 1 || y === height - 1) continue

        const nextX = readPoint(x + 1, y)
        const nextY = readPoint(x, y + 1)
        const determinant =
          (nextX[0] - point[0]) * (nextY[1] - point[1]) - (nextY[0] - point[0]) * (nextX[1] - point[1])
        minimumDeterminant = Math.min(minimumDeterminant, determinant)
      }
    }

    return { maximumX, maximumY, minimumDeterminant, minimumX, minimumY }
  }

  function maximumPointDifference(
    width: number,
    height: number,
    first: DisplacementPointReader,
    second: DisplacementPointReader,
  ) {
    let maximumDifference = 0

    for (let y = 0; y < height; y += 1)
      for (let x = 0; x < width; x += 1) {
        const firstPoint = first(x, y)
        const secondPoint = second(x, y)
        maximumDifference = Math.max(
          maximumDifference,
          Math.hypot(firstPoint[0] - secondPoint[0], firstPoint[1] - secondPoint[1]),
        )
      }

    return maximumDifference
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

  it('encodes a monotonic diffusion mask without changing the panel displacement channels', () => {
    const field = createGlassNavbarDisplacementField({ width: 400, height: 240, radius: 20, surface: 'panel' })
    const weights = Array.from({ length: 24 }, (_, y) => pixelAt(field, 200, y)[1])
    expect(weights[0]).toBe(0)
    expect(weights[weights.length - 1]).toBe(255)
    expect(weights.every((value, index) => index === 0 || value >= weights[index - 1])).toBe(true)
    expect(pixelAt(field, 0, 0)[1]).toBe(0)
    expect(pixelAt(field, 200, 120)[1]).toBe(255)
  })

  it('places backdrop contours in their real coordinates without overwriting rounded gaps', () => {
    const field = createGlassPanelBackdropField({
      width: 100,
      height: 80,
      optics: getGlassSidebarOpticalResponse({ deformation: 0, translation: 0 }),
      panels: [
        { x: 10, y: 10, width: 70, height: 60, radius: 10 },
        { x: 30, y: 15, width: 50, height: 40, radius: 10 },
      ],
    })
    expect(pixelAt(field, 5, 5)).toEqual([128, 255, 128, 255])
    expect(pixelAt(field, 10, 10)[1]).toBe(255)
    expect(pixelAt(field, 25, 10)[1]).toBe(0)
    expect(pixelAt(field, 35, 15)[1]).toBe(255)
    expect(pixelAt(field, 45, 15)[1]).toBe(0)
    expect(pixelAt(field, 50, 40)[1]).toBe(255)
  })

  it.each([
    {
      width: 0,
      height: -4,
      panels: [{ x: -0.5, y: 0.5, width: 0, height: 0, radius: 99 }],
    },
    {
      width: 3,
      height: 2,
      panels: [
        { x: 0.5, y: 0.5, width: 3, height: 2, radius: 99 },
        { x: 1.5, y: -0.5, width: 2, height: 1, radius: -4 },
      ],
    },
    {
      width: 11,
      height: 9,
      panels: [
        { x: -2.5, y: -1.5, width: 8, height: 7, radius: 3.5 },
        { x: 4.5, y: 2.5, width: 6, height: 6, radius: 1.5 },
      ],
    },
    {
      width: 13,
      height: 7,
      panels: [
        { x: 13.5, y: 0.5, width: 5, height: 5, radius: 2 },
        { x: -7.5, y: 1.5, width: 5, height: 4, radius: 2 },
      ],
    },
    {
      width: 16,
      height: 12,
      panels: [
        { x: 3.5, y: 2.5, width: 8, height: 7, radius: Number.NaN },
        { x: 4.5, y: 3.5, width: 7, height: 6, radius: 4 },
      ],
    },
    {
      width: 8,
      height: 8,
      panels: [
        { x: 99, y: 99, width: 4, height: 4, radius: 2 },
        { x: -99, y: -99, width: 4, height: 4, radius: 2 },
        { x: 2.5, y: 2.5, width: 4, height: 4, radius: Number.POSITIVE_INFINITY },
      ],
    },
    {
      width: 5,
      height: 4,
      panels: [],
    },
    // 窄圆形覆盖奇偶宽度，并把每一行分别贴到背板的上下边界。
    {
      width: 18,
      height: 18,
      panels: [
        { x: 0, y: 0, width: 1, height: 1, radius: 0.5 },
        { x: 2, y: 0, width: 2, height: 2, radius: 1 },
        { x: 5, y: 0, width: 3, height: 3, radius: 1.5 },
        { x: 9, y: 0, width: 4, height: 4, radius: 2 },
        { x: 14, y: 0, width: 5, height: 5, radius: 2.5 },
        { x: 0, y: 17, width: 1, height: 1, radius: 0.5 },
        { x: 2, y: 16, width: 2, height: 2, radius: 1 },
        { x: 5, y: 15, width: 3, height: 3, radius: 1.5 },
        { x: 9, y: 14, width: 4, height: 4, radius: 2 },
        { x: 13, y: 13, width: 5, height: 5, radius: 2.5 },
      ],
    },
  ])('matches the independent scalar backdrop reference for $width x $height', geometry => {
    const input = {
      ...geometry,
      optics: getGlassSidebarOpticalResponse({ deformation: 80, translation: 80 }),
    }
    const expected = createScalarGlassPanelBackdropReference(input)
    const actual = createGlassPanelBackdropField(input)

    expect(actual.width).toBe(expected.width)
    expect(actual.height).toBe(expected.height)
    expect([...actual.pixels]).toEqual([...expected.pixels])
  })

  it.each([
    { width: 1423, height: 64, radius: 16 },
    { width: 401, height: 72, radius: 16 },
    { width: 127, height: 64, radius: 8 },
    { width: 127, height: 64, radius: 32 },
    { width: 260, height: 800, radius: 0 },
    { width: 68, height: 862, radius: 0 },
    { width: 252, height: 846, radius: 16 },
    { width: 60, height: 846, radius: 16 },
    { width: 252, height: 846, radius: 8 },
    { width: 252, height: 846, radius: 24 },
    { width: 60, height: 846, radius: 8 },
    { width: 60, height: 846, radius: 24 },
    ...[60, 252].flatMap(width =>
      [0, 8, 12, 16, 20, 24].map(radius => ({ width, height: 180, radius, surface: 'sidebar' as const })),
    ),
    { width: 1163, height: 448, radius: 20, surface: 'panel' as const },
    { width: 358, height: 300, radius: 20, surface: 'panel' as const },
    { width: 140, height: 120, radius: 8, surface: 'panel' as const },
    { width: 140, height: 120, radius: 32, surface: 'panel' as const },
  ])('keeps two-dimensional sampling forward and inside the image for $width x $height r$radius', geometry => {
    for (const deformation of [0, 48, 100])
      for (const translation of [0, 48, 100])
        for (const scale of [-22, -34]) {
          const field = createGlassNavbarDisplacementField({
            ...geometry,
            optics:
              'surface' in geometry
                ? getGlassSidebarOpticalResponse({ deformation, translation })
                : getGlassNavbarOpticalResponse({ deformation, translation }),
          })
          const metrics = displacementSamplingMetrics(field.width, field.height, (x, y) =>
            directDisplacementPoint(field, x, y, scale),
          )
          expect(metrics.minimumDeterminant).toBeGreaterThan(0.05)
          expect(metrics.minimumX).toBeGreaterThanOrEqual(0)
          expect(metrics.minimumY).toBeGreaterThanOrEqual(0)
          expect(metrics.maximumX).toBeLessThanOrEqual(field.width)
          expect(metrics.maximumY).toBeLessThanOrEqual(field.height)
        }
  })

  it.each([
    { finalWidth: 1423, currentWidth: 1455 },
    { finalWidth: 928, currentWidth: 960 },
  ])(
    'keeps bilinearly scaled navbar sampling bounded from $finalWidth to $currentWidth',
    ({ finalWidth, currentWidth }) => {
      for (const radius of [8, 24])
        for (const deformation of [0, 48, 100])
          for (const translation of [0, 48, 100]) {
            const field = createGlassNavbarDisplacementField({
              width: finalWidth,
              height: 64,
              radius,
              optics: getGlassNavbarOpticalResponse({ deformation, translation }),
            })

            for (const scale of [-22, -34]) {
              const metrics = displacementSamplingMetrics(currentWidth, field.height, (x, y) =>
                scaledDisplacementPoint(field, currentWidth, field.height, x, y, scale),
              )
              expect(metrics.minimumDeterminant).toBeGreaterThan(0.05)
              expect(metrics.minimumX).toBeGreaterThanOrEqual(0)
              expect(metrics.minimumY).toBeGreaterThanOrEqual(0)
              expect(metrics.maximumX).toBeLessThanOrEqual(currentWidth)
              expect(metrics.maximumY).toBeLessThanOrEqual(field.height)
            }
          }
    },
  )

  it.each([1423, 928])('keeps the final %s pixel endpoint exactly equivalent', finalWidth => {
    for (const radius of [8, 24])
      for (const deformation of [0, 48, 100])
        for (const translation of [0, 48, 100]) {
          const field = createGlassNavbarDisplacementField({
            width: finalWidth,
            height: 64,
            radius,
            optics: getGlassNavbarOpticalResponse({ deformation, translation }),
          })

          for (const scale of [-22, -34]) {
            const maximumDifference = maximumPointDifference(
              finalWidth,
              field.height,
              (x, y) => scaledDisplacementPoint(field, finalWidth, field.height, x, y, scale),
              (x, y) => directDisplacementPoint(field, x, y, scale),
            )
            expect(maximumDifference).toBeCloseTo(0, 12)
          }
        }
  })

  it.each([8, 12, 16, 20, 24])('turns all four sidebar corners with one radial profile at radius %s', radius => {
    const field = createGlassNavbarDisplacementField({
      width: 252,
      height: 180,
      radius,
      surface: 'sidebar',
      optics: getGlassSidebarOpticalResponse({ deformation: 50, translation: 0 }),
    })
    for (let y = 0; y < radius; y += 1)
      for (let x = 0; x < radius; x += 1) {
        const topLeft = pixelAt(field, x, y)
        const topRight = pixelAt(field, field.width - 1 - x, y)
        const bottomLeft = pixelAt(field, x, field.height - 1 - y)
        const bottomRight = pixelAt(field, field.width - 1 - x, field.height - 1 - y)
        expect(topLeft[0] + topRight[0]).toBe(256)
        expect(topLeft[2] + bottomLeft[2]).toBe(256)
        expect(bottomRight[0]).toBe(topRight[0])
        expect(bottomRight[2]).toBe(bottomLeft[2])
        expect(pixelAt(field, y, x)[0]).toBe(topLeft[2])
      }
    expect(pixelAt(field, 126, 2)[2]).toBeLessThan(128)
    expect(pixelAt(field, 126, 177)[2]).toBeGreaterThan(128)
    expect(pixelAt(field, 126, 90)).toEqual([128, 128, 128, 255])
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
