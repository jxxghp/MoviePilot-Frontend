import type { PluginNativeDeviceEvent } from '@/sdk/plugin'
import {
  PLUGIN_HOST_PROTOCOL,
  PLUGIN_HOST_PROTOCOL_MAJOR,
  type BridgeApiRequestPayload,
  type BridgeApiResponseData,
  type BridgeResponsePayload,
  type HostToWebEnvelope,
  type PluginHapticStyle,
  type PluginHeaderActionDescriptor,
  type PluginToastLevel,
  type WebToHostEnvelope,
  type WebToHostMessageType,
} from './types'

type HostMessageListener = (envelope: HostToWebEnvelope) => void
type DeviceEventListener = (event: PluginNativeDeviceEvent) => void

interface PendingRequest {
  resolve: (value: unknown) => void
  reject: (reason: Error) => void
  timer?: ReturnType<typeof setTimeout>
}

export class PluginBridgeError extends Error {
  readonly status?: number
  readonly code?: string
  readonly data?: unknown

  constructor(message: string, options?: { status?: number; code?: string; data?: unknown }) {
    super(message)
    this.name = 'PluginBridgeError'
    this.status = options?.status
    this.code = options?.code
    this.data = options?.data
  }
}

/**
 * 统一三端原生通信客户端（iOS WKScriptMessageHandler / Android JavascriptInterface / HarmonyOS javaScriptProxy）。
 * 负责异步 requestId 关联、超时/取消与宿主下行指令分发。
 */
export class PluginHostBridgeClient {
  private readonly listeners = new Set<HostMessageListener>()
  private readonly deviceEventListeners = new Set<DeviceEventListener>()
  private readonly pending = new Map<string, PendingRequest>()
  private requestSeq = 0

  constructor(options?: { bindGlobal?: boolean }) {
    if (options?.bindGlobal) {
      this.attachGlobalReceiver()
    }
  }

  attachGlobalReceiver(): void {
    if (typeof window !== 'undefined') {
      window.__mpPluginHostReceive = raw => this.receiveFromHost(raw)
    }
  }

  onHostMessage(listener: HostMessageListener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  onDeviceEvent(listener: DeviceEventListener): () => void {
    this.deviceEventListeners.add(listener)
    return () => {
      this.deviceEventListeners.delete(listener)
    }
  }

  clearDeviceEventListeners(): void {
    this.deviceEventListeners.clear()
  }

  receiveFromHost(raw: string | HostToWebEnvelope): void {
    let envelope: HostToWebEnvelope | null = null
    if (typeof raw === 'string') {
      try {
        envelope = JSON.parse(raw) as HostToWebEnvelope
      } catch {
        return
      }
    } else if (raw && typeof raw === 'object') {
      envelope = raw
    }
    if (
      !envelope ||
      envelope.protocol !== PLUGIN_HOST_PROTOCOL ||
      envelope.major !== PLUGIN_HOST_PROTOCOL_MAJOR ||
      typeof envelope.type !== 'string'
    ) {
      return
    }

    if (envelope.type === 'bridge.response') {
      this.handleBridgeResponse(envelope.payload as unknown as BridgeResponsePayload)
      return
    }

    if (envelope.type === 'device.event') {
      const payload = envelope.payload || {}
      const eventName = typeof payload.event === 'string' ? payload.event : ''
      if (eventName) {
        const eventObj: PluginNativeDeviceEvent = {
          event: eventName,
          data: payload.data && typeof payload.data === 'object' ? (payload.data as Record<string, unknown>) : {},
        }
        for (const listener of this.deviceEventListeners) {
          try {
            listener(eventObj)
          } catch (error) {
            console.error('[plugin-shell] device event listener error:', error)
          }
        }
      }
      return
    }

    for (const listener of this.listeners) {
      try {
        listener(envelope)
      } catch (error) {
        console.error('[plugin-shell] host message listener error:', error)
      }
    }
  }

  send(type: WebToHostMessageType, payload: Record<string, unknown> = {}): boolean {
    const envelope: WebToHostEnvelope = {
      protocol: PLUGIN_HOST_PROTOCOL,
      major: PLUGIN_HOST_PROTOCOL_MAJOR,
      type,
      payload,
    }
    if (typeof window === 'undefined') return false

    const serialized = JSON.stringify(envelope)
    const iosHandler = window.webkit?.messageHandlers?.mpPluginHostV2
    if (iosHandler) {
      // 始终以 JSON 字符串投递，避免 Vue 响应式 Proxy 触发 WebKit postMessage 静默失败/DataCloneError
      iosHandler.postMessage(serialized)
      return true
    }

    if (window.__mpAndroidPluginHostV2) {
      window.__mpAndroidPluginHostV2.postMessage(serialized)
      return true
    }
    if (window.__mpHarmonyPluginHostV2) {
      window.__mpHarmonyPluginHostV2.postMessage(serialized)
      return true
    }

    return false
  }

  /** 调用原生本地能力（录音、播放、文件/相册、剪贴板、分享、扫码、鉴权等）并等待 bridge.response 返回。 */
  invoke<T = Record<string, unknown>>(
    type: WebToHostMessageType,
    payload: Record<string, unknown> = {},
    timeoutMs = 120_000,
  ): Promise<T> {
    const requestId = this.nextRequestId('native')
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(
        () => {
          if (!this.pending.has(requestId)) return
          this.pending.delete(requestId)
          reject(new PluginBridgeError(`Native capability timeout: ${type}`, { code: 'TIMEOUT' }))
        },
        Math.max(1000, timeoutMs),
      )

      this.pending.set(requestId, {
        resolve: value => resolve((value ?? {}) as T),
        reject: err => reject(err),
        timer,
      })

      const dispatched = this.send(type, {
        ...payload,
        requestId,
      })
      if (!dispatched) {
        clearTimeout(timer)
        this.pending.delete(requestId)
        reject(new PluginBridgeError('Native plugin host transport unavailable', { code: 'NO_TRANSPORT' }))
      }
    })
  }

  nextRequestId(prefix = 'req'): string {
    this.requestSeq += 1
    return `${prefix}_${Date.now().toString(36)}_${this.requestSeq}`
  }

  requestApi(
    payload: Omit<BridgeApiRequestPayload, 'requestId'>,
    signal?: AbortSignal,
  ): Promise<BridgeApiResponseData> {
    if (signal?.aborted) {
      return Promise.reject(new PluginBridgeError('Request aborted', { code: 'ABORTED' }))
    }

    const requestId = this.nextRequestId('api')
    const timeoutMs = payload.timeoutMs ?? 60_000

    return new Promise<BridgeApiResponseData>((resolve, reject) => {
      const cleanupAbort = () => {
        if (signal) signal.removeEventListener('abort', onAbort)
      }
      const onAbort = () => {
        const item = this.pending.get(requestId)
        if (!item) return
        if (item.timer) clearTimeout(item.timer)
        this.pending.delete(requestId)
        this.send('api.abort', { requestId })
        reject(new PluginBridgeError('Request aborted', { code: 'ABORTED' }))
      }

      const timer = setTimeout(
        () => {
          if (!this.pending.has(requestId)) return
          this.pending.delete(requestId)
          cleanupAbort()
          this.send('api.abort', { requestId })
          reject(new PluginBridgeError('Request timeout', { code: 'TIMEOUT' }))
        },
        Math.max(1000, timeoutMs),
      )

      this.pending.set(requestId, {
        resolve: value => {
          cleanupAbort()
          resolve(value as BridgeApiResponseData)
        },
        reject: err => {
          cleanupAbort()
          reject(err)
        },
        timer,
      })

      if (signal) {
        signal.addEventListener('abort', onAbort, { once: true })
      }

      const dispatched = this.send('api.request', {
        ...payload,
        requestId,
      })
      if (!dispatched) {
        clearTimeout(timer)
        this.pending.delete(requestId)
        cleanupAbort()
        reject(new PluginBridgeError('Native plugin host transport unavailable', { code: 'NO_TRANSPORT' }))
      }
    })
  }

  toast(level: PluginToastLevel, message: string): void {
    if (!message) return
    this.send('ui.toast', { level, message })
  }

  confirm(options: {
    title?: string
    message?: string
    confirmText?: string
    cancelText?: string
    destructive?: boolean
  }): Promise<boolean> {
    const requestId = this.nextRequestId('confirm')
    return new Promise<boolean>(resolve => {
      const timer = setTimeout(() => {
        if (!this.pending.has(requestId)) return
        this.pending.delete(requestId)
        resolve(false)
      }, 120_000)

      this.pending.set(requestId, {
        resolve: value => {
          if (typeof value === 'boolean') {
            resolve(value)
          } else if (value && typeof value === 'object' && 'confirmed' in value) {
            resolve(Boolean((value as { confirmed?: unknown }).confirmed))
          } else {
            resolve(Boolean(value))
          }
        },
        reject: () => resolve(false),
        timer,
      })

      const dispatched = this.send('ui.confirm', {
        requestId,
        title: options.title ?? '',
        message: options.message ?? '',
        confirmText: options.confirmText ?? '',
        cancelText: options.cancelText ?? '',
        destructive: Boolean(options.destructive),
      })
      if (!dispatched) {
        clearTimeout(timer)
        this.pending.delete(requestId)
        resolve(false)
      }
    })
  }

  updateHeader(title: string, subtitle: string, actions: PluginHeaderActionDescriptor[]): void {
    this.send('ui.header', { title, subtitle, actions })
  }

  openRoute(deepLink: string): void {
    this.send('nav.openRoute', { deepLink })
  }

  openExternal(url: string): void {
    this.send('nav.openExternal', { url })
  }

  haptic(style: PluginHapticStyle): void {
    this.send('device.haptic', { style })
  }

  copyClipboard(text: string): void {
    this.send('device.clipboard', { text })
  }

  abortAllPending(reason = 'Plugin unmounted'): void {
    for (const [requestId, entry] of this.pending.entries()) {
      if (entry.timer) clearTimeout(entry.timer)
      if (requestId.startsWith('api_')) {
        this.send('api.abort', { requestId })
      }
      entry.reject(new PluginBridgeError(reason, { code: 'ABORTED' }))
    }
    this.pending.clear()
  }

  private handleBridgeResponse(payload: BridgeResponsePayload | undefined): void {
    if (!payload || typeof payload.requestId !== 'string') return
    const entry = this.pending.get(payload.requestId)
    if (!entry) return
    if (entry.timer) clearTimeout(entry.timer)
    this.pending.delete(payload.requestId)

    if (payload.ok) {
      entry.resolve(payload.data)
      return
    }
    const errInfo = payload.error
    entry.reject(
      new PluginBridgeError(errInfo?.message || 'Native request failed', {
        status: errInfo?.status,
        code: errInfo?.code,
        data: errInfo?.data,
      }),
    )
  }
}

export const pluginHostBridge = new PluginHostBridgeClient({ bindGlobal: true })
