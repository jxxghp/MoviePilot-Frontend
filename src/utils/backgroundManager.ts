/**
 * 后台管理器
 * 统一管理定时器和后台活动，减少iOS系统杀掉应用的概率
 */
export class BackgroundManager {
  private timers: Map<string, {
    callback: () => void
    interval: number
    timer: ReturnType<typeof setInterval> | null
    pausedAt?: number
    runInBackground?: boolean
  }> = new Map()
  
  private readonly activityEvents = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click']
  private readonly handleVisibilityChange = () => {
    const wasBackground = this.isBackground
    this.isBackground = document.hidden

    if (this.isBackground && !wasBackground) {
      console.log('Background: 进入后台，暂停定时器')
      this.pauseAllTimers()
    } else if (!this.isBackground && wasBackground) {
      console.log('Background: 回到前台，恢复定时器')
      this.resumeAllTimers()
    }
  }
  private readonly handleBeforeUnload = () => {
    this.destroy()
  }
  private readonly updateActivity = () => {
    this.lastActivityTime = Date.now()
  }

  private isBackground = false
  private isDestroyed = false
  private lastActivityTime = Date.now()
  private isInitialized = false

  private ensureInitialized() {
    if (this.isInitialized || this.isDestroyed) return

    this.isInitialized = true
    this.isBackground = document.hidden
    this.setupVisibilityListener()
    this.setupActivityTracking()
  }

  private setupVisibilityListener() {
    document.addEventListener('visibilitychange', this.handleVisibilityChange)
    window.addEventListener('beforeunload', this.handleBeforeUnload)
  }

  private setupActivityTracking() {
    // 按需跟踪用户活动，避免应用启动时就注册一批全局监听。
    this.activityEvents.forEach(event => {
      document.addEventListener(event, this.updateActivity, { passive: true })
    })
  }

  private removeLifecycleListeners() {
    if (!this.isInitialized) return

    document.removeEventListener('visibilitychange', this.handleVisibilityChange)
    window.removeEventListener('beforeunload', this.handleBeforeUnload)
    this.activityEvents.forEach(event => {
      document.removeEventListener(event, this.updateActivity)
    })
    this.isInitialized = false
  }

  /**
   * 添加定时器
   */
  addTimer(
    id: string, 
    callback: () => void, 
    interval: number, 
    options: {
      runInBackground?: boolean
      skipInitialRun?: boolean
    } = {}
  ) {
    const { runInBackground = false, skipInitialRun = false } = options

    if (this.isDestroyed) return
    this.ensureInitialized()
    
    this.removeTimer(id)
    
    const timerConfig = {
      callback,
      interval,
      timer: null as ReturnType<typeof setInterval> | null,
      runInBackground
    }

    // 创建定时器
    const wrappedCallback = () => {
      if (this.isDestroyed) return
      
      // 只有在前台运行，或者明确允许后台运行时才执行
      if (!this.isBackground || runInBackground) {
        try {
          callback()
        } catch (error) {
          console.error(`Background: 定时器 ${id} 执行错误:`, error)
        }
      }
    }

    timerConfig.timer = setInterval(wrappedCallback, interval)
    this.timers.set(id, timerConfig)

    // 如果不跳过初始运行，立即执行一次
    if (!skipInitialRun) {
      wrappedCallback()
    }

    console.log(`Background: 添加定时器 ${id}, 间隔 ${interval}ms`)
  }

  /**
   * 移除定时器
   */
  removeTimer(id: string) {
    const timerConfig = this.timers.get(id)
    if (timerConfig) {
      if (timerConfig.timer) {
        clearInterval(timerConfig.timer)
      }
      this.timers.delete(id)
      console.log(`Background: 移除定时器 ${id}`)

      // 没有任务时释放监听，首屏只导入模块不会产生常驻开销。
      if (this.timers.size === 0) {
        this.removeLifecycleListeners()
      }
    }
  }

  /**
   * 暂停所有定时器
   */
  private pauseAllTimers() {
    this.timers.forEach((timerConfig, id) => {
      if (timerConfig.timer && !timerConfig.runInBackground) {
        clearInterval(timerConfig.timer)
        timerConfig.timer = null
        timerConfig.pausedAt = Date.now()
      }
    })
  }

  /**
   * 恢复所有定时器
   */
  private resumeAllTimers() {
    this.timers.forEach((timerConfig, id) => {
      if (!timerConfig.timer) {
        const wrappedCallback = () => {
          if (this.isDestroyed) return
          
          if (!this.isBackground || timerConfig.runInBackground) {
            try {
              timerConfig.callback()
            } catch (error) {
              console.error(`Background: 定时器 ${id} 执行错误:`, error)
            }
          }
        }

        timerConfig.timer = setInterval(wrappedCallback, timerConfig.interval)
        delete timerConfig.pausedAt
      }
    })
  }

  /**
   * 获取定时器状态
   */
  getTimerStatus(id: string): 'running' | 'paused' | 'not-found' {
    const timerConfig = this.timers.get(id)
    if (!timerConfig) return 'not-found'
    return timerConfig.timer ? 'running' : 'paused'
  }

  /**
   * 获取所有定时器信息
   */
  getTimersInfo(): Array<{
    id: string
    interval: number
    status: 'running' | 'paused'
    runInBackground: boolean
    pausedAt?: number
  }> {
    return Array.from(this.timers.entries()).map(([id, config]) => ({
      id,
      interval: config.interval,
      status: config.timer ? 'running' : 'paused',
      runInBackground: config.runInBackground || false,
      pausedAt: config.pausedAt
    }))
  }

  /**
   * 检查用户是否活跃
   */
  isUserActive(maxInactiveTime = 5 * 60 * 1000): boolean {
    return Date.now() - this.lastActivityTime < maxInactiveTime
  }

  /**
   * 获取最后活动时间
   */
  getLastActivityTime(): number {
    return this.lastActivityTime
  }

  /**
   * 获取当前状态
   */
  getStatus(): {
    isBackground: boolean
    isDestroyed: boolean
    timerCount: number
    lastActivityTime: number
    isUserActive: boolean
  } {
    return {
      isBackground: this.isBackground,
      isDestroyed: this.isDestroyed,
      timerCount: this.timers.size,
      lastActivityTime: this.lastActivityTime,
      isUserActive: this.isUserActive()
    }
  }

  /**
   * 销毁管理器
   */
  destroy() {
    this.isDestroyed = true
    
    // 清理所有定时器
    this.timers.forEach((timerConfig, id) => {
      if (timerConfig.timer) {
        clearInterval(timerConfig.timer)
      }
    })
    this.timers.clear()

    // 清理按需注册的生命周期与活动监听
    this.removeLifecycleListeners()

    console.log('Background: 管理器已销毁')
  }
}

/**
 * 全局后台管理器实例
 */
export const backgroundManager = new BackgroundManager()

/**
 * 便捷的定时器管理函数
 */
export function addBackgroundTimer(
  id: string, 
  callback: () => void, 
  interval: number, 
  options?: {
    runInBackground?: boolean
    skipInitialRun?: boolean
  }
) {
  backgroundManager.addTimer(id, callback, interval, options)
}

export function removeBackgroundTimer(id: string) {
  backgroundManager.removeTimer(id)
}

export function getBackgroundTimerStatus(id: string) {
  return backgroundManager.getTimerStatus(id)
}
