import ColorThief from 'colorthief'

// 将 RGB 转换为十六进制
function rgbStringToHex(rgbArray: number[]): string {
  if (rgbArray.length !== 3 || rgbArray.some(isNaN))
    throw new Error('Invalid RGB string format')

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
