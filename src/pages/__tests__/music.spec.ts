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

const musicResult = {
  album: '叶惠美',
  album_id: 'release-group-1',
  album_type: 'Album',
  artist: '周杰伦',
  artists: ['周杰伦'],
  artist_ids: ['artist-1'],
  category: 'Album',
  duration: 269,
  media_id: 'recording-1',
  music_type: 'recording',
  release_date: '2003-07-31',
  source: 'musicbrainz',
  title: '晴天',
  type: '音乐',
  year: 2003,
}

const albumResult = {
  album: '七里香',
  album_id: 'release-group-2',
  album_type: 'Album',
  artist: '周杰伦',
  artists: ['周杰伦'],
  artist_ids: ['artist-1'],
  category: 'Album',
  media_id: 'release-group-2',
  music_type: 'album',
  release_date: '2004-08-03',
  source: 'musicbrainz',
  title: '七里香',
  type: '音乐',
  year: 2004,
}

const artistResult = {
  category: 'Person',
  media_id: 'artist-1',
  music_type: 'artist',
  source: 'musicbrainz',
  title: '周杰伦',
  type: '音乐',
  version: 'Taiwanese singer-songwriter',
}

const musicSite = { id: 11, is_active: true, name: '音乐站点', url: 'https://music.example' }

/** 按请求路径分派音乐搜索与订阅状态查询。 */
function mockSearchAndSubscribeState(subscribed: boolean, result = musicResult) {
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
      }),
    )
    expect(screen.queryByRole('button', { name: '搜索音乐' })).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('forwards an alternate music source from the route', async () => {
    await renderWithProviders(MusicPage, {
      initialRoute: '/music?query=Coldplay&source=theaudiodb',
      initialState: { user: { superUser: true } },
      global: { stubs: { NoDataFound: true, VPageContentTitle: true } },
    })

    await waitFor(() =>
      expect(mocks.apiGet).toHaveBeenCalledWith('media/search', {
        params: { type: 'music', count: 30, title: 'Coldplay', source: 'theaudiodb' },
      }),
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
    expect(screen.getByTestId('music-source')).toHaveTextContent('MusicBrainz')
  })

  it('uses three columns from the desktop breakpoint', async () => {
    const { container } = await renderMusicPage()

    const resultColumn = await waitFor(() => container.querySelector('.music-result-col'))
    expect(resultColumn).toHaveClass('v-col-md-6', 'v-col-lg-4')
  })

  it('uses the shared themed lift interaction for result cards', async () => {
    const { container } = await renderMusicPage()
    const hoverArea = await waitFor(() => container.querySelector('.music-card-hover-area'))
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
          media_id: 'recording-1',
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
      source: 'musicbrainz',
      mediaid: 'recording-1',
      title: '晴天',
    })
  })

  it('opens the album page from the result card album link', async () => {
    const { router } = await renderMusicPage()

    await fireEvent.click(await screen.findByText('叶惠美'))

    await waitFor(() => expect(router.currentRoute.value.path).toBe('/music/album'))
    expect(router.currentRoute.value.query).toMatchObject({ mediaid: 'release-group-1' })
  })

  it('opens the artist page from the result card artist link', async () => {
    const { router } = await renderMusicPage()

    await fireEvent.click(await screen.findByText('周杰伦'))

    await waitFor(() => expect(router.currentRoute.value.path).toBe('/music/artist'))
    expect(router.currentRoute.value.query).toMatchObject({ mediaid: 'artist-1' })
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
    expect(router.currentRoute.value.query).toMatchObject({ mediaid: 'release-group-2' })

    await router.push('/music?query=晴天')
    const restoredArtistEntity = await screen.findByText('艺术家')
    const restoredArtistCard = restoredArtistEntity.closest('.music-card')
    await fireEvent.click(within(restoredArtistCard as HTMLElement).getByText('周杰伦'))
    await waitFor(() => expect(router.currentRoute.value.path).toBe('/music/artist'))
    expect(router.currentRoute.value.query).toMatchObject({ mediaid: 'artist-1' })
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
      keyword: 'musicbrainz:recording-1',
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
      media_id: mediaId,
      source,
      title,
    }
    mockSearchAndSubscribeState(false, result)
    const { router } = await renderMusicPage(`/music?query=${encodeURIComponent(title)}&source=${source}`)

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
      keyword: `${source}:${mediaId}`,
      music_type: 'album',
      sites: '11',
      type: '音乐',
    })
  })
})
