import type { MediaInfo, TmdbEpisode } from '@/api/types'

let episodeSeed = 0
let mediaSeed = 0

export function createTmdbEpisode(overrides: Partial<TmdbEpisode> = {}): TmdbEpisode {
  episodeSeed += 1
  return {
    air_date: '2026-01-01',
    crew: [],
    episode_number: episodeSeed,
    guest_stars: [],
    name: `测试剧集 ${episodeSeed}`,
    runtime: 45,
    season_number: 1,
    ...overrides,
  }
}

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
