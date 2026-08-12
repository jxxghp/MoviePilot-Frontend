import type { MediaInfo, MediaSeason, NotExistMediaInfo, TmdbEpisode } from '@/api/types'

let episodeSeed = 0
let mediaSeed = 0
let seasonSeed = 0

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
  const mediaSource = overrides.media_source ?? 'themoviedb'
  const mediaId =
    overrides.media_id ??
    (mediaSource === 'themoviedb' && overrides.tmdb_id !== undefined ? String(overrides.tmdb_id) : String(mediaSeed))
  return {
    backdrop_path: `/images/media-${mediaSeed}.jpg`,
    episode_run_time: [],
    genres: ['剧情', '冒险'],
    origin_country: [],
    media_source: mediaSource,
    media_id: mediaId,
    title: `测试媒体 ${mediaSeed}`,
    tmdb_id: mediaSeed,
    type: '电影',
    year: '2026',
    ...overrides,
  }
}

/** 构造后端无法识别媒体时返回的空详情。 */
export function createEmptyMediaInfo(): MediaInfo {
  return {
    episode_run_time: [],
    origin_country: [],
  }
}

/** 构造季选择弹窗使用的最小季信息。 */
export function createMediaSeason(overrides: Partial<MediaSeason> = {}): MediaSeason {
  seasonSeed += 1
  return {
    air_date: `202${seasonSeed % 10}-01-01`,
    episode_count: 12,
    name: `第 ${seasonSeed} 季`,
    poster_path: `/images/season-${seasonSeed}.jpg`,
    season_number: seasonSeed,
    vote_average: 8,
    ...overrides,
  }
}

/** 构造媒体服务器返回的单季缺失状态。 */
export function createNotExistMediaInfo(overrides: Partial<NotExistMediaInfo> = {}): NotExistMediaInfo {
  return {
    episodes: [],
    season: 1,
    start_episode: 1,
    total_episode: 12,
    ...overrides,
  }
}
