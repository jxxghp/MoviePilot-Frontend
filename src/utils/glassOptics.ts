export const GLASS_OPTICAL_MAX_SURFACES_DESKTOP = 8
export const GLASS_OPTICAL_MAX_SURFACES_MOBILE = 5

export type GlassOpticalQuality = 'balanced' | 'high'

export interface GlassOpticalRect {
  /** 元素在视口内的高度。 */
  height: number
  /** 元素圆角，按最短边折算后传入 shader。 */
  radius: number
  /** 表面的场景优先级，数值越小越优先。 */
  rank: number
  /** 元素在视口内的宽度。 */
  width: number
  /** 元素左边缘相对视口的位置。 */
  x: number
  /** 元素上边缘相对视口的位置。 */
  y: number
}

export interface GlassOpticalBufferSize {
  height: number
  width: number
}

export interface GlassOpticalRenderProfile {
  /** 实际内部缓冲档位；媒体密集场景可保留高质量光学但降低合成分辨率。 */
  bufferQuality: GlassOpticalQuality
  /** 活动壁纸进入 GPU 前的最长边限制。 */
  textureLimit: number
  /** 登录页优先使用可读纹理，跨域外链自动退回程序化高光。 */
  textureSource: 'auto' | 'procedural' | 'wallpaper'
}

/** 按质量与场景分配合成预算，避免推荐页海报解码与高分辨率光学层争抢资源。 */
export function getGlassOpticalRenderProfile(
  quality: GlassOpticalQuality,
  routeKey: string,
): GlassOpticalRenderProfile {
  const mediaDenseRoute = routeKey.startsWith('/recommend')

  return {
    bufferQuality: quality === 'high' && !mediaDenseRoute ? 'high' : 'balanced',
    textureLimit: quality === 'high' && !mediaDenseRoute ? 3072 : 2048,
    textureSource: routeKey.startsWith('/login') ? 'auto' : 'wallpaper',
  }
}

/** 只将同源及本地对象交给 WebGL，避免跨域纹理失败污染登录页控制台。 */
export function canUseGlassWallpaperTexture(url: string, documentUrl: string): boolean {
  if (!url || !documentUrl) return false

  try {
    const source = new URL(url, documentUrl)
    if (source.protocol === 'blob:' || source.protocol === 'data:') return true

    return source.origin === new URL(documentUrl).origin
  } catch {
    return false
  }
}

/** 按固定像素预算计算内部缓冲尺寸，避免高 DPI 屏幕线性放大 GPU 成本。 */
export function getGlassOpticalBufferSize(
  viewportWidth: number,
  viewportHeight: number,
  mobile: boolean,
  quality: GlassOpticalQuality = 'balanced',
): GlassOpticalBufferSize {
  const safeWidth = Math.max(1, viewportWidth)
  const safeHeight = Math.max(1, viewportHeight)
  const highQuality = quality === 'high'
  const maxWidth = mobile ? (highQuality ? 960 : 720) : highQuality ? 1440 : 960
  const maxHeight = highQuality ? 960 : 720
  const scale = Math.min(1, maxWidth / safeWidth, maxHeight / safeHeight)

  return {
    height: Math.max(1, Math.round(safeHeight * scale)),
    width: Math.max(1, Math.round(safeWidth * scale)),
  }
}

/** 计算与 CSS `background-size: cover` 一致的纹理缩放参数。 */
export function getGlassCoverScale(
  viewportWidth: number,
  viewportHeight: number,
  imageWidth: number,
  imageHeight: number,
) {
  const viewportAspect = Math.max(1, viewportWidth) / Math.max(1, viewportHeight)
  const imageAspect = Math.max(1, imageWidth) / Math.max(1, imageHeight)

  return imageAspect > viewportAspect
    ? { x: viewportAspect / imageAspect, y: 1 }
    : { x: 1, y: imageAspect / viewportAspect }
}

/** 去除被更高价值表面包含的嵌套矩形，并按场景价值与像素成本裁剪预算。 */
export function selectGlassOpticalRects(
  candidates: GlassOpticalRect[],
  viewportWidth: number,
  viewportHeight: number,
  mobile: boolean,
): GlassOpticalRect[] {
  const viewportArea = Math.max(1, viewportWidth * viewportHeight)
  const maxCount = mobile ? GLASS_OPTICAL_MAX_SURFACES_MOBILE : GLASS_OPTICAL_MAX_SURFACES_DESKTOP
  const maxArea = viewportArea * (mobile ? 0.68 : 0.82)
  const visible = candidates
    .filter(rect => rect.width >= 24 && rect.height >= 24)
    .filter(
      rect => rect.x < viewportWidth && rect.y < viewportHeight && rect.x + rect.width > 0 && rect.y + rect.height > 0,
    )
    .map(rect => ({
      ...rect,
      height: Math.min(rect.height, viewportHeight - Math.max(0, rect.y)),
      width: Math.min(rect.width, viewportWidth - Math.max(0, rect.x)),
      x: Math.max(0, rect.x),
      y: Math.max(0, rect.y),
    }))
    .sort((left, right) => left.rank - right.rank || left.width * left.height - right.width * right.height)

  const selected: GlassOpticalRect[] = []
  let selectedArea = 0

  for (const rect of visible) {
    if (selected.length >= maxCount) break

    const nested = selected.some(
      parent =>
        rect.x >= parent.x &&
        rect.y >= parent.y &&
        rect.x + rect.width <= parent.x + parent.width &&
        rect.y + rect.height <= parent.y + parent.height,
    )
    if (nested) continue

    const area = rect.width * rect.height
    if (selected.length > 0 && selectedArea + area > maxArea) continue

    selected.push(rect)
    selectedArea += area
  }

  return selected
}

/** 将视口矩形转换为 WebGL 底部原点的归一化参数。 */
export function normalizeGlassOpticalRect(rect: GlassOpticalRect, viewportWidth: number, viewportHeight: number) {
  const safeWidth = Math.max(1, viewportWidth)
  const safeHeight = Math.max(1, viewportHeight)

  return {
    radius: Math.min(0.5, rect.radius / Math.max(1, Math.min(rect.width, rect.height))),
    rect: [
      rect.x / safeWidth,
      1 - (rect.y + rect.height) / safeHeight,
      rect.width / safeWidth,
      rect.height / safeHeight,
    ] as const,
  }
}
