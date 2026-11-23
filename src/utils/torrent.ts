import type { Context, MusicEntityType, TorrentInfo } from '@/api/types'

/** 已知倍率对应的促销展示语义，不用于替代后端的资源筛选规则。 */
export type TorrentPromotionKind = 'free' | 'discount' | 'bonus' | 'other'

/** 缺失倍率不表示免费，普通资源和没有有效文案的促销也不显示占位标签。 */
export function getTorrentPromotionKind(torrent?: Partial<TorrentInfo> | null): TorrentPromotionKind | undefined {
  const download = torrent?.downloadvolumefactor
  const upload = torrent?.uploadvolumefactor
  if (
    typeof download !== 'number' ||
    typeof upload !== 'number' ||
    !Number.isFinite(download) ||
    !Number.isFinite(upload) ||
    download < 0 ||
    upload < 0 ||
    !torrent?.volume_factor?.trim() ||
    (download === 1 && upload === 1)
  )
    return undefined

  if (download === 0) return 'free'
  if (download < 1) return 'discount'
  if (upload > 1) return 'bonus'
  return 'other'
}

/** 判断资源是否仍需人工确认，不依赖其是否带有媒体或站点身份字段。 */
export function isUnconfirmedResource(context?: Context): boolean {
  return context?.match_status === 'candidate'
}

/** 从资源与媒体结构判断音乐类型，兼容旧缓存的字段缺省。 */
export function isMusicResource(context?: Context): boolean {
  return [
    context?.meta_info?.type,
    isUnconfirmedResource(context) ? undefined : context?.media_info?.type,
    context?.torrent_info?.category,
  ].some(type => ['音乐', 'music'].includes(type?.toLowerCase() || ''))
}

/** 未确认项显示资源实际曲名，不能借目标标题或所属专辑名冒充资源身份。 */
export function getTorrentTitle(context?: Context, withYear = false): string {
  const parsed = isMusicResource(context)
    ? context?.meta_info?.title || context?.meta_info?.name
    : context?.meta_info?.name
  const target = isUnconfirmedResource(context)
    ? undefined
    : (withYear ? context?.media_info?.title_year : undefined) || context?.media_info?.title
  return target || parsed || context?.torrent_info?.title || ''
}

/** 为统一下载对话框构造参数，待确认项不预填媒体 ID，实体类型只作为人工选择提示。 */
export function buildTorrentDownloadProps(context?: Context, targetMusicType?: string) {
  const unconfirmed = isUnconfirmedResource(context)
  const torrent =
    unconfirmed && context?.torrent_info
      ? { ...context.torrent_info, media_source: undefined, media_id: undefined }
      : context?.torrent_info
  const entity =
    context?.match_reason === 'related_album'
      ? 'album'
      : context?.match_reason === 'partial_album'
        ? 'recording'
        : (unconfirmed ? undefined : context?.media_info?.music_type) || targetMusicType
  const musicType: Exclude<MusicEntityType, 'artist'> = entity === 'album' ? 'album' : 'recording'
  return {
    title: [getTorrentTitle(context, true), context?.meta_info?.season_episode].filter(Boolean).join(' '),
    media: unconfirmed ? undefined : context?.media_info || undefined,
    torrent,
    ...(isMusicResource(context) ? { musicType } : {}),
  }
}
