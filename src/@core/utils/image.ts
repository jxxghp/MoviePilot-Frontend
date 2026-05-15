import ColorThief from 'colorthief'

const DEFAULT_DOMINANT_COLOR = '#28A9E1'
const DOMINANT_COLOR_CACHE_LIMIT = 100
const colorThief = new ColorThief()
const dominantColorCache = new Map<string, Promise<string>>()

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

function rememberDominantColor(key: string, colorPromise: Promise<string>) {
  if (!key) return colorPromise

  if (dominantColorCache.size >= DOMINANT_COLOR_CACHE_LIMIT) {
    const firstKey = dominantColorCache.keys().next().value
    if (firstKey) dominantColorCache.delete(firstKey)
  }

  dominantColorCache.set(key, colorPromise)
  return colorPromise
}

// 提取主要颜色
export async function getDominantColor(
  image: HTMLImageElement | undefined | null,
  options: DominantColorOptions = {},
): Promise<string> {
  const fallback = options.fallback ?? DEFAULT_DOMINANT_COLOR

  if (!image) return fallback

  const cacheKey = getImageCacheKey(image)
  const cachedColor = cacheKey ? dominantColorCache.get(cacheKey) : undefined
  if (cachedColor) return cachedColor

  const colorPromise = Promise.resolve()
    .then(() => {
      const dominantColor = colorThief.getColor(image, options.quality ?? 20)
      return rgbStringToHex(dominantColor)
    })
    .catch(error => {
      console.warn('Failed to extract dominant color:', error)
      return fallback
    })

  return rememberDominantColor(cacheKey, colorPromise)
}

// 预加载图片
export async function preloadImage(url: string): Promise<boolean> {
  return new Promise(resolve => {
    const img = new Image()

    img.onload = () => resolve(true)
    img.onerror = () => resolve(false)

    // 设置超时，防止图片长时间加载
    const timeout = setTimeout(() => {
      img.src = ''
      resolve(false)
    }, 5000) // 5秒超时

    img.src = url

    // 如果图片已经缓存，onload可能不会触发
    if (img.complete) {
      clearTimeout(timeout)
      resolve(true)
    }
  })
}
