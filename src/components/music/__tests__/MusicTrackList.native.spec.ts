import type { MediaInfo } from '@/api/types'
import { NativeLayoutAdapter } from '@/native/layout'
import { renderWithProviders } from '@tests/support/render'
import { fireEvent, screen, waitFor } from '@testing-library/vue'
import MusicTrackList from '../MusicTrackList.vue'
import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ post: vi.fn() }))

vi.mock('@/api', () => ({ default: { post: mocks.post } }))

const nativeLayout = new NativeLayoutAdapter(document, window)

afterEach(() => {
  nativeLayout.setActive(false)
  delete window.MoviePilotNative
  vi.clearAllMocks()
})

describe('音乐曲目列表原生播放', () => {
  it('只为 App 内的单曲显示播放入口，并把该录音映射为媒体服务器曲目', async () => {
    nativeLayout.setActive(true)
    window.MoviePilotNative = {
      transportVersion: 1,
      playbackVersion: 1,
      postMessage: () => undefined,
    }
    mocks.post.mockResolvedValue({ item_id: 'library-track-3', title: '晴天' })
    const events: CustomEvent[] = []
    window.addEventListener('moviepilot:playback-open', event => events.push(event as CustomEvent), { once: true })
    const track = {
      type: '音乐',
      music_type: 'recording',
      media_source: 'musicbrainz',
      media_id: 'recording-3',
      title: '晴天',
      artists: ['周杰伦'],
      album: '叶惠美',
      track_number: 3,
      duration: 270,
    } as MediaInfo

    await renderWithProviders(MusicTrackList, { props: { tracks: [track] } })
    await fireEvent.click(screen.getByRole('button', { name: '播放《晴天》' }))

    await waitFor(() => expect(events).toHaveLength(1))
    expect(mocks.post).toHaveBeenCalledWith(
      'mediaserver/stream-info/music',
      expect.objectContaining({ media_source: 'musicbrainz', media_id: 'recording-3', title: '晴天' }),
      { feedback: 'silent' },
    )
    expect(events[0]?.detail).toEqual({ itemId: 'library-track-3', title: '晴天' })
  })
})
