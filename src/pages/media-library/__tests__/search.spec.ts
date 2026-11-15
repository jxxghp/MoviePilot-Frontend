import type { MediaServerPlayItem } from '@/api/types'
import { NativeLayoutAdapter } from '@/native/layout'
import SearchPage from '@/pages/media-library/search.vue'
import { screen, waitFor } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@tests/support/render'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ get: vi.fn() }))

vi.mock('@/api', () => ({ default: { get: mocks.get } }))

const nativeLayout = new NativeLayoutAdapter(document, window)
const libraryItems: MediaServerPlayItem[] = [
  {
    server: 'Emby-客厅',
    item_id: 'series-1',
    title: '星际穿越',
    subtitle: '科幻',
    year: 2014,
    type: '电视剧',
    image: 'https://media.example/poster/series-1',
  },
  {
    server: 'Jellyfin-音乐',
    item_id: 'track-1',
    title: '晴天',
    subtitle: '周杰伦 · 叶惠美',
    type: '音乐',
    image: 'https://media.example/poster/track-1',
  },
]

beforeEach(() => {
  nativeLayout.setActive(true)
  window.MoviePilotNative = {
    transportVersion: 1,
    playbackVersion: 1,
    postMessage: () => undefined,
  }
  mocks.get.mockImplementation((path: string) => {
    if (path === 'mediaserver/search') return Promise.resolve(libraryItems)
    if (path === 'mediaserver/episodes') return Promise.resolve({ 1: { 1: 'episode-1' } })
    throw new Error(`Unexpected GET ${path}`)
  })
})

afterEach(() => {
  nativeLayout.setActive(false)
  delete window.MoviePilotNative
  vi.clearAllMocks()
})

describe('媒体库全局搜索结果', () => {
  it('展示带海报的服务器结果，剧集选择具体单集后可原生播放', async () => {
    const user = userEvent.setup()
    const playbackEvents: CustomEvent[] = []
    window.addEventListener('moviepilot:playback-open', event => playbackEvents.push(event as CustomEvent))
    await renderWithProviders(SearchPage, {
      initialRoute: { path: '/media-library/search', query: { query: '星际穿越' } },
      initialState: { globalSettings: { data: { GLOBAL_IMAGE_CACHE: false }, initialized: true } },
    })

    expect(screen.queryByText('媒体库', { exact: true })).not.toBeInTheDocument()
    expect(screen.getByRole('search')).toBeInTheDocument()
    const series = await screen.findByRole('button', { name: '星际穿越, 电视剧' })
    expect(decodeURIComponent(series.querySelector('img')?.getAttribute('src') || '')).toContain('poster/series-1')
    expect(series.textContent).toContain('Emby-客厅')
    expect(mocks.get).toHaveBeenCalledWith(
      'mediaserver/search',
      expect.objectContaining({
        params: { keyword: '星际穿越', type: ['电视剧', '音乐'], limit: 40 },
        paramsSerializer: { indexes: null },
      }),
    )

    await user.click(series)
    expect(await screen.findByText('S01E01')).toBeInTheDocument()
    expect(mocks.get).toHaveBeenCalledWith(
      'mediaserver/episodes',
      expect.objectContaining({ params: { itemid: 'series-1', server: 'Emby-客厅' } }),
    )
    await user.click(screen.getByRole('button', { name: 'S01E01' }))
    await waitFor(() => expect(playbackEvents).toHaveLength(1))
    expect(playbackEvents[0]?.detail).toEqual({
      itemId: 'episode-1',
      title: '星际穿越 · S01E01',
      server: 'Emby-客厅',
    })

    await user.click(await screen.findByRole('button', { name: '晴天, 音乐' }))
    await waitFor(() => expect(playbackEvents).toHaveLength(2))
    expect(playbackEvents[1]?.detail).toEqual({ itemId: 'track-1', title: '晴天', server: 'Jellyfin-音乐' })
  })
})
