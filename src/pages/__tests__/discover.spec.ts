import DiscoverPage from '@/pages/discover.vue'
import type { DiscoverSource } from '@/api/types'
import { DEFAULT_PERMISSIONS } from '@/utils/permission'
import { fireEvent, waitFor } from '@testing-library/vue'
import { renderWithProviders } from '@tests/support/render'
import {
  discoverApiUrls,
  discoverOrderConfigHandler,
  discoverSourcesHandler,
  saveDiscoverOrderHandler,
  type DiscoverTabConfigItem,
} from '@tests/support/msw/handlers/discover'
import { server } from '@tests/support/msw/server'
import { HttpResponse, http } from 'msw'
import { defineComponent, h, ref, unref, type ComputedRef, type Ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

interface HeaderTabItem {
  tab: string
  title: string
}

interface HeaderTabConfig {
  appendButtons?: Array<{ action: () => void }>
  items: ComputedRef<HeaderTabItem[]> | Ref<HeaderTabItem[]> | HeaderTabItem[]
  modelValue: Ref<string>
}

interface DiscoverTabSettingsPayload {
  enabled: Record<string, boolean>
  tabs: DiscoverSource[]
}

interface SharedDialogEvents {
  close: () => void
  save: (settings: DiscoverTabSettingsPayload) => Promise<void>
  'update:modelValue': (value: boolean) => void
}

interface SharedDialogController {
  close: ReturnType<typeof vi.fn>
  id: number
  updateProps: ReturnType<typeof vi.fn>
}

const mocks = vi.hoisted(() => ({
  controllers: [] as SharedDialogController[],
  openSharedDialog: vi.fn(),
  registerHeaderTab: vi.fn(),
  toastError: vi.fn(),
  useDynamicButton: vi.fn(),
}))

vi.mock('@/composables/useDynamicHeaderTab', () => ({
  useDynamicHeaderTab: () => ({ registerHeaderTab: mocks.registerHeaderTab }),
}))

vi.mock('@/composables/useDynamicButton', () => ({
  useDynamicButton: (options: unknown) => mocks.useDynamicButton(options),
}))

vi.mock('@/composables/usePWA', async () => {
  const { ref } = await import('vue')
  return {
    usePWA: () => ({ appMode: ref(false) }),
  }
})

vi.mock('@/composables/useSharedDialog', () => ({
  openSharedDialog: (...args: unknown[]) => mocks.openSharedDialog(...args),
}))

vi.mock('vue-toastification', () => ({
  useToast: () => ({ error: mocks.toastError }),
}))

const BuiltInViewStub = defineComponent({
  name: 'BuiltInViewStub',
  setup: () => () => h('section', '内置发现内容'),
})

const ExtraSourceViewStub = defineComponent({
  name: 'ExtraSourceView',
  props: {
    source: { type: Object, required: true },
  },
  setup(props) {
    return () => h('section', { 'data-testid': 'extra-source' }, (props.source as DiscoverSource).name)
  },
})

function createSource(name: string, prefix: string, apiPath = `discover/${prefix}`): DiscoverSource {
  return {
    api_path: apiPath,
    filter_params: { type: prefix },
    filter_ui: [],
    mediaid_prefix: prefix,
    name,
  }
}

function keepAliveHarness() {
  return defineComponent({
    components: { DiscoverPage },
    setup() {
      const active = ref(true)
      return { active }
    },
    template: `
      <button type="button" @click="active = false">停用发现页</button>
      <button type="button" @click="active = true">启用发现页</button>
      <KeepAlive><DiscoverPage v-if="active" /></KeepAlive>
    `,
  })
}

async function renderDiscover(options: { discovery?: boolean; superUser?: boolean } = {}) {
  const componentError = vi.fn()
  const result = await renderWithProviders(keepAliveHarness(), {
    initialRoute: '/discover',
    initialState: {
      user: {
        permissions: { ...DEFAULT_PERMISSIONS, discovery: options.discovery ?? true },
        superUser: options.superUser ?? false,
      },
    },
    global: {
      config: {
        errorHandler: componentError,
      },
      stubs: {
        AniListView: BuiltInViewStub,
        BangumiView: BuiltInViewStub,
        DoubanView: BuiltInViewStub,
        ExtraSourceView: ExtraSourceViewStub,
        MusicView: BuiltInViewStub,
        TheMovieDbView: BuiltInViewStub,
        VScrollToTopBtn: true,
      },
    },
  })

  return { ...result, componentError }
}

function getHeaderConfig() {
  const config = mocks.registerHeaderTab.mock.calls[0]?.[0] as HeaderTabConfig | undefined
  if (!config) throw new Error('发现页未注册动态标签')
  return config
}

function getHeaderItems() {
  return unref(getHeaderConfig().items)
}

function getDialogCall(index = 0) {
  const call = mocks.openSharedDialog.mock.calls[index]
  if (!call) throw new Error(`未找到第 ${index + 1} 个排序弹窗`)
  return {
    enabled: (call[1] as { enabled: Record<string, boolean> }).enabled,
    events: call[2] as SharedDialogEvents,
    tabs: (call[1] as { tabs: DiscoverSource[] }).tabs,
  }
}

function getSettingsButton() {
  const button = document.querySelector<HTMLButtonElement>('.compact-fab')
  if (!button) throw new Error('未找到探索设置 FAB')
  return button
}

async function reactivateDiscover() {
  await fireEvent.click(document.querySelector('button') as HTMLButtonElement)
  const buttons = Array.from(document.querySelectorAll('button'))
  const activate = buttons.find(button => button.textContent === '启用发现页')
  if (!activate) throw new Error('未找到启用发现页按钮')
  await fireEvent.click(activate)
}

describe('discover page', () => {
  beforeEach(() => {
    mocks.controllers.length = 0
    server.use(discoverOrderConfigHandler(null))
    mocks.openSharedDialog.mockImplementation(() => {
      const controller: SharedDialogController = {
        close: vi.fn(),
        id: mocks.controllers.length + 1,
        updateProps: vi.fn(),
      }
      mocks.controllers.push(controller)
      return controller
    })
  })

  it('falls back to legacy local order when the server has no config and keeps new tabs visible', async () => {
    const configRequested = vi.fn()
    localStorage.setItem('MP_DISCOVER_TAB_ORDER', JSON.stringify([{ name: '豆瓣' }, { name: '自定义来源' }]))
    server.use(
      discoverOrderConfigHandler(null, 200, configRequested),
      discoverSourcesHandler([
        createSource('自定义来源', 'custom'),
        createSource('重复自定义来源', 'custom'),
        createSource('伪豆瓣', 'douban'),
      ]),
    )

    await renderDiscover()

    await waitFor(() =>
      expect(getHeaderItems().map(item => item.title)).toEqual([
        '豆瓣',
        '自定义来源',
        'TheMovieDb',
        'Bangumi',
        'AniList',
        'MusicBrainz',
      ]),
    )
    expect(configRequested).toHaveBeenCalledOnce()
    expect(getHeaderItems().map(item => item.tab)).toEqual([
      'douban',
      'custom',
      'themoviedb',
      'bangumi',
      'anilist',
      'musicbrainz',
    ])
  })

  it('loads remote order when local order is absent and backfills localStorage', async () => {
    const configRequested = vi.fn()
    const remoteOrder = [{ name: 'Bangumi' }, { name: 'TheMovieDb' }]
    server.use(
      discoverOrderConfigHandler(remoteOrder, 200, configRequested),
      discoverSourcesHandler([createSource('自定义来源', 'custom')]),
    )

    await renderDiscover()

    await waitFor(() => expect(configRequested).toHaveBeenCalledOnce())
    await waitFor(() =>
      expect(getHeaderItems().map(item => item.title)).toEqual([
        'Bangumi',
        'TheMovieDb',
        '豆瓣',
        'AniList',
        'MusicBrainz',
        '自定义来源',
      ]),
    )
    expect(JSON.parse(localStorage.getItem('MP_DISCOVER_TAB_ORDER') ?? 'null')).toEqual(
      remoteOrder.map(item => ({ enabled: true, name: item.name })),
    )
  })

  it('uses the server config over a stale browser cache and hides disabled tabs', async () => {
    localStorage.setItem(
      'MP_DISCOVER_TAB_ORDER',
      JSON.stringify([
        { enabled: true, mediaid_prefix: 'douban', name: '豆瓣' },
        { enabled: true, mediaid_prefix: 'themoviedb', name: 'TheMovieDb' },
      ]),
    )
    const remoteConfig: DiscoverTabConfigItem[] = [
      { enabled: false, mediaid_prefix: 'douban', name: '豆瓣' },
      { enabled: true, mediaid_prefix: 'musicbrainz', name: '音乐' },
      { enabled: true, mediaid_prefix: 'themoviedb', name: 'TheMovieDb' },
    ]
    server.use(discoverOrderConfigHandler(remoteConfig), discoverSourcesHandler([]))

    await renderDiscover()

    await waitFor(() =>
      expect(getHeaderItems().map(item => item.title)).toEqual(['MusicBrainz', 'TheMovieDb', 'Bangumi', 'AniList']),
    )
    expect(getHeaderConfig().modelValue.value).toBe('musicbrainz')
    expect(localStorage.getItem('MP_DISCOVER_TAB_ORDER')).toBe(JSON.stringify(remoteConfig))
  })

  it('falls back to remote order when local JSON is malformed', async () => {
    const configRequested = vi.fn()
    const remoteOrder = [{ name: 'Bangumi' }, { name: 'TheMovieDb' }]
    localStorage.setItem('MP_DISCOVER_TAB_ORDER', '{malformed')
    server.use(discoverOrderConfigHandler(remoteOrder, 200, configRequested), discoverSourcesHandler([]))

    const { componentError } = await renderDiscover()

    await waitFor(() => expect(configRequested).toHaveBeenCalledOnce())
    await waitFor(() =>
      expect(getHeaderItems().map(item => item.title)).toEqual([
        'Bangumi',
        'TheMovieDb',
        '豆瓣',
        'AniList',
        'MusicBrainz',
      ]),
    )
    expect(JSON.parse(localStorage.getItem('MP_DISCOVER_TAB_ORDER') ?? 'null')).toEqual(
      remoteOrder.map(item => ({ enabled: true, name: item.name })),
    )
    expect(componentError).not.toHaveBeenCalled()
  })

  it('keeps built-in and extra sources usable when the order config request fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})
    server.use(discoverOrderConfigHandler(null, 500), discoverSourcesHandler([createSource('可用扩展源', 'available')]))

    await renderDiscover()

    await waitFor(() => expect(getHeaderItems().map(item => item.title)).toContain('可用扩展源'))
    expect(getHeaderItems().map(item => item.title)).toEqual([
      'TheMovieDb',
      '豆瓣',
      'Bangumi',
      'AniList',
      'MusicBrainz',
      '可用扩展源',
    ])
    expect(getHeaderConfig().modelValue.value).toBe('themoviedb')
  })

  it('reuses the source request during initial KeepAlive activation', async () => {
    const requested = vi.fn()
    let releaseResponse = () => {}
    const responseGate = new Promise<void>(resolve => {
      releaseResponse = resolve
    })
    localStorage.setItem('MP_DISCOVER_TAB_ORDER', JSON.stringify([]))
    server.use(
      discoverSourcesHandler([createSource('延迟来源', 'delayed')], 200, async () => {
        requested()
        await responseGate
      }),
    )

    await renderDiscover()
    await waitFor(() => expect(requested).toHaveBeenCalled())
    await new Promise(resolve => window.setTimeout(resolve, 25))

    const requestCount = requested.mock.calls.length
    releaseResponse()
    await waitFor(() => expect(getHeaderItems().map(item => item.title)).toContain('延迟来源'))

    expect(requestCount).toBe(1)
  })

  it('does not refetch sources when the initial response settles before activation', async () => {
    const requested = vi.fn()
    localStorage.setItem('MP_DISCOVER_TAB_ORDER', JSON.stringify([]))
    server.use(discoverSourcesHandler([createSource('快速来源', 'fast')], 200, requested))

    await renderDiscover()
    await waitFor(() => expect(getHeaderItems().map(item => item.title)).toContain('快速来源'))
    await new Promise(resolve => window.setTimeout(resolve, 25))

    expect(requested).toHaveBeenCalledOnce()
  })

  it('removes a withdrawn source and falls back to the first sorted tab after reactivation', async () => {
    let sources = [createSource('已撤销来源', 'withdrawn')]
    const requested = vi.fn()
    localStorage.setItem('MP_DISCOVER_TAB_ORDER', JSON.stringify([{ name: '已撤销来源' }, { name: 'TheMovieDb' }]))
    server.use(
      http.get(discoverApiUrls.sources, () => {
        requested()
        return HttpResponse.json(sources)
      }),
    )
    await renderDiscover()
    await waitFor(() => expect(getHeaderItems().map(item => item.title)).toContain('已撤销来源'))
    await waitFor(() => expect(getHeaderConfig().modelValue.value).toBe('withdrawn'))
    const requestsBeforeReactivation = requested.mock.calls.length
    sources = []

    await reactivateDiscover()

    await waitFor(() => expect(requested).toHaveBeenCalledTimes(requestsBeforeReactivation + 1))
    await waitFor(() => expect(getHeaderItems().map(item => item.title)).not.toContain('已撤销来源'))
    await waitFor(() => expect(getHeaderConfig().modelValue.value).toBe('themoviedb'))
  })

  it('keeps the last successful source snapshot when reactivation fails', async () => {
    let status = 200
    const requested = vi.fn()
    localStorage.setItem('MP_DISCOVER_TAB_ORDER', JSON.stringify([]))
    vi.spyOn(console, 'log').mockImplementation(() => {})
    server.use(
      http.get(discoverApiUrls.sources, () => {
        requested()
        return HttpResponse.json(status === 200 ? [createSource('缓存来源', 'cached')] : [], { status })
      }),
    )
    await renderDiscover()
    await waitFor(() => expect(getHeaderItems().map(item => item.title)).toContain('缓存来源'))
    const requestsBeforeReactivation = requested.mock.calls.length
    status = 500

    await reactivateDiscover()

    await waitFor(() => expect(requested).toHaveBeenCalledTimes(requestsBeforeReactivation + 1))
    expect(getHeaderItems().map(item => item.title)).toContain('缓存来源')
    expect(getHeaderItems().map(item => item.title)).toEqual([
      'TheMovieDb',
      '豆瓣',
      'Bangumi',
      'AniList',
      'MusicBrainz',
      '缓存来源',
    ])
  })

  it('replaces the header metadata when a source with the same prefix changes', async () => {
    let sources = [createSource('旧来源名称', 'mutable', 'discover/old')]
    const requested = vi.fn()
    localStorage.setItem('MP_DISCOVER_TAB_ORDER', JSON.stringify([]))
    server.use(
      http.get(discoverApiUrls.sources, () => {
        requested()
        return HttpResponse.json(sources)
      }),
    )
    await renderDiscover()
    await waitFor(() => expect(getHeaderItems().map(item => item.title)).toContain('旧来源名称'))
    const requestsBeforeReactivation = requested.mock.calls.length
    sources = [createSource('新来源名称', 'mutable', 'discover/new')]

    await reactivateDiscover()

    await waitFor(() => expect(requested).toHaveBeenCalledTimes(requestsBeforeReactivation + 1))
    await waitFor(() => expect(getHeaderItems().map(item => item.title)).toContain('新来源名称'))
    expect(getHeaderItems().map(item => item.title)).not.toContain('旧来源名称')
  })

  it('registers the settings entry in the Footer area and renders the matching desktop FAB', async () => {
    const sourcesRequested = vi.fn()
    localStorage.setItem('MP_DISCOVER_TAB_ORDER', JSON.stringify([]))
    server.use(discoverSourcesHandler([], 200, sourcesRequested))

    await renderDiscover()
    await waitFor(() => expect(sourcesRequested).toHaveBeenCalledOnce())

    expect(getHeaderConfig().appendButtons).toBeUndefined()
    expect(mocks.useDynamicButton).toHaveBeenCalledWith(
      expect.objectContaining({ icon: 'mdi-tune', permission: 'discovery' }),
    )
    expect(getSettingsButton()).toHaveAccessibleName('自定义探索标签')
  })

  it.each([
    { discovery: false, superUser: false, visible: false },
    { discovery: false, superUser: true, visible: true },
  ])('applies discovery permission to the desktop settings entry', async ({ discovery, superUser, visible }) => {
    const sourcesRequested = vi.fn()
    localStorage.setItem('MP_DISCOVER_TAB_ORDER', JSON.stringify([]))
    server.use(discoverSourcesHandler([], 200, sourcesRequested))

    await renderDiscover({ discovery, superUser })
    await waitFor(() => expect(sourcesRequested).toHaveBeenCalledOnce())

    expect(Boolean(document.querySelector('.compact-fab'))).toBe(visible)
  })

  it('saves the exact order and visibility through the shared dialog boundary', async () => {
    const savedConfigs: DiscoverTabConfigItem[][] = []
    localStorage.setItem('MP_DISCOVER_TAB_ORDER', JSON.stringify([]))
    server.use(
      discoverSourcesHandler([createSource('自定义来源', 'custom')]),
      saveDiscoverOrderHandler(config => {
        savedConfigs.push(config)
      }),
    )
    await renderDiscover()
    await waitFor(() => expect(getHeaderItems().map(item => item.title)).toContain('自定义来源'))

    getSettingsButton().click()
    const { enabled, events, tabs } = getDialogCall()
    const reorderedTabs = [tabs[4], tabs[1], tabs[0], tabs[3], tabs[2], tabs[5]]
    const nextEnabled: Record<string, boolean> = { ...enabled, themoviedb: false }
    await events.save({ enabled: nextEnabled, tabs: reorderedTabs })

    const expectedConfig = reorderedTabs.map(item => ({
      enabled: nextEnabled[item.mediaid_prefix] !== false,
      mediaid_prefix: item.mediaid_prefix,
      name: item.name,
    }))
    expect(savedConfigs).toEqual([expectedConfig])
    expect(localStorage.getItem('MP_DISCOVER_TAB_ORDER')).toBe(JSON.stringify(expectedConfig))
    expect(getHeaderItems().map(item => item.title)).toEqual(
      reorderedTabs.filter(item => nextEnabled[item.mediaid_prefix] !== false).map(item => item.name),
    )
    expect(getHeaderConfig().modelValue.value).toBe('musicbrainz')
    expect(mocks.controllers[0].close).toHaveBeenCalledOnce()
  })

  it('keeps the settings dialog open and leaves page state unchanged when server persistence fails', async () => {
    const sourcesRequested = vi.fn()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    localStorage.setItem('MP_DISCOVER_TAB_ORDER', JSON.stringify([]))
    server.use(
      discoverSourcesHandler([], 200, sourcesRequested),
      saveDiscoverOrderHandler(() => {}, 500),
    )
    await renderDiscover()
    await waitFor(() => expect(sourcesRequested).toHaveBeenCalledOnce())
    const originalTabs = getHeaderItems().map(item => item.title)

    getSettingsButton().click()
    const { enabled, events, tabs } = getDialogCall()
    await events.save({ enabled: { ...enabled, themoviedb: false }, tabs })

    expect(getHeaderItems().map(item => item.title)).toEqual(originalTabs)
    expect(mocks.controllers[0].close).not.toHaveBeenCalled()
    expect(mocks.toastError).toHaveBeenCalledWith('探索标签设置保存失败，请稍后重试')
  })

  it('closes the previous controller before opening another settings dialog', async () => {
    localStorage.setItem('MP_DISCOVER_TAB_ORDER', JSON.stringify([]))
    server.use(discoverSourcesHandler([createSource('弹窗就绪来源', 'dialog-ready')]))
    await renderDiscover()
    await waitFor(() => expect(getHeaderItems().map(item => item.title)).toContain('弹窗就绪来源'))

    const action = () => getSettingsButton().click()
    action()
    action()

    expect(mocks.openSharedDialog).toHaveBeenCalledTimes(2)
    expect(mocks.controllers[0].close).toHaveBeenCalledOnce()
    expect(mocks.controllers[1].close).not.toHaveBeenCalled()
  })

  it('releases only the controller named by close and model update events', async () => {
    localStorage.setItem('MP_DISCOVER_TAB_ORDER', JSON.stringify([]))
    server.use(discoverSourcesHandler([createSource('弹窗就绪来源', 'dialog-ready')]))
    await renderDiscover()
    await waitFor(() => expect(getHeaderItems().map(item => item.title)).toContain('弹窗就绪来源'))
    const action = () => getSettingsButton().click()

    action()
    getDialogCall(0).events.close()
    action()
    expect(mocks.controllers[0].close).not.toHaveBeenCalled()

    getDialogCall(1).events['update:modelValue'](true)
    action()
    expect(mocks.controllers[1].close).toHaveBeenCalledOnce()

    getDialogCall(2).events['update:modelValue'](false)
    action()
    expect(mocks.controllers[2].close).not.toHaveBeenCalled()
  })

  it('does not let a pending save from an old dialog close a newer controller', async () => {
    let releaseSave = () => {}
    const saveGate = new Promise<void>(resolve => {
      releaseSave = resolve
    })
    const saveStarted = vi.fn()
    localStorage.setItem('MP_DISCOVER_TAB_ORDER', JSON.stringify([]))
    server.use(
      discoverSourcesHandler([createSource('弹窗就绪来源', 'dialog-ready')]),
      saveDiscoverOrderHandler(async () => {
        saveStarted()
        await saveGate
      }),
    )
    await renderDiscover()
    await waitFor(() => expect(getHeaderItems().map(item => item.title)).toContain('弹窗就绪来源'))
    const action = () => getSettingsButton().click()

    action()
    const firstDialog = getDialogCall(0)
    const pendingSave = firstDialog.events.save({ enabled: firstDialog.enabled, tabs: firstDialog.tabs })
    await waitFor(() => expect(saveStarted).toHaveBeenCalledOnce())
    firstDialog.events.close()
    action()
    expect(mocks.controllers).toHaveLength(2)

    releaseSave()
    await pendingSave

    expect(mocks.controllers[1].close).not.toHaveBeenCalled()
  })
})
