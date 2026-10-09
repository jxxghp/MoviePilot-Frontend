import { readFileSync } from 'node:fs'
import { cwd } from 'node:process'
import { resolve } from 'node:path'
import type { TransferHistory } from '@/api/types'
import i18n from '@/plugins/i18n'
import TransferHistoryView from '@/views/reorganize/TransferHistoryView.vue'
import { fireEvent, screen, waitFor } from '@testing-library/vue'
import { renderWithProviders } from '@tests/support/render'
import { flushPromises } from '@vue/test-utils'
import { computed, defineComponent, h, KeepAlive, nextTick, ref, unref, type PropType } from 'vue'
import { RouterView } from 'vue-router'
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
  toastSuccess: vi.fn(),
}))

vi.mock('@/api', () => ({
  default: createDataApiMock({
    delete: (...args: unknown[]) => mocks.apiDelete(...args),
    get: (...args: unknown[]) => mocks.apiGet(...args),
    post: (...args: unknown[]) => mocks.apiPost(...args),
  }),
  isApiBusinessFailure: (error: unknown) =>
    Boolean(error && typeof error === 'object' && (error as { businessFailure?: unknown }).businessFailure === true),
  getApiBusinessErrorMessage: (error: unknown) => {
    if (!error || typeof error !== 'object') return undefined
    const payload = (error as { payload?: { message?: unknown } }).payload
    return typeof payload?.message === 'string' ? payload.message : undefined
  },
}))

vi.mock('vue-toastification', () => ({
  useToast: () => ({ error: mocks.toastError, success: mocks.toastSuccess }),
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
  useAvailableHeight: () => ({ availableHeight: ref(600), viewportHeight: ref(900) }),
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

/** 桌面列表替身仅提供槽位与选择协议，真实排序和分组另有集成用例。 */
const HistoryTableStub = defineComponent({
  name: 'VDataTableVirtual',
  props: {
    groupBy: {
      type: Array as PropType<Array<{ key: string }>>,
      default: () => [],
    },
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
  /** 透传原始记录与槽位，让业务操作使用真实页面方法。 */
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

      const groups = new Map<string, TransferHistory[]>()
      const groupKey = props.groupBy[0]?.key
      if (groupKey && slots['group-header']) {
        for (const item of props.items) {
          const key = String((item as unknown as Record<string, unknown>)[groupKey] ?? '')
          groups.set(key, [...(groups.get(key) || []), item])
        }
      }

      const groupHeaders = [...groups].flatMap(([value, items]) => {
        if (!(items[0] as TransferHistory & { history_group_is_music_album?: boolean }).history_group_is_music_album) {
          return []
        }
        return (
          slots['group-header']?.({
            columns: props.headers,
            isGroupOpen: () => false,
            item: { items: items.map(item => ({ value: item })), value },
            toggleGroup: () => undefined,
          }) ?? []
        )
      })

      return h('section', { 'aria-label': '整理历史桌面列表', 'data-grouped': Boolean(groupKey) }, [
        h('output', { 'aria-label': '整理历史排序结果' }, JSON.stringify(sortResults)),
        ...groupHeaders,
        ...props.items.map(item =>
          h(
            'article',
            {
              'data-history-group-key': (item as TransferHistory & { history_group_key?: string }).history_group_key,
              'data-history-id': item.id,
            },
            [slots.item?.({ item, columns: props.headers, itemRef: () => {} }) ?? h('span', item.title)],
          ),
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

/** 用原生选择器测试字段切换，保持 Vuetify 的值与事件协议。 */
const SelectStub = defineComponent({
  name: 'VSelect',
  props: ['modelValue', 'items'],
  emits: ['update:modelValue'],
  /** 渲染所有选项并把用户选择回传给真实页面逻辑。 */
  setup(props, { attrs, emit }) {
    return () =>
      h(
        'select',
        {
          ...attrs,
          value: props.modelValue,
          onChange: (event: Event) => emit('update:modelValue', (event.target as HTMLSelectElement).value),
        },
        (props.items || []).map((item: { title: string; value: string | number }) =>
          h('option', { value: item.value }, item.title),
        ),
      )
  },
})

const PassthroughStub = defineComponent({
  inheritAttrs: false,
  setup(_props, { attrs, slots }) {
    return () => h('div', attrs, slots.default?.())
  },
})

const TooltipStub = defineComponent({
  name: 'VTooltip',
  props: {
    disabled: Boolean,
    text: {
      type: String,
      default: '',
    },
  },
  setup(props, { slots }) {
    return () =>
      h(
        'div',
        {
          'data-history-tooltip': props.disabled ? 'disabled' : 'enabled',
          'data-tooltip-text': props.text,
        },
        slots.activator?.({ props: {} }),
      )
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

/** 构造可供桌面表格和移动卡片共同消费的整理历史。 */
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

/** 构造历史查询的响应 envelope，支持分页总量与当前列表独立设置。 */
function historyResponse(list: TransferHistory[], total = list.length) {
  return { data: { list, total }, success: true }
}

/** 构造各文件删除步骤的响应，用于验证部分失败与重试行为。 */
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

/** 默认不配置额外存储，避免无关存储选项影响历史页测试。 */
function storageResponse() {
  return []
}

/** 显式控制请求完成顺序，验证路由切换与异步响应的竞争。 */
function createDeferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, reject, resolve }
}

/** 用指定路由和管理权限渲染历史列表的真实交互入口。 */
async function renderHistory(initialRoute = '/history', canManage = true, realVirtualTable = false) {
  return renderWithProviders(TransferHistoryView, {
    global: {
      stubs: {
        ProgressiveCardGrid: ProgressiveGridStub,
        VCombobox: SearchStub,
        VDataTableVirtual: realVirtualTable ? false : HistoryTableStub,
        VImg: ImageStub,
        VInfiniteScroll: InfiniteScrollStub,
        IconBtn: IconButtonStub,
        VFab: IconButtonStub,
        VTooltip: TooltipStub,
        VList: PassthroughStub,
        VListItem: ListItemStub,
        VListItemTitle: ListItemTitleStub,
        VMenu: PassthroughStub,
        VPageContentTitle: true,
        VPagination: EmptyStub,
        VSelect: SelectStub,
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
        permissions: canManage ? ['manage'] : [],
        superUser: canManage,
      },
    },
  })
}

/** 通过真实路由和 KeepAlive 验证离开历史页、再次进入时的状态恢复。 */
async function renderHistoryRoute(initialRoute = '/history', downloadingBeforeEnter?: () => Promise<void>) {
  const RouterHost = defineComponent({
    name: 'HistoryRouterHost',
    setup: () => () =>
      h(RouterView, null, {
        default: ({ Component }: { Component: object }) =>
          h(KeepAlive, null, { default: () => (Component ? h(Component) : null) }),
      }),
  })
  const DownloadingRoute = defineComponent({
    name: 'DownloadingTestRoute',
    setup: () => () => h('div', '下载管理'),
  })

  return renderWithProviders(RouterHost, {
    global: {
      stubs: {
        ProgressiveCardGrid: ProgressiveGridStub,
        VCombobox: SearchStub,
        VDataTableVirtual: HistoryTableStub,
        VImg: ImageStub,
        VInfiniteScroll: InfiniteScrollStub,
        IconBtn: IconButtonStub,
        VFab: IconButtonStub,
        VTooltip: TooltipStub,
        VList: PassthroughStub,
        VListItem: ListItemStub,
        VListItemTitle: ListItemTitleStub,
        VMenu: PassthroughStub,
        VPageContentTitle: true,
        VPagination: EmptyStub,
        VSelect: SelectStub,
      },
    },
    initialRoute,
    initialState: {
      globalSettings: { data: { AI_AGENT_ENABLE: true, GLOBAL_IMAGE_CACHE: false } },
      user: { permissions: ['manage'], superUser: true },
    },
    routes: [
      { path: '/history', component: TransferHistoryView, meta: { keepAlive: true } },
      {
        path: '/downloading',
        component: DownloadingRoute,
        ...(downloadingBeforeEnter ? { beforeEnter: downloadingBeforeEnter } : {}),
      },
    ],
  })
}

/** 读取动态操作菜单的公开配置，支持响应式与普通数组。 */
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

/** 通过已注册的动态菜单操作触发对应用户交互。 */
function runDynamicAction(titleKey: string) {
  const item = getDynamicMenuItems()?.find(menu => menu.titleKey === titleKey)
  if (!item) throw new Error(`未注册动态按钮操作: ${titleKey}`)
  return item.action()
}

/** 读取共享弹窗边界的参数和事件，以验证页面后续刷新与导航。 */
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

  it('remembers manual grouping when returning from another route without query parameters', async () => {
    mocks.apiGet.mockImplementation((path: string) =>
      Promise.resolve(
        path === 'storage/options' ? storageResponse() : historyResponse([createHistory(1, '分组偏好记录')]),
      ),
    )
    const { router } = await renderHistoryRoute()
    await flushPromises()

    await fireEvent.click(screen.getByRole('button', { name: '分组模式' }))
    await waitFor(() => expect(router.currentRoute.value.query.grouped).toBe('true'))
    expect(localStorage.getItem('transferHistory.grouped')).toBe('true')

    await router.push('/downloading')
    await router.push('/history')
    await flushPromises()

    expect(screen.getByLabelText('媒体整理历史')).toHaveAttribute('data-grouped', 'true')
  })

  it('remembers a manual flat view after remounting even when the page contains a music album', async () => {
    const tracks = [
      createHistory(1, '第一首', { dest: '/media/Album/01.flac', type: '音乐' }),
      createHistory(2, '第二首', { dest: '/media/Album/02.flac', type: '音乐' }),
    ]
    mocks.apiGet.mockImplementation((path: string) =>
      Promise.resolve(path === 'storage/options' ? storageResponse() : historyResponse(tracks)),
    )
    const first = await renderHistory('/history?grouped=true')
    await flushPromises()
    await fireEvent.click(screen.getByRole('button', { name: '列表模式' }))
    await waitFor(() => expect(first.router.currentRoute.value.query.grouped).toBe('false'))
    expect(localStorage.getItem('transferHistory.grouped')).toBe('false')
    first.unmount()

    const second = await renderHistory()
    await flushPromises()

    expect(screen.getByLabelText('媒体整理历史')).toHaveAttribute('data-grouped', 'false')
    expect(second.router.currentRoute.value.query.grouped).toBeUndefined()
  })

  it.each(['true', 'false'])('restores saved grouping %s and lets an explicit URL override it', async saved => {
    mocks.apiGet.mockImplementation((path: string) =>
      Promise.resolve(
        path === 'storage/options' ? storageResponse() : historyResponse([createHistory(1, '分组偏好记录')]),
      ),
    )
    localStorage.setItem('transferHistory.grouped', saved)
    const { router } = await renderHistory()
    await flushPromises()
    expect(screen.getByLabelText('媒体整理历史')).toHaveAttribute('data-grouped', saved)

    await router.push(`/history?grouped=${saved === 'true' ? 'false' : 'true'}`)
    await flushPromises()
    expect(screen.getByLabelText('媒体整理历史')).toHaveAttribute('data-grouped', String(saved !== 'true'))
    expect(localStorage.getItem('transferHistory.grouped')).toBe(saved)

    await router.push('/history')
    await flushPromises()
    expect(screen.getByLabelText('媒体整理历史')).toHaveAttribute('data-grouped', saved)
  })

  it('opens the confirmation dialog before marking downloader cleanup as resolved', async () => {
    const item = createHistory(7, '已入库媒体', {
      cleanup_error: '删除下载任务失败',
      cleanup_status: 'failed',
      failure_stage: 'downloader_cleanup',
      status: true,
    })
    mocks.apiGet.mockImplementation((path: string) => {
      if (path === 'storage/options') return Promise.resolve(storageResponse())
      return Promise.resolve(historyResponse([item]))
    })

    await renderHistory('/history')
    await fireEvent.click(await screen.findByRole('button', { name: '标记下载器已清理' }))

    const dialog = getDialogCall()
    expect(dialog.component.__name || dialog.component.name).toContain('TransferRecoveryDialog')
    expect(dialog.props).toEqual({ history: expect.objectContaining(item), canManage: true })
    expect(mocks.apiPost).not.toHaveBeenCalled()
  })

  it('does not expose failure feedback for a successful history record', async () => {
    const item = createHistory(8, '正常成功记录')
    mocks.apiGet.mockImplementation((path: string) => {
      if (path === 'storage/options') return Promise.resolve(storageResponse())
      return Promise.resolve(historyResponse([item]))
    })

    const { container } = await renderHistory('/history')
    const row = await waitFor(() => {
      const element = container.querySelector('[data-history-id="8"]')
      if (!element) throw new Error('历史记录尚未渲染')
      return element
    })
    const tooltip = row.querySelector('.transfer-history-desktop-record__status [data-history-tooltip]')

    expect(tooltip).toHaveAttribute('data-history-tooltip', 'disabled')
    expect(tooltip).toHaveAttribute('data-tooltip-text', '')
  })

  it.each([
    { desktop: true, grouped: false },
    { desktop: true, grouped: true },
    { desktop: false, grouped: false },
  ])(
    'opens paused recovery and refreshes after resolving on $desktop desktop, grouped=$grouped',
    async ({ desktop, grouped }) => {
      mocks.desktop = desktop
      const item = createHistory(17, '暂停媒体', {
        status: false,
        auto_paused: true,
        transfer_task_id: 'task-17',
        failure_stage: 'destination_access',
        errmsg: '目标目录不可写',
        recovery_action: '检查目录权限后重试',
        retry_count: 3,
      })
      let historyCalls = 0
      mocks.apiGet.mockImplementation((path: string) => {
        if (path === 'storage/options') return Promise.resolve(storageResponse())
        historyCalls += 1
        return Promise.resolve(historyResponse([item]))
      })
      const { container } = await renderHistory(`/history?grouped=${grouped}`)
      if (!desktop) await fireEvent.click(screen.getByRole('button', { name: '加载下一页' }))

      await fireEvent.click(await screen.findByRole('button', { name: '自动暂停' }))
      const dialog = getDialogCall()
      expect(dialog.component.__name || dialog.component.name).toContain('TransferRecoveryDialog')
      expect(dialog.props).toEqual({ history: expect.objectContaining(item), canManage: true })
      expect(dialog.options).toEqual({ closeOn: ['close', 'redo', 'queue'] })
      if (!desktop) {
        expect(container.querySelector('.transfer-history-mobile-record')).not.toHaveClass(
          'transfer-history-mobile-record--selected',
        )
        expect(screen.getByText(/目标目录不可写/)).toHaveTextContent('检查目录权限后重试')
      }
      await dialog.events.updated()
      if (!desktop) await fireEvent.click(screen.getByRole('button', { name: '加载下一页' }))
      await waitFor(() => expect(historyCalls).toBe(2))

      await dialog.events.redo()
      expect(getDialogCall(1).props).toMatchObject({ logids: [17], target_storage: 'library' })
      await dialog.events.queue()
      expect(getDialogCall(2).component.__name || getDialogCall(2).component.name).toContain('TransferQueueDialog')
    },
  )

  it('opens read-only recovery for users without management permission', async () => {
    const item = createHistory(18, '只读失败', { status: false, failure_stage: 'overwrite' })
    mocks.apiGet.mockImplementation((path: string) =>
      Promise.resolve(path === 'storage/options' ? storageResponse() : historyResponse([item])),
    )
    await renderHistory('/history', false)
    await fireEvent.click(await screen.findByRole('button', { name: '覆盖跳过' }))
    expect(getDialogCall().props).toMatchObject({ canManage: false, history: { id: 18 } })
    expect(mocks.apiPost).not.toHaveBeenCalled()
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

  it.each([null, 'invalid'])('automatically groups music albums with no valid saved preference (%s)', async saved => {
    if (saved !== null) localStorage.setItem('transferHistory.grouped', saved)
    const tracks = [
      createHistory(1, '女骑士', {
        dest: '/media/徐良/情话 (2013)/01 - 女骑士.flac',
        src: '/downloads/徐良 情话/01 - 女骑士.flac',
        type: '音乐',
      }),
      createHistory(2, '悲伤的李白', {
        dest: '/media/徐良/情话 (2013)/02 - 悲伤的李白.flac',
        src: '/downloads/徐良 情话/02 - 悲伤的李白.flac',
        type: '音乐',
      }),
    ]
    mocks.apiGet.mockImplementation((path: string) => {
      if (path === 'system/setting/public/Storages') return Promise.resolve(storageResponse())
      return Promise.resolve(historyResponse(tracks))
    })

    const { container, router } = await renderHistory('/history')

    await waitFor(() => expect(router.currentRoute.value.query.grouped).toBe('true'))
    expect(localStorage.getItem('transferHistory.grouped')).toBe(saved)
    const rows = [...container.querySelectorAll<HTMLElement>('[data-history-group-key]')]
    expect(rows).toHaveLength(2)
    expect(rows[0]?.dataset.historyGroupKey).toBe(rows[1]?.dataset.historyGroupKey)
    expect(rows[0]?.dataset.historyGroupKey).toContain('/media/徐良/情话 (2013)')
  })

  it('shows a useful album summary while music history is collapsed', async () => {
    const tracks = [
      createHistory(1, 'Hotel California', {
        category: 'Album / Compilation',
        date: '2000-01-02 00:35:10',
        dest: '/media/Eagles/Hotel California (1976)/01 - Hotel California.dsf',
        image: 'https://example.com/hotel-california.jpg',
        src: '/media/Eagles/Hotel California (1976)/01 - Hotel California.dsf',
        src_fileitem: { size: 1024 } as TransferHistory['src_fileitem'],
        src_storage: 'library',
        type: '音乐',
      }),
      createHistory(2, 'New Kid in Town', {
        category: 'Album / Compilation',
        date: '2000-01-02 00:36:15',
        dest: '/media/Eagles/Hotel California (1976)/02 - New Kid in Town.dsf',
        image: 'https://example.com/hotel-california.jpg',
        src: '/media/Eagles/Hotel California (1976)/02 - New Kid in Town.dsf',
        src_fileitem: { size: 1024 } as TransferHistory['src_fileitem'],
        src_storage: 'library',
        type: '音乐',
      }),
    ]
    mocks.apiGet.mockImplementation((path: string) => {
      if (path === 'system/setting/public/Storages') return Promise.resolve(storageResponse())
      return Promise.resolve(historyResponse(tracks))
    })

    await renderHistory('/history?grouped=true')

    expect(await screen.findByText('Hotel California (1976)')).toBeInTheDocument()
    expect(screen.getByText('Eagles')).toBeInTheDocument()
    expect(screen.getAllByText('Album / Compilation')).toHaveLength(3)
    expect(screen.getByText('/media/Eagles/Hotel California (1976)')).toBeInTheDocument()
    expect(screen.getByText('2.00 KB')).toBeInTheDocument()
    expect(
      screen
        .getAllByTitle('2000-01-02 00:36:15')
        .some(element => element.classList.contains('transfer-history-album-summary__fact')),
    ).toBe(true)
    expect(screen.getByText('成功 2')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Hotel California (1976)' })).toHaveAttribute(
      'src',
      'https://example.com/hotel-california.jpg',
    )
  })

  it('groups failed music records by their source album directory and source storage', async () => {
    const tracks = [
      createHistory(1, 'Track 1', {
        dest: '/media/Artist/Predicted Album A/01.flac',
        src: '/downloads/Album Bundle/01.flac',
        status: false,
        type: '音乐',
      }),
      createHistory(2, 'Track 2', {
        dest: '/media/Artist/Predicted Album B/02.flac',
        src: '/downloads/Album Bundle/02.flac',
        status: false,
        type: '音乐',
      }),
    ]
    mocks.apiGet.mockImplementation((path: string) => {
      if (path === 'system/setting/public/Storages') return Promise.resolve(storageResponse())
      return Promise.resolve(historyResponse(tracks))
    })

    const { container } = await renderHistory('/history')

    const rows = await waitFor(() => {
      const items = [...container.querySelectorAll<HTMLElement>('[data-history-group-key]')]
      expect(items).toHaveLength(2)
      return items
    })
    expect(rows[0]?.dataset.historyGroupKey).toBe('music:["downloads","/downloads/Album Bundle"]')
    expect(rows[1]?.dataset.historyGroupKey).toBe(rows[0]?.dataset.historyGroupKey)
  })

  it('preserves the original exact-title grouping identity for non-music records', async () => {
    const histories = [
      createHistory(1, 'Shared Title', { type: '电影' }),
      createHistory(2, 'Shared Title', { type: '电视剧' }),
      createHistory(3, 'shared title', { type: '电影' }),
      createHistory(4, '', { type: '电影' }),
      createHistory(5, '未知', { type: '电影' }),
    ]
    mocks.apiGet.mockImplementation((path: string) => {
      if (path === 'system/setting/public/Storages') return Promise.resolve(storageResponse())
      return Promise.resolve(historyResponse(histories))
    })

    const { container } = await renderHistory('/history?grouped=true')

    const rows = await waitFor(() => {
      const items = [...container.querySelectorAll<HTMLElement>('[data-history-group-key]')]
      expect(items).toHaveLength(5)
      return items
    })
    expect(rows.map(row => row.dataset.historyGroupKey)).toEqual([
      'title:"Shared Title"',
      'title:"Shared Title"',
      'title:"shared title"',
      'title:""',
      'title:"未知"',
    ])
  })

  it('keeps music album and non-music title group namespaces separate', async () => {
    const musicKeyAsTitle = 'music:["library","/media/Artist/Album"]'
    const histories = [
      createHistory(1, 'Track', {
        dest: '/media/Artist/Album/01.flac',
        type: '音乐',
      }),
      createHistory(2, musicKeyAsTitle),
    ]
    mocks.apiGet.mockImplementation((path: string) => {
      if (path === 'system/setting/public/Storages') return Promise.resolve(storageResponse())
      return Promise.resolve(historyResponse(histories))
    })

    const { container } = await renderHistory('/history?grouped=true')

    const rows = await waitFor(() => {
      const items = [...container.querySelectorAll<HTMLElement>('[data-history-group-key]')]
      expect(items).toHaveLength(2)
      return items
    })
    expect(rows[0]?.dataset.historyGroupKey).toBe(musicKeyAsTitle)
    expect(rows[1]?.dataset.historyGroupKey).toBe(`title:${JSON.stringify(musicKeyAsTitle)}`)
  })

  it('does not auto-group non-music titles that resemble music group keys', async () => {
    const histories = [createHistory(1, 'music:archive'), createHistory(2, 'music:archive')]
    mocks.apiGet.mockImplementation((path: string) => {
      if (path === 'system/setting/public/Storages') return Promise.resolve(storageResponse())
      return Promise.resolve(historyResponse(histories))
    })

    const { router } = await renderHistory('/history')

    await waitFor(() => expect(screen.getAllByText('music:archive')).toHaveLength(2))
    expect(router.currentRoute.value.query.grouped).toBeUndefined()
  })

  it('does not auto-group music records without a shared album directory', async () => {
    const histories = [
      createHistory(1, 'Unknown Track', { dest: '', src: '01.flac', type: '音乐' }),
      createHistory(2, 'Unknown Track', { dest: '', src: '02.flac', type: '音乐' }),
    ]
    mocks.apiGet.mockImplementation((path: string) => {
      if (path === 'system/setting/public/Storages') return Promise.resolve(storageResponse())
      return Promise.resolve(historyResponse(histories))
    })

    const { router } = await renderHistory('/history')

    await waitFor(() => expect(screen.getAllByText('Unknown Track')).toHaveLength(2))
    expect(router.currentRoute.value.query.grouped).toBeUndefined()
  })

  it('does not use a planned destination when a failed source path has no directory', async () => {
    const histories = [
      createHistory(1, 'Track 1', {
        dest: '/media/Artist/Predicted Album/01.flac',
        src: '01.flac',
        status: false,
        type: '音乐',
      }),
      createHistory(2, 'Track 2', {
        dest: '/media/Artist/Predicted Album/02.flac',
        src: '02.flac',
        status: false,
        type: '音乐',
      }),
    ]
    mocks.apiGet.mockImplementation((path: string) => {
      if (path === 'system/setting/public/Storages') return Promise.resolve(storageResponse())
      return Promise.resolve(historyResponse(histories))
    })

    const { router } = await renderHistory('/history')

    await waitFor(() => expect(screen.getByText('Track 1')).toBeInTheDocument())
    expect(router.currentRoute.value.query.grouped).toBeUndefined()
  })

  it('does not count repeated history rows for one file as multiple album tracks', async () => {
    const histories = [
      createHistory(1, 'Track', {
        dest: '/media/Artist/Album/01.flac',
        type: '音乐',
      }),
      createHistory(2, 'Track retry', {
        dest: '/media/Artist/Album/01.flac',
        type: '音乐',
      }),
    ]
    mocks.apiGet.mockImplementation((path: string) => {
      if (path === 'system/setting/public/Storages') return Promise.resolve(storageResponse())
      return Promise.resolve(historyResponse(histories))
    })

    const { router } = await renderHistory('/history')

    await waitFor(() => expect(screen.getByText('Track retry')).toBeInTheDocument())
    expect(router.currentRoute.value.query.grouped).toBeUndefined()
  })

  it('respects an explicit flat-view choice for a multi-track music album', async () => {
    const tracks = [
      createHistory(1, 'Track 1', {
        dest: 'D:\\Music\\Artist\\Album\\01.flac',
        type: '音乐',
      }),
      createHistory(2, 'Track 2', {
        dest: 'D:\\Music\\Artist\\Album\\02.flac',
        type: '音乐',
      }),
    ]
    mocks.apiGet.mockImplementation((path: string) => {
      if (path === 'system/setting/public/Storages') return Promise.resolve(storageResponse())
      return Promise.resolve(historyResponse(tracks))
    })

    const { container, router } = await renderHistory('/history?grouped=false')

    await waitFor(() => expect(container.querySelectorAll('[data-history-group-key]')).toHaveLength(2))
    expect(router.currentRoute.value.query.grouped).toBe('false')
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
    expect(transferHistorySource).toContain('flex: 0 0 42px;')
    expect(transferHistorySource).toContain('inline-size: 42px;')
    expect(transferHistorySource).toContain('block-size: 63px;')
    expect(transferHistorySource).toContain('max-inline-size: 42px;')
    expect(transferHistorySource).toContain('max-block-size: 63px;')
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

    expect(await screen.findByText('同名剧集 S01E02')).toBeInTheDocument()
    expect(screen.getByText('同名剧集 S02E01')).toBeInTheDocument()
    const sortResults = JSON.parse(screen.getByRole('status', { name: '整理历史排序结果' }).textContent || '{}')
    expect(sortResults).toEqual({ size: -100, title: -1 })
  })

  it('keeps the desktop queue in the original FAB and outside the titlebar', async () => {
    mocks.appMode = false
    const first = await renderHistory()
    await fireEvent.click(await screen.findByRole('button', { name: '转移队列' }))
    expect(getDialogCall().component.__name || getDialogCall().component.name).toContain('TransferQueueDialog')
    expect(document.querySelector('.compact-fab-stack--history')).toBeInTheDocument()
    expect(document.querySelector('.transfer-history-desktop-toolbar [aria-label="转移队列"]')).not.toBeInTheDocument()
    expect(document.querySelector<HTMLElement>('.compact-fab-stack--history')?.style.insetBlockEnd).not.toBe('')
    first.unmount()
    await renderHistory('/history', false)
    expect(screen.queryByRole('button', { name: '转移队列' })).not.toBeInTheDocument()
  })

  it('keeps desktop record, page, and group selection in sync with batch actions', async () => {
    const histories = [createHistory(1, '多选一'), createHistory(2, '多选二')]
    mocks.apiGet.mockImplementation((path: string) =>
      Promise.resolve(path === 'storage/options' ? storageResponse() : historyResponse(histories)),
    )
    const { container } = await renderHistory('/history?grouped=false')
    await screen.findByText('多选一')
    await fireEvent.click(screen.getByRole('checkbox', { name: '选择 多选一' }))
    expect(screen.getByText('已选择 1/2 项')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: '全选本页' })).toHaveAttribute('aria-checked', 'mixed')
    expect(container.querySelectorAll('.transfer-history-desktop-record--selected')).toHaveLength(1)
    await fireEvent.click(screen.getByRole('checkbox', { name: '全选本页' }))
    expect(screen.getByText('已选择 2/2 项')).toBeInTheDocument()
    await fireEvent.click(screen.getByRole('button', { name: '批量删除' }))
    expect(getDialogCall().props).toMatchObject({ title: '确认删除 2 条记录 ?' })
    await fireEvent.click(screen.getByRole('button', { name: '取消全选' }))
    expect(screen.getByText('共 2 条记录 · 1 页')).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: '批量选择' })).not.toBeInTheDocument()
  })

  it('uses real virtual-table grouping to select collapsed records and retain them after expansion', async () => {
    const histories = [
      createHistory(1, '测试分组', { type: '电视剧', seasons: 'S01', episodes: 'E01' }),
      createHistory(2, '测试分组', { type: '电视剧', seasons: 'S01', episodes: 'E02' }),
    ]
    mocks.apiGet.mockImplementation((path: string) =>
      Promise.resolve(path === 'storage/options' ? storageResponse() : historyResponse(histories)),
    )
    const { container } = await renderHistory('/history?grouped=true', true, true)
    await screen.findByText('本页 2 条')
    expect(container.querySelectorAll('.transfer-history-desktop-record')).toHaveLength(0)
    await fireEvent.click(screen.getByRole('checkbox', { name: '选择 测试分组' }))
    expect(screen.getByText('已选择 2/2 项')).toBeInTheDocument()
    await fireEvent.click(screen.getByRole('button', { name: '展开' }))
    await waitFor(() =>
      expect(container.querySelectorAll('.transfer-history-desktop-record--selected')).toHaveLength(2),
    )
    await fireEvent.click(screen.getByRole('checkbox', { name: '选择 测试分组 S01E01' }))
    expect(screen.getByRole('checkbox', { name: '选择 测试分组' })).toHaveAttribute('aria-checked', 'mixed')
    await fireEvent.click(screen.getByRole('button', { name: '收起' }))
    expect(screen.getByText('已选择 1/2 项')).toBeInTheDocument()
  })

  it.each(['电视剧', '音乐'])('toggles the entire %s group row without toggling on selection', async type => {
    const histories = [1, 2].map(id =>
      createHistory(id, '测试分组', {
        type,
        seasons: type === '电视剧' ? 'S01' : undefined,
        episodes: type === '电视剧' ? `E0${id}` : undefined,
        dest: `/media/Artist/测试分组/${id}.flac`,
      }),
    )
    mocks.apiGet.mockImplementation((path: string) =>
      Promise.resolve(path === 'storage/options' ? storageResponse() : historyResponse(histories)),
    )
    const { container } = await renderHistory('/history?grouped=true', true, true)
    const row = await waitFor(() => {
      const cell = container.querySelector('.transfer-history-desktop-group-row > td')
      expect(cell).not.toBeNull()
      return cell!
    })
    // 读取真实虚拟列表，确认整行切换和控制区点击不会相互干扰。
    const getCards = () => container.querySelectorAll('.transfer-history-desktop-record')
    expect(getCards()).toHaveLength(0)
    await fireEvent.click(row.querySelector('strong')!)
    await waitFor(() => expect(getCards()).toHaveLength(2))
    await fireEvent.click(row)
    await waitFor(() => expect(getCards()).toHaveLength(0))
    await fireEvent.click(row.querySelector('input[type="checkbox"]')!)
    expect(screen.getByText('已选择 2/2 项')).toBeInTheDocument()
    expect(getCards()).toHaveLength(0)
    await fireEvent.click(screen.getByRole('button', { name: '展开' }))
    await waitFor(() => expect(getCards()).toHaveLength(2))
    await fireEvent.click(row.querySelector('input[type="checkbox"]')!)
    expect(getCards()).toHaveLength(2)
    await fireEvent.click(screen.getByRole('button', { name: '收起' }))
    await waitFor(() => expect(getCards()).toHaveLength(0))
  })

  it('sorts real virtual cards by source size and direction without fetching another page', async () => {
    const histories = [
      createHistory(1, '大文件', { src_fileitem: { size: 200 } as TransferHistory['src_fileitem'] }),
      createHistory(2, '小文件', { src_fileitem: { size: 100 } as TransferHistory['src_fileitem'] }),
    ]
    mocks.apiGet.mockImplementation((path: string) =>
      Promise.resolve(path === 'storage/options' ? storageResponse() : historyResponse(histories)),
    )
    const { container } = await renderHistory('/history?grouped=false', true, true)
    await screen.findByText('大文件')
    // 从可见业务身份读取顺序，验证真实虚拟列表排序。
    const getOrder = () =>
      [...container.querySelectorAll<HTMLElement>('.transfer-history-desktop-record-row')].map(
        row => row.dataset.historyId,
      )
    const requests = mocks.apiGet.mock.calls.length
    await fireEvent.click(screen.getByRole('button', { name: '大小' }))
    await waitFor(() => expect(getOrder()).toEqual(['2', '1']))
    await fireEvent.click(screen.getByRole('button', { name: '降序' }))
    await waitFor(() => expect(getOrder()).toEqual(['1', '2']))
    expect(mocks.apiGet.mock.calls).toHaveLength(requests)
  })

  it('shows desktop relative time with the full timestamp available on hover', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-09T10:05:24'))
    try {
      mocks.apiGet.mockImplementation((path: string) =>
        Promise.resolve(
          path === 'storage/options'
            ? storageResponse()
            : historyResponse([createHistory(1, '时间记录', { date: '2026-10-09 10:00:24' })]),
        ),
      )
      const { container, unmount } = await renderHistory('/history?grouped=false')
      await screen.findByText('时间记录')
      expect(container.querySelector('time')).toHaveTextContent('5分钟前')
      expect(container.querySelector('time')).toHaveAttribute('title', '2026-10-09 10:00:24')
      unmount()
    } finally {
      vi.useRealTimers()
    }
  })

  it('renders full paths with a transfer arrow and keeps status clicks independent from desktop selection', async () => {
    const item = createHistory(1, '失败记录', {
      src: '/downloads/很长的目录/文件.mkv',
      dest: '/library/文件.mkv',
      src_storage: 'smb',
      dest_storage: 'local',
      status: false,
      errmsg: '目标不可写',
    })
    mocks.apiGet.mockImplementation((path: string) =>
      Promise.resolve(path === 'storage/options' ? storageResponse() : historyResponse([item])),
    )
    const { container } = await renderHistory('/history?grouped=false')
    await screen.findByText('失败记录')
    expect(container.querySelector('[title="/downloads/很长的目录/文件.mkv"]')).toBeInTheDocument()
    expect(
      [...container.querySelectorAll('.transfer-history-desktop-record__path-text')].map(path => path.textContent),
    ).toEqual([item.src, item.dest])
    expect(container.querySelector('.transfer-history-desktop-record__path-arrow')).toBeInTheDocument()
    expect(screen.getByText('SMB')).toBeInTheDocument()
    expect(screen.getByText('本地')).toBeInTheDocument()
    await fireEvent.click(screen.getAllByRole('button', { name: '失败' }).at(-1)!)
    expect(getDialogCall().component.__name || getDialogCall().component.name).toContain('TransferRecoveryDialog')
    expect(screen.getByText('共 1 条记录 · 1 页')).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: '批量选择' })).not.toBeInTheDocument()
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
    expect(router.currentRoute.value.query.grouped).toBeUndefined()
  })

  it('does not restore the history route after navigation changes the global query', async () => {
    const tracks = [
      createHistory(1, 'Hotel California', {
        dest: '/media/Eagles/Hotel California (1976)/01 - Hotel California.dsf',
        src: '/downloads/Eagles - Hotel California/01 - Hotel California.dsf',
        type: '音乐',
      }),
    ]
    mocks.apiGet.mockImplementation((path: string) => {
      if (path === 'storage/options') return Promise.resolve(storageResponse())
      return Promise.resolve(historyResponse(tracks))
    })

    const { router } = await renderHistory('/history?itemsPerPage=50&currentPage=1&grouped=true')
    await flushPromises()
    await router.push('/downloading')
    await flushPromises()

    expect(router.currentRoute.value.path).toBe('/downloading')
  })

  it('invalidates a history request as soon as route navigation starts', async () => {
    const historyRequest = createDeferred<ReturnType<typeof historyResponse>>()
    const navigationEntered = createDeferred<void>()
    const finishNavigation = createDeferred<void>()
    mocks.apiGet.mockImplementation((path: string) => {
      if (path === 'storage/options') return Promise.resolve(storageResponse())
      return historyRequest.promise
    })

    const { router } = await renderHistoryRoute('/history', async () => {
      navigationEntered.resolve()
      await finishNavigation.promise
    })
    const navigation = router.push('/downloading')
    await navigationEntered.promise

    historyRequest.resolve(
      historyResponse([
        createHistory(1, 'Hotel California', {
          dest: '/media/Eagles/Hotel California (1976)/01 - Hotel California.dsf',
          type: '音乐',
        }),
        createHistory(2, 'New Kid in Town', {
          dest: '/media/Eagles/Hotel California (1976)/02 - New Kid in Town.dsf',
          type: '音乐',
        }),
      ]),
    )
    await flushPromises()
    finishNavigation.resolve()
    await navigation
    await flushPromises()

    expect(router.currentRoute.value.path).toBe('/downloading')
  })

  it('shows the shared 404 empty state after an empty desktop response and hides zero-count pagination', async () => {
    const pending = createDeferred<ReturnType<typeof historyResponse>>()
    mocks.apiGet.mockImplementation((path: string) =>
      path === 'history/transfer' ? pending.promise : Promise.resolve(storageResponse()),
    )
    await renderHistory()
    expect(screen.queryByRole('img', { name: '404' })).not.toBeInTheDocument()
    pending.resolve(historyResponse([]))
    await screen.findByRole('img', { name: '404' })
    expect(screen.getByText(i18n.global.t('transferHistory.noData'))).toBeInTheDocument()
    expect(screen.queryByLabelText('整理历史桌面列表')).not.toBeInTheDocument()
    expect(document.querySelector('.transfer-history-desktop-pagination')).toBeNull()
  })

  it('does not show the 404 empty state when the initial desktop request fails', async () => {
    mocks.apiGet.mockImplementation((path: string) =>
      path === 'history/transfer' ? Promise.reject(new Error('unavailable')) : Promise.resolve(storageResponse()),
    )
    await renderHistory()
    await flushPromises()
    expect(screen.queryByRole('img', { name: '404' })).not.toBeInTheDocument()
  })

  it('shows the mobile empty state inside the list only after a successful empty response', async () => {
    mocks.desktop = false
    await renderHistory()

    expect(screen.queryByText(i18n.global.t('transferHistory.noData'))).not.toBeInTheDocument()
    await fireEvent.click(screen.getByRole('button', { name: '加载下一页' }))

    const emptyState = await screen.findByText(i18n.global.t('transferHistory.noData'))
    expect(screen.getByLabelText('整理历史无限列表')).toContainElement(emptyState)
    expect(screen.getByRole('img', { name: '404' })).toBeInTheDocument()
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
    expect(screen.queryByText(i18n.global.t('transferHistory.noData'))).not.toBeInTheDocument()
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
    expect(screen.queryByText(i18n.global.t('transferHistory.noData'))).not.toBeInTheDocument()
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
    expect(transferHistorySource).toContain('getHistoryStorageName(path.storage)')
    expect(transferHistorySource.match(/getHistoryStorageName\(item\?\.src_storage\)/g)).toHaveLength(1)
    expect(transferHistorySource.match(/getHistoryStorageName\(item\?\.dest_storage\)/g)).toHaveLength(1)
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

  it('shows subtitle and attached audio as distinct history categories', async () => {
    mocks.desktop = false
    const histories = [
      createHistory(1, '字幕文件', {
        category: '电影',
        image: '/subtitle-poster.jpg',
        src: '/downloads/电影.zh.srt',
        src_fileitem: { extension: 'srt', size: 100 } as TransferHistory['src_fileitem'],
      }),
      createHistory(2, '音频文件', {
        category: '电影',
        image: '/audio-poster.jpg',
        src: '/downloads/电影.commentary.mka',
        src_fileitem: { extension: 'mka', size: 200 } as TransferHistory['src_fileitem'],
      }),
      createHistory(3, '正常媒体', {
        category: '动作',
        image: '/movie-poster.jpg',
        src: '/downloads/电影.mkv',
        src_fileitem: { extension: 'mkv', size: 300 } as TransferHistory['src_fileitem'],
      }),
    ]
    mocks.apiGet.mockImplementation((path: string) => {
      if (path === 'storage/options') return Promise.resolve(storageResponse())
      return Promise.resolve(historyResponse(histories))
    })

    await renderHistory()
    await fireEvent.click(screen.getByRole('button', { name: '加载下一页' }))

    expect(await screen.findByText('字幕')).toBeInTheDocument()
    expect(screen.getByText('音频')).toBeInTheDocument()
    expect(screen.getByText('动作')).toBeInTheDocument()
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

  it.each(['/history?search=old&grouped=false', '/history?search=old'])(
    'preserves the desktop grouping preference while persisting mobile search from %s',
    async initialRoute => {
      vi.useFakeTimers()
      mocks.desktop = false
      localStorage.setItem('transferHistory.grouped', 'false')
      const { router } = await renderHistory(initialRoute)
      await flushPromises()

      await fireEvent.update(screen.getByLabelText('搜索（支持 * ? 通配符）'), 'new')
      await vi.advanceTimersByTimeAsync(600)

      expect(router.currentRoute.value).toMatchObject({
        path: '/history',
        query: { currentPage: '1', grouped: 'false', itemsPerPage: '50', search: 'new' },
      })
      expect(localStorage.getItem('transferHistory.grouped')).toBe('false')
    },
  )

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

  it.each([
    [true, false],
    [true, true],
    [false, false],
    [false, true],
  ])('serializes music deletion by ID on desktop=%s batch=%s', async (desktop, batch) => {
    // 通过真实页面生成专辑摘要，并模拟 HTTP 客户端序列化，防止循环引用被 API mock 掩盖。
    mocks.desktop = desktop
    const item = createHistory(7, '音乐删除回归', {
      dest: '/media/歌手/专辑/01.flac',
      image: '/cover.jpg',
      type: '音乐',
    })
    const payloads: string[] = []
    mocks.apiGet.mockImplementation((path: string) => {
      if (path === 'storage/options') return Promise.resolve(storageResponse())
      return Promise.resolve(historyResponse([item]))
    })
    mocks.apiDelete.mockImplementation((_path: string, config: { data: unknown }) => {
      payloads.push(JSON.stringify(config.data))
      return Promise.resolve(deleteResultResponse())
    })

    const { container } = await renderHistory()
    if (!desktop) await fireEvent.click(screen.getByRole('button', { name: '加载下一页' }))
    expect(await screen.findByText('音乐删除回归')).toBeInTheDocument()
    if (batch) {
      if (desktop) {
        await fireEvent.click(screen.getByRole('button', { name: '选择当前页' }))
      } else {
        await fireEvent.click(screen.getByRole('button', { name: '批量选择' }))
        await fireEvent.click(container.querySelector('.transfer-history-mobile-record') as HTMLElement)
      }
      await nextTick()
      runDynamicAction('transferHistory.actions.batchDelete')
    } else {
      await fireEvent.click(screen.getByRole('button', { name: '删除' }))
    }
    await getDialogCall().events.delete(false, false)

    expect(payloads).toEqual(['{"id":7}'])
    expect(mocks.toastError).not.toHaveBeenCalled()
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

  it('shows the durable retry rejection reason instead of a generic AI error', async () => {
    const item = createHistory(8, '租约阻塞记录')
    mocks.apiGet.mockImplementation((path: string) => {
      if (path === 'storage/options') return Promise.resolve(storageResponse())
      return Promise.resolve(historyResponse([item]))
    })
    mocks.apiPost.mockResolvedValueOnce({
      data: null,
      message: '这条整理任务正在被其他进程处理，请等待结束后再试',
      success: false,
    })

    await renderHistory()
    await fireEvent.click(await screen.findByRole('button', { name: '智能助手整理' }))
    await flushPromises()

    expect(mocks.toastError).toHaveBeenCalledWith('这条整理任务正在被其他进程处理，请等待结束后再试')
    expect(mocks.progressStart).not.toHaveBeenCalled()
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
