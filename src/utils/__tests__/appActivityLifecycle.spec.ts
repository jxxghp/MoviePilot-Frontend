import {
  APP_ACTIVITY_IDLE_DELAY_MS,
  APP_ACTIVITY_SUSPEND_DELAY_MS,
  AppActivityLifecycle,
  type AppActivityState,
} from '@/utils/appActivityLifecycle'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('AppActivityLifecycle', () => {
  let lifecycle: AppActivityLifecycle
  let release: (() => void) | null
  let states: AppActivityState[]
  let focused: boolean
  let visibility: DocumentVisibilityState

  beforeEach(() => {
    vi.useFakeTimers()
    focused = true
    visibility = 'visible'
    vi.spyOn(document, 'hasFocus').mockImplementation(() => focused)
    vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility)
    lifecycle = new AppActivityLifecycle()
    states = []
    lifecycle.subscribe(state => states.push(state))
    release = lifecycle.acquire()
  })

  afterEach(() => {
    release?.()
    release = null
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('enters idle after focused inactivity and wakes on interaction', () => {
    vi.advanceTimersByTime(APP_ACTIVITY_IDLE_DELAY_MS)

    expect(lifecycle.getState()).toBe('idle')

    document.dispatchEvent(new Event('pointerdown'))

    expect(lifecycle.getState()).toBe('active')
    expect(states).toContain('idle')
  })

  it('keeps the idle deadline relative to the latest high-frequency activity', () => {
    vi.advanceTimersByTime(APP_ACTIVITY_IDLE_DELAY_MS - 1_000)
    document.dispatchEvent(new Event('pointermove'))
    vi.advanceTimersByTime(1_000)

    expect(lifecycle.getState()).toBe('active')

    vi.advanceTimersByTime(APP_ACTIVITY_IDLE_DELAY_MS - 1_000)

    expect(lifecycle.getState()).toBe('idle')
  })

  it('moves through passive and suspended while the visible window is unfocused', () => {
    focused = false
    window.dispatchEvent(new Event('blur'))

    expect(lifecycle.getState()).toBe('passive')

    vi.advanceTimersByTime(APP_ACTIVITY_SUSPEND_DELAY_MS)

    expect(lifecycle.getState()).toBe('suspended')

    focused = true
    window.dispatchEvent(new Event('focus'))

    expect(lifecycle.getState()).toBe('active')
  })

  it('suspends immediately while hidden and restores according to focus', () => {
    visibility = 'hidden'
    document.dispatchEvent(new Event('visibilitychange'))

    expect(lifecycle.getState()).toBe('suspended')

    visibility = 'visible'
    focused = false
    document.dispatchEvent(new Event('visibilitychange'))

    expect(lifecycle.getState()).toBe('passive')
  })

  it('removes global listeners after the final consumer releases', () => {
    const removeDocumentListener = vi.spyOn(document, 'removeEventListener')
    const removeWindowListener = vi.spyOn(window, 'removeEventListener')

    release?.()
    release = null

    expect(removeDocumentListener).toHaveBeenCalledWith('visibilitychange', expect.any(Function))
    expect(removeWindowListener).toHaveBeenCalledWith('blur', expect.any(Function))
    expect(removeWindowListener).toHaveBeenCalledWith('focus', expect.any(Function))
  })
})
