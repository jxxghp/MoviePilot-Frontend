import MusicArtistPage from '@/pages/music-artist.vue'
import { fireEvent, screen, waitFor } from '@testing-library/vue'
import { renderWithProviders } from '@tests/support/render'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  openSharedDialog: vi.fn(),
}))

vi.mock('@/composables/useSharedDialog', () => ({
  openSharedDialog: (...args: unknown[]) => mocks.openSharedDialog(...args),
}))

vi.mock('@/api', () => ({
  default: {
    get: (...args: unknown[]) => mocks.apiGet(...args),
  },
}))

// 桩组件回显标题与“更多”链接，用于校验影视详情页对齐后的瀑布浏览入口
const MediaCardSlideViewStub = defineComponent({
  props: ['apipath', 'title', 'linkurl'],
  template: '<a v-if="linkurl" :href="linkurl">{{ title }}</a><span v-else>{{ title }}</span>',
})

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
  media_source: 'musicbrainz',
  type: '音乐',
}

const musicSite = { id: 14, is_active: true, name: '艺术家站点', url: 'https://artist-music.example' }

/** 渲染艺术家详情页，统一提供超级用户权限与路由身份。 */
function renderArtistPage() {
  return renderWithProviders(MusicArtistPage, {
    initialRoute: '/music/artist?media_source=musicbrainz&media_id=artist-1',
    initialState: { user: { superUser: true } },
    global: { stubs: { NoDataFound: true, MediaCardSlideView: MediaCardSlideViewStub, MusicArtistSlideView: true } },
  })
}

describe('music artist page', () => {
  beforeEach(() => {
    mocks.apiGet.mockReset()
    mocks.openSharedDialog.mockReset()
    mocks.openSharedDialog.mockReturnValue({ close: vi.fn(), id: 1, updateProps: vi.fn() })
    mocks.apiGet.mockImplementation((path: string) => {
      if (path === 'music/artist/artist-1') return Promise.resolve(artist)
      if (path === 'site/media/music') return Promise.resolve([musicSite])
      if (path === 'system/setting/public/IndexerSites') {
        return Promise.resolve({ data: { value: [14] }, success: true })
      }
      return Promise.resolve([])
    })
  })

  it('loads the artist profile with area, active period and aliases', async () => {
    await renderArtistPage()

    expect(await screen.findByRole('heading', { name: 'Queen' })).toBeInTheDocument()
    expect(mocks.apiGet).toHaveBeenCalledWith('music/artist/artist-1', {
      params: { media_source: 'musicbrainz' },
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

  it('selects a music-capable site before searching artist resources', async () => {
    const { router } = await renderArtistPage()

    await fireEvent.click(await screen.findByRole('button', { name: '搜索资源' }))

    await waitFor(() => expect(mocks.openSharedDialog).toHaveBeenCalledOnce())
    const [, dialogProps, dialogEvents] = mocks.openSharedDialog.mock.calls[0] as [
      unknown,
      { sites: Array<{ id: number }> },
      { search: (sites: number[]) => void },
    ]
    expect(dialogProps.sites).toEqual([musicSite])
    expect(router.currentRoute.value.path).toBe('/music/artist')
    dialogEvents.search([14])

    await waitFor(() => expect(router.currentRoute.value.path).toBe('/resource'))
    expect(router.currentRoute.value.query).toMatchObject({ keyword: 'Queen', sites: '14', type: '音乐' })
  })
})
