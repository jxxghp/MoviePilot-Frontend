import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, h, onMounted, type PropType } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgentHostEvent, AgentPetContext, AgentPetDeclaration, MoviePilotAgentHost } from '@/types/agentHost'
import { agentHost } from '@/utils/agentHost'
import { resetAgentPetComponentLoads } from '@/utils/agentPetLoader'
import AgentPetRemote from '../AgentPetRemote.vue'
import AgentPetStage from '../AgentPetStage.vue'

const mocks = vi.hoisted(() => ({
  loadRemoteComponent: vi.fn(),
  markFailed: vi.fn(),
  api: { get: vi.fn(), post: vi.fn() },
  scopedApi: { scoped: true },
}))

vi.mock('@/utils/federationLoader', () => ({
  ensureRemoteRegistered: async () => true,
  loadRegisteredRemoteComponent: (...args: unknown[]) => mocks.loadRemoteComponent(...args),
}))

vi.mock('@/api', () => ({
  default: mocks.api,
  createPluginInstanceApi: () => mocks.scopedApi,
}))

vi.mock('@/stores/agentPet', () => ({
  useAgentPetStore: () => ({ markFailed: mocks.markFailed }),
}))

function createPet(overrides: Partial<AgentPetDeclaration> = {}): AgentPetDeclaration {
  return {
    plugin_id: 'PetPlugin_2',
    source_plugin_id: 'PetPlugin',
    plugin_name: '桌宠',
    key: 'girl',
    name: '看板娘',
    mode: 'stage',
    component: 'AgentPet',
    api_version: 1,
    bubbles: 'host',
    random_actions: null,
    ...overrides,
  }
}

/** 记录收到的 props 与事件的假远程形象组件。 */
function createFakePet() {
  const received: { props?: Record<string, unknown>; events: AgentHostEvent[]; states: number } = {
    events: [],
    states: 0,
  }
  const component = defineComponent({
    name: 'FakeAgentPet',
    props: {
      agent: { type: Object as PropType<MoviePilotAgentHost>, required: true },
      pet: { type: Object as PropType<AgentPetContext>, required: true },
      api: Object,
      pluginId: String,
      sourcePluginId: String,
      action: { type: String, default: undefined },
      intent: { type: String, default: undefined },
      thinking: { type: Boolean, default: undefined },
      motionActive: { type: Boolean, default: undefined },
    },
    setup(props) {
      received.props = props as unknown as Record<string, unknown>
      props.agent.on('pet.config', payload => received.events.push(payload))
      props.agent.subscribe(() => {
        received.states += 1
      })
      onMounted(() => props.pet.setBubbleAnchor({ x: 10, y: 20, width: 30, height: 40 }))
      return () => h('div', { 'data-fake-pet': props.pet.mode }, String(props.action ?? ''))
    },
  })
  return { component, received }
}

describe('AgentPetRemote', () => {
  beforeEach(() => {
    mocks.loadRemoteComponent.mockReset()
    resetAgentPetComponentLoads()
    mocks.markFailed.mockReset()
    mocks.api.get.mockReset()
    mocks.api.post.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('mounts a stage pet with the instance-scoped host and clears its subscriptions on unmount', async () => {
    const { component, received } = createFakePet()
    mocks.loadRemoteComponent.mockResolvedValue(component)

    const wrapper = mount(AgentPetRemote, { props: { pet: createPet() } })
    await flushPromises()

    expect(mocks.loadRemoteComponent).toHaveBeenCalledWith('PetPlugin_2', 'AgentPet')
    expect(wrapper.find('[data-fake-pet="stage"]').exists()).toBe(true)
    expect(wrapper.emitted('ready')).toHaveLength(1)
    expect(wrapper.emitted('bubble-anchor')?.[0]).toEqual([{ x: 10, y: 20, width: 30, height: 40 }])
    expect(received.props).toMatchObject({
      api: mocks.scopedApi,
      pluginId: 'PetPlugin_2',
      sourcePluginId: 'PetPlugin',
      action: undefined,
    })

    // 设置页（另一宿主视图）emit 的自定义事件送达形象，source 为发出方实例。
    const settings = agentHost.createScoped(() => 'PetPlugin_2')
    settings.emit('pet.config', { speed: 2 })
    expect(received.events).toEqual([expect.objectContaining({ source: 'PetPlugin_2', data: { speed: 2 } })])

    const statesBeforeUnmount = received.states
    wrapper.unmount()
    agentHost.setState({ thinking: !agentHost.getState().thinking })
    settings.emit('pet.config', { speed: 3 })
    expect(received.states).toBe(statesBeforeUnmount)
    expect(received.events).toHaveLength(1)
    agentHost.resetState()
    settings.dispose()
  })

  it('falls back when loading fails or exceeds the timeout', async () => {
    mocks.loadRemoteComponent.mockRejectedValueOnce(new Error('missing expose'))
    const failing = mount(AgentPetRemote, { props: { pet: createPet() } })
    await flushPromises()
    expect(mocks.markFailed).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'girl' }),
      '加载失败',
      expect.any(Error),
    )
    failing.unmount()

    vi.useFakeTimers()
    mocks.loadRemoteComponent.mockReturnValueOnce(new Promise(() => {}))
    const slow = mount(AgentPetRemote, { props: { pet: createPet({ key: 'slow' }) } })
    await vi.advanceTimersByTimeAsync(8000)
    expect(mocks.markFailed).toHaveBeenLastCalledWith(
      expect.objectContaining({ key: 'slow' }),
      '加载超时',
      expect.any(Error),
    )
    slow.unmount()
  })

  it('falls back when the plugin component throws at runtime', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const broken = defineComponent({
      setup() {
        throw new Error('render crash')
      },
    })
    mocks.loadRemoteComponent.mockResolvedValue(broken)

    const wrapper = mount(AgentPetRemote, { props: { pet: createPet() } })
    await flushPromises()

    expect(mocks.markFailed).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'girl' }),
      '运行时出错',
      expect.any(Error),
    )
    wrapper.unmount()
  })

  it('stores small per-pet state and rejects payloads over 16KB', async () => {
    let context: AgentPetContext | undefined
    mocks.loadRemoteComponent.mockResolvedValue(
      defineComponent({
        props: { pet: { type: Object as PropType<AgentPetContext>, required: true } },
        setup(props) {
          context = props.pet
          return () => h('div')
        },
      }),
    )
    mocks.api.get.mockResolvedValue({ value: { x: 1 } })
    mocks.api.post.mockResolvedValue(undefined)
    const wrapper = mount(AgentPetRemote, { props: { pet: createPet() } })
    await flushPromises()

    await expect(context!.storage.get()).resolves.toEqual({ x: 1 })
    expect(mocks.api.get).toHaveBeenCalledWith('user/config/AgentPetState.PetPlugin_2.girl', { feedback: 'silent' })
    await context!.storage.set({ x: 2 })
    expect(mocks.api.post).toHaveBeenCalledWith(
      'user/config/AgentPetState.PetPlugin_2.girl',
      { x: 2 },
      {
        feedback: 'silent',
      },
    )
    await expect(context!.storage.set({ blob: 'x'.repeat(17 * 1024) })).rejects.toThrow('16KB')
    wrapper.unmount()
  })
})

describe('AgentPetStage renderer branch', () => {
  beforeEach(() => {
    mocks.loadRemoteComponent.mockReset()
    resetAgentPetComponentLoads()
  })

  it('stays blank instead of flashing the builtin robot while the renderer pet loads, then passes host props', async () => {
    const { component, received } = createFakePet()
    let resolveLoad!: (value: unknown) => void
    mocks.loadRemoteComponent.mockReturnValue(new Promise(resolve => (resolveLoad = resolve)))

    const wrapper = mount(AgentPetStage, {
      props: {
        pet: createPet({ mode: 'renderer', bubbles: null }),
        action: 'wave',
        intent: 'idle',
        thinking: false,
      },
    })
    await flushPromises()
    expect(wrapper.find('.agent-assistant-fab__bot').exists()).toBe(false)

    resolveLoad(component)
    await flushPromises()
    await flushPromises()

    expect(wrapper.find('.agent-assistant-fab__bot').exists()).toBe(false)
    expect(wrapper.find('[data-fake-pet="renderer"]').text()).toBe('wave')
    expect(received.props).toMatchObject({ action: 'wave', intent: 'idle', thinking: false, motionActive: true })
    // renderer 模式下锚点上报为空操作。
    expect(wrapper.findComponent(AgentPetRemote).emitted('bubble-anchor')).toBeUndefined()
    wrapper.unmount()
  })

  it('renders the builtin robot without a pet and nothing while concealed', async () => {
    const wrapper = mount(AgentPetStage, { props: { pet: null } })
    expect(wrapper.find('.agent-assistant-fab__bot').exists()).toBe(true)

    await wrapper.setProps({ concealed: true })
    expect(wrapper.find('.agent-assistant-fab__bot').exists()).toBe(false)
    expect(mocks.loadRemoteComponent).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('turns renderer motionActive off when the system asks for reduced motion', async () => {
    const { component, received } = createFakePet()
    mocks.loadRemoteComponent.mockResolvedValue(component)
    agentHost.setState({ reducedMotion: false })

    const wrapper = mount(AgentPetStage, {
      props: { pet: createPet({ mode: 'renderer', bubbles: null }), motionActive: true },
    })
    await flushPromises()
    await flushPromises()
    expect(received.props?.motionActive).toBe(true)

    agentHost.setState({ reducedMotion: true })
    await flushPromises()
    expect(received.props?.motionActive).toBe(false)

    wrapper.unmount()
    agentHost.resetState()
  })
})
