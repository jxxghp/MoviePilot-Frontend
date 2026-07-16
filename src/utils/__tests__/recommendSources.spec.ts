import type { RecommendSource } from '@/api/types'
import {
  createBuiltInRecommendSources,
  mergeExtraRecommendSources,
  type RecommendViewSource,
} from '@/utils/recommendSources'
import { describe, expect, it } from 'vitest'

const translate = (key: string) => `translated:${key}`

describe('recommendSources', () => {
  it('creates the complete built-in source contract', () => {
    const sources = createBuiltInRecommendSources(translate)

    expect(sources).toHaveLength(13)
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
