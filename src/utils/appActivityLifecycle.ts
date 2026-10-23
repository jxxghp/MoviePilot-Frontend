/**
 * 应用活动状态：active 允许交互与装饰动效；idle 表示前台静置；passive 表示短时失焦；
 * suspended 表示隐藏或持续失焦，需要释放高成本渲染资源。
 */
export type AppActivityState = 'active' | 'idle' | 'passive' | 'suspended'

export const APP_ACTIVITY_IDLE_DELAY_MS = 3 * 60_000
export const APP_ACTIVITY_SUSPEND_DELAY_MS = 60_000

type AppActivityStateListener = (state: AppActivityState) => void

const activityEvents = ['keydown', 'pointerdown', 'pointermove', 'scroll', 'touchstart', 'wheel'] as const

/**
 * 统一管理页面活动状态，确保装饰动效、定时器和高成本渲染共享相同的前后台语义。
 */
export class AppActivityLifecycle {
  private state: AppActivityState = 'active'
  private listeners = new Set<AppActivityStateListener>()
  private idleTimer: number | null = null
  private suspendTimer: number | null = null
  private lastActivityAt = Date.now()
  private acquireCount = 0
  private started = false
  private hostLifecycle?: 'active' | 'inactive' | 'background'

  private readonly handleActivity = () => {
    if (this.hostLifecycle && this.hostLifecycle !== 'active') return
    if (document.visibilityState !== 'visible' || !document.hasFocus()) return

    this.lastActivityAt = Date.now()
    this.setState('active')
    this.scheduleIdle()
  }

  private readonly handleBlur = () => {
    if (this.hostLifecycle === 'background') return
    if (document.visibilityState === 'hidden') return

    this.clearIdleTimer()
    this.setState('passive')
    this.scheduleSuspend()
  }

  private readonly handleFocus = () => {
    if (this.hostLifecycle && this.hostLifecycle !== 'active') return
    if (document.visibilityState !== 'visible') return

    this.clearSuspendTimer()
    this.lastActivityAt = Date.now()
    this.setState('active')
    this.scheduleIdle()
  }

  private readonly handleVisibilityChange = () => {
    if (this.hostLifecycle === 'background') {
      this.clearTimers()
      this.setState('suspended')
      return
    }
    if (this.hostLifecycle === 'inactive') {
      this.clearTimers()
      this.setState('passive')
      return
    }
    if (document.visibilityState === 'hidden') {
      this.clearTimers()
      this.setState('suspended')
      return
    }

    if (document.hasFocus()) {
      this.handleFocus()
    } else {
      this.handleBlur()
    }
  }

  /** 获取当前生命周期状态。 */
  getState() {
    return this.state
  }

  /** 获取最近一次有效前台交互时间。 */
  getLastActivityAt() {
    return this.lastActivityAt
  }

  /** 订阅状态变化；订阅时立即回放当前状态。 */
  subscribe(listener: AppActivityStateListener) {
    this.listeners.add(listener)
    listener(this.state)

    return () => {
      this.listeners.delete(listener)
    }
  }

  /**
   * 获取生命周期使用权；首个消费者注册全局监听，最后一个消费者释放全部资源。
   */
  acquire() {
    this.acquireCount += 1
    if (!this.started) this.start()

    let released = false

    return () => {
      if (released) return

      released = true
      this.acquireCount = Math.max(0, this.acquireCount - 1)
      if (this.acquireCount === 0) this.stop()
    }
  }

  /** 供路由或测试路径显式登记一次有效前台活动。 */
  markActivity() {
    this.handleActivity()
  }

  /** 原生场景生命周期进入既有管理器；释放接管后恢复浏览器事件作为唯一来源。 */
  setHostLifecycle(state: 'active' | 'inactive' | 'background' | undefined) {
    this.hostLifecycle = state
    this.handleVisibilityChange()
  }

  /** 首个使用者安装共享 DOM 监听。 */
  private start() {
    if (this.started) return

    this.started = true
    activityEvents.forEach(event => document.addEventListener(event, this.handleActivity, { passive: true }))
    document.addEventListener('visibilitychange', this.handleVisibilityChange)
    window.addEventListener('blur', this.handleBlur)
    window.addEventListener('focus', this.handleFocus)

    this.handleVisibilityChange()
  }

  /** 最后使用者解绑监听并取消所有计时器。 */
  private stop() {
    if (!this.started) return

    this.clearTimers()
    activityEvents.forEach(event => document.removeEventListener(event, this.handleActivity))
    document.removeEventListener('visibilitychange', this.handleVisibilityChange)
    window.removeEventListener('blur', this.handleBlur)
    window.removeEventListener('focus', this.handleFocus)
    this.started = false
  }

  /** 状态实际变化时才通知所有消费者。 */
  private setState(state: AppActivityState) {
    if (this.state === state) return

    this.state = state
    this.listeners.forEach(listener => listener(state))
  }

  /** 复用最近活动时间安排前台空闲检查。 */
  private scheduleIdle() {
    if (this.idleTimer !== null) return

    const elapsed = Date.now() - this.lastActivityAt
    const delay = Math.max(0, APP_ACTIVITY_IDLE_DELAY_MS - elapsed)

    this.idleTimer = window.setTimeout(() => {
      this.idleTimer = null
      if (document.visibilityState !== 'visible' || !document.hasFocus()) return

      const remaining = APP_ACTIVITY_IDLE_DELAY_MS - (Date.now() - this.lastActivityAt)
      if (remaining > 0) {
        this.scheduleIdle()
        return
      }

      this.setState('idle')
    }, delay)
  }

  /** 持续失焦后暂停昂贵渲染。 */
  private scheduleSuspend() {
    this.clearSuspendTimer()
    this.suspendTimer = window.setTimeout(() => {
      this.suspendTimer = null
      if (document.visibilityState === 'visible' && !document.hasFocus()) this.setState('suspended')
    }, APP_ACTIVITY_SUSPEND_DELAY_MS)
  }

  /** 取消前台空闲检查并释放计时器引用。 */
  private clearIdleTimer() {
    if (this.idleTimer === null) return

    window.clearTimeout(this.idleTimer)
    this.idleTimer = null
  }

  /** 取消延迟暂停检查并释放计时器引用。 */
  private clearSuspendTimer() {
    if (this.suspendTimer === null) return

    window.clearTimeout(this.suspendTimer)
    this.suspendTimer = null
  }

  /** 在隐藏、卸载与系统生命周期切换时统一取消检查。 */
  private clearTimers() {
    this.clearIdleTimer()
    this.clearSuspendTimer()
  }
}

export const appActivityLifecycle = new AppActivityLifecycle()
