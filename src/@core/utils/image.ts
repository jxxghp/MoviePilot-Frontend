import ColorThief from 'colorthief'
export { preloadCorsImage } from './corsImage'

const DEFAULT_DOMINANT_COLOR = '#28A9E1'
const DOMINANT_COLOR_CACHE_LIMIT = 100
const PALETTE_SWATCH_COUNT = 6
const DEFAULT_PALETTE_QUALITY = 16
const DEFAULT_DOMINANT_QUALITY = 20
const NEAR_WHITE_CHANNEL_THRESHOLD = 238
const NEAR_BLACK_CHANNEL_THRESHOLD = 18
const MIN_BRAND_CHROMA = 0.08
const MIN_BRAND_SATURATION = 0.14

interface ColorThiefInstance {
  getColor: (image: HTMLImageElement, quality?: number) => number[]
  getPalette?: (image: HTMLImageElement, colorCount?: number, quality?: number) => number[][] | null
}

let colorThiefInstance: ColorThiefInstance | undefined

function resolveColorThiefConstructor(mod: unknown): new () => ColorThiefInstance {
  if (typeof mod === 'function') {
    return mod as new () => ColorThiefInstance
  }
  if (mod && typeof mod === 'object' && 'default' in mod && typeof mod.default === 'function') {
    return mod.default as new () => ColorThiefInstance
  }
  throw new Error('ColorThief constructor unavailable')
}

function getColorThief(): ColorThiefInstance {
  if (!colorThiefInstance) {
    const Ctor = resolveColorThiefConstructor(ColorThief)
    colorThiefInstance = new Ctor()
  }
  return colorThiefInstance
}
const dominantColorCache = new Map<string, string>()
const pendingDominantColorRequests = new Map<string, Promise<string | undefined>>()

interface DominantColorOptions {
  fallback?: string
  quality?: number
}

// 将 RGB 转换为十六进制
function rgbStringToHex(rgbArray: number[]): string {
  if (rgbArray.length !== 3 || rgbArray.some(isNaN)) throw new Error('Invalid RGB string format')

  const [r, g, b] = rgbArray

  const toHex = (c: number): string => {
    const hex = c.toString(16)
    return hex.length === 1 ? `0${hex}` : hex
  }

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

function getImageCacheKey(image: HTMLImageElement) {
  return image.currentSrc || image.src || ''
}

function rememberDominantColor(key: string, color: string) {
  if (!key) return

  if (dominantColorCache.size >= DOMINANT_COLOR_CACHE_LIMIT) {
    const firstKey = dominantColorCache.keys().next().value
    if (firstKey) dominantColorCache.delete(firstKey)
  }

  dominantColorCache.set(key, color)
}

/**
 * 从候选调色板中筛选高饱和度品牌色，排除近白圆底、近黑背景与抗锯齿中性灰边。
 * 若全部色板均为中性灰或极端明度，则返回 undefined 交由主色回退处理。
 */
export function selectVibrantSwatch(palette: number[][]): number[] | undefined {
  let bestSwatch: number[] | undefined
  let bestScore = -1

  palette.forEach((swatch, index) => {
    if (!Array.isArray(swatch) || swatch.length !== 3 || swatch.some(Number.isNaN)) return

    const [r, g, b] = swatch
    if (r > NEAR_WHITE_CHANNEL_THRESHOLD && g > NEAR_WHITE_CHANNEL_THRESHOLD && b > NEAR_WHITE_CHANNEL_THRESHOLD) {
      return
    }
    if (r < NEAR_BLACK_CHANNEL_THRESHOLD && g < NEAR_BLACK_CHANNEL_THRESHOLD && b < NEAR_BLACK_CHANNEL_THRESHOLD) {
      return
    }

    const max = Math.max(r, g, b) / 255
    const min = Math.min(r, g, b) / 255
    const chroma = max - min
    const saturation = max === 0 ? 0 : chroma / max
    if (chroma < MIN_BRAND_CHROMA && saturation < MIN_BRAND_SATURATION) return

    // 兼顾色彩纯度与色簇像素占比，避免极小面积杂色压过主品牌色相。
    const prominenceWeight = Math.max(0.55, 1 - index * 0.06)
    const score = (chroma * 0.68 + saturation * 0.32) * prominenceWeight
    if (score > bestScore) {
      bestScore = score
      bestSwatch = swatch
    }
  })

  return bestSwatch
}

/** 提取真实主色；优先选取调色板中的高饱和品牌色相，失败不写入成功缓存以便后续重试。 */
export async function extractDominantColor(
  image: HTMLImageElement | undefined | null,
  options: Pick<DominantColorOptions, 'quality'> = {},
): Promise<string | undefined> {
  if (!image) return undefined

  const cacheKey = getImageCacheKey(image)
  const cachedColor = cacheKey ? dominantColorCache.get(cacheKey) : undefined
  if (cachedColor) return cachedColor

  const pendingRequest = cacheKey ? pendingDominantColorRequests.get(cacheKey) : undefined
  if (pendingRequest) return pendingRequest

  const colorPromise = Promise.resolve()
    .then(() => {
      const colorThief = getColorThief()
      let selectedColor: number[] | undefined
      if (typeof colorThief.getPalette === 'function') {
        const palette = colorThief.getPalette(image, PALETTE_SWATCH_COUNT, options.quality ?? DEFAULT_PALETTE_QUALITY)
        if (Array.isArray(palette) && palette.length > 0) {
          selectedColor = selectVibrantSwatch(palette)
        }
      }

      const dominantColor = selectedColor ?? colorThief.getColor(image, options.quality ?? DEFAULT_DOMINANT_QUALITY)
      const color = rgbStringToHex(dominantColor)
      rememberDominantColor(cacheKey, color)

      return color
    })
    .catch(error => {
      console.warn('Failed to extract dominant color:', error)
      return undefined
    })
    .finally(() => {
      if (cacheKey) pendingDominantColorRequests.delete(cacheKey)
    })

  if (cacheKey) pendingDominantColorRequests.set(cacheKey, colorPromise)

  return colorPromise
}

/** 提取主色并在失败时解析调用方 fallback，保持既有调用合同。 */
export async function getDominantColor(
  image: HTMLImageElement | undefined | null,
  options: DominantColorOptions = {},
): Promise<string> {
  const fallback = options.fallback ?? DEFAULT_DOMINANT_COLOR

  return (await extractDominantColor(image, options)) ?? fallback
}

// 预加载图片
export async function preloadImage(url: string): Promise<boolean> {
  return new Promise(resolve => {
    const img = new Image()
    let settled = false
    const finish = (available: boolean) => {
      if (settled) return

      settled = true
      clearTimeout(timeout)
      resolve(available)
    }

    img.onload = () => finish(true)
    img.onerror = () => finish(false)

    // 设置超时，防止图片长时间加载
    const timeout = setTimeout(() => {
      img.src = ''
      finish(false)
    }, 5000) // 5秒超时

    img.src = url

    // 如果图片已经缓存，onload可能不会触发
    if (img.complete) {
      finish(img.naturalWidth > 0)
    }
  })
}
