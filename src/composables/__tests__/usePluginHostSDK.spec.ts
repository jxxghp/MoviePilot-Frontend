import { defineComponent, h, inject, ref, shallowRef } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { renderWithProviders } from '@tests/support/render'
import { providePluginHostSDK } from '@/composables/usePluginHostSDK'
import {
  PLUGIN_HOST_KEYS,
  PLUGIN_HOST_SDK_KEY,
  type PluginAPI,
  type PluginHostSDK,
  type PluginHostSurface,
} from '@/sdk/plugin'

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  manage: vi.fn(),
  confirm: vi.fn(),
  dialog: vi.fn(),
  toast: { success: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn() },
}))
vi.mock('@/composables/usePluginNativeSubscribe', () => ({ usePluginNativeSubscribe: () => mocks.create }))
vi.mock('@/composables/usePluginSubscriptionManager', () => ({ usePluginSubscriptionManager: () => mocks.manage }))
vi.mock('@/composables/useConfirm', () => ({ useConfirm: () => mocks.confirm }))
vi.mock('@/composables/useSharedDialog', () => ({ openSharedDialog: mocks.dialog }))
vi.mock('vue-toastification', () => ({ useToast: () => mocks.toast }))

describe('统一联邦宿主 SDK 注入', () => {
  it.each<PluginHostSurface>(['page', 'config', 'dashboard', 'app', 'agent-pet'])(
    '%s 提供实际能力并兼容独立注入键',
    async surface => {
      const id = ref('clone-a')
      const createClient = (): PluginAPI => ({
        get: vi.fn(),
        delete: vi.fn(),
        head: vi.fn(),
        options: vi.fn(),
        post: vi.fn(),
        put: vi.fn(),
        patch: vi.fn(),
      })
      const first = createClient()
      const second = createClient()
      const client = shallowRef(first)
      let sdk: PluginHostSDK | undefined
      const injected: Record<string, unknown> = {}
      const child = defineComponent({
        setup() {
          injected.sdk = inject(PLUGIN_HOST_SDK_KEY)
          injected.manage = inject(PLUGIN_HOST_KEYS.subscriptionManager, null)
          injected.create = inject(PLUGIN_HOST_KEYS.nativeSubscribe, null)
          injected.toast = inject(PLUGIN_HOST_KEYS.toast, null)
          injected.agent = inject(PLUGIN_HOST_KEYS.agent, null)
          return () => null
        },
      })
      const host = defineComponent({
        setup() {
          sdk = providePluginHostSDK({ surface, pluginId: id, sourcePluginId: 'source', api: client })
          return () => h(child)
        },
      })
      const mounted = await renderWithProviders(host)
      if (!sdk) throw new Error('SDK 未初始化')
      expect(injected.sdk).toBe(sdk)
      expect(injected.agent).toBe(sdk.agent)
      expect(sdk.context.surface).toBe(surface)
      for (const capability of ['environment', 'preferences', 'events', 'catalogs.mediaSources', 'navigation'])
        expect(sdk.supports(capability)).toBe(true)
      expect(sdk.supports('shell.button')).toBe(surface === 'app')
      expect(sdk.supports('media.select')).toBe(surface !== 'agent-pet')
      expect(sdk.supports('workflows')).toBe(surface !== 'agent-pet')
      expect(sdk.api).toBe(first)
      id.value = 'clone-b'
      client.value = second
      expect(sdk.context).toMatchObject({ pluginId: 'clone-b', sourcePluginId: 'source' })
      expect(sdk.api).toBe(second)
      if (surface === 'agent-pet') {
        expect(sdk.supports('subscription.manage')).toBe(false)
        expect(sdk.supports('ui.dialog')).toBe(false)
        expect(injected.manage).toBeNull()
      } else {
        expect(injected.manage).toBe(sdk.subscriptions?.manage)
        expect(injected.manage).toBe(mocks.manage)
        expect(injected.create).toBe(sdk.subscriptions?.create)
        expect(injected.toast).toBe(mocks.toast)
        expect(sdk.supports('subscription.manage.edit')).toBe(true)
      }
      mounted.unmount()
    },
  )
})
