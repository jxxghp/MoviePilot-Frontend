import { shallowMount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AgentAssistantEntry from '@/components/agent/AgentAssistantEntry.vue'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))

describe('AgentAssistantEntry lifecycle motion', () => {
  let animationFrameCallbacks: Map<number, FrameRequestCallback>
  let nextAnimationFrameId: number

  beforeEach(() => {
    vi.useFakeTimers()
    animationFrameCallbacks = new Map()
    nextAnimationFrameId = 1
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn((callback: FrameRequestCallback) => {
        const id = nextAnimationFrameId++
        animationFrameCallbacks.set(id, callback)
        return id
      }),
    )
    vi.stubGlobal(
      'cancelAnimationFrame',
      vi.fn((id: number) => {
        animationFrameCallbacks.delete(id)
      }),
    )
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('cancels pointer frames and auto-dock timers when decorative motion stops', async () => {
    const wrapper = shallowMount(AgentAssistantEntry, {
      global: {
        stubs: {
          AgentPetStage: true,
          VIcon: true,
        },
      },
      props: {
        active: true,
        motionActive: true,
      },
    })
    await nextTick()

    const pointerEvent = new Event('pointermove')
    Object.assign(pointerEvent, { clientX: 480, clientY: 320 })
    const frameCountBeforePointer = animationFrameCallbacks.size
    window.dispatchEvent(pointerEvent)
    const pointerFrameId = nextAnimationFrameId - 1

    expect(animationFrameCallbacks.size).toBe(frameCountBeforePointer + 1)
    expect(vi.getTimerCount()).toBeGreaterThanOrEqual(2)

    await wrapper.setProps({ motionActive: false })
    await nextTick()

    expect(cancelAnimationFrame).toHaveBeenCalledWith(pointerFrameId)
    expect(animationFrameCallbacks.has(pointerFrameId)).toBe(false)
    expect(vi.getTimerCount()).toBe(0)

    wrapper.unmount()
  })

  it('updates an existing assistant preview without recreating its resize observer', async () => {
    const observe = vi.fn()
    const disconnect = vi.fn()
    const resizeObserverConstructor = vi.fn()
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor() {
          resizeObserverConstructor()
        }

        observe = observe
        disconnect = disconnect
      },
    )
    const wrapper = shallowMount(AgentAssistantEntry, {
      global: {
        stubs: {
          AgentPetStage: true,
          VIcon: true,
        },
      },
      props: {
        active: true,
        motionActive: true,
      },
    })

    wrapper.vm.showAssistantReplyPreview('第一段')
    await nextTick()
    expect(resizeObserverConstructor).toHaveBeenCalledTimes(1)

    wrapper.vm.showAssistantReplyPreview('第二段')
    await nextTick()
    expect(resizeObserverConstructor).toHaveBeenCalledTimes(1)
    expect(wrapper.find('.agent-assistant-fab__bubble').text()).toContain('第二段')

    wrapper.unmount()
  })
})
