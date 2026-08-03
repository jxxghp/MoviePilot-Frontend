import PluginAppPage from '@/pages/plugin-app.vue'
import { renderWithProviders } from '@tests/support/render'
import { fireEvent, screen, waitFor } from '@testing-library/vue'
import { defineComponent, h, inject, nextTick, reactive } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  api: { get: vi.fn(), post: vi.fn() },
  loadRemoteAppPageComponent: vi.fn(),
  nativeSubscribe: vi.fn(),
  route: undefined as unknown as { params: { navKey?: string; pluginId?: string } },
  toast: { error: vi.fn(), success: vi.fn() },
}))

vi.mock('@/api', () => ({
  default: mocks.api,
}))

vi.mock('@/utils/federationLoader', () => ({
  loadRemoteAppPageComponent: (...args: unknown[]) => mocks.loadRemoteAppPageComponent(...args),
}))

vi.mock('@/composables/usePluginNativeSubscribe', () => ({
  usePluginNativeSubscribe: () => mocks.nativeSubscribe,
}))

vi.mock('vue-toastification', () => ({
  useToast: () => mocks.toast,
}))

vi.mock('vue-router', async importOriginal => ({
  ...(await importOriginal<typeof import('vue-router')>()),
  useRoute: () => mocks.route,
}))

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, reject, resolve }
}

function remotePage(label: string) {
  return defineComponent({
    name: `${label}RemotePage`,
    props: {
      api: Object,
      nativeSubscribe: Function,
      navKey: String,
      pluginId: String,
    },
    setup: () => () => h('div', label),
  })
}

function capabilityPage() {
  return defineComponent({
    name: 'CapabilityRemotePage',
    props: {
      api: Object,
      nativeSubscribe: Function,
      navKey: String,
      pluginId: String,
    },
    emits: ['action'],
    setup(props, { emit }) {
      const injectedToast = inject('moviepilot:toast')
      const injectedNativeSubscribe = inject('moviepilot:nativeSubscribe')
      return () =>
        h(
          'button',
          { onClick: () => emit('action') },
          [
            props.pluginId,
            props.navKey,
            props.api === mocks.api,
            props.nativeSubscribe === mocks.nativeSubscribe,
            injectedToast === mocks.toast,
            injectedNativeSubscribe === mocks.nativeSubscribe,
          ].join(':'),
        )
    },
  })
}

describe('plugin-app page', () => {
  beforeEach(() => {
    mocks.loadRemoteAppPageComponent.mockReset()
    mocks.api.get.mockReset()
    mocks.api.post.mockReset()
    mocks.nativeSubscribe.mockReset()
    mocks.route = reactive({ params: { navKey: 'main', pluginId: 'alpha' } })
    mocks.toast.error.mockReset()
    mocks.toast.success.mockReset()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('shows loading, forwards host props and provides the same host capabilities', async () => {
    const pageLoad = deferred<ReturnType<typeof capabilityPage>>()
    mocks.route.params.navKey = 'settings'
    mocks.loadRemoteAppPageComponent.mockReturnValue(pageLoad.promise)

    const { container } = await renderWithProviders(PluginAppPage)
    expect(container.querySelector('.v-skeleton-loader')).toBeInTheDocument()

    pageLoad.resolve(capabilityPage())
    const remoteAction = await screen.findByRole('button', {
      name: 'alpha:settings:true:true:true:true',
    })
    await fireEvent.click(remoteAction)

    expect(remoteAction).toBeInTheDocument()
    expect(mocks.loadRemoteAppPageComponent).toHaveBeenCalledWith('alpha', 'settings')
  })

  it('uses main when the optional nav key is absent', async () => {
    mocks.route.params.navKey = undefined
    mocks.loadRemoteAppPageComponent.mockResolvedValue(remotePage('main page'))

    await renderWithProviders(PluginAppPage)

    expect(await screen.findByText('main page')).toBeInTheDocument()
    expect(mocks.loadRemoteAppPageComponent).toHaveBeenCalledWith('alpha', 'main')
  })

  it('does not start a remote load without a plugin id', async () => {
    mocks.route.params.pluginId = undefined

    const { container } = await renderWithProviders(PluginAppPage)
    await nextTick()

    expect(mocks.loadRemoteAppPageComponent).not.toHaveBeenCalled()
    expect(container.querySelector('.v-skeleton-loader')).toBeInTheDocument()
  })

  it('clears the previous page while a new route is loading', async () => {
    const beta = deferred<ReturnType<typeof remotePage>>()
    mocks.loadRemoteAppPageComponent.mockImplementation((pluginId: string) => {
      return pluginId === 'alpha' ? Promise.resolve(remotePage('alpha page')) : beta.promise
    })

    const { container } = await renderWithProviders(PluginAppPage)
    expect(await screen.findByText('alpha page')).toBeInTheDocument()

    mocks.route.params.pluginId = 'beta'
    await waitFor(() => expect(mocks.loadRemoteAppPageComponent).toHaveBeenCalledWith('beta', 'main'))

    expect(screen.queryByText('alpha page')).not.toBeInTheDocument()
    expect(container.querySelector('.v-skeleton-loader')).toBeInTheDocument()

    beta.resolve(remotePage('beta page'))
    expect(await screen.findByText('beta page')).toBeInTheDocument()
  })

  it('keeps the latest route component when an earlier load resolves late', async () => {
    const alpha = deferred<ReturnType<typeof remotePage>>()
    const beta = deferred<ReturnType<typeof remotePage>>()
    mocks.loadRemoteAppPageComponent.mockImplementation((pluginId: string) => {
      return pluginId === 'alpha' ? alpha.promise : beta.promise
    })

    await renderWithProviders(PluginAppPage)
    await waitFor(() => expect(mocks.loadRemoteAppPageComponent).toHaveBeenCalledWith('alpha', 'main'))

    mocks.route.params.pluginId = 'beta'
    await waitFor(() => expect(mocks.loadRemoteAppPageComponent).toHaveBeenCalledWith('beta', 'main'))

    beta.resolve(remotePage('beta page'))
    expect(await screen.findByText('beta page')).toBeInTheDocument()

    alpha.resolve(remotePage('alpha page'))
    await alpha.promise
    await nextTick()

    expect(screen.queryByText('alpha page')).not.toBeInTheDocument()
    expect(screen.getByText('beta page')).toBeInTheDocument()
  })

  it('ignores an earlier route error after the latest page has loaded', async () => {
    const alpha = deferred<ReturnType<typeof remotePage>>()
    mocks.loadRemoteAppPageComponent.mockImplementation((pluginId: string) => {
      return pluginId === 'alpha' ? alpha.promise : Promise.resolve(remotePage('beta page'))
    })

    await renderWithProviders(PluginAppPage)
    await waitFor(() => expect(mocks.loadRemoteAppPageComponent).toHaveBeenCalledWith('alpha', 'main'))

    mocks.route.params.pluginId = 'beta'
    expect(await screen.findByText('beta page')).toBeInTheDocument()

    alpha.reject(new Error('alpha failed'))
    await alpha.promise.catch(() => undefined)
    await nextTick()

    expect(screen.queryByText('组件加载错误')).not.toBeInTheDocument()
    expect(screen.getByText('beta page')).toBeInTheDocument()
    expect(console.error).not.toHaveBeenCalled()
  })

  it('shows an observable error state when the current remote load fails', async () => {
    mocks.loadRemoteAppPageComponent.mockRejectedValue(new Error('current route failed'))

    const { container } = await renderWithProviders(PluginAppPage)

    expect(await screen.findByText('组件加载错误')).toBeInTheDocument()
    expect(screen.getByText(/无法加载插件全页组件/)).toBeInTheDocument()
    expect(container.querySelector('.v-skeleton-loader')).not.toBeInTheDocument()
    expect(console.error).toHaveBeenCalledOnce()
  })
})
