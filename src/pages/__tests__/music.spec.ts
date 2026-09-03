import MusicPage from '@/pages/music.vue'
import { fireEvent, screen, waitFor, within } from '@testing-library/vue'
import { renderWithProviders } from '@tests/support/render'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiDelete: vi.fn(),
  openSharedDialog: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  startNProgress: vi.fn(),
  doneNProgress: vi.fn(),
}))

const recordingId = '977e6978-139d-425c-bb98-6b0c62d1e45e'
const albumId = '695f5ac8-cfd5-4e7b-96a0-6d545f5c9f17'
const secondAlbumId = '55b3e279-98e0-44d4-86ad-d68109d6910f'
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

// 音乐页测试不调用真实 NProgress，避免其延时清理跨过测试环境销毁。
vi.mock('@/api/nprogress', () => ({
  configureNProgress: vi.fn(),
  doneNProgress: mocks.doneNProgress,
  startNProgress: mocks.startNProgress,
}))

const musicResult = {
  album: '叶惠美',
  album_id: albumId,
  album_type: 'Album',
  artist: '周杰伦',
  artists: ['周杰伦'],
  artist_ids: [artistId],
  metadata_category: 'Album',
  duration: 269,
  media_id: recordingId,
  music_type: 'recording',
  release_date: '2003-07-31',
  media_source: 'musicbrainz',
  title: '晴天',
  type: '音乐',
  year: 2003,
}

const albumResult = {
  album: '七里香',
  album_id: secondAlbumId,
  album_type: 'Album',
  artist: '周杰伦',
  artists: ['周杰伦'],
  artist_ids: [artistId],
  metadata_category: 'Album',
  media_id: secondAlbumId,
  music_type: 'album',
  release_date: '2004-08-03',
  media_source: 'musicbrainz',
  title: '七里香',
  type: '音乐',
  year: 2004,
}

const artistResult = {
  metadata_category: 'Person',
  media_id: artistId,
  music_type: 'artist',
  media_source: 'musicbrainz',
  title: '周杰伦',
  type: '音乐',
  version: 'Taiwanese singer-songwriter',
}

const musicSite = { id: 11, is_active: true, name: '音乐站点', url: 'https://music.example' }

/** 按请求路径分派音乐搜索与订阅状态查询。 */
function mockSearchAndSubscribeState(subscribed: boolean, result: Record<string, unknown> = musicResult) {
  mocks.apiGet.mockImplementation((path: string) => {
    if (path === 'media/search') return Promise.resolve([result])
    if (path === 'site/media/music') return Promise.resolve([musicSite])
    if (path === 'system/setting/public/IndexerSites') {
      return Promise.resolve({ data: { value: [11, 99] }, success: true })
    }
    if (path.startsWith('subscribe/media/')) {
      return subscribed ? Promise.resolve({ id: 9 }) : Promise.reject({ response: { status: 404 } })
    }
    return Promise.resolve([])
  })
}

/** 渲染音乐搜索结果页，统一提供超级用户权限与路由关键词。 */
function renderMusicPage(initialRoute = '/music?query=晴天') {
  return renderWithProviders(MusicPage, {
    initialRoute,
    initialState: { user: { superUser: true } },
    global: { stubs: { NoDataFound: true, VPageContentTitle: true } },
  })
}

describe('music page', () => {
  beforeEach(() => {
    mocks.apiGet.mockReset()
    mocks.apiPost.mockReset()
    mocks.apiDelete.mockReset()
    mocks.openSharedDialog.mockReset()
    mocks.openSharedDialog.mockReturnValue({ close: vi.fn(), id: 1, updateProps: vi.fn() })
    mockSearchAndSubscribeState(false)
    mocks.apiPost.mockResolvedValue({ data: { id: 1 }, success: true })
  })

  it('searches from the route keyword without an in-page search box', async () => {
    await renderMusicPage()

    await waitFor(() =>
      expect(mocks.apiGet).toHaveBeenCalledWith('media/search', {
        params: { type: 'music', count: 30, title: '晴天' },
        paramsSerializer: { indexes: null },
      }),
    )
    expect(screen.queryByRole('button', { name: '搜索音乐' })).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('forwards an alternate music source from the route', async () => {
    await renderWithProviders(MusicPage, {
      initialRoute: '/music?query=Coldplay&media_source=theaudiodb',
      initialState: { user: { superUser: true } },
      global: { stubs: { NoDataFound: true, VPageContentTitle: true } },
    })

    await waitFor(() =>
      expect(mocks.apiGet).toHaveBeenCalledWith('media/search', {
        params: { type: 'music', count: 30, title: 'Coldplay', media_source: ['theaudiodb'] },
        paramsSerializer: { indexes: null },
      }),
    )
  })

  it('forwards multiple music sources and renders mixed-source results', async () => {
    const theAudioDbResult = {
      ...albumResult,
      media_id: 'album-2109619',
      media_source: 'theaudiodb',
      title: 'Parachutes',
    }
    mocks.apiGet.mockImplementation((path: string) => {
      if (path === 'media/search') return Promise.resolve([musicResult, theAudioDbResult])
      if (path.startsWith('subscribe/media/')) return Promise.reject({ response: { status: 404 } })
      return Promise.resolve([])
    })

    await renderMusicPage('/music?query=Coldplay&media_source=musicbrainz,unknown,theaudiodb,musicbrainz')

    await waitFor(() =>
      expect(mocks.apiGet).toHaveBeenCalledWith('media/search', {
        params: {
          type: 'music',
          count: 30,
          title: 'Coldplay',
          media_source: ['musicbrainz', 'unknown', 'theaudiodb'],
        },
        paramsSerializer: { indexes: null },
      }),
    )
    expect(await screen.findByText('晴天')).toBeInTheDocument()
    expect(screen.getByText('Parachutes')).toBeInTheDocument()
    expect(screen.getAllByTestId('music-source').map(item => item.textContent)).toEqual(
      expect.arrayContaining([expect.stringContaining('MusicBrainz'), expect.stringContaining('TheAudioDB')]),
    )
  })

  it('shows album, artist, release date and duration on the result card', async () => {
    await renderMusicPage()

    expect(await screen.findByText('晴天')).toBeInTheDocument()
    expect(screen.getByText('单曲')).toBeInTheDocument()
    expect(screen.getByText('周杰伦')).toBeInTheDocument()
    expect(screen.getByText('叶惠美')).toBeInTheDocument()
    expect(screen.getByText('2003-07-31')).toBeInTheDocument()
    expect(screen.getByText('4:29')).toBeInTheDocument()
    expect(screen.getByText('Album')).toBeInTheDocument()
    const source = screen.getByTestId('music-source')
    expect(source).toHaveTextContent('MusicBrainz')
    expect(source.closest('.music-card-cover-column')).not.toBeNull()
    expect(source.closest('.music-card-body')).toBeNull()
  })

  it('keeps a long title-side label constrained without hiding its full value', async () => {
    const longVersion = 'Taiwanese singer-songwriter and multi-instrumentalist with a very long biography label'
    mockSearchAndSubscribeState(false, { ...artistResult, version: longVersion })

    const { container } = await renderMusicPage()

    const version = await screen.findByTitle(longVersion)
    expect(version).toHaveClass('music-card-version')
    expect(version).toHaveAttribute('title', longVersion)
    expect(version.closest('.music-card-heading')).toBe(container.querySelector('.music-card-heading'))
  })

  it('uses three columns from the desktop breakpoint', async () => {
    const { container } = await renderMusicPage()

    await screen.findByText('晴天')
    const resultColumn = container.querySelector('.music-result-col')
    expect(resultColumn).toHaveClass('v-col-md-6', 'v-col-lg-4')
  })

  it('uses the shared themed lift interaction for result cards', async () => {
    const { container } = await renderMusicPage()
    await screen.findByText('晴天')
    const hoverArea = container.querySelector('.music-card-hover-area')
    const card = container.querySelector('.music-card')!

    await fireEvent.mouseEnter(hoverArea!)
    await waitFor(() => expect(card).toHaveClass('app-hover-lift-card--hovering'))

    await fireEvent.mouseLeave(hoverArea!)
    await waitFor(() => expect(card).not.toHaveClass('app-hover-lift-card--hovering'))
  })

  it('offers a subscribe action when the music is not subscribed yet', async () => {
    await renderMusicPage()

    const subscribeButton = await screen.findByRole('button', { name: '订阅' })

    await fireEvent.click(subscribeButton)
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
    mockSearchAndSubscribeState(true)

    await renderMusicPage()

    expect(await screen.findByRole('button', { name: '取消订阅' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '订阅' })).not.toBeInTheDocument()
  })

  it('opens the music detail page from a result card', async () => {
    const { router } = await renderMusicPage()

    await fireEvent.click(await screen.findByText('晴天'))

    await waitFor(() => expect(router.currentRoute.value.path).toBe('/music/detail'))
    expect(router.currentRoute.value.query).toMatchObject({
      media_source: 'musicbrainz',
      media_id: recordingId,
      title: '晴天',
    })
  })

  it('opens the album page from the result card album link', async () => {
    const { router } = await renderMusicPage()

    await fireEvent.click(await screen.findByText('叶惠美'))

    await waitFor(() => expect(router.currentRoute.value.path).toBe('/music/album'))
    expect(router.currentRoute.value.query).toMatchObject({ media_id: albumId })
  })

  it('opens the artist page from the result card artist link', async () => {
    const { router } = await renderMusicPage()

    await fireEvent.click(await screen.findByText('周杰伦'))

    await waitFor(() => expect(router.currentRoute.value.path).toBe('/music/artist'))
    expect(router.currentRoute.value.query).toMatchObject({ media_id: artistId })
  })

  it('renders album and artist search entities with entity-correct actions and routes', async () => {
    mocks.apiGet.mockImplementation((path: string) => {
      if (path === 'media/search') return Promise.resolve([musicResult, albumResult, artistResult])
      if (path.startsWith('subscribe/media/')) return Promise.reject({ response: { status: 404 } })
      return Promise.resolve([])
    })
    const { router } = await renderMusicPage()

    const artistEntity = await screen.findByText('艺术家')
    const artistCard = artistEntity.closest('.music-card')
    expect(artistCard).not.toBeNull()
    expect(within(artistCard as HTMLElement).queryByRole('button', { name: '订阅' })).not.toBeInTheDocument()
    expect(within(artistCard as HTMLElement).queryByRole('button', { name: '搜索资源' })).not.toBeInTheDocument()

    await fireEvent.click(screen.getByText('七里香'))
    await waitFor(() => expect(router.currentRoute.value.path).toBe('/music/album'))
    expect(router.currentRoute.value.query).toMatchObject({ media_id: secondAlbumId })

    await router.push('/music?query=晴天')
    const restoredArtistEntity = await screen.findByText('艺术家')
    const restoredArtistCard = restoredArtistEntity.closest('.music-card')
    await fireEvent.click(within(restoredArtistCard as HTMLElement).getByText('周杰伦'))
    await waitFor(() => expect(router.currentRoute.value.path).toBe('/music/artist'))
    expect(router.currentRoute.value.query).toMatchObject({ media_id: artistId })
  })

  it('selects a music-capable site before routing the resource search', async () => {
    const { router } = await renderMusicPage()

    await fireEvent.click(await screen.findByRole('button', { name: '搜索资源' }))

    await waitFor(() => expect(mocks.openSharedDialog).toHaveBeenCalledOnce())
    expect(mocks.apiGet).toHaveBeenCalledWith('site/media/music')
    expect(router.currentRoute.value.path).toBe('/music')

    const [, dialogProps, dialogEvents] = mocks.openSharedDialog.mock.calls[0] as [
      unknown,
      { selected: number[]; sites: Array<{ id: number }> },
      { search: (sites: number[]) => void },
    ]
    expect(dialogProps.sites).toEqual([musicSite])
    expect(dialogProps.selected).toEqual([11, 99])
    dialogEvents.search([11])

    await waitFor(() => expect(router.currentRoute.value.path).toBe('/resource'))
    expect(router.currentRoute.value.query).toMatchObject({
      media_id: recordingId,
      media_source: 'musicbrainz',
      sites: '11',
      type: '音乐',
    })
  })

  it.each([
    ['TheAudioDB', 'theaudiodb', 'album-2109619', 'Parachutes'],
    ['豆瓣音乐', 'doubanmusic', '1401853', '范特西'],
  ])('keeps %s identity on search result actions', async (label, source, mediaId, title) => {
    const result = {
      ...albumResult,
      album: title,
      album_id: mediaId,
      artist_ids: source === 'theaudiodb' ? ['artist-1'] : [],
      duration: 0,
      media_id: mediaId,
      media_source: source,
      title,
    }
    mockSearchAndSubscribeState(false, result)
    const { router } = await renderMusicPage(`/music?query=${encodeURIComponent(title)}&media_source=${source}`)

    expect(await screen.findByTestId('music-source')).toHaveTextContent(label)
    await fireEvent.click(screen.getByRole('button', { name: '订阅' }))
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
    dialogEvents.search([11])

    await waitFor(() => expect(router.currentRoute.value.path).toBe('/resource'))
    expect(router.currentRoute.value.query).toMatchObject({
      media_id: mediaId,
      media_source: source,
      music_type: 'album',
      sites: '11',
      type: '音乐',
    })
  })
})
