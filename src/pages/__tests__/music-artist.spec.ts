import MusicArtistPage from '@/pages/music-artist.vue'
import { screen, waitFor } from '@testing-library/vue'
import { renderWithProviders } from '@tests/support/render'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
}))

vi.mock('@/api', () => ({
  default: {
    get: (...args: unknown[]) => mocks.apiGet(...args),
  },
}))

const artist = {
  aliases: ['皇后乐队'],
  area: 'United Kingdom',
  artist_type: 'Group',
  begin_date: '1970-06-27',
  country: 'GB',
  detail_link: 'https://musicbrainz.org/artist/artist-1',
  disambiguation: 'UK rock group',
  external_links: { 'official homepage': 'http://www.queenonline.com/' },
  genres: ['rock', 'glam rock'],
  life_span: '1970-06-27',
  media_id: 'artist-1',
  music_type: 'artist',
  name: 'Queen',
  source: 'musicbrainz',
  type: '音乐',
}

/** 渲染艺术家详情页，统一提供超级用户权限与路由身份。 */
function renderArtistPage() {
  return renderWithProviders(MusicArtistPage, {
    initialRoute: '/music/artist?source=musicbrainz&mediaid=artist-1',
    initialState: { user: { superUser: true } },
    global: { stubs: { NoDataFound: true, MediaCardSlideView: true, MusicArtistSlideView: true } },
  })
}

describe('music artist page', () => {
  beforeEach(() => {
    mocks.apiGet.mockReset()
    mocks.apiGet.mockImplementation((path: string) => {
      if (path === 'music/artist/artist-1') return Promise.resolve(artist)
      return Promise.resolve([])
    })
  })

  it('loads the artist profile with area, active period and aliases', async () => {
    await renderArtistPage()

    expect(await screen.findByRole('heading', { name: 'Queen' })).toBeInTheDocument()
    expect(mocks.apiGet).toHaveBeenCalledWith('music/artist/artist-1', {
      params: { source: 'musicbrainz' },
    })
    expect(screen.getByText('UK rock group')).toBeInTheDocument()
    expect(screen.getAllByText('United Kingdom').length).toBeGreaterThan(0)
    expect(screen.getByText('皇后乐队')).toBeInTheDocument()
    expect(screen.getByText('rock')).toBeInTheDocument()
  })

  it('lists album, EP and single sections that link to the browse list', async () => {
    await renderArtistPage()

    await waitFor(() => expect(screen.getByText('专辑')).toBeInTheDocument())
    expect(screen.getByText('EP')).toBeInTheDocument()
    expect(screen.getByText('单曲')).toBeInTheDocument()

    const albumsLink = screen.getByText('专辑').closest('a')
    expect(albumsLink?.getAttribute('href')).toContain('/browse/music/artist/artist-1/albums')
    expect(albumsLink?.getAttribute('href')).toContain('album_type=album')
  })

  it('exposes the MusicBrainz and official homepage links', async () => {
    await renderArtistPage()

    expect(await screen.findByText('MusicBrainz')).toBeInTheDocument()
    expect(screen.getByText('official homepage')).toBeInTheDocument()
  })

  it('routes the resource search action to the site resource page', async () => {
    const { router } = await renderArtistPage()

    const searchButton = await screen.findByRole('button', { name: '搜索资源' })
    searchButton.click()

    await waitFor(() => expect(router.currentRoute.value.path).toBe('/resource'))
    expect(router.currentRoute.value.query).toMatchObject({ keyword: 'Queen', type: '音乐' })
  })
})
