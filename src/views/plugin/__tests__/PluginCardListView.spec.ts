import type { Plugin, PluginRating, PluginRuntimeSummary, PluginSourceOptions } from '@/api/types'
import type { DynamicButtonMenuItem } from '@/composables/useDynamicButton'
import PluginCardListView from '@/views/plugin/PluginCardListView.vue'
import { usePluginSidebarNavStore } from '@/stores/pluginSidebarNav'
import { usePluginRuntimeStore } from '@/stores/pluginRuntime'
import { DEFAULT_PERMISSIONS } from '@/utils/permission'
import { getActiveRequestsCount } from '@/utils/requestOptimizer'
import { fireEvent, screen, waitFor, within } from '@testing-library/vue'
import { server } from '@tests/support/msw/server'
import { renderWithProviders } from '@tests/support/render'
import { HttpResponse, http, type JsonBodyType } from 'msw'
import { apiFailureJson, apiJson } from '@tests/support/msw/response'
import { computed, defineComponent, h, nextTick, unref, type ComputedRef, type PropType, type Ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const API_BASE_URL = 'http://localhost/api/v1/'
const apiUrls = {
  folders: new URL('plugin/folders', API_BASE_URL).href,
  install: (pluginId: string) => new URL(`plugin/install/${pluginId}`, API_BASE_URL).href,
  list: new URL('plugin/', API_BASE_URL).href,
  order: new URL('user/config/PluginOrder', API_BASE_URL).href,
  rating: new URL('plugin/rating', API_BASE_URL).href,
  runtime: new URL('plugin/runtime', API_BASE_URL).href,
  sidebar: new URL('plugin/sidebar_nav', API_BASE_URL).href,
  sourceOptions: new URL('plugin/source/:pluginId/options', API_BASE_URL).href,
  sourceBind: (pluginId: string) => new URL(`plugin/source/${pluginId}/install`, API_BASE_URL).href,
  sourceChange: (pluginId: string) => new URL(`plugin/source/${pluginId}`, API_BASE_URL).href,
  statistic: new URL('plugin/statistic', API_BASE_URL).href,
}

const mocks = vi.hoisted(() => ({
  appMode: false,
  keepAliveHandler: undefined as undefined | ((context?: Record<string, unknown>) => Promise<void>),
  infiniteDone: vi.fn(),
  openSharedDialog: vi.fn(),
  registerHeaderTab: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  toastWarning: vi.fn(),
  useDynamicButton: vi.fn(),
}))

vi.mock('vue-toastification', () => ({
  useToast: () => ({ error: mocks.toastError, success: mocks.toastSuccess, warning: mocks.toastWarning }),
}))

vi.mock('@/composables/useDynamicButton', () => ({
  useDynamicButton: (options: unknown) => mocks.useDynamicButton(options),
}))

vi.mock('@/composables/useDynamicHeaderTab', () => ({
  useDynamicHeaderTab: () => ({ registerHeaderTab: mocks.registerHeaderTab }),
}))

vi.mock('@/composables/useKeepAliveRefresh', () => ({
  useKeepAliveRefresh: (handler: (context?: Record<string, unknown>) => Promise<void>) => {
    mocks.keepAliveHandler = handler
    return { refresh: handler }
  },
}))

vi.mock('@/@core/utils/image', () => ({
  extractDominantColor: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/composables/usePWA', () => ({
  usePWA: () => ({ appMode: computed(() => mocks.appMode) }),
}))

vi.mock('@/composables/useSharedDialog', () => ({
  openSharedDialog: (...args: unknown[]) => mocks.openSharedDialog(...args),
}))

type MaybeRef<T> = T | Ref<T> | ComputedRef<T>

interface HeaderButton {
  action?: () => void | Promise<void>
  dataAttr?: string
  icon: string
}

interface HeaderConfig {
  appendButtons: HeaderButton[]
  modelValue: Ref<string>
}

interface DynamicButtonConfig {
  menuItems?: MaybeRef<DynamicButtonMenuItem[] | undefined>
  onClick: () => void
}

interface Deferred<T> {
  promise: Promise<T>
  resolve: (value: T) => void
}

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(nextResolve => {
    resolve = nextResolve
  })
  return { promise, resolve }
}

function createPlugin(overrides: Partial<Plugin> = {}): Plugin {
  return {
    id: 'DemoPlugin',
    plugin_name: '演示插件',
    plugin_author: 'MoviePilot',
    plugin_desc: '插件市场测试数据',
    plugin_label: '工具,整理',
    plugin_version: '1.0.0',
    repo_url: 'https://github.com/example/plugins',
    ...overrides,
  }
}

const PassthroughStub = defineComponent({
  name: 'PassthroughStub',
  setup(_props, { slots }) {
    return () => h('div', slots.default?.())
  },
})

const ProgressiveCardGridStub = defineComponent({
  name: 'ProgressiveCardGrid',
  props: {
    getItemKey: { type: Function as PropType<(item: unknown) => string>, default: undefined },
    items: { type: Array as PropType<unknown[]>, required: true },
    scrollToIndex: { type: Number, default: undefined },
  },
  setup(props, { slots }) {
    return () =>
      h(
        'section',
        { 'data-scroll-to-index': props.scrollToIndex ?? '' },
        props.items.flatMap(item => {
          props.getItemKey?.(item)
          return slots.default?.({ item }) ?? []
        }),
      )
  },
})

const PluginMixedSortCardStub = defineComponent({
  name: 'PluginMixedSortCard',
  props: {
    item: { type: Object as PropType<Record<string, unknown>>, required: true },
    pluginStatistics: { type: Object as PropType<Record<string, number>>, default: () => ({}) },
    runtimeSettling: Boolean,
    installing: Boolean,
    updating: Boolean,
    sortable: Boolean,
  },
  emits: [
    'delete-folder',
    'drop-to-folder',
    'open-folder',
    'rating',
    'refresh-data',
    'rename-folder',
    'remove-from-folder',
    'source-transition',
    'update',
    'update-folder-config',
  ],
  setup(props, { emit }) {
    return () => {
      const item = props.item
      const type = String(item.type)
      const id = String(item.id)
      const data = item.data as
        | {
            average_rating?: number
            config?: { color?: string }
            has_update?: boolean
            plugin_name?: string
            page_open?: boolean
            repo_url?: string
            runtime_status?: Plugin['runtime_status']
            update_candidate?: Plugin['update_candidate']
          }
        | undefined
      const name = type === 'folder' ? id : data?.plugin_name || id
      const dropTarget = document.createElement('div')
      dropTarget.classList.add('drag-over')

      return h('article', { 'data-testid': `${type}-${id}` }, [
        h('span', `${type}:${name}`),
        h('output', { 'aria-label': `sortable-${id}` }, String(props.sortable)),
        type === 'plugin'
          ? h('output', { 'aria-label': `update-${id}` }, String(data?.has_update ?? false))
          : h('output', { 'aria-label': `folder-color-${id}` }, data?.config?.color || ''),
        type === 'plugin' ? h('output', { 'aria-label': `repo-${id}` }, data?.repo_url || '') : null,
        type === 'plugin'
          ? h('output', { 'aria-label': `update-source-${id}` }, data?.update_candidate?.source_key || '')
          : null,
        type === 'plugin' ? h('output', { 'aria-label': `runtime-${id}` }, data?.runtime_status || '') : null,
        type === 'plugin' ? h('output', { 'aria-label': `page-open-${id}` }, String(data?.page_open ?? false)) : null,
        type === 'plugin' ? h('output', { 'aria-label': `settling-${id}` }, String(props.runtimeSettling)) : null,
        type === 'plugin' ? h('output', { 'aria-label': `installing-${id}` }, String(props.installing)) : null,
        type === 'plugin' ? h('output', { 'aria-label': `updating-${id}` }, String(props.updating)) : null,
        type === 'plugin'
          ? h('output', { 'aria-label': `statistic-${id}` }, String(props.pluginStatistics[id] ?? ''))
          : null,
        type === 'plugin'
          ? h('output', { 'aria-label': `installed-rating-${id}` }, String(data?.average_rating ?? ''))
          : null,
        type === 'folder'
          ? h('button', { onClick: () => emit('open-folder', id), type: 'button' }, `open-folder-${id}`)
          : h('button', { onClick: () => emit('refresh-data'), type: 'button' }, `refresh-plugin-${id}`),
        type === 'plugin'
          ? h('button', { onClick: () => emit('update', data), type: 'button' }, `update-plugin-${id}`)
          : null,
        type === 'folder'
          ? h(
              'button',
              { onClick: () => emit('update-folder-config', id, { color: '#ff0000' }), type: 'button' },
              `configure-folder-${id}`,
            )
          : null,
        type === 'folder'
          ? h(
              'button',
              { onClick: () => emit('rename-folder', id, `${id}-renamed`), type: 'button' },
              `rename-folder-${id}`,
            )
          : null,
        type === 'folder'
          ? h('button', { onClick: () => emit('delete-folder', id), type: 'button' }, `delete-folder-${id}`)
          : null,
        type === 'folder'
          ? h(
              'button',
              {
                onClick: () =>
                  emit(
                    'drop-to-folder',
                    { currentTarget: dropTarget, preventDefault: vi.fn(), stopPropagation: vi.fn() },
                    id,
                  ),
                type: 'button',
              },
              `drop-to-folder-${id}`,
            )
          : null,
        type === 'plugin'
          ? h('button', { onClick: () => emit('remove-from-folder', id), type: 'button' }, `remove-plugin-${id}`)
          : null,
        type === 'plugin'
          ? h(
              'button',
              {
                onClick: () =>
                  emit('source-transition', data, {
                    action: 'change',
                    expected_revision: 7,
                    repo_url: 'https://github.com/example/target',
                  }),
                type: 'button',
              },
              `change-source-${id}`,
            )
          : null,
        type === 'plugin'
          ? h(
              'button',
              {
                onClick: () =>
                  emit('source-transition', data, {
                    action: 'bind',
                    repo_url: 'https://github.com/example/target',
                  }),
                type: 'button',
              },
              `bind-source-${id}`,
            )
          : null,
        type === 'plugin'
          ? h(
              'button',
              {
                onClick: () =>
                  emit('rating', {
                    average_rating: 4.7,
                    plugin_id: id,
                    rating_count: 10,
                    user_rating: 5,
                  } satisfies PluginRating),
                type: 'button',
              },
              `rate-plugin-${id}`,
            )
          : null,
      ])
    }
  },
})

const PluginAppCardStub = defineComponent({
  name: 'PluginAppCard',
  props: {
    plugin: { type: Object as PropType<Plugin>, required: true },
    installHandler: Function as PropType<() => unknown>,
  },
  emits: ['install'],
  setup(props, { emit }) {
    return () =>
      h('article', { 'data-testid': `market-${props.plugin.id}` }, [
        h('span', `market:${props.plugin.plugin_name}`),
        h('output', { 'aria-label': `rating-${props.plugin.id}` }, String(props.plugin.average_rating ?? '')),
        h(
          'button',
          {
            onClick: () => (props.installHandler ? props.installHandler() : emit('install')),
            type: 'button',
          },
          `installed-${props.plugin.id}`,
        ),
      ])
  },
})

const DraggableStub = defineComponent({
  name: 'Draggable',
  props: { modelValue: { type: Array as PropType<unknown[]>, required: true } },
  emits: ['end', 'start', 'update:modelValue'],
  setup(props, { emit, slots }) {
    async function reverse() {
      emit('update:modelValue', [...props.modelValue].reverse())
      await nextTick()
      emit('end')
    }

    return () =>
      h('section', [
        ...props.modelValue.flatMap(element => slots.item?.({ element }) ?? []),
        h('button', { onClick: reverse, type: 'button' }, 'reverse-plugin-order'),
        ...props.modelValue.map((_item, index) =>
          h(
            'button',
            { onClick: () => emit('start', { oldIndex: index }), type: 'button' },
            `start-plugin-drag-${index}`,
          ),
        ),
        h('button', { onClick: () => emit('end'), type: 'button' }, 'finish-plugin-drag'),
      ])
  },
})

const LoadingBannerStub = defineComponent({
  name: 'LoadingBanner',
  template: '<div role="status">正在加载插件</div>',
})

const NoDataFoundStub = defineComponent({
  name: 'NoDataFound',
  props: { errorDescription: String, errorTitle: String },
  template: '<section aria-label="插件空态">{{ errorTitle }} {{ errorDescription }}<slot name="button" /></section>',
})

const InfiniteScrollStub = defineComponent({
  name: 'VInfiniteScroll',
  emits: ['load'],
  setup(_props, { emit, slots }) {
    return () =>
      h('section', [
        slots.default?.(),
        h('button', { onClick: () => emit('load', { done: mocks.infiniteDone }), type: 'button' }, 'load-more-market'),
      ])
  },
})

const FieldStub = defineComponent({
  name: 'FieldStub',
  inheritAttrs: false,
  props: { label: String, modelValue: [String, Number], placeholder: String },
  emits: ['keyup', 'update:modelValue'],
  setup(props, { emit }) {
    return () =>
      h('input', {
        'aria-label': props.label || props.placeholder,
        value: props.modelValue,
        onInput: (event: Event) => emit('update:modelValue', (event.target as HTMLInputElement).value),
        onKeyup: (event: KeyboardEvent) => emit('keyup', event),
      })
  },
})

const SelectStub = defineComponent({
  name: 'VSelect',
  props: {
    items: { type: Array as PropType<string[]>, default: () => [] },
    label: String,
    modelValue: { type: Array as PropType<string[]>, default: () => [] },
  },
  emits: ['update:modelValue'],
  setup(props, { emit }) {
    return () =>
      h('fieldset', { 'aria-label': props.label }, [
        ...props.items.map(item =>
          h(
            'button',
            {
              onClick: () =>
                emit(
                  'update:modelValue',
                  props.modelValue.includes(item)
                    ? props.modelValue.filter(value => value !== item)
                    : [...props.modelValue, item],
                ),
              type: 'button',
            },
            item,
          ),
        ),
      ])
  },
})

interface ListResponses {
  folders?: () => JsonBodyType | Promise<JsonBodyType>
  installed?: () => Plugin[] | Promise<Plugin[]>
  installedStatus?: number
  market?: () => Plugin[] | Promise<Plugin[]>
  marketStatus?: number
  order?: unknown[]
  rating?: (ids: string[]) => Record<string, PluginRating> | Promise<Record<string, PluginRating>>
  runtime?: () => PluginRuntimeSummary | Promise<PluginRuntimeSummary>
  sourceOptions?: (pluginId: string) => PluginSourceOptions | Promise<PluginSourceOptions>
  statistic?: () => Record<string, number> | Promise<Record<string, number>>
}

function registerListHandlers(responses: ListResponses = {}) {
  server.use(
    http.get(apiUrls.order, () => apiJson({ value: responses.order ?? [] })),
    http.get(apiUrls.folders, async () => apiJson((await responses.folders?.()) ?? {})),
    http.get(apiUrls.list, async ({ request }) => {
      const state = new URL(request.url).searchParams.get('state')
      const plugins = state === 'installed' ? await responses.installed?.() : await responses.market?.()
      return apiJson((plugins ?? []) as unknown as JsonBodyType, {
        status: state === 'installed' ? (responses.installedStatus ?? 200) : (responses.marketStatus ?? 200),
      })
    }),
    http.get(apiUrls.statistic, async () => apiJson((await responses.statistic?.()) ?? {})),
    http.get(apiUrls.runtime, async () =>
      apiJson(
        (await responses.runtime?.()) ?? {
          failed_count: 0,
          generation: 0,
          pending_count: 0,
          ready: true,
          restart_required_plugin_ids: [],
        },
      ),
    ),
    http.get(apiUrls.sidebar, () => apiJson([])),
    http.get(apiUrls.sourceOptions, async ({ params }) => {
      const pluginId = String(params.pluginId)
      return apiJson(
        ((await responses.sourceOptions?.(pluginId)) ?? {
          plugin_id: pluginId,
          inventory_complete: true,
          selection_status: 'selected',
          selection_reason: '唯一在线来源',
          identity: null,
          candidates: [
            {
              source_type: 'third_party',
              source_key: 'github:example/plugins',
              repo_url: 'https://github.com/example/plugins',
              package_generation: 'v3',
              plugin_version: '1.0.0',
            },
          ],
        }) as unknown as JsonBodyType,
      )
    }),
    http.get(apiUrls.rating, async ({ request }) => {
      const ids = new URL(request.url).searchParams.get('plugin_ids')?.split(',').filter(Boolean) ?? []
      return apiJson(((await responses.rating?.(ids)) ?? {}) as unknown as JsonBodyType)
    }),
  )
}

async function renderList(responses: ListResponses = {}, options: { superUser?: boolean } = {}) {
  registerListHandlers(responses)
  return renderWithProviders(PluginCardListView, {
    initialRoute: '/plugins',
    initialState: {
      user: {
        permissions: DEFAULT_PERMISSIONS,
        superUser: options.superUser ?? true,
      },
    },
    global: {
      stubs: {
        LoadingBanner: LoadingBannerStub,
        NoDataFound: NoDataFoundStub,
        PluginAppCard: PluginAppCardStub,
        PluginMixedSortCard: PluginMixedSortCardStub,
        ProgressiveCardGrid: ProgressiveCardGridStub,
        VCombobox: FieldStub,
        VInfiniteScroll: InfiniteScrollStub,
        VMenu: PassthroughStub,
        VSelect: SelectStub,
        VTextField: FieldStub,
        VPageContentTitle: true,
        VWindow: PassthroughStub,
        VWindowItem: PassthroughStub,
        draggable: DraggableStub,
      },
    },
  })
}

function getHeaderConfig() {
  return mocks.registerHeaderTab.mock.calls.at(-1)?.[0] as HeaderConfig
}

function getDynamicButtonConfig() {
  return mocks.useDynamicButton.mock.calls.at(-1)?.[0] as DynamicButtonConfig
}

function getDynamicMenuItem(titleKey: string) {
  const item = unref(getDynamicButtonConfig().menuItems)?.find(candidate => candidate.titleKey === titleKey)
  if (!item) throw new Error(`未注册动态操作 ${titleKey}`)
  return item
}

function getHeaderButton(icon: string) {
  const button = getHeaderConfig().appendButtons.find(candidate => candidate.icon === icon)
  if (!button?.action) throw new Error(`未注册 header 操作 ${icon}`)
  return button
}

function getInstalledLabels() {
  return [...document.querySelectorAll('[data-testid^="folder-"], [data-testid^="plugin-"]')].map(
    node => node.querySelector('span')?.textContent,
  )
}

function getDialogEvents(index = -1) {
  const call = mocks.openSharedDialog.mock.calls.at(index)
  if (!call) throw new Error('未打开共享弹窗')
  return call[2] as Record<string, (...args: unknown[]) => unknown>
}

function getDialogProps(index = -1) {
  const call = mocks.openSharedDialog.mock.calls.at(index)
  if (!call) throw new Error('未打开共享弹窗')
  return call[1] as { plugin?: Plugin; installHandler?: (...args: unknown[]) => unknown }
}

async function waitForRequestsToFinish() {
  await new Promise(resolve => setTimeout(resolve, 0))
  await waitFor(() => expect(getActiveRequestsCount()).toBe(0))
  await new Promise(resolve => setTimeout(resolve, 0))
  expect(getActiveRequestsCount()).toBe(0)
}

describe('PluginCardListView loading and request ownership', () => {
  beforeEach(() => {
    mocks.appMode = false
    mocks.keepAliveHandler = undefined
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('keeps the newest forced market response when the older ordinary request finishes last', async () => {
    const older = createDeferred<Plugin[]>()
    const newer = createDeferred<Plugin[]>()
    let marketRequest = 0
    await renderList({
      installed: () => [createPlugin({ id: 'Installed', installed: true, plugin_name: '已安装插件' })],
      market: () => (marketRequest++ === 0 ? older.promise : newer.promise),
    })

    await waitFor(() => expect(marketRequest).toBe(1))
    await getHeaderConfig()
      .appendButtons.find(button => button.icon === 'mdi-refresh')
      ?.action?.()
    await waitFor(() => expect(marketRequest).toBe(2))

    newer.resolve([createPlugin({ id: 'Newest', plugin_name: '最新市场插件' })])
    expect(await screen.findByText('market:最新市场插件')).toBeInTheDocument()

    older.resolve([createPlugin({ id: 'Stale', plugin_name: '过期市场插件' })])
    await waitForRequestsToFinish()
    expect(screen.queryByText('market:过期市场插件')).not.toBeInTheDocument()
    expect(screen.getByText('market:最新市场插件')).toBeInTheDocument()
  })

  it('keeps the newest installed response when an older refresh finishes last', async () => {
    const older = createDeferred<Plugin[]>()
    const newer = createDeferred<Plugin[]>()
    let installedRequest = 0
    await renderList({
      installed: () => (installedRequest++ === 0 ? older.promise : newer.promise),
    })

    await waitFor(() => expect(installedRequest).toBe(1))
    if (!mocks.keepAliveHandler) throw new Error('未注册 keep-alive 刷新回调')
    const newestRefresh = mocks.keepAliveHandler({ source: 'resume' })
    await waitFor(() => expect(installedRequest).toBe(2))

    newer.resolve([createPlugin({ id: 'NewestInstalled', installed: true, plugin_name: '最新已安装快照' })])
    expect(await screen.findByText('plugin:最新已安装快照')).toBeInTheDocument()
    await newestRefresh

    older.resolve([createPlugin({ id: 'StaleInstalled', installed: true, plugin_name: '过期已安装快照' })])
    await waitForRequestsToFinish()
    expect(screen.queryByText('plugin:过期已安装快照')).not.toBeInTheDocument()
    expect(screen.getByText('plugin:最新已安装快照')).toBeInTheDocument()
  })

  it('keeps rating and statistic results from the newest refresh generation', async () => {
    const olderRatings = createDeferred<Record<string, PluginRating>>()
    const newerRatings = createDeferred<Record<string, PluginRating>>()
    const olderStatistics = createDeferred<Record<string, number>>()
    const newerStatistics = createDeferred<Record<string, number>>()
    let ratingRequest = 0
    let statisticRequest = 0
    await renderList({
      installed: () => [createPlugin({ id: 'Installed', installed: true, plugin_name: '已安装插件' })],
      rating: () => {
        ratingRequest += 1
        if (ratingRequest === 1) {
          return { Installed: { average_rating: 3, plugin_id: 'Installed', rating_count: 1 } }
        }
        return ratingRequest === 2 ? olderRatings.promise : newerRatings.promise
      },
      statistic: () => {
        statisticRequest += 1
        if (statisticRequest === 1) return { Installed: 1 }
        return statisticRequest === 2 ? olderStatistics.promise : newerStatistics.promise
      },
    })
    await waitForRequestsToFinish()

    if (!mocks.keepAliveHandler) throw new Error('未注册 keep-alive 刷新回调')
    const olderRefresh = mocks.keepAliveHandler({ source: 'resume' })
    await waitFor(() => {
      expect(ratingRequest).toBe(2)
      expect(statisticRequest).toBe(2)
    })
    const newerRefresh = mocks.keepAliveHandler({ source: 'resume' })
    await waitFor(() => {
      expect(ratingRequest).toBe(3)
      expect(statisticRequest).toBe(3)
    })

    newerRatings.resolve({ Installed: { average_rating: 4.9, plugin_id: 'Installed', rating_count: 9 } })
    newerStatistics.resolve({ Installed: 99 })
    await newerRefresh
    expect(screen.getByLabelText('installed-rating-Installed')).toHaveTextContent('4.9')
    expect(screen.getByLabelText('statistic-Installed')).toHaveTextContent('99')

    olderRatings.resolve({ Installed: { average_rating: 1, plugin_id: 'Installed', rating_count: 1 } })
    olderStatistics.resolve({ Installed: 2 })
    await olderRefresh
    await waitForRequestsToFinish()
    expect(screen.getByLabelText('installed-rating-Installed')).toHaveTextContent('4.9')
    expect(screen.getByLabelText('statistic-Installed')).toHaveTextContent('99')
  })

  it('updates only the submitted plugin from the POST result without reloading market metrics', async () => {
    let ratingRequest = 0
    let statisticRequest = 0
    await renderList({
      installed: () => [createPlugin({ id: 'Installed', installed: true, plugin_name: '已安装插件' })],
      rating: () => {
        ratingRequest += 1
        return { Installed: { average_rating: 3, plugin_id: 'Installed', rating_count: 1 } }
      },
      statistic: () => {
        statisticRequest += 1
        return { Installed: 24 }
      },
    })
    await waitForRequestsToFinish()

    expect(ratingRequest).toBe(1)
    expect(statisticRequest).toBe(1)
    await fireEvent.click(screen.getByRole('button', { name: 'rate-plugin-Installed' }))

    expect(screen.getByLabelText('installed-rating-Installed')).toHaveTextContent('4.7')
    expect(ratingRequest).toBe(1)
    expect(statisticRequest).toBe(1)
  })

  it('keeps the previous rating visible while a tab refresh loads the next rating snapshot', async () => {
    const refreshedRatings = createDeferred<Record<string, PluginRating>>()
    let ratingRequest = 0
    await renderList({
      installed: () => [createPlugin({ id: 'Installed', installed: true, plugin_name: '已安装插件' })],
      rating: () => {
        ratingRequest += 1
        if (ratingRequest === 1) {
          return { Installed: { average_rating: 4.2, plugin_id: 'Installed', rating_count: 3 } }
        }
        return refreshedRatings.promise
      },
    })
    await waitForRequestsToFinish()

    if (!mocks.keepAliveHandler) throw new Error('未注册 keep-alive 刷新回调')
    const refresh = mocks.keepAliveHandler({ silent: true, source: 'tab' })
    await waitFor(() => expect(ratingRequest).toBe(2))
    expect(screen.getByLabelText('installed-rating-Installed')).toHaveTextContent('4.2')

    refreshedRatings.resolve({
      Installed: { average_rating: 4.8, plugin_id: 'Installed', rating_count: 4 },
    })
    await refresh
    expect(screen.getByLabelText('installed-rating-Installed')).toHaveTextContent('4.8')
  })

  it('rejects a rating snapshot when the current plugin ID set changes before the next rating request', async () => {
    const staleRatings = createDeferred<Record<string, PluginRating>>()
    const currentMarket = createDeferred<Plugin[]>()
    let installedRequest = 0
    let marketRequest = 0
    let ratingRequest = 0
    await renderList({
      installed: () => {
        installedRequest += 1
        if (installedRequest === 1) {
          return [createPlugin({ average_rating: 4, id: 'Shared', installed: true, plugin_name: '共享插件' })]
        }
        if (installedRequest === 2) {
          return [
            createPlugin({ average_rating: 4.2, id: 'Shared', installed: true, plugin_name: '共享插件' }),
            createPlugin({ id: 'Removed', installed: true, plugin_name: '即将移除' }),
          ]
        }
        return [
          createPlugin({ average_rating: 4.6, id: 'Shared', installed: true, plugin_name: '共享插件' }),
          createPlugin({ id: 'Added', installed: true, plugin_name: '当前新增' }),
        ]
      },
      market: () => {
        marketRequest += 1
        return marketRequest === 3 ? currentMarket.promise : []
      },
      rating: () => {
        ratingRequest += 1
        if (ratingRequest === 1) {
          return { Shared: { average_rating: 4, plugin_id: 'Shared', rating_count: 1 } }
        }
        if (ratingRequest === 2) return staleRatings.promise
        return { Shared: { average_rating: 4.9, plugin_id: 'Shared', rating_count: 9 } }
      },
    })
    await waitForRequestsToFinish()

    if (!mocks.keepAliveHandler) throw new Error('未注册 keep-alive 刷新回调')
    const staleRefresh = mocks.keepAliveHandler({ source: 'resume' })
    await waitFor(() => expect(ratingRequest).toBe(2))

    const currentRefresh = mocks.keepAliveHandler({ source: 'resume' })
    expect(await screen.findByText('plugin:当前新增')).toBeInTheDocument()
    await waitFor(() => expect(marketRequest).toBe(3))

    staleRatings.resolve({
      Removed: { average_rating: 1, plugin_id: 'Removed', rating_count: 1 },
      Shared: { average_rating: 1, plugin_id: 'Shared', rating_count: 1 },
    })
    await staleRefresh
    expect(screen.getByLabelText('installed-rating-Shared')).toHaveTextContent('4.6')

    currentMarket.resolve([])
    await currentRefresh
    expect(screen.getByLabelText('installed-rating-Shared')).toHaveTextContent('4.9')
    await waitForRequestsToFinish()
  })

  it('merges update metadata into installed cards and excludes update entries from the market list', async () => {
    await renderList({
      installed: () => [
        createPlugin({ id: 'Shared', installed: true, plugin_name: '已安装共享插件', repo_url: 'old/repo' }),
      ],
      market: () => [
        createPlugin({
          has_update: true,
          id: 'Shared',
          installed: true,
          plugin_name: '市场更新项',
          repo_url: 'new/repo',
        }),
        createPlugin({ id: 'Available', plugin_name: '可安装插件' }),
      ],
    })

    await waitFor(() => expect(screen.getByLabelText('update-Shared')).toHaveTextContent('true'))
    expect(screen.getByLabelText('repo-Shared')).toHaveTextContent('new/repo')
    expect(screen.queryByText('market:市场更新项')).not.toBeInTheDocument()
    expect(screen.getByText('market:可安装插件')).toBeInTheDocument()
    await waitForRequestsToFinish()
  })

  it('clears the installed update marker after a successful update refresh removes the market entry', async () => {
    let marketRequest = 0
    await renderList({
      installed: () => [createPlugin({ id: 'Shared', installed: true, plugin_name: '已更新插件' })],
      market: () => {
        marketRequest += 1
        return marketRequest === 1
          ? [
              createPlugin({
                has_update: true,
                id: 'Shared',
                installed: true,
                plugin_name: '待更新插件',
                update_candidate: {
                  source_type: 'official',
                  source_key: 'github:jxxghp/moviepilot-plugins',
                  repo_url: 'https://github.com/jxxghp/MoviePilot-Plugins',
                  version: '2.0.0',
                  is_bound: false,
                },
              }),
            ]
          : []
      },
    })

    await waitFor(() => expect(screen.getByLabelText('update-Shared')).toHaveTextContent('true'))
    expect(screen.getByLabelText('update-source-Shared')).toHaveTextContent('github:jxxghp/moviepilot-plugins')
    await fireEvent.click(screen.getByRole('button', { name: 'refresh-plugin-Shared' }))

    await waitFor(() => expect(screen.getByLabelText('update-Shared')).toHaveTextContent('false'))
    expect(screen.getByLabelText('update-source-Shared')).toBeEmptyDOMElement()
    expect(marketRequest).toBe(2)
    await waitForRequestsToFinish()
  })

  it('keeps an initial installed failure retryable instead of presenting a successful empty list', async () => {
    await renderList({ installedStatus: 500 })

    expect(await screen.findByRole('button', { name: '重试' })).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByText('正在加载插件')).not.toBeInTheDocument())

    server.use(
      http.get(apiUrls.list, ({ request }) => {
        const state = new URL(request.url).searchParams.get('state')
        const plugins =
          state === 'installed' ? [createPlugin({ id: 'Recovered', installed: true, plugin_name: '重试恢复插件' })] : []
        return apiJson(plugins as unknown as JsonBodyType)
      }),
    )
    await fireEvent.click(screen.getByRole('button', { name: '重试' }))
    expect(await screen.findByText('plugin:重试恢复插件')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByText('正在加载插件')).not.toBeInTheDocument())
    await waitForRequestsToFinish()
  })

  it('refreshes only the installed snapshot when the shared runtime generation changes', async () => {
    let installedRequests = 0
    let marketRequests = 0
    const { pinia } = await renderList({
      installed: () => {
        installedRequests += 1
        return [createPlugin({ id: 'Installed', installed: true, plugin_name: '已安装插件' })]
      },
      market: () => {
        marketRequests += 1
        return [createPlugin({ id: 'Market', plugin_name: '市场插件' })]
      },
    })
    await waitForRequestsToFinish()
    const initialInstalledRequests = installedRequests
    const initialMarketRequests = marketRequests

    const runtimeStore = usePluginRuntimeStore(pinia)
    runtimeStore.reconciliation = 1

    await waitFor(() => expect(installedRequests).toBe(initialInstalledRequests + 1))
    expect(marketRequests).toBe(initialMarketRequests)
    await waitForRequestsToFinish()
  })

  it('applies a runtime generation received while the market tab is open', async () => {
    let installedRequests = 0
    const { pinia } = await renderList({
      installed: () => {
        installedRequests += 1
        return [createPlugin({ id: 'Installed', installed: true, plugin_name: '已安装插件' })]
      },
      market: () => [createPlugin({ id: 'Market', plugin_name: '市场插件' })],
    })
    await waitForRequestsToFinish()
    const initialInstalledRequests = installedRequests
    const runtimeStore = usePluginRuntimeStore(pinia)

    getHeaderConfig().modelValue.value = 'market'
    await nextTick()
    runtimeStore.reconciliation = 1
    await nextTick()
    expect(installedRequests).toBe(initialInstalledRequests)

    getHeaderConfig().modelValue.value = 'installed'
    await waitFor(() => expect(installedRequests).toBe(initialInstalledRequests + 1))
    await waitForRequestsToFinish()
  })

  it('does not request the superuser runtime summary for an ordinary administrator', async () => {
    server.use(
      http.get(apiUrls.runtime, () => {
        throw new Error('ordinary administrator must not request plugin runtime')
      }),
    )

    await renderList({}, { superUser: false })
    await waitForRequestsToFinish()
  })

  it('leaves an initial market failure in a retryable error state instead of permanent loading', async () => {
    await renderList({
      installed: () => [createPlugin({ id: 'Installed', installed: true, plugin_name: '已安装插件' })],
      marketStatus: 500,
    })

    expect(await screen.findByRole('button', { name: '重试' })).toBeInTheDocument()
    await waitForRequestsToFinish()
    expect(screen.queryByText('正在加载插件')).not.toBeInTheDocument()

    server.use(
      http.get(apiUrls.list, ({ request }) => {
        const state = new URL(request.url).searchParams.get('state')
        const plugins =
          state === 'market' ? [createPlugin({ id: 'MarketRecovered', plugin_name: '市场重试恢复插件' })] : []
        return apiJson(plugins as unknown as JsonBodyType)
      }),
    )
    await fireEvent.click(screen.getByRole('button', { name: '重试' }))
    expect(await screen.findByText('market:市场重试恢复插件')).toBeInTheDocument()
    await waitForRequestsToFinish()
  })

  it('batches ratings by 100 plugin IDs and merges the returned values into current cards', async () => {
    const requestedChunks: string[][] = []
    const installed = Array.from({ length: 101 }, (_, index) =>
      createPlugin({ id: `Installed-${index}`, installed: true, plugin_name: `已安装-${index}` }),
    )
    const market = Array.from({ length: 101 }, (_, index) =>
      createPlugin({ id: `Market-${index}`, plugin_name: `市场-${index}` }),
    )
    await renderList({
      installed: () => installed,
      market: () => market,
      rating: ids => {
        requestedChunks.push(ids)
        return Object.fromEntries(
          ids.map(id => [id, { average_rating: id === 'Market-0' ? 4.8 : 4, plugin_id: id, rating_count: 2 }]),
        )
      },
    })

    await waitFor(() => expect(requestedChunks).toHaveLength(3))
    expect(requestedChunks.map(chunk => chunk.length)).toEqual([100, 100, 2])
    expect(await screen.findByLabelText('rating-Market-0')).toHaveTextContent('4.8')
    await waitForRequestsToFinish()
  })
})

describe('PluginCardListView market filtering and pagination', () => {
  beforeEach(() => {
    mocks.appMode = false
    mocks.keepAliveHandler = undefined
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('sorts market entries by rating descending when asynchronous ratings arrive', async () => {
    const ratings = createDeferred<Record<string, PluginRating>>()
    await renderList({
      market: () => [
        createPlugin({ id: 'Low', plugin_name: '低评分插件' }),
        createPlugin({ id: 'Unrated', plugin_name: '未评分插件' }),
        createPlugin({ id: 'High', plugin_name: '高评分插件' }),
        createPlugin({ id: 'Medium', plugin_name: '中评分插件' }),
      ],
      rating: () => ratings.promise,
    })

    expect(await screen.findByText('market:低评分插件')).toBeInTheDocument()
    getHeaderConfig().modelValue.value = 'market'
    await nextTick()
    const marketFilterButton = getHeaderConfig().appendButtons.find(button => button.dataAttr === 'market-filter-btn')
    if (!marketFilterButton?.action) throw new Error('未注册市场过滤操作')
    marketFilterButton.action()
    await nextTick()
    await fireEvent.click(screen.getByText('评分'))

    ratings.resolve({
      High: { average_rating: 4.8, plugin_id: 'High', rating_count: 12 },
      Low: { average_rating: 2.1, plugin_id: 'Low', rating_count: 3 },
      Medium: { average_rating: 3.6, plugin_id: 'Medium', rating_count: 6 },
    })

    await waitFor(() => {
      const labels = [...document.querySelectorAll('[data-testid^="market-"]')].map(node => node.textContent)
      expect(labels).toEqual([
        expect.stringContaining('market:高评分插件'),
        expect.stringContaining('market:中评分插件'),
        expect.stringContaining('market:低评分插件'),
        expect.stringContaining('market:未评分插件'),
      ])
    })
    await waitForRequestsToFinish()
  })

  it('filters and sorts market entries, labels local repos, and appends pages of 20', async () => {
    const market = Array.from({ length: 25 }, (_, index) =>
      createPlugin({
        add_time: index,
        id: `Market-${index}`,
        plugin_author: index % 2 === 0 ? 'Alice' : 'Bob',
        plugin_desc: index === 5 ? 'Contains Needle' : `描述 ${index}`,
        plugin_label: index % 3 === 0 ? '工具,整理' : '通知',
        plugin_name: index === 0 ? 'Zulu' : index === 24 ? 'Alpha' : `插件 ${String(index).padStart(2, '0')}`,
        repo_url:
          index === 0
            ? 'local://repo?path=%2Ftmp%2Fplugins'
            : index === 1
              ? 'local://repo'
              : 'https://github.com/example/repo',
      }),
    )
    await renderList({
      market: () => market,
      statistic: () => Object.fromEntries(market.map((plugin, index) => [plugin.id, 100 - index])),
    })

    await waitFor(() => expect(document.querySelectorAll('[data-testid^="market-"]')).toHaveLength(20))
    expect(document.querySelector('[data-testid^="market-"]')).toHaveTextContent('market:Zulu')

    await fireEvent.click(screen.getByRole('button', { name: 'load-more-market' }))
    await waitFor(() => expect(document.querySelectorAll('[data-testid^="market-"]')).toHaveLength(25))
    expect(mocks.infiniteDone).toHaveBeenLastCalledWith('ok')
    await fireEvent.click(screen.getByRole('button', { name: 'load-more-market' }))
    expect(mocks.infiniteDone).toHaveBeenLastCalledWith('empty')

    getHeaderConfig().modelValue.value = 'market'
    await nextTick()
    await waitForRequestsToFinish()
    const marketFilterButton = getHeaderConfig().appendButtons.find(button => button.dataAttr === 'market-filter-btn')
    if (!marketFilterButton?.action) throw new Error('未注册市场过滤操作')
    marketFilterButton.action()
    await nextTick()

    const initialRepository = screen.getByRole('group', { name: '仓库' })
    expect(within(initialRepository).getByRole('button', { name: '本地' })).toBeInTheDocument()
    expect(within(initialRepository).queryByRole('button', { name: '/tmp/plugins' })).not.toBeInTheDocument()

    await fireEvent.click(screen.getByText('插件名称'))
    await waitFor(() => expect(document.querySelector('[data-testid^="market-"]')).toHaveTextContent('market:Alpha'))

    marketFilterButton.action()
    await nextTick()
    const nameInput = screen.getByRole('textbox', { name: '名称' })
    await fireEvent.update(nameInput, 'needle')
    await fireEvent.keyUp(nameInput, { key: 'Enter' })
    await waitFor(() => expect(document.querySelectorAll('[data-testid^="market-"]')).toHaveLength(1))
    expect(screen.getByText('market:插件 05')).toBeInTheDocument()

    marketFilterButton.action()
    await nextTick()
    const reopenedNameInput = screen.getByRole('textbox', { name: '名称' })
    const repository = screen.getByRole('group', { name: '仓库' })
    await fireEvent.update(reopenedNameInput, '')
    const author = screen.getByRole('group', { name: '作者' })
    await fireEvent.click(within(author).getByRole('button', { name: 'Alice' }))
    await waitFor(() => expect(document.querySelectorAll('[data-testid^="market-"]')).toHaveLength(13))
    expect(screen.queryByText('market:插件 05')).not.toBeInTheDocument()

    await fireEvent.click(within(author).getByRole('button', { name: 'Alice' }))
    const label = screen.getByRole('group', { name: '标签' })
    await fireEvent.click(within(label).getByRole('button', { name: '工具' }))
    await waitFor(() => expect(document.querySelectorAll('[data-testid^="market-"]')).toHaveLength(9))

    await fireEvent.click(within(label).getByRole('button', { name: '工具' }))
    await fireEvent.click(within(repository).getByRole('button', { name: '本地' }))
    await waitFor(() => expect(document.querySelectorAll('[data-testid^="market-"]')).toHaveLength(2))
    expect(screen.getByText('market:Zulu')).toBeInTheDocument()
    expect(screen.getByText('market:插件 01')).toBeInTheDocument()
    await waitForRequestsToFinish()
  })

  it('preserves loaded market pages when switching tabs without refetching', async () => {
    const market = Array.from({ length: 45 }, (_, index) =>
      createPlugin({
        id: `Market-${index}`,
        plugin_name: `市场插件 ${index}`,
        repo_url: 'https://github.com/example/repo',
      }),
    )
    let marketRequests = 0
    await renderList({
      installed: () => [createPlugin({ id: 'Installed', installed: true, plugin_name: '已安装插件' })],
      market: () => {
        marketRequests += 1
        return market
      },
    })

    await waitFor(() => expect(document.querySelectorAll('[data-testid^="market-"]')).toHaveLength(20))
    await fireEvent.click(screen.getByRole('button', { name: 'load-more-market' }))
    await waitFor(() => expect(document.querySelectorAll('[data-testid^="market-"]')).toHaveLength(40))
    expect(marketRequests).toBe(1)

    getHeaderConfig().modelValue.value = 'installed'
    await nextTick()
    getHeaderConfig().modelValue.value = 'market'
    await nextTick()

    expect(document.querySelectorAll('[data-testid^="market-"]')).toHaveLength(40)
    expect(screen.getByText('market:市场插件 39')).toBeInTheDocument()
    expect(marketRequests).toBe(1)

    getHeaderButton('mdi-refresh').action?.()
    await waitFor(() => expect(marketRequests).toBe(2))
    await waitForRequestsToFinish()
    expect(document.querySelectorAll('[data-testid^="market-"]')).toHaveLength(20)
    expect(screen.queryByText('market:市场插件 39')).not.toBeInTheDocument()
  })

  it('restores each tab window scroll position after switching tabs', async () => {
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    let currentScrollTop = 0
    vi.spyOn(window, 'scrollY', 'get').mockImplementation(() => currentScrollTop)

    await renderList({
      installed: () => [createPlugin({ id: 'Installed', installed: true, plugin_name: '已安装插件' })],
      market: () => Array.from({ length: 25 }, (_, index) => createPlugin({ id: `Market-${index}` })),
    })

    await waitForRequestsToFinish()

    getHeaderConfig().modelValue.value = 'market'
    await nextTick()
    currentScrollTop = 1800
    getHeaderConfig().modelValue.value = 'installed'
    await nextTick()
    currentScrollTop = 0
    getHeaderConfig().modelValue.value = 'market'
    await nextTick()

    await waitFor(() => expect(scrollTo).toHaveBeenLastCalledWith({ behavior: 'auto', top: 1800 }))
    scrollTo.mockRestore()
  })

  it('keeps the previous market snapshot until a manual refresh is complete', async () => {
    const refreshedMarket = createDeferred<Plugin[]>()
    const refreshedStatistics = createDeferred<Record<string, number>>()
    let marketRequests = 0
    let statisticRequests = 0

    await renderList({
      market: () => {
        marketRequests += 1
        return marketRequests === 1
          ? [createPlugin({ id: 'BeforeRefresh', plugin_name: '刷新前插件' })]
          : refreshedMarket.promise
      },
      statistic: () => {
        statisticRequests += 1
        return statisticRequests === 1 ? {} : refreshedStatistics.promise
      },
    })

    expect(await screen.findByText('market:刷新前插件')).toBeInTheDocument()
    const refresh = getHeaderButton('mdi-refresh').action
    if (!refresh) throw new Error('未注册市场刷新操作')
    void refresh()

    await waitFor(() => expect(marketRequests).toBe(2))
    refreshedMarket.resolve([createPlugin({ id: 'AfterRefresh', plugin_name: '刷新后插件' })])
    await waitFor(() => expect(statisticRequests).toBe(2))
    await nextTick()

    expect(screen.getByText('market:刷新前插件')).toBeInTheDocument()
    expect(screen.queryByText('market:刷新后插件')).not.toBeInTheDocument()

    refreshedStatistics.resolve({})
    expect(await screen.findByText('market:刷新后插件')).toBeInTheDocument()
    expect(screen.queryByText('market:刷新前插件')).not.toBeInTheDocument()
    await waitForRequestsToFinish()
  })

  it('keeps the previous market snapshot when a manual metric request fails', async () => {
    let marketRequests = 0
    await renderList({
      market: () => {
        marketRequests += 1
        return marketRequests === 1
          ? [createPlugin({ id: 'BeforeRefresh', plugin_name: '刷新前插件' })]
          : [createPlugin({ id: 'AfterRefresh', plugin_name: '刷新后插件' })]
      },
      statistic: () => ({ BeforeRefresh: 10 }),
    })

    expect(await screen.findByText('market:刷新前插件')).toBeInTheDocument()
    server.use(http.get(apiUrls.statistic, () => HttpResponse.json({ message: 'metrics failed' }, { status: 503 })))

    const refresh = getHeaderButton('mdi-refresh').action
    if (!refresh) throw new Error('未注册市场刷新操作')
    await refresh()
    await waitForRequestsToFinish()

    expect(screen.getByText('market:刷新前插件')).toBeInTheDocument()
    expect(screen.queryByText('market:刷新后插件')).not.toBeInTheDocument()
  })
})

describe('PluginCardListView installed filtering and host callbacks', () => {
  beforeEach(() => {
    mocks.appMode = true
    mocks.keepAliveHandler = undefined
    mocks.openSharedDialog.mockImplementation(() => ({ close: vi.fn(), id: 1, updateProps: vi.fn() }))
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('responds when a global plugin link changes the target on the active page', async () => {
    const { router } = await renderList({
      installed: () => [
        createPlugin({ id: 'Alpha', installed: true, plugin_name: 'Alpha' }),
        createPlugin({ id: 'Beta', installed: true, plugin_name: 'Beta' }),
      ],
    })
    await screen.findByText('plugin:Beta')

    await router.push('/plugins?id=Beta')

    await waitFor(() => expect(screen.getByLabelText('page-open-Beta')).toHaveTextContent('true'))
    expect(document.querySelector('[data-scroll-to-index]')).toHaveAttribute('data-scroll-to-index', '1')
    await waitForRequestsToFinish()
  })

  it('applies running, update, and name filters through the installed menu', async () => {
    await renderList({
      installed: () => [
        createPlugin({ has_update: true, id: 'Alpha', installed: true, plugin_name: 'Alpha', state: true }),
        createPlugin({ has_update: false, id: 'Beta', installed: true, plugin_name: 'Beta', state: true }),
        createPlugin({ has_update: true, id: 'Gamma', installed: true, plugin_name: 'Gamma', state: false }),
      ],
      market: () => [
        createPlugin({ has_update: true, id: 'Alpha', installed: true, plugin_name: 'Alpha' }),
        createPlugin({ has_update: true, id: 'Gamma', installed: true, plugin_name: 'Gamma' }),
      ],
    })
    await screen.findByText('plugin:Alpha')
    await waitForRequestsToFinish()
    const installedFilterButton = getHeaderConfig().appendButtons.find(
      button => button.dataAttr === 'installed-filter-btn',
    )
    if (!installedFilterButton?.action) throw new Error('未注册已安装过滤操作')

    installedFilterButton.action()
    await nextTick()
    await fireEvent.click(screen.getByText('运行中'))
    await waitFor(() => expect(screen.queryByText('plugin:Gamma')).not.toBeInTheDocument())
    expect(screen.getByText('plugin:Alpha')).toBeInTheDocument()
    expect(screen.getByText('plugin:Beta')).toBeInTheDocument()

    installedFilterButton.action()
    await nextTick()
    await fireEvent.click(screen.getByText('有新版本'))
    await waitFor(() => expect(screen.queryByText('plugin:Beta')).not.toBeInTheDocument())
    expect(screen.getByText('plugin:Alpha')).toBeInTheDocument()

    installedFilterButton.action()
    await nextTick()
    await fireEvent.click(screen.getByText('运行中'))
    installedFilterButton.action()
    await nextTick()
    await fireEvent.click(screen.getByText('有新版本'))
    installedFilterButton.action()
    await nextTick()
    const nameInput = screen.getByRole('textbox', { name: '名称' })
    await fireEvent.update(nameInput, 'bet')
    await fireEvent.keyUp(nameInput, { key: 'Enter' })
    expect(screen.getByText('plugin:Beta')).toBeInTheDocument()
    expect(screen.queryByText('plugin:Alpha')).not.toBeInTheDocument()
    expect(screen.queryByText('plugin:Gamma')).not.toBeInTheDocument()
  })

  it('updates search results and refreshes market and sidebar through public callbacks', async () => {
    let marketRequests = 0
    const controller = { close: vi.fn(), id: 1, updateProps: vi.fn() }
    mocks.openSharedDialog.mockReturnValue(controller)
    const { pinia } = await renderList({
      installed: () => [createPlugin({ id: 'Installed', installed: true, plugin_name: '已安装插件' })],
      market: () => {
        marketRequests += 1
        return [createPlugin({ id: 'Available', plugin_desc: 'Needle', plugin_name: '可安装插件' })]
      },
    })
    await waitForRequestsToFinish()
    const sidebarStore = usePluginSidebarNavStore(pinia)

    getDynamicButtonConfig().onClick()
    const searchEvents = getDialogEvents()
    searchEvents['update:keyword']('needle')
    expect(controller.updateProps).toHaveBeenCalledWith(
      expect.objectContaining({ keyword: 'needle', plugins: [expect.objectContaining({ id: 'Available' })] }),
    )

    getHeaderConfig().modelValue.value = 'market'
    await nextTick()
    await waitForRequestsToFinish()
    expect(marketRequests).toBe(1)
    getDynamicMenuItem('dialog.pluginMarketSetting.title').action()
    getDialogEvents().save()
    await waitFor(() => expect(marketRequests).toBe(2))

    const requestsAfterSave = marketRequests
    getDynamicMenuItem('dialog.pluginMarketSetting.title').action()
    expect(mocks.openSharedDialog.mock.calls.at(-1)?.[3]).toEqual({ closeOn: ['close', 'save'] })
    getDialogEvents().changed()
    await waitFor(() => expect(marketRequests).toBeGreaterThan(requestsAfterSave))

    server.use(http.get(apiUrls.install('Available'), () => apiJson(null)))
    await fireEvent.click(screen.getByRole('button', { name: 'installed-Available' }))
    await waitFor(() => expect(sidebarStore.ensureSidebarNav).toHaveBeenCalledWith(true))
    await waitForRequestsToFinish()
  })

  it('moves a market installation to the installed tab and targets its card', async () => {
    const installGate = createDeferred<void>()
    let installed = false
    const target = createPlugin({ id: 'MarketInstall', plugin_name: '市场安装插件' })
    await renderList({
      installed: () => (installed ? [{ ...target, installed: true }] : []),
      market: () => [target],
    })
    await waitForRequestsToFinish()

    server.use(
      http.get(apiUrls.install('MarketInstall'), async () => {
        await installGate.promise
        installed = true
        return apiJson(null)
      }),
    )

    getHeaderConfig().modelValue.value = 'market'
    await nextTick()
    await fireEvent.click(screen.getByRole('button', { name: 'installed-MarketInstall' }))

    await waitFor(() => expect(getHeaderConfig().modelValue.value).toBe('installed'))
    expect(await screen.findByText('plugin:市场安装插件')).toBeInTheDocument()
    expect(document.querySelector('[data-scroll-to-index="0"]')).toBeInTheDocument()
    getHeaderConfig().modelValue.value = 'market'
    await nextTick()
    expect(screen.queryByTestId('market-MarketInstall')).not.toBeInTheDocument()

    installGate.resolve()
    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalledWith('插件 市场安装插件 安装成功！'))
    await waitForRequestsToFinish()

    await waitFor(() => expect(screen.queryByTestId('market-MarketInstall')).not.toBeInTheDocument())
  })

  it('restores a market plugin after an installation failure', async () => {
    const installGate = createDeferred<void>()
    const target = createPlugin({ id: 'FailedMarketInstall', plugin_name: '失败市场插件' })
    await renderList({ installed: () => [], market: () => [target] })
    await waitForRequestsToFinish()

    server.use(
      http.get(apiUrls.install('FailedMarketInstall'), async () => {
        await installGate.promise
        return HttpResponse.json({ message: '安装失败' }, { status: 500 })
      }),
    )

    getHeaderConfig().modelValue.value = 'market'
    await nextTick()
    await fireEvent.click(screen.getByRole('button', { name: 'installed-FailedMarketInstall' }))
    await waitFor(() => expect(getHeaderConfig().modelValue.value).toBe('installed'))

    getHeaderConfig().modelValue.value = 'market'
    await nextTick()
    expect(screen.queryByTestId('market-FailedMarketInstall')).not.toBeInTheDocument()

    installGate.resolve()
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalled())
    await waitFor(() => expect(screen.getByTestId('market-FailedMarketInstall')).toBeInTheDocument())
  })
})

describe('PluginCardListView search installation', () => {
  beforeEach(() => {
    mocks.appMode = false
    mocks.keepAliveHandler = undefined
    mocks.openSharedDialog.mockImplementation(() => ({ close: vi.fn(), id: 1, updateProps: vi.fn() }))
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('opens the install detail before making a request and preserves install failures', async () => {
    let installRequests = 0
    let mode: 'business' | 'http' = 'business'
    await renderList()
    await waitForRequestsToFinish()
    server.use(
      http.get(apiUrls.install('SearchPlugin'), () => {
        installRequests += 1
        return mode === 'business'
          ? apiFailureJson('Rejected')
          : HttpResponse.json({ message: 'HTTP failure' }, { status: 500 })
      }),
    )

    getDynamicButtonConfig().onClick()
    await getDialogEvents()['open-plugin'](
      createPlugin({
        id: 'SearchPlugin',
        plugin_name: '不兼容插件',
        system_version_compatible: false,
        system_version_message: '版本不兼容',
      }),
    )
    expect(getDialogProps().plugin).toMatchObject({ id: 'SearchPlugin', plugin_name: '不兼容插件' })
    expect(installRequests).toBe(0)
    await getDialogProps().installHandler?.()
    expect(mocks.toastError).toHaveBeenLastCalledWith('版本不兼容')
    expect(installRequests).toBe(0)

    mocks.toastError.mockClear()
    getDynamicButtonConfig().onClick()
    await getDialogEvents()['open-plugin'](createPlugin({ id: 'SearchPlugin', plugin_name: '业务失败插件' }))
    await getDialogProps().installHandler?.()
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledOnce())
    expect(installRequests).toBe(1)
    expect(mocks.toastSuccess).not.toHaveBeenCalled()

    mocks.toastError.mockClear()
    mode = 'http'
    getDynamicButtonConfig().onClick()
    await getDialogEvents()['open-plugin'](createPlugin({ id: 'SearchPlugin', plugin_name: 'HTTP 失败插件' }))
    await getDialogProps().installHandler?.()
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledOnce())
    expect(installRequests).toBe(2)
    expect(mocks.toastSuccess).not.toHaveBeenCalled()
    await waitForRequestsToFinish()
  })

  it('uses the source-neutral install endpoint and refreshes the list and sidebar after success', async () => {
    let installed = false
    let installUrl: URL | undefined
    const target = createPlugin({
      has_update: true,
      id: 'SearchPlugin',
      plugin_name: '搜索安装插件',
      repo_url: 'https://github.com/example/search-plugin',
    })
    const { pinia } = await renderList({
      installed: () =>
        installed ? [createPlugin({ id: 'SearchPlugin', installed: true, plugin_name: '搜索安装插件' })] : [],
      market: () => [target],
    })
    await waitForRequestsToFinish()
    server.use(
      http.get(apiUrls.install('SearchPlugin'), ({ request }) => {
        installUrl = new URL(request.url)
        installed = true
        return apiJson(null)
      }),
    )
    const sidebarStore = usePluginSidebarNavStore(pinia)

    getDynamicButtonConfig().onClick()
    await getDialogEvents()['open-plugin'](target)
    await getDialogProps().installHandler?.()

    expect(await screen.findByText('plugin:搜索安装插件')).toBeInTheDocument()
    await waitFor(() => expect(sidebarStore.ensureSidebarNav).toHaveBeenCalledWith(true))
    expect(installUrl?.searchParams.has('repo_url')).toBe(false)
    expect(installUrl?.searchParams.get('force')).toBe('true')
    expect(mocks.toastSuccess).toHaveBeenCalledWith('插件 搜索安装插件 安装成功！')
    await waitForRequestsToFinish()
  })

  it('reuses the inspected source snapshot when installing from the detail dialog', async () => {
    let sourceOptionRequests = 0
    let installRequests = 0
    const target = createPlugin({ id: 'InspectedPlugin', plugin_name: '已检查来源插件' })
    const sourceOptions: PluginSourceOptions = {
      plugin_id: 'InspectedPlugin',
      inventory_complete: true,
      selection_status: 'selected',
      selection_reason: '',
      identity: null,
      candidates: [
        {
          source_type: 'official',
          source_key: 'github:jxxghp/moviepilot-plugins',
          repo_url: 'https://github.com/jxxghp/MoviePilot-Plugins',
          package_generation: 'v3',
          plugin_version: '1.0.0',
        },
      ],
    }
    await renderList({
      market: () => [target],
      sourceOptions: () => {
        sourceOptionRequests += 1
        return sourceOptions
      },
    })
    await waitForRequestsToFinish()
    server.use(
      http.get(apiUrls.install('InspectedPlugin'), () => {
        installRequests += 1
        return apiJson(null)
      }),
    )

    getDynamicButtonConfig().onClick()
    await getDialogEvents()['open-plugin'](target)
    await getDialogProps().installHandler?.(undefined, undefined, sourceOptions)

    expect(sourceOptionRequests).toBe(0)
    expect(installRequests).toBe(1)
    expect(getHeaderConfig().modelValue.value).toBe('installed')
    await waitForRequestsToFinish()
  })

  it('preserves an explicitly confirmed third-party source from the detail dialog', async () => {
    let requestBody: unknown
    let ordinaryInstallRequests = 0
    const target = createPlugin({ id: 'ConfirmedPlugin', plugin_name: '确认来源插件' })
    const sourceOptions: PluginSourceOptions = {
      plugin_id: 'ConfirmedPlugin',
      inventory_complete: true,
      selection_status: 'selected',
      selection_reason: '唯一在线来源',
      identity: null,
      candidates: [
        {
          source_type: 'third_party',
          source_key: 'github:example/plugins',
          repo_url: 'https://github.com/example/plugins',
          package_generation: 'v3',
          plugin_version: '1.0.0',
        },
      ],
    }
    await renderList({ market: () => [target] })
    await waitForRequestsToFinish()
    server.use(
      http.post(apiUrls.sourceBind('ConfirmedPlugin'), async ({ request }) => {
        requestBody = await request.json()
        return apiJson(null)
      }),
      http.get(apiUrls.install('ConfirmedPlugin'), () => {
        ordinaryInstallRequests += 1
        return apiJson(null)
      }),
    )

    getDynamicButtonConfig().onClick()
    await getDialogEvents()['open-plugin'](target)
    await getDialogProps().installHandler?.(undefined, 'https://github.com/example/plugins', sourceOptions)

    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalledWith('插件 确认来源插件 安装成功！'))
    expect(requestBody).toEqual({
      force: false,
      repo_url: 'https://github.com/example/plugins',
    })
    expect(ordinaryInstallRequests).toBe(0)
    await waitForRequestsToFinish()
  })

  it('uses the explicitly selected source to reinstall an unbound market plugin', async () => {
    let requestBody: unknown
    const target = createPlugin({ id: 'LegacyPlugin', plugin_name: '存量插件' })
    const sourceOptions: PluginSourceOptions = {
      plugin_id: 'LegacyPlugin',
      inventory_complete: true,
      selection_status: 'incomplete',
      selection_reason: '当前插件尚未绑定仓库',
      identity: {
        plugin_id: 'LegacyPlugin',
        trusted_source_type: 'unknown',
        trusted_source_key: null,
        binding_basis: 'legacy_unbound',
        payload_source_type: 'unknown',
        payload_source_key: null,
        revision: 2,
      },
      candidates: [
        {
          source_type: 'third_party',
          source_key: 'github:example/plugins',
          repo_url: 'https://github.com/example/plugins',
          package_generation: 'v3',
          plugin_version: '1.0.0',
        },
      ],
    }
    await renderList({ market: () => [target] })
    await waitForRequestsToFinish()
    server.use(
      http.post(apiUrls.sourceBind('LegacyPlugin'), async ({ request }) => {
        requestBody = await request.json()
        return apiJson(null)
      }),
    )

    getDynamicButtonConfig().onClick()
    await getDialogEvents()['open-plugin'](target)
    await getDialogProps().installHandler?.(undefined, 'https://github.com/example/plugins', sourceOptions)

    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalledWith('插件 存量插件 安装成功！'))
    expect(requestBody).toEqual({
      force: false,
      repo_url: 'https://github.com/example/plugins',
    })
    await waitForRequestsToFinish()
  })

  it('opens source selection instead of silently installing a conflicting plugin ID', async () => {
    let installRequests = 0
    const target = createPlugin({ id: 'ConflictPlugin', plugin_name: '重名插件' })
    await renderList({
      market: () => [target],
      sourceOptions: pluginId => ({
        plugin_id: pluginId,
        inventory_complete: true,
        selection_status: 'conflict',
        selection_reason: '该插件存在多个在线来源，请确认来源后安装。',
        identity: null,
        candidates: [
          {
            source_type: 'official',
            source_key: 'github:jxxghp/moviepilot-plugins',
            repo_url: 'https://github.com/jxxghp/MoviePilot-Plugins',
            package_generation: 'v3',
            plugin_version: '1.0.0',
          },
          {
            source_type: 'third_party',
            source_key: 'github:example/plugins',
            repo_url: 'https://github.com/example/plugins',
            package_generation: 'v3',
            plugin_version: '2.0.0',
          },
        ],
      }),
    })
    await waitForRequestsToFinish()
    server.use(
      http.get(apiUrls.install('ConflictPlugin'), () => {
        installRequests += 1
        return apiJson(null)
      }),
    )

    getHeaderConfig().modelValue.value = 'market'
    await nextTick()
    await fireEvent.click(screen.getByRole('button', { name: 'installed-ConflictPlugin' }))

    await waitFor(() => expect(mocks.openSharedDialog).toHaveBeenCalled())
    expect(getDialogProps().plugin).toMatchObject({ id: 'ConflictPlugin' })
    expect(installRequests).toBe(0)
    expect(getHeaderConfig().modelValue.value).toBe('market')
  })

  it('shows a per-plugin loading card while installation is still running', async () => {
    const installGate = createDeferred<void>()
    const installStarted = createDeferred<void>()
    let installed = false
    const target = createPlugin({ id: 'PendingPlugin', plugin_name: '后台安装插件' })
    await renderList({
      installed: () =>
        installed
          ? [
              createPlugin({
                id: 'PendingPlugin',
                installed: true,
                plugin_name: '后台安装插件',
                runtime_status: 'active',
              }),
            ]
          : [],
      market: () => [target],
    })
    await waitForRequestsToFinish()
    server.use(
      http.get(apiUrls.install('PendingPlugin'), async () => {
        installed = true
        installStarted.resolve()
        await installGate.promise
        return apiJson(null)
      }),
    )

    getDynamicButtonConfig().onClick()
    await getDialogEvents()['open-plugin'](target)
    void getDialogProps().installHandler?.()

    expect(await screen.findByText('plugin:后台安装插件')).toBeInTheDocument()
    expect(document.querySelector('[data-scroll-to-index="0"]')).toBeInTheDocument()
    expect(screen.getByLabelText('runtime-PendingPlugin')).toBeEmptyDOMElement()
    expect(screen.getByLabelText('settling-PendingPlugin')).toHaveTextContent('true')
    expect(screen.getByLabelText('installing-PendingPlugin')).toHaveTextContent('true')
    expect(mocks.toastSuccess).not.toHaveBeenCalled()

    await installStarted.promise
    await mocks.keepAliveHandler?.({ silent: true })
    expect(screen.getByLabelText('installing-PendingPlugin')).toHaveTextContent('true')
    expect(mocks.toastSuccess).not.toHaveBeenCalled()

    installGate.resolve()
    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalledWith('插件 后台安装插件 安装成功！'))
    await waitFor(() => expect(screen.getByLabelText('runtime-PendingPlugin')).toHaveTextContent('active'))
    await waitFor(() => expect(screen.getByLabelText('installing-PendingPlugin')).toHaveTextContent('false'))
    await waitForRequestsToFinish()
  })

  it('shows a per-plugin updating state, warns about restart, and clears the consumed update marker', async () => {
    const updateGate = createDeferred<void>()
    const updateStarted = createDeferred<void>()
    let installedVersion = '1.0.0'
    const target = createPlugin({
      has_update: true,
      id: 'NativeUpdatePlugin',
      installed: true,
      plugin_name: '原生更新插件',
      plugin_version: '2.0.0',
    })
    await renderList({
      installed: () => [
        createPlugin({
          id: 'NativeUpdatePlugin',
          installed: true,
          plugin_name: '原生更新插件',
          plugin_version: installedVersion,
          runtime_status: 'active',
        }),
      ],
      market: () => [target],
    })
    await waitForRequestsToFinish()
    server.use(
      http.get(apiUrls.install('NativeUpdatePlugin'), async () => {
        updateStarted.resolve()
        await updateGate.promise
        installedVersion = '2.0.0'
        return apiJson({ restart_required: true })
      }),
    )

    expect(screen.getByLabelText('update-NativeUpdatePlugin')).toHaveTextContent('true')
    await fireEvent.click(screen.getByRole('button', { name: 'update-plugin-NativeUpdatePlugin' }))
    await updateStarted.promise

    expect(screen.getByLabelText('installing-NativeUpdatePlugin')).toHaveTextContent('true')
    expect(screen.getByLabelText('updating-NativeUpdatePlugin')).toHaveTextContent('true')
    expect(mocks.toastWarning).not.toHaveBeenCalled()

    updateGate.resolve()
    await waitFor(() =>
      expect(mocks.toastWarning).toHaveBeenCalledWith('插件 原生更新插件 已更新，重启 MoviePilot 后完成依赖更新'),
    )
    await waitFor(() => expect(screen.getByLabelText('update-NativeUpdatePlugin')).toHaveTextContent('false'))
    await waitFor(() => expect(screen.getByLabelText('installing-NativeUpdatePlugin')).toHaveTextContent('false'))
    expect(screen.getByLabelText('updating-NativeUpdatePlugin')).toHaveTextContent('false')
    await waitForRequestsToFinish()
  })

  it('reports an update failure for an installed plugin', async () => {
    const target = createPlugin({
      has_update: true,
      id: 'FailedUpdatePlugin',
      installed: true,
      plugin_name: '更新失败插件',
      plugin_version: '2.0.0',
    })
    await renderList({
      installed: () => [target],
      market: () => [target],
    })
    await waitForRequestsToFinish()
    server.use(http.get(apiUrls.install('FailedUpdatePlugin'), () => apiFailureJson('依赖更新失败')))

    await fireEvent.click(screen.getByRole('button', { name: 'update-plugin-FailedUpdatePlugin' }))

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('插件 更新失败插件 更新失败：依赖更新失败'))
    expect(mocks.toastError).not.toHaveBeenCalledWith(expect.stringContaining('安装失败'))
    await waitForRequestsToFinish()
  })

  it('deduplicates concurrent installation requests for the same plugin', async () => {
    const installGate = createDeferred<void>()
    let installRequests = 0
    const target = createPlugin({ id: 'DuplicatePlugin', plugin_name: '重复安装插件' })
    await renderList({ market: () => [target] })
    await waitForRequestsToFinish()
    server.use(
      http.get(apiUrls.install('DuplicatePlugin'), async () => {
        installRequests += 1
        await installGate.promise
        return apiJson(null)
      }),
    )

    getDynamicButtonConfig().onClick()
    await getDialogEvents()['open-plugin'](target)
    const install = getDialogProps().installHandler
    if (!install) throw new Error('未打开插件安装操作')
    void install()
    void install()

    await waitFor(() => expect(installRequests).toBe(1))
    installGate.resolve()
    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalledWith('插件 重复安装插件 安装成功！'))
    await waitForRequestsToFinish()
  })

  it('shows installation failure before a slow rollback refresh completes', async () => {
    const refreshGate = createDeferred<Plugin[]>()
    let firstInstalledRequest = true
    const target = createPlugin({ id: 'SlowRollbackPlugin', plugin_name: '慢回滚插件' })
    await renderList({
      installed: () => {
        if (firstInstalledRequest) {
          firstInstalledRequest = false
          return []
        }
        return refreshGate.promise
      },
      market: () => [target],
    })
    await waitForRequestsToFinish()
    server.use(http.get(apiUrls.install('SlowRollbackPlugin'), () => apiFailureJson('依赖安装失败')))

    getDynamicButtonConfig().onClick()
    await getDialogEvents()['open-plugin'](target)
    void getDialogProps().installHandler?.()

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledOnce())
    expect(getActiveRequestsCount()).toBeGreaterThan(0)
    refreshGate.resolve([])
    await waitForRequestsToFinish()
  })

  it('rolls back only the failed optimistic plugin card', async () => {
    const stable = createPlugin({ id: 'StablePlugin', installed: true, plugin_name: '稳定插件' })
    const target = createPlugin({ id: 'FailedPlugin', plugin_name: '失败插件' })
    await renderList({ installed: () => [stable], market: () => [target] })
    await waitForRequestsToFinish()
    server.use(http.get(apiUrls.install('FailedPlugin'), () => apiFailureJson('依赖安装失败')))

    getDynamicButtonConfig().onClick()
    await getDialogEvents()['open-plugin'](target)
    void getDialogProps().installHandler?.()

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledOnce())
    expect(screen.getByText('plugin:稳定插件')).toBeInTheDocument()
    expect(screen.queryByText('plugin:失败插件')).not.toBeInTheDocument()
    await waitForRequestsToFinish()
  })

  it('shows the installed card as busy and deduplicates a repository change', async () => {
    const sourceGate = createDeferred<void>()
    const sourceStarted = createDeferred<void>()
    let sourceRequests = 0
    let requestBody: unknown
    const target = createPlugin({ id: 'SourcePlugin', installed: true, plugin_name: '换仓插件' })
    let installedRequests = 0
    const { pinia } = await renderList({
      installed: () => {
        installedRequests += 1
        return [target]
      },
    })
    await waitForRequestsToFinish()
    const installedRequestsBeforeChange = installedRequests
    const runtimeStore = usePluginRuntimeStore(pinia)
    const sidebarStore = usePluginSidebarNavStore(pinia)
    server.use(
      http.post(apiUrls.sourceChange('SourcePlugin'), async ({ request }) => {
        sourceRequests += 1
        requestBody = await request.json()
        sourceStarted.resolve()
        await sourceGate.promise
        return apiJson(null)
      }),
    )

    const changeButton = screen.getByRole('button', { name: 'change-source-SourcePlugin' })
    await fireEvent.click(changeButton)
    await fireEvent.click(changeButton)
    await sourceStarted.promise

    expect(sourceRequests).toBe(1)
    expect(requestBody).toEqual({
      expected_revision: 7,
      repo_url: 'https://github.com/example/target',
    })
    expect(screen.getByLabelText('installing-SourcePlugin')).toHaveTextContent('true')

    sourceGate.resolve()
    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalledWith('插件 换仓插件 的仓库已更换'))
    await waitFor(() => expect(screen.getByLabelText('installing-SourcePlugin')).toHaveTextContent('false'))
    expect(installedRequests).toBeGreaterThan(installedRequestsBeforeChange)
    expect(runtimeStore.refresh).toHaveBeenCalled()
    expect(sidebarStore.ensureSidebarNav).toHaveBeenCalledWith(true)
    await waitForRequestsToFinish()
  })

  it('runs an initial repository binding through the same installed-card transaction', async () => {
    let requestBody: unknown
    const target = createPlugin({ id: 'BindingPlugin', installed: true, plugin_name: '待绑定插件' })
    await renderList({ installed: () => [target] })
    await waitForRequestsToFinish()
    server.use(
      http.post(apiUrls.sourceBind('BindingPlugin'), async ({ request }) => {
        requestBody = await request.json()
        return apiJson(null)
      }),
    )

    await fireEvent.click(screen.getByRole('button', { name: 'bind-source-BindingPlugin' }))

    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalledWith('插件 待绑定插件 已绑定仓库'))
    expect(requestBody).toEqual({
      force: true,
      repo_url: 'https://github.com/example/target',
    })
    await waitFor(() => expect(screen.getByLabelText('installing-BindingPlugin')).toHaveTextContent('false'))
    await waitForRequestsToFinish()
  })

  it('clears the installed card state when a repository change rolls back', async () => {
    const target = createPlugin({ id: 'FailedSourcePlugin', installed: true, plugin_name: '换仓失败插件' })
    let installedRequests = 0
    await renderList({
      installed: () => {
        installedRequests += 1
        return [target]
      },
    })
    await waitForRequestsToFinish()
    const installedRequestsBeforeChange = installedRequests
    server.use(http.post(apiUrls.sourceChange('FailedSourcePlugin'), () => apiFailureJson('目标仓库不可用')))

    await fireEvent.click(screen.getByRole('button', { name: 'change-source-FailedSourcePlugin' }))

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('插件 换仓失败插件 更换仓库失败：目标仓库不可用'))
    expect(screen.getByText('plugin:换仓失败插件')).toBeInTheDocument()
    expect(screen.getByLabelText('installing-FailedSourcePlugin')).toHaveTextContent('false')
    await waitFor(() => expect(installedRequests).toBeGreaterThan(installedRequestsBeforeChange))
    await waitForRequestsToFinish()
  })
})

describe('PluginCardListView folders and persistence', () => {
  beforeEach(() => {
    mocks.appMode = false
    mocks.keepAliveHandler = undefined
    mocks.openSharedDialog.mockImplementation(() => ({ close: vi.fn(), id: 1, updateProps: vi.fn() }))
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('normalizes legacy folders and mixed PluginOrder while preserving the configured order', async () => {
    await renderList({
      folders: () => ({
        Legacy: ['Installed-B'],
        Modern: { color: '#00ff00', order: 0, plugins: ['Installed-A'], showIcon: false },
      }),
      installed: () => [
        createPlugin({ id: 'Installed-A', installed: true, plugin_name: '插件 A' }),
        createPlugin({ id: 'Installed-B', installed: true, plugin_name: '插件 B' }),
        createPlugin({ id: 'Installed-C', installed: true, plugin_name: '插件 C' }),
      ],
      order: [
        { id: 'Modern', order: 0, type: 'folder' },
        { id: 'Installed-C', order: 1, type: 'plugin' },
        { id: 'Legacy', order: 2, type: 'folder' },
      ],
    })

    await waitFor(() => expect(screen.getByText('folder:Modern')).toBeInTheDocument())
    const labels = [...document.querySelectorAll('[data-testid^="folder-"], [data-testid^="plugin-"]')].map(
      node => node.querySelector('span')?.textContent,
    )
    expect(labels.slice(0, 3)).toEqual(['folder:Modern', 'plugin:插件 C', 'folder:Legacy'])
    expect(screen.queryByText('plugin:插件 A')).not.toBeInTheDocument()
    expect(screen.queryByText('plugin:插件 B')).not.toBeInTheDocument()
    await waitForRequestsToFinish()
  })

  it('normalizes the legacy PluginOrder string array', async () => {
    await renderList({
      installed: () => [
        createPlugin({ id: 'Plugin-A', installed: true, plugin_name: '插件 A' }),
        createPlugin({ id: 'Plugin-B', installed: true, plugin_name: '插件 B' }),
      ],
      order: ['Plugin-B', 'Plugin-A'],
    })

    await screen.findByText('plugin:插件 B')
    expect(getInstalledLabels().slice(0, 2)).toEqual(['plugin:插件 B', 'plugin:插件 A'])
    await waitForRequestsToFinish()
  })

  it('rolls back a new folder and reports failure when persistence returns success false', async () => {
    mocks.appMode = true
    await renderList({
      installed: () => [createPlugin({ id: 'Installed', installed: true, plugin_name: '已安装插件' })],
    })
    await screen.findByText('plugin:已安装插件')
    await waitForRequestsToFinish()
    server.use(http.post(apiUrls.folders, () => apiFailureJson('保存被拒绝')))

    getDynamicMenuItem('plugin.newFolder').action()
    const events = getDialogEvents()
    events['update:name']('失败文件夹')
    await events.create()

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledOnce())
    expect(mocks.toastSuccess).not.toHaveBeenCalled()
    expect(screen.queryByText('folder:失败文件夹')).not.toBeInTheDocument()
    await waitForRequestsToFinish()
  })

  it('validates a new folder and persists a unique trimmed name', async () => {
    mocks.appMode = true
    await renderList({ folders: () => ({ Existing: [] }) })
    await screen.findByText('folder:Existing')
    await waitForRequestsToFinish()
    server.use(http.post(apiUrls.folders, () => apiJson(null)))

    getDynamicMenuItem('plugin.newFolder').action()
    const events = getDialogEvents()
    events['update:name']('   ')
    await events.create()
    expect(mocks.toastError).toHaveBeenLastCalledWith('文件夹名称不能为空')

    events['update:name']('Existing')
    await events.create()
    expect(mocks.toastError).toHaveBeenLastCalledWith('文件夹已存在')

    events['update:name']('  New Folder  ')
    await events.create()
    expect(await screen.findByText('folder:New Folder')).toBeInTheDocument()
    expect(mocks.toastSuccess).toHaveBeenLastCalledWith('文件夹创建成功')
  })

  it('persists folder appearance, rename, and deletion on successful responses', async () => {
    await renderList({
      folders: () => ({ Tools: { color: '#00ff00', order: 0, plugins: ['Installed'] } }),
      installed: () => [createPlugin({ id: 'Installed', installed: true, plugin_name: '文件夹插件' })],
    })
    await screen.findByText('folder:Tools')
    await waitForRequestsToFinish()
    server.use(http.post(apiUrls.folders, () => apiJson(null)))

    await fireEvent.click(screen.getByRole('button', { name: 'configure-folder-Tools' }))
    await waitFor(() => expect(screen.getByLabelText('folder-color-Tools')).toHaveTextContent('#ff0000'))
    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalledWith('文件夹设置已保存'))

    await fireEvent.click(screen.getByRole('button', { name: 'rename-folder-Tools' }))
    expect(await screen.findByText('folder:Tools-renamed')).toBeInTheDocument()
    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalledWith('文件夹重命名成功'))

    await fireEvent.click(screen.getByRole('button', { name: 'delete-folder-Tools-renamed' }))
    await waitFor(() => expect(screen.queryByText('folder:Tools-renamed')).not.toBeInTheDocument())
    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalledWith('文件夹删除成功'))
    expect(screen.getByText('plugin:文件夹插件')).toBeInTheDocument()
  })

  it('rolls back appearance, rename, and deletion on business or HTTP failures', async () => {
    await renderList({
      folders: () => ({ Tools: { color: '#00ff00', order: 0, plugins: ['Installed'] } }),
      installed: () => [createPlugin({ id: 'Installed', installed: true, plugin_name: '文件夹插件' })],
    })
    await screen.findByText('folder:Tools')
    await waitForRequestsToFinish()
    let saveAttempt = 0
    server.use(
      http.post(apiUrls.folders, () => {
        saveAttempt += 1
        return saveAttempt === 2
          ? HttpResponse.json({ message: 'HTTP failure' }, { status: 500 })
          : apiFailureJson('Rejected')
      }),
    )

    await fireEvent.click(screen.getByRole('button', { name: 'configure-folder-Tools' }))
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledTimes(1))
    expect(screen.getByLabelText('folder-color-Tools')).toHaveTextContent('#00ff00')

    await fireEvent.click(screen.getByRole('button', { name: 'rename-folder-Tools' }))
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledTimes(2))
    expect(screen.getByText('folder:Tools')).toBeInTheDocument()
    expect(screen.queryByText('folder:Tools-renamed')).not.toBeInTheDocument()

    await fireEvent.click(screen.getByRole('button', { name: 'delete-folder-Tools' }))
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledTimes(3))
    expect(screen.getByText('folder:Tools')).toBeInTheDocument()
    expect(mocks.toastSuccess).not.toHaveBeenCalled()
  })

  it('rolls back a failed removal and persists a later removal from a folder', async () => {
    let saveSucceeds = false
    await renderList({
      folders: () => ({ Tools: ['Installed'] }),
      installed: () => [createPlugin({ id: 'Installed', installed: true, plugin_name: '文件夹插件' })],
    })
    await screen.findByText('folder:Tools')
    await waitForRequestsToFinish()
    server.use(
      http.post(apiUrls.folders, () =>
        saveSucceeds ? apiJson(null) : HttpResponse.json({ message: 'Rejected' }, { status: 500 }),
      ),
    )

    await fireEvent.click(screen.getByRole('button', { name: 'open-folder-Tools' }))
    expect(await screen.findByText('plugin:文件夹插件')).toBeInTheDocument()
    await fireEvent.click(screen.getByRole('button', { name: 'remove-plugin-Installed' }))
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledOnce())
    expect(screen.getByText('plugin:文件夹插件')).toBeInTheDocument()

    saveSucceeds = true
    await fireEvent.click(screen.getByRole('button', { name: 'remove-plugin-Installed' }))
    await waitFor(() => expect(screen.queryByText('plugin:文件夹插件')).not.toBeInTheDocument())
    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalledWith('插件已移出文件夹'))
  })

  it('rolls back mixed order failures and persists a later successful order', async () => {
    let orderSucceeds = false
    let savedOrder: unknown
    await renderList({
      folders: () => ({ Tools: [] }),
      installed: () => [
        createPlugin({ id: 'Plugin-A', installed: true, plugin_name: '插件 A' }),
        createPlugin({ id: 'Plugin-B', installed: true, plugin_name: '插件 B' }),
      ],
      order: [
        { id: 'Plugin-A', order: 0, type: 'plugin' },
        { id: 'Tools', order: 1, type: 'folder' },
        { id: 'Plugin-B', order: 2, type: 'plugin' },
      ],
    })
    await screen.findByText('folder:Tools')
    await waitForRequestsToFinish()
    server.use(
      http.post(apiUrls.order, async ({ request }) => {
        savedOrder = await request.json()
        return orderSucceeds ? apiJson(null) : apiFailureJson('Rejected')
      }),
      http.post(apiUrls.folders, () => apiJson(null)),
    )

    getHeaderButton('mdi-sort-variant').action?.()
    await nextTick()
    expect(getInstalledLabels().slice(0, 3)).toEqual(['plugin:插件 A', 'folder:Tools', 'plugin:插件 B'])
    await fireEvent.click(screen.getByRole('button', { name: 'reverse-plugin-order' }))
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledOnce())
    expect(getInstalledLabels().slice(0, 3)).toEqual(['plugin:插件 A', 'folder:Tools', 'plugin:插件 B'])

    orderSucceeds = true
    await fireEvent.click(screen.getByRole('button', { name: 'reverse-plugin-order' }))
    await waitFor(() =>
      expect(getInstalledLabels().slice(0, 3)).toEqual(['plugin:插件 B', 'folder:Tools', 'plugin:插件 A']),
    )
    expect(savedOrder).toEqual([
      { id: 'Plugin-B', order: 0, type: 'plugin' },
      { id: 'Tools', order: 1, type: 'folder' },
      { id: 'Plugin-A', order: 2, type: 'plugin' },
    ])
    await waitForRequestsToFinish()
  })

  it('reloads server ordering when folders fail after PluginOrder is persisted', async () => {
    let persistedOrder: unknown[] = [
      { id: 'Plugin-A', order: 0, type: 'plugin' },
      { id: 'Tools', order: 1, type: 'folder' },
      { id: 'Plugin-B', order: 2, type: 'plugin' },
    ]
    let folderReads = 0
    let orderReads = 0
    await renderList({
      folders: () => ({ Tools: [] }),
      installed: () => [
        createPlugin({ id: 'Plugin-A', installed: true, plugin_name: '插件 A' }),
        createPlugin({ id: 'Plugin-B', installed: true, plugin_name: '插件 B' }),
      ],
      order: persistedOrder,
    })
    await screen.findByText('folder:Tools')
    await waitForRequestsToFinish()
    server.use(
      http.get(apiUrls.order, () => {
        orderReads += 1
        return apiJson({ value: persistedOrder })
      }),
      http.get(apiUrls.folders, () => {
        folderReads += 1
        return apiJson({ Tools: [] })
      }),
      http.post(apiUrls.order, async ({ request }) => {
        persistedOrder = (await request.json()) as unknown[]
        return apiJson(null)
      }),
      http.post(apiUrls.folders, () => apiFailureJson('Rejected')),
    )

    getHeaderButton('mdi-sort-variant').action?.()
    await nextTick()
    await fireEvent.click(screen.getByRole('button', { name: 'reverse-plugin-order' }))

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledOnce())
    expect(orderReads).toBe(1)
    expect(folderReads).toBe(1)
    expect(getInstalledLabels().slice(0, 3)).toEqual(['plugin:插件 B', 'folder:Tools', 'plugin:插件 A'])
    expect(persistedOrder).toEqual([
      { id: 'Plugin-B', order: 0, type: 'plugin' },
      { id: 'Tools', order: 1, type: 'folder' },
      { id: 'Plugin-A', order: 2, type: 'plugin' },
    ])
    await waitForRequestsToFinish()
  })

  it('reloads both ordering sources when an internal folder sort is only partially persisted', async () => {
    let persistedOrder: unknown[] = [
      { id: 'Tools', order: 0, type: 'folder' },
      { id: 'Plugin-A', order: 0.1, type: 'plugin' },
      { id: 'Plugin-B', order: 0.2, type: 'plugin' },
    ]
    let folderReads = 0
    let orderReads = 0
    await renderList({
      folders: () => ({ Tools: ['Plugin-A', 'Plugin-B'] }),
      installed: () => [
        createPlugin({ id: 'Plugin-A', installed: true, plugin_name: '插件 A' }),
        createPlugin({ id: 'Plugin-B', installed: true, plugin_name: '插件 B' }),
      ],
      order: persistedOrder,
    })
    await screen.findByText('folder:Tools')
    await waitForRequestsToFinish()
    server.use(
      http.get(apiUrls.order, () => {
        orderReads += 1
        return apiJson({ value: persistedOrder })
      }),
      http.get(apiUrls.folders, () => {
        folderReads += 1
        return apiJson({ Tools: ['Plugin-A', 'Plugin-B'] })
      }),
      http.post(apiUrls.order, async ({ request }) => {
        persistedOrder = (await request.json()) as unknown[]
        return apiJson(null)
      }),
      http.post(apiUrls.folders, () => HttpResponse.json({ message: 'Rejected' }, { status: 500 })),
    )

    await fireEvent.click(screen.getByRole('button', { name: 'open-folder-Tools' }))
    getHeaderButton('mdi-sort-variant').action?.()
    await nextTick()
    await fireEvent.click(screen.getByRole('button', { name: 'reverse-plugin-order' }))

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledOnce())
    expect(orderReads).toBe(1)
    expect(folderReads).toBe(1)
    expect(getInstalledLabels().slice(0, 2)).toEqual(['plugin:插件 A', 'plugin:插件 B'])
    await waitForRequestsToFinish()
  })

  it('rolls back a failed folder drop and persists a later successful drop', async () => {
    let folderSaveSucceeds = false
    await renderList({
      folders: () => ({ Tools: [] }),
      installed: () => [createPlugin({ id: 'Plugin-A', installed: true, plugin_name: '插件 A' })],
      order: [
        { id: 'Plugin-A', order: 0, type: 'plugin' },
        { id: 'Tools', order: 1, type: 'folder' },
      ],
    })
    await screen.findByText('folder:Tools')
    await waitForRequestsToFinish()
    server.use(
      http.post(apiUrls.order, () => apiJson(null)),
      http.post(apiUrls.folders, () => (folderSaveSucceeds ? apiJson(null) : apiFailureJson('Rejected'))),
    )

    getHeaderButton('mdi-sort-variant').action?.()
    await nextTick()
    await fireEvent.click(screen.getByRole('button', { name: 'start-plugin-drag-0' }))
    await fireEvent.click(screen.getByRole('button', { name: 'drop-to-folder-Tools' }))
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledOnce())

    folderSaveSucceeds = true
    await fireEvent.click(screen.getByRole('button', { name: 'finish-plugin-drag' }))
    await waitFor(() => expect(screen.getByText('plugin:插件 A')).toBeInTheDocument())

    await fireEvent.click(screen.getByRole('button', { name: 'start-plugin-drag-0' }))
    await fireEvent.click(screen.getByRole('button', { name: 'drop-to-folder-Tools' }))
    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalledWith('插件已移动到文件夹 "Tools"'))
    await fireEvent.click(screen.getByRole('button', { name: 'finish-plugin-drag' }))
    await waitForRequestsToFinish()

    await fireEvent.click(screen.getByRole('button', { name: 'open-folder-Tools' }))
    expect(await screen.findByText('plugin:插件 A')).toBeInTheDocument()
  })

  it('rolls back folder-internal order and persists a later successful order', async () => {
    let orderSucceeds = false
    await renderList({
      folders: () => ({ Tools: ['Plugin-A', 'Plugin-B'] }),
      installed: () => [
        createPlugin({ id: 'Plugin-A', installed: true, plugin_name: '插件 A' }),
        createPlugin({ id: 'Plugin-B', installed: true, plugin_name: '插件 B' }),
      ],
      order: [
        { id: 'Tools', order: 0, type: 'folder' },
        { id: 'Plugin-A', order: 0.1, type: 'plugin' },
        { id: 'Plugin-B', order: 0.2, type: 'plugin' },
      ],
    })
    await screen.findByText('folder:Tools')
    await waitForRequestsToFinish()
    server.use(
      http.post(apiUrls.order, () => (orderSucceeds ? apiJson(null) : apiFailureJson('Rejected'))),
      http.post(apiUrls.folders, () => apiJson(null)),
    )

    await fireEvent.click(screen.getByRole('button', { name: 'open-folder-Tools' }))
    getHeaderButton('mdi-sort-variant').action?.()
    await nextTick()
    expect(getInstalledLabels().slice(0, 2)).toEqual(['plugin:插件 A', 'plugin:插件 B'])
    await fireEvent.click(screen.getByRole('button', { name: 'reverse-plugin-order' }))
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledOnce())
    expect(getInstalledLabels().slice(0, 2)).toEqual(['plugin:插件 A', 'plugin:插件 B'])

    orderSucceeds = true
    await fireEvent.click(screen.getByRole('button', { name: 'reverse-plugin-order' }))
    await waitFor(() => expect(getInstalledLabels().slice(0, 2)).toEqual(['plugin:插件 B', 'plugin:插件 A']))
    await waitForRequestsToFinish()

    getHeaderButton('mdi-arrow-left').action?.()
    expect(await screen.findByText('folder:Tools')).toBeInTheDocument()
  })
})
