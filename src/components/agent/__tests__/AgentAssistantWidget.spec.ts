import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent, h, nextTick, ref, type PropType } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AgentAssistantWidget from '@/components/agent/AgentAssistantWidget.vue'
import { AGENT_ASSISTANT_LAYER_Z_INDEX } from '@/constants/agentAssistant'
import type { AgentHostEvent, AgentPetContext, AgentPetDeclaration, MoviePilotAgentHost } from '@/types/agentHost'
import { agentHost } from '@/utils/agentHost'

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
  loadRemoteComponent: (...args: unknown[]) => mocks.loadRemoteComponent(...args),
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
  const entryStub = defineComponent({
    name: 'AgentAssistantEntry',
    props: { anchored: Boolean, anchorRect: Object, pet: Object, active: Boolean },
    setup(_props, { expose }) {
      expose({ clearBubbles: vi.fn(), showAssistantReplyPreview: vi.fn() })
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

  it('passes renderer pets to the builtin entry instead of mounting a stage layer', async () => {
    mockPetBackend([createPet({ mode: 'renderer', bubbles: null })], { plugin_id: 'PetPlugin', key: 'girl' })

    const wrapper = mountWidget()
    await vi.waitFor(() => expect(wrapper.findComponent(entryStub).props('pet')).not.toBeNull())

    expect(wrapper.findComponent(entryStub).props('anchored')).toBe(false)
    expect(document.body.querySelector('[data-agent-pet-stage]')).toBeNull()
    wrapper.unmount()
  })
})
