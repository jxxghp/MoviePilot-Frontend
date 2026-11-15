import { afterEach, describe, expect, it, vi } from 'vitest'
import type { FileItem } from '@/api/types'
import { NativeLayoutAdapter } from '@/native/layout'

const mocks = vi.hoisted(() => ({ post: vi.fn() }))

vi.mock('@/api', () => ({ default: { post: mocks.post } }))

import {
  canUseNativeMediaPlayback,
  isLocalPlayableMediaFile,
  playLocalMediaFile,
  playMusicTrack,
} from '../mediaPlayback'

const nativeLayout = new NativeLayoutAdapter(document, window)

afterEach(() => {
  nativeLayout.setActive(false)
  delete window.MoviePilotNative
  vi.clearAllMocks()
})

describe('本地单文件原生播放', () => {
  it('只识别本地支持的视频、音频和 STRM 文件', () => {
    expect(isLocalPlayableMediaFile({ storage: 'local', type: 'file', path: '/media/Episode.mkv' })).toBe(true)
    expect(isLocalPlayableMediaFile({ storage: 'local', type: 'file', path: '/media/Episode.strm' })).toBe(true)
    expect(isLocalPlayableMediaFile({ storage: 'local', type: 'file', path: '/media/Episode.srt' })).toBe(false)
    expect(isLocalPlayableMediaFile({ storage: 'local', type: 'file', path: '/media/Track.flac' })).toBe(true)
    expect(isLocalPlayableMediaFile({ storage: 'alist', type: 'file', path: '/media/Episode.strm' })).toBe(false)
  })

  it('只把不含路径的后端票据送进已协商的播放器桥', async () => {
    nativeLayout.setActive(true)
    window.MoviePilotNative = {
      transportVersion: 1,
      playbackVersion: 1,
      postMessage: () => undefined,
    }
    const item: FileItem = {
      storage: 'local',
      type: 'file',
      name: '单集.mkv',
      path: '/media/单集.mkv',
      fileid: 'file-id',
    }
    const ticket = `file.${'a'.repeat(240)}`
    mocks.post.mockResolvedValue({ item_id: ticket })
    const events: CustomEvent[] = []
    window.addEventListener('moviepilot:playback-open', event => events.push(event as CustomEvent), { once: true })

    expect(canUseNativeMediaPlayback()).toBe(true)
    await expect(playLocalMediaFile(item, '剧集 S01E01')).resolves.toBe(true)

    expect(mocks.post).toHaveBeenCalledWith(
      'mediaserver/stream-ticket',
      {
        file: { storage: 'local', type: 'file', name: '单集.mkv', path: '/media/单集.mkv', fileid: 'file-id' },
        media_type: 'video',
      },
      { feedback: 'silent' },
    )
    expect(events[0]?.detail).toEqual({ itemId: ticket, title: '剧集 S01E01' })
    expect(events[0]?.detail).not.toHaveProperty('path')
  })

  it('把音乐来源录音映射为媒体服务器单曲 ID 后打开原生音频播放器', async () => {
    nativeLayout.setActive(true)
    window.MoviePilotNative = {
      transportVersion: 1,
      playbackVersion: 1,
      postMessage: () => undefined,
    }
    mocks.post.mockResolvedValue({ item_id: 'media-server-audio-9', title: '晴天', server: 'Navidrome-音乐' })
    const events: CustomEvent[] = []
    window.addEventListener('moviepilot:playback-open', event => events.push(event as CustomEvent), { once: true })

    await expect(
      playMusicTrack({
        media_source: 'musicbrainz',
        media_id: 'recording-1',
        music_type: 'recording',
        title: '晴天',
        artists: ['周杰伦'],
        album: '叶惠美',
        track_number: 3,
      }),
    ).resolves.toBe(true)

    expect(mocks.post).toHaveBeenCalledWith(
      'mediaserver/stream-info/music',
      expect.objectContaining({ media_source: 'musicbrainz', media_id: 'recording-1', title: '晴天' }),
      { feedback: 'silent' },
    )
    expect(events[0]?.detail).toEqual({ itemId: 'media-server-audio-9', title: '晴天', server: 'Navidrome-音乐' })
  })
})
