import { flushPromises, shallowMount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AgentAssistantPanel from '@/components/agent/AgentAssistantPanel.vue'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))

vi.mock('vuetify', () => ({
  useDisplay: () => ({ mdAndDown: { value: true } }),
}))

vi.mock('@/stores', () => ({
  useAuthStore: () => ({ token: null }),
  useUserStore: () => ({ getUserName: 'Tester' }),
}))

vi.mock('@/plugins/i18n', () => ({
  getCurrentLocale: () => 'zh-CN',
}))

interface MockServerSession {
  session_id: string
  client_session_id: string
  updated_at: string
  is_processing: boolean
  messages: Array<Record<string, unknown>>
}

const agentMarkdownContentStub = {
  props: ['content', 'variant'],
  template:
    "<div :class=\"variant === 'choice' ? 'agent-assistant-choice__prompt' : 'agent-assistant-message__bubble'\">{{ content }}</div>",
}

// 构造符合 Agent 标准响应包装的 fetch 返回值。
function createAgentResponse(data: unknown) {
  return {
    json: vi.fn().mockResolvedValue({ success: true, data }),
    ok: true,
  } as unknown as Response
}

describe('AgentAssistantPanel stream recovery', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('restores a legacy empty message to loading and waits for the final reply after a PWA reload', async () => {
    const startedAt = Date.now() - 5000
    const localSessionId = 'web-local-session'
    const serverSessionId = 'web-agent:server-session'
    const userMessage = {
      id: 'user-1',
      role: 'user',
      content: '检查后台任务',
      createdAt: startedAt - 100,
      status: 'done',
      attachments: [],
      choices: [],
      tools: [],
    }
    const assistantPlaceholder = {
      id: 'assistant-1',
      role: 'assistant',
      content: '',
      createdAt: startedAt,
      status: 'done',
      attachments: [],
      choices: [],
      tools: [],
    }
    const processingSession: MockServerSession = {
      session_id: serverSessionId,
      client_session_id: localSessionId,
      updated_at: new Date(startedAt + 1000).toISOString(),
      is_processing: true,
      messages: [userMessage],
    }
    const completedSession: MockServerSession = {
      ...processingSession,
      updated_at: new Date(startedAt + 2000).toISOString(),
      is_processing: false,
      messages: [
        userMessage,
        {
          ...assistantPlaceholder,
          content: '后台任务已经完成',
          createdAt: startedAt + 2000,
          status: 'done',
        },
      ],
    }
    const detailResponses = [processingSession, completedSession]
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes(`/sessions/${localSessionId}`)) {
        return createAgentResponse(detailResponses.shift() || completedSession)
      }

      return createAgentResponse([])
    })
    vi.stubGlobal('fetch', fetchMock)
    localStorage.setItem(
      'moviepilot-agent-assistant-state',
      JSON.stringify({
        sessionId: localSessionId,
        messages: [userMessage, assistantPlaceholder],
      }),
    )

    const wrapper = shallowMount(AgentAssistantPanel, {
      props: { modelValue: true },
      global: {
        stubs: {
          AgentMarkdownContent: agentMarkdownContentStub,
          IconBtn: { template: '<button><slot /></button>' },
          PerfectScrollbar: { template: '<div><slot /></div>' },
          VIcon: true,
        },
      },
    })

    await vi.advanceTimersByTimeAsync(0)
    await flushPromises()

    expect(wrapper.find('.agent-assistant-typing').exists()).toBe(true)
    expect(wrapper.text()).toContain('agentAssistant.thinking')
    expect(
      fetchMock.mock.calls.filter(([input]) => String(input).includes(`/sessions/${localSessionId}`)),
    ).toHaveLength(1)

    await vi.advanceTimersByTimeAsync(1200)
    await flushPromises()

    expect(wrapper.find('.agent-assistant-typing').exists()).toBe(false)
    expect(wrapper.text()).toContain('后台任务已经完成')
    expect(wrapper.text()).toContain('agentAssistant.ready')
    expect(JSON.parse(localStorage.getItem('moviepilot-agent-assistant-state') || '{}')).toMatchObject({
      sessionId: serverSessionId,
      streamRecovery: null,
    })

    wrapper.unmount()
  })

  it('persists an active stream in the background and restores it when the PWA becomes visible', async () => {
    let visibilityState: DocumentVisibilityState = 'visible'
    vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibilityState)
    const startedAt = Date.now()
    const localSessionId = 'web-local-active'
    const serverSessionId = 'web-agent:server-active'
    const userMessage = {
      id: 'user-active',
      role: 'user',
      content: '继续后台处理',
      createdAt: startedAt,
      status: 'done',
      attachments: [],
      choices: [],
      tools: [],
    }
    const completedSession: MockServerSession = {
      session_id: serverSessionId,
      client_session_id: localSessionId,
      updated_at: new Date(startedAt + 2000).toISOString(),
      is_processing: false,
      messages: [
        userMessage,
        {
          id: 'assistant-active',
          role: 'assistant',
          content: '前后台恢复成功',
          createdAt: startedAt + 2000,
          status: 'done',
          attachments: [],
          choices: [],
          tools: [],
        },
      ],
    }
    const encoder = new TextEncoder()
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith('/message/agent/stream')) {
        const body = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: 'start', session_id: serverSessionId })}\n\n`),
            )
            init?.signal?.addEventListener('abort', () => {
              controller.error(new DOMException('Aborted', 'AbortError'))
            })
          },
        })

        return new Response(body, { status: 200 })
      }
      if (url.includes(`/sessions/${encodeURIComponent(serverSessionId)}`)) return createAgentResponse(completedSession)

      return createAgentResponse([])
    })
    vi.stubGlobal('fetch', fetchMock)

    const wrapper = shallowMount(AgentAssistantPanel, {
      props: { modelValue: true },
      global: {
        stubs: {
          AgentMarkdownContent: agentMarkdownContentStub,
          IconBtn: { template: '<button><slot /></button>' },
          PerfectScrollbar: { template: '<div><slot /></div>' },
          VIcon: true,
        },
      },
    })
    const textarea = wrapper.find('textarea')
    await textarea.setValue('继续后台处理')
    await textarea.trigger('keydown', { key: 'Enter' })
    await flushPromises()

    expect(wrapper.find('.agent-assistant-typing').exists()).toBe(true)
    visibilityState = 'hidden'
    document.dispatchEvent(new Event('visibilitychange'))
    await flushPromises()

    expect(JSON.parse(localStorage.getItem('moviepilot-agent-assistant-state') || '{}')).toMatchObject({
      sessionId: serverSessionId,
      streamRecovery: {
        sessionId: serverSessionId,
      },
    })

    visibilityState = 'visible'
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.advanceTimersByTimeAsync(0)
    await flushPromises()

    expect(wrapper.find('.agent-assistant-typing').exists()).toBe(false)
    expect(wrapper.text()).toContain('前后台恢复成功')
    expect(wrapper.text()).toContain('agentAssistant.ready')

    wrapper.unmount()
  })

  it('does not send when Enter confirms an IME composition', async () => {
    const fetchMock = vi.fn(async () => createAgentResponse([]))
    vi.stubGlobal('fetch', fetchMock)

    const wrapper = shallowMount(AgentAssistantPanel, {
      props: { modelValue: true },
      global: {
        stubs: {
          AgentMarkdownContent: agentMarkdownContentStub,
          IconBtn: { template: '<button><slot /></button>' },
          PerfectScrollbar: { template: '<div><slot /></div>' },
          VIcon: true,
        },
      },
    })
    const textarea = wrapper.find('textarea')
    await flushPromises()
    fetchMock.mockClear()
    await textarea.setValue('搜索电影')
    await textarea.trigger('compositionstart')
    await textarea.trigger('keydown', { key: 'Enter', isComposing: true })
    await textarea.trigger('compositionend')
    await flushPromises()

    expect(fetchMock).not.toHaveBeenCalled()

    await textarea.trigger('keydown', { key: 'Enter' })
    await flushPromises()
    expect(fetchMock).toHaveBeenCalled()

    wrapper.unmount()
  })

  it('renders interleaved assistant text and tool events in their SSE order', async () => {
    const serverSessionId = 'web-agent:ordered-segments'
    const streamEvents = [
      { type: 'start', session_id: serverSessionId },
      { type: 'delta', content: '先检查服务器。' },
      { type: 'tool', message: '（执行了 1 条命令）' },
      { type: 'delta', content: '检查完成，没有发现错误。' },
      { type: 'done' },
    ]
    const streamBody = streamEvents.map(event => `data: ${JSON.stringify(event)}\n\n`).join('')
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith('/message/agent/stream') && init?.method === 'POST') {
        return new Response(streamBody, {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        })
      }

      return createAgentResponse([])
    })
    vi.stubGlobal('fetch', fetchMock)

    const wrapper = shallowMount(AgentAssistantPanel, {
      props: { modelValue: true },
      global: {
        stubs: {
          AgentMarkdownContent: agentMarkdownContentStub,
          IconBtn: { template: '<button><slot /></button>' },
          PerfectScrollbar: { template: '<div><slot /></div>' },
          VIcon: true,
        },
      },
    })
    const textarea = wrapper.find('textarea')
    await textarea.setValue('检查服务器')
    await textarea.trigger('keydown', { key: 'Enter' })
    await flushPromises()

    const renderedSegments = wrapper.findAll('.agent-assistant-segments > *')
    expect(renderedSegments).toHaveLength(3)
    expect(renderedSegments[0].classes()).toContain('agent-assistant-message__bubble')
    expect(renderedSegments[0].text()).toContain('先检查服务器。')
    expect(renderedSegments[1].classes()).toContain('agent-assistant-tool')
    expect(renderedSegments[1].text()).toContain('执行了 1 条命令')
    expect(renderedSegments[2].classes()).toContain('agent-assistant-message__bubble')
    expect(renderedSegments[2].text()).toContain('检查完成，没有发现错误。')

    const saveCall = fetchMock.mock.calls.find(([input]) => String(input).includes('/display'))
    const savedMessages = JSON.parse(String(saveCall?.[1]?.body || '{}')).messages as Array<Record<string, unknown>>
    expect(savedMessages.at(-1)).toMatchObject({
      content: '先检查服务器。检查完成，没有发现错误。',
      segments: [
        { type: 'text', content: '先检查服务器。' },
        { type: 'tool', toolIndex: 0 },
        { type: 'text', content: '检查完成，没有发现错误。' },
      ],
    })

    wrapper.unmount()
  })

  it('does not render an empty text bubble for trailing whitespace after a tool summary', async () => {
    const streamEvents = [
      { type: 'start', session_id: 'web-agent:trailing-whitespace' },
      { type: 'delta', content: '最终结论' },
      { type: 'tool', message: '（查询了 1 次数据）' },
      { type: 'delta', content: '\n\n' },
      { type: 'done' },
    ]
    const streamBody = streamEvents.map(event => `data: ${JSON.stringify(event)}\n\n`).join('')
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input).endsWith('/message/agent/stream') && init?.method === 'POST') {
          return new Response(streamBody, {
            status: 200,
            headers: { 'Content-Type': 'text/event-stream' },
          })
        }
        return createAgentResponse([])
      }),
    )

    const wrapper = shallowMount(AgentAssistantPanel, {
      props: { modelValue: true },
      global: {
        stubs: {
          AgentMarkdownContent: agentMarkdownContentStub,
          IconBtn: { template: '<button><slot /></button>' },
          PerfectScrollbar: { template: '<div><slot /></div>' },
          VIcon: true,
        },
      },
    })
    await wrapper.find('textarea').setValue('检查配置')
    await wrapper.find('textarea').trigger('keydown', { key: 'Enter' })
    await flushPromises()

    const renderedSegments = wrapper.findAll('.agent-assistant-segments > *')
    expect(renderedSegments).toHaveLength(2)
    expect(renderedSegments[0].classes()).toContain('agent-assistant-message__bubble')
    expect(renderedSegments[0].text()).toBe('最终结论')
    expect(renderedSegments[1].classes()).toContain('agent-assistant-tool')

    wrapper.unmount()
  })

  it('aggregates adjacent non-verbose tools and starts a new group after text', async () => {
    const streamEvents = [
      { type: 'start', session_id: 'web-agent:tool-groups' },
      { type: 'tool', message: '（查询了 1 次数据）' },
      { type: 'tool', message: '（查看了 1 个目录）' },
      { type: 'tool', message: '（查询了 1 次数据）' },
      { type: 'delta', content: '继续分析。' },
      { type: 'tool', message: '（读取了 1 个文件）' },
      { type: 'tool', message: '（读取了 1 个文件）' },
      { type: 'done' },
    ]
    const streamBody = streamEvents.map(event => `data: ${JSON.stringify(event)}\n\n`).join('')
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input).endsWith('/message/agent/stream') && init?.method === 'POST') {
          return new Response(streamBody, {
            status: 200,
            headers: { 'Content-Type': 'text/event-stream' },
          })
        }
        return createAgentResponse([])
      }),
    )

    const wrapper = shallowMount(AgentAssistantPanel, {
      props: { modelValue: true },
      global: {
        stubs: {
          AgentMarkdownContent: agentMarkdownContentStub,
          IconBtn: { template: '<button><slot /></button>' },
          PerfectScrollbar: { template: '<div><slot /></div>' },
          VIcon: true,
        },
      },
    })
    await wrapper.find('textarea').setValue('分析插件')
    await wrapper.find('textarea').trigger('keydown', { key: 'Enter' })
    await flushPromises()

    const renderedSegments = wrapper.findAll('.agent-assistant-segments > *')
    expect(renderedSegments).toHaveLength(3)
    expect(renderedSegments[0].text()).toContain('查询了 2 次数据，查看了 1 个目录')
    expect(renderedSegments[1].classes()).toContain('agent-assistant-message__bubble')
    expect(renderedSegments[1].text()).toBe('继续分析。')
    expect(renderedSegments[2].text()).toContain('读取了 2 个文件')

    wrapper.unmount()
  })

  it('coalesces consecutive text deltas into one UI update before a terminal event', async () => {
    const streamEvents = [
      { type: 'start', session_id: 'web-agent:coalesced' },
      ...Array.from({ length: 100 }, (_item, index) => ({ type: 'delta', content: String(index % 10) })),
      { type: 'done' },
    ]
    const streamBody = streamEvents.map(event => `data: ${JSON.stringify(event)}\n\n`).join('')
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input).endsWith('/message/agent/stream') && init?.method === 'POST') {
          return new Response(streamBody, {
            status: 200,
            headers: { 'Content-Type': 'text/event-stream' },
          })
        }
        return createAgentResponse([])
      }),
    )

    const wrapper = shallowMount(AgentAssistantPanel, {
      props: { modelValue: true },
      global: {
        stubs: {
          AgentMarkdownContent: agentMarkdownContentStub,
          IconBtn: { template: '<button><slot /></button>' },
          PerfectScrollbar: { template: '<div><slot /></div>' },
          VIcon: true,
        },
      },
    })
    await wrapper.find('textarea').setValue('测试突发事件')
    await wrapper.find('textarea').trigger('keydown', { key: 'Enter' })
    await flushPromises()

    expect(wrapper.emitted('assistant-preview')).toHaveLength(1)
    expect(wrapper.find('.agent-assistant-message--assistant .agent-assistant-message__bubble').text()).toBe(
      Array.from({ length: 100 }, (_item, index) => String(index % 10)).join(''),
    )

    wrapper.unmount()
  })
})
