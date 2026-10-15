import { ref } from 'vue'

/**
 * 社区勋章目录与展示规则。
 *
 * 勋章名单由 MoviePilot-Wiki 的定时任务生成（community/medals.json），实例只核验 GitHub 身份后转发该账号的记录。
 * 四个概念各自独立：勋章（哪一类贡献，正面造型）、等级（阶梯勋章才有，正面每档一张做工逐档更丰富的图，背面刻等级名）、
 * 称号（只有编剧有，沿用上游领域称号）、时间（每枚勋章刻一行）。前端忽略不认识的勋章键与字段，
 * 名单新增勋章不会让旧版本出错。
 */

/**
 * 勋章键，与 Wiki 名单 `key` 一致，按贡献类型命名、与显示名解耦：code 编剧、plugin 布景、maintainer 主创、
 * helper 掌灯、security 守夜、tester 试映、pioneer 启幕。也是展示顺序：两枚自动认定的阶梯勋章在前。
 */
export const MEDAL_KEYS = ['code', 'plugin', 'maintainer', 'helper', 'security', 'tester', 'pioneer'] as const
export type MedalKey = (typeof MEDAL_KEYS)[number]

/** 阶梯勋章的四档，1 初光、2 共建、3 卓越、4 核心。 */
export type MedalTier = 1 | 2 | 3 | 4
export const MEDAL_TIERS: readonly MedalTier[] = [1, 2, 3, 4]

/** 编剧的领域称号，取值同上游贡献领域；跨领域为 ecosystem。 */
export const MEDAL_SPECIALTIES = [
  'backend',
  'frontend',
  'plugins',
  'performance',
  'resources',
  'services',
  'website',
  'docs',
  'ecosystem',
] as const
export type MedalSpecialty = (typeof MEDAL_SPECIALTIES)[number]
/** 编剧逐仓事实里的仓库领域，不含跨领域的 ecosystem。 */
export type MedalArea = Exclude<MedalSpecialty, 'ecosystem'>

/** 编剧单个官方仓库的两类证据；展示时取两者较大值，不相加。 */
export interface RepositoryFact {
  /** jxxghp 名下的仓库名，例如 MoviePilot-Frontend */
  repository: string
  area: MedalArea
  /** 统计分支上的作者提交数 */
  commits: number
  /** 已合并 PR 数 */
  merged_prs: number
}

/** 编剧的认定依据。 */
export interface CodeFacts {
  /** 各仓取较大值后的累计贡献 */
  total: number
  repositories: RepositoryFact[]
}

/** 布景计入的单个插件。 */
export interface PluginFact {
  /** 插件 ID */
  id: string
  /** 插件显示名 */
  name: string
  /** 插件所在的市场仓库，如 jxxghp/MoviePilot-Plugins */
  market: string
  /** movie-pilot.org 统计的累计安装次数 */
  installs: number
}

/** 布景的认定依据。 */
export interface PluginFacts {
  /** 署名插件累计安装次数之和 */
  installs: number
  plugins: PluginFact[]
}

/**
 * 一条勋章记录，字段与 Wiki 名单一致；未用字段省略。
 * 只有阶梯勋章有 tier / basis / facts，只有编剧有 specialty。名单里出现的其他字段一律忽略。
 */
export interface CommunityMedalRecord {
  key: MedalKey
  tier?: MedalTier
  specialty?: MedalSpecialty
  /** 日期 YYYY-MM-DD 或年份 YYYY */
  at?: string
  /** reached 为真实达成日期，recognized 为首次认定日期 */
  basis?: 'reached' | 'recognized'
  /** 预留字段：每年再颁的年份列表。当前不刻、不展示，时间只取 at */
  years?: number[]
  /** 人工勋章的贡献说明，如“Logo 设计” */
  note?: string
  /** 编号，本期恒为 null */
  serial?: number | null
  facts?: CodeFacts | PluginFacts
}

/** 一枚勋章的配色：页面绘制的后备图、精绘补光与保存图片共用。 */
export interface MedalPalette {
  /** 金属主色（灯带反射色），也是保存图片背景微光与精绘补光的颜色 */
  tone: string
  /** 珐琅表盘中心与边缘色 */
  enamel: [string, string]
  /** 背面刻字颜色 */
  ink: string
}

/** 目录中的一枚勋章。 */
export interface MedalCatalogEntry {
  key: MedalKey
  /** ladder 为分四档的阶梯勋章，single 为独枚勋章 */
  kind: 'ladder' | 'single'
  /** auto 由定时任务按公开数据计算，manual 由维护者在 Wiki 登记颁发 */
  how: 'auto' | 'manual'
  /** 勋章名是专名，三种语言各自定名 */
  names: { 'zh-CN': string; 'zh-TW': string; 'en-US': string }
  palette: MedalPalette
  /** 线描徽记路径，画在 16 格画布上，单线圆头；用于切换标签、空状态介绍与缺图后备 */
  emblem: string
}

export const MEDAL_CATALOG: Record<MedalKey, MedalCatalogEntry> = {
  code: {
    key: 'code',
    kind: 'ladder',
    how: 'auto',
    names: { 'zh-CN': '编剧', 'zh-TW': '編劇', 'en-US': 'Screenwriter' },
    palette: { tone: '#3fc4c9', enamel: ['#0f5560', '#041b20'], ink: '#d2f1ef' },
    // 一支笔尖压着两行字
    emblem: 'M10.6 2.6l2.8 2.8-6.6 6.6-3.6.8.8-3.6ZM9.2 4l2.8 2.8M2.5 14h11',
  },
  plugin: {
    key: 'plugin',
    kind: 'ladder',
    how: 'auto',
    names: { 'zh-CN': '布景', 'zh-TW': '布景', 'en-US': 'Set Designer' },
    palette: { tone: '#e08a4c', enamel: ['#7d4321', '#211009'], ink: '#f3cb9c' },
    // 舞台上前后两片布景板
    emblem: 'M2 13.5h12M3.5 13.5V6.5l3.5-2v9M9 13.5V3.5l3.5 1.8v8.2',
  },
  maintainer: {
    key: 'maintainer',
    kind: 'single',
    how: 'manual',
    names: { 'zh-CN': '主创', 'zh-TW': '主創', 'en-US': 'Core Crew' },
    palette: { tone: '#9b7bff', enamel: ['#3d2380', '#120828'], ink: '#e0d6ff' },
    // 取景框里的播放三角
    emblem: 'M2.5 5.5v-3h3M10.5 2.5h3v3M13.5 10.5v3h-3M5.5 13.5h-3v-3M6.6 5.4 10.8 8l-4.2 2.6Z',
  },
  helper: {
    key: 'helper',
    kind: 'single',
    how: 'manual',
    names: { 'zh-CN': '掌灯', 'zh-TW': '掌燈', 'en-US': 'Lamplighter' },
    palette: { tone: '#e6b04a', enamel: ['#6e4a12', '#1f1304'], ink: '#f7dca0' },
    // 提灯与灯芯
    emblem: 'M8 1.8v1.6M6 3.4h4M5.2 5.4h5.6l-.7 6.4H5.9ZM6 13.8h4M8 7.2c1 .9 1 2.1 0 3-1-.9-1-2.1 0-3Z',
  },
  security: {
    key: 'security',
    kind: 'single',
    how: 'manual',
    names: { 'zh-CN': '守夜', 'zh-TW': '守夜', 'en-US': 'Night Watch' },
    palette: { tone: '#6f8dff', enamel: ['#1d2f7a', '#070c2e'], ink: '#d8e0fb' },
    // 一弯新月与一颗星
    emblem:
      'M10.4 2.4a5.8 5.8 0 1 0 3.2 9.4 4.8 4.8 0 0 1-3.2-9.4ZM6.6 6l.6 1.4 1.4.6-1.4.6-.6 1.4-.6-1.4L4.6 8 6 7.4Z',
  },
  tester: {
    key: 'tester',
    kind: 'single',
    how: 'manual',
    names: { 'zh-CN': '试映', 'zh-TW': '試映', 'en-US': 'Preview Screening' },
    palette: { tone: '#ff86b0', enamel: ['#6e1735', '#22050f'], ink: '#ffd3e2' },
    // 一格胶片里的播放三角
    emblem: 'M3 2.5h10v11H3ZM3 5h10M3 11h10M7 6.7 9.6 8 7 9.3Z',
  },
  pioneer: {
    key: 'pioneer',
    kind: 'single',
    how: 'manual',
    names: { 'zh-CN': '启幕', 'zh-TW': '啟幕', 'en-US': 'Curtain Raiser' },
    palette: { tone: '#e0524a', enamel: ['#6e1414', '#200404'], ink: '#ffd2c4' },
    // 拉开的幕布与一束光
    emblem: 'M2.5 2.5h11M3.6 2.5c0 3 .8 5 2.6 6.2M12.4 2.5c0 3-.8 5-2.6 6.2M8 6.4v7.1M6.4 13.5h3.2',
  },
}

/** 阶梯勋章四档的认定门槛（含当档），编剧按累计被采纳次数，布景按署名插件累计安装次数（首个上架记 1）。 */
export const MEDAL_THRESHOLDS: Record<'code' | 'plugin', [number, number, number, number]> = {
  code: [1, 10, 50, 200],
  plugin: [1, 10000, 100000, 1000000],
}

/** 阶梯勋章的进度：当前数值来自名单里的事实，取不到时为 null。 */
export interface TierProgress {
  /** 当前档位，0 表示还没到初光 */
  tier: number
  /** 当前数值（累计贡献或累计安装），名单没给时为 null */
  value: number | null
  /** 下一档，已是核心时为 null */
  next: MedalTier | null
  /** 距下一档还差多少，取不到数值或已到顶时为 null */
  remaining: number | null
  /** 当前档到下一档之间走了多少（0–1），用于进度线 */
  fraction: number
}

/** 计算阶梯勋章的档位进度；数值优先取名单事实，名单给的档位与数值不一致时以档位为准。 */
export function tierProgress(record: CommunityMedalRecord): TierProgress | null {
  if (record.key !== 'code' && record.key !== 'plugin') return null
  const thresholds = MEDAL_THRESHOLDS[record.key]
  const facts = record.facts as (Partial<CodeFacts> & Partial<PluginFacts>) | undefined
  const raw = record.key === 'code' ? facts?.total : facts?.installs
  const value = typeof raw === 'number' && Number.isFinite(raw) ? raw : null
  const tier = record.tier ?? (value === null ? 0 : thresholds.filter(threshold => value >= threshold).length)
  const next = tier >= 4 ? null : ((tier + 1) as MedalTier)
  if (next === null) return { tier, value, next, remaining: null, fraction: 1 }
  const from = tier > 0 ? thresholds[tier - 1] : 0
  const to = thresholds[next - 1]
  const remaining = value === null ? null : Math.max(0, to - value)
  const fraction = value === null ? 0 : Math.min(1, Math.max(0, (value - from) / (to - from)))
  return { tier, value, next, remaining, fraction }
}

/** 九个官方仓库，编剧的 GitHub 证据链接只为这些仓库生成。 */
export const OFFICIAL_REPOSITORIES = [
  'MoviePilot',
  'MoviePilot-Frontend',
  'MoviePilot-Plugins',
  'MoviePilot-Rust',
  'MoviePilot-Resources',
  'MoviePilot-Server',
  'MoviePilot-OCR',
  'MoviePilot-Web',
  'MoviePilot-Wiki',
] as const

export function isMedalKey(value: unknown): value is MedalKey {
  return typeof value === 'string' && (MEDAL_KEYS as readonly string[]).includes(value)
}

/**
 * 只保留认识的勋章并按目录顺序排列，同一键只取第一条；
 * 档位、称号、领域等取值不认识时丢弃该字段而不是整条记录，旧版本仍能展示新名单。
 */
export function knownMedals(records: readonly unknown[] | null | undefined): CommunityMedalRecord[] {
  const byKey = new Map<MedalKey, CommunityMedalRecord>()
  for (const item of records ?? []) {
    if (!item || typeof item !== 'object') continue
    const record = item as CommunityMedalRecord
    if (!isMedalKey(record.key) || byKey.has(record.key)) continue
    const entry = MEDAL_CATALOG[record.key]
    const tier = entry.kind === 'ladder' && MEDAL_TIERS.includes(record.tier as MedalTier) ? record.tier : undefined
    const specialty =
      record.key === 'code' && (MEDAL_SPECIALTIES as readonly string[]).includes(record.specialty ?? '')
        ? record.specialty
        : undefined
    byKey.set(record.key, { ...record, tier, specialty })
  }
  return MEDAL_KEYS.filter(key => byKey.has(key)).map(key => byKey.get(key)!)
}

/** 按界面语言取勋章名，未知语言回退简体中文。 */
export function medalName(key: MedalKey, locale: string): string {
  const names = MEDAL_CATALOG[key].names
  return names[locale as keyof typeof names] ?? names['zh-CN']
}

/**
 * 背面刻字的字体：系统自带、同时含中文与西文数字字形的无衬线字体，所有行与制造者印记统一一种字体，
 * 不再混用衬线与等宽。精绘贴图、倾斜卡片与刻字层共用。
 */
export const ENGRAVING_FONT =
  '"PingFang SC", "PingFang TC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", "Source Han Sans SC", sans-serif'

/** 背面刻字的一行；kind 决定铭牌放不下时的取舍顺序（先省略时间，再省略授予对象）。 */
export interface EngravingLine {
  text: string
  kind: 'tier' | 'recipient' | 'time'
}

/** 背面刻字：勋章名为标题，其余逐行。 */
export interface MedalEngraving {
  title: string
  lines: EngravingLine[]
}

type Translate = (key: string, values?: Record<string, unknown>) => string

/** 把 YYYY-MM-DD 刻成 YYYY.MM.DD，年份原样保留。 */
export function engraveDate(value: string): string {
  return value.trim().replaceAll('-', '.')
}

/**
 * 每枚勋章唯一的时间行：阶梯勋章刻“达成 日期”或“认定 日期”，授予的勋章只刻日期或年份
 * （上一行已是“授予 @账号”，不再重复“授予”）。
 * years 是预留字段，不参与。没有时间时返回空串。
 */
export function medalTimeLine(record: CommunityMedalRecord, t: Translate): string {
  if (!record.at) return ''
  const date = engraveDate(record.at)
  if (record.basis === 'reached') return t('community.time.reached', { date })
  if (record.basis === 'recognized') return t('community.time.recognized', { date })
  return t('community.time.awarded', { date })
}

/** 阶梯勋章的等级行；编剧追加领域称号。 */
export function medalTierLine(record: CommunityMedalRecord, t: Translate): string {
  if (MEDAL_CATALOG[record.key].kind !== 'ladder' || !record.tier) return ''
  const tier = t('community.tiers.' + record.tier)
  return record.key === 'code' && record.specialty
    ? tier + ' · ' + t('community.specialties.' + record.specialty)
    : tier
}

/** 展台标题下的一行：阶梯勋章是等级与称号，授予的勋章是时间。 */
export function medalMetaLine(record: CommunityMedalRecord, t: Translate): string {
  return medalTierLine(record, t) || medalTimeLine(record, t)
}

/**
 * 组装背面刻字：名称、等级与称号（阶梯勋章）、授予对象、时间，空行省略。
 * 铭牌底部的制造者印记由刻字绘制统一加上。
 */
export function medalEngraving(
  record: CommunityMedalRecord,
  context: { t: Translate; locale: string; login: string | null },
): MedalEngraving {
  const { t, locale, login } = context
  const lines: EngravingLine[] = []
  const tier = medalTierLine(record, t)
  if (tier) lines.push({ text: tier, kind: 'tier' })
  if (login) lines.push({ text: t('community.awardedTo', { login: '@' + login }), kind: 'recipient' })
  const time = medalTimeLine(record, t)
  if (time) lines.push({ text: time, kind: 'time' })
  return { title: medalName(record.key, locale), lines }
}

/** 看过的标记：阶梯勋章升档会生成新的标记，重新算作没看过。 */
export function medalSeenToken(record: CommunityMedalRecord): string {
  return record.tier ? record.key + ':t' + record.tier : record.key
}

// 看过的勋章记在当前浏览器，按 GitHub 数字 ID 分开。存储不可用时视为全部看过，
// 避免存不下时一直提醒；version 让读取方在标记变化后重新计算。
const SEEN_PREFIX = 'moviepilot.community-medals-seen:'
const seenVersion = ref(0)
const seenFallback = new Map<string, Set<string>>()

function readSeen(owner: string): Set<string> | null {
  try {
    const raw = localStorage.getItem(SEEN_PREFIX + owner)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    const stored = Array.isArray(parsed) ? parsed.filter(item => typeof item === 'string') : []
    return new Set([...stored, ...(seenFallback.get(owner) ?? [])])
  } catch {
    return null
  }
}

/** 还没看过的勋章键，按目录顺序。owner 为 GitHub 数字 ID。 */
export function unseenMedalKeys(
  owner: string | number | null | undefined,
  records: CommunityMedalRecord[],
): MedalKey[] {
  void seenVersion.value
  if (owner === null || owner === undefined) return []
  const seen = readSeen(String(owner))
  if (!seen) return []
  return records.filter(record => !seen.has(medalSeenToken(record))).map(record => record.key)
}

/** 记下看过这枚勋章；写入失败时只在本次页面会话内记住。 */
export function markMedalSeen(owner: string | number | null | undefined, record: CommunityMedalRecord) {
  if (owner === null || owner === undefined) return
  const id = String(owner)
  const seen = readSeen(id)
  const token = medalSeenToken(record)
  if (!seen || seen.has(token)) return
  seen.add(token)
  try {
    localStorage.setItem(SEEN_PREFIX + id, JSON.stringify([...seen]))
  } catch {
    seenFallback.set(id, new Set([...(seenFallback.get(id) ?? []), token]))
  }
  seenVersion.value++
}
