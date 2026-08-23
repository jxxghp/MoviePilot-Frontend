import type { MediaInfo } from '@/api/types'
import SubscribePopularView from '@/views/subscribe/SubscribePopularView.vue'
import { screen, waitFor } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { createSubscribeMovie, createSubscribeTv } from '@tests/support/factories/subscribe'
import { popularSubscribesHandler, subscribeApiUrls } from '@tests/support/msw/handlers/subscribe'
import { server } from '@tests/support/msw/server'
import { renderWithProviders } from '@tests/support/render'
import { flushPromises } from '@vue/test-utils'
import { HttpResponse, http } from 'msw'
import { apiJson } from '@tests/support/msw/response'
import { defineComponent, h, onMounted, ref, type PropType } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

type InfiniteScrollStatus = 'empty' | 'error' | 'ok'
const initialLoadMargins: number[] = []

const InfiniteScrollStub = defineComponent({
  name: 'VInfiniteScroll',
  props: {
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
      h('section', { 'aria-label': '热门订阅无限列表', 'data-margin': String(props.margin) }, [
        h('output', { 'aria-label': '热门订阅无限列表状态' }, status.value),
        status.value === 'loading' ? slots.loading?.({}) : null,
        status.value === 'error'
          ? slots.error?.({
              side: 'end',
              props: { color: undefined, onClick: load },
            })
          : null,
        status.value === 'empty' ? slots.empty?.({}) : null,
        slots.default?.(),
        h(
          'button',
          {
            'aria-label': '触发热门订阅加载',
            onClick: load,
            type: 'button',
          },
          '触发热门订阅加载',
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
      h('section', { 'aria-label': '热门订阅渐进网格' }, [
        h(
          'output',
          { 'aria-label': '热门订阅渐进网格键' },
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
    return () => h('article', props.media.title)
  },
})

const LoadingBannerStub = defineComponent({
  name: 'LoadingBanner',
  template: '<div role="status">正在加载热门订阅</div>',
})

const NoDataFoundStub = defineComponent({
  name: 'NoDataFound',
  props: {
    errorDescription: String,
    errorTitle: String,
  },
  template: '<section aria-label="热门订阅空态">{{ errorTitle }} {{ errorDescription }}</section>',
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

function setHasScroll(hasScroll: boolean) {
  vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(600)
  return vi.spyOn(document.body, 'scrollHeight', 'get').mockReturnValue(hasScroll ? 900 : 500)
}

async function renderPopular(type: '电影' | '电视剧' = '电影') {
  return renderWithProviders(SubscribePopularView, {
    props: { type },
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

describe('SubscribePopularView', () => {
  beforeEach(() => {
    initialLoadMargins.length = 0
    vi.spyOn(console, 'error').mockImplementation(() => {})
    setHasScroll(true)
  })

  it.each([
    ['电影', () => createSubscribeMovie({ popularity: 18, title: '默认热门电影' })],
    ['电视剧', () => createSubscribeTv({ popularity: 27, title: '默认热门剧集' })],
  ] as const)('loads %s with the exact default query', async (type, createMedia) => {
    const requests: URL[] = []
    server.use(
      popularSubscribesHandler([createMedia()], 200, url => {
        requests.push(url)
      }),
    )

    await renderPopular(type)

    expect(await screen.findByText(type === '电影' ? '默认热门电影' : '默认热门剧集')).toBeInTheDocument()
    expect(screen.getByLabelText('热门订阅无限列表')).toHaveAttribute('data-margin', '480')
    expect(initialLoadMargins[0]).toBe(0)
    expect(screen.getByText(type === '电影' ? '18' : '27')).toBeInTheDocument()
    expect(requests).toHaveLength(1)
    expect(requests[0].searchParams.get('stype')).toBe(type)
    expect(requests[0].searchParams.get('page')).toBe('1')
    expect(requests[0].searchParams.get('count')).toBe('30')
    expect(requests[0].searchParams.get('sort_type')).toBe('count')
    expect(requests[0].searchParams.get('genre_id')).toBeNull()
    expect(requests[0].searchParams.get('min_rating')).toBeNull()
    expect(requests[0].searchParams.get('max_rating')).toBeNull()
    expect(requests[0].searchParams.get('min_sub')).toBeNull()
  })

  it('resets to page one with exact sort, genre and rating filters', async () => {
    const requests: URL[] = []
    server.use(
      http.get(subscribeApiUrls.popular, ({ request }) => {
        const url = new URL(request.url)
        requests.push(url)
        const title = url.searchParams.has('min_rating')
          ? '高分热门结果'
          : url.searchParams.has('genre_id')
            ? '动作热门结果'
            : url.searchParams.get('sort_type') === 'time'
              ? '最新热门结果'
              : '默认热门结果'
        return apiJson([createSubscribeMovie({ title })])
      }),
    )
    const user = userEvent.setup()

    await renderPopular()
    expect(await screen.findByText('默认热门结果')).toBeInTheDocument()

    await user.click(screen.getByText('最新'))
    expect(await screen.findByText('最新热门结果')).toBeInTheDocument()
    expect(screen.queryByText('默认热门结果')).not.toBeInTheDocument()

    await user.click(screen.getByText('动作'))
    expect(await screen.findByText('动作热门结果')).toBeInTheDocument()
    expect(screen.queryByText('最新热门结果')).not.toBeInTheDocument()

    screen.getByRole('slider').focus()
    await user.keyboard('{ArrowRight}'.repeat(7))
    expect(await screen.findByText('高分热门结果')).toBeInTheDocument()
    expect(screen.queryByText('动作热门结果')).not.toBeInTheDocument()

    expect(requests.length).toBeGreaterThanOrEqual(4)
    expect(requests.slice(1).every(url => url.searchParams.get('page') === '1')).toBe(true)
    expect(requests[1].searchParams.get('sort_type')).toBe('time')
    expect(requests[2].searchParams.get('genre_id')).toBe('28')
    expect(requests.at(-1)?.searchParams.get('min_rating')).toBe('7')
  })

  it('appends later pages and stops when a page is empty', async () => {
    const first = createSubscribeMovie({ title: '热门第一页' })
    const second = createSubscribeMovie({ title: '热门第二页' })
    const requestedPages: string[] = []
    server.use(
      http.get(subscribeApiUrls.popular, ({ request }) => {
        const page = new URL(request.url).searchParams.get('page') ?? ''
        requestedPages.push(page)
        if (page === '1') return apiJson([first])
        if (page === '2') return apiJson([second])
        return apiJson([])
      }),
    )
    const user = userEvent.setup()

    await renderPopular()
    expect(await screen.findByText('热门第一页')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '触发热门订阅加载' }))
    expect(await screen.findByText('热门第二页')).toBeInTheDocument()
    expect(screen.getByText('热门第一页')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '触发热门订阅加载' }))
    await waitFor(() => expect(requestedPages).toEqual(['1', '2', '3']))
    expect(screen.getByText('热门第一页')).toBeInTheDocument()
    expect(screen.getByText('热门第二页')).toBeInTheDocument()
  })

  it('deduplicates media across pages and stops when an identity set repeats', async () => {
    const first = createSubscribeMovie({ title: '热门去重第一页', tmdb_id: 810 })
    const second = createSubscribeMovie({ title: '热门去重第二页', tmdb_id: 820 })
    const requestedPages: string[] = []
    server.use(
      http.get(subscribeApiUrls.popular, ({ request }) => {
        const page = new URL(request.url).searchParams.get('page') ?? ''
        requestedPages.push(page)
        if (page === '1') return apiJson([first])
        if (page === '2') {
          return apiJson([{ ...first, title: '第一页跨页重复项' }, second])
        }
        return apiJson([
          { ...second, title: '第二页乱序重复项' },
          { ...first, title: '第一页乱序重复项' },
          { ...first, title: '第一页页内重复项' },
        ])
      }),
    )
    const user = userEvent.setup()

    await renderPopular()
    expect(await screen.findByText('热门去重第一页')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '触发热门订阅加载' }))
    expect(await screen.findByText('热门去重第二页')).toBeInTheDocument()
    expect(screen.queryByText('第一页跨页重复项')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '触发热门订阅加载' }))
    await waitFor(() => expect(requestedPages).toEqual(['1', '2', '3']))
    expect(screen.getByRole('status', { name: '热门订阅无限列表状态' })).toHaveTextContent('empty')
    expect(screen.queryByText('第二页乱序重复项')).not.toBeInTheDocument()
    expect(screen.queryByText('第一页乱序重复项')).not.toBeInTheDocument()
    expect(screen.queryByText('第一页页内重复项')).not.toBeInTheDocument()
  })

  it('keeps equal native IDs from different media sources as distinct items', async () => {
    server.use(
      popularSubscribesHandler([
        createSubscribeMovie({ media_id: '900', media_source: 'themoviedb', title: 'TMDB 媒体' }),
        createSubscribeMovie({
          media_id: '900',
          media_source: 'douban',
          title: '豆瓣媒体',
          tmdb_id: undefined,
        }),
      ]),
    )

    await renderPopular()

    expect(await screen.findByText('TMDB 媒体')).toBeInTheDocument()
    expect(screen.getByText('豆瓣媒体')).toBeInTheDocument()
    const keys = JSON.parse(screen.getByLabelText('热门订阅渐进网格键').textContent || '[]') as string[]
    expect(new Set(keys).size).toBe(2)
  })

  it('loads consecutive pages until an underfilled viewport becomes scrollable', async () => {
    const first = createSubscribeMovie({ title: '未满屏第一页' })
    const second = createSubscribeMovie({ title: '未满屏第二页' })
    const requestedPages: string[] = []
    const scrollHeight = vi
      .spyOn(document.body, 'scrollHeight', 'get')
      .mockImplementation(() => (requestedPages.length >= 2 ? 900 : 500))
    server.use(
      http.get(subscribeApiUrls.popular, ({ request }) => {
        const page = new URL(request.url).searchParams.get('page') ?? ''
        requestedPages.push(page)
        return apiJson(page === '1' ? [first] : [second])
      }),
    )

    await renderPopular()

    expect(await screen.findByText('未满屏第一页')).toBeInTheDocument()
    expect(await screen.findByText('未满屏第二页')).toBeInTheDocument()
    expect(requestedPages).toEqual(['1', '2'])
    scrollHeight.mockRestore()
  })

  it('shows the no-data state for an empty first page', async () => {
    server.use(popularSubscribesHandler([]))

    await renderPopular()

    expect(await screen.findByRole('region', { name: '热门订阅空态' })).toBeInTheDocument()
    expect(screen.queryByText('正在加载热门订阅')).not.toBeInTheDocument()
  })

  it('deduplicates concurrent load events while the request is pending', async () => {
    const gate = createDeferred()
    const requests: URL[] = []
    server.use(
      popularSubscribesHandler([createSubscribeMovie({ title: '并发加载结果' })], 200, async url => {
        requests.push(url)
        await gate.promise
      }),
    )
    const user = userEvent.setup()

    await renderPopular()
    await waitFor(() => expect(requests).toHaveLength(1))

    await user.click(screen.getByRole('button', { name: '触发热门订阅加载' }))
    await user.click(screen.getByRole('button', { name: '触发热门订阅加载' }))
    expect(requests).toHaveLength(1)
    expect(screen.getByRole('status', { name: '热门订阅无限列表状态' })).toHaveTextContent('loading')

    gate.resolve()
    expect(await screen.findByText('并发加载结果')).toBeInTheDocument()
  })

  it('recovers from an initial HTTP failure by retrying page one', async () => {
    const requestedPages: string[] = []
    server.use(
      http.get(subscribeApiUrls.popular, ({ request }) => {
        const page = new URL(request.url).searchParams.get('page') ?? ''
        requestedPages.push(page)
        if (requestedPages.length === 1) return HttpResponse.json({ detail: 'failed' }, { status: 500 })
        return apiJson([createSubscribeMovie({ title: '热门首载重试成功' })])
      }),
    )
    const user = userEvent.setup()

    await renderPopular()
    const retry = await screen.findByRole('button', { name: '重试' })
    expect(screen.getByRole('alert')).toBeInTheDocument()

    await user.click(retry)

    expect(await screen.findByText('热门首载重试成功')).toBeInTheDocument()
    expect(requestedPages).toEqual(['1', '1'])
  })

  it('keeps existing cards and retries the failed later page', async () => {
    const first = createSubscribeMovie({ title: '热门保留第一页' })
    const second = createSubscribeMovie({ title: '热门第二页重试成功' })
    const requestedPages: string[] = []
    let pageTwoAttempts = 0
    server.use(
      http.get(subscribeApiUrls.popular, ({ request }) => {
        const page = new URL(request.url).searchParams.get('page') ?? ''
        requestedPages.push(page)
        if (page === '1') return apiJson([first])
        pageTwoAttempts += 1
        if (pageTwoAttempts === 1) return HttpResponse.json({ detail: 'failed' }, { status: 500 })
        return apiJson([second])
      }),
    )
    const user = userEvent.setup()

    await renderPopular()
    expect(await screen.findByText('热门保留第一页')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '触发热门订阅加载' }))

    const retry = await screen.findByRole('button', { name: '重试' })
    expect(screen.getByText('热门保留第一页')).toBeInTheDocument()
    await user.click(retry)

    expect(await screen.findByText('热门第二页重试成功')).toBeInTheDocument()
    expect(screen.getByText('热门保留第一页')).toBeInTheDocument()
    expect(requestedPages).toEqual(['1', '2', '2'])
  })

  it('ignores an obsolete response when filters reset a pending request', async () => {
    const gate = createDeferred()
    const requests: URL[] = []
    const staleResponse = vi.fn()
    server.use(
      http.get(subscribeApiUrls.popular, async ({ request }) => {
        const url = new URL(request.url)
        requests.push(url)
        if (!url.searchParams.has('genre_id')) {
          await gate.promise
          staleResponse()
          return apiJson([createSubscribeMovie({ title: '过期热门结果' })])
        }
        return apiJson([createSubscribeMovie({ title: '新筛选热门结果' })])
      }),
    )
    const user = userEvent.setup()

    await renderPopular()
    await waitFor(() => expect(requests).toHaveLength(1))

    await user.click(screen.getByText('动作'))
    expect(await screen.findByText('新筛选热门结果')).toBeInTheDocument()
    expect(requests.filter(url => url.searchParams.get('genre_id') === '28')).toHaveLength(1)
    expect(requests.at(-1)?.searchParams.get('page')).toBe('1')

    gate.resolve()
    await waitFor(() => expect(staleResponse).toHaveBeenCalledOnce())
    await flushPromises()
    await flushPromises()

    expect(screen.getByText('新筛选热门结果')).toBeInTheDocument()
    expect(screen.queryByText('过期热门结果')).not.toBeInTheDocument()
  })

  it('provides unique progressive-grid keys for different seasons of the same TMDB title', async () => {
    server.use(
      popularSubscribesHandler([
        createSubscribeTv({ season: 1, title: '同剧第一季', tmdb_id: 880 }),
        createSubscribeTv({ season: 2, title: '同剧第二季', tmdb_id: 880 }),
      ]),
    )

    await renderPopular('电视剧')

    expect(await screen.findByText('同剧第一季')).toBeInTheDocument()
    expect(screen.getByText('同剧第二季')).toBeInTheDocument()

    // 渲染键只使用统一媒体身份和季号，不再混入数据源专属辅助 ID。
    const item1 = createSubscribeTv({ season: 1, title: '同剧第一季', tmdb_id: 880 })
    const item2 = createSubscribeTv({ season: 2, title: '同剧第二季', tmdb_id: 880 })
    const expectedKeys = [item1, item2].map(item =>
      JSON.stringify([item.media_source ?? null, item.media_id ?? null, item.type ?? null, item.season ?? null]),
    )

    const keysText = screen.getByRole('status', { name: '热门订阅渐进网格键' }).textContent ?? ''
    const keys = JSON.parse(keysText)
    expect(keys).toEqual(expectedKeys)
  })
})
