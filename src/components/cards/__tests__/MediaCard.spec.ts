import type { MediaInfo } from '@/api/types'
import MediaCard from '@/components/cards/MediaCard.vue'
import { clearCachedMediaSubscribeStatuses } from '@/utils/mediaStatusCache'
import { fireEvent, waitFor } from '@testing-library/vue'
import { createMediaInfo } from '@tests/support/factories/media'
import { mediaExistsHandler } from '@tests/support/msw/handlers/media'
import {
  createSubscribeHandler,
  defaultSubscribeConfigHandler,
  querySubscribeByMediaHandler,
  subscribeListHandler,
} from '@tests/support/msw/handlers/subscribe'
import { server } from '@tests/support/msw/server'
import { renderWithProviders } from '@tests/support/render'
import { HttpResponse, http } from 'msw'
import { defineComponent, h, reactive, ref } from 'vue'
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
const musicBrainzRecordingId = '977e6978-139d-425c-bb98-6b0c62d1e45e'
const secondMusicBrainzRecordingId = 'be9d9b1b-8c1d-4dbe-85a5-4176dd8e7b6c'
const movieSiteListUrl = new URL('site/media/movie', API_BASE_URL).href
const tvSiteListUrl = new URL('site/media/tv', API_BASE_URL).href
const musicSiteListUrl = new URL('site/media/music', API_BASE_URL).href
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

interface ControlledImageRequest {
  /** 模拟当前 VImg 请求失败。 */
  fail: () => void
  /** 模拟当前 VImg 请求成功。 */
  load: () => void
  /** 模拟当前 VImg 的 opacity 淡入完成。 */
  reveal: () => void
  /** 当前 VImg 实例发起的图片地址。 */
  src: string
}

/** 创建可保留旧实例回调的图片替身，用于验证媒体复用时的迟到事件隔离。 */
function createControlledImageStub(requests: ControlledImageRequest[]) {
  return defineComponent({
    name: 'VImg',
    emits: ['error', 'load'],
    props: { src: String },
    setup(props, { emit, slots }) {
      const src = props.src ?? ''
      const imageElement = ref<HTMLImageElement | null>(null)
      const request = {
        fail: () => emit('error', src),
        load: () => emit('load', src),
        reveal: () => {
          const event = new Event('transitionend', { bubbles: true }) as TransitionEvent
          Object.defineProperty(event, 'propertyName', { value: 'opacity' })
          imageElement.value?.dispatchEvent(event)
        },
        src,
      }
      requests.push(request)

      return () =>
        h('div', { 'data-src': src }, [
          h('img', {
            ref: imageElement,
            class: 'v-img__img',
          }),
          slots.default?.(),
        ])
    },
  })
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
  mediaType: 'movie' | 'music' | 'tv' = 'movie',
) {
  const siteListUrl = {
    movie: movieSiteListUrl,
    music: musicSiteListUrl,
    tv: tvSiteListUrl,
  }[mediaType]
  server.use(
    http.get(siteListUrl, () => HttpResponse.json(sites)),
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
      querySubscribeByMediaHandler('9101', { id: 71, season: 2 }, 200, subscribeRequest),
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
    expect(subscribeRequest.mock.calls[0][0].searchParams.get('media_source')).toBe('themoviedb')
    expect(Object.fromEntries(existsRequest.mock.calls[0][0].searchParams)).toEqual({
      media_id: '9101',
      media_source: 'themoviedb',
      mtype: '电视剧',
      season: '2',
      title: '视口状态剧集',
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
      querySubscribeByMediaHandler('9102', { id: 72 }, 200, subscribeRequest),
      mediaExistsHandler({ data: { item: {} }, success: true }, 200, existsRequest),
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

  it('keeps the local-exists marker hidden when the exists request reports a business failure', async () => {
    const media = createMediaInfo({ title: '存在查询失败电影', tmdb_id: 9103 })
    const existsRequest = vi.fn<(url: URL) => void>()
    server.use(
      querySubscribeByMediaHandler('9103', {}),
      mediaExistsHandler({ data: {}, message: '查询失败', success: false }, 200, existsRequest),
    )

    const { container } = await renderCard(media)
    getStatusObservers()[0]?.trigger()

    await waitFor(() => expect(existsRequest).toHaveBeenCalledOnce())
    await waitFor(() => expect(console.error).toHaveBeenCalled())
    expect(container.querySelector('.bg-green-500')).toBeNull()
  })

  it.each([
    ['TMDB', createMediaInfo({ season: 3, tmdb_id: 9201, type: '电视剧' }), '9201', '3'],
    [
      'Douban',
      createMediaInfo({
        douban_id: 'db-9202',
        media_id: 'db-9202',
        media_source: 'douban',
        season: undefined,
        tmdb_id: undefined,
      }),
      'db-9202',
      null,
    ],
    [
      'Bangumi',
      createMediaInfo({
        bangumi_id: '9203',
        media_id: '9203',
        media_source: 'bangumi',
        season: 1,
        tmdb_id: undefined,
        type: '电视剧',
      }),
      '9203',
      '1',
    ],
    [
      'Bilibili',
      createMediaInfo({ media_id: 'item-9204', media_source: 'bilibili', tmdb_id: undefined }),
      'item-9204',
      null,
    ],
  ])('queries the current %s media identifier and season', async (_source, media, mediaId, season) => {
    const subscribeRequest = vi.fn<(url: URL) => void>()
    server.use(
      querySubscribeByMediaHandler(mediaId, {}, 200, subscribeRequest),
      mediaExistsHandler({ data: { item: {} }, success: true }),
    )

    await renderCard(media)
    getStatusObservers()[0]?.trigger()

    await waitFor(() => expect(subscribeRequest).toHaveBeenCalledOnce())
    expect(subscribeRequest.mock.calls[0][0].searchParams.get('season')).toBe(season)
    expect(subscribeRequest.mock.calls[0][0].searchParams.get('media_source')).toBe(media.media_source)
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
      querySubscribeByMediaHandler('9301', {}, 200, subscribeRequest),
      mediaExistsHandler({ data: { item: {} }, success: true }, 200, existsRequest),
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
      { media_id: '9401', media_source: 'themoviedb', title: '详情电影', type: '电影', year: '2026' },
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
      media_id: musicBrainzRecordingId,
      media_source: 'musicbrainz',
      title: '晴天',
      tmdb_id: undefined,
      type: '音乐',
    })
    const subscribeRequest = vi.fn<(url: URL) => void>()
    const existsRequest = vi.fn<(url: URL) => void>()
    server.use(
      querySubscribeByMediaHandler(musicBrainzRecordingId, {}, 200, subscribeRequest),
      mediaExistsHandler({ data: { item: {} }, success: true }, 200, existsRequest),
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
          media_source: 'musicbrainz',
          media_id: musicBrainzRecordingId,
          title: '晴天',
        },
      }),
    )
  })

  it.each([
    ['TheAudioDB', 'theaudiodb', 'album-2109619', 'Parachutes'],
    ['豆瓣音乐', 'doubanmusic', '1401853', '范特西'],
  ] as const)(
    'keeps %s identity for explore-card detail, subscribe, and resource actions',
    async (_label, source, mediaId, title) => {
      const media = createMediaInfo({
        artist: 'Artist',
        media_id: mediaId,
        media_source: source,
        music_type: 'album',
        poster_path: undefined,
        title,
        tmdb_id: undefined,
        total_tracks: 10,
        type: '音乐',
      })
      const subscribeRequest = vi.fn<(url: URL) => void>()
      const created = vi.fn<(payload: Record<string, unknown>) => void>()
      server.use(
        querySubscribeByMediaHandler(mediaId, {}, 200, subscribeRequest),
        createSubscribeHandler({ data: { id: 101 }, success: true }, 200, created),
        defaultSubscribeConfigHandler('音乐', { show_edit_dialog: false }),
      )
      installSearchHandlers([], [21], 'music')

      const { container } = await renderCard(media)
      getStatusObservers()[0]?.trigger()
      await waitFor(() => expect(subscribeRequest).toHaveBeenCalledOnce())
      expect(subscribeRequest.mock.calls[0][0].searchParams.get('music_type')).toBe('album')

      await fireEvent.mouseEnter(getHoverArea(container))
      await waitFor(() => expect(getCard(container)).toHaveClass('app-hover-lift-card--hovering'))
      await fireEvent.click(getCard(container))
      await waitFor(() =>
        expect(mocks.routerPush).toHaveBeenCalledWith({
          path: '/music/album',
          query: { media_id: mediaId, media_source: source, title },
        }),
      )

      await fireEvent.click(getActionButtons(container).at(-1) as HTMLButtonElement)
      await waitFor(() => expect(created).toHaveBeenCalledOnce())
      expect(created.mock.calls[0][0]).toMatchObject({
        media_id: mediaId,
        media_source: source,
        music_type: 'album',
        name: title,
        type: '音乐',
      })

      await fireEvent.click(getSearchButton(container))
      await waitFor(() =>
        expect(mocks.routerPush).toHaveBeenCalledWith({
          path: '/resource',
          query: expect.objectContaining({
            media_id: mediaId,
            media_source: source,
            music_type: 'album',
            sites: '21',
            type: '音乐',
          }),
        }),
      )
    },
  )

  it('uses an album placeholder instead of the movie fallback image for music without a cover', async () => {
    const media = createMediaInfo({
      media_id: secondMusicBrainzRecordingId,
      media_source: 'musicbrainz',
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
          media_id: '9501',
          media_source: 'themoviedb',
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

  it('preserves loaded TV seasons when the same media receives a new poster', async () => {
    const media = reactive(createMediaInfo({ season: 2, title: '多季剧集', tmdb_id: 9551, type: '电视剧' }))
    const subscribeListRequest = vi.fn<(url: URL) => void>()
    server.use(
      querySubscribeByMediaHandler('9551', { id: 81, season: 2 }),
      mediaExistsHandler({ data: { item: {} }, success: true }),
      subscribeListHandler(
        [
          { best_version: 0, id: 81, media_id: '9551', media_source: 'themoviedb', season: 3, type: '电视剧' },
          {
            best_version: 1,
            best_version_full: 1,
            id: 82,
            media_id: '9551',
            media_source: 'themoviedb',
            season: 1,
            type: '电视剧',
          },
          { id: 83, media_id: '9999', media_source: 'themoviedb', season: 4, type: '电视剧' },
          { id: 84, media_id: '9551', media_source: 'themoviedb', type: '电影' },
        ],
        200,
        subscribeListRequest,
      ),
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
    expect(subscribeListRequest).toHaveBeenCalledOnce()

    media.poster_path = '/original/updated.jpg'
    mocks.openSharedDialog.mockClear()
    await fireEvent.click(getActionButtons(container).at(-1) as HTMLButtonElement)

    await waitFor(() => expect(mocks.openSharedDialog).toHaveBeenCalledOnce())
    expect(subscribeListRequest).toHaveBeenCalledOnce()
    const [, updatedDialogProps] = mocks.openSharedDialog.mock.calls[0] as [unknown, Record<string, unknown>]
    expect(updatedDialogProps).toMatchObject({
      subscribedSeasonModes: { 1: 'best_version_full', 3: 'normal' },
      subscribedSeasons: [1, 3],
    })
  })

  it('matches a fixed extension media source when collecting subscribed TV seasons', async () => {
    const media = createMediaInfo({
      media_id: 'series-9553',
      media_source: 'bilibili',
      season: 2,
      tmdb_id: undefined,
      type: '电视剧',
    })
    server.use(
      querySubscribeByMediaHandler('series-9553', { id: 91, season: 2 }),
      mediaExistsHandler({ data: { item: {} }, success: true }),
      subscribeListHandler([
        { id: 91, media_id: 'series-9553', media_source: 'bilibili', season: 2, type: '电视剧' },
        { id: 92, media_id: 'other', media_source: 'bilibili', season: 5, type: '电视剧' },
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
        season: 2,
        media_source: 'themoviedb',
        tmdb_id: undefined,
        type: '电视剧',
      }),
      'series-9554',
      [
        { id: 93, media_id: 'series-9554', media_source: 'themoviedb', season: 4, type: '电视剧' },
        { id: 94, media_id: 'other', media_source: 'themoviedb', season: 5, type: '电视剧' },
      ],
      [4],
    ],
    [
      'AniList identity',
      createMediaInfo({
        anilist_id: 154588,
        media_id: '154588',
        season: 2,
        media_source: 'anilist',
        tmdb_id: undefined,
        type: '电视剧',
      }),
      '154588',
      [
        { id: 95, media_id: '154588', media_source: 'anilist', season: 1, type: '电视剧' },
        { id: 96, media_id: '154589', media_source: 'anilist', season: 3, type: '电视剧' },
      ],
      [1],
    ],
  ])('matches %s when collecting subscribed TV seasons', async (_label, media, mediaId, subscribes, expected) => {
    server.use(
      querySubscribeByMediaHandler(mediaId, { id: 93, season: 2 }),
      mediaExistsHandler({ data: { item: {} }, success: true }),
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

  it('updates image badges on load and shows the typed placeholder after an image error', async () => {
    const media = createMediaInfo({
      poster_path: '/original/poster.jpg',
      media_source: 'themoviedb',
      tmdb_id: 9552,
      type: '电视剧',
      vote_average: 8.6,
    })
    const requests: ControlledImageRequest[] = []
    const VImgStub = createControlledImageStub(requests)
    const { container } = await renderWithProviders(MediaCard, {
      props: { media, width: '9rem' },
      initialState: { user: { superUser: true } },
      global: { stubs: { VImg: VImgStub } },
    })

    expect(getCard(container)).not.toHaveAttribute('data-glass-optical-mode')
    requests[0].load()
    await waitFor(() => expect(container.querySelector('.media-card')).toHaveClass('ring-1'))
    expect(getCard(container)).not.toHaveAttribute('data-glass-optical-mode')

    requests[0].reveal()
    await waitFor(() => expect(getCard(container)).toHaveAttribute('data-glass-optical-mode', 'excluded'))
    expect(container).toHaveTextContent('TV')
    expect(container).toHaveTextContent('8.6')

    requests[0].fail()
    await waitFor(() =>
      expect(container.querySelector('.media-card-title')?.parentElement).not.toHaveStyle({ display: 'none' }),
    )
    await waitFor(() => expect(container.querySelector('.media-card-placeholder')).not.toBeNull())
    expect(getCard(container)).not.toHaveAttribute('data-glass-optical-mode')
    expect(getCard(container)).not.toHaveClass('ring-1')
    expect(requests.some(request => request.src.includes('no-image'))).toBe(false)
  })

  it('keeps placeholder-only cards inside the renderer without issuing an image request', async () => {
    const requests: ControlledImageRequest[] = []
    const { container } = await renderWithProviders(MediaCard, {
      props: { media: createMediaInfo({ poster_path: undefined, tmdb_id: 9553 }), width: '9rem' },
      initialState: { user: { superUser: true } },
      global: { stubs: { VImg: createControlledImageStub(requests) } },
    })

    expect(requests).toHaveLength(0)
    expect(container.querySelector('.media-card-placeholder')).not.toBeNull()
    expect(getCard(container)).not.toHaveClass('ring-1')
    expect(getCard(container)).not.toHaveAttribute('data-glass-optical-mode')
  })

  it('excludes music cards from the renderer after the cover finishes revealing', async () => {
    const requests: ControlledImageRequest[] = []
    const { container } = await renderWithProviders(MediaCard, {
      props: {
        media: createMediaInfo({ cover_url: 'https://example.com/cover.jpg', poster_path: undefined, type: '音乐' }),
        width: '9rem',
      },
      initialState: { user: { superUser: true } },
      global: { stubs: { VImg: createControlledImageStub(requests) } },
    })

    expect(requests).toHaveLength(1)
    requests[0].load()
    requests[0].reveal()

    await waitFor(() => expect(getCard(container)).toHaveAttribute('data-glass-optical-mode', 'excluded'))
  })

  it('ignores a previous poster load after the card is reused for another media item', async () => {
    const requests: ControlledImageRequest[] = []
    const mediaA = createMediaInfo({ poster_path: '/original/a.jpg', title: '媒体 A', tmdb_id: 9554 })
    const mediaB = createMediaInfo({ poster_path: '/original/b.jpg', title: '媒体 B', tmdb_id: 9555 })
    const { container, rerender } = await renderWithProviders(MediaCard, {
      props: { media: mediaA, width: '9rem' },
      initialState: { user: { superUser: true } },
      global: { stubs: { VImg: createControlledImageStub(requests) } },
    })

    requests[0].load()
    await waitFor(() => expect(getCard(container)).toHaveClass('media-card--image-loaded'))
    expect(getCard(container)).not.toHaveAttribute('data-glass-optical-mode')

    await rerender({ media: mediaB, width: '9rem' })
    await waitFor(() => expect(requests.some(request => request.src.includes('/w500/b.jpg'))).toBe(true))
    expect(getCard(container)).not.toHaveAttribute('data-glass-optical-mode')

    requests[0].reveal()
    await Promise.resolve()
    expect(getCard(container)).not.toHaveAttribute('data-glass-optical-mode')

    const currentRequest = requests.find(request => request.src.includes('/w500/b.jpg'))
    currentRequest?.load()
    await waitFor(() => expect(getCard(container)).toHaveClass('media-card--image-loaded'))
    expect(getCard(container)).not.toHaveAttribute('data-glass-optical-mode')

    currentRequest?.reveal()
    await waitFor(() => expect(getCard(container)).toHaveAttribute('data-glass-optical-mode', 'excluded'))
  })

  it.each([
    [
      'AniList',
      createMediaInfo({
        anilist_id: 154588,
        poster_path: '/original/anilist.jpg',
        media_source: 'anilist',
        tmdb_id: undefined,
        type: '电视剧',
      }),
      'mdi-alpha-a-circle',
      '#02a9ff',
    ],
    [
      'TheAudioDB',
      createMediaInfo({
        cover_url: 'https://example.com/theaudiodb.jpg',
        media_id: 'album-2109619',
        music_type: 'album',
        poster_path: undefined,
        media_source: 'theaudiodb',
        tmdb_id: undefined,
        type: '音乐',
      }),
      'mdi-music-box-multiple',
      '#35a7a0',
    ],
    [
      '豆瓣音乐',
      createMediaInfo({
        cover_url: 'https://example.com/doubanmusic.jpg',
        media_id: '1401853',
        music_type: 'album',
        poster_path: undefined,
        media_source: 'doubanmusic',
        tmdb_id: undefined,
        type: '音乐',
      }),
      'mdi-music-circle',
      '#00b51d',
    ],
  ])('renders the %s source badge after the cover loads', async (_label, media, icon, color) => {
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
      props: ['color', 'icon'],
      template: '<i :data-color="color" :data-icon="icon" />',
    }
    const { container } = await renderWithProviders(MediaCard, {
      props: { media, width: '9rem' },
      initialState: { user: { superUser: true } },
      global: { stubs: { VIcon: VIconStub, VImg: VImgStub } },
    })

    await fireEvent.click(container.querySelector('[aria-label="图片加载成功"]') as HTMLElement)

    await waitFor(() => expect(container.querySelector(`[data-icon="${icon}"]`)).toHaveAttribute('data-color', color))
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
