export const GLASS_OPTICAL_MAX_SURFACES_DESKTOP = 8
export const GLASS_OPTICAL_MAX_SURFACES_MOBILE = 5
export const GLASS_OPTICAL_MOTION_MAX_SCALE = 3.2
export const GLASS_OPTICAL_DEFORMATION_MAX_SCALE = 1.55
export const GLASS_OPTICAL_FLOW_MAX_SCALE = 1.45
export const GLASS_OPTICAL_REFLECTION_MAX_SCALE = 1.8
export const GLASS_OPTICAL_TRANSLATION_MAX_SCALE = 1.7
export const GLASS_OPTICAL_STRENGTH_DEFAULT = 50
export const GLASS_OPTICAL_STRENGTH_MAX = 100
export const GLASS_OPTICAL_STRENGTH_MIN = 0
export const GLASS_OPTICAL_REFERENCE_STRENGTH = 70

export type GlassAppearance = 'clear' | 'frosted' | 'tinted'
export type GlassOpticalCapability = 'balanced' | 'css' | 'high'
export type GlassOpticalPreset = 'glide' | 'liquid' | 'natural'
export type GlassOpticalPresetKey = `${GlassAppearance}:${GlassOpticalCapability}:${GlassOpticalPreset}`
export type GlassOpticalPresetOverrides = Partial<Record<GlassOpticalPresetKey, GlassOpticalParameters>>
export type GlassOpticalQuality = 'balanced' | 'high'
export type GlassCornerRadii = [number, number, number, number]

export interface GlassOpticalParameters {
  /** 局部非均匀折射与内容弯曲强度。 */
  deformation: number
  /** 轨迹范围、尾波、惯性与收敛强度。 */
  flow: number
  /** 方向高光、迎光棱镜与背光吸收强度。 */
  reflection: number
  /** 玻璃内部壁纸采样的明暗与暗部展开强度。 */
  transmission: number
  /** 共享壁纸采样在表面内的统一坐标平移强度。 */
  translation: number
  /** 壁纸可见度与材质遮罩强度。 */
  transparency: number
}

export interface GlassMaterialResponse {
  /** 真实壁纸在表面材质后的感知可见程度。 */
  backgroundVisibility: number
  /** 磨砂预滤纹理允许保留的高频细节比例。 */
  frostDetailLevel: number
  /** 标准档 CSS 磨砂半径相对既有 40px 基线的缩放。 */
  frostBlurScale: number
  /** 表面遮罩对真实壁纸的覆盖密度。 */
  surfaceDensity: number
  /** 色调材质的主体染色密度。 */
  tintDensity: number
}

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

/** 光学表面在共享 renderer 中采用的动态响应合同。 */
export type GlassOpticalSurfaceMode = 'dynamic' | 'static-material'

export interface GlassOpticalSurfaceCandidate<TKey> {
  /** renderer 生命周期内稳定的表面身份。 */
  key: TKey
  /** 表面使用完整动态光学，或只保留稳定材质能量。 */
  mode?: GlassOpticalSurfaceMode
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
  textureSource: 'auto' | 'procedural' | 'wallpaper'
  /** 参与液态方向计算的最近输入采样数量。 */
  trailCount: number
}

/** 将用户滑杆输入收敛到 renderer 支持的整数范围，非法存量值回落到默认视觉。 */
export function normalizeGlassOpticalStrength(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return GLASS_OPTICAL_STRENGTH_DEFAULT

  return Math.min(GLASS_OPTICAL_STRENGTH_MAX, Math.max(GLASS_OPTICAL_STRENGTH_MIN, Math.round(value)))
}

type GlassOpticalPresetSet = Record<GlassOpticalPreset, GlassOpticalParameters>
type GlassOpticalCapabilityPresets = {
  balanced: GlassOpticalPresetSet
  css: Pick<GlassOpticalPresetSet, 'natural'>
  high: GlassOpticalPresetSet
}

const GLASS_OPTICAL_PRESET_MATRIX: Record<GlassAppearance, GlassOpticalCapabilityPresets> = {
  clear: {
    css: {
      natural: { deformation: 48, flow: 48, reflection: 42, transmission: 67, translation: 48, transparency: 52 },
    },
    balanced: {
      natural: { deformation: 48, flow: 48, reflection: 42, transmission: 65, translation: 48, transparency: 50 },
      glide: { deformation: 29, flow: 42, reflection: 35, transmission: 70, translation: 70, transparency: 60 },
      liquid: { deformation: 67, flow: 73, reflection: 43, transmission: 61, translation: 54, transparency: 55 },
    },
    high: {
      natural: { deformation: 48, flow: 48, reflection: 38, transmission: 64, translation: 48, transparency: 49 },
      glide: { deformation: 31, flow: 44, reflection: 34, transmission: 67, translation: 71, transparency: 59 },
      liquid: { deformation: 71, flow: 77, reflection: 42, transmission: 60, translation: 55, transparency: 54 },
    },
  },
  tinted: {
    css: {
      natural: { deformation: 48, flow: 48, reflection: 46, transmission: 65, translation: 48, transparency: 37 },
    },
    balanced: {
      natural: { deformation: 50, flow: 48, reflection: 46, transmission: 67, translation: 48, transparency: 34 },
      glide: { deformation: 31, flow: 42, reflection: 41, transmission: 73, translation: 67, transparency: 43 },
      liquid: { deformation: 70, flow: 73, reflection: 47, transmission: 64, translation: 54, transparency: 39 },
    },
    high: {
      natural: { deformation: 50, flow: 48, reflection: 42, transmission: 65, translation: 48, transparency: 32 },
      glide: { deformation: 32, flow: 44, reflection: 38, transmission: 71, translation: 70, transparency: 41 },
      liquid: { deformation: 73, flow: 77, reflection: 46, transmission: 61, translation: 55, transparency: 37 },
    },
  },
  frosted: {
    css: {
      natural: { deformation: 48, flow: 48, reflection: 37, transmission: 60, translation: 48, transparency: 43 },
    },
    balanced: {
      natural: { deformation: 55, flow: 50, reflection: 37, transmission: 62, translation: 46, transparency: 40 },
      glide: { deformation: 36, flow: 42, reflection: 32, transmission: 67, translation: 65, transparency: 55 },
      liquid: { deformation: 74, flow: 73, reflection: 38, transmission: 59, translation: 50, transparency: 47 },
    },
    high: {
      natural: { deformation: 58, flow: 50, reflection: 35, transmission: 60, translation: 46, transparency: 37 },
      glide: { deformation: 38, flow: 44, reflection: 30, transmission: 65, translation: 67, transparency: 53 },
      liquid: { deformation: 79, flow: 77, reflection: 37, transmission: 56, translation: 52, transparency: 44 },
    },
  },
}

/** 返回材质、质量与预置共同确定的六个具体参数，调用方可以安全修改返回值。 */
export function getGlassOpticalPresetParameters(
  appearance: GlassAppearance,
  quality: GlassOpticalCapability,
  preset: GlassOpticalPreset,
): GlassOpticalParameters {
  const presets = GLASS_OPTICAL_PRESET_MATRIX[appearance][quality]
  const parameters = 'natural' === preset ? presets.natural : (presets as Partial<GlassOpticalPresetSet>)[preset]

  return { ...(parameters ?? presets.natural) }
}

/** 标准档只保留自然基线；实时档同时开放滑移与液态方案。 */
export function getAvailableGlassOpticalPresets(quality: GlassOpticalCapability): GlassOpticalPreset[] {
  return quality === 'css' ? ['natural'] : ['natural', 'glide', 'liquid']
}

/** 生成持久化覆盖使用的稳定组合键；标准档始终归入自然方案。 */
export function getGlassOpticalPresetKey(
  appearance: GlassAppearance,
  quality: GlassOpticalCapability,
  preset: GlassOpticalPreset,
): GlassOpticalPresetKey {
  return `${appearance}:${quality}:${quality === 'css' ? 'natural' : preset}`
}

/** 切换组合时优先恢复用户覆盖，没有覆盖才返回预设矩阵副本。 */
export function getGlassOpticalPresetParametersWithOverrides(
  appearance: GlassAppearance,
  quality: GlassOpticalCapability,
  preset: GlassOpticalPreset,
  overrides: GlassOpticalPresetOverrides,
) {
  const key = getGlassOpticalPresetKey(appearance, quality, preset)

  return { ...(overrides[key] ?? getGlassOpticalPresetParameters(appearance, quality, preset)) }
}

const GLASS_RESPONSE_STOPS = [0, 20, 50, 70, 85, 100] as const
const GLASS_BACKGROUND_VISIBILITY: Record<GlassAppearance, readonly number[]> = {
  clear: [0.18, 0.3, 0.58, 0.77, 0.9, 0.96],
  tinted: [0.08, 0.2, 0.48, 0.7, 0.84, 0.92],
  frosted: [0.04, 0.22, 0.52, 0.72, 0.89, 0.98],
}
const GLASS_SURFACE_DENSITY: Record<GlassAppearance, readonly number[]> = {
  clear: [1, 0.88, 0.62, 0.42, 0.26, 0.18],
  tinted: [1, 0.92, 0.72, 0.52, 0.39, 0.3],
  frosted: [1, 0.9, 0.7, 0.52, 0.36, 0.22],
}
const GLASS_TINT_DENSITY = [1, 0.9, 0.65, 0.48, 0.36, 0.28] as const
const GLASS_FROST_DENSITY = [1, 0.9, 0.7, 0.34, 0.12, 0.04] as const
const GLASS_FROSTED_DENSITY = [1, 0.82, 0.55, 0.28, 0.1, 0.025] as const
const GLASS_OVERLAY_CLARITY_BLUR = [8.9, 7.8, 6.7, 5.8, 5.4, 5] as const

/** 在相邻业务锚点之间使用零斜率边界插值，避免滑杆经过锚点时出现视觉折线。 */
function interpolateGlassResponse(value: unknown, anchors: readonly number[]) {
  const normalized = normalizeGlassOpticalStrength(value)
  const upperIndex = GLASS_RESPONSE_STOPS.findIndex(stop => normalized <= stop)
  if (upperIndex <= 0) return anchors[0]

  const lowerIndex = upperIndex - 1
  const lowerStop = GLASS_RESPONSE_STOPS[lowerIndex]
  const upperStop = GLASS_RESPONSE_STOPS[upperIndex]
  const linearProgress = (normalized - lowerStop) / (upperStop - lowerStop)
  const smoothProgress = linearProgress * linearProgress * (3 - 2 * linearProgress)

  return anchors[lowerIndex] + (anchors[upperIndex] - anchors[lowerIndex]) * smoothProgress
}

/**
 * 一个通透度输入派生互不混用的材质响应；tone、曝光和透射亮度不在此处计算。
 */
export function getGlassMaterialResponse(appearance: GlassAppearance, value: unknown): GlassMaterialResponse {
  const frostDensity = interpolateGlassResponse(
    value,
    appearance === 'frosted' ? GLASS_FROSTED_DENSITY : GLASS_FROST_DENSITY,
  )

  return {
    backgroundVisibility: interpolateGlassResponse(value, GLASS_BACKGROUND_VISIBILITY[appearance]),
    frostBlurScale: 0.4 + frostDensity * 1.2,
    frostDetailLevel: 1 - frostDensity,
    surfaceDensity: interpolateGlassResponse(value, GLASS_SURFACE_DENSITY[appearance]),
    tintDensity: interpolateGlassResponse(value, GLASS_TINT_DENSITY),
  }
}

/** 标准档磨砂使用独立的 surface/raised 半径锚点，不借用背景亮度制造厚度。 */
export function getGlassCssFrostBlur(value: unknown) {
  return {
    raised: interpolateGlassResponse(value, [84, 70, 50, 35, 24, 16]),
    surface: interpolateGlassResponse(value, [64, 52, 36, 24, 15, 8]),
  }
}

/** 透明与色调浮层保留独立模糊下限，避免高通透度使临时内容直接暴露在复杂壁纸上。 */
export function getGlassOverlayClarityBlur(value: unknown) {
  return interpolateGlassResponse(value, GLASS_OVERLAY_CLARITY_BLUR)
}

/** 计算与 CSS `ease` 相同的交叉淡化进度，使 DOM 壁纸与 shader 双纹理保持同一时钟。 */
export function getGlassWallpaperTransitionProgress(elapsed: number, duration: number) {
  if (duration <= 0 || elapsed >= duration) return 1
  if (elapsed <= 0) return 0

  const target = elapsed / duration
  const sample = (time: number, start: number, end: number) => {
    const inverse = 1 - time

    return 3 * inverse * inverse * time * start + 3 * inverse * time * time * end + time * time * time
  }
  let lower = 0
  let upper = 1
  let parameter = target

  for (let iteration = 0; iteration < 10; iteration += 1) {
    parameter = (lower + upper) * 0.5
    if (sample(parameter, 0.25, 0.25) < target) lower = parameter
    else upper = parameter
  }

  return sample(parameter, 0.1, 1)
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

/** 采样平移保持中点等于既有即时位移，并在高区间受控增长。 */
export function getGlassOpticalTranslationStrengthScale(value: unknown) {
  const normalized = normalizeGlassOpticalStrength(value)
  const normalizedRatio = normalized / GLASS_OPTICAL_STRENGTH_DEFAULT

  return normalizedRatio ** Math.log2(GLASS_OPTICAL_TRANSLATION_MAX_SCALE)
}

/** 非均匀形变独立缩放局部折射，最终像素位移仍受质量档软上限限制。 */
export function getGlassOpticalDeformationStrengthScale(value: unknown) {
  const normalized = normalizeGlassOpticalStrength(value)
  const normalizedRatio = normalized / GLASS_OPTICAL_STRENGTH_DEFAULT

  return normalizedRatio ** Math.log2(GLASS_OPTICAL_DEFORMATION_MAX_SCALE)
}

/** 流动维度只延展轨迹、尾波与惯性，中点保持当前时序手感。 */
export function getGlassOpticalFlowStrengthScale(value: unknown) {
  const normalized = normalizeGlassOpticalStrength(value)
  const normalizedRatio = normalized / GLASS_OPTICAL_STRENGTH_DEFAULT

  return normalizedRatio ** Math.log2(GLASS_OPTICAL_FLOW_MAX_SCALE)
}

/** 流动强度在完整滑杆区间连续控制轨迹范围，低值也能明显收紧空间足迹。 */
export function getGlassOpticalMotionExpansion(value: unknown) {
  const normalized = normalizeGlassOpticalStrength(value)

  return (normalized / GLASS_OPTICAL_STRENGTH_MAX) ** 1.4
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

/** 通透度独立控制真实背景与可读性遮罩的占比，高区间仍受 shader 可读性上限保护。 */
export function getGlassOpticalTransparency(value: unknown) {
  const normalized = normalizeGlassOpticalStrength(value)
  if (normalized <= GLASS_OPTICAL_REFERENCE_STRENGTH) {
    const progress = normalized / GLASS_OPTICAL_REFERENCE_STRENGTH

    return 0.96 * progress ** 0.83
  }

  const highRangeProgress =
    (normalized - GLASS_OPTICAL_REFERENCE_STRENGTH) / (GLASS_OPTICAL_STRENGTH_MAX - GLASS_OPTICAL_REFERENCE_STRENGTH)

  return 0.96 + 0.14 * highRangeProgress ** 1.35
}

/** 标准 CSS 材质在壁纸归一化后只做窄幅目标亮度调整，避免重新放大原始明暗差异。 */
export function getGlassOpticalCssTransmissionBrightness(value: unknown) {
  const transmission = getGlassOpticalTransmissionStrength(value)
  if (transmission <= 1) {
    return 0.84 + 0.16 * transmission ** 1.05
  }

  const progress = (transmission - 1) / 0.3

  return 1 + 0.08 * progress ** 1.1
}

/** 实时 renderer 以 70 为归一化目标亮度参考，并在 shader 中按材质和质量执行高亮保护。 */
export function getGlassOpticalTransmissionStrength(value: unknown) {
  const normalized = normalizeGlassOpticalStrength(value)
  if (normalized <= GLASS_OPTICAL_REFERENCE_STRENGTH) {
    return normalized / GLASS_OPTICAL_REFERENCE_STRENGTH
  }

  const highRangeProgress =
    (normalized - GLASS_OPTICAL_REFERENCE_STRENGTH) / (GLASS_OPTICAL_STRENGTH_MAX - GLASS_OPTICAL_REFERENCE_STRENGTH)

  return 1 + 0.3 * highRangeProgress ** 1.2
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

/** 新活动表面立即接管输入，离场表面只做短时单调淡出。 */
export function getGlassOpticalSurfaceTransitionWeights(elapsed: number, duration: number) {
  const progress = Math.min(1, Math.max(0, elapsed / Math.max(1, duration)))
  const eased = progress * progress * (3 - 2 * progress)

  return {
    incoming: 1,
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

/** 过滤浏览器不会作为纹理读取的协议；跨域读取能力由实际纹理加载结果判定。 */
export function canUseGlassWallpaperTexture(url: string, documentUrl: string): boolean {
  if (!url || !documentUrl) return false

  try {
    const source = new URL(url, documentUrl)
    if (source.protocol === 'blob:' || source.protocol === 'data:') return true

    const document = new URL(documentUrl)
    if (source.protocol !== 'http:' && source.protocol !== 'https:') return false
    if (document.protocol === 'https:' && source.protocol === 'http:') return false

    return true
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

/** 文档空间画布独立限制横纵分辨率，避免长页面按纵横比连带降低横向清晰度。 */
export function getGlassScrollBufferSize(
  presentationWidth: number,
  presentationHeight: number,
  quality: GlassOpticalQuality,
  devicePixelRatio = 1,
): GlassOpticalBufferSize {
  const highQuality = quality === 'high'
  const pixelRatio = highQuality ? Math.min(Math.max(1, devicePixelRatio), 1.5) : 1
  const maxWidth = highQuality ? 1920 : 1440
  const maxHeight = highQuality ? 4096 : 3072

  return {
    height: Math.max(1, Math.round(Math.min(presentationHeight * pixelRatio, maxHeight))),
    width: Math.max(1, Math.round(Math.min(presentationWidth * pixelRatio, maxWidth))),
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
  const radii = rect.radii.map(radius => Math.max(0, radius)) as GlassCornerRadii
  const [topLeft, topRight, bottomRight, bottomLeft] = radii
  const fitScale = (side: number, radiusSum: number) => (radiusSum > 0 ? Math.max(0, side) / radiusSum : 1)
  // CSS 会用同一个比例缩小全部圆角，保证任一边的相邻半径之和不超过该边长度。
  const radiusScale = Math.min(
    1,
    fitScale(rect.width, topLeft + topRight),
    fitScale(rect.width, bottomLeft + bottomRight),
    fitScale(rect.height, topLeft + bottomLeft),
    fitScale(rect.height, topRight + bottomRight),
  )

  return {
    radii: radii.map(radius => radius * radiusScale) as GlassCornerRadii,
    rect: [
      rect.x / safeWidth,
      1 - (rect.y + rect.height) / safeHeight,
      rect.width / safeWidth,
      rect.height / safeHeight,
    ] as const,
  }
}
