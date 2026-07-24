export const GLASS_OPTICAL_MAX_SURFACES_DESKTOP = 8
export const GLASS_OPTICAL_MAX_SURFACES_MOBILE = 5

export type GlassOpticalQuality = 'balanced' | 'high'
export type GlassCornerRadii = [number, number, number, number]

export interface GlassInteractionPoint {
  /** 指针或触点相对视口的横坐标。 */
  x: number
  /** 指针或触点相对视口的纵坐标。 */
  y: number
}

export interface GlassOpticalRect {
  /** 元素的实际高度，元素可部分位于视口外。 */
  height: number
  /** 按左上、右上、右下、左下排列的 CSS 圆角像素值。 */
  radii: GlassCornerRadii
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
  /** 光学层内部缓冲使用的质量档位。 */
  bufferQuality: GlassOpticalQuality
  /** 是否使用带时序记忆的液态位移场。 */
  flowField: boolean
  /** 时序位移场能量衰减到一半所需的时间。 */
  flowHalfLife: number
  /** 输入停止后液态形态收敛到静态所需的时间。 */
  motionDuration: number
  /** 主液态反馈能量衰减到一半所需的时间。 */
  motionHalfLife: number
  /** 高质量缓冲允许使用的设备像素比上限。 */
  pixelRatioCap: number
  /** 活动壁纸进入 GPU 前的最长边限制。 */
  textureLimit: number
  /** 登录页优先使用可读纹理，跨域外链自动退回程序化高光。 */
  textureSource: 'auto' | 'procedural' | 'wallpaper'
  /** 参与液态方向计算的最近输入采样数量。 */
  trailCount: number
}

/** 质量决定合成缓冲与纹理上限；路由只切换纹理来源，不改变质量档位。 */
export function getGlassOpticalRenderProfile(
  quality: GlassOpticalQuality,
  routeKey: string,
): GlassOpticalRenderProfile {
  const highQuality = quality === 'high'

  return {
    bufferQuality: quality,
    flowField: highQuality,
    flowHalfLife: highQuality ? 130 : 0,
    motionDuration: highQuality ? 680 : 420,
    motionHalfLife: highQuality ? 145 : 90,
    pixelRatioCap: highQuality ? 1.5 : 1,
    textureLimit: highQuality ? 4096 : 3072,
    textureSource: routeKey.startsWith('/login') ? 'auto' : 'wallpaper',
    trailCount: highQuality ? 4 : 2,
  }
}

/** 将时间常数转换为与刷新率无关的指数衰减。 */
export function getGlassOpticalDecay(halfLife: number, delta: number) {
  if (halfLife <= 0) return 0
  if (delta <= 0) return 1

  return 2 ** (-delta / halfLife)
}

/** 输入停止后按时间收敛，尾段平滑归零以恢复事件驱动静止状态。 */
export function getGlassOpticalMotionEnergy(elapsed: number, duration: number, halfLife: number) {
  if (elapsed >= duration) return 0

  const safeElapsed = Math.max(0, elapsed)
  const tailDuration = Math.max(1, duration * 0.25)
  const tailProgress = Math.min(1, Math.max(0, (duration - safeElapsed) / tailDuration))
  const tailTaper = tailProgress * tailProgress * (3 - 2 * tailProgress)

  return getGlassOpticalDecay(halfLife, safeElapsed) * tailTaper
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

/** 按质量档位的像素预算计算内部缓冲，高质量只使用受控的设备像素比增益。 */
export function getGlassOpticalBufferSize(
  viewportWidth: number,
  viewportHeight: number,
  mobile: boolean,
  quality: GlassOpticalQuality = 'balanced',
  devicePixelRatio = 1,
): GlassOpticalBufferSize {
  const highQuality = quality === 'high'
  const pixelRatio = highQuality ? Math.min(Math.max(1, devicePixelRatio), 1.5) : 1
  const safeWidth = Math.max(1, viewportWidth) * pixelRatio
  const safeHeight = Math.max(1, viewportHeight) * pixelRatio
  const maxWidth = mobile ? (highQuality ? 1280 : 960) : highQuality ? 1920 : 1440
  const maxHeight = mobile ? (highQuality ? 1440 : 960) : highQuality ? 1200 : 960
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
  interactionPoint?: GlassInteractionPoint,
): GlassOpticalRect[] {
  const maxCount = mobile ? GLASS_OPTICAL_MAX_SURFACES_MOBILE : GLASS_OPTICAL_MAX_SURFACES_DESKTOP
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
    .sort((left, right) => {
      if (interactionPoint) {
        const leftContainsInteraction =
          interactionPoint.x >= left.rect.x &&
          interactionPoint.x <= left.rect.x + left.rect.width &&
          interactionPoint.y >= left.rect.y &&
          interactionPoint.y <= left.rect.y + left.rect.height
        const rightContainsInteraction =
          interactionPoint.x >= right.rect.x &&
          interactionPoint.x <= right.rect.x + right.rect.width &&
          interactionPoint.y >= right.rect.y &&
          interactionPoint.y <= right.rect.y + right.rect.height

        if (leftContainsInteraction !== rightContainsInteraction) return leftContainsInteraction ? -1 : 1
      }

      return left.rect.rank - right.rect.rank || left.visibleArea - right.visibleArea
    })

  const selected: typeof visible = []

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

    selected.push(candidate)
  }

  return selected.map(candidate => candidate.rect)
}

/** 将视口矩形转换为 WebGL 底部原点的归一化参数。 */
export function normalizeGlassOpticalRect(rect: GlassOpticalRect, viewportWidth: number, viewportHeight: number) {
  const safeWidth = Math.max(1, viewportWidth)
  const safeHeight = Math.max(1, viewportHeight)
  const maxRadius = Math.max(0, Math.min(rect.width, rect.height) / 2)

  return {
    radii: rect.radii.map(radius => Math.min(Math.max(0, radius), maxRadius)) as GlassCornerRadii,
    rect: [
      rect.x / safeWidth,
      1 - (rect.y + rect.height) / safeHeight,
      rect.width / safeWidth,
      rect.height / safeHeight,
    ] as const,
  }
}
