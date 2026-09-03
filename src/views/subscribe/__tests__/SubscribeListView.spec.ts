import type { Subscribe, SubscriptionBatchStatus } from '@/api/types'
import SubscribeListView from '@/views/subscribe/SubscribeListView.vue'
import { fireEvent, screen, waitFor } from '@testing-library/vue'
import { createSubscribe } from '@tests/support/factories/subscribe'
import {
  deleteSubscribeByIdHandler,
  cancelSubscriptionExecutionBatchHandler,
  saveSubscribeOrderConfigHandler,
  subscribeApiUrls,
  subscribeListHandler,
  subscriptionExecutionBatchesHandler,
  subscribeOrderConfigHandler,
  updateSubscribeStatusHandler,
  type SubscribeMediaType,
} from '@tests/support/msw/handlers/subscribe'
import { server } from '@tests/support/msw/server'
import { renderWithProviders } from '@tests/support/render'
import { flushPromises } from '@vue/test-utils'
import { defineComponent, h, nextTick, ref, watch, type PropType } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  confirm: vi.fn(),
  openSharedDialog: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  toastWarning: vi.fn(),
}))

vi.mock('vue-toastification', () => ({
  useToast: () => ({
    error: mocks.toastError,
    success: mocks.toastSuccess,
    warning: mocks.toastWarning,
  }),
}))

vi.mock('@/composables/useConfirm', () => ({
  useConfirm: () => mocks.confirm,
}))

vi.mock('@/composables/useSharedDialog', () => ({
  openSharedDialog: (...args: unknown[]) => mocks.openSharedDialog(...args),
}))

const SubscribeCardStub = defineComponent({
  name: 'SubscribeCard',
  props: {
    batchMode: Boolean,
    media: { type: Object as PropType<Subscribe>, required: true },
    selected: Boolean,
    sortable: Boolean,
  },
  emits: ['remove', 'save', 'select'],
  setup(props, { emit }) {
    return () =>
      h(
        'article',
        {
          'data-batch': String(props.batchMode),
          'data-page-open': String(Boolean(props.media.page_open)),
          'data-selected': String(props.selected),
          'data-sortable': String(props.sortable),
          'data-testid': `subscribe-card-${props.media.id}`,
        },
        [
          h('span', props.media.name),
          h(
            'button',
            { 'aria-label': `select-${props.media.id}`, onClick: () => emit('select'), type: 'button' },
            'select',
          ),
          h('button', { 'aria-label': `save-${props.media.id}`, onClick: () => emit('save'), type: 'button' }, 'save'),
          h(
            'button',
            { 'aria-label': `remove-${props.media.id}`, onClick: () => emit('remove'), type: 'button' },
            'remove',
          ),
        ],
      )
  },
})

const ProgressiveCardGridStub = defineComponent({
  name: 'ProgressiveCardGrid',
  props: {
    items: { type: Array as PropType<Subscribe[]>, required: true },
    scrollToIndex: Number,
  },
  setup(props, { slots }) {
    return () =>
      h(
        'section',
        {
          'data-scroll-to-index': props.scrollToIndex ?? '',
          'data-testid': 'progressive-grid',
        },
        props.items.flatMap(item => slots.default?.({ item }) ?? []),
      )
  },
})

const DraggableStub = defineComponent({
  name: 'Draggable',
  props: {
    modelValue: { type: Array as PropType<Subscribe[]>, required: true },
  },
  emits: ['end', 'update:modelValue'],
  setup(props, { emit, slots }) {
    async function reverseOrder() {
      emit('update:modelValue', [...props.modelValue].reverse())
      await nextTick()
      emit('end')
    }

    return () =>
      h('section', { 'data-testid': 'draggable-list' }, [
        ...props.modelValue.flatMap(element => slots.item?.({ element }) ?? []),
        h('button', { onClick: reverseOrder, type: 'button' }, 'reverse-order'),
      ])
  },
})

const LoadingBannerStub = defineComponent({
  name: 'LoadingBanner',
  template: '<div role="status" data-testid="loading-banner">loading</div>',
})

const NoDataFoundStub = defineComponent({
  name: 'NoDataFound',
  props: {
    errorDescription: String,
    errorTitle: String,
  },
  template: '<section data-testid="no-data">{{ errorTitle }} {{ errorDescription }}</section>',
})

interface BatchState {
  allSelected: boolean
  enabled: boolean
  selectedCount: number
  totalCount: number
}

interface ListActions {
  batchDeleteSubscribes: () => Promise<void>
  batchEnableSubscribes: () => Promise<void>
  batchPauseSubscribes: () => Promise<void>
  enterBatchMode: () => void
  exitBatchMode: () => void
  openHistoryDialog: () => void
  toggleBatchMode: () => void
  toggleSelectAll: () => void
}

const SubscribeListHost = defineComponent({
  name: 'SubscribeListHost',
  components: { SubscribeListView },
  props: {
    active: { type: Boolean, default: true },
    keyword: { type: String, default: '' },
    sortBy: { type: String, default: '' },
    sortMode: { type: Boolean, default: false },
    statusFilter: { type: String, default: 'all' },
    subid: { type: String, default: '' },
    type: { type: String as PropType<SubscribeMediaType>, default: '电影' },
  },
  setup(props) {
    const list = ref<ListActions | null>(null)
    const currentSortBy = ref(props.sortBy)
    const currentSortMode = ref(props.sortMode)
    const batchState = ref<BatchState>({ allSelected: false, enabled: false, selectedCount: 0, totalCount: 0 })

    watch(
      () => props.sortBy,
      value => {
        currentSortBy.value = value
      },
    )
    watch(
      () => props.sortMode,
      value => {
        currentSortMode.value = value
      },
    )

    function call(action: keyof ListActions) {
      return list.value?.[action]()
    }

    return { batchState, call, currentSortBy, currentSortMode, list }
  },
  template: `
    <SubscribeListView
      ref="list"
      :active="active"
      :keyword="keyword"
      :sort-by="currentSortBy"
      :sort-mode="currentSortMode"
      :status-filter="statusFilter"
      :subid="subid"
      :type="type"
      @batch-state-change="batchState = $event"
      @update:sort-by="currentSortBy = $event"
      @update:sort-mode="currentSortMode = $event"
    />
    <button type="button" @click="call('enterBatchMode')">host-enter-batch</button>
    <button type="button" @click="call('exitBatchMode')">host-exit-batch</button>
    <button type="button" @click="call('toggleBatchMode')">host-toggle-batch</button>
    <button type="button" @click="call('toggleSelectAll')">host-toggle-select-all</button>
    <button type="button" @click="call('batchEnableSubscribes')">host-batch-enable</button>
    <button type="button" @click="call('batchPauseSubscribes')">host-batch-pause</button>
    <button type="button" @click="call('batchDeleteSubscribes')">host-batch-delete</button>
    <button type="button" @click="call('openHistoryDialog')">host-open-history</button>
    <output data-testid="batch-state">{{ JSON.stringify(batchState) }}</output>
    <output data-testid="sort-by-state">{{ currentSortBy }}</output>
    <output data-testid="sort-mode-state">{{ String(currentSortMode) }}</output>
  `,
})

interface RenderListOptions {
  active?: boolean
  batchResponse?:
    SubscriptionBatchStatus[] | ((url: URL) => SubscriptionBatchStatus[] | Promise<SubscriptionBatchStatus[]>)
  batchStatus?: number
  onBatchRequest?: (url: URL) => void
  keyword?: string
  listResponse?: Subscribe[] | ((url: URL) => Subscribe[] | Promise<Subscribe[]>)
  listStatus?: number
  onListRequest?: (url: URL) => void
  onOrderRequest?: (url: URL) => void
  orderStatus?: number
  orderValue?: Parameters<typeof subscribeOrderConfigHandler>[1]
  sortBy?: string
  sortMode?: boolean
  statusFilter?: string
  subid?: string
  superUser?: boolean
  type?: SubscribeMediaType
  userName?: string
}

async function renderList(options: RenderListOptions = {}) {
  const type = options.type ?? '电影'
  server.use(
    subscribeOrderConfigHandler(type, options.orderValue, options.orderStatus ?? 200, options.onOrderRequest),
    subscribeListHandler(options.listResponse ?? [], options.listStatus ?? 200, options.onListRequest),
    subscriptionExecutionBatchesHandler(
      options.batchResponse ?? [],
      options.batchStatus ?? 200,
      options.onBatchRequest,
    ),
  )

  return renderWithProviders(SubscribeListHost, {
    props: {
      active: options.active ?? true,
      keyword: options.keyword ?? '',
      sortBy: options.sortBy ?? '',
      sortMode: options.sortMode ?? false,
      statusFilter: options.statusFilter ?? 'all',
      subid: options.subid ?? '',
      type,
    },
    initialState: {
      user: {
        superUser: options.superUser ?? false,
        userName: options.userName ?? 'tester',
      },
    },
    global: {
      stubs: {
        Draggable: DraggableStub,
        LoadingBanner: LoadingBannerStub,
        NoDataFound: NoDataFoundStub,
        ProgressiveCardGrid: ProgressiveCardGridStub,
        SubscribeCard: SubscribeCardStub,
        draggable: DraggableStub,
      },
    },
  })
}

function movie(id: number, name: string, overrides: Partial<Subscribe> = {}) {
  return createSubscribe({ id, name, type: '电影', username: 'tester', ...overrides })
}

function tv(id: number, name: string, overrides: Partial<Subscribe> = {}) {
  return createSubscribe({ id, name, type: '电视剧', username: 'tester', ...overrides })
}

function executionBatch(overrides: Partial<SubscriptionBatchStatus> = {}): SubscriptionBatchStatus {
  return {
    batch_id: 'batch-1',
    can_cancel: false,
    cancelled_count: 0,
    created_at: '2026-09-01T00:00:00+00:00',
    failed_count: 0,
    finished_count: 0,
    phase: 'searching',
    processed_count: 0,
    skipped_count: 0,
    source: 'manual',
    state: 'running',
    total_count: 3,
    updated_at: '2026-09-01T00:01:00+00:00',
    ...overrides,
  }
}

function sequenceResponse<T>(responses: T[]) {
  let index = 0
  return () => responses[Math.min(index++, responses.length - 1)]
}

function mockDocumentHidden(initialValue = false) {
  let hidden = initialValue
  vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden)
  return {
    set(value: boolean) {
      hidden = value
    },
  }
}

async function flushAsync() {
  await flushPromises()
  await nextTick()
  await flushPromises()
}

function card(id: number) {
  return screen.getByTestId(`subscribe-card-${id}`)
}

function displayedNames() {
  return screen.queryAllByTestId(/^subscribe-card-/).map(element => element.querySelector('span')?.textContent)
}

function batchState(): BatchState {
  return JSON.parse(screen.getByTestId('batch-state').textContent || '{}') as BatchState
}

beforeEach(() => {
  Object.values(mocks).forEach(mock => mock.mockReset())
  mocks.confirm.mockResolvedValue(true)
  mocks.openSharedDialog.mockReturnValue({ close: vi.fn(), id: 1, updateProps: vi.fn() })
})

describe('SubscribeListView loading and filtering', () => {
  it('loads exact endpoints and restricts a normal user by owner and media type', async () => {
    const listRequested = vi.fn()
    const orderRequested = vi.fn()
    await renderList({
      listResponse: [movie(1, 'Own movie'), movie(2, 'Other movie', { username: 'other' }), tv(3, 'Own TV')],
      onListRequest: listRequested,
      onOrderRequest: orderRequested,
    })

    expect(await screen.findByText('Own movie')).toBeInTheDocument()
    expect(screen.queryByText('Other movie')).not.toBeInTheDocument()
    expect(screen.queryByText('Own TV')).not.toBeInTheDocument()
    expect(orderRequested.mock.calls[0][0].href).toBe(subscribeApiUrls.orderConfig('电影'))
    expect(listRequested.mock.calls[0][0].href).toBe(subscribeApiUrls.list)
    expect(screen.getByTestId('sort-by-state')).toHaveTextContent('date')
  })

  it('shows batch progress and sends cancellation to the stable batch endpoint', async () => {
    const cancelRequested = vi.fn()
    const batch: SubscriptionBatchStatus = {
      batch_id: 'batch-42',
      can_cancel: true,
      cancelled_count: 0,
      created_at: '2026-09-01T00:00:00+00:00',
      failed_count: 0,
      finished_count: 1,
      phase: 'searching',
      processed_count: 1,
      skipped_count: 0,
      source: 'manual',
      state: 'running',
      total_count: 3,
      updated_at: '2026-09-01T00:01:00+00:00',
    }
    server.use(cancelSubscriptionExecutionBatchHandler(batch.batch_id, { success: true }, 200, cancelRequested))
    await renderList({ batchResponse: [batch], listResponse: [movie(1, 'Own movie')] })

    expect(await screen.findByText('搜索站点')).toBeInTheDocument()
    expect(screen.getByText('1/3')).toBeInTheDocument()
    await fireEvent.click(screen.getByTitle('取消本批次'))

    await waitFor(() => expect(cancelRequested).toHaveBeenCalledOnce())
    expect(mocks.toastSuccess).toHaveBeenCalledWith('已请求取消搜索批次')
  })

  it('keeps a successful subscription list visible when the batch endpoint fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const listRequested = vi.fn()
    const batchRequested = vi.fn()
    await renderList({
      batchStatus: 500,
      listResponse: [movie(1, '列表仍可见')],
      onBatchRequest: batchRequested,
      onListRequest: listRequested,
    })

    expect(await screen.findByText('列表仍可见')).toBeInTheDocument()
    await waitFor(() => expect(batchRequested).toHaveBeenCalledOnce())
    await flushAsync()
    expect(listRequested).toHaveBeenCalledOnce()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByTestId('no-data')).not.toBeInTheDocument()
    expect(mocks.toastError).not.toHaveBeenCalled()
  })

  it('synchronizes subscriptions after the batch endpoint recovers', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.useFakeTimers()
    const listRequested = vi.fn()
    const batchRequested = vi.fn()
    await renderList({
      batchStatus: 500,
      listResponse: sequenceResponse([[movie(1, '批次接口恢复前')], [movie(1, '批次接口恢复后')]]),
      onBatchRequest: batchRequested,
      onListRequest: listRequested,
    })
    await flushAsync()

    expect(batchRequested).toHaveBeenCalledOnce()
    expect(listRequested).toHaveBeenCalledOnce()

    server.use(
      subscriptionExecutionBatchesHandler(
        [executionBatch({ phase: 'completed', state: 'skipped' })],
        200,
        batchRequested,
      ),
    )
    await vi.advanceTimersByTimeAsync(2500)
    await flushAsync()

    expect(batchRequested).toHaveBeenCalledTimes(2)
    expect(listRequested).toHaveBeenCalledTimes(2)
    expect(await screen.findByText('批次接口恢复后')).toBeInTheDocument()
  })

  it('shows only one notification while silent list recovery keeps failing', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.useFakeTimers()
    await renderList({ listStatus: 500 })
    await flushAsync()

    expect(mocks.toastError).toHaveBeenCalledOnce()

    await vi.advanceTimersByTimeAsync(30_000)
    await flushAsync()

    expect(mocks.toastError).toHaveBeenCalledOnce()
  })

  it('keeps polling lightweight batches after an idle initial response', async () => {
    vi.useFakeTimers()
    const listRequested = vi.fn()
    const batchRequested = vi.fn()
    await renderList({
      batchResponse: sequenceResponse([[], [executionBatch()]]),
      listResponse: [movie(1, '空闲后发现新批次')],
      onBatchRequest: batchRequested,
      onListRequest: listRequested,
    })
    await flushAsync()

    expect(batchRequested).toHaveBeenCalledOnce()
    expect(listRequested).toHaveBeenCalledOnce()

    await vi.advanceTimersByTimeAsync(2500)
    await flushAsync()

    expect(batchRequested).toHaveBeenCalledTimes(2)
    expect(listRequested).toHaveBeenCalledTimes(2)
  })

  it('retries a failed subscription list while an active batch remains unchanged', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const hidden = mockDocumentHidden(true)
    const initialListRequested = vi.fn()
    const recoveredListRequested = vi.fn()
    const stableBatch = executionBatch()
    await renderList({
      batchResponse: [stableBatch],
      listStatus: 500,
      onListRequest: initialListRequested,
    })

    await waitFor(() => expect(initialListRequested).toHaveBeenCalledOnce())
    expect(await screen.findByText('请求失败，请稍后重试')).toBeInTheDocument()

    server.use(subscribeListHandler([movie(1, '列表已恢复')], 200, recoveredListRequested))
    vi.useFakeTimers()
    await vi.advanceTimersByTimeAsync(15_000)
    hidden.set(false)
    document.dispatchEvent(new Event('visibilitychange'))
    await flushAsync()

    expect(recoveredListRequested).toHaveBeenCalledOnce()
    expect(await screen.findByText('列表已恢复')).toBeInTheDocument()
    expect(screen.queryByText('请求失败，请稍后重试')).not.toBeInTheDocument()
  })

  it('keeps a failed subscription list on a recovery poll without an active execution', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.useFakeTimers()
    const listRequested = vi.fn()
    const recoveredListRequested = vi.fn()
    await renderList({ listStatus: 500, onListRequest: listRequested })
    await flushAsync()

    expect(listRequested).toHaveBeenCalledOnce()
    expect(screen.getByText('请求失败，请稍后重试')).toBeInTheDocument()

    server.use(subscribeListHandler([movie(1, '无活动任务时已恢复')], 200, recoveredListRequested))
    await vi.advanceTimersByTimeAsync(15_000)
    await flushAsync()

    expect(recoveredListRequested).toHaveBeenCalledOnce()
    expect(await screen.findByText('无活动任务时已恢复')).toBeInTheDocument()
    expect(screen.queryByText('请求失败，请稍后重试')).not.toBeInTheDocument()
  })

  it('polls an unchanged active batch without reloading a large subscription list', async () => {
    const hidden = mockDocumentHidden(true)
    const listRequested = vi.fn()
    const batchRequested = vi.fn()
    const activeExecution = {
      batch_id: 'batch-1',
      can_cancel: true,
      phase: 'queued',
      source: 'scheduler',
      state: 'queued',
      task_id: 'task-1',
      updated_at: '2026-09-01T00:01:00+00:00',
    }
    const subscriptions = Array.from({ length: 120 }, (_, index) =>
      movie(index + 1, `批量订阅 ${index + 1}`, { execution_status: activeExecution }),
    )
    const stableBatch = executionBatch({ source: 'scheduler', total_count: subscriptions.length })
    await renderList({
      batchResponse: sequenceResponse([[stableBatch], [stableBatch], [stableBatch]]),
      listResponse: subscriptions,
      onBatchRequest: batchRequested,
      onListRequest: listRequested,
    })

    expect(await screen.findByText('批量订阅 1')).toBeInTheDocument()
    expect(listRequested).toHaveBeenCalledOnce()
    expect(batchRequested).toHaveBeenCalledOnce()
    await flushAsync()

    vi.useFakeTimers()
    hidden.set(false)
    document.dispatchEvent(new Event('visibilitychange'))
    await flushAsync()
    expect(batchRequested).toHaveBeenCalledTimes(2)
    expect(listRequested).toHaveBeenCalledOnce()

    for (let index = 0; index < 4; index += 1) {
      await vi.advanceTimersByTimeAsync(2500)
      await flushAsync()
    }
    expect(batchRequested).toHaveBeenCalledTimes(6)
    expect(listRequested).toHaveBeenCalledOnce()
  })

  it('reloads subscriptions when batch progress changes during polling', async () => {
    const hidden = mockDocumentHidden(true)
    const listRequested = vi.fn()
    const batchRequested = vi.fn()
    const initial = movie(1, '初始订阅')
    const refreshed = movie(1, '进度变化后的订阅')
    await renderList({
      batchResponse: sequenceResponse([
        [executionBatch({ processed_count: 0 })],
        [executionBatch({ processed_count: 1, updated_at: '2026-09-01T00:02:00+00:00' })],
      ]),
      listResponse: sequenceResponse([[initial], [refreshed]]),
      onBatchRequest: batchRequested,
      onListRequest: listRequested,
    })

    expect(await screen.findByText('初始订阅')).toBeInTheDocument()
    expect(listRequested).toHaveBeenCalledOnce()
    await waitFor(() => expect(batchRequested).toHaveBeenCalledOnce())
    await flushAsync()

    vi.useFakeTimers()
    await vi.advanceTimersByTimeAsync(15_000)
    hidden.set(false)
    document.dispatchEvent(new Event('visibilitychange'))
    await flushAsync()

    expect(batchRequested).toHaveBeenCalledTimes(2)
    expect(listRequested).toHaveBeenCalledTimes(2)
    expect(await screen.findByText('进度变化后的订阅')).toBeInTheDocument()
  })

  it('keeps lightweight batch polling active while a subscription refresh is pending', async () => {
    vi.useFakeTimers()
    const batchRequested = vi.fn()
    const listRequested = vi.fn()
    let resolveList!: (subscribes: Subscribe[]) => void
    let listCallCount = 0
    const pendingList = new Promise<Subscribe[]>(resolve => {
      resolveList = resolve
    })
    await renderList({
      batchResponse: sequenceResponse([
        [],
        [executionBatch()],
        [executionBatch({ processed_count: 1, updated_at: '2026-09-01T00:02:00+00:00' })],
      ]),
      listResponse: () => {
        listCallCount += 1
        return listCallCount === 1 ? [movie(1, '慢列表刷新订阅')] : pendingList
      },
      onBatchRequest: batchRequested,
      onListRequest: listRequested,
    })
    await flushAsync()

    await vi.advanceTimersByTimeAsync(2500)
    await flushAsync()
    expect(batchRequested).toHaveBeenCalledTimes(2)
    expect(listRequested).toHaveBeenCalledTimes(2)

    await vi.advanceTimersByTimeAsync(2500)
    await flushAsync()
    expect(batchRequested).toHaveBeenCalledTimes(3)
    expect(listRequested).toHaveBeenCalledTimes(2)

    resolveList([movie(1, '慢列表刷新完成')])
    await flushAsync()
    expect(await screen.findByText('慢列表刷新完成')).toBeInTheDocument()
  })

  it('runs one trailing list refresh when a card action overlaps a poll refresh', async () => {
    vi.useFakeTimers()
    const listRequested = vi.fn()
    const batchRequested = vi.fn()
    let resolvePollingList!: (subscribes: Subscribe[]) => void
    let listCallCount = 0
    const pollingList = new Promise<Subscribe[]>(resolve => {
      resolvePollingList = resolve
    })
    const initial = movie(1, '交错刷新前')
    const refreshed = movie(1, '交错刷新后')

    await renderList({
      batchResponse: sequenceResponse([[], [executionBatch({ processed_count: 1 })]]),
      listResponse: () => {
        listCallCount += 1
        if (listCallCount === 1) return [initial]
        if (listCallCount === 2) return pollingList
        return [refreshed]
      },
      onBatchRequest: batchRequested,
      onListRequest: listRequested,
    })
    await flushAsync()

    expect(await screen.findByText('交错刷新前')).toBeInTheDocument()
    expect(listRequested).toHaveBeenCalledOnce()

    await vi.advanceTimersByTimeAsync(2500)
    await flushAsync()
    expect(batchRequested).toHaveBeenCalledTimes(2)
    expect(listRequested).toHaveBeenCalledTimes(2)

    await fireEvent.click(screen.getByRole('button', { name: 'save-1' }))
    await flushAsync()
    expect(listRequested).toHaveBeenCalledTimes(2)

    resolvePollingList([initial])
    await flushAsync()

    expect(listRequested).toHaveBeenCalledTimes(3)
    expect(await screen.findByText('交错刷新后')).toBeInTheDocument()
  })

  it('reloads subscriptions after the active-card refresh interval', async () => {
    const hidden = mockDocumentHidden(true)
    const listRequested = vi.fn()
    const batchRequested = vi.fn()
    const activeExecution = {
      can_cancel: false,
      phase: 'searching',
      state: 'searching',
      updated_at: '2026-09-01T00:01:00+00:00',
    }
    const initial = movie(1, '卡片执行中')
    const refreshed = movie(1, '卡片状态已更新')
    await renderList({
      batchResponse: sequenceResponse([[], []]),
      listResponse: sequenceResponse([[{ ...initial, execution_status: activeExecution }], [refreshed]]),
      onBatchRequest: batchRequested,
      onListRequest: listRequested,
    })

    expect(await screen.findByText('卡片执行中')).toBeInTheDocument()
    expect(listRequested).toHaveBeenCalledOnce()
    expect(batchRequested).toHaveBeenCalledOnce()
    await flushAsync()

    vi.useFakeTimers()
    await vi.advanceTimersByTimeAsync(15_000)
    hidden.set(false)
    document.dispatchEvent(new Event('visibilitychange'))
    await flushAsync()

    expect(batchRequested).toHaveBeenCalledTimes(2)
    expect(listRequested).toHaveBeenCalledTimes(2)
    expect(await screen.findByText('卡片状态已更新')).toBeInTheDocument()
  })

  it('stops polling while hidden and resumes with an immediate batch request when visible', async () => {
    const hidden = mockDocumentHidden(false)
    const listRequested = vi.fn()
    const batchRequested = vi.fn()
    const stableBatch = executionBatch()
    await renderList({
      batchResponse: sequenceResponse([[stableBatch], [stableBatch]]),
      listResponse: [movie(1, '可见性订阅')],
      onBatchRequest: batchRequested,
      onListRequest: listRequested,
    })

    expect(await screen.findByText('可见性订阅')).toBeInTheDocument()
    expect(batchRequested).toHaveBeenCalledOnce()
    expect(listRequested).toHaveBeenCalledOnce()

    hidden.set(true)
    document.dispatchEvent(new Event('visibilitychange'))
    vi.useFakeTimers()
    await vi.advanceTimersByTimeAsync(5000)
    await flushAsync()
    expect(batchRequested).toHaveBeenCalledOnce()
    expect(listRequested).toHaveBeenCalledOnce()

    hidden.set(false)
    document.dispatchEvent(new Event('visibilitychange'))
    await flushAsync()
    expect(batchRequested).toHaveBeenCalledTimes(2)
    expect(listRequested).toHaveBeenCalledOnce()
  })

  it('reuses an in-flight batch request when visibility changes', async () => {
    const hidden = mockDocumentHidden(false)
    const batchRequested = vi.fn()
    let resolveBatch!: (batches: SubscriptionBatchStatus[]) => void
    const pendingBatch = new Promise<SubscriptionBatchStatus[]>(resolve => {
      resolveBatch = resolve
    })
    const { rerender } = await renderList({
      batchResponse: () => pendingBatch,
      listResponse: [movie(1, '并发读取订阅')],
      onBatchRequest: batchRequested,
    })

    await waitFor(() => expect(batchRequested).toHaveBeenCalledOnce())
    hidden.set(true)
    document.dispatchEvent(new Event('visibilitychange'))
    await rerender({ active: false })
    await rerender({ active: true })
    hidden.set(false)
    document.dispatchEvent(new Event('visibilitychange'))
    await flushAsync()

    expect(batchRequested).toHaveBeenCalledOnce()
    resolveBatch([executionBatch()])
    await flushAsync()
    expect(batchRequested).toHaveBeenCalledOnce()
    expect(await screen.findByText('并发读取订阅')).toBeInTheDocument()
  })

  it('serializes the complete poll when visibility changes during a batch request', async () => {
    const hidden = mockDocumentHidden(true)
    const listRequested = vi.fn()
    const batchRequested = vi.fn()
    let resolveBatch!: (batches: SubscriptionBatchStatus[]) => void
    let batchCallCount = 0
    const pendingBatch = new Promise<SubscriptionBatchStatus[]>(resolve => {
      resolveBatch = resolve
    })
    const activeExecution = {
      can_cancel: false,
      phase: 'searching',
      state: 'searching',
      updated_at: '2026-09-01T00:01:00+00:00',
    }
    await renderList({
      batchResponse: () => {
        batchCallCount += 1
        return batchCallCount === 1 ? [] : pendingBatch
      },
      listResponse: [movie(1, '轮询串行订阅', { execution_status: activeExecution })],
      onBatchRequest: batchRequested,
      onListRequest: listRequested,
    })

    expect(await screen.findByText('轮询串行订阅')).toBeInTheDocument()
    await waitFor(() => expect(batchRequested).toHaveBeenCalledOnce())

    vi.useFakeTimers()
    await vi.advanceTimersByTimeAsync(15_000)
    hidden.set(false)
    document.dispatchEvent(new Event('visibilitychange'))
    hidden.set(true)
    document.dispatchEvent(new Event('visibilitychange'))
    hidden.set(false)
    document.dispatchEvent(new Event('visibilitychange'))

    await flushAsync()
    expect(batchRequested).toHaveBeenCalledTimes(2)
    resolveBatch([executionBatch()])
    await flushAsync()

    expect(listRequested).toHaveBeenCalledTimes(2)
  })

  it('shows a skipped batch and uses its processed count in the progress label', async () => {
    await renderList({
      batchResponse: [
        executionBatch({
          batch_id: 'batch-skipped',
          failed_count: 0,
          finished_count: 1,
          phase: 'searching',
          processed_count: 2,
          skipped_count: 1,
          state: 'skipped',
          total_count: 3,
        }),
      ],
      listResponse: [movie(1, '跳过批次订阅')],
    })

    expect(await screen.findByText('跳过批次订阅')).toBeInTheDocument()
    expect(await screen.findByText('本轮已跳过')).toBeInTheDocument()
    expect(await screen.findByText('2/3')).toBeInTheDocument()
  })

  it('lets a superuser see subscriptions from every owner while retaining type defense', async () => {
    await renderList({
      listResponse: [movie(1, 'Own movie'), movie(2, 'Other movie', { username: 'other' }), tv(3, 'Other TV')],
      superUser: true,
    })

    expect(await screen.findByText('Own movie')).toBeInTheDocument()
    expect(screen.getByText('Other movie')).toBeInTheDocument()
    expect(screen.queryByText('Other TV')).not.toBeInTheDocument()
  })

  it('normalizes keyword filtering', async () => {
    await renderList({ keyword: '  ALPHA  ', listResponse: [movie(1, 'Alpha One'), movie(2, 'Beta Two')] })

    expect(await screen.findByText('Alpha One')).toBeInTheDocument()
    expect(screen.queryByText('Beta Two')).not.toBeInTheDocument()
  })

  it.each([
    ['best_version', 'Best'],
    ['pending', 'Pending'],
    ['paused', 'Paused'],
    ['completed', 'Completed'],
    ['subscribing', 'Subscribing'],
    ['not_started', 'Not started'],
  ])('derives the %s status defensively', async (statusFilter, expectedName) => {
    const subscriptions = [
      tv(11, 'Best', { best_version: 1 }),
      tv(12, 'Pending', { state: 'P' }),
      tv(13, 'Paused', { state: 'S' }),
      tv(14, 'Completed', { completed_episode: 10, lack_episode: 0, total_episode: 10 }),
      tv(15, 'Subscribing', { completed_episode: 6, lack_episode: 4, total_episode: 10 }),
      tv(16, 'Not started', { completed_episode: 0, lack_episode: 10, total_episode: 10 }),
    ]
    await renderList({ listResponse: subscriptions, statusFilter, type: '电视剧' })

    expect(await screen.findByText(expectedName)).toBeInTheDocument()
    expect(displayedNames()).toEqual([expectedName])
  })

  it('shows the empty state after a successful empty list response', async () => {
    await renderList({ listResponse: [] })

    expect(await screen.findByTestId('no-data')).toBeInTheDocument()
    expect(screen.queryByTestId('loading-banner')).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('finishes the initial loading state and shows a visible error when the list request fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const listRequested = vi.fn()
    await renderList({ listResponse: [], listStatus: 500, onListRequest: listRequested })

    await waitFor(() => expect(listRequested).toHaveBeenCalledOnce())
    await waitFor(() => expect(screen.queryByTestId('loading-banner')).not.toBeInTheDocument())
    expect(screen.getByRole('alert')).toHaveTextContent('请求失败，请稍后重试')
    expect(screen.queryByTestId('no-data')).not.toBeInTheDocument()
    expect(mocks.toastError).toHaveBeenCalledWith('请求失败，请稍后重试')
  })

  it('keeps old data through a silent refresh failure and clears the error after recovery', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const failedRequest = vi.fn()
    const recoveredRequest = vi.fn()
    const { rerender } = await renderList({ listResponse: [movie(1, 'Cached movie')] })
    await screen.findByText('Cached movie')

    await rerender({ active: false })
    server.use(subscribeListHandler([], 500, failedRequest))
    await rerender({ active: true })

    await waitFor(() => expect(failedRequest).toHaveBeenCalledOnce())
    expect(screen.getByText('Cached movie')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('请求失败，请稍后重试')
    expect(screen.queryByTestId('loading-banner')).not.toBeInTheDocument()

    await rerender({ active: false })
    server.use(subscribeListHandler([movie(2, 'Recovered movie')], 200, recoveredRequest))
    await rerender({ active: true })

    await waitFor(() => expect(recoveredRequest).toHaveBeenCalledOnce())
    expect(await screen.findByText('Recovered movie')).toBeInTheDocument()
    expect(screen.queryByText('Cached movie')).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

describe('SubscribeListView sorting and refresh boundaries', () => {
  it('applies custom order first and appends unconfigured subscriptions by date', async () => {
    await renderList({
      listResponse: [
        movie(1, 'Old unconfigured', { date: '2024-01-01' }),
        movie(2, 'Configured', { date: '2023-01-01' }),
        movie(3, 'New unconfigured', { date: '2025-01-01' }),
      ],
      orderValue: [{ id: 2 }],
      sortBy: 'custom',
    })

    await screen.findByText('Configured')
    expect(displayedNames()).toEqual(['Configured', 'New unconfigured', 'Old unconfigured'])
  })

  it.each([
    [
      'date',
      [movie(1, 'Invalid date', { date: 'not-a-date' }), movie(2, 'Newest', { date: '2025-02-01' })],
      ['Newest', 'Invalid date'],
    ],
    [
      'last_update',
      [movie(1, 'Invalid update', { last_update: 'bad' }), movie(2, 'Latest update', { last_update: '2025-02-01' })],
      ['Latest update', 'Invalid update'],
    ],
    [
      'lack_episode',
      [
        tv(1, 'Few missing', { date: '2025-03-01', lack_episode: 1 }),
        tv(2, 'Many missing', { date: '2024-01-01', lack_episode: 8 }),
        tv(3, 'Few newer', { date: '2025-04-01', lack_episode: 1 }),
      ],
      ['Many missing', 'Few newer', 'Few missing'],
    ],
  ])('sorts by %s and treats invalid dates as zero', async (sortBy, subscriptions, expected) => {
    await renderList({
      listResponse: subscriptions,
      sortBy,
      type: sortBy === 'lack_episode' ? '电视剧' : '电影',
    })

    await screen.findByText(expected[0])
    expect(displayedNames()).toEqual(expected)
  })

  it('marks and scrolls to the initial subscription id', async () => {
    await renderList({ listResponse: [movie(1, 'First'), movie(2, 'Target')], subid: '2' })

    await screen.findByText('Target')
    expect(card(2)).toHaveAttribute('data-page-open', 'true')
    expect(screen.getByTestId('progressive-grid')).toHaveAttribute('data-scroll-to-index', '1')
  })

  it('refreshes from card save/remove and the history save boundary', async () => {
    const listRequested = vi.fn()
    await renderList({ listResponse: [movie(1, 'Refresh target')], onListRequest: listRequested })
    await screen.findByText('Refresh target')
    expect(listRequested).toHaveBeenCalledTimes(1)

    await fireEvent.click(screen.getByRole('button', { name: 'save-1' }))
    await waitFor(() => expect(listRequested).toHaveBeenCalledTimes(2))
    await fireEvent.click(screen.getByRole('button', { name: 'remove-1' }))
    await waitFor(() => expect(listRequested).toHaveBeenCalledTimes(3))
    await fireEvent.click(screen.getByRole('button', { name: 'host-open-history' }))

    expect(mocks.openSharedDialog).toHaveBeenCalledOnce()
    expect(mocks.openSharedDialog.mock.calls[0][1]).toEqual({ type: '电影' })
    const events = mocks.openSharedDialog.mock.calls[0][2] as { save: () => void }
    events.save()
    await waitFor(() => expect(listRequested).toHaveBeenCalledTimes(4))
  })

  it('commits a custom order only after a successful response', async () => {
    const saved = vi.fn()
    server.use(saveSubscribeOrderConfigHandler('电影', { success: true }, 200, saved))
    await renderList({
      listResponse: [movie(1, 'First'), movie(2, 'Second')],
      orderValue: [{ id: 1 }, { id: 2 }],
      sortBy: 'custom',
      sortMode: true,
    })
    await screen.findByText('First')

    await fireEvent.click(screen.getByRole('button', { name: 'reverse-order' }))

    await waitFor(() => expect(saved).toHaveBeenCalledOnce())
    expect(saved.mock.calls[0][0]).toEqual([{ id: 2 }, { id: 1 }])
    expect(saved.mock.calls[0][1].href).toBe(subscribeApiUrls.orderConfig('电影'))
    expect(displayedNames()).toEqual(['Second', 'First'])
    expect(screen.getByTestId('sort-mode-state')).toHaveTextContent('true')
  })

  it('rolls back the confirmed order and remains sortable after a request failure', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    server.use(saveSubscribeOrderConfigHandler('电影', { message: 'server error', success: false }, 500))
    await renderList({
      listResponse: [movie(1, 'First'), movie(2, 'Second')],
      orderValue: [{ id: 1 }, { id: 2 }],
      sortBy: 'custom',
      sortMode: true,
    })
    await screen.findByText('First')

    await fireEvent.click(screen.getByRole('button', { name: 'reverse-order' }))

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('请求失败，请稍后重试'))
    expect(displayedNames()).toEqual(['First', 'Second'])
    expect(screen.getByTestId('sort-mode-state')).toHaveTextContent('true')
  })
})

describe('SubscribeListView batch operations', () => {
  it('exits drag sorting when batch mode makes the list unsortable', async () => {
    await renderList({
      listResponse: [movie(1, 'Alpha'), movie(2, 'Beta')],
      orderValue: [{ id: 1 }, { id: 2 }],
      sortBy: 'custom',
      sortMode: true,
    })
    await screen.findByText('Alpha')
    expect(screen.getByTestId('sort-mode-state')).toHaveTextContent('true')

    await fireEvent.click(screen.getByRole('button', { name: 'host-enter-batch' }))

    await waitFor(() => expect(screen.getByTestId('sort-mode-state')).toHaveTextContent('false'))
    expect(batchState()).toMatchObject({ enabled: true, selectedCount: 0, totalCount: 2 })
  })

  it('intersects selection with the visible list and never treats equal lengths as equal ids', async () => {
    const statusRequested = vi.fn()
    server.use(updateSubscribeStatusHandler(1, { success: true }, 200, statusRequested))
    const { rerender } = await renderList({ listResponse: [movie(1, 'Alpha'), movie(2, 'Beta')] })
    await screen.findByText('Alpha')

    await fireEvent.click(screen.getByRole('button', { name: 'host-enter-batch' }))
    await fireEvent.click(screen.getByRole('button', { name: 'select-1' }))
    expect(batchState()).toMatchObject({ allSelected: false, enabled: true, selectedCount: 1, totalCount: 2 })

    await rerender({ keyword: 'Beta' })
    await waitFor(() => expect(displayedNames()).toEqual(['Beta']))
    expect(card(2)).toHaveAttribute('data-selected', 'false')
    expect(batchState()).toMatchObject({ allSelected: false, enabled: true, selectedCount: 0, totalCount: 1 })

    await fireEvent.click(screen.getByRole('button', { name: 'host-batch-enable' }))
    expect(mocks.toastWarning).toHaveBeenCalledWith('请先选择要操作的订阅')
    expect(statusRequested).not.toHaveBeenCalled()
  })

  it('selects and deselects the exact visible id set', async () => {
    await renderList({ listResponse: [movie(1, 'Alpha'), movie(2, 'Beta')] })
    await screen.findByText('Alpha')
    await fireEvent.click(screen.getByRole('button', { name: 'host-enter-batch' }))

    await fireEvent.click(screen.getByRole('button', { name: 'host-toggle-select-all' }))
    expect(card(1)).toHaveAttribute('data-selected', 'true')
    expect(card(2)).toHaveAttribute('data-selected', 'true')
    expect(batchState()).toMatchObject({ allSelected: true, selectedCount: 2, totalCount: 2 })

    await fireEvent.click(screen.getByRole('button', { name: 'host-toggle-select-all' }))
    expect(card(1)).toHaveAttribute('data-selected', 'false')
    expect(card(2)).toHaveAttribute('data-selected', 'false')
    expect(batchState()).toMatchObject({ allSelected: false, selectedCount: 0, totalCount: 2 })
  })

  it('does not request a mutation without selection or after confirmation is cancelled', async () => {
    const requested = vi.fn()
    server.use(updateSubscribeStatusHandler(1, { success: true }, 200, requested))
    await renderList({ listResponse: [movie(1, 'Alpha')] })
    await screen.findByText('Alpha')
    await fireEvent.click(screen.getByRole('button', { name: 'host-enter-batch' }))

    await fireEvent.click(screen.getByRole('button', { name: 'host-batch-enable' }))
    expect(mocks.toastWarning).toHaveBeenCalledWith('请先选择要操作的订阅')
    expect(requested).not.toHaveBeenCalled()

    mocks.confirm.mockResolvedValueOnce(false)
    await fireEvent.click(screen.getByRole('button', { name: 'select-1' }))
    await fireEvent.click(screen.getByRole('button', { name: 'host-batch-enable' }))
    expect(requested).not.toHaveBeenCalled()
    expect(card(1)).toHaveAttribute('data-selected', 'true')
  })

  it.each([
    ['enable', 'host-batch-enable', 'R'],
    ['pause', 'host-batch-pause', 'S'],
  ])('completes a successful batch %s and sends the expected state query', async (_case, buttonName, state) => {
    const requested = vi.fn()
    server.use(updateSubscribeStatusHandler(1, { success: true }, 200, requested))
    await renderList({ listResponse: [movie(1, 'Alpha')] })
    await screen.findByText('Alpha')
    await fireEvent.click(screen.getByRole('button', { name: 'host-enter-batch' }))
    await fireEvent.click(screen.getByRole('button', { name: 'select-1' }))

    await fireEvent.click(screen.getByRole('button', { name: buttonName }))

    await waitFor(() => expect(requested).toHaveBeenCalledOnce())
    expect(requested.mock.calls[0][0].pathname).toBe(new URL(subscribeApiUrls.statusById(1)).pathname)
    expect(requested.mock.calls[0][0].searchParams.get('state')).toBe(state)
    await waitFor(() => expect(batchState()).toMatchObject({ enabled: false, selectedCount: 0 }))
  })

  it('completes a successful batch delete through the id endpoint', async () => {
    const deleted = vi.fn()
    server.use(deleteSubscribeByIdHandler(1, { data: { status: 'deleted' }, success: true }, 200, deleted))
    await renderList({ listResponse: [movie(1, 'Alpha')] })
    await screen.findByText('Alpha')
    await fireEvent.click(screen.getByRole('button', { name: 'host-enter-batch' }))
    await fireEvent.click(screen.getByRole('button', { name: 'select-1' }))

    await fireEvent.click(screen.getByRole('button', { name: 'host-batch-delete' }))

    await waitFor(() => expect(deleted).toHaveBeenCalledOnce())
    await waitFor(() => expect(batchState()).toMatchObject({ enabled: false, selectedCount: 0 }))
  })

  it('keeps failed subscriptions selected for an immediate retry', async () => {
    const firstDeleted = vi.fn()
    const secondDeleted = vi.fn()
    server.use(
      deleteSubscribeByIdHandler(1, { data: { status: 'deleted' }, success: true }, 200, firstDeleted),
      deleteSubscribeByIdHandler(2, { message: '暂时失败', success: false }, 503, secondDeleted),
    )
    await renderList({ listResponse: [movie(1, 'Alpha'), movie(2, 'Beta')] })
    await screen.findByText('Alpha')
    await fireEvent.click(screen.getByRole('button', { name: 'host-enter-batch' }))
    await fireEvent.click(screen.getByRole('button', { name: 'host-toggle-select-all' }))

    await fireEvent.click(screen.getByRole('button', { name: 'host-batch-delete' }))

    await waitFor(() => expect(firstDeleted).toHaveBeenCalledOnce())
    await waitFor(() => expect(secondDeleted).toHaveBeenCalledOnce())
    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalledWith('成功删除 1 个订阅'))
    expect(mocks.toastError).toHaveBeenCalledWith('删除失败 1 个订阅')
    await waitFor(() => expect(card(2)).toHaveAttribute('data-selected', 'true'))
    expect(batchState()).toMatchObject({ enabled: true, selectedCount: 1 })
  })

  it.each([
    ['enable', 'host-batch-enable', '启用'],
    ['pause', 'host-batch-pause', '暂停'],
  ])('classifies a %s success false response as a failure', async (_case, buttonName, actionName) => {
    const requested = vi.fn()
    server.use(updateSubscribeStatusHandler(1, { message: 'rejected', success: false }, 200, requested))
    await renderList({ listResponse: [movie(1, 'Alpha')] })
    await screen.findByText('Alpha')
    await fireEvent.click(screen.getByRole('button', { name: 'host-enter-batch' }))
    await fireEvent.click(screen.getByRole('button', { name: 'select-1' }))

    await fireEvent.click(screen.getByRole('button', { name: buttonName }))

    await waitFor(() => expect(requested).toHaveBeenCalledOnce())
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith(`${actionName}失败 1 个订阅`))
    expect(mocks.toastSuccess).not.toHaveBeenCalled()
    await waitFor(() => expect(batchState()).toMatchObject({ enabled: false, selectedCount: 0 }))
  })

  it('reports mixed status results without changing the existing completion flow', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const firstRequested = vi.fn()
    const secondRequested = vi.fn()
    server.use(
      updateSubscribeStatusHandler(1, { success: true }, 200, firstRequested),
      updateSubscribeStatusHandler(2, { message: 'failed', success: false }, 500, secondRequested),
    )
    await renderList({ listResponse: [movie(1, 'Alpha'), movie(2, 'Beta')] })
    await screen.findByText('Alpha')
    await fireEvent.click(screen.getByRole('button', { name: 'host-enter-batch' }))
    await fireEvent.click(screen.getByRole('button', { name: 'host-toggle-select-all' }))

    await fireEvent.click(screen.getByRole('button', { name: 'host-batch-enable' }))

    await waitFor(() => expect(firstRequested).toHaveBeenCalledOnce())
    await waitFor(() => expect(secondRequested).toHaveBeenCalledOnce())
    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalledWith('成功启用 1 个订阅'))
    expect(mocks.toastError).toHaveBeenCalledWith('启用失败 1 个订阅')
    await waitFor(() => expect(batchState()).toMatchObject({ enabled: false, selectedCount: 0 }))
  })
})
