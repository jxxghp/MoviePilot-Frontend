import type { MediaDataSource, MediaInfo, NotExistMediaInfo, Site, Subscribe, TmdbEpisode } from '@/api/types'
import vuetify from '@/plugins/vuetify'
import MediaDetailView from '@/views/discover/MediaDetailView.vue'
import { fireEvent, screen, waitFor, within } from '@testing-library/vue'
import { flushPromises } from '@vue/test-utils'
import userEvent from '@testing-library/user-event'
import {
  createEmptyMediaInfo,
  createMediaInfo,
  createMediaSeason,
  createNotExistMediaInfo,
  createTmdbEpisode,
} from '@tests/support/factories/media'
import { createSubscribe, createSubscribeSite, createSubscribeTv } from '@tests/support/factories/subscribe'
import {
  mediaDetailsHandler,
  mediaApiUrls,
  mediaEpisodeGroupsHandler,
  mediaExistsHandler,
  mediaGroupSeasonsHandler,
  mediaNotExistsHandler,
  mediaPlayHandler,
  mediaRemoteExistsHandler,
  tmdbSeasonEpisodesHandler,
} from '@tests/support/msw/handlers/media'
import {
  createSubscribeHandler,
  defaultSubscribeConfigHandler,
  querySubscribeByMediaHandler,
  subscribeListHandler,
} from '@tests/support/msw/handlers/subscribe'
import { server } from '@tests/support/msw/server'
import { renderWithProviders } from '@tests/support/render'
import { HttpResponse, http } from 'msw'
import { apiJson } from '@tests/support/msw/response'
import { defineComponent, h, type PropType } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  openDoubanApp: vi.fn(),
  openMediaServerItem: vi.fn(),
  openSharedDialog: vi.fn(),
  routerPush: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}))

vi.mock('vue-toastification', () => ({
  useToast: () => ({ error: mocks.toastError, success: mocks.toastSuccess }),
}))

vi.mock('@/router', () => ({
  default: {
    push: (...args: unknown[]) => mocks.routerPush(...args),
  },
}))

vi.mock('@/composables/useSharedDialog', () => ({
  openSharedDialog: (...args: unknown[]) => mocks.openSharedDialog(...args),
}))

vi.mock('@/utils/appDeepLink', () => ({
  openDoubanApp: (...args: unknown[]) => mocks.openDoubanApp(...args),
  openMediaServerItem: (...args: unknown[]) => mocks.openMediaServerItem(...args),
}))

const API_BASE_URL = 'http://localhost/api/v1/'
const movieSiteListUrl = new URL('site/media/movie', API_BASE_URL).href
const tvSiteListUrl = new URL('site/media/tv', API_BASE_URL).href
const selectedSitesUrl = new URL('system/setting/public/IndexerSites', API_BASE_URL).href

const PersonCardSlideViewStub = defineComponent({
  name: 'PersonCardSlideView',
  props: {
    apipath: String,
    linkurl: String,
    title: String,
    type: String,
  },
  setup(props) {
    return () => h('output', { 'aria-label': `人物入口 ${props.type}`, 'data-api-path': props.apipath }, props.linkurl)
  },
})

const MediaCardSlideViewStub = defineComponent({
  name: 'MediaCardSlideView',
  props: {
    apipath: String,
    linkurl: String,
    title: String,
  },
  setup(props) {
    return () => h('output', { 'aria-label': `媒体入口 ${props.title}`, 'data-api-path': props.apipath }, props.linkurl)
  },
})

const SearchSiteDialogStub = defineComponent({
  name: 'SearchSiteDialog',
  props: {
    selected: Array as PropType<number[]>,
    sites: Array as PropType<Site[]>,
  },
})

const VImgStub = defineComponent({
  name: 'VImg',
  props: {
    alt: String,
    src: String,
  },
  setup(props) {
    return () => h('img', { alt: props.alt || '', src: props.src })
  },
})

interface RenderDetailOptions {
  detailRequest?: (url: URL) => void
  detailStatus?: number
  episodeGroups?: Record<string, unknown>[]
  episodeGroupsRequest?: (url: URL) => void | Promise<void>
  episodeGroupsStatus?: number
  existsResponse?: { data?: Record<string, unknown>; message?: string; success: boolean }
  existsStatus?: number
  media?: MediaInfo
  mediaId?: string
  mediaSource?: MediaDataSource | null
  movieSubscribe?: Partial<Subscribe>
  notExists?: NotExistMediaInfo[]
  notExistsStatus?: number
  permissions?: Record<string, boolean>
  selectedSites?: number[]
  setupHandlers?: () => void
  sites?: Site[]
  subscribes?: Subscribe[]
  subscribesStatus?: number
  type?: string
}

function installSiteHandlers(sites: Site[] = [], selected: number[] = [], type = '电影') {
  server.use(
    http.get(type === '电视剧' ? tvSiteListUrl : movieSiteListUrl, () => apiJson(sites)),
    http.get(selectedSitesUrl, () => apiJson({ value: selected })),
  )
}

async function renderDetail(options: RenderDetailOptions = {}) {
  const media = options.media ?? createMediaInfo({ title: '详情测试电影', tmdb_id: 8101, type: '电影' })
  const mediaId = options.mediaId ?? String(media.media_id)
  const mediaSource =
    options.mediaSource === null ? undefined : (options.mediaSource ?? media.media_source ?? 'themoviedb')
  const type = options.type ?? media.type ?? '电影'
  const existsRequest = vi.fn()
  const subscribeRequest = vi.fn()
  server.use(
    mediaDetailsHandler(mediaId, media, options.detailStatus, options.detailRequest),
    mediaExistsHandler(
      options.existsResponse ?? { data: { item: {} }, success: true },
      options.existsStatus,
      existsRequest,
    ),
    mediaNotExistsHandler(options.notExists ?? [], options.notExistsStatus),
    subscribeListHandler(options.subscribes ?? [], options.subscribesStatus, subscribeRequest),
    querySubscribeByMediaHandler(mediaId, options.movieSubscribe ?? {}, 200, subscribeRequest),
  )
  if (media.tmdb_id) {
    server.use(
      mediaEpisodeGroupsHandler(
        media.tmdb_id,
        options.episodeGroups ?? [],
        options.episodeGroupsStatus,
        options.episodeGroupsRequest,
      ),
    )
  }
  options.setupHandlers?.()
  installSiteHandlers(options.sites, options.selectedSites, type)

  const result = await renderWithProviders(MediaDetailView, {
    initialState: {
      globalSettings: {
        data: {
          GLOBAL_IMAGE_CACHE: false,
          TMDB_IMAGE_DOMAIN: 'image.tmdb.example.com',
        },
      },
      user: {
        permissions: options.permissions ?? {
          discovery: true,
          manage: false,
          search: true,
          subscribe: true,
        },
        superUser: false,
      },
    },
    props: {
      mediaId,
      mediaSource,
      title: media.title,
      type,
      year: media.year,
    },
    global: {
      stubs: {
        MediaCardSlideView: MediaCardSlideViewStub,
        PersonCardSlideView: PersonCardSlideViewStub,
        SearchSiteDialog: SearchSiteDialogStub,
        VImg: VImgStub,
      },
    },
  })

  const recognized = Boolean(media.media_source && media.media_id)
  if (recognized && (options.detailStatus ?? 200) < 400) {
    await waitFor(() => {
      expect(existsRequest).toHaveBeenCalledOnce()
      expect(subscribeRequest).toHaveBeenCalledOnce()
    })
    if (type === '电视剧') await flushPromises()
  }

  return result
}

function createDeferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => {
    resolve = done
  })
  return { promise, resolve }
}

describe('MediaDetailView detail and actions', () => {
  beforeEach(() => {
    mocks.openSharedDialog.mockReturnValue({ close: vi.fn(), id: 1, updateProps: vi.fn() })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  it.each([
    ['TMDB', '8201', createMediaInfo({ tmdb_id: 8201, type: '电影' })],
    [
      'Douban',
      'db-8202',
      createMediaInfo({
        douban_id: 'db-8202',
        media_id: 'db-8202',
        media_source: 'douban',
        tmdb_id: undefined,
        type: '电影',
      }),
    ],
    [
      'Bangumi',
      '8203',
      createMediaInfo({
        bangumi_id: '8203',
        media_id: '8203',
        media_source: 'bangumi',
        tmdb_id: undefined,
        type: '电视剧',
      }),
    ],
    [
      'AniList',
      '154587',
      createMediaInfo({
        anilist_id: 154587,
        media_id: '154587',
        media_source: 'anilist',
        tmdb_id: undefined,
        type: '电视剧',
      }),
    ],
    [
      'Bilibili',
      'item-8204',
      createMediaInfo({ media_id: 'item-8204', media_source: 'bilibili', tmdb_id: 8204, type: '电影' }),
    ],
  ])('loads the exact %s media path and query', async (_source, mediaId, media) => {
    const requested = vi.fn<(url: URL) => void>()
    await renderDetail({ detailRequest: requested, media, mediaId })

    expect(await screen.findByRole('heading', { name: new RegExp(media.title || '') })).toBeInTheDocument()
    await waitFor(() => expect(requested).toHaveBeenCalledOnce())
    expect(requested.mock.calls[0][0].pathname).toBe(`/api/v1/media/${mediaId}`)
    expect(Object.fromEntries(requested.mock.calls[0][0].searchParams)).toEqual({
      media_source: media.media_source,
      type_name: media.type,
    })
  })

  it('applies the glass backdrop fade treatment in the glass theme', async () => {
    const previousTheme = vuetify.theme.global.name.value

    try {
      vuetify.theme.global.name.value = 'glass'
      const { container } = await renderDetail()

      expect(await screen.findByRole('heading', { name: /详情测试电影/ })).toBeInTheDocument()
      expect(container.querySelector('.media-detail-glass')).toBeInTheDocument()
      expect(container.querySelector('.media-detail-transparent')).not.toBeInTheDocument()
    } finally {
      vuetify.theme.global.name.value = previousTheme
    }
  })

  it('renders legal empty media separately from loading', async () => {
    const empty = createEmptyMediaInfo()
    await renderDetail({ media: empty, mediaId: '8301', type: '电影' })

    expect(await screen.findByText('未识别到媒体信息。')).toBeInTheDocument()
    expect(screen.queryByText('加载中')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '重试' })).not.toBeInTheDocument()
  })

  it('settles a detail route without a complete media identity without sending a request', async () => {
    const requested = vi.fn()
    await renderDetail({
      detailRequest: requested,
      media: createEmptyMediaInfo(),
      mediaId: '8300',
      mediaSource: null,
      type: '电影',
    })

    expect(await screen.findByText('未识别到媒体信息。')).toBeInTheDocument()
    expect(screen.queryByText('加载中')).not.toBeInTheDocument()
    expect(requested).not.toHaveBeenCalled()
  })

  it('shows a distinct retryable error when detail loading fails', async () => {
    const requested = vi.fn()
    await renderDetail({
      detailRequest: requested,
      detailStatus: 500,
      media: createEmptyMediaInfo(),
      mediaId: '8302',
      type: '电影',
    })

    expect(await screen.findByText('无法获取到媒体信息，请检查网络连接。')).toBeInTheDocument()
    expect(screen.queryByText('未识别到媒体信息。')).not.toBeInTheDocument()
    expect(requested).toHaveBeenCalledOnce()

    const existsRequested = vi.fn()
    const subscribeRequested = vi.fn()
    server.use(
      mediaDetailsHandler('8302', createMediaInfo({ title: '重试成功', tmdb_id: 8302 })),
      mediaExistsHandler({ data: { item: {} }, success: true }, 200, existsRequested),
      querySubscribeByMediaHandler('8302', {}, 200, subscribeRequested),
    )
    await fireEvent.click(screen.getByRole('button', { name: '重试' }))

    expect(await screen.findByRole('heading', { name: /重试成功/ })).toBeInTheDocument()
    await waitFor(() => {
      expect(existsRequested).toHaveBeenCalledOnce()
      expect(subscribeRequested).toHaveBeenCalledOnce()
    })
    expect(requested).toHaveBeenCalledOnce()
  })

  it('renders source links and exact recommendation paths', async () => {
    const media = createMediaInfo({
      backdrop_path: undefined,
      douban_id: 'db-8401',
      genres: [{ name: '剧情' }] as unknown as string[],
      imdb_id: 'tt08401',
      poster_path: '/images/link-movie.jpg',
      production_companies: [{ name: '测试制片厂' }],
      production_countries: [{ name: '中国大陆' }],
      release_dates: [
        { date: '2026-04-10', iso_code: 'US', type: 4 },
        { date: '2026-04-01', iso_code: 'CN', type: 4 },
        { date: '2026-05-01', iso_code: 'US', type: 5 },
      ],
      runtime: 120,
      title: '链接电影',
      tmdb_id: 8401,
      tvdb_id: 'tvdb-8401',
      type: '电影',
      year: 2025,
    })
    await renderDetail({ media })

    expect(await screen.findByRole('heading', { name: /链接电影/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /TheMovieDb/ })).toHaveAttribute(
      'href',
      'https://www.themoviedb.org/movie/8401',
    )
    expect(screen.getByRole('link', { name: /IMDb/ })).toHaveAttribute('href', 'https://www.imdb.com/title/tt08401')
    expect(screen.getByRole('link', { name: /TheTvDb/ })).toHaveAttribute(
      'href',
      'https://www.thetvdb.com/series/tvdb-8401',
    )
    expect(screen.getByText(/120 分钟/)).toBeInTheDocument()
    expect(screen.getByText('剧情')).toBeInTheDocument()
    expect(screen.getByText('测试制片厂')).toBeInTheDocument()
    expect(screen.getByText('2026-04-01')).toBeInTheDocument()
    expect(screen.getByText('2026-05-01')).toBeInTheDocument()
    expect(screen.getByLabelText('人物入口 tmdb')).toHaveAttribute('data-api-path', 'tmdb/credits/8401/电影')
    expect(screen.getByLabelText('媒体入口 推荐')).toHaveAttribute('data-api-path', 'tmdb/recommend/8401/电影')
    expect(screen.getByLabelText('媒体入口 类似')).toHaveAttribute('data-api-path', 'tmdb/similar/8401/电影')

    await fireEvent.click(screen.getByText('豆瓣'))
    expect(mocks.openDoubanApp).toHaveBeenCalledWith('db-8401', '电影', '链接电影', '2025')
  })

  it('uses tvdb_slug for TheTvDb link when available, falls back to tvdb_id', async () => {
    // 有 slug 时使用 slug
    const mediaWithSlug = createMediaInfo({
      title: '有 Slug 的剧集',
      tvdb_id: '460322',
      tvdb_slug: 'speed-and-love',
      type: '电视剧',
    })
    await renderDetail({ media: mediaWithSlug, mediaId: '1', type: '电视剧' })
    expect(screen.getByRole('link', { name: /TheTvDb/ })).toHaveAttribute(
      'href',
      'https://www.thetvdb.com/series/speed-and-love',
    )
  })

  it('renders Douban-only facts, deep link, image, credits, and recommendations', async () => {
    const media = createMediaInfo({
      backdrop_path: 'https://images.example.com/douban-backdrop.jpg',
      douban_id: 'db-8402',
      media_id: 'db-8402',
      media_source: 'douban',
      original_title: 'Douban Original',
      poster_path: 'https://images.example.com/douban-poster.jpg',
      production_countries: [{ name: '中国大陆' }],
      release_date: '2026-02-02',
      title: '豆瓣独立电影',
      tmdb_id: undefined,
      type: '电影',
    })
    const { container } = await renderDetail({ media, mediaId: 'db-8402' })

    expect(await screen.findByRole('heading', { name: /豆瓣独立电影/ })).toBeInTheDocument()
    expect(screen.getByText('Douban Original')).toBeInTheDocument()
    expect(screen.getByText('2026-02-02')).toBeInTheDocument()
    expect(screen.getByText('中国大陆')).toBeInTheDocument()
    expect(container.querySelector('.media-poster img')).toHaveAttribute(
      'src',
      'https://images.example.com/douban-poster.jpg',
    )
    expect(screen.getByLabelText('人物入口 douban')).toHaveAttribute('data-api-path', 'douban/credits/db-8402/电影')
    expect(screen.getByLabelText('媒体入口 推荐')).toHaveAttribute('data-api-path', 'douban/recommend/db-8402/电影')

    await fireEvent.click(screen.getByText('豆瓣'))
    expect(mocks.openDoubanApp).toHaveBeenCalledWith('db-8402', '电影', '豆瓣独立电影', '2026')
  })

  it('renders Bangumi-only facts, external link, credits, and recommendations', async () => {
    const media = createMediaInfo({
      bangumi_id: '8403',
      media_id: '8403',
      media_source: 'bangumi',
      original_title: 'Bangumi Original',
      release_date: '2026-03-03',
      title: 'Bangumi 独立条目',
      tmdb_id: undefined,
      type: '电视剧',
    })
    await renderDetail({ media, mediaId: '8403', type: '电视剧' })

    expect(await screen.findByRole('heading', { name: /Bangumi 独立条目/ })).toBeInTheDocument()
    expect(screen.getByText('Bangumi Original')).toBeInTheDocument()
    expect(screen.getByText('2026-03-03')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Bangumi/ })).toHaveAttribute('href', 'https://bgm.tv/subject/8403')
    expect(screen.getByLabelText('人物入口 bangumi')).toHaveAttribute('data-api-path', 'bangumi/credits/8403')
    expect(screen.getByLabelText('媒体入口 推荐')).toHaveAttribute('data-api-path', 'bangumi/recommend/8403')
    expect(screen.queryByLabelText('媒体入口 类似')).not.toBeInTheDocument()
  })

  it('renders AniList-only facts, external link, credits, and recommendations', async () => {
    const media = createMediaInfo({
      anilist_id: 154587,
      media_id: '154587',
      media_source: 'anilist',
      original_title: '葬送のフリーレン',
      release_date: '2023-09-29',
      title: '葬送的芙莉莲',
      tmdb_id: undefined,
      type: '电视剧',
    })
    await renderDetail({ media, mediaId: '154587', type: '电视剧' })

    expect(await screen.findByRole('heading', { name: /葬送的芙莉莲/ })).toBeInTheDocument()
    expect(screen.getByText('葬送のフリーレン')).toBeInTheDocument()
    expect(screen.getByText('2023-09-29')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /AniList/ })).toHaveAttribute('href', 'https://anilist.co/anime/154587')
    expect(screen.getByLabelText('人物入口 anilist')).toHaveAttribute('data-api-path', 'anilist/credits/154587')
    expect(screen.getByLabelText('媒体入口 推荐')).toHaveAttribute('data-api-path', 'anilist/recommend/154587')
    expect(screen.queryByLabelText('媒体入口 类似')).not.toBeInTheDocument()
  })

  it('hides search and subscribe actions without permissions', async () => {
    await renderDetail({ permissions: { discovery: true, manage: false, search: false, subscribe: false } })

    expect(await screen.findByRole('heading', { name: /详情测试电影/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /搜索资源/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /搜索字幕/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^订阅$/ })).not.toBeInTheDocument()
  })

  it('routes subtitle searches directly when no sites are enabled', async () => {
    const media = createMediaInfo({ season: 2, title: '字幕剧', tmdb_id: 8501, type: '电视剧' })
    await renderDetail({ media, type: '电视剧' })

    await fireEvent.click(await screen.findByRole('button', { name: /搜索字幕/ }))

    await waitFor(() => expect(mocks.routerPush).toHaveBeenCalledOnce())
    expect(mocks.routerPush).toHaveBeenCalledWith({
      path: '/resource',
      query: {
        area: 'title',
        episode: null,
        media_id: '8501',
        media_source: 'themoviedb',
        result_type: 'subtitle',
        season: 2,
        sites: '',
        title: '字幕剧',
        type: '电视剧',
        year: '2026',
      },
    })
  })

  it('routes IMDb resource searches with torrent result semantics', async () => {
    const user = userEvent.setup()
    const media = createMediaInfo({ imdb_id: 'tt08502', season: 3, title: '资源剧', tmdb_id: 8502, type: '电视剧' })
    await renderDetail({ media, type: '电视剧' })

    await user.click(await screen.findByRole('button', { name: /搜索资源/ }))
    await user.click(await screen.findByText('IMDB链接'))

    await waitFor(() => expect(mocks.routerPush).toHaveBeenCalledOnce())
    expect(mocks.routerPush).toHaveBeenCalledWith({
      path: '/resource',
      query: {
        area: 'imdbid',
        episode: null,
        media_id: '8502',
        media_source: 'themoviedb',
        result_type: 'torrent',
        season: 3,
        sites: '',
        title: '资源剧',
        type: '电视剧',
        year: '2026',
      },
    })
  })

  it('opens site selection and routes with the selected sites', async () => {
    const site = createSubscribeSite({ id: 91, is_active: true, name: '搜索站点' })
    await renderDetail({ selectedSites: [91], sites: [site] })

    await fireEvent.click(await screen.findByRole('button', { name: /搜索字幕/ }))

    await waitFor(() => expect(mocks.openSharedDialog).toHaveBeenCalledOnce())
    const [, props, events] = mocks.openSharedDialog.mock.calls[0] as [
      unknown,
      { selected: number[]; sites: Site[] },
      { search: (sites: number[]) => void },
    ]
    expect(props).toEqual({ selected: [91], sites: [site] })

    events.search([91])
    expect(mocks.routerPush).toHaveBeenCalledWith(
      expect.objectContaining({
        query: expect.objectContaining({ result_type: 'subtitle', sites: '91' }),
      }),
    )
  })

  it('continues to resource search when site settings fail to load', async () => {
    await renderDetail()
    server.use(
      http.get(movieSiteListUrl, () => HttpResponse.json({ message: '站点失败' }, { status: 500 })),
      http.get(selectedSitesUrl, () => HttpResponse.json({ message: '设置失败' }, { status: 500 })),
    )

    await fireEvent.click(screen.getByRole('button', { name: /搜索字幕/ }))

    await waitFor(() => expect(mocks.routerPush).toHaveBeenCalledOnce())
    expect(mocks.openSharedDialog).not.toHaveBeenCalled()
  })

  it('opens site selection with an empty selection when the setting has no value', async () => {
    const site = createSubscribeSite({ id: 92, is_active: true, name: '空设置站点' })
    await renderDetail()
    server.use(
      http.get(movieSiteListUrl, () => apiJson([site])),
      http.get(selectedSitesUrl, () => apiJson({})),
    )

    await fireEvent.click(screen.getByRole('button', { name: /搜索字幕/ }))

    await waitFor(() => expect(mocks.openSharedDialog).toHaveBeenCalledOnce())
    const [, props] = mocks.openSharedDialog.mock.calls[0] as [unknown, { selected: number[]; sites: Site[] }]
    expect(props).toEqual(expect.objectContaining({ selected: [], sites: [site] }))
  })

  it('opens the media server only for a successful play response', async () => {
    const user = userEvent.setup()
    server.use(
      mediaPlayHandler('library-8601', {
        data: {
          item_id: 'item-8601',
          server_id: 'server-1',
          server_type: 'emby',
          url: 'https://media.example.com/play/8601',
        },
        success: true,
      }),
    )
    await renderDetail({ existsResponse: { data: { item: { id: 'library-8601' } }, success: true } })

    await user.click(await screen.findByRole('button', { name: /在线播放/ }))

    await waitFor(() =>
      expect(mocks.openMediaServerItem).toHaveBeenCalledWith({
        item_id: 'item-8601',
        link: 'https://media.example.com/play/8601',
        server_id: 'server-1',
        server_type: 'emby',
      }),
    )
    expect(mocks.toastError).not.toHaveBeenCalled()
  })

  it('shows the backend message for a rejected play response', async () => {
    server.use(mediaPlayHandler('library-8602', { message: '未找到播放地址', success: false }))
    await renderDetail({ existsResponse: { data: { item: { id: 'library-8602' } }, success: true } })

    await fireEvent.click(await screen.findByRole('button', { name: /在线播放/ }))

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('获取播放链接失败：未找到播放地址！'))
    expect(mocks.openMediaServerItem).not.toHaveBeenCalled()
  })

  it('shows a user-visible error when the play request fails over HTTP', async () => {
    server.use(mediaPlayHandler('library-8603', { message: '服务异常', success: false }, 500))
    await renderDetail({ existsResponse: { data: { item: { id: 'library-8603' } }, success: true } })

    await fireEvent.click(await screen.findByRole('button', { name: /在线播放/ }))

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('获取播放链接失败！'))
    expect(mocks.openMediaServerItem).not.toHaveBeenCalled()
  })
})

describe('MediaDetailView subscriptions, seasons, and episode groups', () => {
  beforeEach(() => {
    mocks.openSharedDialog.mockReturnValue({ close: vi.fn(), id: 1, updateProps: vi.fn() })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  it('does not query TMDB episode groups for an AniList detail with an auxiliary TMDB ID', async () => {
    const episodeGroupsRequest = vi.fn()
    const groupSeasonsRequest = vi.fn()
    const media = createSubscribeTv({
      anilist_id: 154587,
      episode_group: 'auxiliary-group',
      media_id: '154587',
      media_source: 'anilist',
      title: 'AniList 主来源剧集',
      tmdb_id: 8700,
    })

    await renderDetail({
      episodeGroupsRequest,
      media,
      mediaId: '154587',
      setupHandlers: () => {
        server.use(mediaGroupSeasonsHandler('auxiliary-group', [], 200, groupSeasonsRequest))
      },
      type: '电视剧',
    })

    expect(await screen.findByRole('heading', { name: /AniList 主来源剧集/ })).toBeInTheDocument()
    await flushPromises()
    expect(episodeGroupsRequest).not.toHaveBeenCalled()
    expect(groupSeasonsRequest).not.toHaveBeenCalled()
  })

  it('shows the current movie subscription state returned by the media endpoint', async () => {
    const media = createMediaInfo({ title: '已订阅电影', tmdb_id: 8701, type: '电影' })
    const subscribe = createSubscribe({ id: 18701, media_id: '8701', name: media.title, type: '电影' })

    await renderDetail({ media, movieSubscribe: subscribe })

    expect(await screen.findByRole('button', { name: /已订阅/ })).toBeInTheDocument()
  })

  it('does not report all default seasons subscribed when an extra season replaces a missing one', async () => {
    const media = createSubscribeTv({
      season_info: [createMediaSeason({ season_number: 1 }), createMediaSeason({ season_number: 2 })],
      title: '集合判断剧',
      tmdb_id: 8702,
    })
    const subscribes = [
      createSubscribe({ media_id: '8702', season: 1, type: '电视剧' }),
      createSubscribe({ media_id: '8702', season: 99, type: '电视剧' }),
    ]

    await renderDetail({ media, subscribes, type: '电视剧' })

    expect(await screen.findByRole('button', { name: /已订阅 2 季/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /已全部订阅/ })).not.toBeInTheDocument()
  })

  it('requires every default season including S00 before reporting all seasons subscribed', async () => {
    const media = createSubscribeTv({
      season_info: [
        createMediaSeason({ name: '特别篇', season_number: 0 }),
        createMediaSeason({ season_number: 1 }),
        createMediaSeason({ season_number: 2 }),
      ],
      title: '全季订阅剧',
      tmdb_id: 8703,
    })
    const subscribes = [0, 1, 2].map(season => createSubscribe({ media_id: '8703', season, type: '电视剧' }))

    await renderDetail({ media, subscribes, type: '电视剧' })

    expect(await screen.findByRole('button', { name: /已全部订阅/ })).toBeInTheDocument()
  })

  it('does not report all seasons subscribed when S00 is missing', async () => {
    const media = createSubscribeTv({
      season_info: [
        createMediaSeason({ name: '特别篇', season_number: 0 }),
        createMediaSeason({ season_number: 1 }),
        createMediaSeason({ season_number: 2 }),
      ],
      title: '缺少特别篇订阅剧',
      tmdb_id: 8709,
    })
    const subscribes = [1, 2, 99].map(season => createSubscribe({ media_id: '8709', season, type: '电视剧' }))

    await renderDetail({ media, subscribes, type: '电视剧' })

    expect(await screen.findByRole('button', { name: /已订阅 3 季/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /已全部订阅/ })).not.toBeInTheDocument()
  })

  it('sorts S00 last and maps complete, partial, and missing season states', async () => {
    const media = createSubscribeTv({
      season_info: [
        createMediaSeason({ episode_count: 2, name: '特别篇', season_number: 0 }),
        createMediaSeason({ episode_count: 2, season_number: 2 }),
        createMediaSeason({ episode_count: 2, season_number: 1 }),
      ],
      title: '缺失状态剧',
      tmdb_id: 8704,
    })
    const notExists = [
      createNotExistMediaInfo({ episodes: [], season: 0, total_episode: 2 }),
      createNotExistMediaInfo({ episodes: [2], season: 1, total_episode: 2 }),
      createNotExistMediaInfo({ episodes: [1, 2], season: 2, total_episode: 2 }),
    ]
    const { container } = await renderDetail({ media, notExists, type: '电视剧' })

    await waitFor(() => {
      const panels = [...container.querySelectorAll<HTMLElement>('.v-expansion-panel')]
      expect(panels).toHaveLength(3)
      expect(panels.map(panel => panel.textContent)).toEqual([
        expect.stringMatching(/第 1 季.*部分缺失/s),
        expect.stringMatching(/第 2 季.*已入库/s),
        expect.stringMatching(/特别篇.*缺失/s),
      ])
    })
  })

  it('hides the status badge for a season with zero episodes', async () => {
    const media = createSubscribeTv({
      season_info: [
        createMediaSeason({ episode_count: 0, season_number: 1 }),
        createMediaSeason({ episode_count: 2, season_number: 2 }),
      ],
      title: '零集数状态剧',
      tmdb_id: 8710,
    })
    const notExists = [createNotExistMediaInfo({ episodes: [1, 2], season: 2, total_episode: 2 })]
    const { container } = await renderDetail({ media, notExists, type: '电视剧' })

    await waitFor(() => {
      const panels = [...container.querySelectorAll<HTMLElement>('.v-expansion-panel')]
      expect(panels).toHaveLength(2)
      // 集数为 0 的季不渲染任何存在状态标签
      expect(panels[0].textContent).toMatch(/第 1 季/)
      expect(panels[0].textContent).not.toMatch(/已入库|缺失/)
      expect(panels[1].textContent).toMatch(/第 2 季.*已入库/s)
    })
  })

  it('loads season episodes and marks episodes that already exist remotely', async () => {
    const media = createSubscribeTv({
      season_info: [createMediaSeason({ episode_count: 2, season_number: 1 })],
      title: '季集加载剧',
      tmdb_id: 8705,
    })
    const episodeRequest = vi.fn<(url: URL) => void>()
    const existsRequest = vi.fn<(payload: Record<string, unknown>) => void>()
    const { container } = await renderDetail({ media, type: '电视剧' })
    server.use(
      tmdbSeasonEpisodesHandler(
        8705,
        1,
        [
          createTmdbEpisode({ episode_number: 1, name: '已入库第一集', season_number: 1, still_path: '/still-1.jpg' }),
          createTmdbEpisode({ episode_number: 2, name: '缺失第二集', season_number: 1 }),
        ],
        200,
        episodeRequest,
      ),
      mediaRemoteExistsHandler({ 1: [1] }, 200, existsRequest),
    )

    await fireEvent.click(container.querySelector('.v-expansion-panel-title') as HTMLElement)

    expect(await screen.findByRole('heading', { name: '1 - 已入库第一集' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '2 - 缺失第二集' })).toBeInTheDocument()
    expect(container.querySelector('.episode-info + img')).toHaveAttribute(
      'src',
      'https://image.tmdb.example.com/t/p/w500/still-1.jpg',
    )
    await waitFor(() => expect(container.querySelectorAll('.episode-exists-badge')).toHaveLength(1))
    expect(episodeRequest).toHaveBeenCalledOnce()
    expect(episodeRequest.mock.calls[0][0].searchParams.get('episode_group')).toBeNull()
    expect(existsRequest).toHaveBeenCalledWith(expect.objectContaining({ episode_group: '' }))

    await fireEvent.click(container.querySelector('.v-expansion-panel-title') as HTMLElement)
    await flushPromises()
    expect(episodeRequest).toHaveBeenCalledOnce()
    expect(existsRequest).toHaveBeenCalledOnce()
  })

  it('opens the season subscription dialog with the selected season and episode group', async () => {
    const media = createSubscribeTv({
      season_info: [createMediaSeason({ season_number: 1 })],
      title: '逐季订阅剧',
      tmdb_id: 8706,
    })
    server.use(defaultSubscribeConfigHandler('电视剧', { show_edit_dialog: false }))
    const { container } = await renderDetail({ media, type: '电视剧' })
    const seasonPanel = container.querySelector('.v-expansion-panel') as HTMLElement
    const seasonAction = seasonPanel.querySelector('.v-btn') as HTMLElement

    await fireEvent.click(seasonAction)

    await waitFor(() => expect(mocks.openSharedDialog).toHaveBeenCalledOnce())
    const [, props] = mocks.openSharedDialog.mock.calls[0] as [
      unknown,
      { initialEpisodeGroup: string; selectedSeason: number },
    ]
    expect(props).toEqual(
      expect.objectContaining({
        initialEpisodeGroup: '',
        selectedSeason: 1,
      }),
    )
  })

  it('refreshes the current movie subscription state after removal from the edit dialog', async () => {
    const media = createMediaInfo({ title: '编辑后刷新电影', tmdb_id: 8713, type: '电影' })
    const refreshed = vi.fn()
    await renderDetail({ media })
    server.use(
      querySubscribeByMediaHandler('8713', {}, 200, refreshed),
      createSubscribeHandler({ data: { id: 18713 }, success: true }),
      defaultSubscribeConfigHandler('电影', { show_edit_dialog: true }),
    )

    await fireEvent.click(screen.getByRole('button', { name: /^订阅$/ }))

    await waitFor(() => expect(mocks.openSharedDialog).toHaveBeenCalledOnce())
    const [, , events] = mocks.openSharedDialog.mock.calls[0] as [unknown, unknown, { remove: () => void }]
    events.remove()

    await waitFor(() => expect(refreshed).toHaveBeenCalledOnce())
  })

  it('refreshes TV season subscriptions after removal from the edit dialog', async () => {
    const media = createSubscribeTv({
      season_info: [createMediaSeason({ season_number: 1 })],
      title: '编辑后刷新电视剧',
      tmdb_id: 8714,
    })
    await renderDetail({ media, type: '电视剧' })
    server.use(
      createSubscribeHandler({ data: { id: 18714 }, success: true }),
      defaultSubscribeConfigHandler('电视剧', { show_edit_dialog: true }),
    )

    await fireEvent.click(screen.getByRole('button', { name: /^订阅$/ }))
    await waitFor(() => expect(mocks.openSharedDialog).toHaveBeenCalledOnce())
    const [, , seasonEvents] = mocks.openSharedDialog.mock.calls[0] as [
      unknown,
      unknown,
      {
        subscribe: (
          seasons: ReturnType<typeof createMediaSeason>[],
          states: Record<number, number>,
          group: string,
          mode: string,
          visible: number[],
        ) => void
      },
    ]
    seasonEvents.subscribe([media.season_info![0]], {}, '', 'normal', [1])
    await waitFor(() => expect(mocks.openSharedDialog).toHaveBeenCalledTimes(2))

    const refreshed = vi.fn()
    server.use(subscribeListHandler([], 200, refreshed))
    const [, , editEvents] = mocks.openSharedDialog.mock.calls[1] as [unknown, unknown, { remove: () => void }]
    editEvents.remove()

    await waitFor(() => expect(refreshed).toHaveBeenCalledOnce())
  })

  it('keeps the TV detail visible when auxiliary status requests fail', async () => {
    const media = createSubscribeTv({
      season_info: [createMediaSeason({ season_number: 1 })],
      title: '辅助请求失败剧',
      tmdb_id: 8715,
    })

    const { container } = await renderDetail({
      episodeGroupsStatus: 500,
      existsStatus: 500,
      media,
      notExistsStatus: 500,
      subscribesStatus: 500,
      type: '电视剧',
    })

    expect(screen.getByRole('heading', { name: /辅助请求失败剧/ })).toBeInTheDocument()
    expect(container.querySelector('.v-expansion-panel')).toHaveTextContent('第 1 季')
    expect(screen.queryByText('无法获取到媒体信息，请检查网络连接。')).not.toBeInTheDocument()
  })

  it('renders incomplete TV metadata without a season list', async () => {
    const media = createSubscribeTv({
      episode_run_time: ['45'],
      genres: undefined,
      season_info: undefined,
      title: '季信息待补全剧',
      tmdb_id: 8717,
    })
    const { container } = await renderDetail({ media, type: '电视剧' })

    expect(screen.getByRole('heading', { name: /季信息待补全剧/ })).toBeInTheDocument()
    expect(screen.getByText(/45 分钟/)).toBeInTheDocument()
    expect(container.querySelector('.v-expansion-panel')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^订阅$/ })).toBeInTheDocument()
  })

  it('switches episode groups and sends the selected group in missing-state requests', async () => {
    const media = createSubscribeTv({
      season_info: [createMediaSeason({ season_number: 1 })],
      title: '剧集组切换剧',
      tmdb_id: 8707,
    })
    const group = { episode_count: 8, group_count: 1, id: 'group-a', name: '剪辑组 A' }
    const missingRequest = vi.fn<(payload: Record<string, unknown>) => void>()
    server.use(mediaGroupSeasonsHandler('group-a', [createMediaSeason({ name: 'A 组第一季', season_number: 1 })]))
    const { container } = await renderDetail({ episodeGroups: [group], media, type: '电视剧' })
    server.use(mediaNotExistsHandler([], 200, missingRequest))

    await fireEvent.click(screen.getByRole('button', { name: /剪辑组 A/ }))

    expect(await screen.findByText(/当前：剪辑组 A/)).toBeInTheDocument()
    await waitFor(() => expect(container.querySelector('.v-expansion-panel')).toBeInTheDocument())
    expect(
      within(container.querySelector('.v-expansion-panel') as HTMLElement).getByText('第 1 季'),
    ).toBeInTheDocument()
    expect(missingRequest).toHaveBeenCalledWith(expect.objectContaining({ episode_group: 'group-a' }), expect.any(URL))
    await flushPromises()
  })

  it('loads the backend default episode group and restores default seasons when switching back', async () => {
    const media = createSubscribeTv({
      episode_group: 'group-a',
      season_info: [createMediaSeason({ season_number: 1 })],
      title: '默认剧集组剧',
      tmdb_id: 8710,
    })
    const group = { episode_count: 8, group_count: 1, id: 'group-a', name: '后端默认组' }
    const groupSeasonRequest = vi.fn()
    const { container } = await renderDetail({
      episodeGroups: [group],
      media,
      setupHandlers: () => {
        server.use(
          mediaGroupSeasonsHandler(
            'group-a',
            [createMediaSeason({ name: '默认组第二季', season_number: 2 })],
            200,
            groupSeasonRequest,
          ),
        )
      },
      type: '电视剧',
    })

    expect(await screen.findByText(/当前：后端默认组/)).toBeInTheDocument()
    await waitFor(() => expect(groupSeasonRequest).toHaveBeenCalledOnce())
    await waitFor(() => expect(container.querySelector('.v-expansion-panel')).toHaveTextContent('第 2 季'))

    await fireEvent.click(
      within(container.querySelector('.episode-group-selector') as HTMLElement).getByRole('button', { name: /^默认/ }),
    )

    expect(await screen.findByText(/当前：默认/)).toBeInTheDocument()
    await waitFor(() => expect(container.querySelector('.v-expansion-panel')).toHaveTextContent('第 1 季'))
    await flushPromises()
  })

  it('keeps loaded group seasons without repeating the request when the selected group is clicked again', async () => {
    const media = createSubscribeTv({
      season_info: [createMediaSeason({ season_number: 1 })],
      title: '剧集组重复点击剧',
      tmdb_id: 8716,
    })
    const group = { episode_count: 8, group_count: 1, id: 'group-a', name: '稳定组' }
    const groupSeasonRequest = vi.fn()
    const { container } = await renderDetail({
      episodeGroups: [group],
      media,
      setupHandlers: () => {
        server.use(
          mediaGroupSeasonsHandler(
            'group-a',
            [createMediaSeason({ name: '稳定组第二季', season_number: 2 })],
            200,
            groupSeasonRequest,
          ),
        )
      },
      type: '电视剧',
    })

    await fireEvent.click(screen.getByRole('button', { name: /稳定组/ }))
    await waitFor(() => expect(groupSeasonRequest).toHaveBeenCalledOnce())
    await waitFor(() => expect(container.querySelector('.v-expansion-panel')).toHaveTextContent('第 2 季'))
    await fireEvent.click(screen.getByRole('button', { name: /稳定组/ }))
    await flushPromises()

    expect(groupSeasonRequest).toHaveBeenCalledOnce()
    expect(screen.getByText(/当前：稳定组/)).toBeInTheDocument()
    expect(container.querySelector('.v-expansion-panel')).toHaveTextContent('第 2 季')
  })

  it('scrolls the episode-group rail in both directions', async () => {
    const media = createSubscribeTv({
      season_info: [createMediaSeason({ season_number: 1 })],
      title: '剧集组滚动剧',
      tmdb_id: 8718,
    })
    const groups = Array.from({ length: 5 }, (_, index) => ({
      episode_count: 8 + index,
      group_count: 1,
      id: `group-${index}`,
      name: `剧集组 ${index}`,
    }))
    const user = userEvent.setup()
    const { container } = await renderDetail({ episodeGroups: groups, media, type: '电视剧' })
    const rail = container.querySelector<HTMLElement>('.episode-group-rail')
    expect(rail).not.toBeNull()
    Object.defineProperties(rail, {
      clientWidth: { configurable: true, value: 400 },
      scrollLeft: { configurable: true, value: 0, writable: true },
      scrollWidth: { configurable: true, value: 1000 },
    })
    rail!.scrollBy = vi.fn()
    await fireEvent.scroll(rail as HTMLElement)

    await user.click(screen.getByRole('button', { name: '查看更多剧集组' }))
    expect(rail!.scrollBy).toHaveBeenCalledWith({ behavior: 'smooth', left: 288 })

    rail!.scrollLeft = 300
    await fireEvent.scroll(rail as HTMLElement)
    await user.click(screen.getByRole('button', { name: '查看上一组剧集组' }))
    expect(rail!.scrollBy).toHaveBeenCalledWith({ behavior: 'smooth', left: -288 })
  })

  it('ignores stale episode-group seasons after a newer group is selected', async () => {
    const media = createSubscribeTv({
      season_info: [createMediaSeason({ season_number: 1 })],
      title: '剧集组季竞态剧',
      tmdb_id: 8711,
    })
    const groups = [
      { episode_count: 8, group_count: 1, id: 'group-a', name: '剪辑组 A' },
      { episode_count: 9, group_count: 1, id: 'group-b', name: '剪辑组 B' },
    ]
    const staleSeasons = createDeferred<ReturnType<typeof createMediaSeason>[]>()
    const staleRequest = vi.fn()
    const staleResponseReturned = createDeferred<void>()
    const { container } = await renderDetail({
      episodeGroups: groups,
      media,
      setupHandlers: () => {
        server.use(
          http.get(mediaApiUrls.groupSeasons('group-a'), async () => {
            staleRequest()
            const response = await staleSeasons.promise
            staleResponseReturned.resolve()
            return apiJson(response)
          }),
          mediaGroupSeasonsHandler('group-b', [createMediaSeason({ season_number: 2 })]),
        )
      },
      type: '电视剧',
    })

    await fireEvent.click(screen.getByRole('button', { name: /剪辑组 A/ }))
    await waitFor(() => expect(staleRequest).toHaveBeenCalledOnce())
    await fireEvent.click(screen.getByRole('button', { name: /剪辑组 B/ }))
    await waitFor(() => expect(container.querySelector('.v-expansion-panel')).toHaveTextContent('第 2 季'))

    staleSeasons.resolve([createMediaSeason({ season_number: 3 })])
    await staleResponseReturned.promise
    await flushPromises()

    expect(screen.getByText(/当前：剪辑组 B/)).toBeInTheDocument()
    expect(container.querySelector('.v-expansion-panel')).toHaveTextContent('第 2 季')
    expect(container.querySelector('.v-expansion-panel')).not.toHaveTextContent('第 3 季')
  })

  it('ignores stale missing and remote-exists responses from the previous group', async () => {
    const media = createSubscribeTv({
      season_info: [createMediaSeason({ episode_count: 2, season_number: 1 })],
      title: '剧集组状态竞态剧',
      tmdb_id: 8712,
    })
    const groups = [
      { episode_count: 2, group_count: 1, id: 'group-a', name: '剪辑组 A' },
      { episode_count: 2, group_count: 1, id: 'group-b', name: '剪辑组 B' },
    ]
    const staleMissing = createDeferred<NotExistMediaInfo[]>()
    const staleRemoteExists = createDeferred<Record<number, number[]>>()
    const staleMissingRequest = vi.fn()
    const staleRemoteRequest = vi.fn()
    const staleMissingReturned = createDeferred<void>()
    const staleRemoteReturned = createDeferred<void>()
    const { container } = await renderDetail({
      episodeGroups: groups,
      media,
      setupHandlers: () => {
        server.use(
          mediaGroupSeasonsHandler('group-a', [createMediaSeason({ episode_count: 2, season_number: 1 })]),
          mediaGroupSeasonsHandler('group-b', [createMediaSeason({ episode_count: 2, season_number: 1 })]),
          http.post(mediaApiUrls.notExists, async ({ request }) => {
            const payload = (await request.json()) as Record<string, unknown>
            if (payload.episode_group === 'group-a') {
              staleMissingRequest()
              const response = await staleMissing.promise
              staleMissingReturned.resolve()
              return apiJson(response)
            }
            if (payload.episode_group === 'group-b') {
              return apiJson([createNotExistMediaInfo({ episodes: [2], season: 1, total_episode: 2 })])
            }
            return apiJson([])
          }),
          http.post(mediaApiUrls.existsRemote, async ({ request }) => {
            const payload = (await request.json()) as Record<string, unknown>
            if (payload.episode_group === 'group-a') {
              staleRemoteRequest()
              const response = await staleRemoteExists.promise
              staleRemoteReturned.resolve()
              return apiJson(response)
            }
            return apiJson(payload.episode_group === 'group-b' ? { 1: [2] } : {})
          }),
          http.get(new URL('tmdb/8712/1', API_BASE_URL).href, ({ request }) => {
            const group = new URL(request.url).searchParams.get('episode_group')
            return apiJson([
              createTmdbEpisode({ episode_number: 1, name: `${group} 第一集`, season_number: 1 }),
              createTmdbEpisode({ episode_number: 2, name: `${group} 第二集`, season_number: 1 }),
            ])
          }),
        )
      },
      type: '电视剧',
    })

    await fireEvent.click(screen.getByRole('button', { name: /剪辑组 A/ }))
    await waitFor(() => expect(container.querySelector('.v-expansion-panel-title')).toBeInTheDocument())
    await fireEvent.click(container.querySelector('.v-expansion-panel-title') as HTMLElement)
    await waitFor(() => {
      expect(staleMissingRequest).toHaveBeenCalledOnce()
      expect(staleRemoteRequest).toHaveBeenCalledOnce()
    })

    await fireEvent.click(screen.getByRole('button', { name: /剪辑组 B/ }))
    await waitFor(() => expect(container.querySelector('.v-expansion-panel-title')).toBeInTheDocument())
    await fireEvent.click(container.querySelector('.v-expansion-panel-title') as HTMLElement)
    const currentSecondEpisode = await screen.findByRole('heading', { name: '2 - group-b 第二集' })
    await waitFor(() =>
      expect(currentSecondEpisode.closest('.episode-info')).toContainElement(
        container.querySelector('.episode-exists-badge'),
      ),
    )
    await waitFor(() => expect(container.querySelector('.v-expansion-panel')).toHaveTextContent('部分缺失'))

    staleMissing.resolve([createNotExistMediaInfo({ episodes: [], season: 1, total_episode: 2 })])
    staleRemoteExists.resolve({ 1: [1] })
    await Promise.all([staleMissingReturned.promise, staleRemoteReturned.promise])
    await flushPromises()

    expect(screen.getByText(/当前：剪辑组 B/)).toBeInTheDocument()
    expect(container.querySelector('.v-expansion-panel')).toHaveTextContent('部分缺失')
    expect(currentSecondEpisode.closest('.episode-info')?.querySelector('.episode-exists-badge')).toBeInTheDocument()
    expect(
      screen
        .getByRole('heading', { name: '1 - group-b 第一集' })
        .closest('.episode-info')
        ?.querySelector('.episode-exists-badge'),
    ).not.toBeInTheDocument()
  })

  it('ignores a stale season-episode response from the previously selected group', async () => {
    const media = createSubscribeTv({
      season_info: [createMediaSeason({ season_number: 1 })],
      title: '剧集组竞态剧',
      tmdb_id: 8708,
    })
    const groups = [
      { episode_count: 8, group_count: 1, id: 'group-a', name: '剪辑组 A' },
      { episode_count: 9, group_count: 1, id: 'group-b', name: '剪辑组 B' },
    ]
    const staleEpisodes = createDeferred<TmdbEpisode[]>()
    const staleResponseReturned = createDeferred<void>()
    const staleRequest = vi.fn()
    const currentRequest = vi.fn()
    server.use(
      mediaGroupSeasonsHandler('group-a', [createMediaSeason({ season_number: 1 })]),
      mediaGroupSeasonsHandler('group-b', [createMediaSeason({ season_number: 1 })]),
    )
    const { container } = await renderDetail({ episodeGroups: groups, media, type: '电视剧' })
    server.use(
      mediaRemoteExistsHandler({}),
      http.get(new URL('tmdb/8708/1', API_BASE_URL).href, async ({ request }) => {
        const group = new URL(request.url).searchParams.get('episode_group')
        if (group === 'group-a') {
          staleRequest()
          const response = await staleEpisodes.promise
          staleResponseReturned.resolve()
          return apiJson(response)
        }
        currentRequest()
        return apiJson([createTmdbEpisode({ episode_number: 1, name: 'B 组第一集', season_number: 1 })])
      }),
    )

    await fireEvent.click(screen.getByRole('button', { name: /剪辑组 A/ }))
    await waitFor(() => expect(screen.getByText(/当前：剪辑组 A/)).toBeInTheDocument())
    await waitFor(() => expect(container.querySelector('.v-expansion-panel-title')).toBeInTheDocument())
    await fireEvent.click(container.querySelector('.v-expansion-panel-title') as HTMLElement)
    await waitFor(() => expect(staleRequest).toHaveBeenCalledOnce())

    await fireEvent.click(screen.getByRole('button', { name: /剪辑组 B/ }))
    await waitFor(() => expect(screen.getByText(/当前：剪辑组 B/)).toBeInTheDocument())
    await waitFor(() => expect(container.querySelector('.v-expansion-panel-title')).toBeInTheDocument())
    await fireEvent.click(container.querySelector('.v-expansion-panel-title') as HTMLElement)
    expect(await screen.findByRole('heading', { name: '1 - B 组第一集' })).toBeInTheDocument()
    expect(currentRequest).toHaveBeenCalledOnce()

    staleEpisodes.resolve([createTmdbEpisode({ episode_number: 1, name: 'A 组旧响应', season_number: 1 })])
    await staleResponseReturned.promise
    await flushPromises()

    expect(screen.queryByText('A 组旧响应')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '1 - B 组第一集' })).toBeInTheDocument()
  })
})
