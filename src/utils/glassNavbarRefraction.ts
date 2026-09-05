import {
  getGlassOpticalPresetParameters,
  normalizeGlassOpticalStrength,
  type GlassOpticalParameters,
} from '@/utils/glassOptics'

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
  /** 由当前生效滑杆计算的顶栏光学响应；省略时采用清透自然默认值。 */
  optics?: GlassNavbarOpticalResponse
}

/** 顶栏局部取样预算，不包含共享 renderer 的流动、尾波与惯性。 */
export interface GlassNavbarOpticalResponse {
  /** 横向边缘峰值位移与轮廓带宽之比。 */
  horizontalRatio: number
  /** 纵向峰值位移与轮廓带宽之比，严格小于横向以保护字形高度。 */
  verticalRatio: number
  /** 主体内容统一向右显示的 CSS 像素偏移，外轮廓平缓回零。 */
  translationPx: number
}

/** 导航以低中段可读性为优先，高段保留完整位移预算；不改写共享参数或材质响应。 */
export function getGlassNavbarOpticalResponse(
  parameters: Pick<GlassOpticalParameters, 'deformation' | 'translation'>,
): GlassNavbarOpticalResponse {
  // 两个滑杆分别映射，50% 均使用 12.5% 的光学输入，避免平移维持高强度而抵消阅读改善。
  const deformation = (normalizeGlassOpticalStrength(parameters.deformation) / 100) ** 3
  const translation = (normalizeGlassOpticalStrength(parameters.translation) / 100) ** 3
  return {
    horizontalRatio: 0.42 * (1 - (1 - deformation) ** 3),
    verticalRatio: 0.055 * deformation ** 2,
    translationPx: 17 * translation,
  }
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
const HIGH_REFRACTION_SCALE_PX = 34
const OUTER_NEUTRAL_GUARD_PX = 0.5
const REFRACTION_BAND_PX = 24
// 峰值靠近外沿，内侧有足够距离释放放大率；对称波峰会在窄轮廓内反向采样。
const PEAK_DEPTH_RATIO = 0.16
const DEFAULT_NAVBAR_OPTICS = getGlassNavbarOpticalResponse(getGlassOpticalPresetParameters('clear', 'high', 'natural'))

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

function smoothstep(value: number) {
  return value * value * (3 - 2 * value)
}

/** 外侧快速形成厚度，内侧缓慢回到中性，保留清透中心且不折返背景。 */
function refractionProfile(depth: number, band: number, guard: number) {
  if (depth <= guard || depth >= band) return 0

  const peakDepth = Math.max(guard, band * PEAK_DEPTH_RATIO)
  if (depth <= peakDepth) return smoothstep((depth - guard) / (peakDepth - guard || 1))
  return 1 - smoothstep((depth - peakDepth) / (band - peakDepth))
}

/**
 * 生成圆角表面的法线位移场。
 * 外轮廓回到中性；内部统一平移与局部透镜分开计算，不用弯曲字形代替平移。
 */
export function createGlassNavbarDisplacementField({
  height,
  radius,
  width,
  optics = DEFAULT_NAVBAR_OPTICS,
}: GlassNavbarDisplacementGeometry): GlassNavbarDisplacementField {
  const pixelWidth = normalizePixelSize(width)
  const pixelHeight = normalizePixelSize(height)
  const maxRadius = Math.min(pixelWidth, pixelHeight) / 2
  const pixelRadius = Number.isFinite(radius) ? Math.max(0, Math.min(maxRadius, radius)) : 0
  // 直角固定表面没有圆角半径可供推导，仍使用受最短边约束的直边带；radius=0 不能被当成无折射。
  const radiusBand = pixelRadius > 0 ? pixelRadius * 1.5 : REFRACTION_BAND_PX
  const maximumBand = Math.min(REFRACTION_BAND_PX, radiusBand, Math.min(pixelWidth, pixelHeight) / 2)
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
      // 长直边允许更厚的透镜；向圆角与法线交汇轴渐缩，避免高曲率区产生聚焦尖点。
      const edgeX = Math.min(sampleX, pixelWidth - sampleX)
      const edgeY = Math.min(sampleY, pixelHeight - sampleY)
      const straightWeight = smoothstep(Math.min(1, Math.abs(edgeX - edgeY) / (maximumBand * 2 || 1)))
      const cornerBand = Math.min(maximumBand, pixelRadius)
      // 矩形角点没有圆弧法线；固定带宽交给四条直边的轴向剖面处理，避免角点成为采样断点。
      const bandWidth = pixelRadius === 0 ? maximumBand : cornerBand + (maximumBand - cornerBand) * straightWeight
      const outerGuard = Math.min(OUTER_NEUTRAL_GUARD_PX, bandWidth / 4)
      const channelAmplitude = (bandWidth * optics.horizontalRatio * 255) / HIGH_REFRACTION_SCALE_PX

      if (
        signedDistance > 0 ||
        distanceInside <= outerGuard ||
        bandWidth <= outerGuard ||
        Math.min(pixelWidth, pixelHeight) < 4
      )
        continue

      // 横向平移从边缘透镜退出后进入，避免两种回落梯度叠加导致局部反向采样。
      const horizontalRamp = smoothstep(Math.max(0, Math.min(1, (edgeX - maximumBand) / 64)))
      const verticalRamp = smoothstep(Math.min(1, (edgeY - outerGuard) / Math.max(1, Math.min(12, maximumBand))))
      const translationChannel = (optics.translationPx * horizontalRamp * verticalRamp * 255) / HIGH_REFRACTION_SCALE_PX

      if (pixelRadius === 0) {
        // 矩形的四条直边分别取样，角点用叠加的轴向剖面保持连续，不伪造圆角法线。
        const leftProfile = refractionProfile(sampleX, maximumBand, outerGuard)
        const rightProfile = refractionProfile(pixelWidth - sampleX, maximumBand, outerGuard)
        const topProfile = refractionProfile(sampleY, maximumBand, outerGuard)
        const bottomProfile = refractionProfile(pixelHeight - sampleY, maximumBand, outerGuard)
        const verticalAmplitude = (maximumBand * optics.verticalRatio * 255) / HIGH_REFRACTION_SCALE_PX
        const offset = (y * pixelWidth + x) * 4

        pixels[offset] = clampChannel(
          DISPLACEMENT_NEUTRAL_CHANNEL + channelAmplitude * (rightProfile - leftProfile) + translationChannel,
        )
        pixels[offset + 2] = clampChannel(
          DISPLACEMENT_NEUTRAL_CHANNEL + verticalAmplitude * (bottomProfile - topProfile),
        )
        continue
      }

      const profile = distanceInside < bandWidth ? refractionProfile(distanceInside, bandWidth, outerGuard) : 0
      const verticalProgress = Math.min(1, (distanceInside - outerGuard) / (bandWidth - outerGuard))
      const verticalProfile = Math.sin(Math.PI * verticalProgress) ** 2
      const verticalAmplitude = (bandWidth * optics.verticalRatio * 255) / HIGH_REFRACTION_SCALE_PX
      const gradientX =
        roundedRectangleSignedDistance(sampleX + 0.5, sampleY, pixelWidth, pixelHeight, pixelRadius) -
        roundedRectangleSignedDistance(sampleX - 0.5, sampleY, pixelWidth, pixelHeight, pixelRadius)
      const gradientY =
        roundedRectangleSignedDistance(sampleX, sampleY + 0.5, pixelWidth, pixelHeight, pixelRadius) -
        roundedRectangleSignedDistance(sampleX, sampleY - 0.5, pixelWidth, pixelHeight, pixelRadius)
      const gradientLength = Math.hypot(gradientX, gradientY) || 1
      const offset = (y * pixelWidth + x) * 4
      pixels[offset] = clampChannel(
        DISPLACEMENT_NEUTRAL_CHANNEL + (channelAmplitude * gradientX * profile) / gradientLength + translationChannel,
      )
      pixels[offset + 2] = clampChannel(
        DISPLACEMENT_NEUTRAL_CHANNEL + (verticalAmplitude * gradientY * verticalProfile) / gradientLength,
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
