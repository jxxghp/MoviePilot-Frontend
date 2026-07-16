import type { MediaInfo } from '@/api/types'

let mediaSeed = 0

export function createMediaInfo(overrides: Partial<MediaInfo> = {}): MediaInfo {
  mediaSeed += 1
  return {
    backdrop_path: `/images/media-${mediaSeed}.jpg`,
    episode_run_time: [],
    genres: ['剧情', '冒险'],
    origin_country: [],
    source: 'themoviedb',
    title: `测试媒体 ${mediaSeed}`,
    tmdb_id: mediaSeed,
    type: '电影',
    year: '2026',
    ...overrides,
  }
}
