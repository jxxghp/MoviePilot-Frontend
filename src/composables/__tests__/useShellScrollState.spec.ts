import { useShellScrollState } from '@/composables/useShellScrollState'
import { mount } from '@vue/test-utils'
import { defineComponent, nextTick, ref, type Ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

interface Harness {
  locked: Ref<boolean>
}

describe('useShellScrollState', () => {
  let currentScrollY = 0
  let frameSequence = 0
  let frameCallbacks: Map<number, FrameRequestCallback>

  const flushAnimationFrame = () => {
    const pendingFrames = [...frameCallbacks.entries()]
    frameCallbacks.clear()
    pendingFrames.forEach(([id, callback]) => callback(id))
  }

  const setScrollY = (value: number) => {
    currentScrollY = value
    window.dispatchEvent(new Event('scroll'))
  }

  const renderComposable = ({ locked = false } = {}) => {
    const harness: Harness = {
      locked: ref(locked),
    }
    const component = defineComponent({
      setup() {
        return {
          ...useShellScrollState({
            scrollLocked: harness.locked,
          }),
        }
      },
      template: '<div />',
    })

    return { harness, wrapper: mount(component) }
  }

  beforeEach(() => {
    currentScrollY = 0
    frameSequence = 0
    frameCallbacks = new Map()

    vi.spyOn(window, 'scrollY', 'get').mockImplementation(() => currentScrollY)
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
      const id = ++frameSequence
      frameCallbacks.set(id, callback)
      return id
    })
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(id => {
      frameCallbacks.delete(id)
    })
  })

  it('coalesces passive scroll events and applies compact hysteresis', () => {
    const addEventListener = vi.spyOn(window, 'addEventListener')
    const { wrapper } = renderComposable()

    expect(addEventListener).toHaveBeenCalledWith('scroll', expect.any(Function), { passive: true })
    expect(wrapper.vm.state).toBe('expanded')

    setScrollY(40)
    setScrollY(64)
    expect(frameCallbacks).toHaveLength(1)
    expect(wrapper.vm.state).toBe('expanded')
    flushAnimationFrame()
    expect(wrapper.vm.state).toBe('expanded')

    setScrollY(65)
    flushAnimationFrame()
    expect(wrapper.vm.state).toBe('compact')

    setScrollY(24)
    flushAnimationFrame()
    expect(wrapper.vm.state).toBe('revealed')

    setScrollY(23)
    flushAnimationFrame()
    expect(wrapper.vm.state).toBe('expanded')
  })

  it('reveals the away-from-top navbar on reverse scrolling without treating it as the top state', () => {
    const { wrapper } = renderComposable()

    setScrollY(120)
    flushAnimationFrame()
    expect(wrapper.vm.state).toBe('compact')

    setScrollY(90)
    flushAnimationFrame()
    expect(wrapper.vm.state).toBe('revealed')

    setScrollY(100)
    flushAnimationFrame()
    expect(wrapper.vm.state).toBe('compact')

    setScrollY(20)
    flushAnimationFrame()
    expect(wrapper.vm.state).toBe('expanded')
  })

  it('filters small reversals and clamps overscroll before deriving direction', () => {
    const { wrapper } = renderComposable()

    setScrollY(80)
    flushAnimationFrame()
    expect(wrapper.vm.direction).toBe('down')

    setScrollY(78)
    flushAnimationFrame()
    expect(wrapper.vm.direction).toBe('down')

    setScrollY(-20)
    flushAnimationFrame()
    expect(wrapper.vm.scrollY).toBe(0)
    expect(wrapper.vm.direction).toBe('up')
    expect(wrapper.vm.state).toBe('expanded')
  })

  it('accumulates slow frame-by-frame motion before changing direction', () => {
    const { wrapper } = renderComposable()

    for (let y = 2; y <= 166; y += 2) {
      setScrollY(y)
      flushAnimationFrame()
    }

    expect(wrapper.vm.direction).toBe('down')
    expect(wrapper.vm.state).toBe('compact')

    setScrollY(164)
    flushAnimationFrame()
    expect(wrapper.vm.direction).toBe('down')

    setScrollY(162)
    flushAnimationFrame()
    expect(wrapper.vm.direction).toBe('up')
    expect(wrapper.vm.state).toBe('revealed')
  })

  it('freezes while scroll is locked and cleans up its frame and listeners', async () => {
    const addEventListener = vi.spyOn(window, 'addEventListener')
    const removeEventListener = vi.spyOn(window, 'removeEventListener')
    const { harness, wrapper } = renderComposable()
    const scrollHandler = addEventListener.mock.calls.find(
      ([event]) => String(event) === 'scroll',
    )?.[1] as EventListener
    flushAnimationFrame()

    harness.locked.value = true
    await nextTick()
    frameCallbacks.clear()
    currentScrollY = 180
    scrollHandler(new Event('scroll'))
    expect(frameCallbacks).toHaveLength(0)
    expect(wrapper.vm.state).toBe('expanded')

    harness.locked.value = false
    await nextTick()
    frameCallbacks.clear()
    currentScrollY = 200
    scrollHandler(new Event('scroll'))
    expect(frameCallbacks).toHaveLength(1)

    wrapper.unmount()
    expect(frameCallbacks).toHaveLength(0)
    expect(removeEventListener).toHaveBeenCalledWith('scroll', expect.any(Function))
  })
})
