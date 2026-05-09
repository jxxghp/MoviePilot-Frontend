/**
 * SSE连接管理器
 * 优化后台SSE连接，减少iOS系统杀掉应用的概率
 */
export class SSEManager {
  private eventSource: EventSource | null = null
  private url: string
  private isBackground = false
  private reconnectTimer: number | null = null
  private backgroundCloseTimer: number | null = null
  private listeners: Map<string, (event: MessageEvent) => void> = new Map()
  private options: {
    backgroundCloseDelay: number
    reconnectDelay: number
    maxReconnectAttempts: number
  }
  private reconnectAttempts = 0
  private isConnecting = false
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

  constructor(url: string, options: Partial<typeof SSEManager.prototype.options> = {}) {
    this.url = url
    this.options = {
      backgroundCloseDelay: 5000, // 5秒后关闭后台连接
      reconnectDelay: 3000, // 3秒后重连
      maxReconnectAttempts: 3,
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
    this.isBackground = true

    // 延迟关闭SSE连接，避免频繁切换
    if (this.backgroundCloseTimer) {
      clearTimeout(this.backgroundCloseTimer)
    }

    this.backgroundCloseTimer = window.setTimeout(() => {
      if (this.isBackground && this.eventSource) {
        this.eventSource.close()
        this.eventSource = null
      }
    }, this.options.backgroundCloseDelay)
  }

  private handleForeground() {
    this.isBackground = false

    // 清除后台关闭定时器
    if (this.backgroundCloseTimer) {
      clearTimeout(this.backgroundCloseTimer)
      this.backgroundCloseTimer = null
    }

    // 只有在有活跃监听器时才重新建立连接
    if (this.listeners.size > 0 && (!this.eventSource || this.eventSource.readyState === EventSource.CLOSED)) {
      this.reconnectSSE()
    }
  }

  private reconnectSSE(attemptCount = 0) {
    if (attemptCount >= this.options.maxReconnectAttempts) {
      return
    }

    if (this.isConnecting) {
      return
    }

    // 如果没有活跃的监听器，不进行重连
    if (this.listeners.size === 0) {
      return
    }

    this.isConnecting = true
    this.reconnectAttempts = attemptCount

    try {
      this.eventSource = new EventSource(this.url)

      this.eventSource.onopen = () => {
        this.isConnecting = false
        this.reconnectAttempts = 0
      }

      this.eventSource.onerror = error => {
        this.isConnecting = false

        if (this.eventSource?.readyState === EventSource.CLOSED) {
          // 连接已关闭，尝试重连
          if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer)
          }

          this.reconnectTimer = window.setTimeout(() => {
            if (!this.isBackground && this.listeners.size > 0) {
              this.reconnectSSE(this.reconnectAttempts + 1)
            }
          }, this.options.reconnectDelay)
        }
      }

      this.eventSource.onmessage = event => {
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

      // 连接创建失败，尝试重连
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer)
      }

      this.reconnectTimer = window.setTimeout(() => {
        if (!this.isBackground && this.listeners.size > 0) {
          this.reconnectSSE(this.reconnectAttempts + 1)
        }
      }, this.options.reconnectDelay)
    }
  }

  /**
   * 添加消息监听器
   */
  addMessageListener(id: string, listener: (event: MessageEvent) => void) {
    this.listeners.set(id, listener)

    // 如果还没有连接且不在后台，现在建立连接
    if (!this.eventSource && !this.isBackground && !this.isConnecting) {
      this.reconnectSSE()
    }
  }

  /**
   * 移除消息监听器
   */
  removeMessageListener(id: string) {
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
    this.resetConnectionState(true)
    this.removeVisibilityListener()
  }

  private resetConnectionState(clearListeners = false) {
    if (this.eventSource) {
      this.eventSource.close()
      this.eventSource = null
    }

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }

    if (this.backgroundCloseTimer) {
      clearTimeout(this.backgroundCloseTimer)
      this.backgroundCloseTimer = null
    }

    if (clearListeners) {
      this.listeners.clear()
    }

    this.isConnecting = false
    this.reconnectAttempts = 0
  }

  /**
   * 获取连接状态
   */
  get readyState(): number {
    return this.eventSource?.readyState ?? EventSource.CLOSED
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
    const hasActiveListeners = this.listeners.size > 0
    this.close()
    if (!this.isBackground && hasActiveListeners) {
      this.reconnectSSE()
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
