import { readFileSync } from 'node:fs'
import { cwd } from 'node:process'
import { resolve } from 'node:path'
import type { TransferHistory } from '@/api/types'
import i18n from '@/plugins/i18n'
import TransferHistoryView from '@/views/reorganize/TransferHistoryView.vue'
import { fireEvent, screen, waitFor } from '@testing-library/vue'
import { renderWithProviders } from '@tests/support/render'
import { flushPromises } from '@vue/test-utils'
import { computed, defineComponent, h, nextTick, ref, unref, type PropType } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const transferHistorySource = readFileSync(resolve(cwd(), 'src/views/reorganize/TransferHistoryView.vue'), 'utf8')

const mocks = vi.hoisted(() => ({
  apiDelete: vi.fn(),
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  appMode: false,
  desktop: true,
  dynamicButtonConfig: undefined as Record<string, unknown> | undefined,
  openSharedDialog: vi.fn(),
  progressCallback: undefined as ((event: MessageEvent) => unknown) | undefined,
  progressStart: vi.fn(),
  progressStop: vi.fn(),
  toastError: vi.fn(),
}))

vi.mock('@/api', () => ({
  default: createDataApiMock({
    delete: (...args: unknown[]) => mocks.apiDelete(...args),
    get: (...args: unknown[]) => mocks.apiGet(...args),
    post: (...args: unknown[]) => mocks.apiPost(...args),
  }),
  isApiBusinessFailure: (error: unknown) =>
    Boolean(error && typeof error === 'object' && (error as { businessFailure?: unknown }).businessFailure === true),
}))

vi.mock('vue-toastification', () => ({
  useToast: () => ({ error: mocks.toastError }),
}))

vi.mock('vuetify', async importOriginal => {
  const actual = await importOriginal<typeof import('vuetify')>()
  return {
    ...actual,
    useDisplay: () => ({
      mdAndUp: computed(() => mocks.desktop),
      smAndDown: computed(() => !mocks.desktop),
    }),
  }
})

vi.mock('@/composables/usePWA', () => ({
  usePWA: () => ({ appMode: computed(() => mocks.appMode) }),
}))

vi.mock('@/composables/useAvailableHeight', () => ({
  useAvailableHeight: () => ({ availableHeight: ref(600) }),
}))

vi.mock('@/composables/useBackground', () => ({
  useBackground: () => ({
    useProgressSSE: (_url: string, callback: (event: MessageEvent) => unknown) => {
      mocks.progressCallback = callback
      return {
        start: mocks.progressStart,
        stop: mocks.progressStop,
      }
    },
  }),
}))

vi.mock('@/composables/useSharedDialog', () => ({
  openSharedDialog: (...args: unknown[]) => mocks.openSharedDialog(...args),
}))

vi.mock('@/composables/useDynamicButton', () => ({
  useDynamicButton: (config: Record<string, unknown>) => {
    mocks.dynamicButtonConfig = config
  },
}))

const HistoryTableStub = defineComponent({
  name: 'VDataTableVirtual',
  props: {
    headers: {
      type: Array as PropType<
        Array<{
          key: string
          sortRaw?: (left: TransferHistory, right: TransferHistory) => number
        }>
      >,
      default: () => [],
    },
    items: {
      type: Array as PropType<TransferHistory[]>,
      default: () => [],
    },
    modelValue: {
      type: Array as PropType<TransferHistory[]>,
      default: () => [],
    },
  },
  emits: ['update:modelValue'],
  setup(props, { emit, slots }) {
    return () => {
      const sortResults =
        props.items.length >= 2
          ? Object.fromEntries(
              props.headers
                .filter(header => header.sortRaw)
                .map(header => [header.key, header.sortRaw?.(props.items[0], props.items[1])]),
            )
          : {}

      return h('section', { 'aria-label': '整理历史桌面列表' }, [
        h('output', { 'aria-label': '整理历史排序结果' }, JSON.stringify(sortResults)),
        ...props.items.map(item =>
          h('article', { 'data-history-id': item.id }, [
            item.image ? (slots['item.title']?.({ item }) ?? h('span', item.title)) : h('span', item.title),
            slots['item.actions']?.({ item }),
          ]),
        ),
        h(
          'button',
          {
            onClick: () => emit('update:modelValue', props.items),
            type: 'button',
          },
          '选择当前页',
        ),
      ])
    }
  },
})

type InfiniteStatus = 'empty' | 'error' | 'ok'

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
    const status = ref('idle')
    function load() {
      status.value = 'loading'
      emit('load', {
        done(nextStatus: InfiniteStatus) {
          status.value = nextStatus === 'ok' ? 'idle' : nextStatus
        },
      })
    }
    return () =>
      h('section', { 'aria-label': '整理历史无限列表', 'data-margin': String(props.margin) }, [
        h('output', { 'aria-label': '整理历史无限列表状态' }, status.value),
        status.value === 'loading' ? slots.loading?.({}) : null,
        status.value === 'error'
          ? slots.error?.({
              side: 'end',
              props: { color: undefined, onClick: load },
            })
          : null,
        status.value === 'empty' ? slots.empty?.({}) : null,
        slots.default?.(),
        status.value === 'idle' ? h('button', { onClick: load, type: 'button' }, '加载下一页') : null,
      ])
  },
})

const ProgressiveGridStub = defineComponent({
  name: 'ProgressiveCardGrid',
  props: {
    getItemKey: {
      type: Function as PropType<(item: TransferHistory) => number>,
      required: true,
    },
    items: {
      type: Array as PropType<TransferHistory[]>,
      default: () => [],
    },
  },
  setup(props, { slots }) {
    return () => {
      const candidates =
        props.items.length <= 7 ? props.items : [...props.items.slice(0, 3), props.items[24], ...props.items.slice(-3)]
      const renderedItems = [...new Map(candidates.map(item => [item.id, item])).values()]

      return h(
        'section',
        { 'aria-label': '整理历史移动列表' },
        renderedItems.flatMap(item => [
          h('output', { 'data-mobile-key': props.getItemKey(item) }, String(props.getItemKey(item))),
          ...(slots.default?.({ item }) ?? []),
        ]),
      )
    }
  },
})

const SearchStub = defineComponent({
  name: 'VCombobox',
  props: {
    modelValue: {
      type: String,
      default: '',
    },
  },
  emits: ['update:modelValue'],
  setup(props, { attrs, emit }) {
    return () =>
      h('input', {
        ...attrs,
        value: props.modelValue ?? '',
        onInput: (event: Event) => emit('update:modelValue', (event.target as HTMLInputElement).value),
      })
  },
})

const PassthroughStub = defineComponent({
  inheritAttrs: false,
  setup(_props, { attrs, slots }) {
    return () => h('div', attrs, slots.default?.())
  },
})

const IconButtonStub = defineComponent({
  name: 'IconBtn',
  inheritAttrs: false,
  setup(_props, { attrs, slots }) {
    return () => h('button', { ...attrs, type: 'button' }, slots.default?.())
  },
})

const EmptyStub = defineComponent({
  inheritAttrs: false,
  setup() {
    return () => h('div')
  },
})

const ImageStub = defineComponent({
  name: 'VImg',
  inheritAttrs: false,
  props: {
    alt: String,
    cover: Boolean,
    src: String,
  },
  setup(props, { attrs }) {
    return () =>
      h('div', { ...attrs, 'data-cover': String(props.cover) }, [
        h('img', { alt: props.alt, class: 'v-img__img', src: props.src }),
      ])
  },
})

const ListItemStub = defineComponent({
  name: 'VListItem',
  inheritAttrs: false,
  props: {
    disabled: Boolean,
  },
  emits: ['click'],
  setup(props, { emit, slots }) {
    return () =>
      h(
        'button',
        {
          disabled: props.disabled,
          onClick: () => emit('click'),
          type: 'button',
        },
        [slots.prepend?.(), slots.default?.()],
      )
  },
})

const ListItemTitleStub = defineComponent({
  name: 'VListItemTitle',
  inheritAttrs: false,
  setup(_props, { attrs, slots }) {
    return () => h('span', attrs, slots.default?.())
  },
})

function createHistory(id: number, title: string, overrides: Partial<TransferHistory> = {}): TransferHistory {
  return {
    id,
    title,
    type: '电影',
    status: true,
    src: `/downloads/${title}.mkv`,
    dest: `/media/${title}.mkv`,
    src_storage: 'downloads',
    dest_storage: 'library',
    mode: 'link',
    ...overrides,
  } as TransferHistory
}

function historyResponse(list: TransferHistory[], total = list.length) {
  return { data: { list, total }, success: true }
}

function deleteResultResponse(
  overrides: Partial<{ history: 'deleted' | 'retained' | 'not_found'; source: string; destination: string }> = {},
) {
  return {
    data: {
      source: { status: overrides.source ?? 'not_requested' },
      destination: { status: overrides.destination ?? 'not_requested' },
      history: overrides.history ?? 'deleted',
      message: '',
    },
    message: '',
    success: true,
  }
}

function storageResponse() {
  return []
}

function createDeferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, reject, resolve }
}

async function renderHistory(initialRoute = '/history') {
  return renderWithProviders(TransferHistoryView, {
    global: {
      stubs: {
        ProgressiveCardGrid: ProgressiveGridStub,
        VCombobox: SearchStub,
        VDataTableVirtual: HistoryTableStub,
        VImg: ImageStub,
        VInfiniteScroll: InfiniteScrollStub,
        IconBtn: IconButtonStub,
        VList: PassthroughStub,
        VListItem: ListItemStub,
        VListItemTitle: ListItemTitleStub,
        VMenu: PassthroughStub,
        VPageContentTitle: true,
        VPagination: EmptyStub,
        VSelect: EmptyStub,
      },
    },
    initialRoute,
    initialState: {
      globalSettings: {
        data: {
          AI_AGENT_ENABLE: true,
          GLOBAL_IMAGE_CACHE: false,
        },
      },
      user: {
        permissions: ['manage'],
        superUser: true,
      },
    },
  })
}

function getDynamicMenuItems() {
  const menuItems = mocks.dynamicButtonConfig?.menuItems
  return unref(menuItems) as
    | Array<{
        action: () => unknown
        titleParams?: Record<string, unknown>
        titleKey: string
      }>
    | undefined
}

function runDynamicAction(titleKey: string) {
  const item = getDynamicMenuItems()?.find(menu => menu.titleKey === titleKey)
  if (!item) throw new Error(`未注册动态按钮操作: ${titleKey}`)
  return item.action()
}

function getDialogCall(index = 0) {
  const [component, props, events, options] = mocks.openSharedDialog.mock.calls[index] as [
    { __name?: string; name?: string },
    Record<string, unknown>,
    Record<string, (...args: unknown[]) => unknown>,
    Record<string, unknown>,
  ]
  return { component, events, options, props }
}

describe('TransferHistoryView', () => {
  beforeEach(() => {
    mocks.appMode = true
    mocks.desktop = true
    mocks.dynamicButtonConfig = undefined
    mocks.progressCallback = undefined
    mocks.apiDelete.mockResolvedValue(deleteResultResponse())
    mocks.apiGet.mockImplementation((path: string) => {
      if (path === 'storage/options') return Promise.resolve(storageResponse())
      return Promise.resolve(historyResponse([]))
    })
    mocks.apiPost.mockResolvedValue({ data: { history_ids: [1], progress_key: 'progress-1' }, success: true })
    mocks.openSharedDialog.mockImplementation(() => ({
      close: vi.fn(),
      id: 1,
      updateProps: vi.fn(),
    }))
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('uses the desktop URL query as the request source and falls back from invalid pagination values', async () => {
    const requests: Array<Record<string, unknown>> = []
    mocks.apiGet.mockImplementation((path: string, config?: { params?: Record<string, unknown> }) => {
      if (path === 'storage/options') return Promise.resolve(storageResponse())
      requests.push(config?.params ?? {})
      return Promise.resolve(historyResponse([createHistory(1, '桌面结果')], 51))
    })

    await renderHistory('/history?search=%E7%A7%91%E5%B9%BB&itemsPerPage=30&currentPage=-8&grouped=true')

    expect(await screen.findByText('桌面结果')).toBeInTheDocument()
    expect(requests).toEqual([{ count: 50, page: 1, title: '科幻' }])
  })

  it('sends status as an explicit query while preserving the title search', async () => {
    const requests: Array<Record<string, unknown>> = []
    mocks.apiGet.mockImplementation((path: string, config?: { params?: Record<string, unknown> }) => {
      if (path === 'storage/options') return Promise.resolve(storageResponse())
      requests.push(config?.params ?? {})
      return Promise.resolve(historyResponse([]))
    })

    await renderHistory('/history?search=失败&status=failed')

    await waitFor(() => expect(requests).toEqual([{ count: 50, page: 1, status: false, title: '失败' }]))
  })

  it('joins the desktop status filter to search and moves the mobile filter into the titlebar menu', () => {
    const mobileTitlebarSource = transferHistorySource.slice(
      transferHistorySource.indexOf('<div class="transfer-history-mobile-titlebar__actions">'),
      transferHistorySource.indexOf('<VCombobox\n      key="search_mobile"'),
    )

    expect(transferHistorySource).toContain('class="transfer-history-desktop-filter-group"')
    expect(transferHistorySource).toContain('class="text-disabled transfer-history-desktop-search"')
    expect(transferHistorySource).toContain('class="transfer-history-desktop-status"')
    expect(transferHistorySource).toContain('variant="plain"')
    expect(transferHistorySource).toContain('transfer-history-desktop-filter-group:focus-within')
    expect(transferHistorySource).toContain('border-inline-start: 1px solid')
    expect(transferHistorySource).not.toContain(':label="t(\'transferHistory.statusFilter.label\')"')
    expect(transferHistorySource).toContain('data-menu-activator="history-status-filter-btn"')
    expect(transferHistorySource).not.toContain('class="transfer-history-mobile-status"')
    expect(mobileTitlebarSource.match(/<IconBtn/g)).toHaveLength(2)
    expect(mobileTitlebarSource).toContain('<VIcon icon="mdi-filter-multiple-outline" />')
    expect(mobileTitlebarSource).toContain('<VIcon icon="mdi-checkbox-multiple-marked-outline" />')
    expect(mobileTitlebarSource).not.toContain('settings-icon-button')
  })

  it('selects a mobile status from the titlebar dropdown and refreshes with the explicit status query', async () => {
    mocks.desktop = false
    const requests: Array<Record<string, unknown>> = []
    mocks.apiGet.mockImplementation((path: string, config?: { params?: Record<string, unknown> }) => {
      if (path === 'storage/options') return Promise.resolve(storageResponse())
      requests.push(config?.params ?? {})
      return Promise.resolve(historyResponse([]))
    })

    const { router } = await renderHistory()
    await fireEvent.click(screen.getByRole('button', { name: '状态筛选' }))
    await fireEvent.click(screen.getByRole('button', { name: '失败' }))

    await waitFor(() => expect(router.currentRoute.value.query.status).toBe('failed'))
    await fireEvent.click(screen.getByRole('button', { name: '加载下一页' }))
    await waitFor(() => expect(requests).toContainEqual({ count: 25, page: 1, status: false, title: '' }))
  })

  it('prevents an older desktop request from replacing a newer route search', async () => {
    const oldRequest = createDeferred<ReturnType<typeof historyResponse>>()
    const newRequest = createDeferred<ReturnType<typeof historyResponse>>()
    let historyCalls = 0
    mocks.apiGet.mockImplementation((path: string) => {
      if (path === 'storage/options') return Promise.resolve(storageResponse())
      historyCalls += 1
      return historyCalls === 1 ? oldRequest.promise : newRequest.promise
    })

    const { router } = await renderHistory('/history?search=old')
    await router.push('/history?search=new')
    newRequest.resolve(historyResponse([createHistory(2, '新结果')]))

    expect(await screen.findByText('新结果')).toBeInTheDocument()
    oldRequest.resolve(historyResponse([createHistory(1, '旧结果')]))
    await flushPromises()
    expect(screen.queryByText('旧结果')).not.toBeInTheDocument()
  })

  it('drops hidden desktop selections before a filtered batch delete', async () => {
    const hidden = createHistory(1, '筛选前记录')
    const visible = createHistory(2, '筛选后记录')
    mocks.apiGet.mockImplementation((path: string, config?: { params?: { title?: string } }) => {
      if (path === 'storage/options') return Promise.resolve(storageResponse())
      return Promise.resolve(historyResponse(config?.params?.title === 'new' ? [visible] : [hidden]))
    })

    const { router } = await renderHistory('/history')
    expect(await screen.findByText('筛选前记录')).toBeInTheDocument()
    await fireEvent.click(screen.getByRole('button', { name: '选择当前页' }))
    await nextTick()

    await router.push('/history?search=new')
    expect(await screen.findByText('筛选后记录')).toBeInTheDocument()
    expect(getDynamicMenuItems()).toBeUndefined()

    await fireEvent.click(screen.getByRole('button', { name: '选择当前页' }))
    await nextTick()
    runDynamicAction('transferHistory.actions.batchDelete')
    await getDialogCall().events.delete(false, true)

    expect(mocks.apiDelete).toHaveBeenCalledOnce()
    expect(mocks.apiDelete).toHaveBeenCalledWith(
      'history/transfer?deletesrc=false&deletedest=true',
      expect.objectContaining({ data: expect.objectContaining({ id: 2 }) }),
    )
  })

  it('constrains desktop Poster images to a fixed 2:3 cover frame', async () => {
    const item = createHistory(1, '桌面海报', {
      image: '/poster.jpg',
    })
    mocks.apiGet.mockImplementation((path: string) => {
      if (path === 'storage/options') return Promise.resolve(storageResponse())
      return Promise.resolve(historyResponse([item]))
    })

    const { container } = await renderHistory()

    expect(await screen.findByText('桌面海报')).toBeInTheDocument()
    const frame = container.querySelector<HTMLElement>('.transfer-history-desktop-poster-frame')
    const poster = frame?.querySelector<HTMLElement>('.transfer-history-desktop-poster')
    const image = poster?.querySelector<HTMLImageElement>('.v-img__img')

    expect(frame).toBeInTheDocument()
    expect(poster).toBeInTheDocument()
    expect(poster).toHaveAttribute('data-cover', 'true')
    expect(image).toHaveAttribute('src', expect.stringContaining('system/img/0?imgurl=%2Fposter.jpg'))
    expect(transferHistorySource).toContain('gap: 10px;')
    expect(transferHistorySource).toContain('padding-block: 6px;')
    expect(transferHistorySource).toContain('flex: 0 0 36px;')
    expect(transferHistorySource).toContain('inline-size: 36px;')
    expect(transferHistorySource).toContain('block-size: 54px;')
    expect(transferHistorySource).toContain('max-inline-size: 36px;')
    expect(transferHistorySource).toContain('max-block-size: 54px;')
    expect(transferHistorySource).toContain('overflow: hidden;')
    expect(transferHistorySource).toContain('aspect-ratio: 2 / 3;')
    expect(transferHistorySource).toContain(
      '.transfer-history-desktop-poster :deep(.v-img__img) {\n  object-fit: cover;',
    )
  })

  it('exposes title, episode, and source-size ordering through desktop table headers', async () => {
    const histories = [
      createHistory(1, '同名剧集', {
        episodes: 'E02',
        seasons: 'S01',
        src_fileitem: { size: 100 } as TransferHistory['src_fileitem'],
        type: '电视剧',
      }),
      createHistory(2, '同名剧集', {
        episodes: 'E01',
        seasons: 'S02',
        src_fileitem: { size: 200 } as TransferHistory['src_fileitem'],
        type: '电视剧',
      }),
    ]
    mocks.apiGet.mockImplementation((path: string) => {
      if (path === 'storage/options') return Promise.resolve(storageResponse())
      return Promise.resolve(historyResponse(histories))
    })

    await renderHistory()

    expect(await screen.findAllByText('同名剧集')).toHaveLength(2)
    const sortResults = JSON.parse(screen.getByRole('status', { name: '整理历史排序结果' }).textContent || '{}')
    expect(sortResults).toEqual({ size: -100, title: -1 })
  })

  it('persists desktop search through the same route-backed reload contract', async () => {
    vi.useFakeTimers()
    const { router } = await renderHistory('/history')
    await fireEvent.update(screen.getByLabelText('搜索（支持 * ? 通配符）'), 'desktop-query')
    await vi.advanceTimersByTimeAsync(1000)
    await flushPromises()

    expect(router.currentRoute.value.query).toMatchObject({
      currentPage: '1',
      itemsPerPage: '50',
      search: 'desktop-query',
    })
  })

  it('loads mobile pages with deduplication and reports empty when the last page is exhausted', async () => {
    mocks.desktop = false
    const firstPage = Array.from({ length: 25 }, (_, index) => createHistory(index + 1, `记录 ${index + 1}`))
    const secondPage = [
      createHistory(25, '重复记录'),
      ...Array.from({ length: 4 }, (_, index) => createHistory(26 + index, `追加 ${index + 1}`)),
    ]
    let historyCalls = 0
    mocks.apiGet.mockImplementation((path: string) => {
      if (path === 'storage/options') return Promise.resolve(storageResponse())
      historyCalls += 1
      return Promise.resolve(historyResponse(historyCalls === 1 ? firstPage : secondPage, 29))
    })

    await renderHistory('/history?search=%E7%A7%BB%E5%8A%A8')

    expect(screen.getByLabelText('整理历史无限列表')).toHaveAttribute('data-margin', '0')
    await fireEvent.click(screen.getByRole('button', { name: '加载下一页' }))
    expect(await screen.findByText('记录 25')).toBeInTheDocument()
    expect(screen.getByLabelText('整理历史无限列表')).toHaveAttribute('data-margin', '280')
    await fireEvent.click(screen.getByRole('button', { name: '加载下一页' }))
    expect(await screen.findByText('追加 4')).toBeInTheDocument()
    expect(document.querySelectorAll('[data-mobile-key="25"]')).toHaveLength(1)
    expect(screen.getByRole('status', { name: '整理历史无限列表状态' })).toHaveTextContent('empty')
  })

  it('keeps the mobile infinite list retryable after a request error', async () => {
    mocks.desktop = false
    let historyCalls = 0
    mocks.apiGet.mockImplementation((path: string) => {
      if (path === 'storage/options') return Promise.resolve(storageResponse())
      historyCalls += 1
      if (historyCalls === 1) return Promise.reject(new Error('temporary failure'))
      return Promise.resolve(historyResponse([createHistory(1, '重试结果')]))
    })

    await renderHistory()

    await fireEvent.click(screen.getByRole('button', { name: '加载下一页' }))
    await waitFor(() => expect(screen.getByRole('status', { name: '整理历史无限列表状态' })).toHaveTextContent('error'))
    await fireEvent.click(screen.getByRole('button', { name: '重试' }))
    expect(await screen.findByText('重试结果')).toBeInTheDocument()
  })

  it('formats mobile cards and keeps path and batch selection interactions reversible', async () => {
    mocks.desktop = false
    const item = createHistory(1, '移动剧集', {
      category: '动画',
      date: '2025-01-02 03:04:00',
      episodes: 'E03',
      errmsg: '目标路径不可用',
      image: '/poster.jpg',
      seasons: 'S01',
      status: false,
      type: '电视剧',
      year: '2025',
    })
    mocks.apiGet.mockImplementation((path: string) => {
      if (path === 'storage/options') return Promise.resolve(storageResponse())
      return Promise.resolve(historyResponse([item]))
    })

    const { container } = await renderHistory()
    await fireEvent.click(screen.getByRole('button', { name: '加载下一页' }))

    expect(await screen.findByText('移动剧集 S01E03')).toBeInTheDocument()
    expect(screen.getByText('动画 / 2025')).toBeInTheDocument()
    expect(screen.getByText('目标路径不可用')).toBeInTheDocument()
    const pathButton = container.querySelector('.transfer-history-mobile-record__paths') as HTMLButtonElement
    await fireEvent.click(pathButton)
    expect(pathButton).toHaveClass('transfer-history-mobile-record__paths--expanded')
    await fireEvent.click(pathButton)
    expect(pathButton).not.toHaveClass('transfer-history-mobile-record__paths--expanded')

    await fireEvent.click(screen.getByRole('button', { name: '批量选择' }))
    const record = container.querySelector('.transfer-history-mobile-record') as HTMLElement
    await fireEvent.click(record)
    expect(record).toHaveClass('transfer-history-mobile-record--selected')
    runDynamicAction('transferHistory.actions.deselectAll')
    await nextTick()
    expect(record).not.toHaveClass('transfer-history-mobile-record--selected')
    runDynamicAction('transferHistory.actions.exitBatchMode')
    await nextTick()
    expect(screen.getByRole('button', { name: '批量选择' })).toBeInTheDocument()
  })

  it('uses the storage-name fallback for both grouped and ungrouped desktop paths', () => {
    expect(transferHistorySource.match(/getHistoryStorageName\(item\?\.src_storage\)/g)).toHaveLength(3)
    expect(transferHistorySource.match(/getHistoryStorageName\(item\?\.dest_storage\)/g)).toHaveLength(3)
    expect(transferHistorySource).not.toContain("storageDict[item?.src_storage || '']")
    expect(transferHistorySource).not.toContain("storageDict[item?.dest_storage || '']")
  })

  it('shows actual audio specs in mobile music history', async () => {
    mocks.desktop = false
    const item = createHistory(2, '晴天', {
      audio_format: 'FLAC',
      bit_depth: 24,
      bitrate: 2_304_000,
      category: '华语流行',
      sample_rate: 96_000,
      type: '音乐',
      year: '2003',
    })
    mocks.apiGet.mockImplementation((path: string) => {
      if (path === 'storage/options') return Promise.resolve(storageResponse())
      return Promise.resolve(historyResponse([item]))
    })

    await renderHistory()
    await fireEvent.click(screen.getByRole('button', { name: '加载下一页' }))

    expect(await screen.findByText('华语流行 / 2003 / FLAC · 24-bit · 96 kHz · 2,304 kbps')).toBeInTheDocument()
  })

  it('prevents a mobile request invalidated by a route reset from appending stale records', async () => {
    mocks.desktop = false
    const oldRequest = createDeferred<ReturnType<typeof historyResponse>>()
    const newRequest = createDeferred<ReturnType<typeof historyResponse>>()
    let historyCalls = 0
    mocks.apiGet.mockImplementation((path: string) => {
      if (path === 'storage/options') return Promise.resolve(storageResponse())
      historyCalls += 1
      return historyCalls === 1 ? oldRequest.promise : newRequest.promise
    })

    const { router } = await renderHistory('/history?search=old')
    await fireEvent.click(screen.getByRole('button', { name: '加载下一页' }))
    await router.push('/history?search=new')
    await fireEvent.click(screen.getByRole('button', { name: '加载下一页' }))
    newRequest.resolve(historyResponse([createHistory(2, '移动新结果')]))

    expect(await screen.findByText('移动新结果')).toBeInTheDocument()
    oldRequest.resolve(historyResponse([createHistory(1, '移动旧结果')]))
    await flushPromises()
    expect(screen.queryByText('移动旧结果')).not.toBeInTheDocument()
  })

  it('persists mobile search in the URL before resetting the infinite list', async () => {
    vi.useFakeTimers()
    mocks.desktop = false
    const { router } = await renderHistory('/history?search=old')
    await flushPromises()

    await fireEvent.update(screen.getByLabelText('搜索（支持 * ? 通配符）'), 'new')
    await vi.advanceTimersByTimeAsync(600)

    expect(router.currentRoute.value).toMatchObject({
      path: '/history',
      query: { currentPage: '1', itemsPerPage: '50', search: 'new' },
    })
  })

  it('summarizes batch deletion failures, retains failed selections, and never renders undefined progress text', async () => {
    const histories = [createHistory(1, '成功项'), createHistory(2, '业务失败项'), createHistory(3, '异常失败项')]
    mocks.apiGet.mockImplementation((path: string) => {
      if (path === 'storage/options') return Promise.resolve(storageResponse())
      return Promise.resolve(historyResponse(histories))
    })
    mocks.apiDelete
      .mockResolvedValueOnce(deleteResultResponse())
      .mockResolvedValueOnce({
        data: {
          source: { status: 'not_requested' },
          destination: { status: 'failed', message: '目标文件被占用' },
          history: 'retained',
          message: '记录被占用',
        },
        message: '记录被占用',
        success: false,
      })
      .mockRejectedValueOnce(new Error('delete unavailable'))

    await renderHistory()
    expect(await screen.findByText('成功项')).toBeInTheDocument()
    await fireEvent.click(screen.getByRole('button', { name: '选择当前页' }))
    await nextTick()
    runDynamicAction('transferHistory.actions.batchDelete')

    const deleteDialog = getDialogCall()
    await deleteDialog.events.delete(false, false)
    await flushPromises()

    const progressDialog = getDialogCall(1)
    const controller = mocks.openSharedDialog.mock.results[1]?.value as { updateProps: ReturnType<typeof vi.fn> }
    expect(progressDialog.component.__name || progressDialog.component.name).toContain('ProgressDialog')
    expect(controller.updateProps).toHaveBeenCalled()
    expect(
      controller.updateProps.mock.calls
        .flatMap(call => Object.values(call[0]))
        .every(value => {
          return typeof value !== 'string' || !value.includes('undefined')
        }),
    ).toBe(true)
    expect(mocks.toastError).toHaveBeenCalledWith(expect.stringContaining('2'))
    expect(getDynamicMenuItems()?.some(item => item.titleKey === 'transferHistory.actions.batchDelete')).toBe(true)
  })

  it('shows the existing toast-style feedback when a single deletion request throws', async () => {
    const item = createHistory(1, '异常删除')
    mocks.apiGet.mockImplementation((path: string) => {
      if (path === 'storage/options') return Promise.resolve(storageResponse())
      return Promise.resolve(historyResponse([item]))
    })
    mocks.apiDelete.mockRejectedValueOnce(new Error('delete unavailable'))

    await renderHistory()
    expect(await screen.findByText('异常删除')).toBeInTheDocument()
    i18n.global.locale.value = 'en-US'
    await fireEvent.click(screen.getByRole('button', { name: '删除' }))
    await getDialogCall().events.delete(false, false)

    expect(mocks.toastError).toHaveBeenCalledWith('Failed to delete: Request failed')
  })

  it('retries only the unfinished file step after a partial deletion', async () => {
    const item = createHistory(1, '部分删除')
    mocks.apiGet.mockImplementation((path: string) => {
      if (path === 'storage/options') return Promise.resolve(storageResponse())
      return Promise.resolve(historyResponse([item]))
    })
    mocks.apiDelete
      .mockResolvedValueOnce({
        data: {
          source: { status: 'deleted' },
          destination: { status: 'failed', message: '媒体库暂不可用' },
          history: 'retained',
          message: '媒体库暂不可用',
        },
        message: '媒体库暂不可用',
        success: false,
      })
      .mockResolvedValueOnce(deleteResultResponse({ source: 'not_requested', destination: 'deleted' }))

    await renderHistory()
    expect(await screen.findByText('部分删除')).toBeInTheDocument()
    await fireEvent.click(screen.getByRole('button', { name: '删除' }))
    await getDialogCall().events.delete(true, true)
    await flushPromises()
    await fireEvent.click(screen.getByRole('button', { name: '删除' }))
    await getDialogCall(1).events.delete(true, true)
    await flushPromises()

    expect(mocks.apiDelete.mock.calls[0]?.[0]).toBe('history/transfer?deletesrc=true&deletedest=true')
    expect(mocks.apiDelete.mock.calls[1]?.[0]).toBe('history/transfer?deletesrc=false&deletedest=true')
  })

  it('releases delete-dialog ownership when either close contract fires', async () => {
    const item = createHistory(1, '删除弹窗生命周期')
    mocks.apiGet.mockImplementation((path: string) => {
      if (path === 'storage/options') return Promise.resolve(storageResponse())
      return Promise.resolve(historyResponse([item]))
    })

    await renderHistory()
    expect(await screen.findByText('删除弹窗生命周期')).toBeInTheDocument()
    await fireEvent.click(screen.getByRole('button', { name: '删除' }))
    const firstController = mocks.openSharedDialog.mock.results[0]?.value as { close: ReturnType<typeof vi.fn> }
    getDialogCall().events['update:modelValue'](false)
    await fireEvent.click(screen.getByRole('button', { name: '删除' }))
    expect(firstController.close).not.toHaveBeenCalled()

    getDialogCall(1).events.close()
    await fireEvent.click(screen.getByRole('button', { name: '删除' }))
    const secondController = mocks.openSharedDialog.mock.results[1]?.value as { close: ReturnType<typeof vi.fn> }
    expect(secondController.close).not.toHaveBeenCalled()
  })

  it('moves back to the last available page after deleting the only record on the current page', async () => {
    const item = createHistory(26, '第二页唯一记录')
    const requestedPages: number[] = []
    mocks.apiGet.mockImplementation((path: string, config?: { params?: { page?: number } }) => {
      if (path === 'storage/options') return Promise.resolve(storageResponse())
      const page = config?.params?.page ?? 1
      requestedPages.push(page)
      if (requestedPages.length === 1) return Promise.resolve(historyResponse([item], 26))
      return Promise.resolve(historyResponse([], 25))
    })

    const { router } = await renderHistory('/history?itemsPerPage=25&currentPage=2')
    expect(await screen.findByText('第二页唯一记录')).toBeInTheDocument()
    await fireEvent.click(screen.getByRole('button', { name: '删除' }))
    await getDialogCall().events.delete(false, false)
    await waitFor(() => expect(router.currentRoute.value.query.currentPage).toBe('1'))
    await waitFor(() => expect(requestedPages).toEqual([2, 2, 1]))
  })

  it('keeps failed mobile batch identities selected after resetting and reloading the list', async () => {
    mocks.desktop = false
    const histories = [createHistory(1, '删除成功'), createHistory(2, '保留甲'), createHistory(3, '保留乙')]
    let historyCalls = 0
    mocks.apiGet.mockImplementation((path: string) => {
      if (path === 'storage/options') return Promise.resolve(storageResponse())
      historyCalls += 1
      return Promise.resolve(historyResponse(historyCalls === 1 ? histories : histories.slice(1)))
    })
    mocks.apiDelete
      .mockResolvedValueOnce(deleteResultResponse())
      .mockResolvedValueOnce({
        data: {
          source: { status: 'not_requested' },
          destination: { status: 'failed', message: 'occupied' },
          history: 'retained',
          message: 'occupied',
        },
        message: 'occupied',
        success: false,
      })
      .mockRejectedValueOnce(new Error('delete unavailable'))

    await renderHistory()
    await fireEvent.click(screen.getByRole('button', { name: '加载下一页' }))
    expect(await screen.findByText('删除成功')).toBeInTheDocument()
    await fireEvent.click(screen.getByRole('button', { name: '批量选择' }))
    runDynamicAction('transferHistory.actions.selectAll')
    await nextTick()
    runDynamicAction('transferHistory.actions.batchDelete')
    i18n.global.locale.value = 'zh-TW'
    await getDialogCall().events.delete(false, false)

    expect(screen.getByRole('button', { name: '退出批量選擇' })).toBeInTheDocument()
    expect(getDynamicMenuItems()?.find(item => item.titleKey === 'transferHistory.selectedCount')?.titleParams).toEqual(
      { count: 0, total: 0 },
    )
    expect(mocks.toastError).toHaveBeenCalledWith(expect.stringContaining('刪除失敗：2/3'))

    await fireEvent.click(screen.getByRole('button', { name: '加载下一页' }))
    expect(await screen.findByText('保留甲')).toBeInTheDocument()
    expect(getDynamicMenuItems()?.find(item => item.titleKey === 'transferHistory.selectedCount')?.titleParams).toEqual(
      { count: 2, total: 2 },
    )
  })

  it('opens the transfer queue as an isolated shared-dialog boundary', async () => {
    await renderHistory()
    const onClick = mocks.dynamicButtonConfig?.onClick as (() => unknown) | undefined
    onClick?.()

    const dialog = getDialogCall()
    expect(dialog.component.__name || dialog.component.name).toContain('TransferQueueDialog')
    expect(dialog.options).toEqual({ closeOn: ['close'] })
  })

  it('opens the reorganize boundary with selected ids and refreshes after done', async () => {
    const histories = [createHistory(10, '重整甲'), createHistory(11, '重整乙')]
    let historyCalls = 0
    mocks.apiGet.mockImplementation((path: string) => {
      if (path === 'storage/options') return Promise.resolve(storageResponse())
      historyCalls += 1
      return Promise.resolve(historyResponse(histories))
    })

    await renderHistory()
    expect(await screen.findByText('重整甲')).toBeInTheDocument()
    await fireEvent.click(screen.getByRole('button', { name: '选择当前页' }))
    await nextTick()
    runDynamicAction('transferHistory.actions.batchRedo')

    const dialog = getDialogCall()
    expect(dialog.props).toMatchObject({ logids: [10, 11] })
    expect(dialog.options).toEqual({ closeOn: ['close', 'done'] })
    await dialog.events.done()
    expect(historyCalls).toBeGreaterThan(1)
    expect(getDynamicMenuItems()).toBeUndefined()
  })

  it('owns the batch AI redo SSE lifecycle through the progress boundary', async () => {
    const histories = [createHistory(1, 'AI 重整')]
    let historyCalls = 0
    mocks.apiGet.mockImplementation((path: string) => {
      if (path === 'storage/options') return Promise.resolve(storageResponse())
      historyCalls += 1
      return Promise.resolve(historyResponse(histories))
    })

    const { unmount } = await renderHistory()
    expect(await screen.findByText('AI 重整')).toBeInTheDocument()
    await fireEvent.click(screen.getByRole('button', { name: '选择当前页' }))
    await nextTick()
    runDynamicAction('transferHistory.actions.batchAiRedo')
    await flushPromises()

    expect(mocks.apiPost).toHaveBeenCalledWith('history/transfer/ai-redo', { history_ids: [1] })
    expect(mocks.progressStart).toHaveBeenCalledOnce()
    expect(mocks.progressCallback).toBeTypeOf('function')

    await mocks.progressCallback?.(
      new MessageEvent('message', {
        data: JSON.stringify({ enable: true, text: '处理中' }),
      }),
    )
    const progressController = mocks.openSharedDialog.mock.results[0]?.value as {
      close: ReturnType<typeof vi.fn>
      updateProps: ReturnType<typeof vi.fn>
    }
    expect(progressController.updateProps).toHaveBeenCalledWith({ text: '处理中' })

    await mocks.progressCallback?.(
      new MessageEvent('message', {
        data: JSON.stringify({ data: { error: 'AI 失败', success: false }, enable: false }),
      }),
    )
    expect(mocks.progressStop).toHaveBeenCalledOnce()
    expect(progressController.close).toHaveBeenCalledOnce()
    expect(mocks.toastError).toHaveBeenCalledWith('AI 失败')
    expect(historyCalls).toBeGreaterThan(1)

    unmount()
    expect(mocks.progressStop).toHaveBeenCalled()
  })

  it('starts the single AI redo progress boundary with the accepted progress key', async () => {
    const item = createHistory(7, '单条 AI')
    mocks.apiGet.mockImplementation((path: string) => {
      if (path === 'storage/options') return Promise.resolve(storageResponse())
      return Promise.resolve(historyResponse([item]))
    })
    mocks.apiPost.mockResolvedValueOnce({ data: { progress_key: 'single-progress' }, success: true })

    await renderHistory()
    expect(await screen.findByText('单条 AI')).toBeInTheDocument()
    await fireEvent.click(screen.getByRole('button', { name: '智能助手整理' }))
    await flushPromises()

    expect(mocks.apiPost).toHaveBeenCalledWith('history/transfer/7/ai-redo')
    expect(mocks.progressStart).toHaveBeenCalledOnce()
    expect(mocks.openSharedDialog).toHaveBeenCalledOnce()
  })

  it('does not start a single AI redo progress boundary when its POST resolves after unmount', async () => {
    const item = createHistory(1, '卸载中的单条 AI')
    const pending = createDeferred<{ data: { progress_key: string }; success: boolean }>()
    mocks.apiGet.mockImplementation((path: string) => {
      if (path === 'storage/options') return Promise.resolve(storageResponse())
      return Promise.resolve(historyResponse([item]))
    })
    mocks.apiPost.mockReturnValueOnce(pending.promise)

    const { unmount } = await renderHistory()
    expect(await screen.findByText('卸载中的单条 AI')).toBeInTheDocument()
    await fireEvent.click(screen.getByRole('button', { name: '智能助手整理' }))
    unmount()
    pending.resolve({ data: { progress_key: 'late-single' }, success: true })
    await flushPromises()

    expect(mocks.progressStart).not.toHaveBeenCalled()
    expect(mocks.openSharedDialog).not.toHaveBeenCalled()
  })

  it('does not start a batch AI redo progress boundary when its POST resolves after unmount', async () => {
    const item = createHistory(1, '卸载中的批量 AI')
    const pending = createDeferred<{
      data: { history_ids: number[]; progress_key: string }
      success: boolean
    }>()
    mocks.apiGet.mockImplementation((path: string) => {
      if (path === 'storage/options') return Promise.resolve(storageResponse())
      return Promise.resolve(historyResponse([item]))
    })
    mocks.apiPost.mockReturnValueOnce(pending.promise)

    const { unmount } = await renderHistory()
    expect(await screen.findByText('卸载中的批量 AI')).toBeInTheDocument()
    await fireEvent.click(screen.getByRole('button', { name: '选择当前页' }))
    await nextTick()
    runDynamicAction('transferHistory.actions.batchAiRedo')
    unmount()
    pending.resolve({ data: { history_ids: [1], progress_key: 'late-batch' }, success: true })
    await flushPromises()

    expect(mocks.progressStart).not.toHaveBeenCalled()
    expect(mocks.openSharedDialog).not.toHaveBeenCalled()
  })
})
