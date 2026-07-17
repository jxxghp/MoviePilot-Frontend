export interface ThemeLogoPalette {
  /** 标识主体色，保持与当前主题主色一致。 */
  primary: string
  /** 标识迎光面色阶。 */
  light: string
  /** 标识高光渐变色阶。 */
  highlight: string
  /** 标识第一层背光面色阶。 */
  dark: string
  /** 标识第二层背光面色阶。 */
  darker: string
  /** 标识内侧深色面色阶。 */
  deep: string
  /** 标识最深的内侧面色阶。 */
  deepest: string
}

interface HslColor {
  h: number
  l: number
  s: number
}

const sourceLogoPalette: Record<string, keyof ThemeLogoPalette> = {
  'rgb(141,81,249)': 'primary',
  'rgb(165,118,255)': 'light',
  'rgb(211,187,255)': 'highlight',
  'rgb(116,50,223)': 'dark',
  'rgb(110,38,217)': 'darker',
  'rgb(104,0,197)': 'deep',
  'rgb(91,0,197)': 'deepest',
}

const sourceLogoRgb: Record<keyof ThemeLogoPalette, [number, number, number]> = {
  primary: [141, 81, 249],
  light: [165, 118, 255],
  highlight: [211, 187, 255],
  dark: [116, 50, 223],
  darker: [110, 38, 217],
  deep: [104, 0, 197],
  deepest: [91, 0, 197],
}

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value))
}

function parseHexColor(hexColor: string) {
  const normalized = hexColor.trim().replace('#', '')
  if (!/^[\da-f]{6}$/i.test(normalized)) return null

  return [0, 2, 4].map(offset => Number.parseInt(normalized.slice(offset, offset + 2), 16)) as [number, number, number]
}

function rgbToHsl([red, green, blue]: [number, number, number]): HslColor {
  const r = red / 255
  const g = green / 255
  const b = blue / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const delta = max - min
  const l = (max + min) / 2

  if (delta === 0) return { h: 0, l, s: 0 }

  const s = delta / (1 - Math.abs(2 * l - 1))
  let h = 0

  if (max === r) h = ((g - b) / delta) % 6
  else if (max === g) h = (b - r) / delta + 2
  else h = (r - g) / delta + 4

  return { h: (h * 60 + 360) % 360, l, s }
}

function hslToRgb({ h, l, s }: HslColor) {
  const chroma = (1 - Math.abs(2 * l - 1)) * s
  const segment = h / 60
  const secondary = chroma * (1 - Math.abs((segment % 2) - 1))
  let channels: [number, number, number]

  if (segment < 1) channels = [chroma, secondary, 0]
  else if (segment < 2) channels = [secondary, chroma, 0]
  else if (segment < 3) channels = [0, chroma, secondary]
  else if (segment < 4) channels = [0, secondary, chroma]
  else if (segment < 5) channels = [secondary, 0, chroma]
  else channels = [chroma, 0, secondary]

  const offset = l - chroma / 2
  const rgb = channels.map(channel => Math.round((channel + offset) * 255))

  return `rgb(${rgb.join(',')})`
}

function shiftLogoTone(color: HslColor, hueOffset: number, lightnessOffset: number, saturationScale = 1) {
  return hslToRgb({
    h: (color.h + hueOffset + 360) % 360,
    l: clamp(color.l + lightnessOffset, 0.08, 0.92),
    s: clamp(color.s * saturationScale),
  })
}

/**
 * 从主题主色生成完整的标识明暗色阶。
 * 接近黑、白的主题色会反向拉开部分色阶，避免分面收敛成同一颜色。
 */
export function createThemeLogoPalette(primaryColor: string): ThemeLogoPalette {
  const rgb = parseHexColor(primaryColor) || [141, 81, 249]
  const hsl = rgbToHsl(rgb)
  const sourcePrimaryHsl = rgbToHsl(sourceLogoRgb.primary)
  const lightDirection = hsl.l >= 0.78 ? -1 : 1
  const darkDirection = hsl.l <= 0.22 ? 1 : -1
  const palette = Object.fromEntries(
    Object.entries(sourceLogoRgb).map(([key, sourceRgb]) => {
      const paletteKey = key as keyof ThemeLogoPalette
      if (paletteKey === 'primary') return [paletteKey, `rgb(${rgb.join(',')})`]

      const sourceHsl = rgbToHsl(sourceRgb)
      const hueOffset = sourceHsl.h - sourcePrimaryHsl.h
      const sourceLightnessDelta = sourceHsl.l - sourcePrimaryHsl.l
      const lightnessDelta =
        Math.abs(sourceLightnessDelta) * (sourceLightnessDelta >= 0 ? lightDirection : darkDirection)
      const saturationScale = sourcePrimaryHsl.s ? sourceHsl.s / sourcePrimaryHsl.s : 1

      return [paletteKey, shiftLogoTone(hsl, hueOffset, lightnessDelta, saturationScale)]
    }),
  ) as unknown as ThemeLogoPalette

  return palette
}

/** 将原始品牌 SVG 的色阶逐层映射到当前主题色家族，保留路径、渐变和透明高光。 */
export function applyThemeLogoPalette(svgSource: string, palette: ThemeLogoPalette) {
  return Object.entries(sourceLogoPalette).reduce(
    (svg, [sourceColor, paletteKey]) => svg.replaceAll(sourceColor, palette[paletteKey]),
    svgSource,
  )
}
