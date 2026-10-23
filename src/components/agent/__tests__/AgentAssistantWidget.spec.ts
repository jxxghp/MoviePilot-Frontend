import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent, h, nextTick, ref, type PropType } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AgentAssistantWidget from '@/components/agent/AgentAssistantWidget.vue'
import { AGENT_ASSISTANT_LAYER_Z_INDEX } from '@/constants/agentAssistant'
import { AGENT_PET_RESOLVE_WAIT, useAgentPetStore } from '@/stores/agentPet'
import type {
  AgentHostEvent,
  AgentPetContext,
  AgentPetDeclaration,
  AgentPetSayResult,
  MoviePilotAgentHost,
} from '@/types/agentHost'
import { agentHost } from '@/utils/agentHost'
import { suspendAgentPet } from '@/composables/useAgentPetSuspension'
import { resetAgentPetComponentLoads } from '@/utils/agentPetLoader'

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  loadRemoteComponent: vi.fn(),
  globalSettings: {} as Record<string, unknown>,
}))

vi.mock('vuetify', () => ({
  useTheme: () => ({ themeClasses: ref('v-theme--test'), global: { current: ref({ dark: true }) } }),
}))

vi.mock('@/api', () => ({
  default: { get: mocks.apiGet, post: mocks.apiPost },
  createPluginInstanceApi: () => ({}),
}))

vi.mock('@/stores/global', () => ({
  useGlobalSettingsStore: () => ({ get: (key: string) => mocks.globalSettings[key] }),
}))

vi.mock('@/utils/federationLoader', () => ({
  ensureRemoteRegistered: async () => true,
  registerRemoteModule: () => {},
  loadRegisteredRemoteComponent: (...args: unknown[]) => mocks.loadRemoteComponent(...args),
}))

function createPet(overrides: Partial<AgentPetDeclaration> = {}): AgentPetDeclaration {
  return {
    plugin_id: 'PetPlugin',
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

/** 让 store 读到指定形象声明和用户选择。 */
function mockPetBackend(pets: AgentPetDeclaration[], selection: unknown) {
  mocks.apiGet.mockImplementation(async (path: string) => {
    if (path === 'plugin/agent_pets') return pets
    if (path === 'user/config/AgentPet') return { value: selection }
    return null
  })
}

beforeEach(() => {
  setActivePinia(createPinia())
  mocks.globalSettings = {}
  mocks.apiGet.mockReset()
  mocks.apiPost.mockReset()
  mocks.loadRemoteComponent.mockReset()
  resetAgentPetComponentLoads()
  mockPetBackend([], null)
})

vi.mock('@/composables/useAppActivityLifecycle', () => ({
  useAppActivityLifecycle: () => ({ allowsDecorativeMotion: ref(true) }),
}))

describe('AgentAssistantWidget layering', () => {
  afterEach(() => {
    vi.useRealTimers()
    document.body
      .querySelectorAll('.agent-assistant-layer, .agent-assistant-test-host')
      .forEach(element => element.remove())
  })

  it('teleports the assistant outside the application stacking context while preserving the active theme', () => {
    const host = document.createElement('div')
    host.className = 'agent-assistant-test-host v-application'
    document.body.append(host)

    const wrapper = mount(AgentAssistantWidget, {
      attachTo: host,
      global: {
        stubs: {
          AgentAssistantEntry: { template: '<div data-agent-assistant-entry />' },
          AgentAssistantPanel: { template: '<div data-agent-assistant-panel />' },
        },
      },
    })

    const layer = document.body.querySelector(':scope > .agent-assistant-layer')

    expect(layer).not.toBeNull()
    expect(host.contains(layer)).toBe(false)
    expect(layer).toHaveClass('v-theme--test')
    expect(layer?.querySelector('[data-agent-assistant-entry]')).not.toBeNull()
    expect(layer?.querySelector('[data-agent-assistant-panel]')).not.toBeNull()

    wrapper.unmount()
  })

  it('reserves the highest CSS stacking levels in assistant display order', () => {
    expect(AGENT_ASSISTANT_LAYER_Z_INDEX.entry).toBe(2_147_483_645)
    expect(AGENT_ASSISTANT_LAYER_Z_INDEX.panel).toBe(2_147_483_646)
    expect(AGENT_ASSISTANT_LAYER_Z_INDEX.overlay).toBe(2_147_483_647)
  })

  it('limits closed-panel assistant preview updates and keeps the latest text', async () => {
    vi.useFakeTimers()
    const showAssistantReplyPreview = vi.fn()
    const entryStub = defineComponent({
      setup(_props, { expose }) {
        expose({ clearBubbles: vi.fn(), showAssistantReplyPreview })
        return () => h('div', { 'data-agent-assistant-entry': '' })
      },
    })
    const panelStub = defineComponent({
      emits: ['assistant-preview', 'thinking-change', 'update:modelValue'],
      setup() {
        return () => h('div', { 'data-agent-assistant-panel': '' })
      },
    })
    const wrapper = mount(AgentAssistantWidget, {
      global: {
        stubs: {
          AgentAssistantEntry: entryStub,
          AgentAssistantPanel: panelStub,
        },
      },
    })
    const panel = wrapper.findComponent(panelStub)

    panel.vm.$emit('assistant-preview', '第一段')
    panel.vm.$emit('assistant-preview', '第二段')
    panel.vm.$emit('assistant-preview', '最终预览')
    await nextTick()

    expect(showAssistantReplyPreview).toHaveBeenCalledTimes(1)
    expect(showAssistantReplyPreview).toHaveBeenLastCalledWith('第一段')

    await vi.advanceTimersByTimeAsync(125)
    expect(showAssistantReplyPreview).toHaveBeenCalledTimes(2)
    expect(showAssistantReplyPreview).toHaveBeenLastCalledWith('最终预览')

    wrapper.unmount()
  })
})

describe('AgentAssistantWidget agent host', () => {
  const entryShowPetSay = vi.fn((): AgentPetSayResult => ({ shown: true }))
  const entryClosePetSay = vi.fn()
  const entryStub = defineComponent({
    name: 'AgentAssistantEntry',
    props: { anchored: Boolean, anchorRect: Object, pet: Object, active: Boolean, concealed: Boolean },
    setup(_props, { expose }) {
      expose({
        clearBubbles: vi.fn(),
        showAssistantReplyPreview: vi.fn(),
        showPetSay: entryShowPetSay,
        closePetSay: entryClosePetSay,
      })
      return () => h('div', { 'data-agent-assistant-entry': '' })
    },
  })

  function createPanelStub(setDraft = vi.fn()) {
    return defineComponent({
      name: 'AgentAssistantPanel',
      props: { modelValue: Boolean },
      emits: ['assistant-preview', 'thinking-change', 'stream-phase', 'update:modelValue'],
      setup(props, { expose }) {
        expose({ setDraft })
        return () => h('aside', { class: 'agent-assistant-panel', 'data-open': String(props.modelValue) })
      },
    })
  }

  function mountWidget(panelStub = createPanelStub()) {
    return mount(AgentAssistantWidget, {
      global: { stubs: { AgentAssistantEntry: entryStub, AgentAssistantPanel: panelStub } },
    })
  }

  afterEach(() => {
    document.body.querySelectorAll('.agent-assistant-layer').forEach(element => element.remove())
  })

  it('opens the native panel with a draft that is only filled in, and reports panel events', async () => {
    const setDraft = vi.fn()
    const panelStub = createPanelStub(setDraft)
    const wrapper = mountWidget(panelStub)
    await flushPromises()
    const plugin = agentHost.createScoped(() => 'PetPlugin')
    const events: AgentHostEvent[] = []
    plugin.on('agent.panel.open', payload => events.push(payload))

    expect(plugin.getState()).toMatchObject({ available: true, panelOpen: false, theme: 'dark' })
    plugin.open({ draft: '帮我订阅这部剧' })
    await flushPromises()

    expect(wrapper.findComponent(panelStub).props('modelValue')).toBe(true)
    expect(setDraft).toHaveBeenCalledWith('帮我订阅这部剧')
    expect(wrapper.findComponent(panelStub).emitted('update:modelValue')).toBeUndefined()
    expect(plugin.getState().panelOpen).toBe(true)
    expect(events).toEqual([expect.objectContaining({ name: 'agent.panel.open', source: 'host' })])

    plugin.close()
    await flushPromises()
    expect(plugin.getState().panelOpen).toBe(false)

    wrapper.unmount()
    expect(plugin.getState().available).toBe(false)
    plugin.open({ draft: 'ignored' })
    expect(setDraft).toHaveBeenCalledTimes(1)
    plugin.dispose()
  })

  it('mounts a stage pet in a click-through viewport layer and anchors host bubbles to it', async () => {
    let receivedAgent: MoviePilotAgentHost | undefined
    mocks.loadRemoteComponent.mockResolvedValue(
      defineComponent({
        props: {
          agent: { type: Object as PropType<MoviePilotAgentHost>, required: true },
          pet: { type: Object as PropType<AgentPetContext>, required: true },
        },
        setup(props) {
          receivedAgent = props.agent
          props.pet.setBubbleAnchor({ x: 100, y: 200, width: 64, height: 96 })
          return () => h('div', { 'data-stage-pet': '' })
        },
      }),
    )
    mockPetBackend([createPet()], { plugin_id: 'PetPlugin', key: 'girl' })

    const wrapper = mountWidget()
    await vi.waitFor(() => expect(document.body.querySelector('[data-stage-pet]')).not.toBeNull())
    await flushPromises()

    const layer = document.body.querySelector<HTMLElement>('[data-agent-pet-stage]')
    expect(layer).not.toBeNull()
    expect(layer?.style.zIndex).toBe(String(AGENT_ASSISTANT_LAYER_Z_INDEX.entry))
    expect(layer?.classList.contains('agent-pet-stage-layer')).toBe(true)
    const entry = wrapper.findComponent(entryStub)
    expect(entry.props('anchored')).toBe(true)
    expect(entry.props('anchorRect')).toEqual({ x: 100, y: 200, width: 64, height: 96 })
    expect(entry.props('pet')).toBeNull()
    expect(receivedAgent?.version).toBe(1)

    wrapper.unmount()
    expect(document.body.querySelector('[data-agent-pet-stage]')).toBeNull()
  })

  it('hides the stage pet and the entry while a full-screen overlay suspends them, keeping them mounted', async () => {
    mocks.loadRemoteComponent.mockResolvedValue(
      defineComponent({ setup: () => () => h('div', { 'data-stage-pet': '' }) }),
    )
    mockPetBackend([createPet()], { plugin_id: 'PetPlugin', key: 'girl' })
    const wrapper = mountWidget()
    await vi.waitFor(() => expect(document.body.querySelector('[data-stage-pet]')).not.toBeNull())
    await flushPromises()
    const layer = () => document.body.querySelector<HTMLElement>('[data-agent-pet-stage]')!
    const entry = () => document.body.querySelector<HTMLElement>('[data-agent-assistant-entry]')!

    const releaseShowcase = suspendAgentPet()
    const releaseOther = suspendAgentPet()
    await nextTick()
    expect(layer().style.display).toBe('none')
    expect(entry().style.display).toBe('none')
    // 形象组件仍挂载，归还后原样出现。
    expect(document.body.querySelector('[data-stage-pet]')).not.toBeNull()
    releaseShowcase()
    await nextTick()
    expect(layer().style.display).toBe('none')
    releaseOther()
    await nextTick()
    expect(layer().style.display).toBe('')
    expect(entry().style.display).toBe('')
    wrapper.unmount()
  })

  it('removes the builtin entry for self-drawn stage bubbles and forwards bus bubbles as events', async () => {
    mocks.loadRemoteComponent.mockResolvedValue(
      defineComponent({ setup: () => () => h('div', { 'data-stage-pet': '' }) }),
    )
    mockPetBackend([createPet({ bubbles: 'self' })], null)
    mocks.globalSettings.AI_AGENT_PET = 'PetPlugin:girl'
    const { canUseAgentAssistantBubble, emitAgentAssistantToastBubble } = await import('@/utils/agentAssistantBubble')

    const wrapper = mountWidget()
    await vi.waitFor(() => expect(document.body.querySelector('[data-stage-pet]')).not.toBeNull())
    await flushPromises()
    expect(wrapper.findComponent(entryStub).exists()).toBe(false)
    expect(canUseAgentAssistantBubble()).toBe(true)

    const listener = agentHost.createScoped(() => 'PetPlugin')
    const bubbles: AgentHostEvent[] = []
    listener.on('agent.bubble', payload => bubbles.push(payload))
    emitAgentAssistantToastBubble({ id: 't1', kind: 'toast', variant: 'success', text: '已保存' })
    expect(bubbles[0]).toMatchObject({
      source: 'host',
      data: { id: 't1', kind: 'toast', variant: 'success', text: '已保存' },
    })

    listener.dispose()
    wrapper.unmount()
    expect(canUseAgentAssistantBubble()).toBe(false)
  })

  /** 挂载一个 stage 形象并取回它收到的 pet 上下文。 */
  async function mountStagePet(overrides: Partial<AgentPetDeclaration> = {}, onSetup?: (pet: AgentPetContext) => void) {
    let petContext: AgentPetContext | undefined
    mocks.loadRemoteComponent.mockResolvedValue(
      defineComponent({
        props: { pet: { type: Object as PropType<AgentPetContext>, required: true } },
        setup(props) {
          petContext = props.pet
          props.pet.setBubbleAnchor({ x: 100, y: 200, width: 64, height: 96 })
          onSetup?.(props.pet)
          return () => h('div', { 'data-stage-pet': '' })
        },
      }),
    )
    mockPetBackend([createPet(overrides)], { plugin_id: 'PetPlugin', key: 'girl' })
    const panelStub = createPanelStub()
    const wrapper = mount(AgentAssistantWidget, {
      global: { stubs: { AgentAssistantEntry: entryStub, AgentAssistantPanel: panelStub } },
    })
    await vi.waitFor(() => expect(document.body.querySelector('[data-stage-pet]')).not.toBeNull())
    await flushPromises()
    return { wrapper, panelStub, pet: petContext as AgentPetContext }
  }

  it('lets the active pet say short plain lines through the entry and enforces the host limits', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(0)
    entryShowPetSay.mockClear()
    const { wrapper, pet } = await mountStagePet()

    expect(pet.say('   ')).toEqual({ shown: false, reason: 'empty' })
    expect(pet.say(`喵~ ${'很'.repeat(80)}`)).toEqual({ shown: true })
    const [text, duration] = entryShowPetSay.mock.calls[0] as unknown as [string, number]
    // 不剥离 Markdown 符号，按码点截到 60 个字符并补省略号；缺省时长 3.5 秒。
    expect(text.startsWith('喵~ ')).toBe(true)
    expect(Array.from(text)).toHaveLength(60)
    expect(text.endsWith('…')).toBe(true)
    expect(duration).toBe(3500)

    expect(pet.say('再来一句')).toEqual({ shown: false, reason: 'rate_limited' })
    vi.setSystemTime(2000)
    expect(pet.say('再来一句', { duration: 60_000 })).toEqual({ shown: true })
    expect(entryShowPetSay).toHaveBeenLastCalledWith('再来一句', 6000)
    vi.setSystemTime(4000)
    expect(pet.say('再来一句')).toEqual({ shown: false, reason: 'duplicate' })

    // 入口拒绝（例如有系统气泡）不占配额。
    entryShowPetSay.mockReturnValueOnce({ shown: false, reason: 'busy' })
    expect(pet.say('第三句')).toEqual({ shown: false, reason: 'busy' })
    expect(pet.say('第三句')).toEqual({ shown: true })

    // 60 秒内最多 10 条。
    for (let index = 0; index < 7; index++) {
      vi.setSystemTime(6000 + index * 2000)
      expect(pet.say(`第 ${index + 4} 句`)).toEqual({ shown: true })
    }
    vi.setSystemTime(22_000)
    expect(pet.say('第 11 句')).toEqual({ shown: false, reason: 'rate_limited' })
    vi.setSystemTime(60_500)
    expect(pet.say('第 11 句')).toEqual({ shown: true })

    wrapper.unmount()
  })

  it('keeps pet lines away while the panel is open', async () => {
    entryShowPetSay.mockClear()
    const { wrapper, panelStub, pet } = await mountStagePet()
    wrapper.findComponent(panelStub).vm.$emit('update:modelValue', true)
    await nextTick()
    expect(pet.say('你好')).toEqual({ shown: false, reason: 'hidden' })
    expect(entryShowPetSay).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('reports a stage pet line as hidden until the pet is ready and anchored', async () => {
    entryShowPetSay.mockClear()
    let early: AgentPetSayResult | undefined
    const { wrapper, pet } = await mountStagePet({}, context => {
      early = context.say('你好')
    })
    expect(early).toEqual({ shown: false, reason: 'hidden' })
    expect(entryShowPetSay).not.toHaveBeenCalled()
    expect(pet.say('你好')).toEqual({ shown: true })
    wrapper.unmount()
  })

  it('invalidates the old pet context and clears its line when the user switches pets', async () => {
    entryShowPetSay.mockClear()
    entryClosePetSay.mockClear()
    const { wrapper, pet } = await mountStagePet()
    expect(pet.say('你好')).toEqual({ shown: true })

    await useAgentPetStore().setUserSelection('builtin')
    await flushPromises()
    expect(entryClosePetSay).toHaveBeenCalled()
    entryShowPetSay.mockClear()
    // 插件遗留的计时器仍持有旧上下文，台词不能出现在内置机器人旁边。
    expect(pet.say('还在吗')).toEqual({ shown: false, reason: 'unavailable' })
    expect(entryShowPetSay).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('reports no host bubble for stage pets that draw their own bubbles', async () => {
    entryShowPetSay.mockClear()
    const { wrapper, pet } = await mountStagePet({ bubbles: 'self' })
    expect(pet.say('你好')).toEqual({ shown: false, reason: 'unavailable' })
    expect(entryShowPetSay).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('forwards the Dock area published by the footer into the host state', async () => {
    const { usePublishFooterDockGeometry } = await import('@/composables/useFooterDockGeometry')
    const rect = { x: 80, y: 710, width: 240, height: 56 }
    const domRect = { ...rect, left: 80, top: 710, right: 320, bottom: 766, toJSON: () => ({}) } as DOMRect
    const footer = mount(
      defineComponent({
        setup() {
          const container = ref<HTMLElement | null>(null)
          const group = ref<HTMLElement | null>(null)
          usePublishFooterDockGeometry(container, group)
          return () =>
            h('div', { ref: container }, [h('div', { ref: group }, [h('div', { 'data-footer-nav-role': 'primary' })])])
        },
      }),
      { attachTo: document.body },
    )
    footer.findAll('div').forEach(item => {
      item.element.getBoundingClientRect = () => domRect
      item.element.getClientRects = () => [domRect] as unknown as DOMRectList
    })
    const wrapper = mountWidget()
    const plugin = agentHost.createScoped(() => 'PetPlugin')
    const states: Array<unknown> = []
    plugin.subscribe(state => states.push(state.dock))

    window.dispatchEvent(new Event('resize'))
    await vi.waitFor(() => expect(agentHost.getState().dock).toEqual({ bounds: rect, items: [rect] }))
    expect(states.at(-1)).toEqual({ bounds: rect, items: [rect] })

    footer.unmount()
    await nextTick()
    expect(agentHost.getState().dock).toBeNull()
    plugin.dispose()
    wrapper.unmount()
  })

  it('passes renderer pets to the builtin entry instead of mounting a stage layer', async () => {
    mockPetBackend([createPet({ mode: 'renderer', bubbles: null })], { plugin_id: 'PetPlugin', key: 'girl' })

    const wrapper = mountWidget()
    await vi.waitFor(() => expect(wrapper.findComponent(entryStub).props('pet')).not.toBeNull())

    expect(wrapper.findComponent(entryStub).props('anchored')).toBe(false)
    expect(document.body.querySelector('[data-agent-pet-stage]')).toBeNull()
    wrapper.unmount()
  })

  it('keeps the entry blank while a cached stage pet loads after refresh and falls back on timeout', async () => {
    vi.useFakeTimers()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { useUserStore } = await import('@/stores/user')
    useUserStore().setUserName('alice')
    localStorage.setItem('agentAssistant.lastPet.alice', JSON.stringify({ id: 'PetPlugin:girl', pet: createPet() }))
    // 接口和联邦组件都挂起，模拟刷新后网络尚未返回。
    mocks.apiGet.mockImplementation(() => new Promise(() => {}))
    mocks.loadRemoteComponent.mockImplementation(() => new Promise(() => {}))

    const wrapper = mountWidget()
    await vi.advanceTimersByTimeAsync(0)
    await flushPromises()

    const entry = wrapper.findComponent(entryStub)
    expect(entry.exists()).toBe(true)
    expect(entry.props('concealed')).toBe(true)
    expect(document.body.querySelector('[data-agent-pet-stage]')).not.toBeNull()
    expect(mocks.loadRemoteComponent).toHaveBeenCalledWith('PetPlugin', 'AgentPet')

    await vi.advanceTimersByTimeAsync(8000)
    await flushPromises()

    expect(wrapper.findComponent(entryStub).props('concealed')).toBe(false)
    expect(document.body.querySelector('[data-agent-pet-stage]')).toBeNull()
    // 一次加载失败不改写刷新缓存，下次刷新仍先尝试用户选定的形象。
    expect(JSON.parse(localStorage.getItem('agentAssistant.lastPet.alice') || '{}').id).toBe('PetPlugin:girl')

    wrapper.unmount()
    localStorage.clear()
    vi.useRealTimers()
  })

  it('keeps the entry blank without a cache until the server answers, and shows the robot if it never does', async () => {
    vi.useFakeTimers()
    mocks.apiGet.mockImplementation(() => new Promise(() => {}))
    localStorage.clear()

    const wrapper = mountWidget()
    await flushPromises()
    expect(wrapper.findComponent(entryStub).props('concealed')).toBe(true)

    await vi.advanceTimersByTimeAsync(AGENT_PET_RESOLVE_WAIT)
    expect(wrapper.findComponent(entryStub).props('concealed')).toBe(false)
    expect(document.body.querySelector('[data-agent-pet-stage]')).toBeNull()
    vi.useRealTimers()
    wrapper.unmount()
  })
})
