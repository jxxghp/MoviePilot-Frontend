import MusicDetailPage from '@/pages/music-detail.vue'
import { fireEvent, screen, waitFor } from '@testing-library/vue'
import { renderWithProviders } from '@tests/support/render'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiDelete: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}))

vi.mock('@/api', () => ({
  default: {
    get: (...args: unknown[]) => mocks.apiGet(...args),
    post: (...args: unknown[]) => mocks.apiPost(...args),
    delete: (...args: unknown[]) => mocks.apiDelete(...args),
  },
}))

vi.mock('vue-toastification', () => ({
  useToast: () => ({
    error: mocks.toastError,
    success: mocks.toastSuccess,
  }),
}))

const recording = {
  album: '叶惠美',
  album_id: 'release-group-1',
  album_artist: '周杰伦',
  artist: '周杰伦',
  artists: ['周杰伦'],
  artist_ids: ['artist-1'],
  category: 'Album',
  cover_url: 'https://coverartarchive.org/release-group/release-group-1/front-500',
  duration: 269,
  genres: ['mandopop'],
  isrc: 'TWA470301234',
  media_id: 'recording-1',
  music_type: 'recording',
  release_date: '2003-07-31',
  source: 'musicbrainz',
  title: '晴天',
  type: '音乐',
  year: 2003,
}

const album = {
  album_type: 'Album',
  artist: '周杰伦',
  artists: ['周杰伦'],
  artist_ids: ['artist-1'],
  media_id: 'release-group-1',
  music_type: 'album',
  release_date: '2003-07-31',
  source: 'musicbrainz',
  title: '叶惠美',
  total_tracks: 2,
  tracks: [
    { media_id: 'recording-1', title: '晴天', track_number: 1, disc_number: 1, duration: 269, source: 'musicbrainz' },
    {
      media_id: 'recording-2',
      title: '以父之名',
      track_number: 2,
      disc_number: 1,
      duration: 341,
      source: 'musicbrainz',
    },
  ],
  type: '音乐',
}

/** 按请求路径分派单曲详情、专辑详情和订阅状态查询。 */
function mockDetailRequests(subscribed = false) {
  mocks.apiPost.mockImplementation((path: string) => {
    if (path === 'music/recognize') return Promise.resolve(recording)
    return Promise.resolve({ data: { id: 1 }, success: true })
  })
  mocks.apiGet.mockImplementation((path: string) => {
    if (path === 'music/album/release-group-1') return Promise.resolve(album)
    if (path.startsWith('subscribe/media/')) {
      return subscribed ? Promise.resolve({ id: 9 }) : Promise.reject({ response: { status: 404 } })
    }
    return Promise.resolve([])
  })
}

/** 渲染音乐详情页，统一提供超级用户权限与路由身份。 */
function renderMusicDetailPage() {
  return renderWithProviders(MusicDetailPage, {
    initialRoute: '/music/detail?source=musicbrainz&mediaid=recording-1&title=晴天',
    initialState: { user: { superUser: true } },
    global: { stubs: { NoDataFound: true, MediaCardSlideView: true, MusicArtistSlideView: true } },
  })
}

describe('music detail page', () => {
  beforeEach(() => {
    mocks.apiGet.mockReset()
    mocks.apiPost.mockReset()
    mocks.apiDelete.mockReset()
    mockDetailRequests()
  })

  it('loads the recording detail and its album tracks', async () => {
    await renderMusicDetailPage()

    expect(await screen.findByRole('heading', { name: '晴天' })).toBeInTheDocument()
    expect(mocks.apiPost).toHaveBeenCalledWith('music/recognize', {
      source: 'musicbrainz',
      media_id: 'recording-1',
    })
    await waitFor(() =>
      expect(mocks.apiGet).toHaveBeenCalledWith('music/album/release-group-1', {
        params: { source: 'musicbrainz' },
      }),
    )
    expect(await screen.findByText('以父之名')).toBeInTheDocument()
    expect(screen.getByText('TWA470301234')).toBeInTheDocument()
  })

  it('opens the album page from the album fact link', async () => {
    const { router } = await renderMusicDetailPage()

    await fireEvent.click(await screen.findByText('叶惠美'))

    await waitFor(() => expect(router.currentRoute.value.path).toBe('/music/album'))
    expect(router.currentRoute.value.query).toMatchObject({ mediaid: 'release-group-1' })
  })

  it('opens the artist page from the header artist link', async () => {
    const { router } = await renderMusicDetailPage()

    await fireEvent.click(await screen.findByRole('link', { name: '周杰伦' }))

    await waitFor(() => expect(router.currentRoute.value.path).toBe('/music/artist'))
    expect(router.currentRoute.value.query).toMatchObject({ mediaid: 'artist-1' })
  })

  it('creates a subscription from the heart action', async () => {
    await renderMusicDetailPage()

    await fireEvent.click(await screen.findByRole('button', { name: '订阅' }))

    await waitFor(() =>
      expect(mocks.apiPost).toHaveBeenCalledWith(
        'subscribe/',
        expect.objectContaining({
          media_id: 'recording-1',
          media_source: 'musicbrainz',
          name: '晴天',
          type: '音乐',
        }),
      ),
    )
  })

  it('switches the heart action to unsubscribe when already subscribed', async () => {
    mockDetailRequests(true)

    await renderMusicDetailPage()

    expect(await screen.findByRole('button', { name: '取消订阅' })).toBeInTheDocument()
  })

  it('redirects an album identity to the album page', async () => {
    mocks.apiPost.mockImplementation((path: string) => {
      if (path === 'music/recognize') {
        return Promise.resolve({ ...album, media_id: 'release-group-1', title: '叶惠美' })
      }
      return Promise.resolve({ data: { id: 1 }, success: true })
    })

    const { router } = await renderWithProviders(MusicDetailPage, {
      initialRoute: '/music/detail?source=musicbrainz&mediaid=release-group-1',
      initialState: { user: { superUser: true } },
      global: { stubs: { NoDataFound: true, MediaCardSlideView: true, MusicArtistSlideView: true } },
    })

    await waitFor(() => expect(router.currentRoute.value.path).toBe('/music/album'))
    expect(router.currentRoute.value.query).toMatchObject({ mediaid: 'release-group-1' })
  })

  it('routes the resource search action to the site resource page', async () => {
    const { router } = await renderMusicDetailPage()

    await fireEvent.click(await screen.findByRole('button', { name: '搜索资源' }))

    await waitFor(() => expect(router.currentRoute.value.path).toBe('/resource'))
    expect(router.currentRoute.value.query).toMatchObject({
      keyword: 'musicbrainz:recording-1',
      type: '音乐',
    })
  })
})
