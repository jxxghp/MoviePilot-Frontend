import type { Plugin } from '@/api/types'
import PluginDataDialog from '@/components/dialog/PluginDataDialog.vue'
import { renderWithProviders } from '@tests/support/render'
import { fireEvent, screen, waitFor } from '@testing-library/vue'
import { defineComponent, h, inject, type Component, type PropType } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  loadRemoteComponent: vi.fn(),
  nativeSubscribe: vi.fn(),
  toast: { error: vi.fn(), success: vi.fn() },
}))

vi.mock('@/api', () => ({
  default: { get: mocks.apiGet },
}))

vi.mock('@/utils/federationLoader', () => ({
  loadRemoteComponent: mocks.loadRemoteComponent,
}))

vi.mock('@/composables/usePluginNativeSubscribe', () => ({
  usePluginNativeSubscribe: () => mocks.nativeSubscribe,
}))

vi.mock('@/composables/usePWA', () => ({
  usePWA: () => ({ appMode: false }),
}))

vi.mock('vue-toastification', () => ({
  useToast: () => mocks.toast,
}))

const plugin: Plugin = {
  id: 'DemoPlugin',
  plugin_name: '演示插件',
}

const DialogStub = defineComponent({
  name: 'VDialog',
  setup:
    (_, { slots }) =>
    () =>
      h('section', { role: 'dialog' }, slots.default?.()),
})

const LoadingBannerStub = defineComponent({
  name: 'LoadingBanner',
  setup: () => () => h('div', '正在加载'),
})

const CloseButtonStub = defineComponent({
  name: 'VDialogCloseBtn',
  setup:
    (_, { attrs }) =>
    () =>
      h('button', { ...attrs, 'aria-label': '关闭', type: 'button' }),
})

const FabStub = defineComponent({
  name: 'VFab',
  setup:
    (_, { attrs }) =>
    () =>
      h('button', { ...attrs, 'aria-label': '切换配置', type: 'button' }),
})

const PageRenderStub = defineComponent({
  name: 'PageRender',
  props: {
    config: { type: Object as PropType<Record<string, unknown>>, required: true },
  },
  emits: ['action'],
  setup:
    (props, { emit }) =>
    () =>
      h('button', { onClick: () => emit('action'), type: 'button' }, String(props.config.component)),
})

type RemoteCapture = {
  api: unknown
  injectedNativeSubscribe: unknown
  injectedToast: unknown
  nativeSubscribe: unknown
  showSwitch: boolean
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>(promiseResolve => {
    resolve = promiseResolve
  })

  return { promise, resolve }
}

function createRemotePage(captures: RemoteCapture[]): Component {
  return defineComponent({
    name: 'RemotePageFixture',
    props: {
      api: Object,
      nativeSubscribe: Function,
      show_switch: Boolean,
    },
    emits: ['action', 'close', 'switch'],
    setup(props, { emit }) {
      captures.push({
        api: props.api,
        injectedNativeSubscribe: inject('moviepilot:nativeSubscribe'),
        injectedToast: inject('moviepilot:toast'),
        nativeSubscribe: props.nativeSubscribe,
        showSwitch: props.show_switch,
      })
      return () =>
        h('section', { 'data-testid': 'remote-page' }, [
          h('button', { onClick: () => emit('action'), type: 'button' }, '刷新远程页面'),
          h('button', { onClick: () => emit('switch'), type: 'button' }, '切换配置'),
          h('button', { onClick: () => emit('close'), type: 'button' }, '关闭远程页面'),
        ])
    },
  })
}

async function renderDialog(showSwitch = true) {
  return renderWithProviders(PluginDataDialog, {
    props: { modelValue: true, plugin, show_switch: showSwitch },
    global: {
      stubs: {
        LoadingBanner: LoadingBannerStub,
        PageRender: PageRenderStub,
        VDialog: DialogStub,
        VDialogCloseBtn: CloseButtonStub,
        VFab: FabStub,
      },
    },
  })
}

describe('PluginDataDialog', () => {
  beforeEach(() => {
    mocks.apiGet.mockReset()
    mocks.loadRemoteComponent.mockReset()
    mocks.nativeSubscribe.mockReset()
    mocks.toast.error.mockReset()
    mocks.toast.success.mockReset()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  it('distinguishes an empty Vuetify page from a failed load and retries in place', async () => {
    mocks.apiGet.mockRejectedValueOnce(new Error('temporary failure')).mockResolvedValueOnce({
      page: [],
      render_mode: 'vuetify',
    })

    await renderDialog()

    expect(await screen.findByText('插件数据加载失败，请稍后重试')).toBeInTheDocument()
    expect(screen.queryByText('此插件没有详情页面')).not.toBeInTheDocument()

    await fireEvent.click(screen.getByRole('button', { name: '重试' }))

    expect(await screen.findByText('此插件没有详情页面')).toBeInTheDocument()
    expect(mocks.apiGet).toHaveBeenCalledTimes(2)
  })

  it('renders Vuetify page definitions and reloads them after an action', async () => {
    mocks.apiGet
      .mockResolvedValueOnce({ page: [{ component: 'VBtn' }], render_mode: 'vuetify' })
      .mockResolvedValueOnce({ page: [{ component: 'VChip' }], render_mode: 'vuetify' })

    const result = await renderDialog()

    await fireEvent.click(await screen.findByRole('button', { name: 'VBtn' }))
    expect(await screen.findByRole('button', { name: 'VChip' })).toBeInTheDocument()
    await fireEvent.click(screen.getByRole('button', { name: '切换配置' }))
    await fireEvent.click(screen.getByRole('button', { name: '关闭' }))
    expect(mocks.apiGet).toHaveBeenCalledTimes(2)
    expect(result.emitted().switch).toHaveLength(1)
    expect(result.emitted().close).toHaveLength(1)
  })

  it('passes the same host capabilities through props and provide and forwards remote events', async () => {
    const captures: RemoteCapture[] = []
    mocks.apiGet.mockResolvedValue({ render_mode: 'vue' })
    mocks.loadRemoteComponent.mockResolvedValue(createRemotePage(captures))

    const result = await renderDialog(false)

    expect(await screen.findByTestId('remote-page')).toBeInTheDocument()
    expect(mocks.loadRemoteComponent).toHaveBeenCalledWith('DemoPlugin', 'Page')
    expect(captures).toHaveLength(1)
    expect(captures[0].api).toMatchObject({ get: mocks.apiGet })
    expect(captures[0].showSwitch).toBe(false)
    expect(captures[0].nativeSubscribe).toBe(mocks.nativeSubscribe)
    expect(captures[0].injectedNativeSubscribe).toBe(mocks.nativeSubscribe)
    expect(captures[0].injectedToast).toBe(mocks.toast)

    await fireEvent.click(screen.getByRole('button', { name: '刷新远程页面' }))
    await fireEvent.click(screen.getByRole('button', { name: '切换配置' }))
    await fireEvent.click(screen.getByRole('button', { name: '关闭远程页面' }))

    expect(mocks.apiGet).toHaveBeenCalledOnce()
    expect(result.emitted().switch).toHaveLength(1)
    expect(result.emitted().close).toHaveLength(1)
  })

  it('renders the async error component when the remote Page rejects', async () => {
    mocks.apiGet.mockResolvedValue({ render_mode: 'vue' })
    mocks.loadRemoteComponent.mockRejectedValue(new Error('remote unavailable'))

    await renderDialog()

    expect(await screen.findByText('无法加载组件，请稍后再试')).toBeInTheDocument()
  })

  it('renders the precompiled loading state while the remote Page is pending', async () => {
    const remote = createDeferred<Component>()
    mocks.apiGet.mockResolvedValue({ render_mode: 'vue' })
    mocks.loadRemoteComponent.mockReturnValue(remote.promise)

    await renderDialog()

    expect(await screen.findByTestId('remote-component-loading')).toBeInTheDocument()
  })

  it('treats an unsupported render mode as a load error instead of a blank dialog', async () => {
    mocks.apiGet.mockResolvedValue({ render_mode: 'legacy' })

    await renderDialog()

    expect(await screen.findByText('插件数据加载失败，请稍后重试')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByText('此插件没有详情页面')).not.toBeInTheDocument())
  })
})
