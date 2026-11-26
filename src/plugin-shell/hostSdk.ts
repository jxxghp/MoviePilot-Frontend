import { markRaw, provide, reactive, type Component, type Ref } from 'vue'
import {
  createPluginHostSDK,
  PLUGIN_HOST_KEYS,
  PLUGIN_HOST_SDK_KEY,
  type PluginAPI,
  type PluginBackHandler,
  type PluginCapsuleState,
  type PluginConfirm,
  type PluginDialog,
  type PluginEnvironmentSnapshot,
  type PluginHostSDK,
  type PluginHostSurface,
  type PluginMinimizeOptions,
  type PluginMinimizeResult,
  type PluginNativeAudioPlayOptions,
  type PluginNativeAudioPlayResult,
  type PluginNativeAudioRecordStartOptions,
  type PluginNativeAudioRecordStartResult,
  type PluginNativeAudioRecordStatus,
  type PluginNativeAudioRecordStopResult,
  type PluginNativeAudioServices,
  type PluginNativeAudioStatus,
  type PluginNativeAuthResult,
  type PluginNativeCapabilitiesSnapshot,
  type PluginNativeDeviceEvent,
  type PluginNativeDeviceInfo,
  type PluginNativeDeviceServices,
  type PluginNativeHapticStyle,
  type PluginNativeHostServices,
  type PluginNativeMediaPlayOptions,
  type PluginNativeMediaPlayResult,
  type PluginNativeMediaServices,
  type PluginNativeNotifyOptions,
  type PluginNativeNowPlayingOptions,
  type PluginNativePermissionName,
  type PluginNativePermissionStatus,
  type PluginNativePickFileOptions,
  type PluginNativePickMediaOptions,
  type PluginNativePickResult,
  type PluginNativeSaveMediaOptions,
  type PluginNativeScanCodeResult,
  type PluginNativeShareOptions,
  type PluginOperationResult,
  type PluginPermission,
  type PluginShellCommand,
  type PluginToast,
} from '@/sdk/plugin'
import type { PluginHostBridgeClient } from './bridgeClient'
import type {
  PluginHeaderActionDescriptor,
  PluginShellSurface,
  PluginUserSnapshot,
  WebToHostMessageType,
} from './types'

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
  getMountMeta?: () => { mountId: string; pluginId: string; pluginName: string }
  onRequestClose?: () => void
  onHeaderCommandsChanged: (entries: ShellHeaderCommandEntry[]) => void
}) {
  const { bridge, api, state, dialogs, getMountMeta, onRequestClose, onHeaderCommandsChanged } = options
  let dialogSeq = 0
  let commandSeq = 0
  let backHandlerSeq = 0
  const envListeners = new Set<(snap: Readonly<PluginEnvironmentSnapshot>) => void>()
  const registeredCommands = new Map<string, ShellHeaderCommandEntry>()
  const backHandlers: Array<{ id: number; handler: PluginBackHandler }> = []
  const capsuleActionListeners = new Set<(event: { actionId: string }) => void>()

  const closePluginContainer = () => {
    if (onRequestClose) {
      onRequestClose()
    } else {
      const meta = getMountMeta?.()
      bridge.send('plugin.close', { mountId: meta?.mountId || '' })
    }
  }

  const registerBackHandler = (handler: PluginBackHandler): (() => void) => {
    if (typeof handler !== 'function') {
      return () => {}
    }
    backHandlerSeq += 1
    const id = backHandlerSeq
    backHandlers.push({ id, handler })
    return () => {
      const idx = backHandlers.findIndex(item => item.id === id)
      if (idx >= 0) {
        backHandlers.splice(idx, 1)
      }
    }
  }

  const runBackHandlers = async (fallbackHandler?: PluginBackHandler | null): Promise<boolean> => {
    const candidates: PluginBackHandler[] = backHandlers.map(item => item.handler).reverse()
    if (typeof fallbackHandler === 'function') {
      candidates.push(fallbackHandler)
    }
    for (const candidate of candidates) {
      try {
        let timer: ReturnType<typeof setTimeout> | undefined
        const handled = await Promise.race<boolean>([
          Promise.resolve(candidate()).then(Boolean),
          new Promise<boolean>(resolve => {
            timer = setTimeout(() => resolve(false), 300)
          }),
        ])
        if (timer) clearTimeout(timer)
        if (handled) return true
      } catch {
        // 单个返回键拦截器异常时不阻塞后续回退逻辑
      }
    }
    return false
  }

  const dispatchCapsuleAction = (actionId: string) => {
    if (!actionId) return
    for (const listener of capsuleActionListeners) {
      try {
        listener({ actionId })
      } catch {
        // 忽略单个胶囊动作监听异常
      }
    }
  }

  const syncHeaderCommands = () => {
    onHeaderCommandsChanged(Array.from(registeredCommands.values()))
  }

  const getEnvironmentSnapshot = (): Readonly<PluginEnvironmentSnapshot> => {
    const s = state.value
    const perms = s.user.permissions
    const isCompactViewport = typeof window === 'undefined' ? true : window.innerWidth < 960
    return Object.freeze({
      locale: s.locale || 'zh-CN',
      theme: s.theme,
      isMobile: isCompactViewport,
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

  const nativeAudio: PluginNativeAudioServices = Object.freeze({
    startRecord: (opts?: PluginNativeAudioRecordStartOptions) =>
      bridge.invoke<PluginNativeAudioRecordStartResult>(
        'audio.record.start',
        (opts ?? {}) as Record<string, unknown>,
        30_000,
      ),
    pauseRecord: () =>
      bridge.invoke<{ recordingId: string; state: 'paused'; durationMs: number }>('audio.record.pause', {}, 15_000),
    resumeRecord: () =>
      bridge.invoke<{ recordingId: string; state: 'recording'; durationMs: number }>('audio.record.resume', {}, 15_000),
    stopRecord: (opts?: { includeBase64?: boolean }) =>
      bridge.invoke<PluginNativeAudioRecordStopResult>(
        'audio.record.stop',
        { includeBase64: opts?.includeBase64 ?? true },
        60_000,
      ),
    cancelRecord: () => bridge.invoke<{ cancelled: boolean }>('audio.record.cancel', {}, 15_000),
    getRecordStatus: () => bridge.invoke<PluginNativeAudioRecordStatus>('audio.record.status', {}, 10_000),
    play: (opts: PluginNativeAudioPlayOptions) =>
      bridge.invoke<PluginNativeAudioPlayResult>('audio.play', opts as unknown as Record<string, unknown>, 30_000),
    pause: () => bridge.invoke<PluginNativeAudioStatus>('audio.pause', {}, 15_000),
    resume: () => bridge.invoke<PluginNativeAudioStatus>('audio.resume', {}, 15_000),
    stop: () => bridge.invoke<{ stopped: boolean }>('audio.stop', {}, 15_000),
    seek: (positionMs: number) => bridge.invoke<PluginNativeAudioStatus>('audio.seek', { positionMs }, 15_000),
    setRate: (rate: number) => bridge.invoke<{ playbackId?: string; rate: number }>('audio.setRate', { rate }, 10_000),
    setVolume: (volume: number) =>
      bridge.invoke<{ playbackId?: string; volume: number }>('audio.setVolume', { volume }, 10_000),
    getStatus: () => bridge.invoke<PluginNativeAudioStatus>('audio.status', {}, 10_000),
    setNowPlaying: (opts: PluginNativeNowPlayingOptions) =>
      bridge.invoke<{ registered: boolean }>('audio.setNowPlaying', opts as unknown as Record<string, unknown>, 10_000),
    clearNowPlaying: () => bridge.invoke<{ cleared: boolean }>('audio.clearNowPlaying', {}, 10_000),
    onEvent: (listener: (event: PluginNativeDeviceEvent) => void) =>
      bridge.onDeviceEvent(ev => {
        if (ev.event.startsWith('audio.')) {
          listener(ev)
        }
      }),
  })

  const nativeMedia: PluginNativeMediaServices = Object.freeze({
    playNative: (opts: PluginNativeMediaPlayOptions) =>
      bridge.invoke<PluginNativeMediaPlayResult>(
        'media.playNative',
        opts as unknown as Record<string, unknown>,
        30_000,
      ),
  })

  const nativeDevice: PluginNativeDeviceServices = Object.freeze({
    getCapabilities: () => bridge.invoke<PluginNativeCapabilitiesSnapshot>('device.capabilities', {}, 10_000),
    getInfo: () => bridge.invoke<PluginNativeDeviceInfo>('device.info', {}, 10_000),
    checkPermission: (permission: PluginNativePermissionName, opts?: { request?: boolean }) =>
      bridge.invoke<{ permission: PluginNativePermissionName; status: PluginNativePermissionStatus }>(
        'device.permission',
        { permission, request: Boolean(opts?.request) },
        60_000,
      ),
    haptic: (style: PluginNativeHapticStyle = 'light') => bridge.haptic(style),
    copyText: (text: string) => bridge.invoke<{ copied: boolean }>('device.clipboard', { text }, 10_000),
    readClipboard: () => bridge.invoke<{ text: string }>('device.clipboard.read', {}, 10_000),
    share: (opts: PluginNativeShareOptions) =>
      bridge.invoke<{ completed: boolean; cancelled?: boolean }>(
        'device.share',
        opts as unknown as Record<string, unknown>,
        300_000,
      ),
    keepAwake: (enabled: boolean) => bridge.invoke<{ enabled: boolean }>('device.keepAwake', { enabled }, 10_000),
    notify: (opts: PluginNativeNotifyOptions) =>
      bridge.invoke<{ scheduled: boolean; id: string }>(
        'device.notify',
        opts as unknown as Record<string, unknown>,
        30_000,
      ),
    pickMedia: (opts?: PluginNativePickMediaOptions) =>
      bridge.invoke<PluginNativePickResult>('device.pickMedia', (opts ?? {}) as Record<string, unknown>, 300_000),
    pickFile: (opts?: PluginNativePickFileOptions) =>
      bridge.invoke<PluginNativePickResult>('device.pickFile', (opts ?? {}) as Record<string, unknown>, 300_000),
    saveMedia: (opts: PluginNativeSaveMediaOptions) =>
      bridge.invoke<{ saved: boolean }>('device.saveMedia', opts as unknown as Record<string, unknown>, 60_000),
    scanCode: (opts?: { prompt?: string }) =>
      bridge.invoke<PluginNativeScanCodeResult>('device.scanCode', (opts ?? {}) as Record<string, unknown>, 300_000),
    authenticate: (opts?: { reason?: string }) =>
      bridge.invoke<PluginNativeAuthResult>('device.authenticate', (opts ?? {}) as Record<string, unknown>, 120_000),
    openExternal: (url: string) => bridge.openExternal(url),
  })

  const nativeHost: PluginNativeHostServices = Object.freeze({
    audio: nativeAudio,
    media: nativeMedia,
    device: nativeDevice,
    invoke: <T = Record<string, unknown>>(type: string, payload: Record<string, unknown> = {}, timeoutMs = 120_000) =>
      bridge.invoke<T>(type as WebToHostMessageType, payload, timeoutMs),
    onEvent: (listener: (event: PluginNativeDeviceEvent) => void) => bridge.onDeviceEvent(listener),
  })

  const sdk: PluginHostSDK = createPluginHostSDK({
    hostVersion: typeof __APP_VERSION__ === 'string' ? __APP_VERSION__.replace(/^v/, '') : '3.0.0',
    context: () => ({
      pluginId: state.value.pluginId,
      sourcePluginId: state.value.sourcePluginId,
      surface: mapSurfaceToSdk(state.value.surface),
    }),
    api: () => api,
    ui: { toast, dialog, confirm },
    native: nativeHost,
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
      onBack: registerBackHandler,
      close: closePluginContainer,
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
      close: closePluginContainer,
      minimize: async (opts?: PluginMinimizeOptions): Promise<PluginMinimizeResult> => {
        const meta = getMountMeta?.()
        return bridge.invoke<PluginMinimizeResult>(
          'plugin.minimize',
          {
            mountId: meta?.mountId || '',
            pluginId: meta?.pluginId || state.value.pluginId,
            pluginName: meta?.pluginName || state.value.pluginId,
            ...((opts ?? {}) as Record<string, unknown>),
          },
          15_000,
        )
      },
      updateCapsule: (capsuleState: PluginCapsuleState) => {
        const meta = getMountMeta?.()
        bridge.send('plugin.capsule.update', {
          mountId: meta?.mountId || '',
          pluginId: meta?.pluginId || state.value.pluginId,
          ...((capsuleState ?? {}) as Record<string, unknown>),
        })
      },
      restore: async (): Promise<{ restored: boolean }> => {
        const meta = getMountMeta?.()
        return bridge.invoke<{ restored: boolean }>(
          'plugin.restore',
          {
            mountId: meta?.mountId || '',
            pluginId: meta?.pluginId || state.value.pluginId,
          },
          10_000,
        )
      },
      onCapsuleAction: (listener: (event: { actionId: string }) => void) => {
        if (typeof listener !== 'function') return () => {}
        capsuleActionListeners.add(listener)
        return () => {
          capsuleActionListeners.delete(listener)
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
  provide(PLUGIN_HOST_KEYS.native, nativeHost)

  const clearRegisteredCommands = () => {
    backHandlers.length = 0
    capsuleActionListeners.clear()
    if (registeredCommands.size > 0) {
      registeredCommands.clear()
      syncHeaderCommands()
    }
  }

  return {
    sdk,
    nativeHost,
    toast,
    confirm,
    nativeSubscribe,
    subscriptionManager,
    notifyEnvironmentChanged,
    clearRegisteredCommands,
    runBackHandlers,
    dispatchCapsuleAction,
  }
}
