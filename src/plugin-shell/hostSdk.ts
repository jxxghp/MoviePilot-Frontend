import {
  markRaw,
  provide,
  reactive,
  type Component,
  type Ref,
} from 'vue'
import {
  createPluginHostSDK,
  PLUGIN_HOST_KEYS,
  PLUGIN_HOST_SDK_KEY,
  type PluginAPI,
  type PluginConfirm,
  type PluginDialog,
  type PluginEnvironmentSnapshot,
  type PluginHostSDK,
  type PluginHostSurface,
  type PluginOperationResult,
  type PluginPermission,
  type PluginShellCommand,
  type PluginToast,
} from '@/sdk/plugin'
import type { PluginHostBridgeClient } from './bridgeClient'
import type { PluginHeaderActionDescriptor, PluginShellSurface, PluginUserSnapshot } from './types'

export interface InlineSharedDialogEntry {
  id: number
  component: Component
  props: Record<string, unknown>
  events: Record<string, (...args: unknown[]) => unknown>
  closeOn: string[] | false
}

export interface PluginShellRuntimeState {
  pluginId: string
  sourcePluginId?: string
  surface: PluginShellSurface
  locale: string
  theme: 'light' | 'dark'
  user: PluginUserSnapshot
}

export interface ShellHeaderCommandEntry {
  id: string
  descriptor: PluginHeaderActionDescriptor
  invoke: () => void
}

function mapSurfaceToSdk(surface: PluginShellSurface): PluginHostSurface {
  switch (surface) {
    case 'config':
      return 'config'
    case 'dashboard':
      return 'dashboard'
    case 'appPage':
      return 'app'
    case 'dataPage':
    default:
      return 'page'
  }
}

function toRouteDeepLink(path: string, query?: Record<string, string | number | boolean | undefined>): string {
  const clean = path.replace(/^\/+/, '')
  const search = new URLSearchParams()
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null) {
        search.set(key, String(value))
      }
    }
  }
  const qs = search.toString()
  return qs ? `moviepilot://${clean}?${qs}` : `moviepilot://${clean}`
}

/**
 * 为本地极简联邦运行时提供轻量版 PluginHostSDK 与旧注入键（toast/confirm/dialog/nativeSubscribe/subscriptionManager/agent）。
 * 零依赖主站 Pinia Store / Vue Router，原生 UI 能力直接对接 Native Bridge。
 */
export function providePluginShellSDK(options: {
  bridge: PluginHostBridgeClient
  api: PluginAPI
  state: Ref<PluginShellRuntimeState>
  dialogs: Ref<InlineSharedDialogEntry[]>
  onHeaderCommandsChanged: (entries: ShellHeaderCommandEntry[]) => void
}) {
  const { bridge, api, state, dialogs, onHeaderCommandsChanged } = options
  let dialogSeq = 0
  let commandSeq = 0
  const envListeners = new Set<(snap: Readonly<PluginEnvironmentSnapshot>) => void>()
  const registeredCommands = new Map<string, ShellHeaderCommandEntry>()

  const syncHeaderCommands = () => {
    onHeaderCommandsChanged(Array.from(registeredCommands.values()))
  }

  const getEnvironmentSnapshot = (): Readonly<PluginEnvironmentSnapshot> => {
    const s = state.value
    const perms = s.user.permissions
    return Object.freeze({
      locale: s.locale || 'zh-CN',
      theme: s.theme,
      isMobile: true,
      online: typeof navigator === 'undefined' ? true : navigator.onLine !== false,
      user: Object.freeze({
        id: s.user.id,
        name: s.user.userName,
        isAdmin: s.user.superUser,
      }),
      permissions: Object.freeze({
        discovery: Boolean(perms.discovery),
        search: Boolean(perms.search),
        subscribe: Boolean(perms.subscribe),
        manage: Boolean(perms.manage),
        admin: Boolean(perms.admin),
      }),
      features: Object.freeze({ ...(perms.features || {}) }),
    })
  }

  const notifyEnvironmentChanged = () => {
    const snap = getEnvironmentSnapshot()
    for (const listener of envListeners) {
      try {
        listener(snap)
      } catch {
        // 忽略单个监听异常
      }
    }
  }

  const toast: PluginToast = {
    success: message => bridge.toast('success', String(message ?? '')),
    info: message => bridge.toast('info', String(message ?? '')),
    warning: message => bridge.toast('warning', String(message ?? '')),
    error: message => bridge.toast('error', String(message ?? '')),
  }

  const confirm: PluginConfirm = async opts => {
    return bridge.confirm({
      title: opts?.title || '确认操作',
      message: opts?.content || '',
      confirmText: opts?.confirmText || '确定',
      cancelText: opts?.cancelText || '取消',
      destructive: opts?.type === 'error' || opts?.type === 'warn',
    })
  }

  const dialog: PluginDialog = (component, props = {}, events = {}, dialogOptions = {}) => {
    dialogSeq += 1
    const id = dialogSeq
    const entry: InlineSharedDialogEntry = {
      id,
      component: markRaw(component),
      props: reactive({ ...props }),
      events,
      closeOn: dialogOptions.closeOn ?? ['close', 'done', 'cancel'],
    }
    if (dialogOptions.replace) {
      dialogs.value = [entry]
    } else {
      dialogs.value = [...dialogs.value, entry]
    }
    return {
      id,
      close: () => {
        dialogs.value = dialogs.value.filter(item => item.id !== id)
      },
      updateProps: nextProps => {
        Object.assign(entry.props, nextProps)
      },
    }
  }

  const openNativeRoute = async (
    path: string,
    query?: Record<string, string | number | boolean | undefined>,
  ): Promise<PluginOperationResult> => {
    bridge.openRoute(toRouteDeepLink(path, query))
    return { success: true, status: 'opened' }
  }

  const nativeSubscribe = async (media: Record<string, unknown>) => {
    const mediaId = media?.media_id
    const mediaSource = typeof media?.media_source === 'string' ? media.media_source : ''
    if (!mediaSource || mediaId === undefined || mediaId === null || String(mediaId).trim() === '') {
      return { success: false as const, code: 'INVALID_MEDIA' as const, message: '缺少有效媒体主身份' }
    }
    bridge.openRoute(
      toRouteDeepLink('media', {
        media_source: mediaSource,
        media_id: String(mediaId),
        type: typeof media.type === 'string' ? media.type : undefined,
        title: typeof media.title === 'string' ? media.title : undefined,
      }),
    )
    return { success: true as const }
  }

  const subscriptionManager = async (request: { action: string; subscriptionId: number }) => {
    if (!Number.isFinite(request.subscriptionId) || request.subscriptionId <= 0) {
      return { success: false as const, code: 'INVALID_REQUEST' as const, message: '无效订阅 ID' }
    }
    bridge.openRoute(
      toRouteDeepLink(`subscribe/${request.subscriptionId}`, {
        action: request.action,
      }),
    )
    return { success: true as const, status: 'opened' as const }
  }

  const sdk: PluginHostSDK = createPluginHostSDK({
    hostVersion: typeof __APP_VERSION__ === 'string' ? __APP_VERSION__.replace(/^v/, '') : '3.0.0',
    context: () => ({
      pluginId: state.value.pluginId,
      sourcePluginId: state.value.sourcePluginId,
      surface: mapSurfaceToSdk(state.value.surface),
    }),
    api: () => api,
    ui: { toast, dialog, confirm },
    subscriptions: {
      create: nativeSubscribe,
      createMusic: nativeSubscribe,
      manage: subscriptionManager,
    },
    media: {
      detail: async media =>
        openNativeRoute('media', {
          media_source: media.media_source,
          media_id: String(media.media_id),
          type: media.type,
          title: media.title,
        }),
      select: async () => ({ success: false, code: 'CANCELLED', cancelled: true }),
      recognize: async opts => openNativeRoute('recognize', { path: opts.path }),
    },
    navigation: {
      push: async target => openNativeRoute(target.path, target.query),
      replace: async target => openNativeRoute(target.path, target.query),
    },
    environment: {
      getSnapshot: getEnvironmentSnapshot,
      subscribe: listener => {
        envListeners.add(listener)
        listener(getEnvironmentSnapshot())
        return () => {
          envListeners.delete(listener)
        }
      },
      hasPermission: (permission: PluginPermission, feature?: string) => {
        const snap = getEnvironmentSnapshot()
        if (snap.user.isAdmin) return true
        if (!snap.permissions[permission]) return false
        if (feature) return Boolean(snap.features[feature])
        return true
      },
    },
    preferences: {
      get: async <T = unknown>(key: string) => {
        const pid = state.value.pluginId
        try {
          const result = (await api.get(`user/config/plugin_${pid}_${key}`, { feedback: 'silent' })) as {
            data?: { value?: T }
            value?: T
          } | null
          if (result && typeof result === 'object') {
            if ('value' in result) return (result.value ?? null) as T | null
            if (result.data && 'value' in result.data) return (result.data.value ?? null) as T | null
          }
          return null
        } catch {
          return null
        }
      },
      set: async (key: string, value: unknown) => {
        const pid = state.value.pluginId
        await api.post(`user/config/plugin_${pid}_${key}`, { value }, { feedback: 'silent' })
      },
      remove: async (key: string) => {
        const pid = state.value.pluginId
        await api.post(`user/config/plugin_${pid}_${key}`, { value: null }, { feedback: 'silent' })
      },
    },
    shell: {
      registerButton: (command: PluginShellCommand & { menuItems?: PluginShellCommand[] }) => {
        commandSeq += 1
        const id = `sdk_btn_${commandSeq}`
        registeredCommands.set(id, {
          id,
          descriptor: {
            id,
            icon: command.icon,
            label: command.title,
            disabled: Boolean(command.disabled),
          },
          invoke: () => command.action(),
        })
        syncHeaderCommands()
        return () => {
          registeredCommands.delete(id)
          syncHeaderCommands()
        }
      },
    },
  })

  provide(PLUGIN_HOST_SDK_KEY, sdk)
  provide(PLUGIN_HOST_KEYS.toast, toast)
  provide(PLUGIN_HOST_KEYS.dialog, dialog)
  provide(PLUGIN_HOST_KEYS.confirm, confirm)
  provide(PLUGIN_HOST_KEYS.nativeSubscribe, nativeSubscribe)
  provide(PLUGIN_HOST_KEYS.subscriptionManager, subscriptionManager)

  const clearRegisteredCommands = () => {
    if (registeredCommands.size > 0) {
      registeredCommands.clear()
      syncHeaderCommands()
    }
  }

  return {
    sdk,
    toast,
    confirm,
    nativeSubscribe,
    subscriptionManager,
    notifyEnvironmentChanged,
    clearRegisteredCommands,
  }
}
