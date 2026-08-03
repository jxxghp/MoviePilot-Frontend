import DialogCloseBtn from '@/@core/components/DialogCloseBtn.vue'
import type { DownloadHistory } from '@/api/types'
import DownloadHistoryDialog from '@/components/dialog/DownloadHistoryDialog.vue'
import { screen, waitFor, within } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import {
  deleteDownloadHistoryHandler,
  downloadApiUrls,
  downloadHistoryHandler,
} from '@tests/support/msw/handlers/download'
import { server } from '@tests/support/msw/server'
import { renderWithProviders } from '@tests/support/render'
import { HttpResponse, http } from 'msw'
import { defineComponent, h, onMounted, ref, type PropType } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

type InfiniteScrollStatus = 'empty' | 'error' | 'ok'

const InfiniteScrollStub = defineComponent({
  name: 'VInfiniteScroll',
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
              props: { onClick: load },
            })
          : null,
        status.value === 'empty' ? slots.empty?.({}) : null,
        slots.default?.(),
        h(
          'button',
          {
            'aria-label': '加载更多下载历史',
            type: 'button',
            onClick: load,
          },
          '加载更多下载历史',
        ),
      ])
  },
})

const VirtualScrollStub = defineComponent({
  name: 'VVirtualScroll',
  props: {
    items: {
      type: Array as PropType<DownloadHistory[]>,
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

const ImageStub = defineComponent({
  name: 'VImg',
  inheritAttrs: false,
  props: {
    aspectRatio: [String, Number],
    cover: Boolean,
    height: [String, Number],
    position: String,
    src: String,
    width: [String, Number],
  },
  setup(props, { attrs }) {
    return () =>
      h('img', {
        ...attrs,
        src: props.src,
        'data-aspect-ratio': props.aspectRatio,
        'data-cover': String(props.cover),
        'data-height': props.height,
        'data-position': props.position,
        'data-width': props.width,
      })
  },
})

let historySeed = 5000

function createHistory(overrides: Partial<DownloadHistory> = {}): DownloadHistory {
  historySeed += 1
  return {
    date: '2026-08-01 12:00:00',
    download_hash: `hash-${historySeed}`,
    episodes: 'E01-E02',
    id: historySeed,
    image: `https://images.example.com/backdrop-${historySeed}.jpg`,
    poster: `https://images.example.com/poster-${historySeed}.jpg`,
    path: `/downloads/history-${historySeed}`,
    seasons: 'S01',
    title: `历史媒体 ${historySeed}`,
    torrent_name: `Torrent.Release.${historySeed}`,
    torrent_site: '示例站',
    type: '电视剧',
    username: 'tester',
    year: '2026',
    ...overrides,
  }
}

function historyRow(item: DownloadHistory) {
  const title = screen.getByText(item.title!)
  const row = title.closest('.v-list-item')
  if (!row) throw new Error(`History row ${item.id} was not rendered`)
  return row as HTMLElement
}

async function renderDialog() {
  const close = vi.fn()
  const result = await renderWithProviders(DownloadHistoryDialog, {
    props: {
      modelValue: true,
      onClose: close,
    },
    global: {
      components: {
        VDialogCloseBtn: DialogCloseBtn,
      },
      stubs: {
        VInfiniteScroll: InfiniteScrollStub,
        VImg: ImageStub,
        VMenu: MenuStub,
        VVirtualScroll: VirtualScrollStub,
      },
    },
  })
  return { ...result, close }
}

describe('DownloadHistoryDialog', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('loads and renders download history with page parameters', async () => {
    const item = createHistory({ title: '首载剧集' })
    const backdropItem = createHistory({ poster: undefined, title: '背景图历史' })
    const requests: URL[] = []
    server.use(
      downloadHistoryHandler([item, backdropItem], 200, url => {
        requests.push(url)
      }),
    )

    await renderDialog()

    expect(await screen.findByText('首载剧集')).toBeInTheDocument()
    expect(screen.getAllByText('(2026)')).toHaveLength(2)
    expect(within(historyRow(item)).getByText('S01E01-E02').closest('.v-chip')).toBeInTheDocument()
    expect(within(historyRow(item)).getByText('示例站').closest('.v-chip')).toHaveClass('text-info')
    const resourceTitle = screen.getByText(item.torrent_name!)
    expect(resourceTitle).toHaveClass('download-history-item__torrent', 'download-history-item__meta')
    expect(document.querySelector('.download-history-item__date')).toHaveClass('download-history-item__meta')
    expect(screen.getByTestId('history-infinite-scroll')).toHaveClass('download-history-dialog__scroll')
    expect(document.querySelector('.download-history-dialog__content')).toBeInTheDocument()
    expect(requests).toHaveLength(1)
    expect(requests[0].searchParams.get('page')).toBe('1')
    expect(requests[0].searchParams.get('count')).toBe('30')
    const posterImage = historyRow(item).querySelector<HTMLImageElement>('img.download-history-item__image')
    const backdropImage = historyRow(backdropItem).querySelector<HTMLImageElement>('img.download-history-item__image')

    expect(posterImage).toHaveAttribute('src', item.poster)
    expect(backdropImage).toHaveAttribute('src', backdropItem.image)
    expect(posterImage).toHaveAttribute('data-aspect-ratio', '2/3')
    expect(posterImage).toHaveAttribute('data-cover', 'true')
    expect(posterImage).toHaveAttribute('data-height', '96')
    expect(posterImage).toHaveAttribute('data-position', 'center')
    expect(posterImage).toHaveAttribute('data-width', '64')
  })

  it('appends later pages and preserves existing rows at the end', async () => {
    const first = createHistory({ title: '第一页历史' })
    const second = createHistory({ title: '第二页历史' })
    const requestedPages: string[] = []
    server.use(
      http.get(downloadApiUrls.history, ({ request }) => {
        const page = new URL(request.url).searchParams.get('page') ?? ''
        requestedPages.push(page)
        if (page === '1') return HttpResponse.json([first])
        if (page === '2') return HttpResponse.json([second])
        return HttpResponse.json([])
      }),
    )
    const user = userEvent.setup()

    await renderDialog()

    expect(await screen.findByText('第一页历史')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '加载更多下载历史' }))
    expect(await screen.findByText('第二页历史')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '加载更多下载历史' }))
    await waitFor(() => expect(requestedPages).toEqual(['1', '2', '3']))

    expect(screen.getByText('第一页历史')).toBeInTheDocument()
    expect(screen.getByText('第二页历史')).toBeInTheDocument()
  })

  it('renders an empty state after the first empty page', async () => {
    server.use(downloadHistoryHandler())

    await renderDialog()

    expect(await screen.findByText('没有下载历史')).toBeInTheDocument()
    expect(screen.getByText('已添加的下载任务会显示在这里')).toBeInTheDocument()
  })

  it('deletes one history row with its complete payload', async () => {
    const item = createHistory({ title: '待删除历史' })
    const deletedBodies: DownloadHistory[] = []
    server.use(
      downloadHistoryHandler([item]),
      deleteDownloadHistoryHandler({ success: true }, 200, body => {
        deletedBodies.push(body)
      }),
    )
    const user = userEvent.setup()

    await renderDialog()

    expect(await screen.findByText('待删除历史')).toBeInTheDocument()
    await user.click(within(historyRow(item)).getByText('删除'))
    await waitFor(() => expect(screen.queryByText('待删除历史')).not.toBeInTheDocument())

    expect(deletedBodies).toEqual([item])
  })

  it('offers a retry after the first load fails', async () => {
    const item = createHistory({ title: '重试成功历史' })
    let requestCount = 0
    server.use(
      http.get(downloadApiUrls.history, () => {
        requestCount += 1
        if (requestCount === 1) return HttpResponse.json({}, { status: 500 })
        return HttpResponse.json([item])
      }),
    )
    const user = userEvent.setup()

    await renderDialog()

    expect(await screen.findByRole('alert')).toHaveTextContent('下载历史加载失败')
    await user.click(screen.getByRole('button', { name: /重试/ }))

    expect(await screen.findByText('重试成功历史')).toBeInTheDocument()
    expect(requestCount).toBe(2)
  })
})
