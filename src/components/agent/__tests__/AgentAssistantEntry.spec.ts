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

describe('AgentAssistantEntry pet interactions', () => {
  const entries: ReturnType<typeof shallowMount<typeof AgentAssistantEntry>>[] = []

  /** 使用真实入口事件与状态机，只隔离渲染器和图标。 */
  function createEntry() {
    const wrapper = shallowMount(AgentAssistantEntry, {
      global: { stubs: { AgentPetStage: true, VIcon: true } },
      props: { active: true, motionActive: true },
    })
    entries.push(wrapper)
    return wrapper
  }

  /** 发送带捕获标识的真实入口指针事件，覆盖鼠标和触摸的共享路径。 */
  async function pointer(
    wrapper: ReturnType<typeof createEntry>,
    type: string,
    x = 300,
    pointerType = 'mouse',
    pointerId = 1,
  ) {
    await wrapper.find('.agent-assistant-fab__trigger').trigger(type, {
      button: 0,
      buttons: type === 'pointerup' ? 0 : 1,
      pointerId,
      pointerType,
      isPrimary: true,
      clientX: x,
      clientY: 300,
    })
  }

  /** 从入口传给实际渲染器的动作读取结果，避免只验证 mock 被调用。 */
  function action(wrapper: ReturnType<typeof createEntry>) {
    return wrapper.findComponent({ name: 'AgentPetStage' }).props('action')
  }

  /** 用原生鼠标事件保留 detail，验证手势后的浏览器合成点击会被拦截。 */
  async function click(wrapper: ReturnType<typeof createEntry>) {
    wrapper
      .find('.agent-assistant-fab__trigger')
      .element.dispatchEvent(new MouseEvent('click', { detail: 1, bubbles: true }))
    await nextTick()
  }

  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    entries.splice(0).forEach(wrapper => wrapper.unmount())
    vi.useRealTimers()
  })

  it('keeps a normal click immediate but turns a held touch into charge and spin without opening chat', async () => {
    const wrapper = createEntry()
    await nextTick()
    await pointer(wrapper, 'pointerdown', 300, 'touch')
    await vi.advanceTimersByTimeAsync(700)
    expect(action(wrapper)).toBe('charge')
    await pointer(wrapper, 'pointerup', 300, 'touch')
    expect(action(wrapper)).toBe('spin-cheer')
    await click(wrapper)
    expect(wrapper.emitted('open')).toBeUndefined()
    await vi.advanceTimersByTimeAsync(500)
    await pointer(wrapper, 'pointerdown')
    await pointer(wrapper, 'pointerup')
    await click(wrapper)
    expect(wrapper.emitted('open')).toHaveLength(1)
  })

  it.each([
    [4, 'faint'],
    [7, 'disassemble'],
  ] as const)('reacts to %i deliberate drag reversals with %s', async (moves, expected) => {
    const wrapper = createEntry()
    await nextTick()
    await pointer(wrapper, 'pointerdown')
    for (let i = 0; i < moves; i += 1) {
      await pointer(wrapper, 'pointermove', i % 2 === 0 ? 340 : 260)
      await vi.advanceTimersByTimeAsync(60)
    }
    await pointer(wrapper, 'pointerup', 300)
    expect(action(wrapper)).toBe(expected)
    await click(wrapper)
    expect(wrapper.emitted('open')).toBeUndefined()
  })

  it('does not confuse a slow move, cancelled gesture or unrelated pointer with deliberate shaking', async () => {
    const wrapper = createEntry()
    await nextTick()
    await pointer(wrapper, 'pointerdown')
    for (let i = 0; i < 4; i += 1) {
      await pointer(wrapper, 'pointermove', i % 2 === 0 ? 340 : 260)
      await vi.advanceTimersByTimeAsync(600)
    }
    await pointer(wrapper, 'pointerup')
    expect(action(wrapper)).toBe('nod')
    await pointer(wrapper, 'pointerdown')
    await pointer(wrapper, 'pointerup', 300, 'touch', 2)
    await vi.advanceTimersByTimeAsync(700)
    expect(action(wrapper)).toBe('charge')
    await pointer(wrapper, 'pointercancel')
    await vi.advanceTimersByTimeAsync(1000)
    expect(action(wrapper)).toBeNull()
  })

  it('responds to stroking and repeated teasing, with no click required', async () => {
    const wrapper = createEntry()
    await nextTick()
    for (const x of [300, 320, 300, 320, 300]) await pointer(wrapper, 'pointermove', x)
    expect(action(wrapper)).toBe('shy')
    for (const x of [320, 300, 320]) await pointer(wrapper, 'pointermove', x)
    expect(action(wrapper)).toBe('eye-roll')
  })

  it('greets after a hover dwell, wakes on undocking, and respects reduced decorative motion', async () => {
    const wrapper = createEntry()
    await nextTick()
    await wrapper.trigger('pointerenter', { pointerType: 'mouse' })
    await vi.advanceTimersByTimeAsync(700)
    expect(action(wrapper)).toBe('wave')
    wrapper.vm.setDocked(true)
    await nextTick()
    await wrapper.find('.agent-assistant-fab__trigger').trigger('click')
    expect(action(wrapper)).toBe('wake')
    await pointer(wrapper, 'pointerdown')
    await wrapper.setProps({ motionActive: false })
    await vi.advanceTimersByTimeAsync(1000)
    expect(action(wrapper)).toBeNull()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('scans when busy and acknowledges a reply once instead of replaying on every streaming token', async () => {
    const wrapper = createEntry()
    await nextTick()
    await wrapper.setProps({ thinking: true })
    expect(action(wrapper)).toBe('scan')
    wrapper.vm.showAssistantReplyPreview('第一段')
    await nextTick()
    expect(action(wrapper)).toBe('nod')
    await vi.advanceTimersByTimeAsync(1000)
    wrapper.vm.showAssistantReplyPreview('第二段')
    await nextTick()
    await vi.advanceTimersByTimeAsync(500)
    expect(action(wrapper)).toBeNull()
    await wrapper.setProps({ active: false })
    await wrapper.setProps({ thinking: false })
    expect(action(wrapper)).toBeNull()
    await wrapper.setProps({ active: true })
    expect(action(wrapper)).toBe('wake')
  })
})
