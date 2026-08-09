import type { MediaDataSource } from '@/api/types'

const MUSICBRAINZ_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** 按媒体数据源校验原生 ID，MusicBrainz 使用 UUID，其它现有来源使用数字 ID。 */
export function isValidMediaSourceId(value: string | number | null | undefined, source?: MediaDataSource): boolean {
  const normalized = value?.toString().trim()
  if (!normalized) return true
  // 无媒体上下文或来源为非 MusicBrainz 时，UUID 形态同样按 MusicBrainz ID 放行
  if (source === 'musicbrainz' || MUSICBRAINZ_ID_PATTERN.test(normalized)) {
    return MUSICBRAINZ_ID_PATTERN.test(normalized)
  }
  return /^\d+$/.test(normalized)
}
