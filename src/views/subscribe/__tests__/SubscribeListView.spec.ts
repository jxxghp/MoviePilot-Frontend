import type { Subscribe } from '@/api/types'
import SubscribeListView from '@/views/subscribe/SubscribeListView.vue'
import { fireEvent, screen, waitFor } from '@testing-library/vue'
import { createSubscribe } from '@tests/support/factories/subscribe'
import {
  deleteSubscribeByIdHandler,
  saveSubscribeOrderConfigHandler,
  subscribeApiUrls,
  subscribeListHandler,
  subscribeOrderConfigHandler,
  updateSubscribeStatusHandler,
  type SubscribeMediaType,
} from '@tests/support/msw/handlers/subscribe'
import { server } from '@tests/support/msw/server'
import { renderWithProviders } from '@tests/support/render'
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
          h('button', { 'aria-label': `select-${props.media.id}`, onClick: () => emit('select'), type: 'button' }, 'select'),
          h('button', { 'aria-label': `save-${props.media.id}`, onClick: () => emit('save'), type: 'button' }, 'save'),
          h('button', { 'aria-label': `remove-${props.media.id}`, onClick: () => emit('remove'), type: 'button' }, 'remove'),
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
  keyword?: string
  listResponse?: Subscribe[]
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
    subscribeOrderConfigHandler(
      type,
      options.orderValue,
      options.orderStatus ?? 200,
      options.onOrderRequest,
    ),
    subscribeListHandler(options.listResponse ?? [], options.listStatus ?? 200, options.onListRequest),
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
    server.use(deleteSubscribeByIdHandler(1, { success: true }, 200, deleted))
    await renderList({ listResponse: [movie(1, 'Alpha')] })
    await screen.findByText('Alpha')
    await fireEvent.click(screen.getByRole('button', { name: 'host-enter-batch' }))
    await fireEvent.click(screen.getByRole('button', { name: 'select-1' }))

    await fireEvent.click(screen.getByRole('button', { name: 'host-batch-delete' }))

    await waitFor(() => expect(deleted).toHaveBeenCalledOnce())
    await waitFor(() => expect(batchState()).toMatchObject({ enabled: false, selectedCount: 0 }))
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
