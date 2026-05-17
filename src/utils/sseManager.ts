export type SSEConnectionStatus = 'idle' | 'connecting' | 'open' | 'error' | 'closed'

export interface SSEManagerOptions {
  backgroundCloseDelay: number
  reconnectDelay: number
  maxReconnectAttempts: number
  reconnectBackoffMultiplier: number
  maxReconnectDelay: number
}

type SSEMessageListener = (event: MessageEvent) => void
type SSEStatusListener = (status: SSEConnectionStatus) => void

/**
 * SSE连接管理器
 * 统一收口 EventSource 生命周期，避免后台常驻连接和重复重连。
 */
export class SSEManager {
  private eventSource: EventSource | null = null
  private url: string
  private isBackground = document.hidden
  private reconnectTimer: number | null = null
  private backgroundCloseTimer: number | null = null
  private listeners: Map<string, SSEMessageListener> = new Map()
  private statusListeners: Map<string, SSEStatusListener> = new Map()
  private options: SSEManagerOptions
  private reconnectAttempts = 0
  private isConnecting = false
  private isDestroyed = false
  private connectionStatus: SSEConnectionStatus = 'idle'
  private readonly handleVisibilityChange = () => {
    if (document.hidden) {
      this.handleBackground()
    } else {
      this.handleForeground()
    }
  }
  private readonly handleBeforeUnload = () => {
    this.destroy()
  }

  constructor(url: string, options: Partial<SSEManagerOptions> = {}) {
    this.url = url
    this.options = {
      backgroundCloseDelay: 5000, // 5秒后关闭后台连接
      reconnectDelay: 3000, // 3秒后重连
      maxReconnectAttempts: 3,
      reconnectBackoffMultiplier: 1.5,
      maxReconnectDelay: 30_000,
      ...options,
    }

    this.setupVisibilityListener()
  }

  private setupVisibilityListener() {
    document.addEventListener('visibilitychange', this.handleVisibilityChange)
    window.addEventListener('beforeunload', this.handleBeforeUnload)
  }

  private removeVisibilityListener() {
    document.removeEventListener('visibilitychange', this.handleVisibilityChange)
    window.removeEventListener('beforeunload', this.handleBeforeUnload)
  }

  private handleBackground() {
    if (this.isDestroyed) return

    this.isBackground = true
    this.clearReconnectTimer()

    // 延迟关闭SSE连接，避免频繁切换
    this.clearBackgroundCloseTimer()

    this.backgroundCloseTimer = window.setTimeout(() => {
      if (this.isBackground && this.eventSource) {
        this.closeCurrentEventSource()
        this.setConnectionStatus('closed')
      }
    }, this.options.backgroundCloseDelay)
  }

  private handleForeground() {
    if (this.isDestroyed) return

    this.isBackground = false

    // 清除后台关闭定时器
    this.clearBackgroundCloseTimer()

    // 只有在有活跃监听器时才重新建立连接
    if (this.listeners.size > 0 && (!this.eventSource || this.eventSource.readyState === EventSource.CLOSED)) {
      this.reconnectSSE(0)
    }
  }

  private reconnectSSE(attemptCount = 0) {
    if (this.isDestroyed || this.isBackground || this.listeners.size === 0) {
      return
    }

    if (attemptCount > this.options.maxReconnectAttempts) {
      this.reconnectAttempts = this.options.maxReconnectAttempts
      this.setConnectionStatus('closed')
      return
    }

    if (this.isConnecting) {
      return
    }

    this.clearReconnectTimer()
    this.closeCurrentEventSource()
    this.isConnecting = true
    this.reconnectAttempts = attemptCount
    this.setConnectionStatus('connecting')

    try {
      const source = new EventSource(this.url)
      this.eventSource = source

      source.onopen = () => {
        if (source !== this.eventSource) return
        this.isConnecting = false
        this.reconnectAttempts = 0
        this.setConnectionStatus('open')
      }

      source.onerror = () => {
        if (source !== this.eventSource) return

        this.isConnecting = false
        this.setConnectionStatus('error')

        if (source.readyState === EventSource.CLOSED) {
          this.closeCurrentEventSource()
          this.scheduleReconnect(this.reconnectAttempts + 1)
        }
      }

      source.onmessage = event => {
        if (source !== this.eventSource || this.isDestroyed) return

        // 分发消息给所有监听器
        this.listeners.forEach((listener, listenerId) => {
          try {
            // 为每个监听器提供独立的错误处理
            listener(event)
          } catch (error) {
            console.error(`SSE: 监听器错误 [${listenerId}]`, error)
          }
        })
      }
    } catch (error) {
      this.isConnecting = false
      this.setConnectionStatus('error')

      // 连接创建失败，尝试重连
      this.scheduleReconnect(this.reconnectAttempts + 1)
      console.error('SSE: 连接创建失败', error)
    }
  }

  private scheduleReconnect(attemptCount: number) {
    if (this.isDestroyed || this.isBackground || this.listeners.size === 0) {
      return
    }

    if (attemptCount > this.options.maxReconnectAttempts) {
      this.reconnectAttempts = this.options.maxReconnectAttempts
      this.setConnectionStatus('closed')
      return
    }

    this.clearReconnectTimer()
    this.reconnectAttempts = attemptCount

    // 失败越多等待越久，避免网络波动时短时间内打满连接。
    const reconnectDelay = Math.min(
      this.options.reconnectDelay * this.options.reconnectBackoffMultiplier ** Math.max(0, attemptCount - 1),
      this.options.maxReconnectDelay,
    )

    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null
      this.reconnectSSE(attemptCount)
    }, reconnectDelay)
  }

  private closeCurrentEventSource() {
    if (!this.eventSource) {
      return
    }

    this.eventSource.onopen = null
    this.eventSource.onerror = null
    this.eventSource.onmessage = null
    this.eventSource.close()
    this.eventSource = null
    this.isConnecting = false
  }

  private clearReconnectTimer() {
    if (!this.reconnectTimer) return

    clearTimeout(this.reconnectTimer)
    this.reconnectTimer = null
  }

  private clearBackgroundCloseTimer() {
    if (!this.backgroundCloseTimer) return

    clearTimeout(this.backgroundCloseTimer)
    this.backgroundCloseTimer = null
  }

  private setConnectionStatus(status: SSEConnectionStatus) {
    if (this.connectionStatus === status) return

    this.connectionStatus = status
    this.statusListeners.forEach((listener, listenerId) => {
      try {
        listener(status)
      } catch (error) {
        console.error(`SSE: 状态监听器错误 [${listenerId}]`, error)
      }
    })
  }

  /**
   * 添加消息监听器
   */
  addMessageListener(id: string, listener: SSEMessageListener) {
    if (this.isDestroyed) return

    this.listeners.set(id, listener)

    // 如果还没有连接且不在后台，现在建立连接
    if (
      !this.isBackground &&
      !this.isConnecting &&
      (!this.eventSource || this.eventSource.readyState === EventSource.CLOSED)
    ) {
      this.reconnectSSE(0)
    }
  }

  /**
   * 移除消息监听器
   */
  removeMessageListener(id: string) {
    if (this.isDestroyed) return

    this.listeners.delete(id)

    // 如果没有监听器了，关闭连接
    if (this.listeners.size === 0) {
      this.close()
    }
  }

  /**
   * 关闭连接
   */
  close() {
    this.resetConnectionState()
  }

  /**
   * 销毁管理器并清理所有引用
   */
  destroy() {
    if (this.isDestroyed) return

    this.isDestroyed = true
    this.resetConnectionState(true)
    this.removeVisibilityListener()
  }

  private resetConnectionState(clearListeners = false) {
    this.closeCurrentEventSource()
    this.clearReconnectTimer()
    this.clearBackgroundCloseTimer()

    if (clearListeners) {
      this.listeners.clear()
    }

    this.isConnecting = false
    this.reconnectAttempts = 0
    this.setConnectionStatus(this.listeners.size > 0 ? 'closed' : 'idle')

    if (clearListeners) {
      this.statusListeners.clear()
    }
  }

  /**
   * 添加连接状态监听器
   */
  addStatusListener(id: string, listener: SSEStatusListener, emitCurrent = true) {
    if (this.isDestroyed) return

    this.statusListeners.set(id, listener)

    if (emitCurrent) {
      listener(this.connectionStatus)
    }
  }

  /**
   * 移除连接状态监听器
   */
  removeStatusListener(id: string) {
    this.statusListeners.delete(id)
  }

  /**
   * 获取连接状态
   */
  get readyState(): number {
    return this.eventSource?.readyState ?? EventSource.CLOSED
  }

  /**
   * 获取内部连接状态
   */
  get status(): SSEConnectionStatus {
    return this.connectionStatus
  }

  /**
   * 获取连接URL
   */
  get connectionUrl(): string {
    return this.url
  }

  /**
   * 强制重新连接
   */
  forceReconnect() {
    if (this.isDestroyed) return

    const hasActiveListeners = this.listeners.size > 0
    this.close()
    if (!this.isBackground && hasActiveListeners) {
      this.reconnectSSE(0)
    }
  }

  /**
   * 检查是否有活跃的监听器
   */
  get hasActiveListeners(): boolean {
    return this.listeners.size > 0
  }

  /**
   * 获取当前重连次数
   */
  get currentReconnectAttempts(): number {
    return this.reconnectAttempts
  }

  /**
   * 检查是否达到最大重连次数
   */
  get hasReachedMaxAttempts(): boolean {
    return this.reconnectAttempts >= this.options.maxReconnectAttempts
  }
}

/**
 * SSE管理器单例
 */
class SSEManagerSingleton {
  private managers: Map<string, SSEManager> = new Map()

  private getIndependentManagerKey(url: string, listenerId: string): string {
    return `${url}::${listenerId}`
  }

  /**
   * 获取或创建SSE管理器
   * @param url SSE连接URL
   * @param options SSE选项
   * @returns SSE管理器实例
   */
  getManager(url: string, options?: ConstructorParameters<typeof SSEManager>[1]): SSEManager {
    // 使用完整的URL作为key，确保不同路径的SSE连接不会复用
    const managerKey = url
    if (!this.managers.has(managerKey)) {
      this.managers.set(managerKey, new SSEManager(url, options))
    }
    return this.managers.get(managerKey)!
  }

  /**
   * 获取或创建独立的SSE管理器（为每个监听器创建独立连接）
   * @param url SSE连接URL
   * @param listenerId 监听器ID
   * @param options SSE选项
   * @returns SSE管理器实例
   */
  getIndependentManager(
    url: string,
    listenerId: string,
    options?: ConstructorParameters<typeof SSEManager>[1],
  ): SSEManager {
    // 使用URL + 监听器ID作为key，确保每个监听器都有独立的连接
    const managerKey = `${url}::${listenerId}`
    if (!this.managers.has(managerKey)) {
      this.managers.set(managerKey, new SSEManager(url, options))
    }
    return this.managers.get(managerKey)!
  }

  /**
   * 关闭指定URL的管理器
   */
  closeManager(url: string) {
    const manager = this.managers.get(url)
    if (manager) {
      manager.destroy()
      this.managers.delete(url)
    }
  }

  /**
   * 关闭独立管理器
   */
  closeIndependentManager(url: string, listenerId: string) {
    const managerKey = this.getIndependentManagerKey(url, listenerId)
    const manager = this.managers.get(managerKey)
    if (manager) {
      manager.destroy()
      this.managers.delete(managerKey)
    }
  }

  /**
   * 关闭所有管理器
   */
  closeAllManagers() {
    this.managers.forEach(manager => manager.destroy())
    this.managers.clear()
  }
}

export const sseManagerSingleton = new SSEManagerSingleton()
