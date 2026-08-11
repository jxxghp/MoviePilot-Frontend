import type { MediaDataSource } from '@/api/types'

const MUSICBRAINZ_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const MUSIC_MEDIA_SOURCES = ['musicbrainz', 'theaudiodb', 'doubanmusic'] as const

/** 判断当前请求来源是否为内置音乐元数据源。 */
export function isMusicMediaSource(source?: MediaDataSource): boolean {
  return MUSIC_MEDIA_SOURCES.includes(source as (typeof MUSIC_MEDIA_SOURCES)[number])
}

/** 按媒体数据源校验原生 ID，并兼容豆瓣音乐的曲目复合 ID。 */
export function isValidMediaSourceId(value: string | number | null | undefined, source?: MediaDataSource): boolean {
  const normalized = value?.toString().trim()
  if (!normalized) return true
  // 无媒体上下文或来源为非 MusicBrainz 时，UUID 形态同样按 MusicBrainz ID 放行
  if (source === 'musicbrainz' || MUSICBRAINZ_ID_PATTERN.test(normalized)) {
    return MUSICBRAINZ_ID_PATTERN.test(normalized)
  }
  if (source === 'doubanmusic' && normalized.includes(':')) {
    return /^\d+:\d+$/.test(normalized)
  }
  return /^\d+$/.test(normalized)
}
