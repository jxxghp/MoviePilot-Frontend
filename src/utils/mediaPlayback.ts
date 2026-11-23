import api from '@/api'
import type { FileItem, MediaInfo } from '@/api/types'
import { nativeChromeActive } from '@/native/layout'
import { getProxyImageUrl } from '@/utils/imageUtils'

/** 已匹配到实际媒体服务器的单曲身份，后续播放继续绑定同一配置。 */
interface MusicStreamMatch {
  item_id: string
  title: string
  server?: string
}

const localMediaExtensions = new Set([
  '.3gp',
  '.asf',
  '.avi',
  '.divx',
  '.flv',
  '.m2ts',
  '.m4v',
  '.mkv',
  '.mov',
  '.mp4',
  '.mpeg',
  '.mpg',
  '.mts',
  '.mxf',
  '.ogv',
  '.strm',
  '.ts',
  '.vob',
  '.webm',
  '.wmv',
])

const localAudioExtensions = new Set([
  '.ac3',
  '.aac',
  '.amr',
  '.aif',
  '.aifc',
  '.aiff',
  '.alac',
  '.ape',
  '.caf',
  '.dff',
  '.dsf',
  '.flac',
  '.m4a',
  '.m4b',
  '.m4p',
  '.mka',
  '.mid',
  '.midi',
  '.mp3',
  '.mpc',
  '.oga',
  '.ogg',
  '.opus',
  '.tak',
  '.tta',
  '.wav',
  '.wma',
  '.wv',
  '.pcm',
])

/** 决定原生播放器呈现视频控制层或音乐歌词界面。 */
export type PlaybackMediaType = 'video' | 'audio'

/** 判断当前 App 是否已完成原生播放器能力协商。 */
export function canUseNativeMediaPlayback(): boolean {
  return typeof window !== 'undefined' && nativeChromeActive.value && window.MoviePilotNative?.playbackVersion === 1
}

/** 为原生播放器生成当前实例图片代理地址，不直接向外站暴露原始封面地址。 */
export function getNativePlaybackArtworkURL(imageURL?: string, useCookies = false): string | undefined {
  if (!imageURL || !/^https?:\/\//i.test(imageURL)) return undefined
  try {
    const proxied = getProxyImageUrl(imageURL, { useCookies, maxWidth: 720, quality: 88 })
    const url = new URL(proxied, document.baseURI)
    return url.origin === window.location.origin ? url.href : undefined
  } catch {
    return undefined
  }
}

/** 检查文件管理条目是否为本地支持的视频、音频或 STRM 文件。 */
export function isLocalPlayableMediaFile(item: Partial<Pick<FileItem, 'storage' | 'type' | 'path'>>): boolean {
  if (item.storage !== 'local' || item.type !== 'file' || !item.path) return false
  const filename = item.path.split(/[\\/]/).at(-1) || ''
  const extension = filename.slice(filename.lastIndexOf('.')).toLowerCase()
  return localMediaExtensions.has(extension) || localAudioExtensions.has(extension)
}

/** 按文件名扩展名识别音频；STRM 类型可由调用方的音乐业务上下文指定。 */
export function getLocalPlaybackMediaType(file: Pick<FileItem, 'name' | 'path'>): PlaybackMediaType {
  const filename = file.path?.split(/[\\/]/).at(-1) || file.name || ''
  const extension = filename.slice(filename.lastIndexOf('.')).toLowerCase()
  return localAudioExtensions.has(extension) ? 'audio' : 'video'
}

/** 将媒体库搜索命中的单集或单曲按服务器来源送入 App 原生播放器。 */
export function playMediaServerLibraryItem(
  itemId: string,
  title: string,
  server?: string,
  artworkURL?: string,
  queue?: Array<{ itemId: string; title: string; server?: string; artworkURL?: string }>,
): boolean {
  if (!canUseNativeMediaPlayback() || !itemId || !title) return false
  window.dispatchEvent(
    new CustomEvent('moviepilot:playback-open', {
      detail: {
        itemId,
        title,
        ...(server ? { server } : {}),
        ...(artworkURL ? { artworkURL } : {}),
        ...(queue && queue.length > 1
          ? { queue, queueIndex: queue.findIndex(item => item.itemId === itemId && item.server === server) }
          : {}),
      },
    }),
  )
  return true
}

/** 通过后端的短期单文件票据在 App 中播放选中的本地文件。 */
export async function playLocalMediaFile(
  file: FileItem,
  title: string,
  mediaType: PlaybackMediaType = getLocalPlaybackMediaType(file),
): Promise<boolean> {
  if (!canUseNativeMediaPlayback() || !isLocalPlayableMediaFile(file)) return false
  const ticket = await api.post<{ item_id: string }>(
    'mediaserver/stream-ticket',
    {
      file: {
        storage: file.storage,
        type: file.type,
        name: file.name,
        path: file.path,
        fileid: file.fileid,
      },
      media_type: mediaType,
    },
    { feedback: 'silent' },
  )
  if (!ticket?.item_id) throw new Error('missing_media_ticket')
  window.dispatchEvent(
    new CustomEvent('moviepilot:playback-open', {
      detail: { itemId: ticket.item_id, title },
    }),
  )
  return true
}

/** 把音乐元数据实体匹配为媒体服务器单曲 ID，再交给原生音频播放器。 */
export async function playMusicTrack(
  music: {
    media_source?: string
    media_id?: string
    music_type?: string
    title?: string
    artists?: string[]
    artist?: string
    album?: string
    album_artist?: string
    cover_url?: string
    poster_path?: string
    year?: number | string
    track_number?: number
    disc_number?: number
  },
  playlist?: MediaInfo[],
): Promise<boolean> {
  if (!canUseNativeMediaPlayback() || music.music_type === 'album' || music.music_type === 'artist') return false
  if (!music.media_source || !music.media_id || !music.title) return false
  const tracks = playlist?.filter(
    track =>
      track.media_source &&
      track.media_id &&
      track.title &&
      track.music_type !== 'album' &&
      track.music_type !== 'artist',
  )
  const selectedIndex =
    tracks?.findIndex(track => track.media_source === music.media_source && track.media_id === music.media_id) ?? -1
  const orderedTracks =
    tracks && selectedIndex >= 0
      ? tracks.length > 100 && selectedIndex >= 100
        ? [...tracks.slice(0, 99), tracks[selectedIndex]]
        : tracks.slice(0, 100)
      : [music]
  const matches = await Promise.all(
    orderedTracks.map(async track => {
      try {
        const match = await api.post<MusicStreamMatch>(
          'mediaserver/stream-info/music',
          {
            media_source: track.media_source,
            media_id: track.media_id,
            title: track.title,
            artists: track.artists || [],
            artist: track.artist,
            album: track.album,
            album_artist: track.album_artist,
            year: track.year ? Number(track.year) : undefined,
            track_number: track.track_number,
            disc_number: track.disc_number,
          },
          { feedback: 'silent' },
        )
        return match?.item_id ? { track, match } : undefined
      } catch {
        return undefined
      }
    }),
  )
  const queue = matches.filter((item): item is NonNullable<typeof item> => Boolean(item))
  const index =
    selectedIndex >= 0
      ? queue.findIndex(
          item => item.track.media_source === music.media_source && item.track.media_id === music.media_id,
        )
      : 0
  const current = queue[index]
  if (!current) throw new Error('missing_music_stream')
  const artworkURL = getNativePlaybackArtworkURL(music.cover_url || music.poster_path)
  const nativeQueue = queue.map(({ track, match }) => {
    const trackArtworkURL = getNativePlaybackArtworkURL(
      track.cover_url || track.poster_path || music.cover_url || music.poster_path,
    )
    return {
      itemId: match.item_id,
      title: match.title || track.title || '',
      ...(match.server ? { server: match.server } : {}),
      ...(trackArtworkURL ? { artworkURL: trackArtworkURL } : {}),
    }
  })
  window.dispatchEvent(
    new CustomEvent('moviepilot:playback-open', {
      detail: {
        itemId: current.match.item_id,
        title: current.match.title || music.title,
        ...(current.match.server ? { server: current.match.server } : {}),
        ...(artworkURL ? { artworkURL } : {}),
        ...(nativeQueue.length > 1 ? { queue: nativeQueue, queueIndex: index } : {}),
      },
    }),
  )
  return true
}
