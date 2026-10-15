import { medalDial, type MedalArt, type MedalDial, type MedalShape } from '@/utils/communityMedalArt'
import { ENGRAVING_FONT, type MedalEngraving } from '@/utils/communityMedals'

/**
 * 背面刻字：精绘的刻字层与倾斜卡片的背面图共用同一版式。不依赖 three。
 *
 * 背面是抛光金属背板上的一块下沉铭牌。刻字按“勋章名、等级与称号、授予对象、时间”自上而下排，
 * 铭牌底部是一枚开放六边形加 MoviePilot 的制造者印记。所有行一种字体，行高约 1.4，任何一行在手机上都不小于最小字号。
 * 字读起来是同色金属上刻出来的：凹槽是铭牌金属深一档的同色，上沿一道内阴影，下沿一线略亮的边。
 */

// 解码过的图按地址缓存：展台打开时后台预解码所有持有勋章的图，切换时直接复用，不再逐张等网络与解码。
const imageCache = new Map<string, Promise<HTMLImageElement>>()

/** 加载并解码一张图；同一地址只加载一次，失败的请求不缓存，下次重试。 */
export function loadMedalImage(src: string): Promise<HTMLImageElement> {
  const cached = imageCache.get(src)
  if (cached) return cached
  const image = new Image()
  image.src = src
  // 放进 Promise 链里调用，缺少 decode 的环境同步抛错时也走拒绝分支，不会成为未捕获异常。
  const loading = Promise.resolve()
    .then(() => image.decode())
    .then(() => image)
  imageCache.set(src, loading)
  loading.catch(() => imageCache.delete(src))
  return loading
}

/**
 * 后台预解码一批勋章的正反面与高度图，展台打开时对所有持有的勋章调用一次；失败的图下次用到时再试。
 * 空闲时逐张进行，不和当前这枚抢网络与解码。
 */
export function preloadMedalImages(arts: (MedalArt | null)[]) {
  const sources = arts.flatMap(art =>
    art ? [art.front, art.back, ...(art.heights ? [art.heights.front, art.heights.back] : [])] : [],
  )
  const idle =
    typeof window !== 'undefined' && 'requestIdleCallback' in window
      ? (callback: () => void) => window.requestIdleCallback(callback, { timeout: 1500 })
      : (callback: () => void) => window.setTimeout(callback, 200)
  const next = () => {
    const source = sources.shift()
    if (!source) return
    loadMedalImage(source)
      .catch(() => undefined)
      .finally(() => idle(next))
  }
  idle(next)
}

/** 刻字颜色：凹槽、凹槽上沿的内阴影与下沿一线亮边，都取铭牌金属的同色相。 */
export interface EngravingInk {
  groove: string
  shadow: string
  edge: string
}

type Rgb = [number, number, number]

function hexToRgb(hex: string): Rgb | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!match) return null
  const value = parseInt(match[1], 16)
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255]
}

function mix(a: Rgb, b: Rgb, t: number): Rgb {
  return [0, 1, 2].map(i => Math.round(a[i] + (b[i] - a[i]) * t)) as Rgb
}

const css = ([r, g, b]: Rgb, alpha = 1) => `rgba(${r}, ${g}, ${b}, ${alpha})`

/**
 * 由金属色推出刻字颜色，读起来是同色金属上刻出的字：凹槽是同色相的深一档，上沿内阴影再深一些，
 * 下沿一线亮边只比金属略亮且半透明，不出现白色描边。金、玫瑰金、银上都按各自的金属色推算。
 * 金属色取铭牌区域的平均色；覆盖色存在时以它作凹槽色。
 */
export function engravingInk(metal: Rgb, override?: string | null): EngravingInk {
  const groove = (override && hexToRgb(override)) || mix(metal, [0, 0, 0], 0.58)
  return {
    groove: css(groove),
    shadow: css(mix(groove, [0, 0, 0], 0.45)),
    edge: css(mix(metal, [255, 255, 255], 0.38), 0.75),
  }
}

/** 铭牌区域内不透明像素的平均色；取不到时退回中性金属灰。 */
function plateColor(ctx: CanvasRenderingContext2D, size: number, dial: MedalDial): Rgb {
  const x = Math.max(0, Math.round((dial.x - dial.width / 2) * size))
  const y = Math.max(0, Math.round((dial.y - dial.height / 2) * size))
  const w = Math.max(1, Math.min(size - x, Math.round(dial.width * size)))
  const h = Math.max(1, Math.min(size - y, Math.round(dial.height * size)))
  try {
    const data = ctx.getImageData(x, y, w, h).data
    const sum = [0, 0, 0]
    let count = 0
    for (let i = 0; i < data.length; i += 16) {
      if (data[i + 3] < 200) continue
      sum[0] += data[i]
      sum[1] += data[i + 1]
      sum[2] += data[i + 2]
      count++
    }
    if (count) return sum.map(value => value / count) as Rgb
  } catch {
    // 画布被跨域污染时读不到像素。
  }
  return [168, 164, 156]
}

/** 制造者印记的开放六边形：右上角断开，里面一枚播放三角，取自 MoviePilot Logo。 */
function drawMark(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  ctx.beginPath()
  for (let i = 0; i <= 5; i++) {
    const angle = (Math.PI / 3) * i - Math.PI / 6
    const px = cx + r * Math.cos(angle)
    const py = cy + r * Math.sin(angle)
    if (i === 0) ctx.moveTo(px, py)
    else ctx.lineTo(px, py)
  }
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(cx - r * 0.3, cy - r * 0.42)
  ctx.lineTo(cx + r * 0.46, cy)
  ctx.lineTo(cx - r * 0.3, cy + r * 0.42)
  ctx.closePath()
  ctx.fill()
}

/** 展台的最小显示宽度（CSS 像素，360px 宽的手机上）；不知道实际显示宽度时按它换算最小字号。 */
export const PLATE_REFERENCE_DISPLAY = 280
/** 显示时任何一行刻字都不小于这个字号（CSS 像素）。 */
export const PLATE_MIN_FONT = 10

/** 铭牌上的一行。role 决定缩放与取舍的先后：名字与印记不省略，时间行最先省略，其次授予对象。 */
interface PlateRow {
  role: 'title' | 'tier' | 'recipient' | 'time' | 'mark'
  text: string
  family: string
  weight: number
  size: number
  spacing: number
}

/**
 * 铭牌排版：所有行同一字体。先按铭牌宽度给出理想字号；放不下时先压缩标题与行距，正文不低于最小字号；
 * 仍放不下时依次省略时间行与授予对象（两者在展台与详情里都有），最后才整体缩小到最小字号以下。
 * 返回实际采用的行与字号，供绘制与测试使用。
 */
export function layoutPlate(
  engraving: MedalEngraving,
  dial: { width: number; height: number },
  minFont: number,
  measure: (row: PlateRow, size: number) => number,
): { rows: (PlateRow & { fontSize: number })[]; lineGap: number; dropped: string[] } {
  const width = dial.width
  const innerHeight = dial.height * 0.86
  const innerWidth = width * 0.88
  const base: PlateRow[] = [
    { role: 'title', text: engraving.title, family: ENGRAVING_FONT, weight: 600, size: width * 0.155, spacing: 0.08 },
    ...engraving.lines.map<PlateRow>(line => ({
      role: line.kind,
      text: line.text,
      family: ENGRAVING_FONT,
      weight: 500,
      size: width * 0.075,
      spacing: 0.02,
    })),
    { role: 'mark', text: 'MoviePilot', family: ENGRAVING_FONT, weight: 600, size: width * 0.062, spacing: 0.12 },
  ]
  const dropped: string[] = []
  const attempt = (rows: PlateRow[]) => {
    const fit = (row: PlateRow, size: number) => {
      // 单行过宽时按宽度缩小，但不低于最小字号；更宽的部分由绘制时横向压缩。
      const natural = measure(row, size) + (row.role === 'mark' ? size * 1.4 : 0)
      return natural > innerWidth ? Math.max(minFont, (size * innerWidth) / natural) : size
    }
    const sizes = rows.map(row => Math.max(row.role === 'title' ? minFont * 1.7 : minFont, fit(row, row.size)))
    const total = (lineGap: number) =>
      sizes.reduce((sum, size, index) => sum + size * (index === 0 ? 1.25 : lineGap), 0)
    // 行高约 1.4；放不下时先收紧到 1.28。
    let lineGap = 1.4
    // 依次收紧：行距、标题、正文（正文不低于最小字号）。
    if (total(lineGap) > innerHeight) lineGap = 1.28
    for (let guard = 0; guard < 40 && total(lineGap) > innerHeight; guard++) {
      if (sizes[0] > minFont * 1.7) sizes[0] = Math.max(minFont * 1.7, sizes[0] * 0.94)
      else {
        let shrunk = false
        for (let i = 1; i < sizes.length; i++) {
          if (sizes[i] > minFont) {
            sizes[i] = Math.max(minFont, sizes[i] * 0.94)
            shrunk = true
          }
        }
        if (!shrunk) break
      }
    }
    return { sizes, lineGap, fits: total(lineGap) <= innerHeight, total: total(lineGap) }
  }
  let rows = base
  let result = attempt(rows)
  for (const role of ['time', 'recipient'] as const) {
    if (result.fits || !rows.some(row => row.role === role)) continue
    dropped.push(...rows.filter(row => row.role === role).map(row => row.text))
    rows = rows.filter(row => row.role !== role)
    result = attempt(rows)
  }
  if (!result.fits) {
    const scale = innerHeight / result.total
    result.sizes = result.sizes.map(size => size * scale)
  }
  return {
    rows: rows.map((row, index) => ({ ...row, fontSize: result.sizes[index] })),
    lineGap: result.lineGap,
    dropped,
  }
}

/**
 * 在画布上刻一整块铭牌文字。坐标是整张图的像素，minFont 是换算到整张图上的最小字号。
 * 刻法：下沿一线亮边，凹槽上沿留一道内阴影，凹槽本身是金属深一档的同色。
 */
export function carvePlate(
  ctx: CanvasRenderingContext2D,
  size: number,
  dial: MedalDial,
  engraving: MedalEngraving,
  ink: EngravingInk,
  minFont: number,
) {
  const width = dial.width * size
  const height = dial.height * size
  const cx = dial.x * size
  const setFont = (row: PlateRow, fontSize: number) => {
    ctx.font = `${row.weight} ${fontSize}px ${row.family}`
    ctx.letterSpacing = `${fontSize * row.spacing}px`
  }
  const layout = layoutPlate(engraving, { width, height }, minFont, (row, fontSize) => {
    setFont(row, fontSize)
    return ctx.measureText(row.text).width
  })
  const heights = layout.rows.map((row, index) => row.fontSize * (index === 0 ? 1.25 : layout.lineGap))
  const total = heights.reduce((sum, value) => sum + value, 0)
  const bevel = Math.max(1, Math.round(size / 300))
  const maxWidth = width * 0.88

  ctx.save()
  ctx.textBaseline = 'middle'
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  let y = dial.y * size - total / 2
  layout.rows.forEach((row, index) => {
    const fontSize = row.fontSize
    const middle = y + heights[index] / 2
    setFont(row, fontSize)
    if (row.role === 'mark') {
      // 制造者印记独占一行：开放六边形加 MoviePilot，整组居中。
      const textWidth = Math.min(ctx.measureText(row.text).width, maxWidth - fontSize * 1.4)
      const glyph = fontSize * 0.5
      const left = cx - (textWidth + fontSize * 1.4) / 2
      for (const [color, offset] of [
        [ink.edge, bevel],
        [ink.shadow, 0],
        [ink.groove, bevel * 0.5],
      ] as const) {
        ctx.fillStyle = ctx.strokeStyle = color
        ctx.lineWidth = Math.max(1.5, fontSize * 0.12)
        drawMark(ctx, left + glyph, middle + offset, glyph)
        ctx.textAlign = 'left'
        ctx.fillText(row.text, left + fontSize * 1.4, middle + offset, maxWidth - fontSize * 1.4)
      }
    } else {
      ctx.textAlign = 'center'
      // letterSpacing 会在末字后多留一份间距，右移半份让整行居中。
      const x = cx + (fontSize * row.spacing) / 2
      // 刻法：下沿一线亮边，凹槽先整体铺内阴影色，再下移半个亮边宽度铺凹槽色，上沿留出一道内阴影。
      ctx.fillStyle = ink.edge
      ctx.fillText(row.text, x, middle + bevel, maxWidth)
      ctx.fillStyle = ink.shadow
      ctx.fillText(row.text, x, middle, maxWidth)
      ctx.fillStyle = ink.groove
      ctx.fillText(row.text, x, middle + bevel * 0.5, maxWidth)
    }
    y += heights[index]
  })
  ctx.restore()
}

/** 一枚勋章背面的刻字方案：刻字区与刻字色，按背面原图算一次，换显示尺寸时复用。 */
export interface EngravingPlan {
  dial: MedalDial
  ink: EngravingInk
}

/** 按背面原图量出刻字区并取铭牌处的金属色。 */
export function planEngraving(image: HTMLImageElement, art: MedalArt, back: MedalShape | null): EngravingPlan {
  const size = image.naturalWidth
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(image, 0, 0)
  const dial = medalDial(art, back)
  return { dial, ink: engravingInk(plateColor(ctx, size, dial), art.ink) }
}

/**
 * 只画刻字的透明图层，作为背面上单独的一层显示。size 是整张背面图在屏幕上占的设备像素边长，
 * 字按这个分辨率直接画，显示时不再缩放，所以不会糊；minFontCss 换算成设备像素作最小字号。
 */
export function engravingLayer(
  size: number,
  plan: EngravingPlan,
  engraving: MedalEngraving,
  pixelRatio: number,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = Math.max(64, Math.round(size))
  const ctx = canvas.getContext('2d')!
  carvePlate(ctx, canvas.width, plan.dial, engraving, plan.ink, PLATE_MIN_FONT * pixelRatio)
  return canvas
}

/**
 * 背面刻字画进背面图：刻字区与刻字色按 medalDial 与铭牌处金属色决定。
 * 最小字号按勋章实际显示宽度换算（取不到时按手机上的最小展台），桌面上展台更大，
 * 扁铭牌也能放下时间行；手机上放不下时按排版规则省略时间行。
 */
export function engraveBack(
  image: HTMLImageElement,
  art: MedalArt,
  engraving: MedalEngraving,
  back: MedalShape | null,
  displayWidth?: number,
): HTMLCanvasElement {
  const size = image.naturalWidth
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(image, 0, 0)
  const dial = medalDial(art, back)
  const display = displayWidth && displayWidth > 0 ? displayWidth : PLATE_REFERENCE_DISPLAY
  const minFont = (PLATE_MIN_FONT * size) / display
  carvePlate(ctx, size, dial, engraving, engravingInk(plateColor(ctx, size, dial), art.ink), minFont)
  return canvas
}
