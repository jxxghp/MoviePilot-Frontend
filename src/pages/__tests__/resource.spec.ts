import type { Context, SubtitleInfo } from '@/api/types'
import ResourcePage from '@/pages/resource.vue'
import { DEFAULT_PERMISSIONS } from '@/utils/permission'
import { fireEvent, screen, waitFor } from '@testing-library/vue'
import { renderWithProviders } from '@tests/support/render'
import { defineComponent, nextTick } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  dynamicButtonOptions: undefined as unknown as { onClick: () => void },
  keepAliveRefresh: undefined as unknown as () => Promise<void>,
  toastError: vi.fn(),
  useDynamicButton: vi.fn(),
}))

const musicBrainzAlbumId = '695f5ac8-cfd5-4e7b-96a0-6d545f5c9f17'

vi.mock('@/api', () => ({
  default: createDataApiMock({
    get: (...args: unknown[]) => mocks.apiGet(...args),
    post: (...args: unknown[]) => mocks.apiPost(...args),
  }),
}))

vi.mock('@/composables/useDynamicButton', () => ({
  useDynamicButton: (options: { onClick: () => void }) => {
    mocks.dynamicButtonOptions = options
    mocks.useDynamicButton(options)
  },
}))

vi.mock('@/composables/useKeepAliveRefresh', () => ({
  useKeepAliveRefresh: (refresh: () => Promise<void>) => {
    mocks.keepAliveRefresh = refresh
    return { refresh }
  },
}))

vi.mock('@/composables/usePWA', async () => {
  const { ref } = await import('vue')
  return {
    usePWA: () => ({ appMode: ref(false) }),
  }
})

vi.mock('vue-toastification', () => ({
  useToast: () => ({
    error: mocks.toastError,
  }),
}))

class EventSourceFake {
  static readonly CLOSED = 2
  static readonly CONNECTING = 0
  static readonly OPEN = 1
  static instances: EventSourceFake[] = []

  readonly CLOSED = EventSourceFake.CLOSED
  readonly CONNECTING = EventSourceFake.CONNECTING
  readonly OPEN = EventSourceFake.OPEN
  readonly url: string
  readonly withCredentials = false
  onerror: ((event: Event) => void) | null = null
  onmessage: ((event: MessageEvent<string>) => void) | null = null
  onopen: ((event: Event) => void) | null = null
  readyState = EventSourceFake.CONNECTING
  closed = false

  constructor(url: string | URL) {
    this.url = String(url)
    EventSourceFake.instances.push(this)
  }

  addEventListener() {}
  dispatchEvent() {
    return true
  }
  removeEventListener() {}

  close() {
    this.closed = true
    this.readyState = EventSourceFake.CLOSED
  }

  fail() {
    this.onerror?.(new Event('error'))
  }

  message(payload: Record<string, unknown>) {
    this.onmessage?.(new MessageEvent('message', { data: JSON.stringify(payload) }))
  }
}

interface TorrentOverrides {
  name?: string
  pageUrl?: string
  site?: string
  title?: string
}

interface SearchRouteCase {
  apiEndpoint: string
  apiParams: Record<string, string>
  displayTitle: string
  expectedPath: string
  query: Record<string, string>
  result: Context | SubtitleInfo
  streamParams: Record<string, string>
}

function createTorrent(overrides: TorrentOverrides = {}): Context {
  return {
    media_info: {},
    meta_info: {
      edition: 'WEB-DL',
      name: overrides.name ?? '测试媒体',
      resource_pix: '1080p',
      resource_team: 'Team A',
      season_episode: 'S01',
      video_encode: 'H.264',
    },
    torrent_info: {
      page_url: overrides.pageUrl ?? `https://example.test/${overrides.title ?? 'torrent'}`,
      pri_order: 0,
      pubdate: '2025-01-01T00:00:00Z',
      seeders: 1,
      site_name: overrides.site ?? 'Site A',
      size: 1,
      title: overrides.title ?? '测试资源',
      volume_factor: 'FREE',
    },
  } as Context
}

function createSubtitle(title: string): SubtitleInfo {
  return {
    enclosure: `https://example.test/${title}.srt`,
    site_name: 'Subtitle Site',
    subtitle_id: title,
    title,
  }
}

const TorrentCardStub = defineComponent({
  props: {
    torrent: { type: Object, required: true },
  },
  template: '<article data-testid="torrent-card">{{ torrent.torrent_info.title }}</article>',
})

const TorrentItemStub = defineComponent({
  props: {
    torrent: { type: Object, required: true },
  },
  template: '<article data-testid="torrent-row">{{ torrent.torrent_info.title }}</article>',
})

const SubtitleCardStub = defineComponent({
  props: {
    subtitle: { type: Object, required: true },
    mediaSource: String,
    mediaId: String,
  },
  template:
    '<article data-testid="subtitle-card" :data-media-source="mediaSource || \'\'" :data-media-id="mediaId || \'\'">{{ subtitle.title }}</article>',
})

const SubtitleItemStub = defineComponent({
  props: {
    subtitle: { type: Object, required: true },
    mediaSource: String,
    mediaId: String,
  },
  template:
    '<article data-testid="subtitle-row" :data-media-source="mediaSource || \'\'" :data-media-id="mediaId || \'\'">{{ subtitle.title }}</article>',
})

const ProgressiveCardGridStub = defineComponent({
  props: {
    items: { type: Array, required: true },
  },
  template: `
    <div>
      <template v-for="(item, index) in items" :key="index">
        <slot :item="item" :index="index" />
      </template>
    </div>
  `,
})

const TorrentFilterBarStub = defineComponent({
  props: {
    filterForm: { type: Object, required: true },
    sortField: { type: String, required: true },
  },
  emits: ['update:filterForm', 'update:sortField'],
  template: `
    <section
      data-testid="torrent-filter-bar"
      :data-sites="filterForm.site.join(',')"
      :data-sort-field="sortField"
    >
      <button type="button" @click="$emit('update:filterForm', 'site', ['Site A'])">筛选 Site A</button>
      <button type="button" @click="$emit('update:sortField', 'size')">按体积排序</button>
    </section>
  `,
})

const NoDataFoundStub = defineComponent({
  props: {
    errorDescription: { type: String, default: '' },
    errorTitle: { type: String, default: '' },
  },
  template: '<section data-testid="no-data">{{ errorTitle }} {{ errorDescription }}</section>',
})

const PassThroughStub = defineComponent({
  template: '<div><slot /></div>',
})

const RefreshButtonStub = defineComponent({
  props: {
    disabled: Boolean,
    loading: Boolean,
  },
  emits: ['click'],
  template:
    '<button type="button" aria-label="重新搜索" :disabled="disabled || loading" @click="$emit(\'click\')"><slot /></button>',
})

const pageStubs = {
  IconBtn: RefreshButtonStub,
  LoadingBanner: PassThroughStub,
  NoDataFound: NoDataFoundStub,
  ProgressiveCardGrid: ProgressiveCardGridStub,
  SubtitleCard: SubtitleCardStub,
  SubtitleItem: SubtitleItemStub,
  Teleport: true,
  TorrentCard: TorrentCardStub,
  TorrentFilterBar: TorrentFilterBarStub,
  TorrentItem: TorrentItemStub,
  VExpandXTransition: PassThroughStub,
  VFadeTransition: PassThroughStub,
  VScrollToTopBtn: true,
}

async function renderResource(
  initialRoute: { path: string; query?: Record<string, string> } = { path: '/resource' },
  aiEnabled = false,
) {
  return renderWithProviders(ResourcePage, {
    initialRoute,
    initialState: {
      globalSettings: {
        data: { AI_RECOMMEND_ENABLED: aiEnabled },
        initialized: true,
        loading: false,
      },
      user: {
        permissions: { ...DEFAULT_PERMISSIONS, search: true },
        superUser: false,
      },
    },
    stubActions: false,
    global: { stubs: pageStubs },
  })
}

async function latestEventSource(expectedCount = 1) {
  await waitFor(() => expect(EventSourceFake.instances).toHaveLength(expectedCount))
  return EventSourceFake.instances[expectedCount - 1]
}

function finishStream(source: EventSourceFake, items: Array<Context | SubtitleInfo>) {
  source.message({
    items,
    total_items: items.length,
    type: 'replace',
    value: 100,
  })
  source.message({ type: 'done' })
  source.fail()
}

async function flushAsyncWork() {
  await Promise.resolve()
  await Promise.resolve()
  await nextTick()
  await new Promise(resolve => window.setTimeout(resolve, 0))
}

const searchRouteCases: SearchRouteCase[] = [
  {
    apiEndpoint: 'search/title',
    apiParams: { keyword: '普通标题', sites: '1,2' },
    displayTitle: '普通标题结果',
    expectedPath: '/api/v1/search/title/stream',
    query: { keyword: '普通标题', result_type: 'invalid', sites: '1,2' },
    result: createTorrent({ title: '普通标题结果' }),
    streamParams: { keyword: '普通标题', sites: '1,2' },
  },
  {
    apiEndpoint: 'search/media/42',
    apiParams: {
      area: 'CN',
      media_source: 'themoviedb',
      mtype: '电视剧',
      season: '2',
      sites: '1',
      title: '媒体标题',
      year: '2025',
    },
    displayTitle: '媒体资源结果',
    expectedPath: '/api/v1/search/media/42/stream',
    query: {
      area: 'CN',
      media_id: '42',
      media_source: 'themoviedb',
      result_type: 'torrent',
      season: '2',
      sites: '1',
      title: '媒体标题',
      type: '电视剧',
      year: '2025',
    },
    result: createTorrent({ title: '媒体资源结果' }),
    streamParams: {
      area: 'CN',
      media_source: 'themoviedb',
      mtype: '电视剧',
      season: '2',
      sites: '1',
      title: '媒体标题',
      year: '2025',
    },
  },
  {
    apiEndpoint: 'search/title',
    apiParams: { keyword: '周杰伦', mtype: '音乐', sites: '11,22' },
    displayTitle: '音乐资源结果',
    expectedPath: '/api/v1/search/title/stream',
    query: { keyword: '周杰伦', result_type: 'torrent', sites: '11,22', type: '音乐' },
    result: createTorrent({ title: '音乐资源结果' }),
    streamParams: { keyword: '周杰伦', mtype: '音乐', sites: '11,22' },
  },
  {
    apiEndpoint: `search/media/${musicBrainzAlbumId}`,
    apiParams: {
      area: 'title',
      media_source: 'musicbrainz',
      mtype: '音乐',
      music_type: 'album',
      title: '叶惠美',
      year: '2003',
    },
    displayTitle: '专辑资源结果',
    expectedPath: `/api/v1/search/media/${musicBrainzAlbumId}/stream`,
    query: {
      area: 'title',
      media_id: musicBrainzAlbumId,
      media_source: 'musicbrainz',
      music_type: 'album',
      result_type: 'torrent',
      title: '叶惠美',
      type: '音乐',
      year: '2003',
    },
    result: createTorrent({ title: '专辑资源结果' }),
    streamParams: {
      area: 'title',
      media_source: 'musicbrainz',
      mtype: '音乐',
      music_type: 'album',
      title: '叶惠美',
      year: '2003',
    },
  },
  {
    apiEndpoint: 'search/subtitle/title',
    apiParams: { keyword: '字幕标题', sites: '2' },
    displayTitle: '字幕标题结果',
    expectedPath: '/api/v1/search/subtitle/title/stream',
    query: { keyword: '字幕标题', result_type: 'subtitle', sites: '2' },
    result: createSubtitle('字幕标题结果'),
    streamParams: { keyword: '字幕标题', sites: '2' },
  },
  {
    apiEndpoint: 'search/subtitle/media/84',
    apiParams: {
      episode: '3',
      media_source: 'themoviedb',
      mtype: '电视剧',
      season: '2',
      sites: '2',
      title: '字幕媒体',
      year: '2025',
    },
    displayTitle: '字幕媒体结果',
    expectedPath: '/api/v1/search/subtitle/media/84/stream',
    query: {
      episode: '3',
      media_id: '84',
      media_source: 'themoviedb',
      result_type: 'subtitle',
      season: '2',
      sites: '2',
      title: '字幕媒体',
      type: '电视剧',
      year: '2025',
    },
    result: createSubtitle('字幕媒体结果'),
    streamParams: {
      episode: '3',
      media_source: 'themoviedb',
      mtype: '电视剧',
      season: '2',
      sites: '2',
      title: '字幕媒体',
      year: '2025',
    },
  },
]

describe('resource page search flow', () => {
  beforeEach(() => {
    EventSourceFake.instances = []
    vi.stubGlobal('EventSource', EventSourceFake)
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    mocks.apiGet.mockImplementation((endpoint: string) => {
      if (endpoint === 'search/last/context') {
        return Promise.resolve({ success: true, data: { params: null, results: [] } })
      }
      throw new Error(`Unexpected GET ${endpoint}`)
    })
    mocks.apiPost.mockResolvedValue({ success: true, data: { status: 'disabled' } })
  })

  it.each(searchRouteCases)(
    'projects route input into the $apiEndpoint stream and exact fallback request',
    async ({ apiEndpoint, apiParams, displayTitle, expectedPath, query, result, streamParams }) => {
      mocks.apiGet.mockResolvedValueOnce({ data: [result], success: true })
      const rendered = await renderResource({ path: '/resource', query })
      const source = await latestEventSource()
      const streamUrl = new URL(source.url)

      expect(streamUrl.pathname).toBe(expectedPath)
      expect(Object.fromEntries(streamUrl.searchParams)).toEqual({
        ...streamParams,
        _ts: expect.any(String),
        locale: 'zh-CN',
      })

      source.fail()

      await waitFor(() =>
        expect(mocks.apiGet).toHaveBeenCalledWith(apiEndpoint, {
          params: {
            ...apiParams,
            _ts: expect.any(String),
          },
        }),
      )
      expect(await screen.findByText(displayTitle)).toBeInTheDocument()
      if (query.result_type === 'subtitle') {
        expect(screen.getByTestId('subtitle-card')).toHaveAttribute('data-media-source', query.media_source ?? '')
        expect(screen.getByTestId('subtitle-card')).toHaveAttribute('data-media-id', query.media_id ?? '')
      }
      await waitFor(() => expect(rendered.router.currentRoute.value.query).toEqual({}))

      const storedParams = JSON.parse(localStorage.getItem('MP_ResourceSearchParams') || '{}')
      expect(storedParams).toEqual({
        area: query.area ?? '',
        episode: query.episode ?? '',
        keyword: query.keyword ?? '',
        media_id: query.media_id ?? '',
        media_source: query.media_source ?? '',
        music_type: query.music_type ?? '',
        result_type: query.result_type === 'subtitle' ? 'subtitle' : 'torrent',
        season: query.season ?? '',
        sites: query.sites ?? '',
        title: query.title ?? '',
        type: query.type ?? '',
        year: query.year ?? '',
      })
    },
  )

  it('clears damaged stored parameters and restores the last searchable context', async () => {
    const restored = createTorrent({ title: '上次搜索结果' })
    localStorage.setItem('MP_ResourceSearchParams', '{damaged')
    mocks.apiGet.mockResolvedValueOnce({
      success: true,
      data: {
        params: { keyword: '上次关键词', result_type: 'invalid', sites: '3' },
        results: [restored],
      },
    })

    await renderResource()

    expect(await screen.findByText('上次搜索结果')).toBeInTheDocument()
    expect(mocks.apiGet).toHaveBeenCalledOnce()
    expect(mocks.apiGet).toHaveBeenCalledWith('search/last/context')
    expect(JSON.parse(localStorage.getItem('MP_ResourceSearchParams') || '{}')).toEqual({
      area: '',
      episode: '',
      keyword: '上次关键词',
      media_id: '',
      media_source: '',
      music_type: '',
      result_type: 'torrent',
      season: '',
      sites: '3',
      title: '',
      type: '',
      year: '',
    })
  })

  it('migrates a legacy composite media keyword only when restoring local search state', async () => {
    localStorage.setItem(
      'MP_ResourceSearchParams',
      JSON.stringify({ keyword: 'tmdb:77', result_type: 'torrent', sites: '6', title: '旧版媒体' }),
    )

    await renderResource()
    await waitFor(() => expect(mocks.apiGet).toHaveBeenCalledWith('search/last/context'))

    const refreshPromise = mocks.keepAliveRefresh()
    const source = await latestEventSource()
    const streamUrl = new URL(source.url)
    expect(streamUrl.pathname).toBe('/api/v1/search/media/77/stream')
    expect(Object.fromEntries(streamUrl.searchParams)).toMatchObject({
      media_source: 'themoviedb',
      sites: '6',
      title: '旧版媒体',
    })

    finishStream(source, [])
    await refreshPromise
    expect(JSON.parse(localStorage.getItem('MP_ResourceSearchParams') || '{}')).toMatchObject({
      keyword: '',
      media_id: '77',
      media_source: 'themoviedb',
    })
  })

  it('ignores a zero media ID instead of starting a media identity search', async () => {
    await renderResource({
      path: '/resource',
      query: { media_id: '0', media_source: 'themoviedb', result_type: 'torrent' },
    })

    await waitFor(() => expect(mocks.apiGet).toHaveBeenCalledWith('search/last/context'))
    expect(EventSourceFake.instances).toHaveLength(0)
    expect(localStorage.getItem('MP_ResourceSearchParams')).toBeNull()
  })

  it('does not automatically repeat a completed empty search when KeepAlive reactivates', async () => {
    const rendered = await renderResource({
      path: '/resource',
      query: { keyword: '没有结果', result_type: 'torrent' },
    })
    const source = await latestEventSource()
    finishStream(source, [])
    await waitFor(() => expect(rendered.router.currentRoute.value.query).toEqual({}))

    await mocks.keepAliveRefresh()

    expect(EventSourceFake.instances).toHaveLength(1)
    expect(mocks.apiGet).not.toHaveBeenCalled()
  })

  it.each([
    {
      item: createTorrent({ title: '流式资源预览' }),
      query: { keyword: '流式资源', result_type: 'torrent' },
      testId: 'torrent-card',
      title: '流式资源预览',
    },
    {
      item: createSubtitle('流式字幕预览'),
      query: { keyword: '流式字幕', result_type: 'subtitle' },
      testId: 'subtitle-card',
      title: '流式字幕预览',
    },
  ])('shows $title from an append event before the final result arrives', async ({ item, query, testId, title }) => {
    await renderResource({ path: '/resource', query })
    const source = await latestEventSource()

    vi.useFakeTimers()
    try {
      source.message({
        items: [item],
        text: '正在聚合搜索结果',
        total_items: 2,
        type: 'append',
        value: 25,
      })
      await vi.advanceTimersByTimeAsync(1000)
      await nextTick()

      expect(screen.getByTestId(testId)).toHaveTextContent(title)
      source.message({ type: 'done' })
      source.fail()
    } finally {
      vi.useRealTimers()
    }
  })

  it('shows the SSE business error instead of replacing it with the generic empty-state message', async () => {
    const rendered = await renderResource({
      path: '/resource',
      query: { keyword: '业务失败', result_type: 'torrent' },
    })
    const source = await latestEventSource()

    source.message({
      message: '搜索服务暂不可用',
      type: 'error',
      value: 100,
    })

    expect(await screen.findByTestId('no-data')).toHaveTextContent('搜索服务暂不可用')
    await waitFor(() => expect(rendered.router.currentRoute.value.query).toEqual({}))
  })

  it('restores the default empty-state message when a new search succeeds without results', async () => {
    const rendered = await renderResource({
      path: '/resource',
      query: { keyword: '业务失败', result_type: 'torrent' },
    })
    const failedSource = await latestEventSource()
    failedSource.message({
      message: '搜索服务暂不可用',
      type: 'error',
      value: 100,
    })
    expect(await screen.findByTestId('no-data')).toHaveTextContent('搜索服务暂不可用')

    await rendered.router.push({
      path: '/resource',
      query: { keyword: '正常空结果', result_type: 'torrent' },
    })
    const emptySource = await latestEventSource(2)
    finishStream(emptySource, [])

    expect(await screen.findByTestId('no-data')).toHaveTextContent('未搜索到任何资源')
    expect(screen.queryByText('搜索服务暂不可用')).not.toBeInTheDocument()
  })

  it('shows a friendly message when all candidate resources are filtered out', async () => {
    await renderResource({
      path: '/resource',
      query: { keyword: '过滤空结果', result_type: 'torrent' },
    })
    const source = await latestEventSource()

    // 搜索阶段返回候选资源，最终替换事件为空表示全部被过滤规则淘汰
    source.message({
      items: [createTorrent({ title: '候选资源' })],
      stage: 'searching',
      total_items: 19,
      type: 'append',
    })
    source.message({
      candidate_items: 19,
      items: [],
      stage: 'filtered',
      total_items: 0,
      type: 'replace',
      value: 100,
    })
    source.message({ type: 'done' })
    source.fail()

    expect(await screen.findByTestId('no-data')).toHaveTextContent('找到 19 个资源，但均不符合过滤规则')
    expect(screen.queryByText('未搜索到任何资源')).not.toBeInTheDocument()
  })

  it('shows a friendly message when the done event reports filtered candidates for title search', async () => {
    await renderResource({
      path: '/resource',
      query: { keyword: '标题过滤空结果', result_type: 'torrent' },
    })
    const source = await latestEventSource()

    // 标题搜索没有 replace 事件，候选数由 done 事件的 candidate_items 携带
    source.message({
      candidate_items: 5,
      items: [],
      total_items: 0,
      type: 'done',
    })
    source.fail()

    expect(await screen.findByTestId('no-data')).toHaveTextContent('找到 5 个资源，但均不符合过滤规则')
  })

  it('restores the default empty-state message when the fallback request succeeds without results', async () => {
    mocks.apiGet.mockResolvedValueOnce({ data: [], success: true })
    const rendered = await renderResource({
      path: '/resource',
      query: { keyword: '降级空结果', result_type: 'torrent' },
    })
    const source = await latestEventSource()

    source.fail()

    expect(await screen.findByTestId('no-data')).toHaveTextContent('未搜索到任何资源')
    expect(screen.queryByText('搜索连接已断开')).not.toBeInTheDocument()
    await waitFor(() => expect(rendered.router.currentRoute.value.query).toEqual({}))
  })

  it('ignores heartbeat messages and accepts final results carried only by the done event', async () => {
    await renderResource({
      path: '/resource',
      query: { keyword: '收尾结果', result_type: 'torrent' },
    })
    const source = await latestEventSource()
    const result = createTorrent({ title: '仅在完成消息返回' })

    source.message({ type: 'heartbeat' })
    expect(screen.queryByText('仅在完成消息返回')).not.toBeInTheDocument()

    source.message({
      items: [result],
      total_items: 1,
      type: 'done',
      value: 100,
    })
    source.fail()

    expect(await screen.findByText('仅在完成消息返回')).toBeInTheDocument()
  })

  it('silently refreshes existing results and keeps them visible until the replacement is complete', async () => {
    const oldResult = createTorrent({ title: '现有结果' })
    const newResult = createTorrent({ title: '静默刷新结果' })
    await renderResource({
      path: '/resource',
      query: { keyword: '可刷新', result_type: 'torrent' },
    })
    const source = await latestEventSource()
    finishStream(source, [oldResult])
    expect(await screen.findByText('现有结果')).toBeInTheDocument()

    let resolveRefresh!: (value: unknown) => void
    mocks.apiGet.mockReturnValueOnce(
      new Promise(resolve => {
        resolveRefresh = resolve
      }),
    )
    const refreshPromise = mocks.keepAliveRefresh()
    await waitFor(() => expect(mocks.apiGet).toHaveBeenCalledOnce())

    expect(screen.getByText('现有结果')).toBeInTheDocument()
    expect(screen.queryByText('静默刷新结果')).not.toBeInTheDocument()

    resolveRefresh({ data: [newResult], success: true })
    await refreshPromise

    expect(await screen.findByText('静默刷新结果')).toBeInTheDocument()
    expect(screen.queryByText('现有结果')).not.toBeInTheDocument()
  })

  it('restores the default empty-state message after a failed silent refresh is followed by an empty success', async () => {
    await renderResource({
      path: '/resource',
      query: { keyword: '静默刷新空态', result_type: 'torrent' },
    })
    const source = await latestEventSource()
    finishStream(source, [createTorrent({ title: '刷新前结果' })])
    expect(await screen.findByText('刷新前结果')).toBeInTheDocument()

    mocks.apiGet.mockResolvedValueOnce({ message: '静默刷新失败', success: false })
    await expect(mocks.keepAliveRefresh()).rejects.toThrow('静默刷新失败')
    expect(screen.getByText('刷新前结果')).toBeInTheDocument()

    mocks.apiGet.mockResolvedValueOnce({ data: [], success: true })
    await mocks.keepAliveRefresh()

    expect(await screen.findByTestId('no-data')).toHaveTextContent('未搜索到任何资源')
    expect(screen.queryByText('静默刷新失败')).not.toBeInTheDocument()
  })

  it('falls back to card view for an invalid persisted view type', async () => {
    localStorage.setItem('MPTorrentsViewType', 'removed-view')
    await renderResource({
      path: '/resource',
      query: { keyword: '视图回退', result_type: 'torrent' },
    })
    const source = await latestEventSource()
    finishStream(source, [createTorrent({ title: '可见卡片结果' })])

    expect(await screen.findByTestId('torrent-card')).toHaveTextContent('可见卡片结果')
  })

  it('restores row view and persists the dynamic card/row toggle', async () => {
    localStorage.setItem('MPTorrentsViewType', 'row')
    await renderResource({
      path: '/resource',
      query: { keyword: '视图切换', result_type: 'torrent' },
    })
    const source = await latestEventSource()
    finishStream(source, [createTorrent({ title: '切换视图结果' })])

    expect(await screen.findByTestId('torrent-row')).toHaveTextContent('切换视图结果')

    mocks.dynamicButtonOptions.onClick()
    await nextTick()

    expect(screen.getByTestId('torrent-card')).toHaveTextContent('切换视图结果')
    expect(localStorage.getItem('MPTorrentsViewType')).toBe('card')
  })

  it('clears filters for a new route search', async () => {
    const rendered = await renderResource({
      path: '/resource',
      query: { keyword: '首次搜索', result_type: 'torrent' },
    })
    const firstSource = await latestEventSource()
    finishStream(firstSource, [createTorrent({ title: '首次结果' })])
    await fireEvent.click(await screen.findByRole('button', { name: '筛选 Site A' }))
    await waitFor(() => expect(screen.getByTestId('torrent-filter-bar')).toHaveAttribute('data-sites', 'Site A'))

    await rendered.router.push({
      path: '/resource',
      query: { keyword: '第二次搜索', result_type: 'torrent' },
    })
    const secondSource = await latestEventSource(2)
    finishStream(secondSource, [createTorrent({ title: '第二次结果' })])

    await waitFor(() => expect(screen.getByTestId('torrent-filter-bar')).toHaveAttribute('data-sites', ''))
  })

  it('does not let a late fallback response from an old search replace newer stream results', async () => {
    let resolveOldRequest!: (value: unknown) => void
    mocks.apiGet.mockReturnValueOnce(
      new Promise(resolve => {
        resolveOldRequest = resolve
      }),
    )
    const rendered = await renderResource({
      path: '/resource',
      query: { keyword: '旧搜索', result_type: 'torrent' },
    })
    const firstSource = await latestEventSource()
    firstSource.fail()
    await waitFor(() => expect(mocks.apiGet).toHaveBeenCalledOnce())

    await rendered.router.push({
      path: '/resource',
      query: { keyword: '新搜索', result_type: 'torrent' },
    })
    const secondSource = await latestEventSource(2)
    finishStream(secondSource, [createTorrent({ title: '新结果' })])
    expect(await screen.findByText('新结果')).toBeInTheDocument()

    resolveOldRequest({ data: [createTorrent({ title: '旧结果' })], success: true })
    await flushAsyncWork()

    expect(screen.getByText('新结果')).toBeInTheDocument()
    expect(screen.queryByText('旧结果')).not.toBeInTheDocument()
  })

  it('invalidates a pending fallback request when the page unmounts', async () => {
    let resolveRequest!: (value: unknown) => void
    mocks.apiGet.mockReturnValueOnce(
      new Promise(resolve => {
        resolveRequest = resolve
      }),
    )
    const initialQuery = { keyword: '卸载中的降级请求', result_type: 'torrent' }
    const rendered = await renderResource({ path: '/resource', query: initialQuery })
    const source = await latestEventSource()
    source.fail()
    await waitFor(() => expect(mocks.apiGet).toHaveBeenCalledOnce())
    expect(rendered.router.currentRoute.value.query).toEqual(initialQuery)
    const replaceSpy = vi.spyOn(rendered.router, 'replace')

    rendered.unmount()
    resolveRequest({ data: [createTorrent({ title: '卸载后结果' })], success: true })
    await flushAsyncWork()

    expect(replaceSpy).not.toHaveBeenCalled()
  })

  it('closes an active stream and ignores its completion when the page unmounts', async () => {
    const initialQuery = { keyword: '卸载中的流', result_type: 'torrent' }
    const rendered = await renderResource({ path: '/resource', query: initialQuery })
    const source = await latestEventSource()
    expect(rendered.router.currentRoute.value.query).toEqual(initialQuery)
    const replaceSpy = vi.spyOn(rendered.router, 'replace')

    rendered.unmount()
    source.message({ items: [], total_items: 0, type: 'done', value: 100 })
    source.fail()
    await flushAsyncWork()

    expect(source.closed).toBe(true)
    expect(replaceSpy).not.toHaveBeenCalled()
  })

  it('settles an active refresh stream when a newer route search replaces it', async () => {
    const rendered = await renderResource({
      path: '/resource',
      query: { keyword: '初始搜索', result_type: 'torrent' },
    })
    const initialSource = await latestEventSource()
    finishStream(initialSource, [createTorrent({ title: '初始结果' })])
    await screen.findByText('初始结果')

    await fireEvent.click(await screen.findByRole('button', { name: '重新搜索' }))
    const refreshSource = await latestEventSource(2)

    await rendered.router.push({
      path: '/resource',
      query: { keyword: '替代搜索', result_type: 'torrent' },
    })
    const replacementSource = await latestEventSource(3)
    expect(refreshSource.closed).toBe(true)
    finishStream(replacementSource, [createTorrent({ title: '替代结果' })])

    expect(await screen.findByText('替代结果')).toBeInTheDocument()
    await fireEvent.click(await screen.findByRole('button', { name: '重新搜索' }))
    await latestEventSource(4)
  })

  it('does not run a background search when another route updates the global query while the page is cached', async () => {
    const rendered = await renderResource({
      path: '/resource',
      query: { keyword: '前台搜索', result_type: 'torrent' },
    })
    const source = await latestEventSource()
    finishStream(source, [createTorrent({ title: '前台结果' })])
    await screen.findByText('前台结果')
    expect(EventSourceFake.instances).toHaveLength(1)

    // 模拟 keep-alive 缓存页在后台时，媒体详情路由携带与资源搜索一致的媒体身份参数
    await rendered.router.push({
      path: '/media',
      query: {
        media_source: 'themoviedb',
        media_id: '42',
        title: '媒体标题',
        year: '2025',
        type: '电视剧',
      },
    })
    await flushAsyncWork()

    expect(EventSourceFake.instances).toHaveLength(1)
    expect(mocks.apiGet).not.toHaveBeenCalledWith(
      'search/media/42',
      expect.objectContaining({ params: expect.objectContaining({ media_source: 'themoviedb' }) }),
    )
  })

  it('keeps the query of other routes when a search finishes after navigating away', async () => {
    const rendered = await renderResource({
      path: '/resource',
      query: { keyword: '待完成搜索', result_type: 'torrent' },
    })
    await latestEventSource()
    const replaceSpy = vi.spyOn(rendered.router, 'replace')

    // 搜索未完成时跳转到媒体详情页，模拟详情页路由携带媒体身份参数
    await rendered.router.push({
      path: '/media',
      query: {
        media_source: 'themoviedb',
        media_id: '42',
        title: '媒体标题',
        year: '2025',
        type: '电视剧',
      },
    })
    await flushAsyncWork()

    // 完成此刻仍处于打开状态的全部搜索流（含修复前的隐藏搜索流），
    // 确保任何残留搜索都不会清理其他页面的查询参数
    for (const source of EventSourceFake.instances) {
      finishStream(source, [createTorrent({ title: '后台结果' })])
    }
    await flushAsyncWork()

    expect(replaceSpy).not.toHaveBeenCalled()
    expect(rendered.router.currentRoute.value.query).toEqual({
      media_source: 'themoviedb',
      media_id: '42',
      title: '媒体标题',
      year: '2025',
      type: '电视剧',
    })
  })

  it('does not let a late business failure from an old fallback replace the current empty-state message', async () => {
    let resolveOldRequest!: (value: unknown) => void
    mocks.apiGet.mockReturnValueOnce(
      new Promise(resolve => {
        resolveOldRequest = resolve
      }),
    )
    const rendered = await renderResource({
      path: '/resource',
      query: { keyword: '旧失败搜索', result_type: 'torrent' },
    })
    const firstSource = await latestEventSource()
    firstSource.fail()
    await waitFor(() => expect(mocks.apiGet).toHaveBeenCalledOnce())

    await rendered.router.push({
      path: '/resource',
      query: { keyword: '当前空搜索', result_type: 'torrent' },
    })
    const secondSource = await latestEventSource(2)
    finishStream(secondSource, [])
    await waitFor(() => expect(screen.getByTestId('no-data')).toBeInTheDocument())

    resolveOldRequest({ message: '过期业务错误', success: false })
    await flushAsyncWork()

    expect(screen.queryByText(/过期业务错误/)).not.toBeInTheDocument()
  })

  it('does not let a late last-search context replace newer replay parameters', async () => {
    let resolveLastContext!: (value: unknown) => void
    mocks.apiGet.mockReturnValueOnce(
      new Promise(resolve => {
        resolveLastContext = resolve
      }),
    )
    const rendered = await renderResource()
    await waitFor(() => expect(mocks.apiGet).toHaveBeenCalledWith('search/last/context'))

    await rendered.router.push({
      path: '/resource',
      query: { keyword: '当前搜索', result_type: 'torrent', sites: '2' },
    })
    const source = await latestEventSource()
    finishStream(source, [createTorrent({ title: '当前结果' })])
    expect(await screen.findByText('当前结果')).toBeInTheDocument()

    resolveLastContext({
      success: true,
      data: {
        params: { keyword: '过期搜索', result_type: 'torrent', sites: '1' },
        results: [createTorrent({ title: '过期结果' })],
      },
    })
    await flushAsyncWork()

    expect(JSON.parse(localStorage.getItem('MP_ResourceSearchParams') || '{}')).toMatchObject({
      keyword: '当前搜索',
      sites: '2',
    })
    expect(screen.queryByText('过期结果')).not.toBeInTheDocument()
  })

  it('submits every grouped match to AI and restores filters after returning to original results', async () => {
    let statusChecks = 0
    mocks.apiPost.mockImplementation((_endpoint: string, body: Record<string, unknown>) => {
      if (body.check_only) {
        statusChecks += 1
        return Promise.resolve(
          statusChecks === 1
            ? { data: { status: 'idle' }, success: true }
            : { data: { results: [0], status: 'completed' }, success: true },
        )
      }
      return Promise.resolve({ success: true })
    })
    await renderResource(
      {
        path: '/resource',
        query: { keyword: 'AI 搜索', result_type: 'torrent' },
      },
      true,
    )
    const source = await latestEventSource()
    finishStream(source, [
      createTorrent({ pageUrl: 'https://example.test/group-a', site: 'Site A', title: '同组一' }),
      createTorrent({ pageUrl: 'https://example.test/group-b', site: 'Site A', title: '同组二' }),
      createTorrent({ name: '其他媒体', pageUrl: 'https://example.test/other', site: 'Site B', title: '其他结果' }),
    ])
    await fireEvent.click(await screen.findByRole('button', { name: '筛选 Site A' }))
    await waitFor(() => expect(screen.getByTestId('torrent-filter-bar')).toHaveAttribute('data-sites', 'Site A'))
    await waitFor(() =>
      expect(
        mocks.apiPost.mock.calls.some(
          ([endpoint, body]) =>
            endpoint === 'search/recommend' && (body as Record<string, unknown>).check_only === true,
        ),
      ).toBe(true),
    )
    const aiButton = screen.getAllByRole('button', { name: /智能推荐/ })[0]
    await waitFor(() => expect(aiButton).not.toBeDisabled())

    await fireEvent.click(aiButton)
    await waitFor(() => {
      const initialRequest = mocks.apiPost.mock.calls.find(
        ([endpoint, body]) => endpoint === 'search/recommend' && !(body as Record<string, unknown>).check_only,
      )
      expect(initialRequest?.[1]).toEqual({ filtered_indices: [0, 1] })
    })
    await waitFor(() => expect(screen.getByTestId('torrent-filter-bar')).toHaveAttribute('data-sites', ''))

    await fireEvent.click(screen.getAllByRole('button', { name: /智能推荐/ })[0])

    await waitFor(() => expect(screen.getByTestId('torrent-filter-bar')).toHaveAttribute('data-sites', 'Site A'))
  })
})
