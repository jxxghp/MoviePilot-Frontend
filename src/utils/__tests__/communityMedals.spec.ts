import { describe, expect, it, vi } from 'vitest'
import i18n from '@/plugins/i18n'
import {
  MEDAL_CATALOG,
  MEDAL_KEYS,
  knownMedals,
  markMedalSeen,
  medalEngraving,
  medalMetaLine,
  medalName,
  tierProgress,
  unseenMedalKeys,
  type CommunityMedalRecord,
} from '@/utils/communityMedals'

const t = (key: string, values?: Record<string, unknown>) => i18n.global.t(key, values ?? {})

/** 按当前语言组装背面刻字，便于逐行断言。 */
function engrave(record: CommunityMedalRecord, locale = 'zh-CN', login: string | null = 'artist') {
  i18n.global.locale.value = locale as typeof i18n.global.locale.value
  return medalEngraving(record, { t, locale, login })
}

describe('community medal catalog', () => {
  it('lists the seven medals with English keys and localized names', () => {
    expect(MEDAL_KEYS).toEqual(['code', 'plugin', 'maintainer', 'helper', 'security', 'tester', 'pioneer'])
    expect(MEDAL_KEYS.map(key => medalName(key, 'zh-CN'))).toEqual([
      '编剧',
      '布景',
      '主创',
      '掌灯',
      '守夜',
      '试映',
      '启幕',
    ])
    expect(MEDAL_KEYS.map(key => medalName(key, 'en-US'))).toEqual([
      'Screenwriter',
      'Set Designer',
      'Core Crew',
      'Lamplighter',
      'Night Watch',
      'Preview Screening',
      'Curtain Raiser',
    ])
    expect(medalName('helper', 'zh-TW')).toBe('掌燈')
    expect(medalName('pioneer', 'fr-FR')).toBe('启幕')
    const ladders = MEDAL_KEYS.filter(key => MEDAL_CATALOG[key].kind === 'ladder')
    expect(ladders).toEqual(['code', 'plugin'])
    expect(ladders.every(key => MEDAL_CATALOG[key].how === 'auto')).toBe(true)
    for (const locale of ['zh-CN', 'zh-TW', 'en-US'] as const) {
      for (const key of MEDAL_KEYS) {
        expect(i18n.global.te('community.medals.' + key + '.summary', locale)).toBe(true)
        expect(i18n.global.te('community.medals.' + key + '.rule', locale)).toBe(true)
      }
    }
  })

  it('uses the owner-approved Chinese copy', () => {
    i18n.global.locale.value = 'zh-CN'
    expect(t('community.medals.code.summary')).toBe('致敬为 MoviePilot 写下代码与文档的贡献者。')
    expect(t('community.medals.plugin.rule')).toBe(
      '发布首个插件即获得初光；插件累计安装满 1 万、10 万、100 万次，依次获得共建、卓越、核心。',
    )
    expect(t('community.medals.pioneer.rule')).toBe('由维护团队颁发给项目早期的赞助者与贡献者。')
    expect(t('community.how.manual')).toBe('维护团队颁发')
    expect(t('community.specialties.plugins')).toBe('官方插件共建者')
    expect(t('community.specialties.performance')).toBe('扩展共建者')
    expect(i18n.global.te('community.retired', 'zh-CN')).toBe(false)
  })

  it('ignores unknown and former medal keys and unknown field values, keeping catalog order', () => {
    const result = knownMedals([
      { key: 'future-medal', at: '2027' },
      { key: 'huiguang', at: '2024' },
      { key: 'security', at: '2026-01-02' },
      { key: 'code', tier: 9, specialty: 'galaxy', at: '2025-04-02', basis: 'reached', extra: true },
      { key: 'code', tier: 2 },
      null,
      'helper',
    ])
    expect(result.map(item => item.key)).toEqual(['code', 'security'])
    expect(result[0].tier).toBeUndefined()
    expect(result[0].specialty).toBeUndefined()
    expect(result[0].at).toBe('2025-04-02')
  })
})

describe('community medal engraving and time line', () => {
  it('engraves tier, specialty, recipient and reached date for code', () => {
    const result = engrave({ key: 'code', tier: 3, specialty: 'ecosystem', at: '2025-04-02', basis: 'reached' })
    expect(result.title).toBe('编剧')
    expect(result.lines.map(line => line.text)).toEqual(['卓越 · 生态共建者', '授予 @artist', '达成 2025.04.02'])
    expect(result.lines.map(line => line.kind)).toEqual(['tier', 'recipient', 'time'])
  })

  it('uses recognized wording for plugin without a specialty title', () => {
    const result = engrave({ key: 'plugin', tier: 2, specialty: 'plugins', at: '2026-10-16', basis: 'recognized' })
    expect(result.lines.map(line => line.text)).toEqual(['共建', '授予 @artist', '认定 2026.10.16'])
  })

  it('engraves one awarded time line for manual medals and ignores the reserved years field', () => {
    expect(engrave({ key: 'helper', at: '2025-06-18', years: [2025, 2026] }).lines.map(line => line.text)).toEqual([
      '授予 @artist',
      '2025.06.18',
    ])
    expect(engrave({ key: 'tester', years: [2025, 2026] }).lines.map(line => line.text)).toEqual(['授予 @artist'])
    expect(engrave({ key: 'pioneer', at: '2023' }).lines[1].text).toBe('2023')
    expect(engrave({ key: 'security' }, 'zh-CN', null).lines).toEqual([])
  })

  it('shows tier and specialty or the time as the showcase meta line', () => {
    i18n.global.locale.value = 'zh-CN'
    expect(medalMetaLine({ key: 'code', tier: 4, specialty: 'frontend' }, t)).toBe('核心 · 界面共建者')
    expect(medalMetaLine({ key: 'security', at: '2026-03-18' }, t)).toBe('2026.03.18')
  })

  it('translates engraving lines for English', () => {
    const result = engrave({ key: 'code', tier: 1, specialty: 'plugins', at: '2024-01-05', basis: 'reached' }, 'en-US')
    expect(result.title).toBe('Screenwriter')
    expect(result.lines.map(line => line.text)).toEqual([
      'First Light · Official plugin builder',
      'Awarded to @artist',
      'Reached 2024.01.05',
    ])
    i18n.global.locale.value = 'zh-CN'
  })
})

describe('community medal tier progress', () => {
  it('measures the way to the next tier from the listed facts', () => {
    expect(tierProgress({ key: 'code', tier: 2, facts: { total: 38, repositories: [] } })).toEqual({
      tier: 2,
      value: 38,
      next: 3,
      remaining: 12,
      fraction: 0.7,
    })
    const plugin = tierProgress({ key: 'plugin', tier: 2, facts: { installs: 79000, plugins: [] } })
    expect(plugin?.remaining).toBe(21000)
    expect(plugin?.next).toBe(3)
  })

  it('reports the top tier and tolerates missing facts', () => {
    expect(tierProgress({ key: 'code', tier: 4, facts: { total: 260, repositories: [] } })).toMatchObject({
      next: null,
      remaining: null,
      fraction: 1,
    })
    expect(tierProgress({ key: 'plugin', tier: 1 })).toMatchObject({ value: null, next: 2, remaining: null })
    expect(tierProgress({ key: 'helper' })).toBeNull()
  })
})

describe('community medal seen state', () => {
  it('tracks unseen medals per GitHub account and resurfaces upgrades', () => {
    const medals: CommunityMedalRecord[] = [
      { key: 'code', tier: 1 },
      { key: 'helper', at: '2025' },
    ]
    expect(unseenMedalKeys(42, medals)).toEqual(['code', 'helper'])
    markMedalSeen(42, medals[0])
    expect(unseenMedalKeys(42, medals)).toEqual(['helper'])
    expect(unseenMedalKeys(7, medals)).toEqual(['code', 'helper'])
    expect(unseenMedalKeys(42, [{ key: 'code', tier: 2 }])).toEqual(['code'])
    expect(unseenMedalKeys(null, medals)).toEqual([])
  })

  it('treats medals as seen when storage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied')
    })
    expect(unseenMedalKeys(42, [{ key: 'security' }])).toEqual([])
  })
})
