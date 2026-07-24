export const GLASS_OPTICAL_MAX_SURFACES_DESKTOP = 8
export const GLASS_OPTICAL_MAX_SURFACES_MOBILE = 5
export const GLASS_OPTICAL_MOTION_MAX_SCALE = 3.2
export const GLASS_OPTICAL_REFLECTION_MAX_SCALE = 1.8
export const GLASS_OPTICAL_STRENGTH_DEFAULT = 50
export const GLASS_OPTICAL_STRENGTH_MAX = 100
export const GLASS_OPTICAL_STRENGTH_MIN = 0

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

export interface GlassOpticalPoint {
  /** 归一化或视口坐标系中的横向分量。 */
  x: number
  /** 归一化或视口坐标系中的纵向分量。 */
  y: number
}

export interface GlassOpticalSpringState {
  /** 当前跟随位置。 */
  position: number
  /** 当前每秒位移速度。 */
  velocity: number
}

export interface GlassOpticalSurfaceCandidate<TKey> {
  /** renderer 生命周期内稳定的表面身份。 */
  key: TKey
  /** 表面的当前视口几何。 */
  rect: GlassOpticalRect
}

export interface GlassOpticalSurfaceSlot<TKey> extends GlassOpticalSurfaceCandidate<TKey> {
  /** 槽位在本次交互中的职责。 */
  role: 'active' | 'outgoing' | 'stable'
}

export interface GlassOpticalRenderProfile {
  /** 光学层内部缓冲使用的质量档位。 */
  bufferQuality: GlassOpticalQuality
  /** 是否使用额外壁纸采样保护人物和文字等高梯度内容。 */
  contentProtection: boolean
  /** 磨砂扩散使用的纹理采样数。 */
  diffusionSamples: 5 | 9
  /** 是否使用带时序记忆的液态位移场。 */
  flowField: boolean
  /** 时序位移场能量衰减到一半所需的时间。 */
  flowHalfLife: number
  /** 动态折射在视口像素空间中的软上限。 */
  maxRefractionPixels: number
  /** 输入停止后液态形态收敛到静态所需的时间。 */
  motionDuration: number
  /** 主液态反馈能量衰减到一半所需的时间。 */
  motionHalfLife: number
  /** 高质量缓冲允许使用的设备像素比上限。 */
  pixelRatioCap: number
  /** 新输入立即作用于镜片位置的比例。 */
  pointerImmediateResponse: number
  /** 镜片跟随弹簧的阻尼比。 */
  springDamping: number
  /** 镜片跟随弹簧的角频率，单位弧度每秒。 */
  springFrequency: number
  /** 活动壁纸进入 GPU 前的最长边限制。 */
  textureLimit: number
  /** 登录页优先使用可读纹理，跨域外链自动退回程序化高光。 */
  textureSource: 'auto' | 'procedural' | 'wallpaper'
  /** 参与液态方向计算的最近输入采样数量。 */
  trailCount: number
}

/** 将用户滑杆输入收敛到 renderer 支持的整数范围，非法存量值回落到默认视觉。 */
export function normalizeGlassOpticalStrength(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return GLASS_OPTICAL_STRENGTH_DEFAULT

  return Math.min(GLASS_OPTICAL_STRENGTH_MAX, Math.max(GLASS_OPTICAL_STRENGTH_MIN, Math.round(value)))
}

/**
 * 流动强度使用感知曲线：中点保持既有视觉，高区间同时释放更大的形变幅度与空间范围。
 * 最大值仍受质量档和内容保护共同约束，避免高梯度海报出现无界拉伸。
 */
export function getGlassOpticalMotionStrengthScale(value: unknown) {
  const normalized = normalizeGlassOpticalStrength(value)
  const normalizedRatio = normalized / GLASS_OPTICAL_STRENGTH_DEFAULT

  return normalizedRatio ** Math.log2(GLASS_OPTICAL_MOTION_MAX_SCALE)
}

/** 高于默认值的流动强度逐步扩大作用范围，低区间不会意外改变既有空间尺度。 */
export function getGlassOpticalMotionExpansion(value: unknown) {
  const normalized = normalizeGlassOpticalStrength(value)
  const highRangeProgress = Math.max(
    0,
    (normalized - GLASS_OPTICAL_STRENGTH_DEFAULT) / (GLASS_OPTICAL_STRENGTH_MAX - GLASS_OPTICAL_STRENGTH_DEFAULT),
  )

  return highRangeProgress ** 1.55
}

/** 最大几何形变只由质量档约束；流动滑杆改变覆盖与连续性，不继续拉伸背景内容。 */
export function getGlassOpticalMaxRefractionPixels(basePixels: number, _value: unknown) {
  void _value

  return basePixels
}

/** 反射强度使用独立感知曲线，只控制光学亮度，不放大背景位移。 */
export function getGlassOpticalReflectionStrengthScale(value: unknown) {
  const normalized = normalizeGlassOpticalStrength(value)
  const normalizedRatio = normalized / GLASS_OPTICAL_STRENGTH_DEFAULT

  return normalizedRatio ** Math.log2(GLASS_OPTICAL_REFLECTION_MAX_SCALE)
}

/** 通透度独立控制真实背景与可读性遮罩的占比，高区间继续增强但逐步收敛。 */
export function getGlassOpticalTransparency(value: unknown) {
  const normalized = normalizeGlassOpticalStrength(value)
  if (normalized <= 80) {
    const progress = normalized / 80

    return 0.28 + 0.58 * progress ** 1.25
  }

  const highRangeProgress = (normalized - 80) / 20

  return 0.86 + 0.1 * highRangeProgress ** 1.5
}

/** 质量决定合成缓冲与纹理上限；路由只切换纹理来源，不改变质量档位。 */
export function getGlassOpticalRenderProfile(
  quality: GlassOpticalQuality,
  routeKey: string,
): GlassOpticalRenderProfile {
  const highQuality = quality === 'high'

  return {
    bufferQuality: quality,
    contentProtection: highQuality,
    diffusionSamples: highQuality ? 9 : 5,
    flowField: highQuality,
    flowHalfLife: highQuality ? 130 : 0,
    maxRefractionPixels: highQuality ? 9 : 6,
    motionDuration: highQuality ? 540 : 360,
    motionHalfLife: highQuality ? 125 : 82,
    pixelRatioCap: highQuality ? 1.5 : 1,
    pointerImmediateResponse: highQuality ? 0.58 : 0.7,
    springDamping: highQuality ? 0.78 : 0.9,
    springFrequency: highQuality ? 18 : 24,
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

/**
 * 解析阻尼弹簧的精确时间步，避免刷新率变化改变跟随手感。
 * 欠阻尼参数只允许一次可见回摆，生命周期结束后由 renderer 归零。
 */
export function stepGlassOpticalSpring(
  state: GlassOpticalSpringState,
  target: number,
  deltaMs: number,
  frequency: number,
  damping: number,
): GlassOpticalSpringState {
  const deltaSeconds = Math.min(0.064, Math.max(0, deltaMs / 1000))
  const safeFrequency = Math.max(0.001, frequency)
  const safeDamping = Math.max(0, damping)
  const offset = state.position - target
  if (deltaSeconds <= 0) return state

  if (safeDamping >= 1) {
    const decay = Math.exp(-safeFrequency * deltaSeconds)
    const coefficient = state.velocity + safeFrequency * offset

    return {
      position: target + (offset + coefficient * deltaSeconds) * decay,
      velocity: (state.velocity - safeFrequency * coefficient * deltaSeconds) * decay,
    }
  }

  const dampedFrequency = safeFrequency * Math.sqrt(1 - safeDamping * safeDamping)
  const decay = Math.exp(-safeDamping * safeFrequency * deltaSeconds)
  const angle = dampedFrequency * deltaSeconds
  const cosine = Math.cos(angle)
  const sine = Math.sin(angle)
  const sineCoefficient = (state.velocity + safeDamping * safeFrequency * offset) / dampedFrequency
  const oscillation = offset * cosine + sineCoefficient * sine

  return {
    position: target + decay * oscillation,
    velocity:
      decay *
      (-safeDamping * safeFrequency * oscillation -
        offset * dampedFrequency * sine +
        sineCoefficient * dampedFrequency * cosine),
  }
}

/** 单个双相尾波只有一个波峰和一个波谷，不形成连续周期波列。 */
export function getGlassOpticalWakeSample(position: number) {
  return position * Math.exp(-0.5 * position * position)
}

/** 低速噪声和小角度移动沿用既有方向，显著转向才开始新的尾波。 */
export function getGlassOpticalWakeDirection(
  current: GlassOpticalPoint,
  next: GlassOpticalPoint,
  speed: number,
  restart: boolean,
): GlassOpticalPoint {
  const normalize = (point: GlassOpticalPoint) => {
    const length = Math.hypot(point.x, point.y)

    return length > 0.0001 ? { x: point.x / length, y: point.y / length } : { x: 0, y: -1 }
  }
  const currentDirection = normalize(current)
  const nextDirection = normalize(next)
  if (restart || Math.hypot(current.x, current.y) <= 0.0001) return nextDirection
  if (speed < 0.006) return currentDirection

  const directionDot = currentDirection.x * nextDirection.x + currentDirection.y * nextDirection.y

  return directionDot < Math.cos((55 * Math.PI) / 180) ? nextDirection : currentDirection
}

/** 活动表面立即可感知，随后与离场表面完成短时单调交叉过渡。 */
export function getGlassOpticalSurfaceTransitionWeights(elapsed: number, duration: number) {
  const progress = Math.min(1, Math.max(0, elapsed / Math.max(1, duration)))
  const eased = progress * progress * (3 - 2 * progress)

  return {
    incoming: 0.35 + eased * 0.65,
    outgoing: 1 - eased,
  }
}

/**
 * 复用仍可见的稳定槽位，并为当前与离场表面保留确定位置。
 * 候选顺序只用于补充空位，指针移动不会重排已经占用的稳定槽位。
 */
export function reconcileGlassOpticalSurfaceSlots<TKey>(
  previous: GlassOpticalSurfaceSlot<TKey>[],
  candidates: GlassOpticalSurfaceCandidate<TKey>[],
  maxCount: number,
  activeKey?: TKey,
  outgoingKey?: TKey,
): GlassOpticalSurfaceSlot<TKey>[] {
  if (maxCount <= 0) return []

  const candidateByKey = new Map(candidates.map(candidate => [candidate.key, candidate]))
  const reserved: GlassOpticalSurfaceSlot<TKey>[] = []
  if (outgoingKey !== undefined && outgoingKey !== activeKey) {
    const outgoing = candidateByKey.get(outgoingKey)
    if (outgoing) reserved.push({ ...outgoing, role: 'outgoing' })
  }
  if (activeKey !== undefined) {
    const active = candidateByKey.get(activeKey)
    if (active) reserved.push({ ...active, role: 'active' })
  }

  const reservedKeys = new Set(reserved.map(slot => slot.key))
  const stableCount = Math.max(0, maxCount - reserved.length)
  const stable: GlassOpticalSurfaceSlot<TKey>[] = []
  const stableKeys = new Set<TKey>()
  const appendStable = (key: TKey) => {
    if (stable.length >= stableCount || reservedKeys.has(key) || stableKeys.has(key)) return

    const candidate = candidateByKey.get(key)
    if (!candidate) return

    stable.push({ ...candidate, role: 'stable' })
    stableKeys.add(key)
  }

  for (const slot of previous) appendStable(slot.key)
  for (const candidate of candidates) appendStable(candidate.key)

  return [...stable, ...reserved].slice(0, maxCount)
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
