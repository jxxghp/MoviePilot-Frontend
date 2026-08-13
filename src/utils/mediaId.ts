import type { MediaDataSource } from '@/api/types'

const MUSICBRAINZ_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const IMDB_ID_PATTERN = /^tt\d+$/i
export const MUSIC_MEDIA_SOURCES = ['musicbrainz', 'theaudiodb', 'doubanmusic'] as const
const MEDIA_SOURCE_PATTERN = /^[a-z][a-z0-9._-]{0,63}$/

/** 判断外部输入是否为内置或插件注册的规范媒体来源标识。 */
export function isMediaDataSource(value: unknown): value is MediaDataSource {
  return typeof value === 'string' && MEDIA_SOURCE_PATTERN.test(value)
}

/** 将路由或表单中的单值、逗号分隔值及数组统一解析为去重后的规范来源。 */
export function parseMediaDataSources(value: unknown): MediaDataSource[] {
  const values = Array.isArray(value) ? value : [value]
  return [
    ...new Set(
      values
        .flatMap(item => (typeof item === 'string' ? item.split(',') : []))
        .map(item => item.trim().toLowerCase())
        .filter(isMediaDataSource),
    ),
  ]
}

/** 判断当前请求来源是否为内置音乐元数据源。 */
export function isMusicMediaSource(source?: MediaDataSource): boolean {
  return MUSIC_MEDIA_SOURCES.includes(source as (typeof MUSIC_MEDIA_SOURCES)[number])
}

/** 按媒体数据源校验有固定格式的原生 ID，其余来源只要求非空。 */
export function isValidMediaSourceId(value: string | number | null | undefined, source?: MediaDataSource): boolean {
  const normalized = value?.toString().trim()
  if (!normalized) return true
  if (normalized === '0') return false
  if (source === 'musicbrainz') return MUSICBRAINZ_ID_PATTERN.test(normalized)
  if (source === 'doubanmusic' && normalized.includes(':')) {
    return /^\d+:\d+$/.test(normalized)
  }
  if (source === 'imdb') return IMDB_ID_PATTERN.test(normalized)
  return true
}
