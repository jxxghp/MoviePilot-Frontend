import { preloadCorsImage } from '@/@core/utils/corsImage'

/** DOM 背景与光学材质共用的壁纸亮度，保证采样和可见背景一致。 */
export interface GlassWallpaperToneProfile {
  /** 先按原图明暗有限补偿，再统一压低曝光，避免壁纸抢占正文对比度。 */
  exposure: number
  /** 壁纸采样的高亮分位亮度，用于约束亮场曝光。 */
  highlightLuminance: number
  /** 壁纸采样的中位亮度，用于确定稳健的整体曝光。 */
  medianLuminance: number
}

/** 一次图片解码同时给出 WebGL 可读性与壁纸曝光分析结果。 */
export interface GlassWallpaperToneLoadResult {
  /** 当前 URL 已按匿名 CORS 模式完成解码，可安全交给 WebGL。 */
  corsReady: boolean
  /** 与 DOM 背景和 renderer 共用的有限曝光 profile。 */
  profile: GlassWallpaperToneProfile
}

/** 交给 renderer 消费的一次性已解码壁纸源。 */
export interface GlassWallpaperDecodedSource {
  /** 已完成匿名 CORS 解码的图片。 */
  image: HTMLImageElement
  /** 与该图片同一次解码得到的曝光 profile。 */
  profile: GlassWallpaperToneProfile
}

const ANALYSIS_MAX_EDGE = 64
const DECODED_SOURCE_CACHE_LIMIT = 3
const PROFILE_CACHE_LIMIT = 32
const PROFILE_LOAD_TIMEOUT_MS = 3000
const EXPOSURE_MIN = 0.88
const EXPOSURE_MAX = 1.14
const READABILITY_EXPOSURE = 0.72
const MEDIAN_TARGET = 0.38
const HIGHLIGHT_TARGET = 0.82

export const DEFAULT_GLASS_WALLPAPER_TONE_PROFILE: GlassWallpaperToneProfile = {
  exposure: READABILITY_EXPOSURE,
  highlightLuminance: HIGHLIGHT_TARGET,
  medianLuminance: MEDIAN_TARGET,
}

const profileCache = new Map<string, Promise<GlassWallpaperToneLoadResult>>()
const decodedSourceCache = new Map<string, GlassWallpaperDecodedSource>()

/** 将图片采样和曝光约束在可预期的范围内。 */
function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

/** 从排序后的有效亮度样本中取稳定分位，避免少量极值主导曝光。 */
function readPercentile(sorted: number[], percentile: number) {
  if (!sorted.length) return 0

  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * percentile)))]
}

/**
 * 以中位亮度为主、高亮分位为辅计算有限曝光。
 * 指数响应缩小跨壁纸差异后统一降低曝光，保留图像细节并优先保证正文可读性。
 */
export function getGlassWallpaperToneProfile(luminances: number[]): GlassWallpaperToneProfile {
  const sorted = luminances
    .filter(Number.isFinite)
    .map(value => clamp(value, 0, 1))
    .sort((a, b) => a - b)
  if (!sorted.length) return { ...DEFAULT_GLASS_WALLPAPER_TONE_PROFILE }

  const medianLuminance = readPercentile(sorted, 0.5)
  const highlightLuminance = readPercentile(sorted, 0.9)
  const medianExposure = (MEDIAN_TARGET / Math.max(medianLuminance, 0.06)) ** 0.22
  const highlightExposure = (HIGHLIGHT_TARGET / Math.max(highlightLuminance, 0.15)) ** 0.16
  const exposure =
    clamp(medianExposure * 0.75 + highlightExposure * 0.25, EXPOSURE_MIN, EXPOSURE_MAX) * READABILITY_EXPOSURE

  return {
    exposure,
    highlightLuminance,
    medianLuminance,
  }
}

/** 从已解码图片生成与 renderer、DOM 背景层共用的稳健亮度 profile。 */
export function analyzeGlassWallpaperTone(image: CanvasImageSource, width: number, height: number) {
  if (typeof document === 'undefined' || width <= 0 || height <= 0) {
    return { ...DEFAULT_GLASS_WALLPAPER_TONE_PROFILE }
  }

  try {
    const scale = Math.min(1, ANALYSIS_MAX_EDGE / Math.max(width, height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(width * scale))
    canvas.height = Math.max(1, Math.round(height * scale))
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) return { ...DEFAULT_GLASS_WALLPAPER_TONE_PROFILE }

    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data
    const luminances: number[] = []

    for (let offset = 0; offset < pixels.length; offset += 4) {
      if (pixels[offset + 3] < 128) continue
      luminances.push((pixels[offset] * 0.2126 + pixels[offset + 1] * 0.7152 + pixels[offset + 2] * 0.0722) / 255)
    }

    return getGlassWallpaperToneProfile(luminances)
  } catch {
    return { ...DEFAULT_GLASS_WALLPAPER_TONE_PROFILE }
  }
}

/** 有界保留已解码壁纸的分析结果，避免旋转时重复分析相同图片。 */
function rememberProfile(url: string, profile: Promise<GlassWallpaperToneLoadResult>) {
  if (profileCache.size >= PROFILE_CACHE_LIMIT) {
    const oldestKey = profileCache.keys().next().value
    if (oldestKey) profileCache.delete(oldestKey)
  }

  profileCache.set(url, profile)
  return profile
}

/** 只保留 current/previous/prepared 三个候选，避免完整解码图片变成长期内存缓存。 */
function rememberDecodedSource(url: string, source: GlassWallpaperDecodedSource) {
  decodedSourceCache.delete(url)
  decodedSourceCache.set(url, source)

  while (decodedSourceCache.size > DECODED_SOURCE_CACHE_LIMIT) {
    const oldestKey = decodedSourceCache.keys().next().value
    if (oldestKey) decodedSourceCache.delete(oldestKey)
  }
}

/**
 * renderer 取得已完成 tone 分析的图片后立即移出缓存。
 * fixed 与 scroll context 后续通过 renderer 自身的 CPU source cache 共享缩放结果。
 */
export function takeGlassWallpaperDecodedSource(url: string): GlassWallpaperDecodedSource | undefined {
  const source = decodedSourceCache.get(url)
  if (source) decodedSourceCache.delete(url)

  return source
}

/** 在超时范围内解码并分析可跨域读取的壁纸，失败使用同样压暗的默认曝光。 */
function loadCorsReadableToneProfile(url: string): Promise<GlassWallpaperToneLoadResult> {
  return new Promise(resolve => {
    const image = new Image()
    let settled = false
    const finish = (result: GlassWallpaperToneLoadResult) => {
      if (settled) return
      settled = true
      window.clearTimeout(timeout)
      resolve(result)
    }
    const timeout = window.setTimeout(
      () => finish({ corsReady: false, profile: { ...DEFAULT_GLASS_WALLPAPER_TONE_PROFILE } }),
      PROFILE_LOAD_TIMEOUT_MS,
    )

    image.crossOrigin = 'anonymous'
    image.decoding = 'async'
    image.onload = () => {
      const profile = analyzeGlassWallpaperTone(
        image,
        image.naturalWidth || image.width,
        image.naturalHeight || image.height,
      )
      rememberDecodedSource(url, { image, profile })
      finish({
        corsReady: true,
        profile,
      })
    }
    image.onerror = () =>
      finish({
        corsReady: false,
        profile: { ...DEFAULT_GLASS_WALLPAPER_TONE_PROFILE },
      })
    image.src = url
  })
}

/**
 * 以一次匿名图片解码同时完成 WebGL 可读性检查和曝光分析。
 * 只有旧的非 CORS 缓存污染读取时才强制重新验证，再进行一次解码。
 */
export function loadGlassWallpaperTone(url: string): Promise<GlassWallpaperToneLoadResult> {
  if (!url || typeof Image === 'undefined') {
    return Promise.resolve({
      corsReady: false,
      profile: { ...DEFAULT_GLASS_WALLPAPER_TONE_PROFILE },
    })
  }

  const cached = profileCache.get(url)
  if (cached) return cached

  const profile = (async () => {
    const initial = await loadCorsReadableToneProfile(url)
    if (initial.corsReady || !(await preloadCorsImage(url))) return initial

    return loadCorsReadableToneProfile(url)
  })()

  rememberProfile(url, profile)
  void profile.then(
    result => {
      if (!result.corsReady && profileCache.get(url) === profile) profileCache.delete(url)
    },
    () => {
      if (profileCache.get(url) === profile) profileCache.delete(url)
    },
  )

  return profile
}

/**
 * 为 DOM 背景层加载可读像素。跨域来源不支持 CORS 时回落默认压暗 profile，
 * 避免亮度分析阻断壁纸本身的 CSS 显示能力。
 */
export async function loadGlassWallpaperToneProfile(url: string): Promise<GlassWallpaperToneProfile> {
  return (await loadGlassWallpaperTone(url)).profile
}
