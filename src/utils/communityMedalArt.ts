import { MEDAL_CATALOG, type MedalKey, type MedalTier } from '@/utils/communityMedals'

/**
 * 勋章渲染图登记。
 *
 * 每枚勋章的资产放在 src/assets/images/community/medals/，按文件名自动收录。
 * - 正面。独枚勋章是 <key>-front.webp；阶梯勋章每档一张 <key>-front-t1.webp 至 -t4.webp，
 *   同一外形、做工逐档更丰富，档位由正面图本身表达，页面不另加档位标记。
 * - 背面。所有勋章共用一张 <key>-back.webp，表盘留空，等级等文字由页面刻上。
 * - 顶栏佩戴标识。每张正面配一张 96 × 96 的小图，独枚勋章 <key>-badge.webp，阶梯勋章 <key>-badge-t1.webp 至 -t4.webp，
 *   按不透明区域裁切居中后预先缩小，页面以 32 CSS 像素显示，不靠浏览器从大图缩小。
 * - 每张面图配一张同名加 -height 的灰度高度图（如 <key>-front-t2-height.webp）与一份同名 .outline.json
 *   外轮廓（如 <key>-front-t2.outline.json），供精绘视差、补光与挤出侧壁。
 * 渲染图为 1600 × 1600 出图后缩到 1200，透明底、正对机位；高度图与轮廓由 design/community-medals/ 下的
 * build_maps.py 从原图算出。
 *
 * 阶梯勋章缺本档正面时取最近的较低档，都没有时与缺背面的勋章一样退回页面绘制的六边形后备；
 * 缺高度图或轮廓时精绘退回只会倾斜的双图卡片。没有美术资产时构建与测试照常通过，放入文件即生效。
 */

/** 一面的外形：本体外轮廓与宝石的圆，坐标为相对整张图的比例，y 向下。 */
export interface MedalShape {
  outline: number[][]
  /** 浮在本体外的宝石；镶嵌在本体内的宝石不单列，为 null */
  gem: { x: number; y: number; r: number } | null
  /** 背面轮廓才有：背板上下沉的刻字铭牌，由 build_maps.py 量出 */
  dial?: MedalDial | null
  /** 正面轮廓可选：外圈可转动的部分（如主创的星盘外环），见 MedalSpin */
  spin?: MedalSpin | null
}

/**
 * 正面外圈的转动：以 (x, y) 为圆心、半径 r 以外的外圈（如主创的星盘刻度环）整体顺时针转动。
 * 坐标与半径按整张图的比例；出图时在 r 处留一道深色缝，转动的接缝看不出来。
 * 默认是擒纵式的“走格”：每隔 interval 秒前进一格 step 度，每一步约 350 毫秒缓入缓出并带一点回弹，
 * 其余时间静止，读起来像机械表而不是加载动画。mode 为 continuous 时按 period 秒一圈匀速转动。
 */
export interface MedalSpin {
  x: number
  y: number
  r: number
  /** 匀速模式下转一圈的秒数 */
  period: number
  /** continuous 匀速；tick 走格（缺省） */
  mode?: 'continuous' | 'tick'
  /** 走格模式每一格的角度（度），缺省 6 */
  step?: number
  /** 走格模式两格之间的秒数，缺省 2 */
  interval?: number
}

/** 轮廓里的 spin 合法时返回它，否则为 null；数据驱动，任何正面带 spin 的勋章都会转。 */
export function medalSpin(shape: MedalShape | null | undefined): MedalSpin | null {
  const spin = shape?.spin
  if (!spin) return null
  const values = [spin.x, spin.y, spin.r, spin.period]
  return values.every(value => Number.isFinite(value)) && spin.r > 0 && spin.period > 0 ? spin : null
}

/**
 * 调试用的模式覆盖：本地存储 `community-medal-spin-mode` 或网址参数 `medal-spin` 设为 continuous 或 tick 时
 * 以它为准，便于在实验室里对比两种转法；没有设置时用轮廓数据里的 mode。
 */
export function medalSpinMode(spin: MedalSpin): 'continuous' | 'tick' {
  const valid = (value: unknown) => (value === 'continuous' || value === 'tick' ? value : null)
  try {
    const fromUrl = valid(new URLSearchParams(window.location.search).get('medal-spin'))
    const fromStorage = valid(window.localStorage.getItem('community-medal-spin-mode'))
    const override = fromUrl ?? fromStorage
    if (override) return override
  } catch {
    // 读不到存储时用数据里的设置。
  }
  return spin.mode === 'continuous' ? 'continuous' : 'tick'
}

/** 走格每一步的时长（秒） */
export const SPIN_TICK_DURATION = 0.35
/** 走格每一步越过目标再回落的角度（度） */
export const SPIN_TICK_OVERSHOOT = 0.4

/**
 * 一步之内的进度（0 到 1，中途略超过 1 再回落）：前 70% 缓入缓出走到 1 + 回弹量，后 30% 缓出回到 1。
 * overshoot 是相对一格的比例。
 */
export function tickEase(progress: number, overshoot: number): number {
  const p = Math.min(1, Math.max(0, progress))
  const easeInOut = (x: number) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2)
  if (p <= 0.7) return easeInOut(p / 0.7) * (1 + overshoot)
  const q = (p - 0.7) / 0.3
  return 1 + overshoot * (1 - (1 - Math.pow(1 - q, 2)))
}

/**
 * 外圈在累计转动时间 seconds 时的角度（弧度，正值在画面上为顺时针）。
 * 走格模式：第 n 个间隔开始时前进第 n + 1 格，步内按 tickEase 过渡；匀速模式：按 period 匀速。
 */
export function spinAngleAt(spin: MedalSpin, seconds: number, mode: 'continuous' | 'tick' = 'tick'): number {
  const full = Math.PI * 2
  if (mode === 'continuous') return ((seconds / spin.period) * full) % full
  const step = ((spin.step && spin.step > 0 ? spin.step : 6) * Math.PI) / 180
  const interval = spin.interval && spin.interval > 0 ? spin.interval : 2
  const duration = Math.min(SPIN_TICK_DURATION, interval)
  const overshoot = SPIN_TICK_OVERSHOOT / (spin.step && spin.step > 0 ? spin.step : 6)
  const index = Math.floor(seconds / interval)
  const phase = seconds - index * interval
  const done = index * step
  const moving = phase < duration ? tickEase(phase / duration, overshoot) : 1
  return (done + moving * step) % full
}

/** 背面刻字区：中心与宽高，按整张背面图的比例。刻字整体缩放到放得进这块区域。 */
export interface MedalDial {
  x: number
  y: number
  width: number
  height: number
}

/** 一枚勋章（阶梯勋章为某一档）已登记的渲染图。 */
export interface MedalArt {
  key: MedalKey
  /** 实际采用的正面档位；独枚勋章为 null。缺本档图时可能低于持有的档位 */
  tier: MedalTier | null
  front: string
  back: string
  /** 顶栏佩戴标识用的小图，与 front 同档；缺图时为 null */
  badge: string | null
  /** 两面的高度图，缺任一张时为 null，精绘退回倾斜卡片 */
  heights: { front: string; back: string } | null
  /** 两面的轮廓加载器，缺任一份时为 null */
  shapes: (() => Promise<{ front: MedalShape; back: MedalShape }>) | null
  /** 背面刻字颜色覆盖；为 null 时按铭牌处金属的实际颜色推算 */
  ink: string | null
  /** 金属主色，精绘补光与保存图片的背景微光 */
  tone: string
  /** 刻字区覆盖；为 null 时取背面轮廓里的 dial，再缺取默认值，见 medalDial */
  dial: MedalDial | null
}

// 背面轮廓没有铭牌、也没有覆盖时的刻字区：画面中央偏下，留出顶部唇边。
const DEFAULT_DIAL: MedalDial = { x: 0.5, y: 0.53, width: 0.44, height: 0.26 }

/** 刻字区按“覆盖 → 背面轮廓的铭牌 → 默认值”取。 */
export function medalDial(art: Pick<MedalArt, 'dial'> | null, back: MedalShape | null | undefined): MedalDial {
  const plate = back?.dial
  const valid =
    plate && [plate.x, plate.y, plate.width, plate.height].every(value => Number.isFinite(value) && value > 0)
  return art?.dial ?? (valid ? plate : DEFAULT_DIAL)
}

/** 逐枚的刻字区与刻字色覆盖，只在自动量取的结果不合适时登记。 */
export const MEDAL_ART_META: Partial<Record<MedalKey, { dial?: MedalDial; ink?: string }>> = {}

const images = import.meta.glob<string>('../assets/images/community/medals/*.webp', {
  eager: true,
  import: 'default',
})
const outlines = import.meta.glob<MedalShape>('../assets/images/community/medals/*.outline.json', {
  import: 'default',
})

function byName<T>(files: Record<string, T>): Map<string, T> {
  return new Map(Object.entries(files).map(([path, value]) => [path.slice(path.lastIndexOf('/') + 1), value]))
}

const imageFiles = byName(images)
const outlineFiles = byName(outlines)

type ArtFiles = { images: Map<string, string>; outlines: Map<string, () => Promise<MedalShape>> }

/** 正面图的文件名主干：阶梯勋章取本档，缺图时逐档往下找；独枚勋章固定为 <key>-front。 */
function frontStem(
  key: MedalKey,
  tier: number | undefined,
  files: ArtFiles,
): { stem: string; tier: MedalTier | null } | null {
  if (MEDAL_CATALOG[key].kind !== 'ladder') {
    return files.images.has(key + '-front.webp') ? { stem: key + '-front', tier: null } : null
  }
  for (let level = Math.min(Math.max(tier ?? 1, 1), 4); level >= 1; level--) {
    const stem = `${key}-front-t${level}`
    if (files.images.has(stem + '.webp')) return { stem, tier: level as MedalTier }
  }
  return null
}

/** 按资产集合解析一枚勋章某一档的渲染图，供测试注入；正面（含回退）或背面缺失时返回 null。 */
export function resolveMedalArt(key: MedalKey, tier: number | undefined, files: ArtFiles): MedalArt | null {
  const front = frontStem(key, tier, files)
  const back = files.images.get(key + '-back.webp')
  if (!front || !back) return null
  const frontHeight = files.images.get(front.stem + '-height.webp')
  const backHeight = files.images.get(key + '-back-height.webp')
  const frontShape = files.outlines.get(front.stem + '.outline.json')
  const backShape = files.outlines.get(key + '-back.outline.json')
  const meta = MEDAL_ART_META[key]
  const palette = MEDAL_CATALOG[key].palette
  return {
    key,
    tier: front.tier,
    front: files.images.get(front.stem + '.webp')!,
    back,
    badge: files.images.get(front.stem.replace('-front', '-badge') + '.webp') ?? null,
    heights: frontHeight && backHeight ? { front: frontHeight, back: backHeight } : null,
    shapes:
      frontShape && backShape
        ? () => Promise.all([frontShape(), backShape()]).then(([f, b]) => ({ front: f, back: b }))
        : null,
    ink: meta?.ink ?? null,
    tone: palette.tone,
    dial: meta?.dial ?? null,
  }
}

/** 当前构建收录的渲染图，阶梯勋章按持有档位取正面；没有美术时返回 null，调用方使用页面绘制的后备。 */
export function medalArt(key: MedalKey, tier?: number): MedalArt | null {
  return resolveMedalArt(key, tier, { images: imageFiles, outlines: outlineFiles })
}

/** 精绘需要高度图与轮廓都齐全。 */
export function supportsRelief(art: MedalArt | null): art is MedalArt & {
  heights: NonNullable<MedalArt['heights']>
  shapes: NonNullable<MedalArt['shapes']>
} {
  return !!art?.heights && !!art.shapes
}
