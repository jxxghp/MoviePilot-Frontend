import type { RecommendSource } from '@/api/types'
import i18n from '@/plugins/i18n'
import {
  createBuiltInRecommendSources,
  mergeExtraRecommendSources,
  type RecommendViewSource,
} from '@/utils/recommendSources'
import { describe, expect, it } from 'vitest'

const translate = (key: string) => `translated:${key}`

describe('recommendSources', () => {
  it('provides localized AniList ranking titles', () => {
    const originalLocale = i18n.global.locale.value
    const titles = {
      'zh-CN': ['AniList 当前趋势', 'AniList 本季热门'],
      'zh-TW': ['AniList 當前趨勢', 'AniList 本季熱門'],
      'en-US': ['AniList TRENDING NOW', 'AniList POPULAR THIS SEASON'],
    } as const
    const locales = ['zh-CN', 'zh-TW', 'en-US'] as const

    try {
      locales.forEach(locale => {
        const expected = titles[locale]
        i18n.global.locale.value = locale
        expect(i18n.global.t('recommend.anilistTrendingNow')).toBe(expected[0])
        expect(i18n.global.t('recommend.anilistPopularThisSeason')).toBe(expected[1])
      })
    } finally {
      i18n.global.locale.value = originalLocale
    }
  })

  it('creates the complete built-in source contract', () => {
    const sources = createBuiltInRecommendSources(translate)

    expect(sources).toHaveLength(15)
    expect(sources[0]).toEqual({
      apipath: 'recommend/tmdb_trending',
      linkurl: '/browse/recommend/tmdb_trending?title=translated:recommend.trendingNow',
      title: 'translated:recommend.trendingNow',
      type: 'translated:recommend.categoryRankings',
    })
    expect(sources).toContainEqual(
      expect.objectContaining({
        apipath: 'recommend/tmdb_tvs?with_original_language=zh|en|ja|ko',
        linkurl:
          '/browse/recommend/tmdb_tvs?with_original_language=zh|en|ja|ko&title=translated:recommend.tmdbHotTVShows',
      }),
    )
    expect(sources).toContainEqual({
      apipath: 'anilist/trending',
      linkurl: '/browse/anilist/trending?title=translated:recommend.anilistTrendingNow',
      title: 'translated:recommend.anilistTrendingNow',
      type: 'translated:recommend.categoryAnime',
    })
    expect(sources).toContainEqual({
      apipath: 'anilist/popular-this-season',
      linkurl: '/browse/anilist/popular-this-season?title=translated:recommend.anilistPopularThisSeason',
      title: 'translated:recommend.anilistPopularThisSeason',
      type: 'translated:recommend.categoryAnime',
    })
    expect(
      sources.filter(source => source.type === 'translated:recommend.categoryAnime').map(source => source.apipath),
    ).toEqual([
      'recommend/bangumi_calendar',
      'anilist/trending',
      'anilist/popular-this-season',
      'recommend/douban_tv_animation',
    ])
  })

  it('appends extra sources in order and skips duplicate API paths', () => {
    const target = createBuiltInRecommendSources(translate).slice(0, 1)
    const extras: RecommendSource[] = [
      { api_path: 'recommend/tmdb_trending', name: '重复来源', type: '榜单' },
      { api_path: 'recommend/custom', name: '自定义来源', type: '扩展' },
      { api_path: 'recommend/custom', name: '重复扩展', type: '扩展' },
    ]

    mergeExtraRecommendSources(target, extras)

    expect(target).toHaveLength(2)
    expect(target[1]).toMatchObject({
      apipath: 'recommend/custom',
      title: '自定义来源',
      type: '扩展',
    })
  })

  it('uses the correct query separator and encodes source names', () => {
    const target: RecommendViewSource[] = []
    const extras: RecommendSource[] = [
      { api_path: 'recommend/custom', name: '中文 & special', type: '扩展' },
      { api_path: 'recommend/filtered?genre=1', name: '筛选/来源', type: '扩展' },
    ]

    mergeExtraRecommendSources(target, extras)

    expect(target[0].linkurl).toBe('/browse/recommend/custom?title=%E4%B8%AD%E6%96%87%20%26%20special')
    expect(target[1].linkurl).toBe('/browse/recommend/filtered?genre=1&title=%E7%AD%9B%E9%80%89%2F%E6%9D%A5%E6%BA%90')
  })
})
