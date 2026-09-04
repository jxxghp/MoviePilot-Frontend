export interface GlassNavbarRefractionBrowserIdentity {
  /** User-Agent Client Hints 暴露的浏览器品牌。 */
  userAgentData?: {
    brands?: readonly {
      brand: string
    }[]
  }
  /** Client Hints 不可用时使用的传统浏览器标识。 */
  userAgent: string
}

export interface GlassNavbarDisplacementGeometry {
  /** 折射表面的实际 CSS 像素高度。 */
  height: number
  /** 最终可见外轮廓的圆角半径。 */
  radius: number
  /** 折射表面的实际 CSS 像素宽度。 */
  width: number
}

export interface GlassNavbarDisplacementField {
  /** 位移图的 CSS 像素高度。 */
  height: number
  /** 按 RGBA 顺序存储的非预乘像素通道。 */
  pixels: Uint8ClampedArray
  /** 位移图的 CSS 像素宽度。 */
  width: number
}

export const NEUTRAL_GLASS_NAVBAR_DISPLACEMENT_MAP =
  'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="1" height="1"%3E%3Cpath fill="%23808080" d="M0 0h1v1H0z"/%3E%3C/svg%3E'

const DISPLACEMENT_NEUTRAL_CHANNEL = 128
const DISPLACEMENT_CHANNEL_AMPLITUDE = 127
const OUTER_NEUTRAL_GUARD_PX = 2
const REFRACTION_BAND_PX = 12
const REFRACTION_PROFILE_POWER = 2

function normalizePixelSize(value: number) {
  return Number.isFinite(value) ? Math.max(1, Math.round(value)) : 1
}

function roundedRectangleSignedDistance(x: number, y: number, width: number, height: number, radius: number) {
  const offsetX = Math.abs(x - width / 2) - (width / 2 - radius)
  const offsetY = Math.abs(y - height / 2) - (height / 2 - radius)
  const outsideX = Math.max(offsetX, 0)
  const outsideY = Math.max(offsetY, 0)

  return Math.hypot(outsideX, outsideY) + Math.min(Math.max(offsetX, offsetY), 0) - radius
}

function clampChannel(value: number) {
  return Math.max(0, Math.min(255, Math.round(value)))
}

/**
 * 生成圆角表面的法线位移场。
 * 外轮廓和内区都保持中性采样，避免折射在裁剪边界或主体内容区形成整带错位。
 */
export function createGlassNavbarDisplacementField({
  height,
  radius,
  width,
}: GlassNavbarDisplacementGeometry): GlassNavbarDisplacementField {
  const pixelWidth = normalizePixelSize(width)
  const pixelHeight = normalizePixelSize(height)
  const maxRadius = Math.min(pixelWidth, pixelHeight) / 2
  const pixelRadius = Number.isFinite(radius) ? Math.max(0, Math.min(maxRadius, radius)) : 0
  const bandWidth = Math.min(REFRACTION_BAND_PX, Math.min(pixelWidth, pixelHeight) / 2)
  const outerGuard = Math.min(OUTER_NEUTRAL_GUARD_PX, bandWidth / 4)
  const pixels = new Uint8ClampedArray(pixelWidth * pixelHeight * 4)

  for (let offset = 0; offset < pixels.length; offset += 4) {
    pixels[offset] = DISPLACEMENT_NEUTRAL_CHANNEL
    pixels[offset + 1] = DISPLACEMENT_NEUTRAL_CHANNEL
    pixels[offset + 2] = DISPLACEMENT_NEUTRAL_CHANNEL
    pixels[offset + 3] = 255
  }

  for (let y = 0; y < pixelHeight; y += 1) {
    for (let x = 0; x < pixelWidth; x += 1) {
      const sampleX = x + 0.5
      const sampleY = y + 0.5
      const signedDistance = roundedRectangleSignedDistance(sampleX, sampleY, pixelWidth, pixelHeight, pixelRadius)
      const distanceInside = -signedDistance

      if (signedDistance > 0 || distanceInside <= outerGuard || distanceInside >= bandWidth) continue

      const normalizedDistance = (distanceInside - outerGuard) / (bandWidth - outerGuard)
      const profile = Math.sin(Math.PI * normalizedDistance) ** REFRACTION_PROFILE_POWER
      const gradientX =
        roundedRectangleSignedDistance(sampleX + 0.5, sampleY, pixelWidth, pixelHeight, pixelRadius) -
        roundedRectangleSignedDistance(sampleX - 0.5, sampleY, pixelWidth, pixelHeight, pixelRadius)
      const gradientY =
        roundedRectangleSignedDistance(sampleX, sampleY + 0.5, pixelWidth, pixelHeight, pixelRadius) -
        roundedRectangleSignedDistance(sampleX, sampleY - 0.5, pixelWidth, pixelHeight, pixelRadius)
      const gradientLength = Math.hypot(gradientX, gradientY) || 1
      const offset = (y * pixelWidth + x) * 4

      pixels[offset] = clampChannel(
        DISPLACEMENT_NEUTRAL_CHANNEL + (DISPLACEMENT_CHANNEL_AMPLITUDE * gradientX * profile) / gradientLength,
      )
      pixels[offset + 2] = clampChannel(
        DISPLACEMENT_NEUTRAL_CHANNEL + (DISPLACEMENT_CHANNEL_AMPLITUDE * gradientY * profile) / gradientLength,
      )
    }
  }

  return { height: pixelHeight, pixels, width: pixelWidth }
}

/** 把位移场栅格化为浏览器可直接加载的无损 PNG。 */
export function createGlassNavbarDisplacementMap(geometry: GlassNavbarDisplacementGeometry) {
  const field = createGlassNavbarDisplacementField(geometry)
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')

  if (!context) return NEUTRAL_GLASS_NAVBAR_DISPLACEMENT_MAP

  canvas.width = field.width
  canvas.height = field.height
  const imageData = context.createImageData(field.width, field.height)

  imageData.data.set(field.pixels)
  context.putImageData(imageData, 0, 0)

  return canvas.toDataURL('image/png')
}

/** 仅在已验证 SVG backdrop 位移的 Chromium 引擎启用实时顶栏折射。 */
export function supportsGlassNavbarLiveRefraction(browserIdentity: GlassNavbarRefractionBrowserIdentity = navigator) {
  const brands = browserIdentity.userAgentData?.brands
  if (brands?.length) return brands.some(({ brand }) => brand === 'Chromium')

  return /\b(?:Chrome|Chromium)\/\d+/u.test(browserIdentity.userAgent)
}
