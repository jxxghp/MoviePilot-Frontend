import ColorThief from 'colorthief'
export { preloadCorsImage } from './corsImage'

const DEFAULT_DOMINANT_COLOR = '#28A9E1'
const DOMINANT_COLOR_CACHE_LIMIT = 100
const colorThief = new ColorThief()
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

/** 提取真实主色；失败不写入成功缓存，允许后续请求重试。 */
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
      const dominantColor = colorThief.getColor(image, options.quality ?? 20)
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
