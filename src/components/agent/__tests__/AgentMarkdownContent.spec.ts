import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AgentMarkdownContent from '@/components/agent/AgentMarkdownContent.vue'

describe('AgentMarkdownContent', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('throttles streaming Markdown and renders the final content immediately', async () => {
    const wrapper = mount(AgentMarkdownContent, {
      props: { content: '**开始**', streaming: true },
    })

    expect(wrapper.html()).toContain('<strong>开始</strong>')
    await wrapper.setProps({ content: '**开始继续**' })
    expect(wrapper.html()).not.toContain('<strong>开始继续</strong>')

    await vi.advanceTimersByTimeAsync(96)
    expect(wrapper.html()).toContain('<strong>开始继续</strong>')

    await wrapper.setProps({ content: '**最终结果**', streaming: false })
    expect(wrapper.html()).toContain('<strong>最终结果</strong>')
  })

  it('escapes raw HTML from Agent output', () => {
    const wrapper = mount(AgentMarkdownContent, {
      props: { content: '<img src=x onerror="alert(1)">' },
    })

    expect(wrapper.html()).not.toContain('<img')
    expect(wrapper.text()).toContain('<img src=x onerror=')
  })

  it('does not render a bubble for whitespace-only Markdown', () => {
    const wrapper = mount(AgentMarkdownContent, {
      props: { content: '\n\n' },
    })

    expect(wrapper.find('.agent-assistant-message__bubble').exists()).toBe(false)
  })
})
