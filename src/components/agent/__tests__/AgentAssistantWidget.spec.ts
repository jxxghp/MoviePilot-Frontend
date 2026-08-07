import { mount } from '@vue/test-utils'
import { defineComponent, h, nextTick, ref } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import AgentAssistantWidget from '@/components/agent/AgentAssistantWidget.vue'
import { AGENT_ASSISTANT_LAYER_Z_INDEX } from '@/constants/agentAssistant'

vi.mock('vuetify', () => ({
  useTheme: () => ({ themeClasses: ref('v-theme--test') }),
}))

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
