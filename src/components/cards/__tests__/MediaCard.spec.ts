import type { MediaInfo } from '@/api/types'
import MediaCard from '@/components/cards/MediaCard.vue'
import { clearCachedMediaSubscribeStatuses } from '@/utils/mediaStatusCache'
import { fireEvent, waitFor } from '@testing-library/vue'
import { createMediaInfo } from '@tests/support/factories/media'
import { mediaExistsHandler } from '@tests/support/msw/handlers/media'
import { querySubscribeByMediaHandler, subscribeListHandler } from '@tests/support/msw/handlers/subscribe'
import { server } from '@tests/support/msw/server'
import { renderWithProviders } from '@tests/support/render'
import { HttpResponse, http } from 'msw'
import { defineComponent, h } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  openSharedDialog: vi.fn(),
  routerPush: vi.fn(),
}))

vi.mock('@/composables/useSharedDialog', () => ({
  openSharedDialog: (...args: unknown[]) => mocks.openSharedDialog(...args),
}))

vi.mock('@/router', () => ({
  default: {
    push: (...args: unknown[]) => mocks.routerPush(...args),
  },
}))

const API_BASE_URL = 'http://localhost/api/v1/'
const movieSiteListUrl = new URL('site/media/movie', API_BASE_URL).href
const tvSiteListUrl = new URL('site/media/tv', API_BASE_URL).href
const selectedSitesUrl = new URL('system/setting/public/IndexerSites', API_BASE_URL).href

let intersectionObservers: IntersectionObserverMock[] = []

/** 提供可手动触发的视口观察器，供媒体卡片测试验证懒加载行为。 */
class IntersectionObserverMock implements IntersectionObserver {
  readonly root: Element | Document | null
  readonly rootMargin: string
  readonly thresholds: readonly number[]
  /** 记录观察器释放调用。 */
  readonly disconnect = vi.fn()
  /** 记录被观察元素，供后续构造交叉状态。 */
  readonly observe = vi.fn((target: Element) => {
    this.target = target
  })
  /** 记录停止观察调用。 */
  readonly unobserve = vi.fn()
  private target: Element = document.body

  /** 创建使用指定回调和阈值的测试观察器。 */
  constructor(
    private readonly callback: IntersectionObserverCallback,
    options: IntersectionObserverInit = {},
  ) {
    this.root = options.root ?? null
    this.rootMargin = options.rootMargin ?? '0px'
    this.thresholds = Array.isArray(options.threshold) ? options.threshold : [options.threshold ?? 0]
    intersectionObservers.push(this)
  }

  /** 返回测试期间未消费的观察记录。 */
  takeRecords(): IntersectionObserverEntry[] {
    return []
  }

  /** 手动向组件发送进入或离开视口的交叉状态。 */
  trigger(isIntersecting = true) {
    const bounds = this.target.getBoundingClientRect()
    this.callback(
      [
        {
          boundingClientRect: bounds,
          intersectionRatio: isIntersecting ? 1 : 0,
          intersectionRect: bounds,
          isIntersecting,
          rootBounds: null,
          target: this.target,
          time: 0,
        },
      ],
      this,
    )
  }
}

/** 渲染媒体卡片时可覆盖的用户权限状态。 */
interface RenderCardOptions {
  permissions?: Record<string, boolean>
  superUser?: boolean
}

/** 使用指定媒体信息和用户权限渲染媒体卡片。 */
async function renderCard(media: MediaInfo, options: RenderCardOptions = {}) {
  return renderWithProviders(MediaCard, {
    props: {
      media,
      width: '9rem',
    },
    initialState: {
      user: {
        permissions: options.permissions ?? {
          discovery: true,
          manage: false,
          search: true,
          subscribe: true,
        },
        superUser: options.superUser ?? true,
      },
    },
  })
}

/** 获取已渲染的媒体卡片根元素。 */
function getCard(container: Element) {
  const card = container.querySelector<HTMLElement>('.media-card')
  expect(card).not.toBeNull()
  return card as HTMLElement
}

/** 获取负责桌面悬停和触摸交互的卡片区域。 */
function getHoverArea(container: Element) {
  const area = container.querySelector<HTMLElement>('.media-card-hover-area')
  expect(area).not.toBeNull()
  return area as HTMLElement
}

/** 获取媒体卡片当前渲染的所有操作按钮。 */
function getActionButtons(container: Element) {
  return [...container.querySelectorAll<HTMLButtonElement>('.media-card .v-card-text button')]
}

/** 获取媒体搜索操作按钮并确保其已渲染。 */
function getSearchButton(container: Element) {
  const button = getActionButtons(container)[0]
  expect(button).toBeDefined()
  return button
}

/** 筛选用于触发媒体状态懒加载的观察器。 */
function getStatusObservers() {
  return intersectionObservers.filter(observer => observer.thresholds.includes(0.1))
}

/** 安装站点列表及已选站点的搜索请求处理器。 */
function installSearchHandlers(
  sites: Record<string, unknown>[],
  selected: number[],
  mediaType: 'movie' | 'tv' = 'movie',
) {
  server.use(
    http.get(mediaType === 'tv' ? tvSiteListUrl : movieSiteListUrl, () => HttpResponse.json(sites)),
    http.get(selectedSitesUrl, () => HttpResponse.json({ data: { value: selected }, success: true })),
  )
}

describe('MediaCard', () => {
  beforeEach(() => {
    intersectionObservers = []
    clearCachedMediaSubscribeStatuses()
    vi.stubGlobal('IntersectionObserver', IntersectionObserverMock)
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})
    mocks.openSharedDialog.mockReturnValue({ close: vi.fn(), id: 1, updateProps: vi.fn() })
  })

  it('loads exact subscribe and exists status only after entering the viewport', async () => {
    const media = createMediaInfo({ season: 2, title: '视口状态剧集', tmdb_id: 9101, type: '电视剧' })
    const subscribeRequest = vi.fn<(url: URL) => void>()
    const existsRequest = vi.fn<(url: URL) => void>()
    server.use(
      querySubscribeByMediaHandler('tmdb:9101', { id: 71, season: 2 }, 200, subscribeRequest),
      mediaExistsHandler({ data: { item: { id: 'library-item' } }, success: true }, 200, existsRequest),
    )

    const { container } = await renderCard(media)
    expect(subscribeRequest).not.toHaveBeenCalled()
    expect(existsRequest).not.toHaveBeenCalled()

    getStatusObservers()[0]?.trigger()

    await waitFor(() => {
      expect(subscribeRequest).toHaveBeenCalledOnce()
      expect(existsRequest).toHaveBeenCalledOnce()
    })
    expect(subscribeRequest.mock.calls[0][0].searchParams.get('season')).toBe('2')
    expect(subscribeRequest.mock.calls[0][0].searchParams.get('title')).toBe('视口状态剧集')
    expect(Object.fromEntries(existsRequest.mock.calls[0][0].searchParams)).toEqual({
      mtype: '电视剧',
      season: '2',
      title: '视口状态剧集',
      tmdbid: '9101',
      year: '2026',
    })
    await waitFor(() => expect(getActionButtons(container).at(-1)).toHaveClass('text-error'))
    expect(getStatusObservers()[0]?.disconnect).toHaveBeenCalledOnce()
  })

  it('coalesces status requests for duplicate cards while updating both card states', async () => {
    const media = createMediaInfo({ title: '重复媒体', tmdb_id: 9102 })
    const subscribeRequest = vi.fn<(url: URL) => void>()
    const existsRequest = vi.fn<(url: URL) => void>()
    server.use(
      querySubscribeByMediaHandler('tmdb:9102', { id: 72 }, 200, subscribeRequest),
      mediaExistsHandler({ data: { item: {} }, success: false }, 200, existsRequest),
    )

    const Harness = {
      components: { MediaCard },
      data: () => ({ media }),
      template: '<div><MediaCard :media="media" width="9rem" /><MediaCard :media="media" width="9rem" /></div>',
    }
    const { container } = await renderWithProviders(Harness, {
      initialState: { user: { superUser: true } },
    })

    expect(getStatusObservers()).toHaveLength(2)
    getStatusObservers().forEach(observer => observer.trigger())

    await waitFor(() => {
      expect(subscribeRequest).toHaveBeenCalledOnce()
      expect(existsRequest).toHaveBeenCalledOnce()
      expect(container.querySelectorAll('.media-card .v-card-text button.text-error')).toHaveLength(2)
    })
  })

  it.each([
    ['TMDB', createMediaInfo({ season: 3, tmdb_id: 9201, type: '电视剧' }), 'tmdb:9201', '3'],
    [
      'Douban',
      createMediaInfo({ douban_id: 'db-9202', season: undefined, tmdb_id: undefined }),
      'douban:db-9202',
      null,
    ],
    [
      'Bangumi',
      createMediaInfo({ bangumi_id: '9203', season: 1, tmdb_id: undefined, type: '电视剧' }),
      'bangumi:9203',
      '1',
    ],
    [
      'extension',
      createMediaInfo({ media_id: 'item-9204', mediaid_prefix: 'custom', tmdb_id: undefined }),
      'custom:item-9204',
      null,
    ],
  ])('queries the current %s media identifier and season', async (_source, media, mediaId, season) => {
    const subscribeRequest = vi.fn<(url: URL) => void>()
    server.use(
      querySubscribeByMediaHandler(mediaId, {}, 200, subscribeRequest),
      mediaExistsHandler({ data: { item: {} }, success: false }),
    )

    await renderCard(media)
    getStatusObservers()[0]?.trigger()

    await waitFor(() => expect(subscribeRequest).toHaveBeenCalledOnce())
    expect(subscribeRequest.mock.calls[0][0].searchParams.get('season')).toBe(season)
  })

  it('skips status requests for collections and releases observer and touch listeners on unmount', async () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue({
      ...window.matchMedia(''),
      matches: true,
    })
    const subscribeRequest = vi.fn<(url: URL) => void>()
    const existsRequest = vi.fn<(url: URL) => void>()
    const addListener = vi.spyOn(document, 'addEventListener')
    const removeListener = vi.spyOn(document, 'removeEventListener')
    server.use(
      querySubscribeByMediaHandler('tmdb:9301', {}, 200, subscribeRequest),
      mediaExistsHandler({ data: { item: {} }, success: false }, 200, existsRequest),
    )

    const { unmount } = await renderCard(createMediaInfo({ collection_id: 44, tmdb_id: 9301 }))
    getStatusObservers()[0]?.trigger()
    await Promise.resolve()

    expect(subscribeRequest).not.toHaveBeenCalled()
    expect(existsRequest).not.toHaveBeenCalled()
    expect(addListener).toHaveBeenCalledWith('pointerdown', expect.any(Function))

    unmount()

    expect(getStatusObservers()[0]?.disconnect).toHaveBeenCalledOnce()
    expect(removeListener).toHaveBeenCalledWith('pointerdown', expect.any(Function))
  })

  it.each([
    [
      'media details',
      createMediaInfo({ title: '详情电影', tmdb_id: 9401 }),
      '/media',
      { mediaid: 'tmdb:9401', title: '详情电影', type: '电影', year: '2026' },
    ],
    [
      'collection browse',
      createMediaInfo({ collection_id: 88, title: '合集入口', tmdb_id: 9402 }),
      '/browse/tmdb/collection/88',
      { title: '合集入口' },
    ],
  ])('opens %s from the desktop hover state', async (_case, media, path, query) => {
    const { container } = await renderCard(media)

    await fireEvent.mouseEnter(getHoverArea(container))
    await waitFor(() => expect(getCard(container)).toHaveClass('app-hover-lift-card--hovering'))
    await fireEvent.click(getCard(container))

    await waitFor(() => expect(mocks.routerPush).toHaveBeenCalledWith({ path, query }))
  })

  it('opens music detail and skips media-library existence checks', async () => {
    const media = createMediaInfo({
      artist: '周杰伦',
      media_id: 'recording-1',
      mediaid_prefix: 'musicbrainz',
      source: 'musicbrainz',
      title: '晴天',
      tmdb_id: undefined,
      type: '音乐',
    })
    const subscribeRequest = vi.fn<(url: URL) => void>()
    const existsRequest = vi.fn<(url: URL) => void>()
    server.use(
      querySubscribeByMediaHandler('musicbrainz:recording-1', {}, 200, subscribeRequest),
      mediaExistsHandler({ data: { item: {} }, success: false }, 200, existsRequest),
    )

    const { container } = await renderCard(media)
    getStatusObservers()[0]?.trigger()
    await waitFor(() => expect(subscribeRequest).toHaveBeenCalledOnce())
    expect((subscribeRequest.mock.calls[0][0] as URL).searchParams.get('music_type')).toBe('recording')
    expect(existsRequest).not.toHaveBeenCalled()

    await fireEvent.mouseEnter(getHoverArea(container))
    await waitFor(() => expect(getCard(container)).toHaveClass('app-hover-lift-card--hovering'))
    await fireEvent.click(getCard(container))

    await waitFor(() =>
      expect(mocks.routerPush).toHaveBeenCalledWith({
        path: '/music/detail',
        query: {
          source: 'musicbrainz',
          mediaid: 'recording-1',
          title: '晴天',
        },
      }),
    )
  })

  it('uses an album placeholder instead of the movie fallback image for music without a cover', async () => {
    const media = createMediaInfo({
      media_id: 'recording-2',
      source: 'musicbrainz',
      poster_path: undefined,
      title: '无封面歌曲',
      tmdb_id: undefined,
      type: '音乐',
    })

    const { container } = await renderCard(media)

    expect(container.querySelector('.media-card-placeholder .v-icon')).not.toBeNull()
    expect(container.querySelector('img[src*="no-image"]')).toBeNull()
  })

  it('routes directly to resource search when no active sites are available', async () => {
    installSearchHandlers([], [3, 5], 'tv')
    const media = createMediaInfo({ season: 4, title: '直接搜索剧集', tmdb_id: 9501, type: '电视剧' })
    const { container } = await renderCard(media)

    await fireEvent.mouseEnter(getHoverArea(container))
    await fireEvent.click(getSearchButton(container))

    await waitFor(() =>
      expect(mocks.routerPush).toHaveBeenCalledWith({
        path: '/resource',
        query: {
          area: 'title',
          keyword: 'tmdb:9501',
          season: 4,
          sites: '3,5',
          title: '直接搜索剧集',
          type: '电视剧',
          year: '2026',
        },
      }),
    )
    expect(mocks.openSharedDialog).not.toHaveBeenCalled()
  })

  it('falls back to global search when site settings cannot provide active selections', async () => {
    server.use(
      http.get(movieSiteListUrl, () => HttpResponse.json({ message: 'temporary failure' }, { status: 500 })),
      http.get(selectedSitesUrl, () => HttpResponse.json({ success: true })),
    )
    const media = createMediaInfo({ title: '站点失败搜索', tmdb_id: 9503 })
    const { container } = await renderCard(media)

    await fireEvent.mouseEnter(getHoverArea(container))
    await fireEvent.click(getSearchButton(container))

    await waitFor(() =>
      expect(mocks.routerPush).toHaveBeenCalledWith(
        expect.objectContaining({ path: '/resource', query: expect.objectContaining({ sites: '' }) }),
      ),
    )
    expect(mocks.openSharedDialog).not.toHaveBeenCalled()
  })

  it('opens site selection and routes with the selected sites when active sites exist', async () => {
    installSearchHandlers(
      [
        {
          domain: 'tracker.example',
          downloader: 'default',
          id: 7,
          is_active: true,
          name: '测试站点',
          url: 'https://tracker.example',
        },
      ],
      [7],
    )
    const media = createMediaInfo({ title: '多站搜索电影', tmdb_id: 9502 })
    const { container } = await renderCard(media)

    await fireEvent.mouseEnter(getHoverArea(container))
    await fireEvent.click(getSearchButton(container))
    await waitFor(() => expect(mocks.openSharedDialog).toHaveBeenCalledOnce())

    const [, dialogProps, dialogEvents] = mocks.openSharedDialog.mock.calls[0] as [
      unknown,
      { selected: number[]; sites: Array<{ id: number }> },
      { search: (sites: number[]) => void },
    ]
    expect(dialogProps.selected).toEqual([7])
    expect(dialogProps.sites.map(site => site.id)).toEqual([7])
    dialogEvents.search([7, 9])

    await waitFor(() =>
      expect(mocks.routerPush).toHaveBeenCalledWith(
        expect.objectContaining({
          path: '/resource',
          query: expect.objectContaining({ sites: '7,9' }),
        }),
      ),
    )
  })

  it('opens active sites with an empty selection when the saved setting fails', async () => {
    server.use(
      http.get(movieSiteListUrl, () =>
        HttpResponse.json([
          {
            domain: 'fallback.example',
            downloader: 'default',
            id: 8,
            is_active: true,
            name: '备用站点',
            url: 'https://fallback.example',
          },
        ]),
      ),
      http.get(selectedSitesUrl, () => HttpResponse.json({ message: 'temporary failure' }, { status: 500 })),
    )
    const { container } = await renderCard(createMediaInfo({ tmdb_id: 9504 }))

    await fireEvent.mouseEnter(getHoverArea(container))
    await fireEvent.click(getSearchButton(container))

    await waitFor(() => expect(mocks.openSharedDialog).toHaveBeenCalledOnce())
    const [, dialogProps] = mocks.openSharedDialog.mock.calls[0] as [unknown, { selected: number[] }]
    expect(dialogProps.selected).toEqual([])
  })

  it('loads matching TV seasons before opening the subscription dialog', async () => {
    const media = createMediaInfo({ season: 2, title: '多季剧集', tmdb_id: 9551, type: '电视剧' })
    server.use(
      querySubscribeByMediaHandler('tmdb:9551', { id: 81, season: 2 }),
      mediaExistsHandler({ data: { item: {} }, success: false }),
      subscribeListHandler([
        { best_version: 0, id: 81, season: 3, tmdbid: 9551, type: '电视剧' },
        { best_version: 1, best_version_full: 1, id: 82, season: 1, tmdbid: 9551, type: '电视剧' },
        { id: 83, season: 4, tmdbid: 9999, type: '电视剧' },
        { id: 84, tmdbid: 9551, type: '电影' },
      ]),
      http.get(new URL('system/setting/public/DefaultTvSubscribeConfig', API_BASE_URL).href, () =>
        HttpResponse.json({ data: { value: { best_version: 0 } }, success: true }),
      ),
    )
    const { container } = await renderCard(media)
    getStatusObservers()[0]?.trigger()
    await waitFor(() => expect(getActionButtons(container).at(-1)).toHaveClass('text-error'))

    await fireEvent.mouseEnter(getHoverArea(container))
    await fireEvent.click(getActionButtons(container).at(-1) as HTMLButtonElement)

    await waitFor(() => expect(mocks.openSharedDialog).toHaveBeenCalledOnce())
    const [, dialogProps] = mocks.openSharedDialog.mock.calls[0] as [unknown, Record<string, unknown>]
    expect(dialogProps).toMatchObject({
      selectedSeason: undefined,
      subscribedSeasonModes: { 1: 'best_version_full', 3: 'normal' },
      subscribedSeasons: [1, 3],
    })
  })

  it('matches custom media IDs when collecting subscribed TV seasons', async () => {
    const media = createMediaInfo({
      media_id: 'series-9553',
      mediaid_prefix: 'custom',
      season: 2,
      tmdb_id: undefined,
      type: '电视剧',
    })
    server.use(
      querySubscribeByMediaHandler('custom:series-9553', { id: 91, season: 2 }),
      mediaExistsHandler({ data: { item: {} }, success: false }),
      subscribeListHandler([
        { id: 91, mediaid: 'custom:series-9553', season: 2, type: '电视剧' },
        { id: 92, mediaid: 'custom:other', season: 5, type: '电视剧' },
      ]),
      http.get(new URL('system/setting/public/DefaultTvSubscribeConfig', API_BASE_URL).href, () =>
        HttpResponse.json({ data: { value: {} }, success: true }),
      ),
    )
    const { container } = await renderCard(media)
    getStatusObservers()[0]?.trigger()
    await waitFor(() => expect(getActionButtons(container).at(-1)).toHaveClass('text-error'))

    await fireEvent.mouseEnter(getHoverArea(container))
    await fireEvent.click(getActionButtons(container).at(-1) as HTMLButtonElement)

    await waitFor(() => expect(mocks.openSharedDialog).toHaveBeenCalledOnce())
    const [, dialogProps] = mocks.openSharedDialog.mock.calls[0] as [unknown, Record<string, unknown>]
    expect(dialogProps).toMatchObject({ subscribedSeasons: [2] })
  })

  it.each([
    [
      'structured TMDB identity',
      createMediaInfo({
        media_id: 'series-9554',
        mediaid_prefix: undefined,
        season: 2,
        source: 'themoviedb',
        tmdb_id: undefined,
        type: '电视剧',
      }),
      'tmdb:series-9554',
      [
        { id: 93, media_id: 'series-9554', media_source: 'themoviedb', season: 4, type: '电视剧' },
        { id: 94, media_id: 'other', media_source: 'themoviedb', season: 5, type: '电视剧' },
      ],
      [4],
    ],
    [
      'legacy AniList identity',
      createMediaInfo({ anilist_id: 154588, season: 2, source: 'anilist', tmdb_id: undefined, type: '电视剧' }),
      'anilist:154588',
      [
        { anilistid: 154588, id: 95, season: 1, type: '电视剧' },
        { anilistid: 154589, id: 96, season: 3, type: '电视剧' },
      ],
      [1],
    ],
  ])('matches %s when collecting subscribed TV seasons', async (_label, media, mediaId, subscribes, expected) => {
    server.use(
      querySubscribeByMediaHandler(mediaId, { id: 93, season: 2 }),
      mediaExistsHandler({ data: { item: {} }, success: false }),
      subscribeListHandler(subscribes),
      http.get(new URL('system/setting/public/DefaultTvSubscribeConfig', API_BASE_URL).href, () =>
        HttpResponse.json({ data: { value: {} }, success: true }),
      ),
    )
    const { container } = await renderCard(media)
    getStatusObservers()[0]?.trigger()
    await waitFor(() => expect(getActionButtons(container).at(-1)).toHaveClass('text-error'))

    await fireEvent.mouseEnter(getHoverArea(container))
    await fireEvent.click(getActionButtons(container).at(-1) as HTMLButtonElement)

    await waitFor(() => expect(mocks.openSharedDialog).toHaveBeenCalledOnce())
    const [, dialogProps] = mocks.openSharedDialog.mock.calls[0] as [unknown, Record<string, unknown>]
    expect(dialogProps).toMatchObject({ subscribedSeasons: expected })
  })

  it('updates image badges on load and falls back after an image error', async () => {
    const media = createMediaInfo({
      poster_path: '/original/poster.jpg',
      source: 'themoviedb',
      tmdb_id: 9552,
      type: '电视剧',
      vote_average: 8.6,
    })
    const VImgStub = defineComponent({
      name: 'VImg',
      emits: ['error', 'load'],
      props: { src: String },
      /** 渲染可主动触发图片成功和失败事件的测试替身。 */
      setup(props, { emit, slots }) {
        return () =>
          h('div', { 'data-src': props.src }, [
            h('button', { 'aria-label': '图片加载成功', onClick: () => emit('load') }),
            h('button', { 'aria-label': '图片加载失败', onClick: () => emit('error') }),
            slots.default?.(),
          ])
      },
    })
    const { container } = await renderWithProviders(MediaCard, {
      props: { media, width: '9rem' },
      initialState: { user: { superUser: true } },
      global: { stubs: { VImg: VImgStub } },
    })

    await fireEvent.click(container.querySelector('[aria-label="图片加载成功"]') as HTMLElement)
    await waitFor(() => expect(container.querySelector('.media-card')).toHaveClass('ring-1'))
    expect(container).toHaveTextContent('TV')
    expect(container).toHaveTextContent('8.6')

    await fireEvent.click(container.querySelector('[aria-label="图片加载失败"]') as HTMLElement)
    await waitFor(() =>
      expect(container.querySelector('.media-card-title')?.parentElement).not.toHaveStyle({ display: 'none' }),
    )
  })

  it('renders the AniList source badge after the poster loads', async () => {
    const media = createMediaInfo({
      anilist_id: 154588,
      poster_path: '/original/anilist.jpg',
      source: 'anilist',
      tmdb_id: undefined,
      type: '电视剧',
    })
    const VImgStub = defineComponent({
      name: 'VImg',
      emits: ['load'],
      props: { src: String },
      /** 渲染可主动触发海报加载完成事件的测试替身。 */
      setup(_props, { emit, slots }) {
        return () =>
          h('div', [h('button', { 'aria-label': '图片加载成功', onClick: () => emit('load') }), slots.default?.()])
      },
    })
    const VIconStub = {
      props: ['icon'],
      template: '<i :data-icon="icon" />',
    }
    const { container } = await renderWithProviders(MediaCard, {
      props: { media, width: '9rem' },
      initialState: { user: { superUser: true } },
      global: { stubs: { VIcon: VIconStub, VImg: VImgStub } },
    })

    await fireEvent.click(container.querySelector('[aria-label="图片加载成功"]') as HTMLElement)

    await waitFor(() => expect(container.querySelector('[data-icon="mdi-alpha-a-circle"]')).not.toBeNull())
  })

  it('hides search and subscribe actions when the user lacks both permissions', async () => {
    const { container } = await renderCard(createMediaInfo({ tmdb_id: 9601 }), {
      permissions: {
        discovery: true,
        manage: false,
        search: false,
        subscribe: false,
      },
      superUser: false,
    })

    await fireEvent.mouseEnter(getHoverArea(container))

    expect(getActionButtons(container)).toHaveLength(0)
  })

  it('uses first tap to reveal details, second tap to route, and outside pointerdown to collapse', async () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue({
      ...window.matchMedia(''),
      matches: true,
    })
    const media = createMediaInfo({ title: '触摸卡片', tmdb_id: 9701 })
    const { container } = await renderCard(media)
    const detail = container.querySelector<HTMLElement>('.media-card-title')?.parentElement
    expect(detail).not.toBeNull()

    await fireEvent.click(getCard(container))
    expect(detail).not.toHaveStyle({ display: 'none' })
    expect(mocks.routerPush).not.toHaveBeenCalled()

    await fireEvent.pointerDown(document.body)
    expect(detail).toHaveStyle({ display: 'none' })

    await fireEvent.click(getCard(container))
    await fireEvent.click(getCard(container))
    await waitFor(() => expect(mocks.routerPush).toHaveBeenCalledWith(expect.objectContaining({ path: '/media' })))
  })
})
