import { provide, toValue, type MaybeRefOrGetter } from 'vue'
import { useToast } from 'vue-toastification'
import { version as hostVersion } from '../../package.json'
import { useScopedAgentHost } from '@/composables/useAgentHost'
import { usePluginSDKScope } from './usePluginSDKScope'
import { usePluginDataServices } from './usePluginDataServices'
import { usePluginNativeActions } from './usePluginNativeActions'
import { usePluginShellServices } from './usePluginShellServices'
import { useConfirm } from '@/composables/useConfirm'
import { usePluginNativeSubscribe } from '@/composables/usePluginNativeSubscribe'
import { usePluginSubscriptionManager } from '@/composables/usePluginSubscriptionManager'
import { openSharedDialog } from '@/composables/useSharedDialog'
import {
  createPluginHostSDK,
  PLUGIN_HOST_KEYS,
  PLUGIN_HOST_SDK_KEY,
  type InteractivePluginHostSDK,
  type PluginAPI,
  type PluginHostSDK,
  type PluginHostSurface,
} from '@/sdk/plugin'
import type { AgentPetContext, MoviePilotAgentHost } from '@/types/agentHost'

/** 宿主提供响应式身份与已绑定当前实例的 API，SDK 不读取全局插件 API。 */
export interface PluginHostSDKOptions {
  pluginId: MaybeRefOrGetter<string | null | undefined>
  sourcePluginId?: MaybeRefOrGetter<string | null | undefined>
  surface: PluginHostSurface
  api: MaybeRefOrGetter<PluginAPI>
  agent?: MoviePilotAgentHost
  pet?: AgentPetContext
}

/** 为各联邦宿主提供同一套 SDK，同时维持旧注入键的函数身份和行为。 */
export function providePluginHostSDK(
  options: PluginHostSDKOptions & {
    surface: Exclude<PluginHostSurface, 'agent-pet'>
  },
): InteractivePluginHostSDK
export function providePluginHostSDK(options: PluginHostSDKOptions): PluginHostSDK
export function providePluginHostSDK(options: PluginHostSDKOptions): PluginHostSDK {
  const scope = usePluginSDKScope(options.pluginId)
  const dataServices = usePluginDataServices(scope)
  const shellServices = usePluginShellServices(scope, options.surface === 'app')
  const agent = options.agent ?? useScopedAgentHost(options.pluginId)
  const common = {
    ...dataServices,
    ...shellServices,
    hostVersion,
    context: () => ({
      pluginId: toValue(options.pluginId) || '',
      sourcePluginId: toValue(options.sourcePluginId) || undefined,
      surface: options.surface,
    }),
    api: () => toValue(options.api),
    agent,
    pet: options.pet,
  }
  const sdk =
    options.surface === 'agent-pet'
      ? createPluginHostSDK(common)
      : createPluginHostSDK({
          ...common,
          ...usePluginNativeActions(scope),
          ui: { toast: useToast(), dialog: openSharedDialog, confirm: useConfirm() },
          subscriptions: {
            create: usePluginNativeSubscribe(() => scope.capture('subscribe')),
            createMusic: usePluginNativeSubscribe(() => scope.capture('subscribe', 'subscribe.music'), true),
            manage: usePluginSubscriptionManager(scope),
          },
        })
  provide(PLUGIN_HOST_SDK_KEY, sdk)
  provide(PLUGIN_HOST_KEYS.agent, agent)
  if (sdk.ui) {
    provide(PLUGIN_HOST_KEYS.toast, sdk.ui.toast)
    provide(PLUGIN_HOST_KEYS.dialog, sdk.ui.dialog)
    provide(PLUGIN_HOST_KEYS.confirm, sdk.ui.confirm)
  }
  if (sdk.subscriptions) {
    provide(PLUGIN_HOST_KEYS.nativeSubscribe, sdk.subscriptions.create)
    provide(PLUGIN_HOST_KEYS.subscriptionManager, sdk.subscriptions.manage)
  }
  return sdk
}
