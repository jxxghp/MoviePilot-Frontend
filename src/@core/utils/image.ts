import ColorThief from 'colorthief'

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

// 主色调缓存：相同 URL 不重复经过 ColorThief 的 canvas 解码
const DOMINANT_COLOR_CACHE_MAX = 200
const dominantColorCache = new Map<string, string>()

function rememberDominantColor(key: string, value: string) {
  if (!key) return
  if (dominantColorCache.size >= DOMINANT_COLOR_CACHE_MAX) {
    const first = dominantColorCache.keys().next().value
    if (first !== undefined) dominantColorCache.delete(first)
  }
  dominantColorCache.set(key, value)
}

// 提取主要颜色
export async function getDominantColor(image: HTMLImageElement): Promise<string> {
  const cacheKey = image?.currentSrc || image?.src || ''
  const cached = cacheKey ? dominantColorCache.get(cacheKey) : undefined
  if (cached) return cached
  try {
    const colorThief = new ColorThief()
    const dominantColor = colorThief.getColor(image)
    const hex = rgbStringToHex(dominantColor)
    rememberDominantColor(cacheKey, hex)
    return hex
  } catch (e) {
    console.warn('getDominantColor failed', e)
    return '#28A9E1'
  }
}

// 预加载缓存：已成功加载的 URL 不再重复创建 Image 对象
const PRELOAD_CACHE_MAX = 50
const preloadedUrls = new Set<string>()

function rememberPreloaded(url: string) {
  if (!url) return
  if (preloadedUrls.size >= PRELOAD_CACHE_MAX) {
    const first = preloadedUrls.values().next().value
    if (first !== undefined) preloadedUrls.delete(first)
  }
  preloadedUrls.add(url)
}

// 预加载图片
export async function preloadImage(url: string): Promise<boolean> {
  if (!url) return false
  if (preloadedUrls.has(url)) return true
  return new Promise(resolve => {
    const img = new Image()
    img.decoding = 'async'
    let settled = false

    const finish = (ok: boolean) => {
      if (settled) return
      settled = true
      img.onload = null
      img.onerror = null
      window.clearTimeout(timeout)
      if (ok) rememberPreloaded(url)
      else img.src = '' // 释放解码位图
      resolve(ok)
    }

    img.onload = () => finish(true)
    img.onerror = () => finish(false)

    const timeout = window.setTimeout(() => finish(false), 5000)

    img.src = url

    // 命中浏览器缓存时 onload 可能不会触发
    if (img.complete && img.naturalWidth > 0) finish(true)
  })
}

// TMDB 图片域名地址（仅作为兜底，调用方应优先用 globalSettings.TMDB_IMAGE_DOMAIN）
const TMDB_PATH_RE = /\/t\/p\/(original|w\d+|h\d+|w\d+_and_h\d+_bestv2)\//

/**
 * 把 TMDB 图片 URL 重置到指定渲染尺寸。非 TMDB URL（豆瓣 / Bangumi / 自定义代理）原样返回。
 * 用于在卡片场景下避免下载 / 解码 1MP+ 的原图。
 *
 * 常见尺寸：w92 / w154 / w185 / w342 / w500 / w780 / original（poster, backdrop）
 *           w45 / w185 / h632 / original（profile）
 */
export function tmdbResize(
  url: string | undefined | null,
  size: 'w92' | 'w154' | 'w185' | 'w342' | 'w500' | 'w780' | 'original',
): string {
  if (!url) return ''
  return url.replace(TMDB_PATH_RE, `/t/p/${size}/`)
}
