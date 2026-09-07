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
  /** 顶栏保护字形高度；侧栏使用窄边透镜；大面板沿长边展开光学过渡。 */
  surface?: 'navbar' | 'sidebar' | 'panel'
  /** 折射表面的实际 CSS 像素高度。 */
  height: number
  /** 最终可见外轮廓的圆角半径。 */
  radius: number
  /** 折射表面的实际 CSS 像素宽度。 */
  width: number
  /** 由当前生效滑杆计算的导航光学响应；省略时采用清透自然默认值。 */
  optics?: GlassNavbarOpticalResponse
}

/** 导航局部取样预算，不包含共享 renderer 的流动、尾波与惯性。 */
export interface GlassNavbarOpticalResponse {
  /** 横向边缘峰值位移与轮廓带宽之比。 */
  horizontalRatio: number
  /** 纵向峰值位移与轮廓带宽之比；顶栏弱于横向，侧栏沿四边等向响应。 */
  verticalRatio: number
  /** 主体内容统一向右显示的 CSS 像素偏移，外轮廓平缓回零。 */
  translationPx: number
}

/** 侧栏的阅读区由窄边带保护，圆角处两轴使用相同强度，避免转角时透镜厚度消失。 */
export function getGlassSidebarOpticalResponse(
  parameters: Pick<GlassOpticalParameters, 'deformation' | 'translation'>,
): GlassNavbarOpticalResponse {
  const navbar = getGlassNavbarOpticalResponse(parameters)
  // 最大位移不超过带宽的 30%，为圆角内侧的取样回落保留单调余量。
  const ratio = (navbar.horizontalRatio / 0.42) * 0.3
  return { horizontalRatio: ratio, verticalRatio: ratio, translationPx: navbar.translationPx }
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
  /** 非预乘 RGBA；R/B 为位移，panel 的 G 为中心散射权重，其余模式保持中性 G。 */
  pixels: Uint8ClampedArray
  /** 位移图的 CSS 像素宽度。 */
  width: number
}

/** 稳定背板内各玻璃表面的局部坐标，按绘制顺序处理重叠区域。 */
export interface GlassPanelBackdropGeometry {
  /** 背板的 CSS 像素宽度。 */
  width: number
  /** 背板的 CSS 像素高度。 */
  height: number
  /** 同一背板内、均匀圆角的导航轮廓。 */
  panels: Array<{ x: number; y: number; width: number; height: number; radius: number }>
  /** 背板各轮廓共用的有效光学参数。 */
  optics: GlassNavbarOpticalResponse
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
  // 圆角中心矩形内的外部距离恒为零，只有超出该区域的采样才需要计算欧氏距离。
  const outsideDistance = outsideX === 0 && outsideY === 0 ? 0 : Math.hypot(outsideX, outsideY)

  return outsideDistance + Math.min(Math.max(offsetX, offsetY), 0) - radius
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
  surface = 'navbar',
  optics = surface !== 'navbar'
    ? getGlassSidebarOpticalResponse(getGlassOpticalPresetParameters('clear', 'high', 'natural'))
    : DEFAULT_NAVBAR_OPTICS,
}: GlassNavbarDisplacementGeometry): GlassNavbarDisplacementField {
  const pixelWidth = normalizePixelSize(width)
  const pixelHeight = normalizePixelSize(height)
  const maxRadius = Math.min(pixelWidth, pixelHeight) / 2
  const pixelRadius = Number.isFinite(radius) ? Math.max(0, Math.min(maxRadius, radius)) : 0
  // 直角固定表面没有圆角半径可供推导，仍使用受最短边约束的直边带；radius=0 不能被当成无折射。
  const radiusBand = pixelRadius > 0 ? pixelRadius * 1.5 : REFRACTION_BAND_PX
  // 侧栏边带不穿过圆角圆心，四角法线能连续转向且不会在内侧形成聚焦尖点。
  const maximumBand =
    surface === 'sidebar'
      ? Math.min(12, pixelRadius || 12, Math.min(pixelWidth, pixelHeight) / 2)
      : surface === 'panel'
        ? Math.min(48, radiusBand * 2, Math.min(pixelWidth, pixelHeight) / 2)
        : Math.min(REFRACTION_BAND_PX, radiusBand, Math.min(pixelWidth, pixelHeight) / 2)
  const pixels = new Uint8ClampedArray(pixelWidth * pixelHeight * 4)

  for (let offset = 0; offset < pixels.length; offset += 4) {
    pixels[offset] = DISPLACEMENT_NEUTRAL_CHANNEL
    pixels[offset + 1] = surface === 'panel' ? 0 : DISPLACEMENT_NEUTRAL_CHANNEL
    pixels[offset + 2] = DISPLACEMENT_NEUTRAL_CHANNEL
    pixels[offset + 3] = 255
  }

  // 中心越过圆角和两轴平移渐入带后，RGBA 恒定；非恒定区域仍按完整公式计算。
  const bodyStart = Math.ceil(Math.max(pixelRadius, maximumBand + 64) - 0.5)
  const bodyEnd = pixelWidth - bodyStart
  const hasConstantBody = surface === 'panel' && bodyEnd > bodyStart && pixelHeight > bodyStart * 2
  const pixelWords = surface === 'panel' ? new Uint32Array(pixels.buffer) : null
  // 从字节视图取得填充值，与目标视图共享平台字节序，不依赖大小端假设。
  const bodyWord = new Uint32Array(
    new Uint8ClampedArray([
      clampChannel(DISPLACEMENT_NEUTRAL_CHANNEL + (optics.translationPx * 255) / HIGH_REFRACTION_SCALE_PX),
      255,
      DISPLACEMENT_NEUTRAL_CHANNEL,
      255,
    ]).buffer,
  )[0]
  // 长竖面越过两端过渡后，整行结果不再随 y 改变；复用整行仍保留侧边逐像素精度。
  const repeatRowStart = Math.ceil(
    Math.max(pixelRadius + 1, maximumBand + 64, pixelWidth / 2 + maximumBand * 2 + 1) - 0.5,
  )
  const repeatRowEnd = pixelHeight - repeatRowStart

  for (let y = 0; y < pixelHeight; y += 1) {
    if (pixelWords && y > repeatRowStart && y < repeatRowEnd) {
      pixelWords.copyWithin(y * pixelWidth, repeatRowStart * pixelWidth, (repeatRowStart + 1) * pixelWidth)
      continue
    }
    const constantBodyRow = hasConstantBody && y >= bodyStart && y < pixelHeight - bodyStart
    const edgeY = Math.min(y + 0.5, pixelHeight - y - 0.5)
    // 越过圆角、横向平移渐入和直边权重后，同一行的距离与法线均不再依赖 x。
    // 多留一个像素覆盖法线差分的半像素邻域，短行仍逐点计算。
    const repeatStart = Math.ceil(Math.max(pixelRadius + 1, maximumBand + 64, edgeY + maximumBand * 2 + 1) - 0.5)
    const repeatEnd = pixelWidth - repeatStart
    const fillStart = pixelWords ? (constantBodyRow ? bodyStart : repeatStart + 1) : -1
    const fillEnd = constantBodyRow ? bodyEnd : repeatEnd
    for (let x = 0; x < pixelWidth; x += 1) {
      if (pixelWords && x === fillStart && fillEnd > x) {
        pixelWords.fill(
          constantBodyRow ? bodyWord : pixelWords[y * pixelWidth + repeatStart],
          y * pixelWidth + x,
          y * pixelWidth + fillEnd,
        )
        x = fillEnd - 1
        continue
      }
      const sampleX = x + 0.5
      const sampleY = y + 0.5
      const signedDistance = roundedRectangleSignedDistance(sampleX, sampleY, pixelWidth, pixelHeight, pixelRadius)
      const distanceInside = -signedDistance
      // 长直边允许更厚的透镜；向圆角与法线交汇轴渐缩，避免高曲率区产生聚焦尖点。
      const edgeX = Math.min(sampleX, pixelWidth - sampleX)
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

      if (surface === 'panel') {
        // 清亮边缘向散射中心连续过渡；合成时两路权重互补，避免透明度凹陷形成第二圈轮廓。
        const diffusionProgress = Math.min(1, (distanceInside - outerGuard) / Math.min(4, bandWidth / 3))
        pixels[(y * pixelWidth + x) * 4 + 1] = clampChannel(255 * smoothstep(diffusionProgress))
      }

      // 横向平移从边缘透镜退出后进入，避免两种回落梯度叠加导致局部反向采样。
      const horizontalRamp = smoothstep(Math.max(0, Math.min(1, (edgeX - maximumBand) / 64)))
      const verticalRamp =
        surface !== 'navbar'
          ? smoothstep(Math.max(0, Math.min(1, (edgeY - maximumBand) / 64)))
          : smoothstep(Math.min(1, (edgeY - outerGuard) / Math.max(1, Math.min(12, maximumBand))))
      const translationChannel = (optics.translationPx * horizontalRamp * verticalRamp * 255) / HIGH_REFRACTION_SCALE_PX

      if (surface === 'panel' && distanceInside >= bandWidth) {
        pixels[(y * pixelWidth + x) * 4] = clampChannel(DISPLACEMENT_NEUTRAL_CHANNEL + translationChannel)
        continue
      }

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
      // 侧栏的两轴必须共用同一深度剖面，圆角法线旋转时才不会变成扁平或椭圆透镜。
      const verticalProfile = surface !== 'navbar' ? profile : Math.sin(Math.PI * verticalProgress) ** 2
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

function encodeDisplacementField(field: GlassNavbarDisplacementField) {
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

/** 把位移场栅格化为浏览器可直接加载的无损 PNG。 */
export function createGlassNavbarDisplacementMap(geometry: GlassNavbarDisplacementGeometry) {
  return encodeDisplacementField(createGlassNavbarDisplacementField(geometry))
}

/** 固定导航共用稳定壁纸输入，背板只在真实导航轮廓内进行局部折射。 */
export function createGlassPanelBackdropField({ width, height, panels, optics }: GlassPanelBackdropGeometry) {
  const pixelWidth = normalizePixelSize(width)
  const pixelHeight = normalizePixelSize(height)
  const pixels = new Uint8ClampedArray(pixelWidth * pixelHeight * 4)
  for (let offset = 0; offset < pixels.length; offset += 4) {
    pixels[offset] = DISPLACEMENT_NEUTRAL_CHANNEL
    pixels[offset + 1] = 255
    pixels[offset + 2] = DISPLACEMENT_NEUTRAL_CHANNEL
    pixels[offset + 3] = 255
  }
  for (const panel of panels) {
    const field = createGlassNavbarDisplacementField({ ...panel, optics, surface: 'panel' })
    const left = Math.round(panel.x)
    const top = Math.round(panel.y)
    const radius = Math.max(0, Math.min(panel.radius, field.width / 2, field.height / 2))
    for (let y = Math.max(0, -top); y < Math.min(field.height, pixelHeight - top); y += 1) {
      for (let x = Math.max(0, -left); x < Math.min(field.width, pixelWidth - left); x += 1) {
        if (roundedRectangleSignedDistance(x + 0.5, y + 0.5, field.width, field.height, radius) > 0) continue
        const source = (y * field.width + x) * 4
        const destination = ((top + y) * pixelWidth + left + x) * 4
        pixels.set(field.pixels.subarray(source, source + 4), destination)
      }
    }
  }
  return { width: pixelWidth, height: pixelHeight, pixels }
}

/** 稳定背板与独立表面使用同一 PNG 编码与坐标精度。 */
export function createGlassPanelBackdropMap(geometry: GlassPanelBackdropGeometry) {
  return encodeDisplacementField(createGlassPanelBackdropField(geometry))
}

/** 仅在已验证 SVG backdrop 位移的 Chromium 引擎启用实时顶栏折射。 */
export function supportsGlassNavbarLiveRefraction(browserIdentity: GlassNavbarRefractionBrowserIdentity = navigator) {
  const brands = browserIdentity.userAgentData?.brands
  if (brands?.length) return brands.some(({ brand }) => brand === 'Chromium')

  return /\b(?:Chrome|Chromium)\/\d+/u.test(browserIdentity.userAgent)
}
