import type { TorrentInfo } from '@/api/types'
import SiteResourceDialog from '@/components/dialog/SiteResourceDialog.vue'
import i18n from '@/plugins/i18n'
import { getActiveRequestsCount } from '@/utils/requestOptimizer'
import { screen, waitFor } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { createSite, createSiteCategory, createTorrentInfo } from '@tests/support/factories/site'
import { siteApiUrls, siteCategoriesHandler, siteResourcesHandler } from '@tests/support/msw/handlers/site'
import { server } from '@tests/support/msw/server'
import { renderWithProviders } from '@tests/support/render'
import { HttpResponse, http } from 'msw'
import { apiJson } from '@tests/support/msw/response'
import { defineComponent, h, type Component, type PropType } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const AddDownloadDialogStub = defineComponent({
  name: 'AddDownloadDialog',
  props: {
    torrent: Object,
  },
  emits: ['close', 'done', 'error', 'update:modelValue'],
  template: `
    <section data-testid="add-download-dialog">
      {{ torrent?.title }}
      <button type="button" @click="$emit('done', 'url')">done</button>
      <button type="button" @click="$emit('error', 'error')">error</button>
      <button type="button" @click="$emit('close')">close-download</button>
    </section>
  `,
})

const DialogStub = defineComponent({
  name: 'VDialog',
  template: '<div role="dialog"><slot /></div>',
})

const ProgressiveCardGridStub = defineComponent({
  name: 'ProgressiveCardGrid',
  props: {
    getItemKey: { type: Function as PropType<(item: TorrentInfo, index: number) => string>, required: true },
    items: { type: Array as PropType<TorrentInfo[]>, required: true },
    virtualizeInOverlay: Boolean,
  },
  setup(props, { slots }) {
    return () =>
      h(
        'section',
        { 'data-testid': 'progressive-grid', 'data-virtualize-in-overlay': String(props.virtualizeInOverlay) },
        props.items.map((item, index) =>
          h('article', { 'data-resource-key': props.getItemKey(item, index) }, slots.default?.({ item })),
        ),
      )
  },
})

const DataTableStub = defineComponent({
  name: 'VDataTable',
  props: {
    items: { type: Array as PropType<TorrentInfo[]>, required: true },
    itemsPerPage: { type: Number, required: true },
    loading: Boolean,
    page: { type: Number, required: true },
  },
  emits: ['update:itemsPerPage', 'update:page'],
  setup(props, { emit, slots }) {
    return () =>
      h('section', { 'data-loading': String(props.loading), 'data-testid': 'resource-table' }, [
        h('span', { 'data-testid': 'resource-page' }, String(props.page)),
        h('button', { onClick: () => emit('update:page', 4), type: 'button' }, 'page-4'),
        h('button', { onClick: () => emit('update:itemsPerPage', 100), type: 'button' }, 'per-page-100'),
        ...props.items.flatMap(item => slots['item.title']?.({ item }) ?? []),
        props.items.length === 0 ? slots['no-data']?.({}) : null,
      ])
  },
})

function createDeferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => {
    resolve = done
  })
  return { promise, resolve }
}

function setViewport(width: number) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width, writable: true })
  window.dispatchEvent(new Event('resize'))
}

async function renderDialog(
  site = createSite({ id: 501, name: '资源测试站' }),
  stubs: Record<string, boolean | Component> = {},
) {
  const close = vi.fn()
  const result = await renderWithProviders(SiteResourceDialog, {
    props: { site, onClose: close },
    global: {
      stubs: {
        AddDownloadDialog: AddDownloadDialogStub,
        ProgressiveCardGrid: ProgressiveCardGridStub,
        VDialog: DialogStub,
        ...stubs,
      },
    },
  })

  return { ...result, close, site }
}

describe('SiteResourceDialog', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    setViewport(1280)
  })

  it.each([
    ['success', 200],
    ['HTTP failure', 500],
  ] as const)('keeps the newest mobile search state when an older request ends with %s', async (_case, oldStatus) => {
    setViewport(390)
    const oldResponse = createDeferred<void>()
    const latestResponse = createDeferred<TorrentInfo[]>()
    const oldRequested = vi.fn()
    const latestRequested = vi.fn()
    const latestResource = createTorrentInfo({ title: '新条件结果' })
    server.use(
      siteCategoriesHandler(501, [createSiteCategory()]),
      http.get(siteApiUrls.resources(501), async ({ request }) => {
        const keyword = new URL(request.url).searchParams.get('keyword')
        if (keyword) {
          latestRequested()
          return apiJson(await latestResponse.promise)
        }

        oldRequested()
        await oldResponse.promise
        return oldStatus === 200
          ? apiJson([createTorrentInfo({ title: '旧条件结果' })])
          : HttpResponse.json({ detail: 'stale failure' }, { status: oldStatus })
      }),
    )
    const user = userEvent.setup()

    const { container } = await renderDialog()
    await waitFor(() => expect(oldRequested).toHaveBeenCalledOnce())
    await user.click(container.querySelector('.site-resource-mobile-search__toggle') as HTMLElement)
    const keywordFields = screen.getAllByLabelText('搜索关键字')
    const keyword = keywordFields[keywordFields.length - 1]
    await user.type(keyword, 'new')
    const searchButtons = screen.getAllByRole('button', { name: /搜索/ })
    await user.click(searchButtons[searchButtons.length - 1])
    await waitFor(() => expect(latestRequested).toHaveBeenCalledOnce())
    await waitFor(() => expect(getActiveRequestsCount()).toBe(2))

    oldResponse.resolve()
    await waitFor(() => expect(getActiveRequestsCount()).toBe(1))
    expect(screen.getByText('加载中...')).toBeInTheDocument()
    expect(container.querySelector('.site-resource-filter-panel')).toBeInTheDocument()
    expect(screen.queryByText('资源加载失败，请重试')).not.toBeInTheDocument()
    if (oldStatus === 500) expect(console.error).not.toHaveBeenCalled()

    latestResponse.resolve([latestResource])
    expect(await screen.findByText('新条件结果')).toBeInTheDocument()
    await waitFor(() => expect(getActiveRequestsCount()).toBe(0))

    expect(screen.queryByText('旧条件结果')).not.toBeInTheDocument()
    expect(screen.queryByText('加载中...')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('搜索关键字')).not.toBeInTheDocument()
    expect(screen.queryByText('资源加载失败，请重试')).not.toBeInTheDocument()
  })

  it('shows a retry action after resource loading fails and recovers on the same query', async () => {
    let attempts = 0
    server.use(
      siteCategoriesHandler(501, []),
      http.get(siteApiUrls.resources(501), () => {
        attempts += 1
        if (attempts === 1) return HttpResponse.json({ detail: 'temporary failure' }, { status: 500 })

        return apiJson([createTorrentInfo({ title: '重试恢复结果' })])
      }),
    )
    const user = userEvent.setup()

    await renderDialog()

    await user.click(await screen.findByRole('button', { name: '重试' }))
    expect(await screen.findByText('重试恢复结果')).toBeInTheDocument()
    expect(attempts).toBe(2)
  })

  it.each([
    ['desktop', 1280],
    ['mobile', 390],
  ] as const)('does not show the empty state with an initial resource error on %s', async (_layout, width) => {
    setViewport(width)
    server.use(siteCategoriesHandler(501, []), siteResourcesHandler(501, [], 500))

    await renderDialog(undefined, { VDataTable: DataTableStub })

    expect(await screen.findByText('资源加载失败，请重试')).toBeInTheDocument()
    expect(screen.queryByText('没有数据')).not.toBeInTheDocument()
  })

  it('keeps existing resources visible when a repeated search fails', async () => {
    let attempts = 0
    server.use(
      siteCategoriesHandler(501, []),
      http.get(siteApiUrls.resources(501), () => {
        attempts += 1
        if (attempts === 1) return apiJson([createTorrentInfo({ title: '已有资源' })])

        return HttpResponse.json({ detail: 'temporary failure' }, { status: 500 })
      }),
    )
    const user = userEvent.setup()
    await renderDialog()
    expect(await screen.findByText('已有资源')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /搜索/ }))

    expect(await screen.findByText('资源加载失败，请重试')).toBeInTheDocument()
    expect(screen.getByText('已有资源')).toBeInTheDocument()
    expect(screen.queryByText('没有数据')).not.toBeInTheDocument()
  })

  it('loads categories and resources from their direct-array endpoints', async () => {
    const categoryRequests: URL[] = []
    const resourceRequests: URL[] = []
    server.use(
      siteCategoriesHandler(501, [createSiteCategory({ desc: '高清电影', id: 11 })], 200, url =>
        categoryRequests.push(url),
      ),
      siteResourcesHandler(501, [createTorrentInfo({ title: '首载资源' })], 200, url => resourceRequests.push(url)),
    )

    await renderDialog()

    expect(await screen.findByText('首载资源')).toBeInTheDocument()
    expect(categoryRequests).toHaveLength(1)
    expect(resourceRequests).toHaveLength(1)
    expect(resourceRequests[0].searchParams.get('keyword')).toBeNull()
    expect(resourceRequests[0].searchParams.get('cat')).toBe('')
  })

  it('sends the exact keyword and selected category ids on every search', async () => {
    const requests: URL[] = []
    server.use(
      siteCategoriesHandler(501, [
        createSiteCategory({ desc: '电影', id: 11 }),
        createSiteCategory({ cat: 'tv', desc: '剧集', id: 22 }),
      ]),
      siteResourcesHandler(501, [], 200, url => requests.push(url)),
    )
    const user = userEvent.setup()

    await renderDialog()
    await waitFor(() => expect(requests).toHaveLength(1))
    await user.type(screen.getByLabelText('搜索关键字'), '2160p')
    await user.click(screen.getByLabelText('资源分类'))
    await user.click(await screen.findByRole('option', { name: '电影' }))
    await user.click(await screen.findByRole('option', { name: '剧集' }))
    await user.click(screen.getByRole('button', { name: /搜索/ }))

    await waitFor(() => expect(requests).toHaveLength(2))
    expect(requests[1].searchParams.get('keyword')).toBe('2160p')
    expect(requests[1].searchParams.get('cat')).toBe('11,22')
  })

  it('distinguishes a valid empty resource list from a category request failure', async () => {
    server.use(siteCategoriesHandler(501, [], 500), siteResourcesHandler(501, []))

    await renderDialog()

    expect(await screen.findByText('没有数据')).toBeInTheDocument()
    expect(screen.queryByText('资源加载失败，请重试')).not.toBeInTheDocument()
    await waitFor(() => expect(console.error).toHaveBeenCalledOnce())
  })

  it('exposes loading during a repeated search and clears it when the latest request completes', async () => {
    const nextResponse = createDeferred<TorrentInfo[]>()
    let requestCount = 0
    server.use(
      siteCategoriesHandler(501, []),
      http.get(siteApiUrls.resources(501), async () => {
        requestCount += 1
        if (requestCount === 1) return apiJson([])
        return apiJson(await nextResponse.promise)
      }),
    )
    const user = userEvent.setup()

    await renderDialog(undefined, { VDataTable: DataTableStub })
    await waitFor(() => expect(screen.getByTestId('resource-table')).toHaveAttribute('data-loading', 'false'))
    await user.click(screen.getByRole('button', { name: /搜索/ }))
    await waitFor(() => expect(screen.getByTestId('resource-table')).toHaveAttribute('data-loading', 'true'))
    nextResponse.resolve([createTorrentInfo({ title: '重复搜索结果' })])

    expect(await screen.findByText('重复搜索结果')).toBeInTheDocument()
    expect(screen.getByTestId('resource-table')).toHaveAttribute('data-loading', 'false')
  })

  it('renders resource metadata and every promotion style branch', async () => {
    server.use(
      siteCategoriesHandler(501, []),
      siteResourcesHandler(501, [
        createTorrentInfo({
          date_elapsed: '2 小时前',
          description: '完整资源说明',
          downloadvolumefactor: 0,
          freedate_diff: '剩余 1 天',
          hit_and_run: true,
          labels: ['原盘'],
          pubdate: '2026-07-19',
          title: '免费资源',
          volume_factor: 'FREE',
        }),
        createTorrentInfo({ downloadvolumefactor: 0.5, title: '半价资源', volume_factor: '50%' }),
        createTorrentInfo({ title: '双倍上传', uploadvolumefactor: 2, volume_factor: '2X' }),
        createTorrentInfo({ title: '普通资源' }),
      ]),
    )

    await renderDialog()

    expect(await screen.findByText('免费资源')).toBeInTheDocument()
    expect(screen.getByText('完整资源说明')).toBeInTheDocument()
    expect(screen.getByText('H&R')).toBeInTheDocument()
    expect(screen.getByText('剩余 1 天')).toBeInTheDocument()
    expect(screen.getByText('原盘')).toBeInTheDocument()
    expect(screen.getByText('FREE').closest('.v-chip')).toHaveClass('bg-lime-500')
    expect(screen.getByText('50%').closest('.v-chip')).toHaveClass('bg-green-500')
    expect(screen.getByText('2X').closest('.v-chip')).toHaveClass('bg-sky-500')
    expect(screen.queryByText('1x')).not.toBeInTheDocument()
  })

  it('opens and closes the add-download boundary through all child outcomes', async () => {
    server.use(siteCategoriesHandler(501, []), siteResourcesHandler(501, [createTorrentInfo({ title: '待下载资源' })]))
    const user = userEvent.setup()

    await renderDialog()
    const title = await screen.findByRole('button', { name: /待下载资源/ })

    await user.click(title)
    expect(screen.getByTestId('add-download-dialog')).toHaveTextContent('待下载资源')
    await user.click(screen.getByRole('button', { name: 'done' }))
    expect(screen.queryByTestId('add-download-dialog')).not.toBeInTheDocument()

    await user.click(title)
    await user.click(screen.getByRole('button', { name: 'error' }))
    expect(screen.queryByTestId('add-download-dialog')).not.toBeInTheDocument()

    await user.click(title)
    await user.click(screen.getByRole('button', { name: 'close-download' }))
    expect(screen.queryByTestId('add-download-dialog')).not.toBeInTheDocument()
  })

  it('corrects an out-of-range desktop page after the page size changes', async () => {
    server.use(
      siteCategoriesHandler(501, []),
      siteResourcesHandler(
        501,
        Array.from({ length: 30 }, (_, index) => createTorrentInfo({ title: `分页资源 ${index + 1}` })),
      ),
    )
    const user = userEvent.setup()

    await renderDialog(undefined, { VDataTable: DataTableStub })
    await screen.findByText('分页资源 1')
    await user.click(screen.getByRole('button', { name: 'page-4' }))
    expect(screen.getByTestId('resource-page')).toHaveTextContent('4')
    await user.click(screen.getByRole('button', { name: 'per-page-100' }))

    await waitFor(() => expect(screen.getByTestId('resource-page')).toHaveTextContent('1'))
  })

  it('uses stable mobile keys and guards detail and torrent external links', async () => {
    setViewport(390)
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    server.use(
      siteCategoriesHandler(501, []),
      siteResourcesHandler(501, [
        createTorrentInfo({
          description: '移动端资源说明',
          downloadvolumefactor: 0,
          enclosure: 'https://tracker.example.com/download/one',
          freedate_diff: '剩余 2 小时',
          hit_and_run: true,
          labels: ['移动标签'],
          page_url: 'https://tracker.example.com/details/one',
          title: '详情资源',
          volume_factor: 'FREE',
        }),
        createTorrentInfo({ enclosure: 'magnet:?xt=urn:btih:test', page_url: '', title: '无外链资源' }),
        createTorrentInfo({ enclosure: '', page_url: '', pubdate: '2026-07-19', title: '回退键资源' }),
      ]),
    )
    const user = userEvent.setup()

    await renderDialog()
    expect(await screen.findByText('详情资源')).toBeInTheDocument()
    expect(screen.getByTestId('progressive-grid')).toHaveAttribute('data-virtualize-in-overlay', 'true')
    expect(screen.getByText('移动端资源说明')).toBeInTheDocument()
    expect(screen.getByText('移动标签')).toBeInTheDocument()
    const cards = screen.getByTestId('progressive-grid').querySelectorAll('[data-resource-key]')
    expect(Array.from(cards, card => card.getAttribute('data-resource-key'))).toEqual([
      'https://tracker.example.com/details/one',
      'magnet:?xt=urn:btih:test',
      '回退键资源-2026-07-19-2',
    ])

    await user.click(screen.getByRole('button', { name: /详情资源/ }))
    await user.click(screen.getByRole('button', { name: 'close-download' }))
    await user.click(screen.getAllByRole('button', { name: '添加下载' })[0])
    await user.click(screen.getByRole('button', { name: 'close-download' }))

    const detailButtons = screen.getAllByLabelText('查看详情')
    await user.click(detailButtons[0])
    await user.click(detailButtons[1])
    await user.click(screen.getAllByLabelText('下载种子文件')[0])
    expect(open).toHaveBeenNthCalledWith(1, 'https://tracker.example.com/details/one', '_blank')
    expect(open).toHaveBeenNthCalledWith(2, 'https://tracker.example.com/download/one', '_blank')
    expect(open).toHaveBeenCalledTimes(2)
    expect(screen.getAllByLabelText('下载种子文件')[1]).toBeDisabled()
  })

  it('expands and closes mobile search without retaining it after a desktop switch', async () => {
    setViewport(390)
    server.use(siteCategoriesHandler(501, []), siteResourcesHandler(501, []))
    const user = userEvent.setup()

    const { container } = await renderDialog()
    await screen.findByText('没有数据')
    const toggle = container.querySelector('.site-resource-mobile-search__toggle')
    expect(toggle).not.toBeNull()
    await user.click(toggle as HTMLElement)
    await user.type(screen.getByLabelText('搜索关键字'), 'mobile')
    await user.click(screen.getByRole('button', { name: '取消' }))
    expect(screen.queryByLabelText('搜索关键字')).not.toBeInTheDocument()

    await user.click(toggle as HTMLElement)
    setViewport(1280)
    await waitFor(() => expect(container.querySelector('.site-resource-mobile-search')).toBeNull())
    setViewport(390)
    await waitFor(() => expect(screen.queryByLabelText('搜索关键字')).not.toBeInTheDocument())
  })

  it('emits close and formats the mobile result summary in English', async () => {
    setViewport(390)
    server.use(
      siteCategoriesHandler(501, []),
      siteResourcesHandler(501, [createTorrentInfo({ title: 'Language resource' })]),
    )
    const user = userEvent.setup()

    const { close, container } = await renderDialog()
    await screen.findByText('Language resource')
    i18n.global.locale.value = 'en-US'
    expect(await screen.findByText('1 results')).toBeInTheDocument()

    const closeButton = container.querySelector('.v-toolbar-items .v-btn')
    expect(closeButton).not.toBeNull()
    await user.click(closeButton as HTMLElement)
    expect(close).toHaveBeenCalledOnce()
  })
})
