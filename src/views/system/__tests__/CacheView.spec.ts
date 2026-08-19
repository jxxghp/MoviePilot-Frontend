import type { TorrentCacheData, TorrentCacheItem } from '@/api/types'
import { formatDateDifference, formatFileSize } from '@/@core/utils/formatters'
import CacheView from '@/views/system/CacheView.vue'
import { fireEvent, screen, waitFor, within } from '@testing-library/vue'
import { renderWithProviders } from '@tests/support/render'
import { computed, defineComponent, h, inject, provide, ref, type InjectionKey, type PropType } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  apiDelete: vi.fn(),
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  confirm: vi.fn(),
  mobile: false,
  openSharedDialog: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  toastWarning: vi.fn(),
}))

vi.mock('@/api', () => ({
  default: createDataApiMock({
    delete: (...args: unknown[]) => mocks.apiDelete(...args),
    get: (...args: unknown[]) => mocks.apiGet(...args),
    post: (...args: unknown[]) => mocks.apiPost(...args),
  }),
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

vi.mock('@/composables/usePWA', () => ({
  usePWA: () => ({ appMode: true }),
}))

vi.mock('@/composables/useSharedDialog', () => ({
  openSharedDialog: (...args: unknown[]) => mocks.openSharedDialog(...args),
}))

vi.mock('vuetify', async importOriginal => {
  const actual = await importOriginal<typeof import('vuetify')>()
  return {
    ...actual,
    useDisplay: () => ({ smAndDown: computed(() => mocks.mobile) }),
  }
})

const toggleSelectionKey: InjectionKey<(value: unknown) => void> = Symbol('cache-type-selection')

const ButtonToggleStub = defineComponent({
  name: 'VBtnToggle',
  emits: ['update:modelValue'],
  setup(_props, { emit, slots }) {
    provide(toggleSelectionKey, value => emit('update:modelValue', value))
    return () => h('div', { 'aria-label': '缓存类型切换' }, slots.default?.())
  },
})

const ButtonStub = defineComponent({
  name: 'VBtn',
  inheritAttrs: false,
  props: {
    disabled: Boolean,
    loading: Boolean,
    value: {
      type: [String, Number, Boolean] as PropType<string | number | boolean>,
      default: undefined,
    },
  },
  setup(props, { attrs, slots }) {
    const selectCacheType = inject(toggleSelectionKey, undefined)
    return () => {
      const { onClick, ...buttonAttrs } = attrs
      return h(
        'button',
        {
          ...buttonAttrs,
          'aria-busy': String(props.loading),
          disabled: props.disabled,
          onClick: [() => selectCacheType?.(props.value), onClick],
          type: 'button',
        },
        slots.default?.(),
      )
    }
  },
})

const IconStub = defineComponent({
  name: 'VIcon',
  props: { icon: String },
  template: '<span class="test-icon" :data-icon="icon"><slot /></span>',
})

const TooltipStub = defineComponent({
  name: 'VTooltip',
  template: '<span><slot /></span>',
})

const TextFieldStub = defineComponent({
  name: 'VTextField',
  inheritAttrs: false,
  props: {
    label: String,
    modelValue: String,
    placeholder: String,
  },
  emits: ['update:modelValue'],
  setup(props, { attrs, emit }) {
    return () =>
      h('input', {
        'aria-label': attrs['aria-label'] ?? props.label ?? props.placeholder,
        onInput: (event: Event) => emit('update:modelValue', (event.target as HTMLInputElement).value || null),
        value: props.modelValue ?? '',
      })
  },
})

const AutocompleteStub = defineComponent({
  name: 'VAutocomplete',
  inheritAttrs: false,
  props: {
    items: {
      type: Array as PropType<string[]>,
      default: () => [],
    },
    label: String,
    modelValue: String,
    placeholder: String,
  },
  emits: ['update:modelValue'],
  setup(props, { attrs, emit }) {
    return () =>
      h(
        'select',
        {
          'aria-label': attrs['aria-label'] ?? props.label ?? props.placeholder,
          onChange: (event: Event) => emit('update:modelValue', (event.target as HTMLSelectElement).value || null),
          value: props.modelValue ?? '',
        },
        [h('option', { value: '' }, '全部站点'), ...props.items.map(site => h('option', { value: site }, site))],
      )
  },
})

const DataTableStub = defineComponent({
  name: 'VDataTable',
  props: {
    itemValue: {
      type: [String, Function] as PropType<string | ((item: TorrentCacheItem) => unknown)>,
      default: 'id',
    },
    items: {
      type: Array as PropType<TorrentCacheItem[]>,
      default: () => [],
    },
    loading: Boolean,
    modelValue: {
      type: Array as PropType<TorrentCacheItem[]>,
      default: () => [],
    },
    returnObject: Boolean,
  },
  emits: ['update:modelValue'],
  setup(props, { emit, slots }) {
    function selectCurrentItems() {
      const selectedByValue = new Map<unknown, TorrentCacheItem>()
      props.items.forEach(item => {
        const value =
          typeof props.itemValue === 'function'
            ? props.itemValue(item)
            : item[props.itemValue as keyof TorrentCacheItem]
        if (!selectedByValue.has(value)) selectedByValue.set(value, item)
      })
      emit('update:modelValue', props.returnObject ? [...selectedByValue.values()] : [...selectedByValue.keys()])
    }

    return () =>
      h('section', { 'aria-label': '缓存列表' }, [
        h('output', { 'aria-label': '缓存加载状态' }, String(props.loading)),
        h(
          'output',
          { 'aria-label': '缓存选择集合' },
          JSON.stringify(props.modelValue.map(item => [item.domain, item.hash])),
        ),
        h(
          'button',
          {
            onClick: selectCurrentItems,
            type: 'button',
          },
          '选择当前结果',
        ),
        ...props.items.map(item =>
          h('article', { 'data-cache-hash': item.hash, 'data-cache-site': item.site_name }, [
            h('span', item.title),
            ...(slots['item.actions']?.({ item }) ?? []),
          ]),
        ),
        props.items.length === 0 ? slots['no-data']?.({}) : null,
      ])
  },
})

type InfiniteScrollStatus = 'empty' | 'error' | 'ok'

const InfiniteScrollStub = defineComponent({
  name: 'VInfiniteScroll',
  props: {
    items: {
      type: Array as PropType<TorrentCacheItem[]>,
      default: () => [],
    },
  },
  emits: ['load'],
  setup(props, { emit, slots }) {
    const status = ref<'empty' | 'error' | 'idle' | 'loading'>('idle')

    function load() {
      status.value = 'loading'
      emit('load', {
        done(nextStatus: InfiniteScrollStatus) {
          status.value = nextStatus === 'ok' ? 'idle' : nextStatus
        },
      })
    }

    return () =>
      h('section', { 'aria-label': '移动缓存无限列表' }, [
        h('output', { 'aria-label': '移动缓存无限列表状态' }, status.value),
        h('output', { 'aria-label': '移动缓存数量' }, String(props.items.length)),
        status.value === 'loading' ? slots.loading?.({}) : null,
        slots.default?.(),
        h('button', { onClick: load, type: 'button' }, '加载更多缓存'),
      ])
  },
})

const ProgressiveGridStub = defineComponent({
  name: 'ProgressiveCardGrid',
  props: {
    getItemKey: {
      type: Function as PropType<(item: TorrentCacheItem, index: number) => string>,
      required: true,
    },
    items: {
      type: Array as PropType<TorrentCacheItem[]>,
      default: () => [],
    },
  },
  setup(props, { slots }) {
    return () =>
      h('section', { 'aria-label': '移动缓存渐进网格' }, [
        h(
          'output',
          { 'aria-label': '移动缓存稳定键' },
          JSON.stringify(props.items.map((item, index) => props.getItemKey(item, index))),
        ),
        ...props.items.flatMap(item => slots.default?.({ item }) ?? []),
      ])
  },
})

const MenuStub = defineComponent({
  name: 'VMenu',
  setup(_props, { slots }) {
    return () => h('div', [slots.activator?.({ props: {} }), slots.default?.()])
  },
})

const ListItemStub = defineComponent({
  name: 'VListItem',
  inheritAttrs: false,
  setup(_props, { attrs, slots }) {
    return () => h('button', { ...attrs, type: 'button' }, [slots.prepend?.(), slots.default?.()])
  },
})

const ImageStub = defineComponent({
  name: 'VImg',
  props: {
    alt: String,
    src: String,
  },
  setup(props) {
    return () => h('img', { alt: props.alt, src: props.src })
  },
})

const PassthroughStub = defineComponent({
  inheritAttrs: false,
  setup(_props, { attrs, slots }) {
    return () => h('div', attrs, slots.default?.())
  },
})

const RecognitionCachePanelStub = defineComponent({
  name: 'RecognitionCachePanel',
  template: '<section>识别缓存面板</section>',
})

const stubs = {
  ProgressiveCardGrid: ProgressiveGridStub,
  RecognitionCachePanel: RecognitionCachePanelStub,
  VAutocomplete: AutocompleteStub,
  VBtn: ButtonStub,
  VBtnToggle: ButtonToggleStub,
  VCol: defineComponent({ template: '<div><slot /></div>' }),
  VDataTable: DataTableStub,
  VIcon: IconStub,
  VImg: ImageStub,
  VInfiniteScroll: InfiniteScrollStub,
  VList: PassthroughStub,
  VListItem: ListItemStub,
  VListItemTitle: PassthroughStub,
  VMenu: MenuStub,
  VRow: defineComponent({ template: '<div><slot /></div>' }),
  VChip: PassthroughStub,
  VTextField: TextFieldStub,
  VTooltip: TooltipStub,
}

function createCacheItem(overrides: Partial<TorrentCacheItem> = {}): TorrentCacheItem {
  return {
    domain: 'alpha.example',
    hash: 'alpha-hash',
    size: 1024,
    title: 'Alpha.Movie.2026',
    ...overrides,
  }
}

function createCacheData(items: TorrentCacheItem[]): TorrentCacheData {
  return {
    count: items.length,
    sites: new Set(items.map(item => item.domain)).size,
    data: items,
  }
}

function success<T>(data: T) {
  return { data, message: '', success: true }
}

function businessFailure(message = '业务失败') {
  return { data: null, message, success: false }
}

function deferred<T>() {
  let reject!: (reason?: unknown) => void
  let resolve!: (value: T) => void
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    reject = promiseReject
    resolve = promiseResolve
  })
  return { promise, reject, resolve }
}

function getIconButton(icon: string, index = 0) {
  const icons = [
    ...document.querySelectorAll(`[data-icon="${icon}"]`),
    ...Array.from(document.querySelectorAll('.test-icon')).filter(element => element.textContent?.trim() === icon),
  ]
  const button = icons[index]?.closest('button')
  expect(button).not.toBeNull()
  return button as HTMLButtonElement
}

function createDialogController() {
  return {
    close: vi.fn(),
    id: 1,
    updateProps: vi.fn(),
  }
}

async function renderCache() {
  return renderWithProviders(CacheView, {
    global: { stubs },
    initialState: {
      globalSettings: {
        data: { RECOGNIZE_SOURCE: 'themoviedb' },
      },
    },
  })
}

async function waitForInitialLoad() {
  await waitFor(() => expect(mocks.apiGet).toHaveBeenCalledWith('torrent/cache'))
  await waitFor(() => expect(screen.getByLabelText('缓存加载状态')).toHaveTextContent('false'))
}

describe('CacheView cache data and filtering', () => {
  beforeEach(() => {
    mocks.apiDelete.mockReset().mockResolvedValue(success(null))
    mocks.apiGet.mockReset().mockResolvedValue(success(createCacheData([])))
    mocks.apiPost.mockReset().mockResolvedValue(success(null))
    mocks.confirm.mockReset().mockResolvedValue(true)
    mocks.mobile = false
    mocks.openSharedDialog.mockReset().mockReturnValue(createDialogController())
    mocks.toastError.mockReset()
    mocks.toastSuccess.mockReset()
    mocks.toastWarning.mockReset()
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  it('loads unwrapped cache data and filters titles case-insensitively and sites by exact source', async () => {
    const items = [
      createCacheItem({ site_name: 'Zulu Tracker' }),
      createCacheItem({
        domain: 'beta.example',
        hash: 'beta-hash',
        site_name: 'Alpha Tracker',
        title: 'Beta.Show.S01',
      }),
      createCacheItem({ domain: 'gamma.example', hash: 'gamma-hash', site_name: 'Zulu Tracker', title: 'Gamma.Album' }),
    ]
    mocks.apiGet.mockResolvedValue(success(createCacheData(items)))

    await renderCache()
    await waitForInitialLoad()

    expect(screen.getByText('Alpha.Movie.2026')).toBeInTheDocument()
    expect(screen.getByText('Beta.Show.S01')).toBeInTheDocument()
    expect(screen.getByText('Gamma.Album')).toBeInTheDocument()

    await fireEvent.update(screen.getByLabelText('按标题筛选'), 'bETA')
    expect(screen.getByText('Beta.Show.S01')).toBeInTheDocument()
    expect(screen.queryByText('Alpha.Movie.2026')).not.toBeInTheDocument()

    await fireEvent.update(screen.getByLabelText('按标题筛选'), '')
    const siteFilter = screen.getByLabelText('按站点筛选') as HTMLSelectElement
    expect(Array.from(siteFilter.options).map(option => option.value)).toEqual(['', 'Alpha Tracker', 'Zulu Tracker'])
    await fireEvent.update(siteFilter, 'Zulu Tracker')
    expect(screen.getByText('Alpha.Movie.2026')).toBeInTheDocument()
    expect(screen.getByText('Gamma.Album')).toBeInTheDocument()
    expect(screen.queryByText('Beta.Show.S01')).not.toBeInTheDocument()
  })

  it('switches between torrent and recognition cache managers without issuing another torrent request', async () => {
    await renderCache()
    await waitForInitialLoad()

    await fireEvent.click(screen.getByRole('button', { name: '识别缓存' }))

    expect(screen.getByText('识别缓存面板')).toBeInTheDocument()
    expect(screen.queryByLabelText('缓存列表')).not.toBeInTheDocument()
    expect(mocks.apiGet).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['业务失败', () => mocks.apiGet.mockResolvedValueOnce(businessFailure('读取失败'))],
    ['HTTP 失败', () => mocks.apiGet.mockRejectedValueOnce(new Error('network down'))],
  ])('restores loading and reports an initial %s', async (_label, arrangeFailure) => {
    arrangeFailure()

    await renderCache()

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('加载缓存数据失败'))
    expect(screen.getByLabelText('缓存加载状态')).toHaveTextContent('false')
    expect(mocks.toastSuccess).not.toHaveBeenCalled()
  })
})

describe('CacheView mobile cache list', () => {
  beforeEach(() => {
    mocks.apiDelete.mockReset().mockResolvedValue(success(null))
    mocks.apiGet.mockReset().mockResolvedValue(success(createCacheData([])))
    mocks.apiPost.mockReset().mockResolvedValue(success(null))
    mocks.confirm.mockReset().mockResolvedValue(true)
    mocks.mobile = true
    mocks.openSharedDialog.mockReset().mockReturnValue(createDialogController())
    mocks.toastError.mockReset()
    mocks.toastSuccess.mockReset()
    mocks.toastWarning.mockReset()
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  it('renders 20 items initially, appends the next page, and resets pagination after filtering', async () => {
    const items = Array.from({ length: 45 }, (_, index) => {
      const itemNumber = index + 1
      return createCacheItem({
        domain: `site-${itemNumber}.example`,
        hash: `cache-${itemNumber}`,
        title: itemNumber <= 25 ? `Match.Item.${itemNumber}` : `Other.Item.${itemNumber}`,
      })
    })
    mocks.apiGet.mockResolvedValue(success(createCacheData(items)))
    await renderCache()

    expect(await screen.findByLabelText('移动缓存数量')).toHaveTextContent('20')
    const initialStableKeys = JSON.parse(screen.getByLabelText('移动缓存稳定键').textContent ?? '[]')
    expect(initialStableKeys[0]).toBe(JSON.stringify(['site-1.example', 'cache-1']))
    expect(initialStableKeys[19]).toBe(JSON.stringify(['site-20.example', 'cache-20']))
    expect(screen.queryByText('Match.Item.21')).not.toBeInTheDocument()

    await fireEvent.click(screen.getByRole('button', { name: '加载更多缓存' }))

    await waitFor(() => expect(screen.getByLabelText('移动缓存数量')).toHaveTextContent('40'))
    expect(screen.getByText('Other.Item.40')).toBeInTheDocument()
    expect(screen.getByLabelText('移动缓存无限列表状态')).toHaveTextContent('idle')

    await fireEvent.update(screen.getByLabelText('按标题筛选'), 'match')

    await waitFor(() => expect(screen.getByLabelText('移动缓存数量')).toHaveTextContent('20'))
    expect(screen.getByText('Match.Item.20')).toBeInTheDocument()
    expect(screen.queryByText('Match.Item.21')).not.toBeInTheDocument()

    await fireEvent.click(screen.getByRole('button', { name: '加载更多缓存' }))

    await waitFor(() => expect(screen.getByLabelText('移动缓存数量')).toHaveTextContent('25'))
    expect(screen.getByText('Match.Item.25')).toBeInTheDocument()
    expect(screen.getByLabelText('移动缓存无限列表状态')).toHaveTextContent('empty')
  })

  it('maps rich cache metadata and a stable key into the mobile card', async () => {
    const pubdate = '2026-08-18 12:00:00'
    const item = createCacheItem({
      hash: 'rich-cache-key',
      media_name: 'Rich Media',
      media_type: 'movie',
      media_year: '2026',
      page_url: 'https://tracker.example/details/42',
      poster_path: 'https://images.example/poster.jpg',
      pubdate,
      resource_term: 'WEB-DL',
      season_episode: 'S01E02',
      site_name: 'Rich Tracker',
      size: 1024 * 1024,
      title: 'Rich.Torrent.Title',
    })
    mocks.apiGet.mockResolvedValue(success(createCacheData([item])))
    const openPage = vi.spyOn(window, 'open').mockImplementation(() => null)
    await renderCache()

    expect(await screen.findByText('Rich.Torrent.Title')).toBeInTheDocument()
    expect(screen.getByLabelText('移动缓存稳定键')).toHaveTextContent(
      JSON.stringify([JSON.stringify(['alpha.example', 'rich-cache-key'])]),
    )
    expect(screen.getByText('电影')).toBeInTheDocument()
    expect(screen.getByText('Rich Media')).toBeInTheDocument()
    expect(screen.getByText('2026 · S01E02')).toBeInTheDocument()
    expect(screen.getByText(`${formatDateDifference(pubdate)} · WEB-DL · Rich Tracker`)).toBeInTheDocument()
    expect(screen.getByText(formatFileSize(item.size))).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Rich Media' })).toHaveAttribute('src', 'https://images.example/poster.jpg')

    await fireEvent.click(screen.getByRole('button', { name: /在新窗口.*打开/ }))

    expect(openPage).toHaveBeenCalledWith('https://tracker.example/details/42', '_blank')
  })

  it('keeps mobile cards distinct when multiple sites return the same content hash', async () => {
    const items = [
      createCacheItem({ domain: 'alpha.example', hash: 'shared-hash', title: 'Alpha.Shared.Release' }),
      createCacheItem({ domain: 'beta.example', hash: 'shared-hash', title: 'Beta.Shared.Release' }),
    ]
    mocks.apiGet.mockResolvedValue(success(createCacheData(items)))
    await renderCache()

    expect(await screen.findByText('Alpha.Shared.Release')).toBeInTheDocument()
    expect(screen.getByText('Beta.Shared.Release')).toBeInTheDocument()
    expect(screen.getByLabelText('移动缓存稳定键')).toHaveTextContent(
      JSON.stringify(items.map(item => JSON.stringify([item.domain, item.hash]))),
    )
  })
})

describe('CacheView cache operations', () => {
  const initialItems = [
    createCacheItem({ site_name: 'Alpha Tracker' }),
    createCacheItem({ domain: 'beta.example', hash: 'beta-hash', site_name: 'Beta Tracker', title: 'Beta.Show.S01' }),
  ]

  beforeEach(() => {
    mocks.apiDelete.mockReset().mockResolvedValue(success(null))
    mocks.apiGet.mockReset().mockResolvedValue(success(createCacheData(initialItems)))
    mocks.apiPost.mockReset().mockResolvedValue(success(null))
    mocks.confirm.mockReset().mockResolvedValue(true)
    mocks.mobile = false
    mocks.openSharedDialog.mockReset().mockReturnValue(createDialogController())
    mocks.toastError.mockReset()
    mocks.toastSuccess.mockReset()
    mocks.toastWarning.mockReset()
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  it('requires confirmation before clearing and leaves the cache untouched when cancelled', async () => {
    mocks.confirm.mockResolvedValue(false)
    await renderCache()
    await waitForInitialLoad()

    await fireEvent.click(getIconButton('mdi-delete-variant'))

    expect(mocks.confirm).toHaveBeenCalledWith({
      content: '确认清空所有缓存吗？',
      title: '确认',
      type: 'warn',
    })
    expect(mocks.apiDelete).not.toHaveBeenCalled()
    expect(screen.getByText('Alpha.Movie.2026')).toBeInTheDocument()
  })

  it('keeps clear loading visible, reloads after success, and resets the selection collection', async () => {
    const clearRequest = deferred<ReturnType<typeof success<null>>>()
    mocks.apiDelete.mockReturnValueOnce(clearRequest.promise)
    mocks.apiGet
      .mockResolvedValueOnce(success(createCacheData(initialItems)))
      .mockResolvedValueOnce(success(createCacheData([])))
    await renderCache()
    await waitForInitialLoad()
    await fireEvent.click(screen.getByRole('button', { name: '选择当前结果' }))

    const clearButton = getIconButton('mdi-delete-variant')
    await fireEvent.click(clearButton)
    await waitFor(() => expect(mocks.apiDelete).toHaveBeenCalledWith('torrent/cache'))
    expect(clearButton).toHaveAttribute('aria-busy', 'true')

    clearRequest.resolve(success(null))

    await waitFor(() => expect(mocks.apiGet).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalledWith('缓存清理完成'))
    expect(screen.getByLabelText('缓存选择集合')).toHaveTextContent('[]')
    expect(screen.getByLabelText('缓存加载状态')).toHaveTextContent('false')
    expect(screen.queryByText('Alpha.Movie.2026')).not.toBeInTheDocument()
  })

  it.each([
    ['业务失败', () => mocks.apiDelete.mockResolvedValueOnce(businessFailure('清理失败'))],
    ['HTTP 失败', () => mocks.apiDelete.mockRejectedValueOnce(new Error('network down'))],
  ])('preserves selections after a clear %s and allows a successful retry', async (_label, arrangeFailure) => {
    mocks.apiGet
      .mockResolvedValueOnce(success(createCacheData(initialItems)))
      .mockResolvedValueOnce(success(createCacheData([])))
    arrangeFailure()
    mocks.apiDelete.mockResolvedValueOnce(success(null))
    await renderCache()
    await waitForInitialLoad()
    await fireEvent.click(screen.getByRole('button', { name: '选择当前结果' }))

    const clearButton = getIconButton('mdi-delete-variant')
    await fireEvent.click(clearButton)

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('清理缓存失败'))
    expect(mocks.apiGet).toHaveBeenCalledTimes(1)
    expect(screen.getByLabelText('缓存选择集合')).toHaveTextContent(
      '[["alpha.example","alpha-hash"],["beta.example","beta-hash"]]',
    )
    expect(clearButton).toHaveAttribute('aria-busy', 'false')

    await fireEvent.click(clearButton)

    await waitFor(() => expect(mocks.apiDelete).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(screen.getByLabelText('缓存选择集合')).toHaveTextContent('[]'))
    expect(mocks.toastSuccess).toHaveBeenCalledWith('缓存清理完成')
    expect(clearButton).toHaveAttribute('aria-busy', 'false')
  })

  it.each([
    ['业务失败', () => mocks.apiPost.mockResolvedValueOnce(businessFailure('刷新失败'))],
    ['HTTP 失败', () => mocks.apiPost.mockRejectedValueOnce(new Error('network down'))],
  ])('recovers from a refresh %s and allows a successful retry', async (_label, arrangeFailure) => {
    const refreshed = createCacheItem({ hash: 'refreshed-hash', title: 'Refreshed.Movie.2026' })
    mocks.apiGet
      .mockResolvedValueOnce(success(createCacheData(initialItems)))
      .mockResolvedValueOnce(success(createCacheData([refreshed])))
    arrangeFailure()
    mocks.apiPost.mockResolvedValueOnce(success(null))
    await renderCache()
    await waitForInitialLoad()

    const refreshButton = getIconButton('mdi-refresh')
    await fireEvent.click(refreshButton)

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('刷新缓存失败'))
    expect(refreshButton).toHaveAttribute('aria-busy', 'false')
    expect(mocks.apiGet).toHaveBeenCalledTimes(1)
    expect(mocks.toastSuccess).not.toHaveBeenCalled()

    await fireEvent.click(refreshButton)

    expect(await screen.findByText('Refreshed.Movie.2026')).toBeInTheDocument()
    expect(mocks.apiPost).toHaveBeenCalledTimes(2)
    expect(mocks.toastSuccess).toHaveBeenCalledWith('缓存刷新完成')
    expect(refreshButton).toHaveAttribute('aria-busy', 'false')
  })

  it('maps the selected cache items to their domain endpoints, reloads, and clears successful selections', async () => {
    mocks.apiGet
      .mockResolvedValueOnce(success(createCacheData(initialItems)))
      .mockResolvedValueOnce(success(createCacheData([])))
    await renderCache()
    await waitForInitialLoad()

    await fireEvent.click(screen.getByRole('button', { name: '选择当前结果' }))
    expect(screen.getByLabelText('缓存选择集合')).toHaveTextContent(
      '[["alpha.example","alpha-hash"],["beta.example","beta-hash"]]',
    )

    await fireEvent.click(getIconButton('mdi-delete-sweep-outline'))

    await waitFor(() => expect(mocks.apiDelete).toHaveBeenCalledTimes(2))
    expect(mocks.apiDelete).toHaveBeenNthCalledWith(1, 'torrent/cache/alpha.example/alpha-hash')
    expect(mocks.apiDelete).toHaveBeenNthCalledWith(2, 'torrent/cache/beta.example/beta-hash')
    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalledWith('成功删除 2 个缓存项'))
    await waitFor(() => expect(screen.getByLabelText('缓存选择集合')).toHaveTextContent('[]'))
    expect(screen.getByLabelText('缓存加载状态')).toHaveTextContent('false')
  })

  it('deletes every selected site entry when the backend returns the same content hash for multiple domains', async () => {
    const duplicatedAcrossSites = [
      createCacheItem({ domain: 'alpha.example', hash: 'shared-hash', site_name: 'Alpha Tracker' }),
      createCacheItem({
        domain: 'beta.example',
        hash: 'shared-hash',
        site_name: 'Beta Tracker',
        title: 'Alpha.Movie.2026',
      }),
    ]
    mocks.apiGet.mockResolvedValueOnce(success(createCacheData(duplicatedAcrossSites)))
    await renderCache()
    await waitForInitialLoad()

    await fireEvent.click(screen.getByRole('button', { name: '选择当前结果' }))
    expect(screen.getByLabelText('缓存选择集合')).toHaveTextContent(
      '[["alpha.example","shared-hash"],["beta.example","shared-hash"]]',
    )
    await fireEvent.click(getIconButton('mdi-delete-sweep-outline'))

    await waitFor(() => expect(mocks.apiDelete).toHaveBeenCalledTimes(2))
    expect(mocks.apiDelete).toHaveBeenCalledWith('torrent/cache/alpha.example/shared-hash')
    expect(mocks.apiDelete).toHaveBeenCalledWith('torrent/cache/beta.example/shared-hash')
  })

  it('keeps selections and restores loading when one selected deletion is a business failure', async () => {
    mocks.apiDelete.mockImplementation(endpoint =>
      Promise.resolve(endpoint === 'torrent/cache/beta.example/beta-hash' ? businessFailure('未找到') : success(null)),
    )
    await renderCache()
    await waitForInitialLoad()
    await fireEvent.click(screen.getByRole('button', { name: '选择当前结果' }))

    await fireEvent.click(getIconButton('mdi-delete-sweep-outline'))

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('删除缓存项失败'))
    expect(mocks.apiDelete).toHaveBeenCalledTimes(2)
    expect(mocks.apiGet).toHaveBeenCalledTimes(1)
    expect(screen.getByLabelText('缓存选择集合')).toHaveTextContent(
      '[["alpha.example","alpha-hash"],["beta.example","beta-hash"]]',
    )
    expect(screen.getByLabelText('缓存加载状态')).toHaveTextContent('false')
    expect(mocks.toastSuccess).not.toHaveBeenCalled()
  })

  it('recovers from a single-delete HTTP failure and succeeds on retry', async () => {
    mocks.apiDelete.mockRejectedValueOnce(new Error('network down')).mockResolvedValueOnce(success(null))
    mocks.apiGet
      .mockResolvedValueOnce(success(createCacheData(initialItems)))
      .mockResolvedValueOnce(success(createCacheData([initialItems[1]])))
    await renderCache()
    await waitForInitialLoad()
    await fireEvent.click(screen.getByRole('button', { name: '选择当前结果' }))

    const firstItem = screen.getByText('Alpha.Movie.2026').closest('article')
    expect(firstItem).not.toBeNull()
    const deleteButton = within(firstItem as HTMLElement)
      .getByText('mdi-delete')
      .closest('button') as HTMLButtonElement
    await fireEvent.click(deleteButton)

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('删除缓存项失败'))
    expect(screen.getByText('Alpha.Movie.2026')).toBeInTheDocument()
    expect(screen.getByLabelText('缓存加载状态')).toHaveTextContent('false')

    await fireEvent.click(deleteButton)

    await waitFor(() => expect(mocks.apiDelete).toHaveBeenNthCalledWith(2, 'torrent/cache/alpha.example/alpha-hash'))
    expect(await screen.findByText('Beta.Show.S01')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByText('Alpha.Movie.2026')).not.toBeInTheDocument())
    expect(screen.getByLabelText('缓存选择集合')).toHaveTextContent('[["beta.example","beta-hash"]]')
    expect(mocks.toastSuccess).toHaveBeenCalledWith('缓存项删除成功')
  })
})

describe('CacheView reidentification', () => {
  const item = createCacheItem({
    media_source: 'doubanmusic',
    music_type: 'album',
    site_name: 'Alpha Tracker',
  })

  beforeEach(() => {
    mocks.apiDelete.mockReset().mockResolvedValue(success(null))
    mocks.apiGet.mockReset().mockResolvedValue(success(createCacheData([item])))
    mocks.apiPost.mockReset().mockResolvedValue(success(null))
    mocks.confirm.mockReset().mockResolvedValue(true)
    mocks.mobile = false
    mocks.openSharedDialog.mockReset().mockReturnValue(createDialogController())
    mocks.toastError.mockReset()
    mocks.toastSuccess.mockReset()
    mocks.toastWarning.mockReset()
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  it('opens with the item source/type and forwards explicit identity while exposing dialog loading', async () => {
    const controller = createDialogController()
    const reidentifyRequest = deferred<ReturnType<typeof success<null>>>()
    mocks.openSharedDialog.mockReturnValue(controller)
    mocks.apiPost.mockReturnValueOnce(reidentifyRequest.promise)
    mocks.apiGet
      .mockResolvedValueOnce(success(createCacheData([item])))
      .mockResolvedValueOnce(success(createCacheData([item])))
    await renderCache()
    await waitForInitialLoad()

    await fireEvent.click(getIconButton('mdi-text-recognition'))
    const [, dialogProps, dialogEvents] = mocks.openSharedDialog.mock.calls[0] as [
      unknown,
      Record<string, unknown>,
      Record<string, (payload?: unknown) => Promise<void> | void>,
    ]
    expect(dialogProps).toMatchObject({
      itemTitle: 'Alpha.Movie.2026',
      loading: false,
      musicType: 'album',
      recognizeSource: 'doubanmusic',
    })

    const action = dialogEvents.confirm({ mediaId: 'music-42', mediaSource: 'musicbrainz', musicType: 'album' })
    await waitFor(() => expect(controller.updateProps).toHaveBeenCalledWith({ loading: true }))
    expect(screen.getByLabelText('缓存加载状态')).toHaveTextContent('true')

    reidentifyRequest.resolve(success(null))
    await action

    expect(mocks.apiPost).toHaveBeenCalledWith('torrent/cache/reidentify/alpha.example/alpha-hash', null, {
      params: { media_id: 'music-42', media_source: 'musicbrainz', music_type: 'album' },
    })
    expect(mocks.toastSuccess).toHaveBeenCalledWith('重新识别完成')
    expect(mocks.apiGet).toHaveBeenCalledTimes(2)
    expect(controller.close).toHaveBeenCalledOnce()
    expect(screen.getByLabelText('缓存加载状态')).toHaveTextContent('false')
  })

  it('falls back to the global source and omits an unpaired source while preserving music type', async () => {
    const itemWithoutIdentity = createCacheItem({ media_source: undefined, music_type: undefined })
    mocks.apiGet.mockResolvedValue(success(createCacheData([itemWithoutIdentity])))
    await renderCache()
    await waitForInitialLoad()

    await fireEvent.click(getIconButton('mdi-text-recognition'))
    const [, dialogProps, dialogEvents] = mocks.openSharedDialog.mock.calls[0] as [
      unknown,
      Record<string, unknown>,
      Record<string, (payload?: unknown) => Promise<void> | void>,
    ]
    expect(dialogProps).toMatchObject({ musicType: 'recording', recognizeSource: 'themoviedb' })

    await dialogEvents.confirm({ mediaSource: 'douban', musicType: 'recording' })

    expect(mocks.apiPost).toHaveBeenCalledWith('torrent/cache/reidentify/alpha.example/alpha-hash', null, {
      params: { music_type: 'recording' },
    })
  })

  it.each([
    ['业务失败', () => mocks.apiPost.mockResolvedValueOnce(businessFailure('重新识别失败'))],
    ['HTTP 失败', () => mocks.apiPost.mockRejectedValueOnce(new Error('network down'))],
  ])('keeps the dialog open and restores loading after a reidentification %s', async (_label, arrangeFailure) => {
    const controller = createDialogController()
    mocks.openSharedDialog.mockReturnValue(controller)
    arrangeFailure()
    await renderCache()
    await waitForInitialLoad()
    await fireEvent.click(getIconButton('mdi-text-recognition'))
    const dialogEvents = mocks.openSharedDialog.mock.calls[0]?.[2] as Record<
      string,
      (payload?: unknown) => Promise<void> | void
    >

    await dialogEvents.confirm({})

    expect(mocks.toastError).toHaveBeenCalledWith('重新识别失败')
    expect(controller.close).not.toHaveBeenCalled()
    expect(controller.updateProps).toHaveBeenNthCalledWith(1, { loading: true })
    expect(controller.updateProps).toHaveBeenLastCalledWith({ loading: false })
    expect(mocks.apiGet).toHaveBeenCalledTimes(1)
    expect(screen.getByLabelText('缓存加载状态')).toHaveTextContent('false')
  })
})
