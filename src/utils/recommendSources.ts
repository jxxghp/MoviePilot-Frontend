import type { RecommendSource } from '@/api/types'

export interface RecommendViewSource {
  apipath: string
  linkurl: string
  title: string
  type: string
}

type Translate = (key: string) => string

/** 创建与推荐页面一致的内置媒体来源列表。 */
export function createBuiltInRecommendSources(t: Translate): RecommendViewSource[] {
  return [
    {
      apipath: 'recommend/tmdb_trending',
      linkurl: '/browse/recommend/tmdb_trending?title=' + t('recommend.trendingNow'),
      title: t('recommend.trendingNow'),
      type: t('recommend.categoryRankings'),
    },
    {
      apipath: 'recommend/douban_showing',
      linkurl: '/browse/recommend/douban_showing?title=' + t('recommend.nowShowing'),
      title: t('recommend.nowShowing'),
      type: t('recommend.categoryMovie'),
    },
    {
      apipath: 'recommend/bangumi_calendar',
      linkurl: '/browse/recommend/bangumi_calendar?title=' + t('recommend.bangumiDaily'),
      title: t('recommend.bangumiDaily'),
      type: t('recommend.categoryAnime'),
    },
    {
      apipath: 'recommend/tmdb_movies',
      linkurl: '/browse/recommend/tmdb_movies?title=' + t('recommend.tmdbHotMovies'),
      title: t('recommend.tmdbHotMovies'),
      type: t('recommend.categoryMovie'),
    },
    {
      apipath: 'recommend/tmdb_tvs?with_original_language=zh|en|ja|ko',
      linkurl:
        '/browse/recommend/tmdb_tvs?with_original_language=zh|en|ja|ko&title=' + t('recommend.tmdbHotTVShows'),
      title: t('recommend.tmdbHotTVShows'),
      type: t('recommend.categoryTV'),
    },
    {
      apipath: 'recommend/douban_movie_hot',
      linkurl: '/browse/recommend/douban_movie_hot?title=' + t('recommend.doubanHotMovies'),
      title: t('recommend.doubanHotMovies'),
      type: t('recommend.categoryMovie'),
    },
    {
      apipath: 'recommend/douban_tv_hot',
      linkurl: '/browse/recommend/douban_tv_hot?title=' + t('recommend.doubanHotTVShows'),
      title: t('recommend.doubanHotTVShows'),
      type: t('recommend.categoryTV'),
    },
    {
      apipath: 'recommend/douban_tv_animation',
      linkurl: '/browse/recommend/douban_tv_animation?title=' + t('recommend.doubanHotAnime'),
      title: t('recommend.doubanHotAnime'),
      type: t('recommend.categoryAnime'),
    },
    {
      apipath: 'recommend/douban_movies',
      linkurl: '/browse/recommend/douban_movies?title=' + t('recommend.doubanNewMovies'),
      title: t('recommend.doubanNewMovies'),
      type: t('recommend.categoryMovie'),
    },
    {
      apipath: 'recommend/douban_tvs',
      linkurl: '/browse/recommend/douban_tvs?title=' + t('recommend.doubanNewTVShows'),
      title: t('recommend.doubanNewTVShows'),
      type: t('recommend.categoryTV'),
    },
    {
      apipath: 'recommend/douban_movie_top250',
      linkurl: '/browse/recommend/douban_movie_top250?title=' + t('recommend.doubanTop250'),
      title: t('recommend.doubanTop250'),
      type: t('recommend.categoryRankings'),
    },
    {
      apipath: 'recommend/douban_tv_weekly_chinese',
      linkurl: '/browse/recommend/douban_tv_weekly_chinese?title=' + t('recommend.doubanChineseTVRankings'),
      title: t('recommend.doubanChineseTVRankings'),
      type: t('recommend.categoryRankings'),
    },
    {
      apipath: 'recommend/douban_tv_weekly_global',
      linkurl: '/browse/recommend/douban_tv_weekly_global?title=' + t('recommend.doubanGlobalTVRankings'),
      title: t('recommend.doubanGlobalTVRankings'),
      type: t('recommend.categoryRankings'),
    },
  ]
}

/** 把后端扩展媒体来源合并到现有来源列表，并保持已有顺序。 */
export function mergeExtraRecommendSources(target: RecommendViewSource[], sources: RecommendSource[]) {
  sources.forEach(source => {
    if (target.some(item => item.apipath === source.api_path)) return

    const querySeparator = source.api_path.includes('?') ? '&' : '?'
    target.push({
      apipath: source.api_path,
      linkurl: `/browse/${source.api_path}${querySeparator}title=${encodeURIComponent(source.name)}`,
      title: source.name,
      type: source.type,
    })
  })
}
