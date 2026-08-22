import type { DashboardItem } from '@/api/types'
import DashboardElement from '@/components/misc/DashboardElement.vue'
import { renderWithProviders } from '@tests/support/render'
import { screen, waitFor } from '@testing-library/vue'
import { flushPromises } from '@vue/test-utils'
import { defineComponent, h, inject, type Component, type PropType } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  loadRemoteComponent: vi.fn(),
  openSharedDialog: vi.fn(),
  nativeSubscribe: vi.fn(),
  createConfirm: vi.fn(),
  toast: { error: vi.fn(), success: vi.fn() },
}))

vi.mock('@/api', () => ({
  createPluginInstanceApi: () => ({ get: mocks.apiGet }),
  default: createDataApiMock({ get: mocks.apiGet }),
  pluginApi: { get: mocks.apiGet },
}))

vi.mock('@/utils/federationLoader', () => ({
  loadRemoteComponent: mocks.loadRemoteComponent,
}))

vi.mock('@/composables/usePluginNativeSubscribe', () => ({
  usePluginNativeSubscribe: () => mocks.nativeSubscribe,
}))

vi.mock('@/composables/useConfirm', () => ({
  useConfirm: () => mocks.createConfirm,
}))

vi.mock('@/composables/useSharedDialog', () => ({
  openSharedDialog: mocks.openSharedDialog,
}))

vi.mock('vue-toastification', () => ({
  useToast: () => mocks.toast,
}))

type RemoteCapture = {
  allowRefresh: boolean
  api: unknown
  config: DashboardItem
  injectedNativeSubscribe: unknown
  injectedDialog: unknown
  injectedConfirm: unknown
  injectedToast: unknown
  nativeSubscribe: unknown
}

function createDeferred<T>() {
  let reject!: (reason?: unknown) => void
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve
    reject = promiseReject
  })

  return { promise, reject, resolve }
}

function createRemoteDashboard(captures: RemoteCapture[], label = 'remote'): Component {
  return defineComponent({
    name: 'RemoteDashboardFixture',
    props: {
      allowRefresh: Boolean,
      api: Object,
      config: { type: Object as PropType<DashboardItem>, required: true },
      nativeSubscribe: Function,
    },
    setup(props) {
      captures.push({
        allowRefresh: props.allowRefresh,
        api: props.api,
        config: props.config,
        injectedNativeSubscribe: inject('moviepilot:nativeSubscribe'),
        injectedToast: inject('moviepilot:toast'),
        injectedDialog: inject('moviepilot:dialog'),
        injectedConfirm: inject('moviepilot:confirm'),
        nativeSubscribe: props.nativeSubscribe,
      })
      return () => h('div', { 'data-testid': 'remote-dashboard' }, `${label}:${props.config.name}`)
    },
  })
}

function createPluginDashboard(overrides: Partial<DashboardItem> = {}): DashboardItem {
  return {
    attrs: { border: true, title: '插件仪表盘' },
    cols: { lg: 6 },
    elements: [],
    id: 'DemoPlugin',
    key: 'main',
    name: '演示仪表盘',
    render_mode: 'vue',
    ...overrides,
  }
}

describe('DashboardElement plugin host', () => {
  beforeEach(() => {
    mocks.loadRemoteComponent.mockReset()
    mocks.openSharedDialog.mockReset()
    mocks.apiGet.mockReset()
    mocks.nativeSubscribe.mockReset()
    mocks.createConfirm.mockReset()
    mocks.toast.error.mockReset()
    mocks.toast.success.mockReset()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  it('reuses one remote promise and passes identical prop/provide capabilities', async () => {
    const captures: RemoteCapture[] = []
    const config = createPluginDashboard()
    mocks.loadRemoteComponent.mockResolvedValue(createRemoteDashboard(captures))

    const result = await renderWithProviders(DashboardElement, {
      props: { allowRefresh: false, config, refreshStatus: true },
    })

    expect(await screen.findByTestId('remote-dashboard')).toHaveTextContent('remote:演示仪表盘')
    expect(mocks.loadRemoteComponent).toHaveBeenCalledOnce()
    expect(mocks.loadRemoteComponent).toHaveBeenCalledWith('DemoPlugin', 'Dashboard')
    expect(captures).toHaveLength(1)
    expect(captures[0].config).toStrictEqual(config)
    expect(captures[0].allowRefresh).toBe(false)
    expect(captures[0].api).toMatchObject({ get: mocks.apiGet })
    expect(captures[0].nativeSubscribe).toBe(mocks.nativeSubscribe)
    expect(captures[0].injectedNativeSubscribe).toBe(mocks.nativeSubscribe)
    expect(captures[0].injectedToast).toBe(mocks.toast)
    expect(captures[0].injectedDialog).toBe(mocks.openSharedDialog)
    expect(captures[0].injectedConfirm).toBe(mocks.createConfirm)
    await waitFor(() => expect(result.emitted().loaded).toHaveLength(1))

    result.unmount()
    expect(result.emitted()['update:refreshStatus']).toEqual([[false]])
  })

  it('shows the remote error and retries after the plugin dashboard identity changes', async () => {
    const captures: RemoteCapture[] = []
    mocks.loadRemoteComponent
      .mockRejectedValueOnce(new Error('remote unavailable'))
      .mockResolvedValueOnce(createRemoteDashboard(captures))

    const result = await renderWithProviders(DashboardElement, {
      props: { config: createPluginDashboard(), refreshStatus: false },
    })

    expect(await screen.findByText('无法加载组件，请稍后再试')).toBeInTheDocument()
    expect(mocks.loadRemoteComponent).toHaveBeenCalledOnce()

    await result.rerender({
      config: createPluginDashboard({ key: 'secondary', name: '恢复后的仪表盘' }),
      refreshStatus: false,
    })

    expect(await screen.findByTestId('remote-dashboard')).toHaveTextContent('remote:恢复后的仪表盘')
    expect(mocks.loadRemoteComponent).toHaveBeenCalledTimes(2)
  })

  it('replaces a successfully resolved remote component when the plugin identity changes', async () => {
    const captures: RemoteCapture[] = []
    mocks.loadRemoteComponent
      .mockResolvedValueOnce(createRemoteDashboard(captures, 'remote-a'))
      .mockResolvedValueOnce(createRemoteDashboard(captures, 'remote-b'))

    const result = await renderWithProviders(DashboardElement, {
      props: { config: createPluginDashboard(), refreshStatus: false },
    })
    expect(await screen.findByTestId('remote-dashboard')).toHaveTextContent('remote-a:演示仪表盘')

    await result.rerender({
      config: createPluginDashboard({ id: 'OtherPlugin', key: 'other', name: '另一个仪表盘' }),
      refreshStatus: false,
    })

    expect(await screen.findByTestId('remote-dashboard')).toHaveTextContent('remote-b:另一个仪表盘')
    expect(mocks.loadRemoteComponent).toHaveBeenNthCalledWith(2, 'OtherPlugin', 'Dashboard')
  })

  it('ignores an older remote that resolves after the replacement has loaded', async () => {
    const captures: RemoteCapture[] = []
    const remoteA = createDeferred<Component>()
    const remoteB = createDeferred<Component>()
    mocks.loadRemoteComponent.mockReturnValueOnce(remoteA.promise).mockReturnValueOnce(remoteB.promise)

    const result = await renderWithProviders(DashboardElement, {
      props: { config: createPluginDashboard(), refreshStatus: false },
    })
    await waitFor(() => expect(mocks.loadRemoteComponent).toHaveBeenCalledWith('DemoPlugin', 'Dashboard'))

    await result.rerender({
      config: createPluginDashboard({ id: 'OtherPlugin', key: 'other', name: '替换后的仪表盘' }),
      refreshStatus: false,
    })
    await waitFor(() => expect(mocks.loadRemoteComponent).toHaveBeenCalledWith('OtherPlugin', 'Dashboard'))

    remoteB.resolve(createRemoteDashboard(captures, 'remote-b'))
    expect(await screen.findByTestId('remote-dashboard')).toHaveTextContent('remote-b:替换后的仪表盘')
    await waitFor(() => expect(result.emitted().loaded).toHaveLength(1))

    remoteA.resolve(createRemoteDashboard(captures, 'remote-a'))
    await flushPromises()

    expect(screen.getByTestId('remote-dashboard')).toHaveTextContent('remote-b:替换后的仪表盘')
    expect(captures).toHaveLength(1)
    expect(captures[0].config.id).toBe('OtherPlugin')
    expect(result.emitted().loaded).toHaveLength(1)
  })

  it('reports loaded only after the current remote resolves', async () => {
    const captures: RemoteCapture[] = []
    const remoteA = createDeferred<Component>()
    const remoteB = createDeferred<Component>()
    mocks.loadRemoteComponent.mockReturnValueOnce(remoteA.promise).mockReturnValueOnce(remoteB.promise)

    const result = await renderWithProviders(DashboardElement, {
      props: { config: createPluginDashboard(), refreshStatus: false },
    })
    await waitFor(() => expect(mocks.loadRemoteComponent).toHaveBeenCalledWith('DemoPlugin', 'Dashboard'))

    await result.rerender({
      config: createPluginDashboard({ id: 'OtherPlugin', key: 'other', name: '当前仪表盘' }),
      refreshStatus: false,
    })
    await waitFor(() => expect(mocks.loadRemoteComponent).toHaveBeenCalledWith('OtherPlugin', 'Dashboard'))

    remoteA.resolve(createRemoteDashboard(captures, 'remote-a'))
    await flushPromises()

    expect(result.emitted().loaded).toBeUndefined()
    expect(captures).toHaveLength(0)

    remoteB.resolve(createRemoteDashboard(captures, 'remote-b'))
    expect(await screen.findByTestId('remote-dashboard')).toHaveTextContent('remote-b:当前仪表盘')
    await waitFor(() => expect(result.emitted().loaded).toHaveLength(1))
  })

  it('renders the Vuetify plugin branch without loading a remote component', async () => {
    const DashboardRenderStub = defineComponent({
      name: 'DashboardRender',
      props: { config: { type: Object as PropType<Record<string, unknown>>, required: true } },
      setup: props => () => h('div', { 'data-testid': 'dashboard-render' }, String(props.config.component)),
    })

    await renderWithProviders(DashboardElement, {
      props: {
        config: createPluginDashboard({
          elements: [{ component: 'VChip' }],
          render_mode: 'vuetify',
        }),
      },
      global: { stubs: { DashboardRender: DashboardRenderStub } },
    })

    expect(await screen.findByTestId('dashboard-render')).toHaveTextContent('VChip')
    expect(screen.getByText('插件仪表盘')).toBeInTheDocument()
    expect(mocks.loadRemoteComponent).not.toHaveBeenCalled()
  })

  it('shows an explicit error for an unsupported plugin render mode', async () => {
    await renderWithProviders(DashboardElement, {
      props: { config: createPluginDashboard({ render_mode: 'legacy' }) },
    })

    expect(await screen.findByText('无法渲染插件仪表盘部件: 未知渲染模式或配置错误')).toBeInTheDocument()
    expect(mocks.loadRemoteComponent).not.toHaveBeenCalled()
  })
})
