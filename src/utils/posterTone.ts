import { preloadCorsImage } from '@/@core/utils/corsImage'

/** 海报主色调：只保留色相与饱和度，明度由使用方按可读性需要决定。 */
export interface PosterTone {
  /** 色相，0-359 */
  hue: number
  /** 饱和度百分比，已限制上限，避免卡片底色过艳 */
  saturation: number
}

const SAMPLE_WIDTH = 24
const SAMPLE_HEIGHT = 36
const SATURATION_CAP = 0.55
const TONE_CACHE_LIMIT = 200
const TONE_LOAD_TIMEOUT_MS = 4000

const toneCache = new Map<string, Promise<PosterTone | null>>()

/**
 * 从 RGBA 像素中提取主色调。
 * 按饱和度加权、压低过暗和过亮像素的权重，让海报主体色而不是大面积黑边或高光决定结果。
 */
export function getPosterToneFromPixels(pixels: ArrayLike<number>): PosterTone | null {
  let red = 0
  let green = 0
  let blue = 0
  let total = 0

  for (let offset = 0; offset + 3 < pixels.length; offset += 4) {
    if (pixels[offset + 3] < 128) continue
    const r = pixels[offset]
    const g = pixels[offset + 1]
    const b = pixels[offset + 2]
    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    const saturation = max ? (max - min) / max : 0
    const lightness = (max + min) / 510
    const weight = 0.15 + saturation * Math.max(0, 1 - Math.abs(lightness - 0.5) * 1.6)
    red += r * weight
    green += g * weight
    blue += b * weight
    total += weight
  }

  if (!total) return null
  return rgbToTone(red / total, green / total, blue / total)
}

function rgbToTone(red: number, green: number, blue: number): PosterTone {
  const r = red / 255
  const g = green / 255
  const b = blue / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const lightness = (max + min) / 2
  let hue = 0
  let saturation = 0

  if (max !== min) {
    const delta = max - min
    saturation = lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min)
    if (max === r) hue = (g - b) / delta + (g < b ? 6 : 0)
    else if (max === g) hue = (b - r) / delta + 2
    else hue = (r - g) / delta + 4
    hue *= 60
  }

  return {
    hue: Math.round(hue) % 360,
    saturation: Math.round(Math.min(saturation, SATURATION_CAP) * 100),
  }
}

function decodePosterTone(url: string): Promise<PosterTone | null | undefined> {
  return new Promise(resolve => {
    const image = new Image()
    let settled = false
    const finish = (tone: PosterTone | null | undefined) => {
      if (settled) return
      settled = true
      window.clearTimeout(timeout)
      image.onload = null
      image.onerror = null
      resolve(tone)
    }
    const timeout = window.setTimeout(() => finish(undefined), TONE_LOAD_TIMEOUT_MS)

    image.crossOrigin = 'anonymous'
    image.decoding = 'async'
    image.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = SAMPLE_WIDTH
        canvas.height = SAMPLE_HEIGHT
        const context = canvas.getContext('2d', { willReadFrequently: true })
        if (!context) return finish(undefined)
        context.drawImage(image, 0, 0, SAMPLE_WIDTH, SAMPLE_HEIGHT)
        finish(getPosterToneFromPixels(context.getImageData(0, 0, SAMPLE_WIDTH, SAMPLE_HEIGHT).data))
      } catch {
        // 画布被污染说明拿到的不是 CORS 响应，交给调用方决定是否修复缓存后重试。
        finish(undefined)
      }
    }
    image.onerror = () => finish(undefined)
    image.src = url
  })
}

/**
 * 解码并采样海报；undefined 表示图片无法以 CORS 方式读取，null 表示读到了但没有可用像素。
 * 卡片里的 <img> 通常已用普通模式加载过同一张海报，浏览器缓存中的那份响应缺少 CORS 头，
 * 首次匿名读取会失败；此时先用 preloadCorsImage 修复缓存条目，再重试一次。
 */
async function samplePosterTone(url: string): Promise<PosterTone | null> {
  const first = await decodePosterTone(url)
  if (first !== undefined) return first
  if (!(await preloadCorsImage(url))) return null
  return (await decodePosterTone(url)) ?? null
}

/**
 * 读取海报主色调，结果按 URL 缓存。
 * 需要图源允许匿名跨域读取（同源图片缓存代理、TMDB 等）；读不到像素时返回 null，由调用方回退到中性底色。
 */
export function loadPosterTone(url: string): Promise<PosterTone | null> {
  if (!url || typeof document === 'undefined') return Promise.resolve(null)

  const cached = toneCache.get(url)
  if (cached) return cached

  if (toneCache.size >= TONE_CACHE_LIMIT) {
    const oldestKey = toneCache.keys().next().value
    if (oldestKey !== undefined) toneCache.delete(oldestKey)
  }
  const tone = samplePosterTone(url)
  toneCache.set(url, tone)
  return tone
}
