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

// 提取主要颜色
export async function getDominantColor(image: HTMLImageElement): Promise<string> {
  const colorThief = new ColorThief()
  const dominantColor = colorThief.getColor(image)
  return rgbStringToHex(dominantColor)
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
