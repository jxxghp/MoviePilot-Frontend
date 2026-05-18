import { getDominantColor } from '@/@core/utils/image'

const DEFAULT_ACCENT_RGB = '145, 85, 253'

/** 将图标主色转换为卡片 CSS 变量可直接使用的 RGB 字符串。 */
function hexToRgbString(hexColor: string) {
  const normalizedColor = hexColor.replace('#', '')
  const colorValue = Number.parseInt(normalizedColor, 16)

  if (Number.isNaN(colorValue) || normalizedColor.length !== 6) return DEFAULT_ACCENT_RGB

  return `${(colorValue >> 16) & 255}, ${(colorValue >> 8) & 255}, ${colorValue & 255}`
}

/** 从指定图片中提取卡片强调色，返回 CSS 变量可直接使用的 RGB 字符串。 */
export async function getCardAccentRgbFromImage(image: HTMLImageElement | undefined | null, fallback = '#9155FD') {
  const dominantColor = await getDominantColor(image, { fallback })

  return hexToRgbString(dominantColor)
}

/** 从卡片图标中提取强调色，保证设置页卡片颜色跟随各自图标。 */
export function useCardAccentColor(fallback = '#9155FD') {
  const accentRgb = ref(DEFAULT_ACCENT_RGB)
  const imageRef = ref<any>()

  async function updateAccentColor() {
    const imageElement = imageRef.value?.$el?.querySelector('img') as HTMLImageElement | undefined

    accentRgb.value = await getCardAccentRgbFromImage(imageElement, fallback)
  }

  return {
    accentRgb,
    imageRef,
    updateAccentColor,
  }
}
