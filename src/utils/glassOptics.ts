export const GLASS_OPTICAL_MAX_SURFACES_DESKTOP = 8
export const GLASS_OPTICAL_MAX_SURFACES_MOBILE = 5

export type GlassOpticalQuality = 'balanced' | 'high'

export interface GlassOpticalRect {
  /** 元素的实际高度，元素可部分位于视口外。 */
  height: number
  /** 元素圆角的 CSS 像素值。 */
  radius: number
  /** 表面的场景优先级，数值越小越优先。 */
  rank: number
  /** 元素的实际宽度，元素可部分位于视口外。 */
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

/** 用可见交集筛选和计费，但保留原始边界给 shader，避免在视口裁剪边生成伪圆角。 */
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
    .map(rect => {
      const left = Math.max(0, rect.x)
      const top = Math.max(0, rect.y)
      const right = Math.min(viewportWidth, rect.x + rect.width)
      const bottom = Math.min(viewportHeight, rect.y + rect.height)
      const visibleHeight = Math.max(0, bottom - top)
      const visibleWidth = Math.max(0, right - left)

      return {
        rect,
        visibleArea: visibleWidth * visibleHeight,
        visibleHeight,
        visibleWidth,
      }
    })
    .filter(candidate => candidate.visibleWidth >= 24 && candidate.visibleHeight >= 24)
    .sort((left, right) => left.rect.rank - right.rect.rank || left.visibleArea - right.visibleArea)

  const selected: typeof visible = []
  let selectedArea = 0

  for (const candidate of visible) {
    if (selected.length >= maxCount) break

    const { rect } = candidate
    const nested = selected.some(
      parent =>
        rect.x >= parent.rect.x &&
        rect.y >= parent.rect.y &&
        rect.x + rect.width <= parent.rect.x + parent.rect.width &&
        rect.y + rect.height <= parent.rect.y + parent.rect.height,
    )
    if (nested) continue

    if (selected.length > 0 && selectedArea + candidate.visibleArea > maxArea) continue

    selected.push(candidate)
    selectedArea += candidate.visibleArea
  }

  return selected.map(candidate => candidate.rect)
}

/** 将视口矩形转换为 WebGL 底部原点的归一化参数。 */
export function normalizeGlassOpticalRect(rect: GlassOpticalRect, viewportWidth: number, viewportHeight: number) {
  const safeWidth = Math.max(1, viewportWidth)
  const safeHeight = Math.max(1, viewportHeight)

  return {
    radius: Math.min(Math.max(0, rect.radius), Math.max(0, Math.min(rect.width, rect.height) / 2)),
    rect: [
      rect.x / safeWidth,
      1 - (rect.y + rect.height) / safeHeight,
      rect.width / safeWidth,
      rect.height / safeHeight,
    ] as const,
  }
}
