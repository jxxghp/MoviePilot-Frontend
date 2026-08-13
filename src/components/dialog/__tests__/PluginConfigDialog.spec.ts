import type { Plugin } from '@/api/types'
import PluginConfigDialog from '@/components/dialog/PluginConfigDialog.vue'
import { renderWithProviders } from '@tests/support/render'
import { fireEvent, screen, waitFor } from '@testing-library/vue'
import { defineComponent, h, inject, type Component, type PropType } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const apiGet = vi.fn()
  const apiPut = vi.fn()

  return {
    api: { get: apiGet, put: apiPut },
    apiGet,
    apiPut,
    ensureSidebarNav: vi.fn(),
    loadRemoteComponent: vi.fn(),
    openSharedDialog: vi.fn(),
    nativeSubscribe: vi.fn(),
    createConfirm: vi.fn(),
    toast: { error: vi.fn(), success: vi.fn() },
  }
})

vi.mock('@/api', () => ({
  pluginApi: mocks.api,
  default: mocks.api,
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

vi.mock('@/stores/pluginSidebarNav', () => ({
  usePluginSidebarNavStore: () => ({ ensureSidebarNav: mocks.ensureSidebarNav }),
}))

vi.mock('vue-toastification', () => ({
  useToast: () => mocks.toast,
}))

const plugin: Plugin = {
  has_page: true,
  id: 'DemoPlugin',
  plugin_name: '演示插件',
}

const DialogStub = defineComponent({
  name: 'VDialog',
  props: { maxWidth: String },
  setup:
    (props, { slots }) =>
    () =>
      h('section', { 'data-max-width': props.maxWidth, role: 'dialog' }, slots.default?.()),
})

const LoadingBannerStub = defineComponent({
  name: 'LoadingBanner',
  setup: () => () => h('div', '正在加载'),
})

const ProgressDialogStub = defineComponent({
  name: 'ProgressDialog',
  props: { text: String },
  setup: props => () => h('div', { 'data-testid': 'save-progress' }, props.text),
})

const CloseButtonStub = defineComponent({
  name: 'VDialogCloseBtn',
  setup:
    (_, { attrs }) =>
    () =>
      h('button', { ...attrs, 'aria-label': '关闭', type: 'button' }),
})

const FormRenderStub = defineComponent({
  name: 'FormRender',
  props: {
    config: { type: Object as PropType<Record<string, unknown>>, required: true },
    model: { type: Object as PropType<Record<string, unknown>>, required: true },
  },
  setup: props => () => h('div', { 'data-testid': 'form-render' }, `${props.config.component}:${props.model.enabled}`),
})

type RemoteCapture = {
  api: unknown
  initialConfig: Record<string, unknown>
  injectedNativeSubscribe: unknown
  injectedToast: unknown
  injectedDialog: unknown
  injectedConfirm: unknown
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

function createRemoteConfig(captures: RemoteCapture[]): Component {
  return defineComponent({
    name: 'RemoteConfigFixture',
    props: {
      api: Object,
      initialConfig: { type: Object as PropType<Record<string, unknown>>, required: true },
      nativeSubscribe: Function,
    },
    emits: ['close', 'layout', 'save', 'switch'],
    setup(props, { emit }) {
      captures.push({
        api: props.api,
        initialConfig: props.initialConfig,
        injectedNativeSubscribe: inject('moviepilot:nativeSubscribe'),
        injectedToast: inject('moviepilot:toast'),
        injectedDialog: inject('moviepilot:dialog'),
        injectedConfirm: inject('moviepilot:confirm'),
        nativeSubscribe: props.nativeSubscribe,
      })
      return () =>
        h('section', { 'data-testid': 'remote-config' }, [
          h('button', { onClick: () => emit('layout', { maxWidth: '72rem' }), type: 'button' }, '调整布局'),
          h('button', { onClick: () => emit('save', { enabled: false }), type: 'button' }, '远程保存'),
          h('button', { onClick: () => emit('switch'), type: 'button' }, '切换数据'),
          h('button', { onClick: () => emit('close'), type: 'button' }, '关闭远程配置'),
        ])
    },
  })
}

async function renderDialog() {
  return renderWithProviders(PluginConfigDialog, {
    props: { modelValue: true, plugin },
    global: {
      stubs: {
        FormRender: FormRenderStub,
        LoadingBanner: LoadingBannerStub,
        ProgressDialog: ProgressDialogStub,
        VDialog: DialogStub,
        VDialogCloseBtn: CloseButtonStub,
      },
    },
  })
}

describe('PluginConfigDialog', () => {
  beforeEach(() => {
    mocks.apiGet.mockReset()
    mocks.apiPut.mockReset()
    mocks.ensureSidebarNav.mockReset().mockResolvedValue(undefined)
    mocks.loadRemoteComponent.mockReset()
    mocks.openSharedDialog.mockReset()
    mocks.nativeSubscribe.mockReset()
    mocks.createConfirm.mockReset()
    mocks.toast.error.mockReset()
    mocks.toast.success.mockReset()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  it('distinguishes an empty Vuetify form from a failed load and retries in place', async () => {
    mocks.apiGet.mockRejectedValueOnce(new Error('temporary failure')).mockResolvedValueOnce({
      conf: [],
      model: {},
      render_mode: 'vuetify',
    })
    mocks.apiPut.mockResolvedValue({ success: true })

    await renderDialog()

    expect(await screen.findByText('插件配置加载失败，请稍后重试')).toBeInTheDocument()
    expect(screen.queryByText('此插件没有可配置项')).not.toBeInTheDocument()

    await fireEvent.click(screen.getByRole('button', { name: '重试' }))

    expect(await screen.findByText('此插件没有可配置项')).toBeInTheDocument()
    expect(mocks.apiGet).toHaveBeenCalledTimes(2)

    await fireEvent.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() => expect(mocks.apiPut).toHaveBeenCalledWith('plugin/DemoPlugin', {}, { feedback: 'silent' }))
  })

  it('does not expose configuration saving while the form is loading or failed', async () => {
    const load = createDeferred<never>()
    mocks.apiGet.mockReturnValue(load.promise)

    await renderDialog()

    expect(screen.getByText('正在加载')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '保存' })).not.toBeInTheDocument()

    load.reject(new Error('request failed'))

    expect(await screen.findByText('插件配置加载失败，请稍后重试')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '保存' })).not.toBeInTheDocument()
    expect(mocks.apiPut).not.toHaveBeenCalled()
  })

  it('renders the Vuetify form with the merged model returned by the backend', async () => {
    mocks.apiGet.mockResolvedValue({
      conf: [{ component: 'VSwitch', props: { label: '启用' } }],
      model: { enabled: true },
      render_mode: 'vuetify',
    })

    const result = await renderDialog()

    expect(await screen.findByTestId('form-render')).toHaveTextContent('VSwitch:true')
    await fireEvent.click(screen.getByRole('button', { name: '查看数据' }))
    await fireEvent.click(screen.getByRole('button', { name: '关闭' }))
    expect(result.emitted().switch).toHaveLength(1)
    expect(result.emitted().close).toHaveLength(1)
  })

  it('passes the same host capabilities through props and provide and forwards remote events', async () => {
    const captures: RemoteCapture[] = []
    mocks.apiGet.mockResolvedValue({ model: { enabled: true }, render_mode: 'vue' })
    mocks.apiPut.mockResolvedValue({ success: true })
    mocks.loadRemoteComponent.mockResolvedValue(createRemoteConfig(captures))

    const result = await renderDialog()

    expect(await screen.findByTestId('remote-config')).toBeInTheDocument()
    expect(mocks.loadRemoteComponent).toHaveBeenCalledWith('DemoPlugin', 'Config')
    expect(captures).toHaveLength(1)
    expect(captures[0]).toMatchObject({ initialConfig: { enabled: true } })
    expect(captures[0].api).toMatchObject({ get: mocks.apiGet, put: mocks.apiPut })
    expect(captures[0].nativeSubscribe).toBe(mocks.nativeSubscribe)
    expect(captures[0].injectedNativeSubscribe).toBe(mocks.nativeSubscribe)
    expect(captures[0].injectedToast).toBe(mocks.toast)
    expect(captures[0].injectedDialog).toBe(mocks.openSharedDialog)
    expect(captures[0].injectedConfirm).toBe(mocks.createConfirm)

    await fireEvent.click(screen.getByRole('button', { name: '调整布局' }))
    expect(screen.getByRole('dialog')).toHaveAttribute('data-max-width', '72rem')
    await fireEvent.click(screen.getByRole('button', { name: '远程保存' }))
    await waitFor(() =>
      expect(mocks.apiPut).toHaveBeenCalledWith('plugin/DemoPlugin', { enabled: false }, { feedback: 'silent' }),
    )
    await fireEvent.click(screen.getByRole('button', { name: '切换数据' }))
    await fireEvent.click(screen.getByRole('button', { name: '关闭远程配置' }))

    expect(result.emitted().switch).toHaveLength(1)
    expect(result.emitted().close).toHaveLength(1)
  })

  it('renders the async error component when the remote Config rejects', async () => {
    mocks.apiGet.mockResolvedValue({ model: {}, render_mode: 'vue' })
    mocks.loadRemoteComponent.mockRejectedValue(new Error('remote unavailable'))

    await renderDialog()

    expect(await screen.findByText('无法加载组件，请稍后再试')).toBeInTheDocument()
  })

  it('renders the precompiled loading state while the remote Config is pending', async () => {
    const remote = createDeferred<Component>()
    mocks.apiGet.mockResolvedValue({ model: {}, render_mode: 'vue' })
    mocks.loadRemoteComponent.mockReturnValue(remote.promise)

    await renderDialog()

    expect(await screen.findByTestId('remote-component-loading')).toBeInTheDocument()
  })

  it('keeps configuration save successful when the sidebar refresh fails', async () => {
    mocks.apiGet.mockResolvedValue({ conf: [], model: { enabled: true }, render_mode: 'vuetify' })
    mocks.apiPut.mockResolvedValue({ success: true })
    mocks.ensureSidebarNav.mockRejectedValue(new Error('sidebar unavailable'))

    const result = await renderDialog()
    await fireEvent.click(await screen.findByRole('button', { name: '保存' }))

    await waitFor(() => {
      expect(mocks.apiPut).toHaveBeenCalledWith('plugin/DemoPlugin', { enabled: true }, { feedback: 'silent' })
      expect(mocks.ensureSidebarNav).toHaveBeenCalledWith(true)
      expect(result.emitted().save).toHaveLength(1)
    })
    expect(mocks.toast.success).toHaveBeenCalledOnce()
    expect(mocks.toast.error).not.toHaveBeenCalled()
    expect(screen.queryByTestId('save-progress')).not.toBeInTheDocument()
  })

  it.each([
    ['business failure', () => Promise.reject(new Error('配置被拒绝'))],
    ['HTTP failure', () => Promise.reject(new Error('request failed'))],
  ])('keeps the dialog open and reports a %s', async (_case, saveResult) => {
    mocks.apiGet.mockResolvedValue({ conf: [], model: {}, render_mode: 'vuetify' })
    mocks.apiPut.mockImplementation(saveResult)

    const result = await renderDialog()
    await fireEvent.click(await screen.findByRole('button', { name: '保存' }))

    await waitFor(() => expect(mocks.toast.error).toHaveBeenCalledOnce())
    expect(result.emitted().save).toBeUndefined()
    expect(mocks.ensureSidebarNav).not.toHaveBeenCalled()
    expect(screen.queryByTestId('save-progress')).not.toBeInTheDocument()
  })
})
