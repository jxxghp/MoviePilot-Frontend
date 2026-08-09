import MusicAlbumPage from '@/pages/music-album.vue'
import { fireEvent, screen, waitFor } from '@testing-library/vue'
import { renderWithProviders } from '@tests/support/render'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiDelete: vi.fn(),
  openSharedDialog: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}))

vi.mock('@/composables/useSharedDialog', () => ({
  openSharedDialog: (...args: unknown[]) => mocks.openSharedDialog(...args),
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

const album = {
  album_type: 'Album',
  artist: 'Queen',
  artists: ['Queen'],
  artist_ids: ['artist-1'],
  category: 'Album',
  cover_url: 'https://coverartarchive.org/release-group/release-group-1/front-500',
  duration: 2580,
  genres: ['rock', 'art rock'],
  media_id: 'release-group-1',
  music_type: 'album',
  rating: 8.5,
  rating_votes: 44,
  release_date: '1975-11-21',
  releases: [
    {
      media_id: 'release-1',
      title: 'A Night at the Opera',
      date: '1975-11-21',
      country: 'GB',
      formats: ['12" Vinyl'],
      track_count: 12,
    },
  ],
  source: 'musicbrainz',
  title: 'A Night at the Opera',
  total_tracks: 2,
  tracks: [
    {
      media_id: 'recording-1',
      title: 'Death on Two Legs',
      track_number: 1,
      disc_number: 1,
      duration: 224,
      source: 'musicbrainz',
    },
    {
      media_id: 'recording-2',
      title: 'Bohemian Rhapsody',
      track_number: 2,
      disc_number: 1,
      duration: 355,
      source: 'musicbrainz',
    },
  ],
  type: '音乐',
  year: 1975,
}

const musicSite = { id: 13, is_active: true, name: '专辑站点', url: 'https://album-music.example' }

/** 按请求路径分派专辑详情与订阅状态查询。 */
function mockAlbumRequests(subscribed = false) {
  mocks.apiGet.mockImplementation((path: string) => {
    if (path === 'music/album/release-group-1') return Promise.resolve(album)
    if (path === 'site/media/music') return Promise.resolve([musicSite])
    if (path === 'system/setting/public/IndexerSites') {
      return Promise.resolve({ data: { value: [13] }, success: true })
    }
    if (path.startsWith('subscribe/media/')) {
      return subscribed ? Promise.resolve({ id: 9 }) : Promise.reject({ response: { status: 404 } })
    }
    return Promise.resolve([])
  })
  mocks.apiPost.mockResolvedValue({ data: { id: 1 }, success: true })
}

/** 渲染专辑详情页，统一提供超级用户权限与路由身份。 */
function renderAlbumPage() {
  return renderWithProviders(MusicAlbumPage, {
    initialRoute: '/music/album?source=musicbrainz&mediaid=release-group-1',
    initialState: { user: { superUser: true } },
    global: { stubs: { NoDataFound: true, MediaCardSlideView: true, MusicArtistSlideView: true } },
  })
}

describe('music album page', () => {
  beforeEach(() => {
    mocks.apiGet.mockReset()
    mocks.apiPost.mockReset()
    mocks.apiDelete.mockReset()
    mocks.openSharedDialog.mockReset()
    mocks.openSharedDialog.mockReturnValue({ close: vi.fn(), id: 1, updateProps: vi.fn() })
    mockAlbumRequests()
  })

  it('loads the album with its tracks and release variants', async () => {
    await renderAlbumPage()

    expect(await screen.findByRole('heading', { name: 'A Night at the Opera' })).toBeInTheDocument()
    expect(mocks.apiGet).toHaveBeenCalledWith('music/album/release-group-1', {
      params: { source: 'musicbrainz' },
    })
    expect(screen.getByText('Bohemian Rhapsody')).toBeInTheDocument()
    expect(screen.getByText('5:55')).toBeInTheDocument()
    expect(screen.getByText('rock')).toBeInTheDocument()
    expect(screen.getByText(/12" Vinyl/)).toBeInTheDocument()
  })

  it('opens the music detail page from a track row', async () => {
    const { router } = await renderAlbumPage()

    await fireEvent.click(await screen.findByText('Bohemian Rhapsody'))

    await waitFor(() => expect(router.currentRoute.value.path).toBe('/music/detail'))
    expect(router.currentRoute.value.query).toMatchObject({ mediaid: 'recording-2' })
  })

  it('opens the artist page from the header artist link', async () => {
    const { router } = await renderAlbumPage()

    await fireEvent.click(await screen.findByRole('link', { name: 'Queen' }))

    await waitFor(() => expect(router.currentRoute.value.path).toBe('/music/artist'))
    expect(router.currentRoute.value.query).toMatchObject({ mediaid: 'artist-1' })
  })

  it('subscribes the whole album from the heart action', async () => {
    await renderAlbumPage()

    await fireEvent.click(await screen.findByRole('button', { name: '订阅' }))

    await waitFor(() =>
      expect(mocks.apiPost).toHaveBeenCalledWith(
        'subscribe/',
        expect.objectContaining({
          media_id: 'release-group-1',
          media_source: 'musicbrainz',
          name: 'A Night at the Opera',
          type: '音乐',
          year: '1975',
        }),
      ),
    )
  })

  it('switches the heart action to unsubscribe when already subscribed', async () => {
    mockAlbumRequests(true)

    await renderAlbumPage()

    expect(await screen.findByRole('button', { name: '取消订阅' })).toBeInTheDocument()
  })

  it('selects a music-capable site before searching album resources', async () => {
    const { router } = await renderAlbumPage()

    await fireEvent.click(await screen.findByRole('button', { name: '搜索资源' }))

    await waitFor(() => expect(mocks.openSharedDialog).toHaveBeenCalledOnce())
    const [, dialogProps, dialogEvents] = mocks.openSharedDialog.mock.calls[0] as [
      unknown,
      { sites: Array<{ id: number }> },
      { search: (sites: number[]) => void },
    ]
    expect(dialogProps.sites).toEqual([musicSite])
    expect(router.currentRoute.value.path).toBe('/music/album')
    dialogEvents.search([13])

    await waitFor(() => expect(router.currentRoute.value.path).toBe('/resource'))
    expect(router.currentRoute.value.query).toMatchObject({
      keyword: 'musicbrainz:release-group-1',
      sites: '13',
      type: '音乐',
    })
  })
})
