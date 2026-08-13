import SearchBarDialog from '@/components/dialog/SearchBarDialog.vue'
import { DEFAULT_PERMISSIONS } from '@/utils/permission'
import { screen, waitFor, within } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@tests/support/render'
import { defineComponent } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
}))

vi.mock('@/api', () => ({
  default: createDataApiMock({
    get: (...args: unknown[]) => mocks.apiGet(...args),
  }),
}))

const IconStub = defineComponent({
  name: 'VIcon',
  props: {
    icon: String,
  },
  template: '<i :data-icon="icon" />',
})

async function renderSearchBar(
  overrides: {
    managePermission?: boolean
    searchPermission?: boolean
    searchSource?: string
  } = {},
) {
  return renderWithProviders(SearchBarDialog, {
    props: {
      modelValue: true,
      showActivator: true,
    },
    initialState: {
      user: {
        permissions: {
          ...DEFAULT_PERMISSIONS,
          admin: false,
          discovery: true,
          manage: overrides.managePermission ?? false,
          search: overrides.searchPermission ?? false,
          subscribe: false,
        },
        superUser: false,
      },
      // 全局设置走真实 action，便于断言“媒体搜索数据源”配置对搜索框默认勾选的影响。
      globalSettings: {
        data: overrides.searchSource ? { SEARCH_SOURCE: overrides.searchSource } : {},
        initialized: true,
      },
    },
    stubActions: false,
    global: {
      stubs: {
        VDialogCloseBtn: true,
        VIcon: IconStub,
      },
    },
  })
}

function getSearchItem(title: string): HTMLElement {
  const item = screen.getByText(title).closest('.v-list-item')
  if (!(item instanceof HTMLElement)) throw new Error(`Search item not found: ${title}`)
  return item
}

describe('SearchBarDialog media source selection', () => {
  beforeEach(() => {
    localStorage.clear()
    mocks.apiGet.mockImplementation((path: string) => {
      if (path === 'system/setting/public/IndexerSites') return Promise.resolve({ value: [11, 99] })
      if (path === 'site/') {
        return Promise.resolve([
          { id: 11, is_active: true, name: '音乐站' },
          { id: 99, is_active: true, name: '综合站' },
        ])
      }
      if (path === 'site/media/music') {
        return Promise.resolve([
          { id: 11, is_active: true, name: '音乐站' },
          { id: 22, is_active: false, name: '停用音乐站' },
        ])
      }
      throw new Error(`Unexpected GET ${path}`)
    })
  })

  it('defaults media searches to TheMovieDB when no global search source is configured', async () => {
    const user = userEvent.setup()
    const { router } = await renderSearchBar()
    const input = await screen.findByPlaceholderText('搜索电影、剧集以及更多...')

    expect(input.getAttribute('id')).toBe('global-media-search')
    expect(input.getAttribute('aria-label')).toBe('搜索电影、剧集以及更多...')

    await user.type(input, '流浪地球{Enter}')

    await waitFor(() => {
      expect(router.currentRoute.value.path).toBe('/browse/media/search')
      expect(router.currentRoute.value.query).toEqual({
        media_source: 'themoviedb',
        title: '流浪地球',
        type: 'media',
      })
    })
  })

  it('follows the global media search source configuration and passes multiple sources', async () => {
    const user = userEvent.setup()
    const { router } = await renderSearchBar({ searchSource: 'themoviedb,douban' })
    const input = await screen.findByPlaceholderText('搜索电影、剧集以及更多...')

    await user.type(input, '芙莉莲')
    const mediaItem = getSearchItem('电影、电视剧')

    const mediaGroup = within(mediaItem).getByRole('group', { name: '电影、电视剧搜索数据源' })
    expect(within(mediaGroup).getByRole('button', { name: '使用 TheMovieDb 搜索' })).toHaveClass(
      'media-source-button--active',
    )
    expect(within(mediaGroup).getByRole('button', { name: '使用 豆瓣 搜索' })).toHaveClass(
      'media-source-button--active',
    )
    expect(within(mediaGroup).getByRole('button', { name: '使用 Bangumi 搜索' })).not.toHaveClass(
      'media-source-button--active',
    )

    await user.click(input)
    await user.keyboard('{Enter}')

    await waitFor(() => {
      expect(router.currentRoute.value.query).toEqual({
        media_source: 'themoviedb,douban',
        title: '芙莉莲',
        type: 'media',
      })
    })
  })

  it('places supported sources inside each search item and supports multi-source selection', async () => {
    const user = userEvent.setup()
    const { router } = await renderSearchBar()
    const input = await screen.findByPlaceholderText('搜索电影、剧集以及更多...')

    await user.type(input, '芙莉莲')
    const mediaItem = getSearchItem('电影、电视剧')
    const musicItem = getSearchItem('音乐')
    const collectionItem = getSearchItem('系列合集')
    const personItem = getSearchItem('演员')

    const mediaGroup = within(mediaItem).getByRole('group', { name: '电影、电视剧搜索数据源' })
    const musicGroup = within(musicItem).getByRole('group', { name: '音乐搜索数据源' })
    const collectionGroup = within(collectionItem).getByRole('group', { name: '系列合集搜索数据源' })
    const personGroup = within(personItem).getByRole('group', { name: '演员搜索数据源' })

    expect(within(mediaGroup).getAllByRole('button')).toHaveLength(4)
    expect(within(musicGroup).getAllByRole('button')).toHaveLength(3)
    expect(within(musicGroup).getByRole('button', { name: '使用 MusicBrainz 搜索' })).toHaveClass(
      'media-source-button--active',
    )
    expect(within(musicGroup).getByRole('button', { name: '使用 TheAudioDB 搜索' })).not.toHaveClass(
      'media-source-button--active',
    )
    expect(within(musicGroup).getByRole('button', { name: '使用 豆瓣音乐 搜索' })).not.toHaveClass(
      'media-source-button--active',
    )
    expect(within(collectionGroup).getAllByRole('button')).toHaveLength(1)
    expect(within(personGroup).getAllByRole('button')).toHaveLength(2)
    expect(within(mediaGroup).getByRole('button', { name: '使用 TheMovieDb 搜索' })).toHaveClass(
      'media-source-button--active',
    )

    // 追加选择 AniList 后再取消 TheMovieDb，来源应以逗号分隔传给后端。
    await user.click(within(mediaGroup).getByRole('button', { name: '使用 AniList 搜索' }))
    expect(within(mediaGroup).getByRole('button', { name: '使用 AniList 搜索' })).toHaveClass(
      'media-source-button--active',
    )
    await user.click(within(mediaGroup).getByRole('button', { name: '使用 TheMovieDb 搜索' }))
    expect(within(mediaGroup).getByRole('button', { name: '使用 AniList 搜索' })).toHaveClass(
      'media-source-button--active',
    )
    expect(within(mediaGroup).getByRole('button', { name: '使用 TheMovieDb 搜索' })).not.toHaveClass(
      'media-source-button--active',
    )

    await user.click(input)
    await user.keyboard('{Enter}')

    await waitFor(() => {
      expect(router.currentRoute.value.query).toEqual({
        media_source: 'anilist',
        title: '芙莉莲',
        type: 'media',
      })
    })
  })

  it('searches music with an explicitly selected alternate source', async () => {
    const user = userEvent.setup()
    const { router } = await renderSearchBar()
    const input = await screen.findByPlaceholderText('搜索电影、剧集以及更多...')

    await user.type(input, 'Coldplay')
    const musicItem = getSearchItem('音乐')
    const musicGroup = within(musicItem).getByRole('group', { name: '音乐搜索数据源' })
    await user.click(within(musicGroup).getByRole('button', { name: '使用 TheAudioDB 搜索' }))
    await user.click(within(musicGroup).getByRole('button', { name: '使用 MusicBrainz 搜索' }))
    await user.click(musicItem)

    await waitFor(() => {
      expect(router.currentRoute.value.path).toBe('/music')
      expect(router.currentRoute.value.query).toEqual({
        query: 'Coldplay',
        media_source: 'theaudiodb',
      })
    })
  })

  it('searches music with multiple selected sources', async () => {
    const user = userEvent.setup()
    const { router } = await renderSearchBar()
    const input = await screen.findByPlaceholderText('搜索电影、剧集以及更多...')

    await user.type(input, 'Coldplay')
    const musicItem = getSearchItem('音乐')
    const musicGroup = within(musicItem).getByRole('group', { name: '音乐搜索数据源' })
    await user.click(within(musicGroup).getByRole('button', { name: '使用 TheAudioDB 搜索' }))
    await user.click(musicItem)

    await waitFor(() => {
      expect(router.currentRoute.value.path).toBe('/music')
      expect(router.currentRoute.value.query).toEqual({
        query: 'Coldplay',
        media_source: 'musicbrainz,theaudiodb',
      })
    })
  })

  it('renders the bundled music icon in the music search action', async () => {
    const user = userEvent.setup()
    await renderSearchBar()
    const input = await screen.findByPlaceholderText('搜索电影、剧集以及更多...')

    await user.type(input, '晴天')

    expect(getSearchItem('音乐').querySelector('[data-icon="mdi-music-note-outline"]')).not.toBeNull()
    expect(getSearchItem('音乐')).toHaveTextContent('歌曲、专辑或艺术家')
    expect(getSearchItem('音乐')).not.toHaveTextContent('搜索音乐元数据，并进入站点资源搜索、下载和订阅流程')
  })

  it('searches music sites directly by keyword without resolving a media identity', async () => {
    const user = userEvent.setup()
    const { router } = await renderSearchBar({ searchPermission: true })
    const input = await screen.findByPlaceholderText('搜索电影、剧集以及更多...')

    await user.type(input, '周杰伦')
    await user.click(getSearchItem('在站点中搜索音乐资源'))

    await waitFor(() => {
      expect(router.currentRoute.value.path).toBe('/resource')
      expect(router.currentRoute.value.query).toEqual({
        area: 'title',
        keyword: '周杰伦',
        result_type: 'torrent',
        sites: '11,99',
        type: '音乐',
      })
    })
    expect(mocks.apiGet).not.toHaveBeenCalledWith('site/media/music')
  })

  it('selects music-capable sites before searching by keyword', async () => {
    const user = userEvent.setup()
    const { router } = await renderSearchBar({ managePermission: true, searchPermission: true })
    const input = await screen.findByPlaceholderText('搜索电影、剧集以及更多...')

    await user.type(input, '周杰伦')
    const musicSiteItem = getSearchItem('在站点中搜索音乐资源')
    await user.click(within(musicSiteItem).getByRole('button', { name: '选择站点' }))

    await waitFor(() => expect(mocks.apiGet).toHaveBeenCalledWith('site/media/music'))
    expect(await screen.findByText('音乐站')).toBeInTheDocument()
    expect(screen.queryByText('停用音乐站')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '搜索' }))

    await waitFor(() => {
      expect(router.currentRoute.value.path).toBe('/resource')
      expect(router.currentRoute.value.query).toEqual({
        area: 'title',
        keyword: '周杰伦',
        result_type: 'torrent',
        sites: '11',
        type: '音乐',
      })
    })
  })

  it('searches actors with the selected supported source', async () => {
    const user = userEvent.setup()
    const { router } = await renderSearchBar()
    const input = await screen.findByPlaceholderText('搜索电影、剧集以及更多...')

    await user.type(input, '刘德华')
    const personItem = getSearchItem('演员')

    const personGroup = within(personItem).getByRole('group', { name: '演员搜索数据源' })
    // 追加选择豆瓣并取消默认的 TheMovieDb，仅保留豆瓣来源。
    await user.click(within(personGroup).getByRole('button', { name: '使用 豆瓣 搜索' }))
    await user.click(within(personGroup).getByRole('button', { name: '使用 TheMovieDb 搜索' }))
    await user.click(personItem)

    await waitFor(() => {
      expect(router.currentRoute.value.query).toEqual({
        media_source: 'douban',
        title: '刘德华',
        type: 'person',
      })
    })
  })
})
