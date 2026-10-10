import { shallowMount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AgentAssistantEntry from '@/components/agent/AgentAssistantEntry.vue'
import { canUseAgentAssistantBubble } from '@/utils/agentAssistantBubble'

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

  it('only draws host bubbles beside the reported anchor in anchored stage mode', async () => {
    const wrapper = shallowMount(AgentAssistantEntry, {
      global: { stubs: { AgentPetStage: true, VIcon: true } },
      props: { active: true, motionActive: true, anchored: true, anchorRect: null },
    })
    await nextTick()

    expect(wrapper.find('.agent-assistant-fab__trigger').exists()).toBe(false)
    expect(wrapper.classes()).toContain('is-anchored')
    // 未上报锚点时不接管 toast，避免提示被吞掉。
    expect(canUseAgentAssistantBubble()).toBe(false)

    ;(wrapper.vm as unknown as { showBubble: (input: { text: string }) => void }).showBubble({ text: '下载完成' })
    await nextTick()
    expect(wrapper.find('.agent-assistant-fab__bubbles').exists()).toBe(false)

    await wrapper.setProps({ anchorRect: { x: 300, y: 400, width: 80, height: 120 } })
    await nextTick()
    expect(wrapper.find('.agent-assistant-fab__bubbles').text()).toContain('下载完成')
    expect(canUseAgentAssistantBubble()).toBe(true)
    // 锚定模式不安排自动贴边或随机动作。
    expect(wrapper.classes()).not.toContain('is-docked')

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
  async function click(wrapper: ReturnType<typeof createEntry>, detail = 1) {
    wrapper
      .find('.agent-assistant-fab__trigger')
      .element.dispatchEvent(new MouseEvent('click', { detail, bubbles: true }))
    await nextTick()
  }

  beforeEach(() => {
    vi.useFakeTimers()
    // 拖动会持久化入口位置，每个用例从默认位置开始。
    localStorage.removeItem('agentAssistant.fabAnchor')
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

  it('blocks delayed and zero-detail clicks after dragging until a new deliberate activation', async () => {
    const wrapper = createEntry()
    await nextTick()
    const trigger = wrapper.find('.agent-assistant-fab__trigger')
    expect(trigger.attributes('title')).toBeUndefined()
    await pointer(wrapper, 'pointerdown')
    await pointer(wrapper, 'pointermove', 360)
    await pointer(wrapper, 'pointerup', 360)
    await vi.advanceTimersByTimeAsync(800)
    await click(wrapper)
    await click(wrapper, 0)
    expect(wrapper.emitted('open')).toBeUndefined()
    await pointer(wrapper, 'pointerdown', 360)
    await pointer(wrapper, 'pointerup', 360)
    await click(wrapper)
    expect(wrapper.emitted('open')).toHaveLength(1)
  })

  it('blocks clicks after capture is lost but still allows explicit keyboard activation', async () => {
    const wrapper = createEntry()
    await nextTick()
    await pointer(wrapper, 'pointerdown')
    await pointer(wrapper, 'pointermove', 360)
    await pointer(wrapper, 'lostpointercapture', 360)
    const trigger = wrapper.find('.agent-assistant-fab__trigger')
    await click(wrapper, 0)
    expect(wrapper.emitted('open')).toBeUndefined()
    await trigger.trigger('keydown', { key: 'Enter' })
    await click(wrapper, 0)
    expect(wrapper.emitted('open')).toHaveLength(1)
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

describe('AgentAssistantEntry position memory', () => {
  const STORAGE_KEY = 'agentAssistant.fabAnchor'

  /** 只隔离渲染器和图标，位置计算走真实入口逻辑。 */
  async function mountEntry() {
    const wrapper = shallowMount(AgentAssistantEntry, {
      global: { stubs: { AgentPetStage: true, VIcon: true } },
      props: { active: true, motionActive: true },
    })
    await nextTick()
    await nextTick()
    return wrapper
  }

  /** 读取入口当前渲染坐标。 */
  function position(wrapper: Awaited<ReturnType<typeof mountEntry>>) {
    const style = (wrapper.element as HTMLElement).style
    return [style.getPropertyValue('--agent-assistant-fab-x'), style.getPropertyValue('--agent-assistant-fab-y')]
  }

  /** 按住入口拖动一段距离后松开。 */
  async function drag(wrapper: Awaited<ReturnType<typeof mountEntry>>, deltaX: number, deltaY: number) {
    const trigger = wrapper.find('.agent-assistant-fab__trigger')
    const event = (clientX: number, clientY: number, buttons: number) => ({
      button: 0,
      buttons,
      clientX,
      clientY,
      isPrimary: true,
      pointerId: 1,
      pointerType: 'mouse',
    })
    await trigger.trigger('pointerdown', event(600, 400, 1))
    await trigger.trigger('pointermove', event(600 + deltaX, 400 + deltaY, 1))
    await trigger.trigger('pointerup', event(600 + deltaX, 400 + deltaY, 0))
  }

  beforeEach(() => {
    vi.useFakeTimers()
    localStorage.removeItem(STORAGE_KEY)
  })
  afterEach(() => {
    localStorage.removeItem(STORAGE_KEY)
    vi.useRealTimers()
  })

  it('restores the dragged position after the entry is mounted again', async () => {
    const first = await mountEntry()
    const defaultPosition = position(first)
    await drag(first, -400, -200)
    const draggedPosition = position(first)
    first.unmount()

    expect(draggedPosition).not.toEqual(defaultPosition)
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')).toMatchObject({ mode: 'free' })

    const second = await mountEntry()
    expect(position(second)).toEqual(draggedPosition)
    second.unmount()
  })

  it('falls back to the default position when the stored anchor is invalid', async () => {
    const reference = await mountEntry()
    const defaultPosition = position(reference)
    reference.unmount()

    for (const stored of ['not-json', JSON.stringify({ mode: 'free', xRatio: 3, yRatio: 0.5 })]) {
      localStorage.setItem(STORAGE_KEY, stored)
      const wrapper = await mountEntry()
      expect(position(wrapper)).toEqual(defaultPosition)
      wrapper.unmount()
    }
  })
})
