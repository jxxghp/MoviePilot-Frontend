import type { TorrentInfo } from '@/api/types'
import SiteResourceDialog from '@/components/dialog/SiteResourceDialog.vue'
import i18n from '@/plugins/i18n'
import { getActiveRequestsCount } from '@/utils/requestOptimizer'
import { fireEvent, screen, waitFor } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { createSite, createSiteCategory, createTorrentInfo } from '@tests/support/factories/site'
import { siteApiUrls, siteCategoriesHandler, siteResourcesHandler } from '@tests/support/msw/handlers/site'
import { server } from '@tests/support/msw/server'
import { renderWithProviders } from '@tests/support/render'
import { HttpResponse, http } from 'msw'
import { apiJson } from '@tests/support/msw/response'
import { defineComponent, h, type Component, type PropType } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}))

vi.mock('vue-toastification', () => ({
  useToast: () => ({ error: mocks.toastError, success: mocks.toastSuccess }),
}))

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

const DialogCloseButtonStub = defineComponent({
  name: 'VDialogCloseBtn',
  setup:
    (_, { attrs }) =>
    () =>
      h('button', { ...attrs, 'aria-label': '关闭', type: 'button' }),
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
        VDialogCloseBtn: DialogCloseButtonStub,
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
    mocks.toastError.mockClear()
    mocks.toastSuccess.mockClear()
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
    const keyword = screen.getByLabelText('搜索关键字')
    await user.type(keyword, 'new')
    await user.click(screen.getByRole('button', { name: /^搜索$/ }))
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
    expect(screen.getByLabelText('搜索关键字')).toHaveValue('new')
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

    await renderDialog()

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

    await user.click(screen.getByRole('button', { name: /^搜索$/ }))

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
    await user.click(screen.getByRole('button', { name: /^搜索$/ }))

    await waitFor(() => expect(requests).toHaveLength(2))
    expect(requests[1].searchParams.get('keyword')).toBe('2160p')
    expect(requests[1].searchParams.get('cat')).toBe('11,22')
  })

  it('silences optional category failures while keeping the resource list usable', async () => {
    server.use(siteCategoriesHandler(501, [], 500), siteResourcesHandler(501, []))

    await renderDialog()

    expect(await screen.findByText('没有数据')).toBeInTheDocument()
    expect(screen.queryByText('资源加载失败，请重试')).not.toBeInTheDocument()
    expect(mocks.toastError).not.toHaveBeenCalled()
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

    await renderDialog()
    await screen.findByText('没有数据')
    await user.click(screen.getByRole('button', { name: /^搜索$/ }))
    await waitFor(() => expect(screen.getByTestId('resource-loading-state')).toBeInTheDocument())
    nextResponse.resolve([createTorrentInfo({ title: '重复搜索结果' })])

    expect(await screen.findByText('重复搜索结果')).toBeInTheDocument()
    expect(screen.queryByTestId('resource-loading-state')).not.toBeInTheDocument()
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
    expect(screen.getByText('FREE').closest('.v-chip')).toHaveClass('text-success')
    expect(screen.getByText('50%').closest('.v-chip')).toHaveClass('text-success')
    expect(screen.getByText('2X').closest('.v-chip')).toHaveClass('text-info')
    expect(screen.queryByText('1x')).not.toBeInTheDocument()
  })

  it('opens and closes the add-download boundary through all child outcomes', async () => {
    server.use(siteCategoriesHandler(501, []), siteResourcesHandler(501, [createTorrentInfo({ title: '待下载资源' })]))
    const user = userEvent.setup()

    const { container } = await renderDialog()
    const title = await screen.findByText('待下载资源')
    expect(title.closest('button')).toBeNull()
    const card = container.querySelector('.site-resource-item')
    expect(card).not.toBeNull()

    await user.click(card as HTMLElement)
    expect(screen.getByTestId('add-download-dialog')).toHaveTextContent('待下载资源')
    await user.click(screen.getByRole('button', { name: 'close-download' }))
    expect(screen.queryByTestId('add-download-dialog')).not.toBeInTheDocument()

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

  it('loads the next resource page when the desktop list reaches the scroll threshold', async () => {
    const requests: URL[] = []
    const firstPage = Array.from({ length: 100 }, (_, index) =>
      createTorrentInfo({
        title: `分页资源 ${index + 1}`,
        pubdate: `2026-07-${String((index % 9) + 1).padStart(2, '0')}`,
      }),
    )
    server.use(
      siteCategoriesHandler(501, []),
      http.get(siteApiUrls.resources(501), ({ request }) => {
        const url = new URL(request.url)
        requests.push(url)
        return apiJson(url.searchParams.get('page') === '1' ? [createTorrentInfo({ title: '下一页资源' })] : firstPage)
      }),
    )

    const { container } = await renderDialog()
    await screen.findByText('分页资源 100')
    const scroll = container.querySelector('.site-resource-scroll') as HTMLElement
    Object.defineProperties(scroll, {
      clientHeight: { configurable: true, value: 600 },
      scrollHeight: { configurable: true, value: 1200 },
      scrollTop: { configurable: true, value: 700, writable: true },
    })
    await fireEvent.scroll(scroll)

    await waitFor(() => expect(requests).toHaveLength(2))
    expect(requests[1].searchParams.get('page')).toBe('1')
    expect(await screen.findByText('下一页资源')).toBeInTheDocument()
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
      '回退键资源|2026-07-19|1073741824|12',
    ])

    await user.click(screen.getByText('详情资源'))
    await user.click(screen.getByRole('button', { name: 'close-download' }))
    await user.click(screen.getByText('无外链资源'))
    await user.click(screen.getByRole('button', { name: 'close-download' }))

    const moreButtons = screen.getAllByRole('button', { name: '更多操作' })
    await user.click(moreButtons[0])
    await user.click(screen.getAllByText('查看详情').at(-1) as HTMLElement)
    await user.click(moreButtons[1])
    expect(screen.getAllByText('查看详情').at(-1)?.closest('.v-list-item')).toHaveClass('v-list-item--disabled')
    await user.click(moreButtons[0])
    await user.click(screen.getAllByText('下载种子文件').at(-1) as HTMLElement)
    expect(open).toHaveBeenNthCalledWith(1, 'https://tracker.example.com/details/one', '_blank')
    expect(open).toHaveBeenNthCalledWith(2, 'https://tracker.example.com/download/one', '_blank')
    expect(open).toHaveBeenCalledTimes(2)
    expect(screen.getAllByRole('button', { name: '更多操作' })).toHaveLength(3)
  })

  it('keeps the filter controls and two-line card content usable on mobile', async () => {
    setViewport(390)
    server.use(
      siteCategoriesHandler(501, [createSiteCategory({ desc: '电影', id: 11 })]),
      siteResourcesHandler(501, [
        createTorrentInfo({
          description: '移动端过长的资源描述用于验证最多两行截断行为',
          title: '移动端过长标题用于验证最多两行截断行为 1080p BluRay x265',
        }),
      ]),
    )

    const { container } = await renderDialog()
    expect(await screen.findByText(/移动端过长标题/)).toBeInTheDocument()
    expect(screen.getByLabelText('搜索关键字')).toBeInTheDocument()
    expect(screen.getByLabelText('资源分类')).toBeInTheDocument()
    expect(screen.getByLabelText('排序')).toBeInTheDocument()
    expect(container.querySelector('.site-resource-scroll')).not.toBeNull()
    expect(container.querySelector('.site-resource-item__title')).not.toBeNull()
    expect(container.querySelector('.site-resource-item__description')).not.toBeNull()
  })

  it('collapses mobile search controls while scrolling upward and restores them from the icon', async () => {
    setViewport(390)
    server.use(
      siteCategoriesHandler(501, []),
      siteResourcesHandler(501, [createTorrentInfo({ title: '可收起搜索资源' })]),
    )
    const user = userEvent.setup()

    const { container } = await renderDialog()
    await screen.findByText('可收起搜索资源')
    const scroll = container.querySelector('.site-resource-scroll') as HTMLElement
    Object.defineProperties(scroll, {
      clientHeight: { configurable: true, value: 600 },
      scrollHeight: { configurable: true, value: 1400 },
      scrollTop: { configurable: true, value: 120, writable: true },
    })

    await fireEvent.scroll(scroll)
    expect(screen.queryByLabelText('搜索关键字')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '搜索' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '搜索' }))
    expect(screen.getByLabelText('搜索关键字')).toBeInTheDocument()
  })

  it('emits close and formats the mobile result summary in English', async () => {
    setViewport(390)
    server.use(
      siteCategoriesHandler(501, []),
      siteResourcesHandler(501, [createTorrentInfo({ title: 'Language resource' })]),
    )
    const user = userEvent.setup()

    const { close } = await renderDialog()
    await screen.findByText('Language resource')
    i18n.global.locale.value = 'en-US'
    expect(await screen.findByText('1 resources')).toBeInTheDocument()

    const closeButton = screen.getByRole('button', { name: '关闭' })
    expect(closeButton).not.toBeNull()
    await user.click(closeButton)
    expect(close).toHaveBeenCalledOnce()
  })
})
