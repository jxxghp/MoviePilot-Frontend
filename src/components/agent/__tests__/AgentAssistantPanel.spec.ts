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
})
