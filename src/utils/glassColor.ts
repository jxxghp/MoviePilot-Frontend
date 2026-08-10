interface OklabColor {
  lightness: number
  a: number
  b: number
}

interface OklchColor {
  lightness: number
  chroma: number
  hue: number
}

export interface GlassAccentColor {
  /** 可传给颜色输入或 WebGL 的六位十六进制色值。 */
  hex: string
  /** 可直接用于 `rgb()` / `rgba()` CSS 变量的通道值。 */
  rgb: string
}

const PLUGIN_ACCENT_MIN_LIGHTNESS = 0.48
const PLUGIN_ACCENT_MAX_LIGHTNESS = 0.76
const PLUGIN_ACCENT_MAX_CHROMA = 0.18
const THEME_MATERIAL_MIN_LIGHTNESS = 0.56
const THEME_MATERIAL_MAX_LIGHTNESS = 0.72
const THEME_MATERIAL_MAX_CHROMA = 0.14
const NEUTRAL_CHROMA_THRESHOLD = 0.02
const GAMUT_SEARCH_ITERATIONS = 24

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function parseHexColor(color: string) {
  if (!/^#[0-9a-f]{6}$/i.test(color)) return undefined

  return [
    Number.parseInt(color.slice(1, 3), 16) / 255,
    Number.parseInt(color.slice(3, 5), 16) / 255,
    Number.parseInt(color.slice(5, 7), 16) / 255,
  ] as const
}

function srgbToLinear(channel: number) {
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
}

function linearToSrgb(channel: number) {
  return channel <= 0.0031308 ? 12.92 * channel : 1.055 * channel ** (1 / 2.4) - 0.055
}

function srgbToOklab([red, green, blue]: readonly [number, number, number]): OklabColor {
  const linearRed = srgbToLinear(red)
  const linearGreen = srgbToLinear(green)
  const linearBlue = srgbToLinear(blue)
  const l = Math.cbrt(0.4122214708 * linearRed + 0.5363325363 * linearGreen + 0.0514459929 * linearBlue)
  const m = Math.cbrt(0.2119034982 * linearRed + 0.6806995451 * linearGreen + 0.1073969566 * linearBlue)
  const s = Math.cbrt(0.0883024619 * linearRed + 0.2817188376 * linearGreen + 0.6299787005 * linearBlue)

  return {
    lightness: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  }
}

function oklabToLinearSrgb({ lightness, a, b }: OklabColor) {
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3

  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ] as const
}

function oklabToOklch({ lightness, a, b }: OklabColor): OklchColor {
  return {
    lightness,
    chroma: Math.hypot(a, b),
    hue: Math.atan2(b, a),
  }
}

function oklchToOklab({ lightness, chroma, hue }: OklchColor): OklabColor {
  return {
    lightness,
    a: chroma * Math.cos(hue),
    b: chroma * Math.sin(hue),
  }
}

function isInSrgbGamut(color: OklchColor) {
  return oklabToLinearSrgb(oklchToOklab(color)).every(channel => channel >= 0 && channel <= 1)
}

function mapChromaToSrgb(color: OklchColor): OklchColor {
  if (isInSrgbGamut(color)) return color

  let lowerChroma = 0
  let upperChroma = color.chroma
  for (let iteration = 0; iteration < GAMUT_SEARCH_ITERATIONS; iteration += 1) {
    const candidateChroma = (lowerChroma + upperChroma) / 2
    if (isInSrgbGamut({ ...color, chroma: candidateChroma })) lowerChroma = candidateChroma
    else upperChroma = candidateChroma
  }

  return { ...color, chroma: lowerChroma }
}

function formatAccentColor(color: OklchColor): GlassAccentColor {
  const channels = oklabToLinearSrgb(oklchToOklab(color)).map(channel =>
    Math.round(clamp(linearToSrgb(channel), 0, 1) * 255),
  ) as [number, number, number]

  return {
    hex: `#${channels.map(channel => channel.toString(16).padStart(2, '0')).join('')}`,
    rgb: channels.join(', '),
  }
}

function normalizeAccentColor(color: string, minLightness: number, maxLightness: number, maxChroma: number) {
  const srgb = parseHexColor(color)
  if (!srgb) return undefined

  const source = oklabToOklch(srgbToOklab(srgb))
  const chroma = source.chroma < NEUTRAL_CHROMA_THRESHOLD ? source.chroma : Math.min(source.chroma, maxChroma)
  const normalized = mapChromaToSrgb({
    lightness: clamp(source.lightness, minLightness, maxLightness),
    chroma,
    hue: source.hue,
  })

  return formatAccentColor(normalized)
}

/** 将插件 Logo 主色限制在可读范围内，同时保持品牌色相与中性色属性。 */
export function normalizePluginAccentColor(color: string): GlassAccentColor | undefined {
  return normalizeAccentColor(color, PLUGIN_ACCENT_MIN_LIGHTNESS, PLUGIN_ACCENT_MAX_LIGHTNESS, PLUGIN_ACCENT_MAX_CHROMA)
}

/** 派生大面积色调玻璃使用的材料色，不改变用户选择的真实主色。 */
export function normalizeThemeMaterialAccent(color: string): GlassAccentColor | undefined {
  return normalizeAccentColor(
    color,
    THEME_MATERIAL_MIN_LIGHTNESS,
    THEME_MATERIAL_MAX_LIGHTNESS,
    THEME_MATERIAL_MAX_CHROMA,
  )
}
