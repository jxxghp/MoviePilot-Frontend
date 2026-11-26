/**
 * moviepilot.pluginHost v2 跨端桥接协议类型定义。
 * 与 MoviePilot-App/shared/contracts/plugin-host-bridge-v2.json 保持一一对应。
 */

export const PLUGIN_HOST_PROTOCOL = 'moviepilot.pluginHost'
export const PLUGIN_HOST_PROTOCOL_MAJOR = 2

export type PluginShellPlatform = 'ios' | 'android' | 'harmony'
export type PluginShellThemeMode = 'dark' | 'light'
export type PluginShellSurface = 'config' | 'dataPage' | 'dashboard' | 'appPage'
export type PluginToastLevel = 'success' | 'info' | 'warning' | 'error'
export type PluginHapticStyle = 'light' | 'medium' | 'heavy' | 'selection' | 'success' | 'warning' | 'error'

export interface NativeVisualSemanticTokens {
  success: string
  warning: string
  danger: string
  info: string
  brand: string
}

export interface NativeVisualTokens {
  mode: PluginShellThemeMode
  platform: PluginShellPlatform
  backgroundPreset?: string
  isAmoledBlack?: boolean
  highContrast?: boolean
  accentHex: string
  onAccentHex?: string
  textPrimaryHex: string
  textSecondaryHex: string
  surfaceGlassRgba: string
  surfaceElevatedRgba: string
  surfaceBorderRgba: string
  surfaceBlurPx: number
  solidSurfaceHex: string
  fieldFillRgba: string
  fieldBorderRgba: string
  chipFillRgba: string
  chipBorderRgba: string
  dividerRgba: string
  panelRadiusPx: number
  sheetRadiusPx: number
  borderWidthPx: number
  semantic: NativeVisualSemanticTokens
  fontFamily?: string
}

export interface SafeAreaInsets {
  top: number
  bottom: number
  left: number
  right: number
}

export interface PluginUserSnapshot {
  id: number
  userName: string
  superUser: boolean
  level: number
  avatar?: string
  permissions: {
    discovery: boolean
    search: boolean
    subscribe: boolean
    manage: boolean
    admin: boolean
    features?: Record<string, boolean>
  }
}

export interface PluginMountPayload {
  mountId: string
  pluginId: string
  sourcePluginId?: string
  pluginName?: string
  pluginVersion?: string
  surface: PluginShellSurface
  navKey?: string
  remoteEntryUrl: string
  showSwitch?: boolean
  props?: Record<string, unknown>
  user?: PluginUserSnapshot
  visualTokens: NativeVisualTokens
  locale?: string
  safeArea?: SafeAreaInsets
}

export interface PluginHeaderActionDescriptor {
  id: string
  icon?: string
  label: string
  disabled?: boolean
  loading?: boolean
}

export interface BridgeApiRequestPayload {
  requestId: string
  method: string
  path: string
  query?: Record<string, unknown>
  headers?: Record<string, string>
  body?: unknown
  bodyEncoding?: 'json' | 'base64' | 'multipart' | 'text'
  responseType?: 'json' | 'text' | 'blob' | 'arraybuffer'
  timeoutMs?: number
}

export interface BridgeApiResponseData {
  status: number
  headers?: Record<string, string>
  body?: unknown
  bodyEncoding?: 'json' | 'base64' | 'text'
}

export interface BridgeResponsePayload {
  requestId: string
  ok: boolean
  data?: unknown
  error?: {
    code?: string
    status?: number
    message: string
    data?: unknown
  }
}

export interface HostToWebEnvelope {
  protocol: typeof PLUGIN_HOST_PROTOCOL
  major: typeof PLUGIN_HOST_PROTOCOL_MAJOR
  type:
    | 'plugin.mount'
    | 'plugin.unmount'
    | 'theme.update'
    | 'locale.update'
    | 'safeArea.update'
    | 'nav.back'
    | 'host.action'
    | 'capsule.action'
    | 'bridge.response'
    | 'device.event'
  payload?: Record<string, unknown>
}

export type WebToHostMessageType =
  | 'shell.ready'
  | 'plugin.mounted'
  | 'plugin.error'
  | 'plugin.close'
  | 'plugin.minimize'
  | 'plugin.capsule.update'
  | 'plugin.restore'
  | 'plugin.action'
  | 'api.request'
  | 'api.abort'
  | 'ui.toast'
  | 'ui.confirm'
  | 'ui.header'
  | 'nav.backResult'
  | 'nav.openRoute'
  | 'nav.openExternal'
  | 'device.capabilities'
  | 'device.info'
  | 'device.permission'
  | 'device.haptic'
  | 'device.clipboard'
  | 'device.clipboard.read'
  | 'device.share'
  | 'device.keepAwake'
  | 'device.notify'
  | 'device.pickMedia'
  | 'device.pickFile'
  | 'device.saveMedia'
  | 'device.scanCode'
  | 'device.authenticate'
  | 'audio.record.start'
  | 'audio.record.pause'
  | 'audio.record.resume'
  | 'audio.record.stop'
  | 'audio.record.cancel'
  | 'audio.record.status'
  | 'audio.play'
  | 'audio.pause'
  | 'audio.resume'
  | 'audio.stop'
  | 'audio.seek'
  | 'audio.setRate'
  | 'audio.setVolume'
  | 'audio.status'
  | 'audio.setNowPlaying'
  | 'audio.clearNowPlaying'
  | 'media.playNative'

export interface WebToHostEnvelope {
  protocol: typeof PLUGIN_HOST_PROTOCOL
  major: typeof PLUGIN_HOST_PROTOCOL_MAJOR
  type: WebToHostMessageType
  payload: Record<string, unknown>
}

declare global {
  interface Window {
    __mpAndroidPluginHostV2?: {
      postMessage: (serialized: string) => void
    }
    __mpHarmonyPluginHostV2?: {
      postMessage: (serialized: string) => void
    }
    __mpPluginHostReceive?: (raw: string | HostToWebEnvelope) => void
    __mpPluginShellReady?: boolean
    MoviePilotNativeCapabilities?: unknown
    webkit?: {
      messageHandlers?: {
        mpPluginHostV2?: {
          postMessage: (message: unknown) => void
        }
      }
    }
  }
}
