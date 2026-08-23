import DialogCloseBtn from '@/@core/components/DialogCloseBtn.vue'
import { mediaTypeDict } from '@/api/constants'
import type { Subscribe } from '@/api/types'
import SubscribeHistoryDialog from '@/components/dialog/SubscribeHistoryDialog.vue'
import { fireEvent, screen, waitFor, within } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import {
  createSubscribeHandler,
  deleteSubscribeHistoryHandler,
  subscribeApiUrls,
  subscribeHistoryHandler,
} from '@tests/support/msw/handlers/subscribe'
import { server } from '@tests/support/msw/server'
import { renderWithProviders } from '@tests/support/render'
import { HttpResponse, http, type JsonBodyType } from 'msw'
import { apiJson } from '@tests/support/msw/response'
import { defineComponent, h, onMounted, ref, type PropType } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  toastError: vi.fn(),
}))

vi.mock('vue-toastification', () => ({
  useToast: () => ({ error: mocks.toastError }),
}))

type InfiniteScrollStatus = 'empty' | 'error' | 'ok'

const InfiniteScrollStub = defineComponent({
  name: 'VInfiniteScroll',
  props: {
    items: {
      type: Array as PropType<unknown[]>,
      default: () => [],
    },
  },
  emits: ['load'],
  setup(_props, { emit, slots }) {
    const status = ref<'empty' | 'error' | 'idle' | 'loading'>('idle')

    function load() {
      status.value = 'loading'
      emit('load', {
        done(nextStatus: InfiniteScrollStatus) {
          status.value = nextStatus === 'ok' ? 'idle' : nextStatus
        },
      })
    }

    onMounted(load)

    return () =>
      h('div', { 'data-testid': 'history-infinite-scroll' }, [
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
            'aria-label': '加载更多历史',
            type: 'button',
            onClick: load,
          },
          '加载更多历史',
        ),
      ])
  },
})

const VirtualScrollStub = defineComponent({
  name: 'VVirtualScroll',
  props: {
    items: {
      type: Array as PropType<Subscribe[]>,
      default: () => [],
    },
  },
  setup(props, { slots }) {
    const itemRef = () => {}
    return () =>
      h(
        'div',
        props.items.map(item => slots.default?.({ item, itemRef })),
      )
  },
})

const MenuStub = defineComponent({
  name: 'VMenu',
  setup(_props, { slots }) {
    return () => h('div', slots.default?.())
  },
})

const ProgressDialogStub = defineComponent({
  name: 'ProgressDialog',
  props: {
    text: String,
  },
  setup(props) {
    return () => h('div', { role: 'status' }, props.text)
  },
})

interface Deferred<T> {
  promise: Promise<T>
  resolve: (value: T) => void
}

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => {
    resolve = done
  })
  return { promise, resolve }
}

let historySeed = 4000

function createHistory(overrides: Partial<Subscribe> = {}): Subscribe {
  historySeed += 1
  return {
    best_version: 0,
    current_priority: 0,
    date: '2026-07-17 12:00:00',
    description: `历史说明 ${historySeed}`,
    id: historySeed,
    last_update: '2026-07-17 12:00:00',
    name: `历史媒体 ${historySeed}`,
    poster: `/images/history-${historySeed}.jpg`,
    show_edit_dialog: false,
    sites: [],
    state: 'R',
    media_id: String(historySeed),
    media_source: 'themoviedb',
    type: '电影',
    username: 'tester',
    year: '2026',
    ...overrides,
  }
}

async function renderDialog(type: '电影' | '电视剧' | '音乐' = '电影') {
  const events = {
    close: vi.fn(),
    save: vi.fn(),
  }
  const result = await renderWithProviders(SubscribeHistoryDialog, {
    props: {
      modelValue: true,
      type,
      onClose: events.close,
      onSave: events.save,
    },
    global: {
      components: {
        VDialogCloseBtn: DialogCloseBtn,
      },
      stubs: {
        ProgressDialog: ProgressDialogStub,
        VInfiniteScroll: InfiniteScrollStub,
        VMenu: MenuStub,
        VVirtualScroll: VirtualScrollStub,
      },
    },
  })
  return { ...result, events }
}

function historyRow(item: Subscribe) {
  const description = screen.getByText(item.description!)
  const row = description.closest('.v-list-item')
  if (!row) throw new Error(`History row ${item.id} was not rendered`)
  return row as HTMLElement
}

describe('SubscribeHistoryDialog', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  it('loads movie history with the exact type, page and count request', async () => {
    const movie = createHistory({ name: '首载电影' })
    const requests: URL[] = []
    server.use(
      subscribeHistoryHandler('电影', [movie], 200, url => {
        requests.push(url)
      }),
    )

    await renderDialog('电影')

    expect(await screen.findByText('首载电影')).toBeInTheDocument()
    expect(screen.getByText(`${mediaTypeDict['电影']}订阅历史`)).toBeInTheDocument()
    expect(screen.queryByText(/第 \d+ 季/)).not.toBeInTheDocument()
    expect(requests).toHaveLength(1)
    expect(decodeURIComponent(requests[0].pathname).endsWith('/subscribe/history/电影')).toBe(true)
    expect(requests[0].searchParams.get('page')).toBe('1')
    expect(requests[0].searchParams.get('count')).toBe('30')
  })

  it('loads TV history and renders the season copy', async () => {
    const show = createHistory({ name: '首载剧集', season: 3, type: '电视剧' })
    const requests: URL[] = []
    server.use(
      subscribeHistoryHandler('电视剧', [show], 200, url => {
        requests.push(url)
      }),
    )

    await renderDialog('电视剧')

    expect(await screen.findByText('首载剧集')).toBeInTheDocument()
    expect(screen.getByText('第 3 季')).toBeInTheDocument()
    expect(screen.getByText(`${mediaTypeDict['电视剧']}订阅历史`)).toBeInTheDocument()
    expect(decodeURIComponent(requests[0].pathname).endsWith('/subscribe/history/电视剧')).toBe(true)
    expect(requests[0].searchParams.get('page')).toBe('1')
    expect(requests[0].searchParams.get('count')).toBe('30')
  })

  it('loads music history with a square cover and no season copy', async () => {
    const music = createHistory({ name: '首载专辑', type: '音乐' })
    server.use(subscribeHistoryHandler('音乐', [music]))

    await renderDialog('音乐')

    expect(await screen.findByText('首载专辑')).toBeInTheDocument()
    expect(screen.getByText(`${mediaTypeDict['音乐']}订阅历史`)).toBeInTheDocument()
    expect(screen.queryByText(/第 \d+ 季/)).not.toBeInTheDocument()
    expect(historyRow(music).querySelector('.subscribe-history-poster')).toHaveStyle({ height: '64px', width: '64px' })
  })

  it('appends later pages and keeps existing rows when the next page is empty', async () => {
    const first = createHistory({ name: '第一页电影' })
    const second = createHistory({ name: '第二页电影' })
    const requestedPages: string[] = []
    server.use(
      http.get(subscribeApiUrls.historyByType('电影'), ({ request }) => {
        const url = new URL(request.url)
        const page = url.searchParams.get('page') ?? ''
        requestedPages.push(page)
        if (page === '1') return apiJson([first])
        if (page === '2') return apiJson([second])
        return apiJson([])
      }),
    )
    const user = userEvent.setup()

    await renderDialog()

    expect(await screen.findByText('第一页电影')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '加载更多历史' }))
    expect(await screen.findByText('第二页电影')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '加载更多历史' }))
    await waitFor(() => expect(requestedPages).toEqual(['1', '2', '3']))

    expect(screen.getByText('第一页电影')).toBeInTheDocument()
    expect(screen.getByText('第二页电影')).toBeInTheDocument()
    expect(screen.queryByText('没有已完成的订阅')).not.toBeInTheDocument()
  })

  it('renders the empty state after an empty first page', async () => {
    server.use(subscribeHistoryHandler('电影'))

    await renderDialog()

    expect(await screen.findByText('没有已完成的订阅')).toBeInTheDocument()
    expect(screen.getByText('完成的订阅会显示在这里')).toBeInTheDocument()
  })

  it('shows a visible list error and retries the same page', async () => {
    const recovered = createHistory({ name: '重试恢复电影' })
    const requestedPages: string[] = []
    server.use(
      http.get(subscribeApiUrls.historyByType('电影'), ({ request }) => {
        const url = new URL(request.url)
        requestedPages.push(url.searchParams.get('page') ?? '')
        if (requestedPages.length === 1) return HttpResponse.json({ detail: 'failed' }, { status: 500 })
        return apiJson([recovered])
      }),
    )
    const user = userEvent.setup()

    await renderDialog()

    expect(await screen.findByRole('alert')).toHaveTextContent('请求失败，请稍后重试')
    await user.click(screen.getByRole('button', { name: '重试' }))

    expect(await screen.findByText('重试恢复电影')).toBeInTheDocument()
    expect(requestedPages).toEqual(['1', '1'])
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('does not issue another request when the load event reenters while pending', async () => {
    const pending = createDeferred<Subscribe[]>()
    const requested = vi.fn()
    const movie = createHistory({ name: '重入保护电影' })
    server.use(
      http.get(subscribeApiUrls.historyByType('电影'), async () => {
        requested()
        return apiJson(await pending.promise)
      }),
    )

    await renderDialog()
    await waitFor(() => expect(requested).toHaveBeenCalledOnce())

    await fireEvent.click(screen.getByRole('button', { name: '加载更多历史' }))
    expect(requested).toHaveBeenCalledOnce()

    pending.resolve([movie])
    expect(await screen.findByText('重入保护电影')).toBeInTheDocument()
    expect(requested).toHaveBeenCalledOnce()
  })

  it.each([
    ['电影', createHistory({ name: '重新订阅电影' }), '正在重新订阅 重新订阅电影...'],
    [
      '电视剧',
      createHistory({ name: '重新订阅剧集', season: 2, type: '电视剧' }),
      '正在重新订阅 重新订阅剧集 第 2 季...',
    ],
    ['音乐', createHistory({ name: '重新订阅专辑', type: '音乐' }), '正在重新订阅 重新订阅专辑...'],
  ] as const)('shows the %s pending copy and emits save only after success', async (type, item, progressText) => {
    const pending = createDeferred<null>()
    let payload: JsonBodyType | undefined
    server.use(
      subscribeHistoryHandler(type, [item]),
      http.post(subscribeApiUrls.create, async ({ request }) => {
        payload = (await request.json()) as JsonBodyType
        return apiJson(await pending.promise)
      }),
    )
    const user = userEvent.setup()
    const { events } = await renderDialog(type)
    expect(await screen.findByText(item.name)).toBeInTheDocument()

    await user.click(within(historyRow(item)).getByText('重新订阅'))

    expect(await screen.findByRole('status')).toHaveTextContent(progressText)
    expect(events.save).not.toHaveBeenCalled()
    pending.resolve(null)
    await waitFor(() => expect(events.save).toHaveBeenCalledOnce())

    expect(payload).toEqual(item)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(events.close).not.toHaveBeenCalled()
    expect(mocks.toastError).not.toHaveBeenCalled()
  })

  it('toasts a business failure when resubscribing and does not emit save', async () => {
    const movie = createHistory({ name: '业务失败电影' })
    server.use(subscribeHistoryHandler('电影', [movie]), createSubscribeHandler({ success: false }))
    const user = userEvent.setup()
    const { events } = await renderDialog()
    expect(await screen.findByText(movie.name)).toBeInTheDocument()

    await user.click(within(historyRow(movie)).getByText('重新订阅'))

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('请求失败，请稍后重试'))
    expect(events.save).not.toHaveBeenCalled()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(screen.getByText(movie.name)).toBeInTheDocument()
  })

  it('toasts an HTTP failure when resubscribing and does not emit save', async () => {
    const movie = createHistory({ name: '网络失败电影' })
    server.use(
      subscribeHistoryHandler('电影', [movie]),
      http.post(subscribeApiUrls.create, () => HttpResponse.json({ detail: 'failed' }, { status: 500 })),
    )
    const user = userEvent.setup()
    const { events } = await renderDialog()
    expect(await screen.findByText(movie.name)).toBeInTheDocument()

    await user.click(within(historyRow(movie)).getByText('重新订阅'))

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('请求失败，请稍后重试'))
    expect(events.save).not.toHaveBeenCalled()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(screen.getByText(movie.name)).toBeInTheDocument()
  })

  it('removes only the target row when the history endpoint returns success true', async () => {
    const first = createHistory({ name: '待删除电影' })
    const second = createHistory({ name: '保留电影' })
    const deleteRequested = vi.fn()
    server.use(
      subscribeHistoryHandler('电影', [first, second]),
      deleteSubscribeHistoryHandler(first.id, { success: true }, 200, deleteRequested),
    )
    const user = userEvent.setup()
    const { events } = await renderDialog()
    expect(await screen.findByText(first.name)).toBeInTheDocument()

    await user.click(within(historyRow(first)).getByText('删除'))

    await waitFor(() => expect(screen.queryByText(first.name)).not.toBeInTheDocument())
    expect(screen.getByText(second.name)).toBeInTheDocument()
    expect(deleteRequested).toHaveBeenCalledOnce()
    expect(events.save).not.toHaveBeenCalled()
    expect(events.close).not.toHaveBeenCalled()
    expect(mocks.toastError).not.toHaveBeenCalled()
  })

  it('keeps the row and toasts when history deletion fails over HTTP', async () => {
    const movie = createHistory({ name: '删除失败电影' })
    server.use(
      subscribeHistoryHandler('电影', [movie]),
      http.delete(subscribeApiUrls.historyById(movie.id), () =>
        HttpResponse.json({ detail: 'failed' }, { status: 500 }),
      ),
    )
    const user = userEvent.setup()
    await renderDialog()
    expect(await screen.findByText(movie.name)).toBeInTheDocument()

    await user.click(within(historyRow(movie)).getByText('删除'))

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('请求失败，请稍后重试'))
    expect(screen.getByText(movie.name)).toBeInTheDocument()
  })

  it('emits close from the dialog close button', async () => {
    server.use(subscribeHistoryHandler('电影'))
    const user = userEvent.setup()
    const { events } = await renderDialog()
    expect(await screen.findByText('没有已完成的订阅')).toBeInTheDocument()
    const closeButton = document.querySelector('.absolute.right-3.top-3')
    if (!(closeButton instanceof HTMLButtonElement)) throw new Error('Dialog close button was not rendered')

    await user.click(closeButton)

    expect(events.close).toHaveBeenCalledOnce()
    expect(events.save).not.toHaveBeenCalled()
  })
})
