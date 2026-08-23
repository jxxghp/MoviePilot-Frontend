import {
  addBackgroundTimer,
  BackgroundManager,
  getBackgroundTimerStatus,
  removeBackgroundTimer,
} from '@/utils/backgroundManager'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type ActivityState = 'active' | 'idle' | 'passive' | 'suspended'
type ActivityStateListener = (state: ActivityState) => void

const lifecycleMocks = vi.hoisted(() => {
  let state: ActivityState = 'active'
  let lastActivityAt = 0
  const listeners = new Set<ActivityStateListener>()
  const releaseFns: Array<ReturnType<typeof vi.fn>> = []
  const stopFns: Array<ReturnType<typeof vi.fn>> = []

  const acquire = vi.fn(() => {
    const release = vi.fn()
    releaseFns.push(release)
    return release
  })
  const subscribe = vi.fn((listener: ActivityStateListener) => {
    listeners.add(listener)
    listener(state)

    const stop = vi.fn(() => {
      listeners.delete(listener)
    })
    stopFns.push(stop)
    return stop
  })
  const getLastActivityAt = vi.fn(() => lastActivityAt)

  return {
    appActivityLifecycle: {
      acquire,
      subscribe,
      getLastActivityAt,
    },
    acquire,
    subscribe,
    getLastActivityAt,
    releaseFns,
    stopFns,
    triggerState(nextState: ActivityState) {
      state = nextState
      Array.from(listeners).forEach(listener => listener(nextState))
    },
    setLastActivityAt(value: number) {
      lastActivityAt = value
    },
    reset() {
      state = 'active'
      lastActivityAt = Date.now()
      listeners.clear()
      releaseFns.length = 0
      stopFns.length = 0
      acquire.mockClear()
      subscribe.mockClear()
      getLastActivityAt.mockClear()
    },
  }
})

vi.mock('@/utils/appActivityLifecycle', () => ({
  appActivityLifecycle: lifecycleMocks.appActivityLifecycle,
}))

describe('BackgroundManager', () => {
  let manager: BackgroundManager

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-23T12:00:00.000Z'))
    lifecycleMocks.reset()
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    manager = new BackgroundManager()
  })

  afterEach(() => {
    manager.destroy()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('replaces a timer by id without allowing the old callback to run', () => {
    const oldCallback = vi.fn()
    const newCallback = vi.fn()

    manager.addTimer('refresh', oldCallback, 100, { skipInitialRun: true })
    manager.addTimer('refresh', newCallback, 100, { skipInitialRun: true })

    vi.advanceTimersByTime(100)

    expect(oldCallback).not.toHaveBeenCalled()
    expect(newCallback).toHaveBeenCalledOnce()
    expect(manager.getTimersInfo()).toEqual([
      {
        id: 'refresh',
        interval: 100,
        status: 'running',
        runInBackground: false,
      },
    ])
  })

  it('keeps lifecycle ownership when the only timer is replaced', () => {
    manager.addTimer('refresh', vi.fn(), 100, { skipInitialRun: true })
    manager.addTimer('refresh', vi.fn(), 100, { skipInitialRun: true })

    lifecycleMocks.triggerState('suspended')

    expect(manager.getTimerStatus('refresh')).toBe('paused')

    lifecycleMocks.triggerState('active')

    expect(manager.getTimerStatus('refresh')).toBe('running')
  })

  it('keeps a replacement foreground timer paused while already suspended', () => {
    const oldCallback = vi.fn()
    const newCallback = vi.fn()
    manager.addTimer('refresh', oldCallback, 100, { skipInitialRun: true })
    lifecycleMocks.triggerState('suspended')

    manager.addTimer('refresh', newCallback, 100, { skipInitialRun: true })

    expect(manager.getTimerStatus('refresh')).toBe('paused')
    vi.advanceTimersByTime(300)
    expect(oldCallback).not.toHaveBeenCalled()
    expect(newCallback).not.toHaveBeenCalled()

    lifecycleMocks.triggerState('active')
    vi.advanceTimersByTime(100)

    expect(manager.getTimerStatus('refresh')).toBe('running')
    expect(newCallback).toHaveBeenCalledOnce()
  })

  it('runs immediately by default and honors skipInitialRun', () => {
    const immediateCallback = vi.fn()
    const delayedCallback = vi.fn()

    manager.addTimer('immediate', immediateCallback, 100)
    manager.addTimer('delayed', delayedCallback, 100, { skipInitialRun: true })

    expect(immediateCallback).toHaveBeenCalledOnce()
    expect(delayedCallback).not.toHaveBeenCalled()

    vi.advanceTimersByTime(100)

    expect(immediateCallback).toHaveBeenCalledTimes(2)
    expect(delayedCallback).toHaveBeenCalledOnce()
  })

  it('isolates synchronous callback failures from timer execution', () => {
    const error = new Error('refresh failed')
    const failingCallback = vi.fn(() => {
      throw error
    })
    const healthyCallback = vi.fn()

    manager.addTimer('failing', failingCallback, 100, { skipInitialRun: true })
    manager.addTimer('healthy', healthyCallback, 100, { skipInitialRun: true })

    expect(() => vi.advanceTimersByTime(200)).not.toThrow()

    expect(failingCallback).toHaveBeenCalledTimes(2)
    expect(healthyCallback).toHaveBeenCalledTimes(2)
    expect(console.error).toHaveBeenCalledWith('Background: 定时器 failing 执行错误:', error)
  })

  it('pauses foreground timers while suspended and keeps background timers running', () => {
    const foregroundCallback = vi.fn()
    const backgroundCallback = vi.fn()

    manager.addTimer('foreground', foregroundCallback, 100, { skipInitialRun: true })
    manager.addTimer('background', backgroundCallback, 100, {
      runInBackground: true,
      skipInitialRun: true,
    })

    vi.advanceTimersByTime(100)
    lifecycleMocks.triggerState('suspended')

    expect(manager.getTimerStatus('foreground')).toBe('paused')
    expect(manager.getTimerStatus('background')).toBe('running')

    vi.advanceTimersByTime(300)

    expect(foregroundCallback).toHaveBeenCalledOnce()
    expect(backgroundCallback).toHaveBeenCalledTimes(4)

    lifecycleMocks.triggerState('active')
    vi.advanceTimersByTime(100)

    expect(manager.getTimerStatus('foreground')).toBe('running')
    expect(foregroundCallback).toHaveBeenCalledTimes(2)
  })

  it('releases lifecycle resources after removing the final timer', () => {
    const addEventListener = vi.spyOn(window, 'addEventListener')
    const removeEventListener = vi.spyOn(window, 'removeEventListener')

    manager.addTimer('first', vi.fn(), 100, { skipInitialRun: true })
    manager.addTimer('second', vi.fn(), 100, { skipInitialRun: true })

    expect(lifecycleMocks.acquire).toHaveBeenCalledOnce()
    expect(lifecycleMocks.subscribe).toHaveBeenCalledOnce()
    expect(addEventListener).toHaveBeenCalledWith('beforeunload', expect.any(Function))

    manager.removeTimer('first')

    expect(lifecycleMocks.releaseFns[0]).not.toHaveBeenCalled()
    expect(lifecycleMocks.stopFns[0]).not.toHaveBeenCalled()

    manager.removeTimer('second')

    expect(lifecycleMocks.releaseFns[0]).toHaveBeenCalledOnce()
    expect(lifecycleMocks.stopFns[0]).toHaveBeenCalledOnce()
    expect(removeEventListener).toHaveBeenCalledWith('beforeunload', expect.any(Function))
    expect(manager.getTimersInfo()).toEqual([])
  })

  it('reports activity time, timer status and active state', () => {
    const lastActivityAt = Date.now() - 1_000
    lifecycleMocks.setLastActivityAt(lastActivityAt)
    manager.addTimer('refresh', vi.fn(), 100, { skipInitialRun: true })

    expect(manager.getLastActivityTime()).toBe(lastActivityAt)
    expect(manager.isUserActive(2_000)).toBe(true)
    expect(manager.isUserActive(500)).toBe(false)
    expect(manager.getTimerStatus('refresh')).toBe('running')
    expect(manager.getStatus()).toEqual({
      isBackground: false,
      isDestroyed: false,
      timerCount: 1,
      lastActivityTime: lastActivityAt,
      isUserActive: true,
    })
  })

  it('destroys timers and lifecycle resources, then rejects new timers', () => {
    const callback = vi.fn()
    const removeEventListener = vi.spyOn(window, 'removeEventListener')

    manager.addTimer('refresh', callback, 100, { skipInitialRun: true })
    manager.destroy()
    vi.advanceTimersByTime(300)

    expect(callback).not.toHaveBeenCalled()
    expect(manager.getStatus()).toMatchObject({
      isBackground: false,
      isDestroyed: true,
      timerCount: 0,
    })
    expect(manager.getTimerStatus('refresh')).toBe('not-found')
    expect(lifecycleMocks.releaseFns[0]).toHaveBeenCalledOnce()
    expect(lifecycleMocks.stopFns[0]).toHaveBeenCalledOnce()
    expect(removeEventListener).toHaveBeenCalledWith('beforeunload', expect.any(Function))

    const newCallback = vi.fn()
    manager.addTimer('new', newCallback, 100)
    vi.advanceTimersByTime(100)

    expect(newCallback).not.toHaveBeenCalled()
    expect(manager.getTimerStatus('new')).toBe('not-found')
    expect(lifecycleMocks.acquire).toHaveBeenCalledOnce()
  })

  it('exposes the global timer helpers through the public API', () => {
    const callback = vi.fn()

    addBackgroundTimer('global-refresh', callback, 100, { skipInitialRun: true })

    expect(getBackgroundTimerStatus('global-refresh')).toBe('running')

    removeBackgroundTimer('global-refresh')

    expect(getBackgroundTimerStatus('global-refresh')).toBe('not-found')
  })
})
