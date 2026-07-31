import type { MediaInfo } from '@/api/types'
import MediaCardListView from '@/views/discover/MediaCardListView.vue'
import { fireEvent, screen, waitFor } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { createMediaInfo } from '@tests/support/factories/media'
import { server } from '@tests/support/msw/server'
import { renderWithProviders } from '@tests/support/render'
import { HttpResponse, http, type JsonBodyType } from 'msw'
import { defineComponent, h, onMounted, ref, type PropType } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const API_BASE_URL = 'http://localhost/api/v1/'
const LIST_PATH = 'test/discover/list'
const LIST_URL = new URL(LIST_PATH, API_BASE_URL).href

type InfiniteScrollStatus = 'empty' | 'error' | 'ok'
const initialLoadMargins: number[] = []

const InfiniteScrollStub = defineComponent({
  name: 'VInfiniteScroll',
  props: {
    items: {
      type: Array as PropType<MediaInfo[]>,
      default: () => [],
    },
    margin: {
      type: Number,
      required: true,
    },
  },
  emits: ['load'],
  setup(props, { emit, slots }) {
    const status = ref<'empty' | 'error' | 'idle' | 'loading'>('idle')

    function load() {
      initialLoadMargins.push(props.margin)
      status.value = 'loading'
      emit('load', {
        done(nextStatus: InfiniteScrollStatus) {
          status.value = nextStatus === 'ok' ? 'idle' : nextStatus
        },
      })
    }

    onMounted(load)

    return () =>
      h('section', { 'aria-label': '媒体无限列表', 'data-margin': String(props.margin) }, [
        h('output', { 'aria-label': '媒体无限列表状态' }, status.value),
        status.value === 'error'
          ? slots.error?.({
              side: 'end',
              props: { color: undefined, onClick: load },
            })
          : null,
        slots.default?.(),
        h(
          'button',
          {
            'aria-label': '触发媒体列表加载',
            onClick: load,
            type: 'button',
          },
          '加载更多',
        ),
      ])
  },
})

const ProgressiveCardGridStub = defineComponent({
  name: 'ProgressiveCardGrid',
  props: {
    getItemKey: {
      type: Function as PropType<(item: MediaInfo, index: number) => string | number>,
      required: true,
    },
    items: {
      type: Array as PropType<MediaInfo[]>,
      required: true,
    },
  },
  setup(props, { slots }) {
    return () =>
      h('section', { 'aria-label': '媒体渐进网格' }, [
        h(
          'output',
          { 'aria-label': '媒体渐进网格键' },
          JSON.stringify(props.items.map((item, index) => props.getItemKey(item, index))),
        ),
        ...props.items.flatMap(item => slots.default?.({ item }) ?? []),
      ])
  },
})

const MediaCardStub = defineComponent({
  name: 'MediaCard',
  props: {
    media: {
      type: Object as PropType<MediaInfo>,
      required: true,
    },
  },
  setup(props) {
    return () => h('article', { 'aria-label': `媒体卡片 ${props.media.title}` }, props.media.title)
  },
})

const LoadingBannerStub = defineComponent({
  name: 'LoadingBanner',
  template: '<div role="status">正在加载媒体列表</div>',
})

const NoDataFoundStub = defineComponent({
  name: 'NoDataFound',
  props: {
    errorDescription: String,
    errorTitle: String,
  },
  template: '<section aria-label="媒体列表空态">{{ errorTitle }} {{ errorDescription }}</section>',
})

interface Deferred {
  promise: Promise<void>
  resolve: () => void
}

function createDeferred(): Deferred {
  let resolve!: () => void
  const promise = new Promise<void>(done => {
    resolve = done
  })
  return { promise, resolve }
}

function setScrollHeight(getHeight: () => number) {
  vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(600)
  vi.spyOn(document.body, 'scrollHeight', 'get').mockImplementation(getHeight)
}

async function renderList(
  options: {
    apipath?: string
    params?: Record<string, unknown>
  } = {},
) {
  return renderWithProviders(MediaCardListView, {
    props: {
      apipath: Object.prototype.hasOwnProperty.call(options, 'apipath') ? options.apipath : LIST_PATH,
      params: options.params,
    },
    global: {
      stubs: {
        LoadingBanner: LoadingBannerStub,
        MediaCard: MediaCardStub,
        NoDataFound: NoDataFoundStub,
        ProgressiveCardGrid: ProgressiveCardGridStub,
        VInfiniteScroll: InfiniteScrollStub,
      },
    },
  })
}

function gridKeys() {
  return JSON.parse(screen.getByRole('status', { name: '媒体渐进网格键' }).textContent || '[]') as Array<
    string | number
  >
}

describe('MediaCardListView', () => {
  beforeEach(() => {
    initialLoadMargins.length = 0
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('keeps the component-owned page ahead of a page value in browse query params', async () => {
    setScrollHeight(() => 900)
    const requests: URL[] = []
    server.use(
      http.get(LIST_URL, ({ request }) => {
        requests.push(new URL(request.url))
        return HttpResponse.json([createMediaInfo({ title: '内部页码结果' })])
      }),
    )

    await renderList({ params: { genre: '科幻', page: '99' } })

    expect(await screen.findByRole('article', { name: '媒体卡片 内部页码结果' })).toBeInTheDocument()
    expect(screen.getByLabelText('媒体无限列表')).toHaveAttribute('data-margin', '600')
    expect(initialLoadMargins[0]).toBe(0)
    expect(requests).toHaveLength(1)
    expect(requests[0].searchParams.get('page')).toBe('1')
    expect(requests[0].searchParams.get('genre')).toBe('科幻')
  })

  it('loads only one page when the viewport is already scrollable', async () => {
    setScrollHeight(() => 900)
    const requestedPages: string[] = []
    server.use(
      http.get(LIST_URL, ({ request }) => {
        const page = new URL(request.url).searchParams.get('page') ?? ''
        requestedPages.push(page)
        return HttpResponse.json([createMediaInfo({ title: '单页媒体' })])
      }),
    )

    await renderList()

    expect(await screen.findByRole('article', { name: '媒体卡片 单页媒体' })).toBeInTheDocument()
    expect(requestedPages).toEqual(['1'])
  })

  it('loads consecutive pages until an underfilled viewport becomes scrollable', async () => {
    const requestedPages: string[] = []
    setScrollHeight(() => (requestedPages.length >= 2 ? 900 : 500))
    server.use(
      http.get(LIST_URL, ({ request }) => {
        const page = new URL(request.url).searchParams.get('page') ?? ''
        requestedPages.push(page)
        return HttpResponse.json([createMediaInfo({ title: page === '1' ? '未满屏第一页' : '未满屏第二页' })])
      }),
    )

    await renderList()

    expect(await screen.findByRole('article', { name: '媒体卡片 未满屏第一页' })).toBeInTheDocument()
    expect(await screen.findByRole('article', { name: '媒体卡片 未满屏第二页' })).toBeInTheDocument()
    expect(requestedPages).toEqual(['1', '2'])
  })

  it('deduplicates the complete composite identity and uses it for stable render keys', async () => {
    setScrollHeight(() => 900)
    const base = createMediaInfo({
      anilist_id: 4200,
      bangumi_id: 'bangumi-42',
      douban_id: 'douban-42',
      imdb_id: 'tt0000042',
      media_id: 'media-42',
      mediaid_prefix: 'fixture',
      season: 1,
      source: 'themoviedb',
      title: '复合标识基准',
      tmdb_id: 42,
      tvdb_id: 'tvdb-42',
      type: '电视剧',
    })
    const variants: Array<Partial<MediaInfo>> = [
      { source: 'douban', title: '不同 source' },
      { type: '电影', title: '不同 type' },
      { season: 2, title: '不同 season' },
      { tmdb_id: 43, title: '不同 tmdb_id' },
      { imdb_id: 'tt0000043', title: '不同 imdb_id' },
      { tvdb_id: 'tvdb-43', title: '不同 tvdb_id' },
      { douban_id: 'douban-43', title: '不同 douban_id' },
      { bangumi_id: 'bangumi-43', title: '不同 bangumi_id' },
      { anilist_id: 4300, title: '不同 anilist_id' },
      { mediaid_prefix: 'fixture-v2', title: '不同 mediaid_prefix' },
      { media_id: 'media-43', title: '不同 media_id' },
    ]
    const response = [base, { ...base, title: '完全重复项' }, ...variants.map(variant => ({ ...base, ...variant }))]
    server.use(http.get(LIST_URL, () => HttpResponse.json(response as unknown as JsonBodyType)))

    await renderList()

    expect(await screen.findByRole('article', { name: '媒体卡片 复合标识基准' })).toBeInTheDocument()
    expect(screen.queryByRole('article', { name: '媒体卡片 完全重复项' })).not.toBeInTheDocument()
    expect(screen.getAllByRole('article')).toHaveLength(variants.length + 1)
    const identityFields = [
      'source',
      'type',
      'season',
      'tmdb_id',
      'imdb_id',
      'tvdb_id',
      'douban_id',
      'bangumi_id',
      'anilist_id',
      'mediaid_prefix',
      'media_id',
    ] as const
    const expectedItems = [base, ...variants.map(variant => ({ ...base, ...variant }))]
    expect(gridKeys()).toEqual(
      expectedItems.map(item => JSON.stringify(identityFields.map(field => item[field] ?? null))),
    )
  })

  it('continues after a first-seen page signature whose items were all seen globally', async () => {
    const requestedPages: string[] = []
    setScrollHeight(() => (requestedPages.length >= 3 ? 900 : 500))
    const first = createMediaInfo({ title: '签名第一页 A', tmdb_id: 101 })
    const second = createMediaInfo({ title: '签名第一页 B', tmdb_id: 102 })
    const later = createMediaInfo({ title: '签名第三页新媒体', tmdb_id: 103 })
    server.use(
      http.get(LIST_URL, ({ request }) => {
        const page = new URL(request.url).searchParams.get('page') ?? ''
        requestedPages.push(page)
        if (page === '1') return HttpResponse.json([first, second] as unknown as JsonBodyType)
        if (page === '2') return HttpResponse.json([{ ...first, title: '第二页全重复' }] as unknown as JsonBodyType)
        return HttpResponse.json([later] as unknown as JsonBodyType)
      }),
    )

    await renderList()

    expect(await screen.findByRole('article', { name: '媒体卡片 签名第三页新媒体' })).toBeInTheDocument()
    expect(screen.queryByRole('article', { name: '媒体卡片 第二页全重复' })).not.toBeInTheDocument()
    expect(requestedPages).toEqual(['1', '2', '3'])
  })

  it('stops when a raw page repeats any historical identity set regardless of order and duplicate count', async () => {
    const requestedPages: string[] = []
    setScrollHeight(() => (requestedPages.length >= 3 ? 900 : 500))
    const first = createMediaInfo({ title: '历史签名 A', tmdb_id: 201 })
    const second = createMediaInfo({ title: '历史签名 B', tmdb_id: 202 })
    const between = createMediaInfo({ title: '中间签名 C', tmdb_id: 203 })
    server.use(
      http.get(LIST_URL, ({ request }) => {
        const page = new URL(request.url).searchParams.get('page') ?? ''
        requestedPages.push(page)
        if (page === '1') {
          return HttpResponse.json([first, { ...first, title: '页内重复 A' }, second] as unknown as JsonBodyType)
        }
        if (page === '2') return HttpResponse.json([between] as unknown as JsonBodyType)
        return HttpResponse.json([{ ...second }, { ...first }] as unknown as JsonBodyType)
      }),
    )

    await renderList()

    expect(await screen.findByRole('article', { name: '媒体卡片 中间签名 C' })).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('status', { name: '媒体无限列表状态' })).toHaveTextContent('empty'))
    expect(requestedPages).toEqual(['1', '2', '3'])
    expect(screen.getAllByRole('article')).toHaveLength(3)
  })

  it('marks an empty first page as the pagination terminal state', async () => {
    setScrollHeight(() => 900)
    server.use(http.get(LIST_URL, () => HttpResponse.json([])))

    await renderList()

    await waitFor(() => expect(screen.getByRole('status', { name: '媒体无限列表状态' })).toHaveTextContent('empty'))
    expect(screen.queryByText('正在加载媒体列表')).not.toBeInTheDocument()
  })

  it('renders HTTP 200 plus an empty array as ordinary no-data rather than a network error', async () => {
    setScrollHeight(() => 900)
    server.use(http.get(LIST_URL, () => HttpResponse.json([])))

    await renderList()

    const emptyState = await screen.findByRole('region', { name: '媒体列表空态' })
    expect(emptyState).toHaveTextContent('暂无数据')
    expect(emptyState).not.toHaveTextContent('无法获取到媒体信息，请检查网络连接。')
  })

  it('retries the same first page after an initial HTTP failure', async () => {
    setScrollHeight(() => 900)
    const requestedPages: string[] = []
    server.use(
      http.get(LIST_URL, ({ request }) => {
        const page = new URL(request.url).searchParams.get('page') ?? ''
        requestedPages.push(page)
        if (requestedPages.length === 1) return HttpResponse.json({ detail: 'failed' }, { status: 500 })
        return HttpResponse.json([createMediaInfo({ title: '首载重试成功' })])
      }),
    )
    const user = userEvent.setup()

    await renderList()
    const retryButton = await screen.findByRole('button', { name: '重试' })
    expect(screen.queryByText('正在加载媒体列表')).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: '媒体列表空态' })).not.toBeInTheDocument()
    await user.click(retryButton)

    expect(await screen.findByRole('article', { name: '媒体卡片 首载重试成功' })).toBeInTheDocument()
    expect(requestedPages).toEqual(['1', '1'])
  })

  it('keeps existing cards and retries the same later page after an HTTP failure', async () => {
    setScrollHeight(() => 900)
    const requestedPages: string[] = []
    let pageTwoAttempts = 0
    server.use(
      http.get(LIST_URL, ({ request }) => {
        const page = new URL(request.url).searchParams.get('page') ?? ''
        requestedPages.push(page)
        if (page === '1') return HttpResponse.json([createMediaInfo({ title: '保留第一页' })])
        pageTwoAttempts += 1
        if (pageTwoAttempts === 1) return HttpResponse.json({ detail: 'failed' }, { status: 500 })
        return HttpResponse.json([createMediaInfo({ title: '第二页重试成功' })])
      }),
    )
    const user = userEvent.setup()

    await renderList()
    expect(await screen.findByRole('article', { name: '媒体卡片 保留第一页' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '触发媒体列表加载' }))
    await user.click(await screen.findByRole('button', { name: '重试' }))

    expect(await screen.findByRole('article', { name: '媒体卡片 第二页重试成功' })).toBeInTheDocument()
    expect(screen.getByRole('article', { name: '媒体卡片 保留第一页' })).toBeInTheDocument()
    expect(requestedPages).toEqual(['1', '2', '2'])
  })

  it('deduplicates load events while the current page request is still in flight', async () => {
    setScrollHeight(() => 900)
    const gate = createDeferred()
    const requests: URL[] = []
    server.use(
      http.get(LIST_URL, async ({ request }) => {
        requests.push(new URL(request.url))
        await gate.promise
        return HttpResponse.json([createMediaInfo({ title: '在途请求结果' })])
      }),
    )

    await renderList()
    await waitFor(() => expect(requests).toHaveLength(1))

    try {
      await fireEvent.click(screen.getByRole('button', { name: '触发媒体列表加载' }))
      await fireEvent.click(screen.getByRole('button', { name: '触发媒体列表加载' }))
      expect(requests).toHaveLength(1)
    } finally {
      gate.resolve()
    }

    expect(await screen.findByRole('article', { name: '媒体卡片 在途请求结果' })).toBeInTheDocument()
    expect(requests[0].searchParams.get('page')).toBe('1')
  })
})
