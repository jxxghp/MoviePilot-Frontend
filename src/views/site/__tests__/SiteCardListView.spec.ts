import type { DynamicButtonMenuItem } from '@/composables/useDynamicButton'
import type { Site, SiteStatistic, SiteUserData } from '@/api/types'
import SiteCardListView from '@/views/site/SiteCardListView.vue'
import { DEFAULT_PERMISSIONS } from '@/utils/permission'
import { fireEvent, screen, waitFor } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { createSite, createSiteStatistic, createSiteUserData } from '@tests/support/factories/site'
import {
  saveSitePrioritiesHandler,
  siteListHandler,
  siteStatisticHandler,
  siteStatisticsHandler,
  siteUserDataLatestHandler,
} from '@tests/support/msw/handlers/site'
import { server } from '@tests/support/msw/server'
import { renderWithProviders } from '@tests/support/render'
import { defineComponent, h, nextTick, ref, unref, type ComputedRef, type PropType, type Ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  appMode: false,
  openSharedDialog: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  useDynamicButton: vi.fn(),
}))

vi.mock('vue-toastification', () => ({
  useToast: () => ({ error: mocks.toastError, success: mocks.toastSuccess }),
}))

vi.mock('@/composables/useDynamicButton', () => ({
  useDynamicButton: (options: unknown) => mocks.useDynamicButton(options),
}))

vi.mock('@/composables/usePWA', async () => {
  const { computed } = await import('vue')
  return { usePWA: () => ({ appMode: computed(() => mocks.appMode) }) }
})

vi.mock('@/composables/useSharedDialog', () => ({
  openSharedDialog: (...args: unknown[]) => mocks.openSharedDialog(...args),
}))

type MaybeRef<T> = T | Ref<T> | ComputedRef<T>

interface DynamicButtonConfig {
  menuItems: MaybeRef<DynamicButtonMenuItem[]>
  onClick: () => void
  show: MaybeRef<boolean>
}

const SiteCardStub = defineComponent({
  name: 'SiteCard',
  props: {
    data: Object as PropType<SiteUserData>,
    site: { type: Object as PropType<Site>, required: true },
    sortable: Boolean,
    stats: Object as PropType<SiteStatistic>,
  },
  emits: ['refresh-stats', 'remove', 'update'],
  setup(props, { emit }) {
    return () =>
      h('article', { 'data-testid': `site-card-${props.site.id}` }, [
        h('span', props.site.name),
        h('output', { 'aria-label': `site-domain-${props.site.id}` }, props.site.domain),
        h('output', { 'aria-label': `site-data-${props.site.id}` }, props.data?.username ?? ''),
        h('output', { 'aria-label': `site-state-${props.site.id}` }, JSON.stringify(props.stats ?? {})),
        h('output', { 'aria-label': `site-sortable-${props.site.id}` }, String(props.sortable)),
        h('button', { onClick: () => emit('remove'), type: 'button' }, `remove-${props.site.id}`),
        h('button', { onClick: () => emit('update'), type: 'button' }, `update-${props.site.id}`),
        h(
          'button',
          { onClick: () => emit('refresh-stats', props.site.domain), type: 'button' },
          `refresh-${props.site.id}`,
        ),
      ])
  },
})

const ProgressiveCardGridStub = defineComponent({
  name: 'ProgressiveCardGrid',
  props: { items: { type: Array as PropType<Site[]>, required: true } },
  setup(props, { slots }) {
    return () =>
      h(
        'section',
        { 'data-testid': 'site-grid' },
        props.items.flatMap(item => slots.default?.({ item }) ?? []),
      )
  },
})

const DraggableStub = defineComponent({
  name: 'Draggable',
  props: {
    disabled: Boolean,
    modelValue: { type: Array as PropType<Site[]>, required: true },
  },
  emits: ['end', 'update:modelValue'],
  setup(props, { emit, slots }) {
    async function reverseOrder() {
      if (props.disabled) return

      emit('update:modelValue', [...props.modelValue].reverse())
      await nextTick()
      emit('end')
    }
    return () =>
      h('section', { 'data-testid': 'site-draggable' }, [
        ...props.modelValue.flatMap(element => slots.item?.({ element }) ?? []),
        h('button', { disabled: props.disabled, onClick: reverseOrder, type: 'button' }, 'reverse-sites'),
        h('button', { onClick: () => emit('end'), type: 'button' }, 'emit-drag-end'),
      ])
  },
})

const LoadingBannerStub = defineComponent({
  name: 'LoadingBanner',
  template: '<div role="status">正在加载站点</div>',
})

const NoDataFoundStub = defineComponent({
  name: 'NoDataFound',
  props: { errorDescription: String, errorTitle: String },
  template: '<section aria-label="站点空态">{{ errorTitle }} {{ errorDescription }}<slot name="button" /></section>',
})

const IconButtonStub = defineComponent({
  name: 'IconBtn',
  inheritAttrs: false,
  setup(_props, { attrs, slots }) {
    return () => h('button', { ...attrs, type: 'button' }, slots.default?.())
  },
})

const IconStub = defineComponent({
  name: 'VIcon',
  props: { icon: String },
  setup(props) {
    return () => h('span', props.icon)
  },
})

const KeepAliveHost = defineComponent({
  name: 'SiteKeepAliveHost',
  components: { SiteCardListView },
  setup() {
    const active = ref(true)
    return { active }
  },
  template: `
    <button type="button" @click="active = false">停用站点页</button>
    <button type="button" @click="active = true">启用站点页</button>
    <KeepAlive><SiteCardListView v-if="active" /></KeepAlive>
  `,
})

interface RenderListOptions {
  appMode?: boolean
  initialRoute?: string
  listStatus?: number | (() => number)
  manage?: boolean
  sites?: Site[]
  statistics?: SiteStatistic[]
  statisticsStatus?: number
  onListRequest?: () => void | Promise<void>
  onStatisticsRequest?: () => void | Promise<void>
  onUserDataRequest?: () => void | Promise<void>
  userData?: SiteUserData[]
  useKeepAlive?: boolean
}

async function renderList(options: RenderListOptions = {}) {
  mocks.appMode = options.appMode ?? false
  server.use(
    siteListHandler(options.sites ?? [], options.listStatus ?? 200, options.onListRequest),
    siteStatisticsHandler(options.statistics ?? [], options.statisticsStatus ?? 200, options.onStatisticsRequest),
    siteUserDataLatestHandler(options.userData ?? [], 200, options.onUserDataRequest),
  )

  return renderWithProviders(options.useKeepAlive ? KeepAliveHost : SiteCardListView, {
    initialRoute: options.initialRoute ?? '/site',
    initialState: {
      user: {
        permissions: { ...DEFAULT_PERMISSIONS, manage: options.manage ?? true },
        superUser: false,
      },
    },
    global: {
      stubs: {
        IconBtn: IconButtonStub,
        LoadingBanner: LoadingBannerStub,
        NoDataFound: NoDataFoundStub,
        ProgressiveCardGrid: ProgressiveCardGridStub,
        SiteCard: SiteCardStub,
        VFab: IconButtonStub,
        VIcon: IconStub,
        VPageContentTitle: true,
        draggable: DraggableStub,
      },
    },
  })
}

function getDynamicButtonConfig() {
  return mocks.useDynamicButton.mock.calls.at(-1)?.[0] as DynamicButtonConfig
}

function getMenuItem(titleKey: string) {
  const item = unref(getDynamicButtonConfig().menuItems).find(candidate => candidate.titleKey === titleKey)
  if (!item) throw new Error(`未注册动态操作 ${titleKey}`)
  return item
}

async function selectFilter(label: string) {
  await fireEvent.click(screen.getByText('mdi-filter-multiple-outline'))
  await fireEvent.click(await screen.findByText(label))
}

function readBlob(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.addEventListener('load', () => resolve(String(reader.result ?? '')))
    reader.addEventListener('error', () => reject(reader.error))
    reader.readAsText(blob)
  })
}

describe('SiteCardListView', () => {
  beforeEach(() => {
    mocks.appMode = false
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('loads sites with statistics and maps latest user data by domain', async () => {
    const fast = createSite({ id: 101, name: '快速站点', domain: 'fast.example.com' })
    const failed = createSite({ id: 102, name: '失败站点', domain: 'failed.example.com' })

    await renderList({
      sites: [fast, failed],
      statistics: [
        createSiteStatistic({ domain: fast.domain, seconds: 1, lst_state: 0 }),
        createSiteStatistic({ domain: failed.domain, lst_state: 1 }),
      ],
      userData: [createSiteUserData({ domain: fast.domain, username: 'fast-user' })],
    })

    expect(await screen.findByText('快速站点')).toBeInTheDocument()
    expect(screen.getByText('失败站点')).toBeInTheDocument()
    expect(screen.getByLabelText('site-data-101')).toHaveTextContent('fast-user')
    expect(screen.getByLabelText('site-data-102')).toBeEmptyDOMElement()
    expect(screen.getByLabelText('site-state-101')).toHaveTextContent('"seconds":1')
    expect(screen.getByLabelText('site-state-102')).toHaveTextContent('"lst_state":1')
  })

  it('keeps a successful site list when loading statistics fails', async () => {
    const site = createSite({ id: 111, name: '无统计站点' })
    await renderList({ sites: [site], statisticsStatus: 500 })

    expect(await screen.findByText('无统计站点')).toBeInTheDocument()
    expect(screen.getByLabelText('site-state-111')).toHaveTextContent('{}')
    expect(screen.queryByRole('region', { name: '站点空态' })).not.toBeInTheDocument()
  })

  it.each([
    ['激活', '快速站点'],
    ['未激活', '停用站点'],
    ['连接正常', '快速站点'],
    ['连接缓慢', '缓慢站点'],
    ['连接失败', '失败站点'],
    ['连接未知', '未知站点'],
  ])('filters %s sites using active and statistic state', async (filterLabel, expectedSite) => {
    const sites = [
      createSite({ id: 201, name: '快速站点', domain: 'fast.example.com', is_active: true }),
      createSite({ id: 202, name: '停用站点', domain: 'inactive.example.com', is_active: false }),
      createSite({ id: 203, name: '缓慢站点', domain: 'slow.example.com', is_active: true }),
      createSite({ id: 204, name: '失败站点', domain: 'failed.example.com', is_active: true }),
      createSite({ id: 205, name: '未知站点', domain: 'unknown.example.com', is_active: true }),
    ]
    await renderList({
      sites,
      statistics: [
        createSiteStatistic({ domain: 'fast.example.com', lst_state: 0, seconds: 1 }),
        createSiteStatistic({ domain: 'inactive.example.com', lst_state: 0, seconds: 1 }),
        createSiteStatistic({ domain: 'slow.example.com', lst_state: 0, seconds: 5 }),
        createSiteStatistic({ domain: 'failed.example.com', lst_state: 1 }),
      ],
    })
    expect(await screen.findByText('快速站点')).toBeInTheDocument()

    await selectFilter(filterLabel)

    expect(screen.getByText(expectedSite)).toBeInTheDocument()
    const visibleCards = screen.getAllByTestId(/^site-card-/)
    if (filterLabel === '激活') expect(visibleCards).toHaveLength(4)
    else if (filterLabel === '连接正常') expect(visibleCards).toHaveLength(2)
    else expect(visibleCards).toHaveLength(1)
  })

  it('reorders only the complete list and posts exact priorities', async () => {
    const saved = vi.fn()
    const first = createSite({ id: 301, name: '第一站' })
    const second = createSite({ id: 302, name: '第二站' })
    server.use(saveSitePrioritiesHandler(saved))
    await renderList({ sites: [first, second] })
    expect(await screen.findByText('第一站')).toBeInTheDocument()

    await fireEvent.click(screen.getByText('mdi-sort-variant'))
    expect(screen.getByText('已进入拖拽排序模式')).toBeInTheDocument()
    await fireEvent.click(screen.getByText('reverse-sites'))

    await waitFor(() =>
      expect(saved).toHaveBeenCalledWith([
        { id: 302, pri: 1 },
        { id: 301, pri: 2 },
      ]),
    )
    expect(screen.getByLabelText('site-sortable-302')).toHaveTextContent('true')

    await selectFilter('未激活')
    expect(screen.queryByText('已进入拖拽排序模式')).not.toBeInTheDocument()
  })

  it('locks drag interactions until the submitted priority order is confirmed', async () => {
    let resolveSave: (() => void) | undefined
    const savePending = new Promise<void>(resolve => {
      resolveSave = resolve
    })
    const saved = vi.fn(async () => savePending)
    const first = createSite({ id: 306, name: '锁定第一站' })
    const second = createSite({ id: 307, name: '锁定第二站' })
    server.use(saveSitePrioritiesHandler(saved))
    await renderList({ sites: [first, second] })
    expect(await screen.findByText('锁定第一站')).toBeInTheDocument()

    await fireEvent.click(screen.getByText('mdi-sort-variant'))
    const reverseButton = screen.getByRole('button', { name: 'reverse-sites' })
    await fireEvent.click(reverseButton)

    await waitFor(() => expect(saved).toHaveBeenCalledOnce())
    expect(reverseButton).toBeDisabled()
    expect(screen.getAllByTestId(/^site-card-/).map(card => card.textContent)).toEqual([
      expect.stringContaining('锁定第二站'),
      expect.stringContaining('锁定第一站'),
    ])

    await fireEvent.click(reverseButton)
    await fireEvent.click(screen.getByRole('button', { name: 'emit-drag-end' }))
    expect(saved).toHaveBeenCalledOnce()
    expect(screen.getAllByTestId(/^site-card-/).map(card => card.textContent)).toEqual([
      expect.stringContaining('锁定第二站'),
      expect.stringContaining('锁定第一站'),
    ])

    resolveSave?.()
    await waitFor(() => expect(reverseButton).toBeEnabled())
    expect(screen.getAllByTestId(/^site-card-/).map(card => card.textContent)).toEqual([
      expect.stringContaining('锁定第二站'),
      expect.stringContaining('锁定第一站'),
    ])
  })

  it('restores the server order when saving priorities fails with an HTTP error', async () => {
    const first = createSite({ id: 311, name: '服务端第一站' })
    const second = createSite({ id: 312, name: '服务端第二站' })
    const listRequests = vi.fn()
    server.use(saveSitePrioritiesHandler(() => {}, { status: 500 }))
    await renderList({ onListRequest: listRequests, sites: [first, second] })
    expect(await screen.findByText('服务端第一站')).toBeInTheDocument()

    await fireEvent.click(screen.getByText('mdi-sort-variant'))
    await fireEvent.click(screen.getByText('reverse-sites'))

    await waitFor(() => expect(listRequests).toHaveBeenCalledTimes(2))
    expect(screen.getAllByTestId(/^site-card-/).map(card => card.textContent)).toEqual([
      expect.stringContaining('服务端第一站'),
      expect.stringContaining('服务端第二站'),
    ])
  })

  it('restores the last confirmed order when both saving and reloading fail', async () => {
    const first = createSite({ id: 316, name: '确认第一站' })
    const second = createSite({ id: 317, name: '确认第二站' })
    const listRequests = vi.fn()
    const statisticsRequests = vi.fn()
    let listResponse = 0
    server.use(saveSitePrioritiesHandler(() => {}, { status: 500 }))
    await renderList({
      listStatus: () => (listResponse++ === 0 ? 200 : 500),
      onListRequest: listRequests,
      onStatisticsRequest: statisticsRequests,
      sites: [first, second],
    })
    expect(await screen.findByText('确认第一站')).toBeInTheDocument()

    await fireEvent.click(screen.getByText('mdi-sort-variant'))
    await fireEvent.click(screen.getByText('reverse-sites'))

    await waitFor(() => expect(listRequests).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(statisticsRequests).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(console.error).toHaveBeenCalledTimes(2))
    await waitFor(() =>
      expect(screen.getAllByTestId(/^site-card-/).map(card => card.textContent)).toEqual([
        expect.stringContaining('确认第一站'),
        expect.stringContaining('确认第二站'),
      ]),
    )
  })

  it('restores the server order when saving priorities is rejected', async () => {
    const first = createSite({ id: 321, name: '业务第一站' })
    const second = createSite({ id: 322, name: '业务第二站' })
    const listRequests = vi.fn()
    server.use(saveSitePrioritiesHandler(() => {}, { success: false }))
    await renderList({ onListRequest: listRequests, sites: [first, second] })
    expect(await screen.findByText('业务第一站')).toBeInTheDocument()

    await fireEvent.click(screen.getByText('mdi-sort-variant'))
    await fireEvent.click(screen.getByText('reverse-sites'))

    await waitFor(() => expect(listRequests).toHaveBeenCalledTimes(2))
    expect(screen.getAllByTestId(/^site-card-/).map(card => card.textContent)).toEqual([
      expect.stringContaining('业务第一站'),
      expect.stringContaining('业务第二站'),
    ])
  })

  it('refreshes one site statistic without reloading the site list', async () => {
    const site = createSite({ id: 331, name: '统计站点', domain: 'stats.example.com' })
    const listRequests = vi.fn()
    const statisticRequests = vi.fn()
    server.use(
      siteStatisticHandler(
        site.domain,
        createSiteStatistic({ domain: site.domain, seconds: 8, lst_state: 0 }),
        200,
        statisticRequests,
      ),
    )
    await renderList({
      onListRequest: listRequests,
      sites: [site],
      statistics: [createSiteStatistic({ domain: site.domain, seconds: 1, lst_state: 0 })],
    })
    expect(await screen.findByLabelText('site-state-331')).toHaveTextContent('"seconds":1')

    await fireEvent.click(screen.getByRole('button', { name: 'refresh-331' }))

    await waitFor(() => expect(screen.getByLabelText('site-state-331')).toHaveTextContent('"seconds":8'))
    expect(statisticRequests).toHaveBeenCalledOnce()
    expect(listRequests).toHaveBeenCalledOnce()
  })

  it.each(['remove', 'update'])('reloads the site list after a card %s event', async eventName => {
    const listRequests = vi.fn()
    const site = createSite({ id: 341, name: '事件站点' })
    await renderList({ onListRequest: listRequests, sites: [site] })
    expect(await screen.findByText('事件站点')).toBeInTheDocument()

    await fireEvent.click(screen.getByRole('button', { name: `${eventName}-341` }))

    await waitFor(() => expect(listRequests).toHaveBeenCalledTimes(2))
  })

  it('opens add, import and statistics dialogs with their declared event contracts', async () => {
    const site = createSite({ id: 401, name: '弹窗站点' })
    const listRequests = vi.fn()
    await renderList({ onListRequest: listRequests, sites: [site] })
    expect(await screen.findByText('弹窗站点')).toBeInTheDocument()

    getDynamicButtonConfig().onClick()
    getMenuItem('site.actions.import').action()
    getMenuItem('site.statistics').action()

    expect(mocks.openSharedDialog).toHaveBeenCalledTimes(3)
    expect(mocks.openSharedDialog.mock.calls[0]?.[1]).toEqual({ oper: 'add' })
    expect(mocks.openSharedDialog.mock.calls[0]?.[3]).toEqual({ closeOn: ['close', 'save'] })
    expect(mocks.openSharedDialog.mock.calls[1]?.[2]).toHaveProperty('import-success')
    expect(mocks.openSharedDialog.mock.calls[2]?.[1]).toEqual({ sites: [site] })

    const save = mocks.openSharedDialog.mock.calls[0]?.[2]?.save as () => void
    save()
    await waitFor(() => expect(listRequests).toHaveBeenCalledTimes(2))
  })

  it('shows management actions only on the site route for users with manage permission', async () => {
    await renderList({ manage: false, sites: [createSite()] })
    expect(await screen.findByTestId(/^site-card-/)).toBeInTheDocument()
    expect(unref(getDynamicButtonConfig().show)).toBe(false)
    expect(document.querySelector('.compact-fab-stack')).not.toBeInTheDocument()
  })

  it('registers the app-mode dynamic menu after the first successful load', async () => {
    await renderList({ appMode: true, sites: [createSite()] })
    expect(await screen.findByTestId(/^site-card-/)).toBeInTheDocument()

    expect(unref(getDynamicButtonConfig().show)).toBe(true)
    expect(unref(getDynamicButtonConfig().menuItems).map(item => item.titleKey)).toEqual([
      'site.actions.add',
      'site.actions.import',
      'site.actions.export',
      'site.statistics',
    ])
  })

  it('exports the current complete site fields and releases the object URL', async () => {
    const site = createSite({
      apikey: 'api-key',
      cookie: 'cookie-value',
      id: 501,
      name: '导出站点',
      token: 'token-value',
    })
    const createObjectURL = vi.fn<(blob: Blob) => string>(() => 'blob:site-export')
    const revokeObjectURL = vi.fn()
    class TestURL extends URL {}
    TestURL.createObjectURL = createObjectURL
    TestURL.revokeObjectURL = revokeObjectURL
    vi.stubGlobal('URL', TestURL)
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    await renderList({ sites: [site] })
    expect(await screen.findByText('导出站点')).toBeInTheDocument()

    await getMenuItem('site.actions.export').action()

    await waitFor(() => expect(createObjectURL).toHaveBeenCalledOnce())
    const blob = createObjectURL.mock.calls[0]?.[0] as Blob
    const body = JSON.parse(await readBlob(blob)) as Array<Record<string, unknown>>
    expect(body).toEqual([
      expect.objectContaining({
        apikey: 'api-key',
        cookie: 'cookie-value',
        domain: site.domain,
        name: '导出站点',
        token: 'token-value',
        url: site.url,
      }),
    ])
    expect(body[0]).not.toHaveProperty('id')
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:site-export')
    expect(mocks.toastSuccess).toHaveBeenCalledWith('站点导出成功')
  })

  it('reports an export failure without creating a download', async () => {
    const createObjectURL = vi.fn()
    class TestURL extends URL {}
    TestURL.createObjectURL = createObjectURL
    vi.stubGlobal('URL', TestURL)
    await renderList({ sites: [createSite({ name: '不可导出站点' })] })
    expect(await screen.findByText('不可导出站点')).toBeInTheDocument()
    server.use(siteListHandler([], 500))

    await getMenuItem('site.actions.export').action()

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('站点导出失败'))
    expect(createObjectURL).not.toHaveBeenCalled()
  })

  it('shows the empty state after a successful empty response', async () => {
    await renderList()

    expect(await screen.findByRole('region', { name: '站点空态' })).toHaveTextContent(
      '没有站点 已添加并支持的站点将会在这里显示。',
    )
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('shows a retryable error after the initial site request fails', async () => {
    await renderList({ listStatus: 500 })

    expect(await screen.findByRole('region', { name: '站点空态' })).toHaveTextContent('服务器连接失败')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()

    server.use(siteListHandler([createSite({ name: '重试恢复站点' })]))
    await fireEvent.click(screen.getByRole('button', { name: '重试' }))

    expect(await screen.findByText('重试恢复站点')).toBeInTheDocument()
  })

  it('refreshes list, statistics and latest user data after KeepAlive reactivation', async () => {
    const listRequests = vi.fn()
    const statsRequests = vi.fn()
    const userDataRequests = vi.fn()
    await renderList({
      onListRequest: listRequests,
      onStatisticsRequest: statsRequests,
      onUserDataRequest: userDataRequests,
      sites: [createSite({ name: '缓存站点' })],
      useKeepAlive: true,
    })
    expect(await screen.findByText('缓存站点')).toBeInTheDocument()
    expect(listRequests).toHaveBeenCalledOnce()

    await userEvent.click(screen.getByText('停用站点页'))
    await userEvent.click(screen.getByText('启用站点页'))

    await waitFor(() => expect(listRequests).toHaveBeenCalledTimes(2))
    expect(statsRequests).toHaveBeenCalledTimes(2)
    expect(userDataRequests).toHaveBeenCalledTimes(2)
  })

  it('keeps the existing list when a silent KeepAlive refresh fails', async () => {
    const listRequests = vi.fn()
    let listResponse = 0
    await renderList({
      listStatus: () => (listResponse++ === 0 ? 200 : 500),
      onListRequest: listRequests,
      sites: [createSite({ name: '静默刷新保留站点' })],
      useKeepAlive: true,
    })
    expect(await screen.findByText('静默刷新保留站点')).toBeInTheDocument()

    await userEvent.click(screen.getByText('停用站点页'))
    await userEvent.click(screen.getByText('启用站点页'))

    await waitFor(() => expect(listRequests).toHaveBeenCalledTimes(2))
    expect(screen.getByText('静默刷新保留站点')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: '站点空态' })).not.toBeInTheDocument()
  })
})
