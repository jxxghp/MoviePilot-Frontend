import type { MediaDataSource, MediaInfo, MusicAlbumInfo, MusicArtistInfo, MusicEntityType } from '@/api/types'
import type { RouteLocationRaw } from 'vue-router'

export interface MusicRouteTarget {
  media_source?: MediaDataSource
  media_id?: string | number
  music_type?: MusicEntityType
  title?: string
  name?: string
  year?: string | number
}

// 音乐体系中一位可跳转的艺术家
export interface MusicArtistLink {
  name: string
  id?: string
}

export interface MusicAudioInfo {
  audio_format?: string
  audio_lossless?: boolean
  audio_quality?: 'hires' | 'lossless' | 'lossy'
  audio_specs?: string
  bit_depth?: number
  sample_rate?: number
  bitrate?: number
}

/** 将采样率统一换算为 kHz。 */
export function formatMusicSampleRate(sampleRate?: number): string {
  if (!sampleRate) return ''
  const value = sampleRate >= 1000 ? sampleRate / 1000 : sampleRate
  return `${Number.isInteger(value) ? value : value.toFixed(1)} kHz`
}

/** 将码率统一换算为 kbps。 */
export function formatMusicBitrate(bitrate?: number): string {
  if (!bitrate) return ''
  const value = bitrate >= 1000 ? Math.round(bitrate / 1000) : bitrate
  return `${value.toLocaleString()} kbps`
}

/** 返回识别卡、音乐卡和历史记录共用的音频规格片段。 */
export function getMusicAudioSpecItems(item?: MusicAudioInfo): string[] {
  if (!item) return []
  return [
    item.audio_format?.toUpperCase(),
    item.bit_depth ? `${item.bit_depth}-bit` : '',
    formatMusicSampleRate(item.sample_rate),
    formatMusicBitrate(item.bitrate),
  ].filter((value): value is string => Boolean(value))
}

/** 返回紧凑的完整音频规格文本，优先使用后端规范化结果。 */
export function formatMusicAudioSpecs(item?: MusicAudioInfo): string {
  return item?.audio_specs || getMusicAudioSpecItems(item).join(' · ')
}

/** 返回音乐对象可用于路由和订阅的统一来源。 */
export function getMusicSource(item: MusicRouteTarget): MediaDataSource | undefined {
  return item.media_source
}

/** 返回内置音乐元数据源的用户可见名称。 */
export function getMusicSourceLabel(source?: string, translate?: (key: string) => string): string {
  const labels: Record<string, string> = {
    musicbrainz: 'MusicBrainz',
    theaudiodb: 'TheAudioDB',
    doubanmusic: translate?.('setting.cache.recognitionSource.doubanmusic') || '豆瓣音乐',
  }
  return (source && labels[source]) || source || ''
}

/** 返回音乐候选在列表和状态缓存中的稳定身份。 */
export function getMusicKey(item: MusicRouteTarget): string {
  const source = getMusicSource(item) || 'music'
  const entity = item.music_type || 'recording'
  return `${source}:${entity}:${item.media_id || `${item.title || item.name}-${item.year || ''}`}`
}

/** 构造专辑详情路由。 */
export function buildMusicAlbumRoute(
  albumId: string,
  title: string | undefined,
  mediaSource: MediaDataSource,
): RouteLocationRaw {
  return { path: '/music/album', query: { media_source: mediaSource, media_id: albumId, title } }
}

/** 构造艺术家详情路由。 */
export function buildMusicArtistRoute(
  artistId: string,
  name: string | undefined,
  mediaSource: MediaDataSource,
): RouteLocationRaw {
  return { path: '/music/artist', query: { media_source: mediaSource, media_id: artistId, title: name } }
}

/** 按音乐实体类型构造详情路由，缺少标准身份时回退到音乐搜索页。 */
export function buildMusicDetailRoute(item: MusicRouteTarget): RouteLocationRaw {
  const source = getMusicSource(item)
  const mediaId = item.media_id?.toString()
  if (!source || !mediaId) {
    return { path: '/music', query: { query: item.title || item.name } }
  }
  if (item.music_type === 'album') return buildMusicAlbumRoute(mediaId, item.title || item.name, source)
  if (item.music_type === 'artist') return buildMusicArtistRoute(mediaId, item.name || item.title, source)
  return {
    path: '/music/detail',
    query: {
      media_source: source,
      media_id: mediaId,
      title: item.title || item.name,
    },
  }
}

/** 构造音乐元数据身份对应的站点资源搜索路由。 */
export function buildMusicResourceRoute(
  item: MediaInfo | MusicAlbumInfo,
  sites: number[] = [],
): RouteLocationRaw | undefined {
  // 艺术家是浏览入口，不是可直接下载的媒体实体。
  if ((item as MusicRouteTarget).music_type === 'artist') return undefined
  const source = getMusicSource(item as MusicRouteTarget)
  if (!source || !item.media_id) return undefined
  return {
    path: '/resource',
    query: {
      media_source: source,
      media_id: item.media_id,
      type: '音乐',
      music_type: (item as MusicRouteTarget).music_type || 'recording',
      title: item.title,
      year: item.year,
      area: 'title',
      result_type: 'torrent',
      ...(sites.length ? { sites: sites.join(',') } : {}),
    },
  }
}

/** 把音乐信息整理成可点击跳转的艺术家列表，ID 与名称按下标对应。 */
export function getMusicArtistLinks(
  item?: Pick<MediaInfo, 'artists' | 'artist_ids' | 'artist'> | MusicAlbumInfo,
): MusicArtistLink[] {
  if (!item) return []
  const names = item.artists?.length ? item.artists : item.artist ? [item.artist] : []
  return names.map((name, index) => {
    const id = item.artist_ids?.[index]
    return id ? { name, id } : { name }
  })
}

/** 把秒数格式化为音乐展示使用的时长文本。 */
export function formatMusicDuration(seconds?: number): string {
  if (!seconds || seconds <= 0) return ''
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const remainder = Math.floor(seconds % 60)
  const paddedSeconds = remainder.toString().padStart(2, '0')
  if (!hours) return `${minutes}:${paddedSeconds}`
  return `${hours}:${minutes.toString().padStart(2, '0')}:${paddedSeconds}`
}

/** 返回艺术家卡片和详情页展示用的副标题。 */
export function getMusicArtistSubtitle(artist?: MusicArtistInfo): string {
  if (!artist) return ''
  return [artist.relation, artist.artist_type, artist.disambiguation].filter(Boolean).join(' · ')
}
