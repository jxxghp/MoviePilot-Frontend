import MusicDetailPage from '@/pages/music-detail.vue'
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

const recordingId = '977e6978-139d-425c-bb98-6b0c62d1e45e'
const secondRecordingId = 'be9d9b1b-8c1d-4dbe-85a5-4176dd8e7b6c'
const albumId = '695f5ac8-cfd5-4e7b-96a0-6d545f5c9f17'
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

const recording = {
  album: '叶惠美',
  album_id: albumId,
  album_artist: '周杰伦',
  artist: '周杰伦',
  artists: ['周杰伦'],
  artist_ids: [artistId],
  category: 'Album',
  cover_url: `https://coverartarchive.org/release-group/${albumId}/front-500`,
  duration: 269,
  genres: ['mandopop'],
  isrc: 'TWA470301234',
  media_id: recordingId,
  music_type: 'recording',
  release_date: '2003-07-31',
  media_source: 'musicbrainz',
  title: '晴天',
  type: '音乐',
  year: 2003,
}

const album = {
  album_type: 'Album',
  artist: '周杰伦',
  artists: ['周杰伦'],
  artist_ids: [artistId],
  media_id: albumId,
  music_type: 'album',
  release_date: '2003-07-31',
  media_source: 'musicbrainz',
  title: '叶惠美',
  total_tracks: 2,
  tracks: [
    {
      media_id: recordingId,
      title: '晴天',
      track_number: 1,
      disc_number: 1,
      duration: 269,
      media_source: 'musicbrainz',
    },
    {
      media_id: secondRecordingId,
      title: '以父之名',
      track_number: 2,
      disc_number: 1,
      duration: 341,
      media_source: 'musicbrainz',
    },
  ],
  type: '音乐',
}

const musicSite = { id: 12, is_active: true, name: '音乐详情站点', url: 'https://detail-music.example' }

/** 按请求路径分派单曲详情、专辑详情和订阅状态查询。 */
function mockDetailRequests(subscribed = false) {
  mocks.apiPost.mockImplementation((path: string) => {
    if (path === 'music/recognize') return Promise.resolve(recording)
    return Promise.resolve({ data: { id: 1 }, success: true })
  })
  mocks.apiGet.mockImplementation((path: string) => {
    if (path === `music/album/${albumId}`) return Promise.resolve(album)
    if (path === 'site/media/music') return Promise.resolve([musicSite])
    if (path === 'system/setting/public/IndexerSites') {
      return Promise.resolve({ data: { value: [12] }, success: true })
    }
    if (path.startsWith('subscribe/media/')) {
      return subscribed ? Promise.resolve({ id: 9 }) : Promise.reject({ response: { status: 404 } })
    }
    return Promise.resolve([])
  })
}

/** 渲染音乐详情页，统一提供超级用户权限与路由身份。 */
function renderMusicDetailPage() {
  return renderWithProviders(MusicDetailPage, {
    initialRoute: `/music/detail?media_source=musicbrainz&media_id=${recordingId}&title=晴天`,
    initialState: { user: { superUser: true } },
    global: { stubs: { NoDataFound: true, MediaCardSlideView: true, MusicArtistSlideView: true } },
  })
}

describe('music detail page', () => {
  beforeEach(() => {
    mocks.apiGet.mockReset()
    mocks.apiPost.mockReset()
    mocks.apiDelete.mockReset()
    mocks.openSharedDialog.mockReset()
    mocks.openSharedDialog.mockReturnValue({ close: vi.fn(), id: 1, updateProps: vi.fn() })
    mockDetailRequests()
  })

  it('loads the recording detail and its album tracks', async () => {
    await renderMusicDetailPage()

    expect(await screen.findByRole('heading', { name: '晴天' })).toBeInTheDocument()
    expect(mocks.apiPost).toHaveBeenCalledWith('music/recognize', {
      media_source: 'musicbrainz',
      media_id: recordingId,
      music_type: 'recording',
    })
    await waitFor(() =>
      expect(mocks.apiGet).toHaveBeenCalledWith(`music/album/${albumId}`, {
        params: { media_source: 'musicbrainz' },
      }),
    )
    expect(await screen.findByText('以父之名')).toBeInTheDocument()
    expect(screen.getByText('TWA470301234')).toBeInTheDocument()
  })

  it('opens the album page from the album fact link', async () => {
    const { router } = await renderMusicDetailPage()

    await fireEvent.click(await screen.findByText('叶惠美'))

    await waitFor(() => expect(router.currentRoute.value.path).toBe('/music/album'))
    expect(router.currentRoute.value.query).toMatchObject({ media_id: albumId })
  })

  it('opens the artist page from the header artist link', async () => {
    const { router } = await renderMusicDetailPage()

    await fireEvent.click(await screen.findByRole('link', { name: '周杰伦' }))

    await waitFor(() => expect(router.currentRoute.value.path).toBe('/music/artist'))
    expect(router.currentRoute.value.query).toMatchObject({ media_id: artistId })
  })

  it('creates a subscription from the heart action', async () => {
    await renderMusicDetailPage()

    await fireEvent.click(await screen.findByRole('button', { name: '订阅' }))

    await waitFor(() =>
      expect(mocks.apiPost).toHaveBeenCalledWith(
        'subscribe/',
        expect.objectContaining({
          media_id: recordingId,
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
        return Promise.resolve({ ...album, media_id: albumId, title: '叶惠美' })
      }
      return Promise.resolve({ data: { id: 1 }, success: true })
    })

    const { router } = await renderWithProviders(MusicDetailPage, {
      initialRoute: `/music/detail?media_source=musicbrainz&media_id=${albumId}`,
      initialState: { user: { superUser: true } },
      global: { stubs: { NoDataFound: true, MediaCardSlideView: true, MusicArtistSlideView: true } },
    })

    await waitFor(() => expect(router.currentRoute.value.path).toBe('/music/album'))
    expect(router.currentRoute.value.query).toMatchObject({ media_id: albumId })
  })

  it('selects a music-capable site before routing the resource search', async () => {
    const { router } = await renderMusicDetailPage()

    await fireEvent.click(await screen.findByRole('button', { name: '搜索资源' }))

    await waitFor(() => expect(mocks.openSharedDialog).toHaveBeenCalledOnce())
    const [, dialogProps, dialogEvents] = mocks.openSharedDialog.mock.calls[0] as [
      unknown,
      { sites: Array<{ id: number }> },
      { search: (sites: number[]) => void },
    ]
    expect(dialogProps.sites).toEqual([musicSite])
    expect(router.currentRoute.value.path).toBe('/music/detail')
    dialogEvents.search([12])

    await waitFor(() => expect(router.currentRoute.value.path).toBe('/resource'))
    expect(router.currentRoute.value.query).toMatchObject({
      media_id: recordingId,
      media_source: 'musicbrainz',
      sites: '12',
      type: '音乐',
    })
  })
})
