import MusicAlbumPage from '@/pages/music-album.vue'
import { fireEvent, screen, waitFor } from '@testing-library/vue'
import { renderWithProviders } from '@tests/support/render'
import { defineComponent } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiDelete: vi.fn(),
  openSharedDialog: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}))

const albumId = '695f5ac8-cfd5-4e7b-96a0-6d545f5c9f17'
const firstRecordingId = '977e6978-139d-425c-bb98-6b0c62d1e45e'
const secondRecordingId = 'be9d9b1b-8c1d-4dbe-85a5-4176dd8e7b6c'
const artistId = 'b47800e7-28e1-4df9-8519-fd4f47a29fc7'

vi.mock('@/composables/useSharedDialog', () => ({
  openSharedDialog: (...args: unknown[]) => mocks.openSharedDialog(...args),
}))

vi.mock('@/api', () => ({
  default: createDataApiMock({
    get: (...args: unknown[]) => mocks.apiGet(...args),
    post: (...args: unknown[]) => mocks.apiPost(...args),
    delete: (...args: unknown[]) => mocks.apiDelete(...args),
  }),
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
  artist_ids: [artistId],
  category: 'Album',
  cover_url: `https://coverartarchive.org/release-group/${albumId}/front-500`,
  duration: 2580,
  genres: ['rock', 'art rock'],
  media_id: albumId,
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
  media_source: 'musicbrainz',
  title: 'A Night at the Opera',
  total_tracks: 2,
  tracks: [
    {
      media_id: firstRecordingId,
      title: 'Death on Two Legs',
      track_number: 1,
      disc_number: 1,
      duration: 224,
      media_source: 'musicbrainz',
    },
    {
      media_id: secondRecordingId,
      title: 'Bohemian Rhapsody',
      track_number: 2,
      disc_number: 1,
      duration: 355,
      media_source: 'musicbrainz',
    },
  ],
  type: '音乐',
  year: 1975,
}

const musicSite = { id: 13, is_active: true, name: '专辑站点', url: 'https://album-music.example' }

const MediaCardSlideViewStub = defineComponent({
  name: 'MediaCardSlideView',
  props: {
    apipath: String,
    linkurl: String,
    title: String,
  },
  template: '<div data-testid="media-card-slide" :data-api-path="apipath" :data-link-url="linkurl">{{ title }}</div>',
})

/** 按请求路径分派专辑详情与订阅状态查询。 */
function mockAlbumRequests(subscribed = false) {
  mocks.apiGet.mockImplementation((path: string) => {
    if (path === `music/album/${albumId}`) return Promise.resolve(album)
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
    initialRoute: `/music/album?media_source=musicbrainz&media_id=${albumId}`,
    initialState: { user: { superUser: true } },
    global: {
      stubs: { NoDataFound: true, MediaCardSlideView: MediaCardSlideViewStub, MusicArtistSlideView: true },
    },
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
    expect(mocks.apiGet).toHaveBeenCalledWith(`music/album/${albumId}`, {
      params: { media_source: 'musicbrainz' },
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
    expect(router.currentRoute.value.query).toMatchObject({ media_id: secondRecordingId })
  })

  it('opens the artist page from the header artist link', async () => {
    const { router } = await renderAlbumPage()

    await fireEvent.click(await screen.findByRole('link', { name: 'Queen' }))

    await waitFor(() => expect(router.currentRoute.value.path).toBe('/music/artist'))
    expect(router.currentRoute.value.query).toMatchObject({ media_id: artistId })
  })

  it('subscribes the whole album from the heart action', async () => {
    await renderAlbumPage()

    await fireEvent.click(await screen.findByRole('button', { name: '订阅' }))

    await waitFor(() =>
      expect(mocks.apiPost).toHaveBeenCalledWith(
        'subscribe/',
        expect.objectContaining({
          media_id: albumId,
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
      media_id: albumId,
      media_source: 'musicbrainz',
      sites: '13',
      type: '音乐',
    })
  })

  it('shows Douban related albums without an unsupported artist browse section', async () => {
    mocks.apiGet.mockImplementation((path: string) => {
      if (path === 'music/album/1401853') {
        return Promise.resolve({
          ...album,
          artist_ids: ['1050015'],
          media_id: '1401853',
          media_source: 'doubanmusic',
          title: '范特西',
        })
      }
      if (path.startsWith('subscribe/media/')) return Promise.reject({ response: { status: 404 } })
      return Promise.resolve([])
    })

    await renderWithProviders(MusicAlbumPage, {
      initialRoute: '/music/album?media_source=doubanmusic&media_id=1401853',
      initialState: { user: { superUser: true } },
      global: {
        stubs: { NoDataFound: true, MediaCardSlideView: MediaCardSlideViewStub, MusicArtistSlideView: true },
      },
    })

    expect(await screen.findByRole('heading', { name: '范特西' })).toBeInTheDocument()
    const slides = screen.getAllByTestId('media-card-slide')
    expect(slides).toHaveLength(1)
    expect(slides[0]).toHaveAttribute('data-api-path', 'music/album/1401853/related?media_source=doubanmusic')
    expect(slides[0]).toHaveAttribute(
      'data-link-url',
      expect.stringContaining('/browse/music/album/1401853/related?media_source=doubanmusic'),
    )
  })

  it.each([
    ['TheAudioDB', 'theaudiodb', '2109619', 'Parachutes'],
    ['豆瓣音乐', 'doubanmusic', '1401853', '范特西'],
  ])('keeps %s identity for detail-page subscribe and resource actions', async (_label, source, mediaId, title) => {
    mocks.apiGet.mockImplementation((path: string) => {
      if (path === `music/album/${mediaId}`) {
        return Promise.resolve({
          ...album,
          artist_ids: source === 'theaudiodb' ? ['artist-1'] : [],
          media_id: mediaId,
          media_source: source,
          title,
        })
      }
      if (path === 'site/media/music') return Promise.resolve([musicSite])
      if (path === 'system/setting/public/IndexerSites') {
        return Promise.resolve({ data: { value: [13] }, success: true })
      }
      if (path.startsWith('subscribe/media/')) return Promise.reject({ response: { status: 404 } })
      return Promise.resolve([])
    })

    const { router } = await renderWithProviders(MusicAlbumPage, {
      initialRoute: `/music/album?media_source=${source}&media_id=${mediaId}`,
      initialState: { user: { superUser: true } },
      global: {
        stubs: { NoDataFound: true, MediaCardSlideView: MediaCardSlideViewStub, MusicArtistSlideView: true },
      },
    })

    await fireEvent.click(await screen.findByRole('button', { name: '订阅' }))
    await waitFor(() =>
      expect(mocks.apiPost).toHaveBeenCalledWith(
        'subscribe/',
        expect.objectContaining({
          media_id: mediaId,
          media_source: source,
          music_type: 'album',
          name: title,
          type: '音乐',
        }),
      ),
    )

    await fireEvent.click(screen.getByRole('button', { name: '搜索资源' }))
    await waitFor(() => expect(mocks.openSharedDialog).toHaveBeenCalledOnce())
    const [, , dialogEvents] = mocks.openSharedDialog.mock.calls[0] as [
      unknown,
      unknown,
      { search: (sites: number[]) => void },
    ]
    dialogEvents.search([13])

    await waitFor(() => expect(router.currentRoute.value.path).toBe('/resource'))
    expect(router.currentRoute.value.query).toMatchObject({
      media_id: mediaId,
      media_source: source,
      music_type: 'album',
      sites: '13',
      type: '音乐',
    })
  })
})
