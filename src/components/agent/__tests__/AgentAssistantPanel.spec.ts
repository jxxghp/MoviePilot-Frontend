import { flushPromises, shallowMount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AgentAssistantPanel from '@/components/agent/AgentAssistantPanel.vue'

const displayState = vi.hoisted(() => ({ mdAndDown: { value: true } }))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))

vi.mock('vuetify', () => ({
  useDisplay: () => displayState,
}))

vi.mock('@/stores', () => ({
  useAuthStore: () => ({ token: null }),
  useUserStore: () => ({ getUserName: 'Tester' }),
}))

vi.mock('@/plugins/i18n', () => ({
  getCurrentLocale: () => 'zh-CN',
}))

vi.mock('@/api', () => {
  /** 与生产客户端一致，只接受 success/message/data 三个顶层字段。 */
  function isApiResponse(payload: unknown) {
    const keys = payload && typeof payload === 'object' && !Array.isArray(payload) ? Object.keys(payload) : []
    return (
      keys.length === 3 &&
      keys.every(key => key === 'success' || key === 'message' || key === 'data') &&
      typeof (payload as { success?: unknown }).success === 'boolean' &&
      typeof (payload as { message?: unknown }).message === 'string' &&
      Object.hasOwn(payload as object, 'data')
    )
  }

  /** 让组件单测继续通过 fetch 控制网络，同时模拟生产 DataApiClient 的严格解包语义。 */
  async function request(path: string, init: RequestInit = {}) {
    const response = await fetch(`/api/v1/${path}`, init)
    const payload = await response.json()

    if (!isApiResponse(payload)) throw new Error('Invalid API response envelope')
    if (!response.ok || !payload.success) throw new Error(payload.message || 'API request failed')
    return payload.data
  }

  return {
    default: {
      delete: (path: string) => request(path, { method: 'DELETE' }),
      get: (path: string) => request(path),
      post: (path: string, data?: unknown) =>
        request(path, {
          method: 'POST',
          body: data instanceof FormData ? data : data === undefined ? undefined : JSON.stringify(data),
        }),
      put: (path: string, data?: unknown) =>
        request(path, {
          method: 'PUT',
          body: data === undefined ? undefined : JSON.stringify(data),
        }),
    },
    isApiResponse,
  }
})

interface MockServerSession {
  session_id: string
  client_session_id: string
  updated_at: string
  is_processing: boolean
  messages: Array<Record<string, unknown>>
}

interface SyntheticSseFrame {
  eventName?: string
  data: unknown
}

const agentMarkdownContentStub = {
  props: ['content', 'variant'],
  template:
    "<div :class=\"variant === 'choice' ? 'agent-assistant-choice__prompt' : 'agent-assistant-message__bubble'\">{{ content }}</div>",
}

// 构造符合 Agent 标准响应包装的 fetch 返回值。
function createAgentResponse(data: unknown) {
  return {
    json: vi.fn().mockResolvedValue({ success: true, message: '', data }),
    ok: true,
  } as unknown as Response
}

// 构造业务失败或协议异常响应。
function createAgentEnvelopeResponse(payload: Record<string, unknown>, ok = true) {
  return {
    json: vi.fn().mockResolvedValue(payload),
    ok,
  } as unknown as Response
}

function legacySseFrame(data: Record<string, unknown>): SyntheticSseFrame {
  return { data }
}

function protectedSseFrame(data: Record<string, unknown>): SyntheticSseFrame {
  return { eventName: 'interaction-protected', data }
}

function createAgentStreamResponse(frames: SyntheticSseFrame[], headers: Record<string, string> = {}) {
  const body = frames
    .map(frame => `${frame.eventName ? `event: ${frame.eventName}\n` : ''}data: ${JSON.stringify(frame.data)}\n\n`)
    .join('')

  return new Response(body, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream', ...headers },
  })
}

function createRawAgentStreamResponse(body: string) {
  return new Response(body, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
  })
}

function createControllableAgentStream() {
  const encoder = new TextEncoder()
  let streamController: ReadableStreamDefaultController<Uint8Array>
  const response = new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        streamController = controller
      },
    }),
    { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
  )

  return {
    response,
    emit(frame: SyntheticSseFrame) {
      const block = `${frame.eventName ? `event: ${frame.eventName}\n` : ''}data: ${JSON.stringify(frame.data)}\n\n`
      streamController.enqueue(encoder.encode(block))
    },
    close() {
      streamController.close()
    },
    fail(error: Error) {
      streamController.error(error)
    },
  }
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>(resolvePromise => {
    resolve = resolvePromise
  })

  return { promise, resolve }
}

const slotContainerStub = { template: '<div><slot /></div>' }
const menuStub = defineComponent({
  setup(_props, { slots }) {
    return () => h('div', [slots.activator?.({ props: {} }), slots.default?.()])
  },
})
const virtualScrollStub = defineComponent({
  props: { items: { type: Array, default: () => [] } },
  setup(props, { slots }) {
    return () =>
      h(
        'div',
        props.items.map(item => slots.default?.({ item, itemRef: () => undefined })),
      )
  },
})

function mountPanel() {
  return shallowMount(AgentAssistantPanel, {
    props: { modelValue: true },
    global: {
      stubs: {
        AgentMarkdownContent: agentMarkdownContentStub,
        IconBtn: { template: '<button><slot /></button>' },
        PerfectScrollbar: { template: '<div><slot /></div>' },
        VCard: slotContainerStub,
        VInfiniteScroll: slotContainerStub,
        VIcon: true,
        VMenu: menuStub,
        VVirtualScroll: virtualScrollStub,
      },
    },
  })
}

describe('AgentAssistantPanel stream recovery', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    localStorage.clear()
  })

  afterEach(() => {
    displayState.mdAndDown.value = true
    vi.useRealTimers()
  })

  it('exposes unique semantic controls for file attachments and messages', () => {
    const wrapper = mountPanel()
    const fileInput = wrapper.get('input[type="file"]')
    const messageInput = wrapper.get('textarea')
    const attachButton = wrapper.get('.agent-assistant-attach')

    expect(fileInput.attributes('id')).toMatch(/^agent-assistant-file-input-/)
    expect(fileInput.attributes('name')).toBe('attachments')
    expect(messageInput.attributes('id')).toMatch(/^agent-assistant-message-input-/)
    expect(messageInput.attributes('name')).toBe('message')
    expect(fileInput.attributes('id')).not.toBe(messageInput.attributes('id'))
    expect(attachButton.attributes('aria-controls')).toBe(fileInput.attributes('id'))

    wrapper.unmount()
  })

  it('toggles the desktop assistant between the side panel and fullscreen modes', async () => {
    displayState.mdAndDown.value = false
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => createAgentResponse([])),
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
    await flushPromises()

    const panel = wrapper.get('.agent-assistant-panel')
    const fullscreenToggle = wrapper.get('.agent-assistant-fullscreen-toggle')
    expect(panel.classes()).not.toContain('is-fullscreen')
    expect(panel.attributes('style')).toContain('--agent-assistant-panel-width: 30rem')
    expect(fullscreenToggle.attributes('title')).toBe('agentAssistant.enterFullscreen')
    expect(fullscreenToggle.attributes('aria-pressed')).toBe('false')

    await fullscreenToggle.trigger('click')

    expect(panel.classes()).toContain('is-fullscreen')
    expect(panel.attributes('style')).toContain('--agent-assistant-panel-width: 100vw')
    expect(fullscreenToggle.attributes('title')).toBe('agentAssistant.exitFullscreen')
    expect(fullscreenToggle.attributes('aria-pressed')).toBe('true')

    await fullscreenToggle.trigger('click')

    expect(panel.classes()).not.toContain('is-fullscreen')
    expect(panel.attributes('style')).toContain('--agent-assistant-panel-width: 30rem')

    wrapper.unmount()
  })

  it('keeps the narrow assistant fullscreen without a redundant toggle', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => createAgentResponse([])),
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
    await flushPromises()

    expect(wrapper.get('.agent-assistant-panel').attributes('style')).toContain('--agent-assistant-panel-width: 100vw')
    expect(wrapper.find('.agent-assistant-fullscreen-toggle').exists()).toBe(false)

    wrapper.unmount()
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

  it('renders protected delivery only as transient literal text and advertises the stream capability', async () => {
    const protectedMarker = 'MP-PROTECTED-MARKER **not bold** <script>literal</script>'
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith('/message/agent/stream') && init?.method === 'POST') {
        return createAgentStreamResponse([
          legacySseFrame({ type: 'start', session_id: 'web-agent:protected' }),
          legacySseFrame({ type: 'delta', content: '普通回复' }),
          protectedSseFrame({ content: protectedMarker }),
          legacySseFrame({ type: 'tool', message: '（查询了 1 次数据）' }),
          legacySseFrame({ type: 'done' }),
        ])
      }

      return createAgentResponse([])
    })
    vi.stubGlobal('fetch', fetchMock)

    const wrapper = mountPanel()
    await wrapper.find('textarea').setValue('读取受保护结果')
    await wrapper.find('textarea').trigger('keydown', { key: 'Enter' })
    await flushPromises()

    const protectedNode = wrapper.get('.agent-assistant-protected-delivery')
    expect(protectedNode.text()).toBe(protectedMarker)
    expect(protectedNode.find('script').exists()).toBe(false)
    const assistantBubble = wrapper.get('.agent-assistant-message--assistant .agent-assistant-message__bubble')
    expect(assistantBubble.text()).not.toContain(protectedMarker)
    expect(assistantBubble.text()).toContain('普通回复')

    const streamCall = fetchMock.mock.calls.find(([input]) => String(input).endsWith('/message/agent/stream'))
    const streamHeaders = new Headers(streamCall?.[1]?.headers)
    expect(streamHeaders.get('X-MoviePilot-Agent-Interaction')).toBe('1')

    const displayCalls = fetchMock.mock.calls.filter(([input]) => String(input).includes('/display'))
    expect(displayCalls.length).toBeGreaterThan(0)
    displayCalls.forEach(([, init]) => {
      expect(new Headers(init?.headers).has('X-MoviePilot-Agent-Interaction')).toBe(false)
      expect(String(init?.body)).not.toContain(protectedMarker)
    })
    expect(localStorage.getItem('moviepilot-agent-assistant-state')).not.toContain(protectedMarker)
    expect(localStorage.getItem('moviepilot-agent-assistant-history')).not.toContain(protectedMarker)
    expect(JSON.stringify(wrapper.emitted('assistant-preview') || [])).not.toContain(protectedMarker)

    wrapper.unmount()
  })

  it('ignores empty data heartbeats without interrupting ordinary stream events', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input).endsWith('/message/agent/stream') && init?.method === 'POST') {
          return createRawAgentStreamResponse(
            [
              'data:',
              '',
              'data:   ',
              '',
              'data',
              '',
              'data: {"type":"delta","content":"心跳后的普通回复"}',
              '',
              'data: {"type":"done"}',
              '',
            ].join('\r\n'),
          )
        }

        return createAgentResponse([])
      }),
    )

    const wrapper = mountPanel()
    await wrapper.find('textarea').setValue('测试空数据心跳')
    await wrapper.find('textarea').trigger('keydown', { key: 'Enter' })
    await flushPromises()

    expect(wrapper.get('.agent-assistant-message--assistant').text()).toContain('心跳后的普通回复')
    expect(wrapper.find('.agent-assistant-message--error').exists()).toBe(false)

    wrapper.unmount()
  })

  it('ignores unknown and mismatched named protocols before the ordinary event queue', async () => {
    const rejectedMarker = 'MP-REJECTED-NAMED-EVENT'
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).endsWith('/message/agent/stream') && init?.method === 'POST') {
        return createRawAgentStreamResponse(
          [
            'event: ping',
            'data: keepalive',
            '',
            'event: interaction',
            `data: {"type":"interaction","content":"${rejectedMarker}"}`,
            '',
            'event: delta',
            `data: {"type":"tool","message":"${rejectedMarker}"}`,
            '',
            'event: message',
            `data: {"type":"future_event","content":"${rejectedMarker}"}`,
            '',
            'event: delta',
            'data: {"type":"delta","content":"未知协议后的普通回复"}',
            '',
            'event: done',
            'data: {"type":"done"}',
            '',
          ].join('\n'),
        )
      }

      return createAgentResponse([])
    })
    vi.stubGlobal('fetch', fetchMock)

    const wrapper = mountPanel()
    await wrapper.find('textarea').setValue('测试未知具名协议')
    await wrapper.find('textarea').trigger('keydown', { key: 'Enter' })
    await flushPromises()

    expect(wrapper.get('.agent-assistant-message--assistant').text()).toContain('未知协议后的普通回复')
    expect(wrapper.text()).not.toContain(rejectedMarker)
    expect(wrapper.find('.agent-assistant-message--error').exists()).toBe(false)
    expect(localStorage.getItem('moviepilot-agent-assistant-state')).not.toContain(rejectedMarker)
    expect(localStorage.getItem('moviepilot-agent-assistant-history')).not.toContain(rejectedMarker)
    expect(JSON.stringify(wrapper.emitted('assistant-preview') || [])).not.toContain(rejectedMarker)
    fetchMock.mock.calls
      .filter(([input]) => String(input).includes('/display'))
      .forEach(([, init]) => expect(String(init?.body)).not.toContain(rejectedMarker))

    wrapper.unmount()
  })

  it('ignores null and non-object JSON frames without interrupting ordinary stream events', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input).endsWith('/message/agent/stream') && init?.method === 'POST') {
          return createRawAgentStreamResponse(
            [
              'data: null',
              '',
              'data: 42',
              '',
              'data: "heartbeat"',
              '',
              'data: []',
              '',
              'data: {"type":"delta","content":"空值帧后的普通回复"}',
              '',
              'data: {"type":"done"}',
              '',
            ].join('\n'),
          )
        }

        return createAgentResponse([])
      }),
    )

    const wrapper = mountPanel()
    await wrapper.find('textarea').setValue('测试 JSON 空值帧')
    await wrapper.find('textarea').trigger('keydown', { key: 'Enter' })
    await flushPromises()

    expect(wrapper.get('.agent-assistant-message--assistant').text()).toContain('空值帧后的普通回复')
    expect(wrapper.find('.agent-assistant-message--error').exists()).toBe(false)

    wrapper.unmount()
  })

  it('keeps consuming ordinary JSON frames with explicit SSE event names', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input).endsWith('/message/agent/stream') && init?.method === 'POST') {
          return createAgentStreamResponse([
            { eventName: 'message', data: { type: 'start', session_id: 'web-agent:named-events' } },
            { eventName: 'delta', data: { type: 'delta', content: '具名普通回复' } },
            { eventName: 'done', data: { type: 'done' } },
          ])
        }

        return createAgentResponse([])
      }),
    )

    const wrapper = mountPanel()
    await wrapper.find('textarea').setValue('测试普通具名事件')
    await wrapper.find('textarea').trigger('keydown', { key: 'Enter' })
    await flushPromises()

    expect(wrapper.get('.agent-assistant-message--assistant').text()).toContain('具名普通回复')
    const persistedState = JSON.parse(localStorage.getItem('moviepilot-agent-assistant-state') || '{}')
    expect(persistedState.streamRecovery).toBeNull()

    wrapper.unmount()
  })

  it('accepts only string content from the named protected event', async () => {
    const acceptedMarker = 'MP-ACCEPTED-PROTECTED-MARKER'
    const rejectedMarker = 'MP-REJECTED-PROTECTED-MARKER'
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input).endsWith('/message/agent/stream') && init?.method === 'POST') {
          return createAgentStreamResponse([
            legacySseFrame({ type: 'start', session_id: 'web-agent:protected-validation' }),
            protectedSseFrame({ content: 42 }),
            { eventName: 'interaction', data: { content: rejectedMarker } },
            legacySseFrame({ type: 'protected_delivery', delivery_id: 'legacy-shape', content: rejectedMarker }),
            protectedSseFrame({ content: acceptedMarker }),
            legacySseFrame({ type: 'done' }),
          ])
        }

        return createAgentResponse([])
      }),
    )

    const wrapper = mountPanel()
    await wrapper.find('textarea').setValue('读取一次性结果')
    await wrapper.find('textarea').trigger('keydown', { key: 'Enter' })
    await flushPromises()

    const protectedNodes = wrapper.findAll('.agent-assistant-protected-delivery')
    expect(protectedNodes).toHaveLength(1)
    expect(protectedNodes[0].text()).toBe(acceptedMarker)
    expect(wrapper.text()).not.toContain(rejectedMarker)
    expect(wrapper.find('.agent-assistant-message--assistant').exists()).toBe(false)

    wrapper.unmount()
  })

  it('clears protected delivery on close and rejects a late frame from the old stream after reopen', async () => {
    const protectedMarker = 'MP-LATE-PROTECTED-MARKER'
    const stream = createControllableAgentStream()
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input).endsWith('/message/agent/stream') && init?.method === 'POST') return stream.response
        return createAgentResponse([])
      }),
    )

    const wrapper = mountPanel()
    await wrapper.find('textarea').setValue('读取晚到结果')
    await wrapper.find('textarea').trigger('keydown', { key: 'Enter' })
    await flushPromises()

    stream.emit(legacySseFrame({ type: 'start', session_id: 'web-agent:late-protected' }))
    stream.emit(protectedSseFrame({ content: protectedMarker }))
    await flushPromises()
    expect(wrapper.text()).toContain(protectedMarker)

    await wrapper.setProps({ modelValue: false })
    expect(wrapper.text()).not.toContain(protectedMarker)

    stream.emit(protectedSseFrame({ content: protectedMarker }))
    await wrapper.setProps({ modelValue: true })
    await flushPromises()
    expect(wrapper.text()).not.toContain(protectedMarker)

    stream.close()
    await flushPromises()
    expect(JSON.stringify(localStorage)).not.toContain(protectedMarker)
    wrapper.unmount()
  })

  it('clears protected delivery when the stream ends without a terminal event and enters recovery', async () => {
    const protectedMarker = 'MP-EOF-PROTECTED-MARKER'
    const stream = createControllableAgentStream()
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).endsWith('/message/agent/stream') && init?.method === 'POST') return stream.response
      return createAgentResponse([])
    })
    vi.stubGlobal('fetch', fetchMock)

    const wrapper = mountPanel()
    await wrapper.find('textarea').setValue('读取后模拟断流')
    await wrapper.find('textarea').trigger('keydown', { key: 'Enter' })
    await flushPromises()

    stream.emit(protectedSseFrame({ content: protectedMarker }))
    await flushPromises()
    expect(wrapper.text()).toContain(protectedMarker)

    stream.close()
    await flushPromises()

    const persistedState = JSON.parse(localStorage.getItem('moviepilot-agent-assistant-state') || '{}')
    expect(wrapper.text()).not.toContain(protectedMarker)
    expect(persistedState.streamRecovery).toMatchObject({ attempts: 0 })
    expect(JSON.stringify(persistedState)).not.toContain(protectedMarker)
    expect(localStorage.getItem('moviepilot-agent-assistant-history')).not.toContain(protectedMarker)
    expect(JSON.stringify(wrapper.emitted('assistant-preview') || [])).not.toContain(protectedMarker)
    fetchMock.mock.calls
      .filter(([input]) => String(input).includes('/display'))
      .forEach(([, init]) => expect(String(init?.body)).not.toContain(protectedMarker))

    wrapper.unmount()
  })

  it('clears protected delivery on a recoverable stream error while preserving ordinary recovery state', async () => {
    const protectedMarker = 'MP-NETWORK-PROTECTED-MARKER'
    const stream = createControllableAgentStream()
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).endsWith('/message/agent/stream') && init?.method === 'POST') return stream.response
      return createAgentResponse([])
    })
    vi.stubGlobal('fetch', fetchMock)

    const wrapper = mountPanel()
    await wrapper.find('textarea').setValue('读取后模拟网络断开')
    await wrapper.find('textarea').trigger('keydown', { key: 'Enter' })
    await flushPromises()

    stream.emit(protectedSseFrame({ content: protectedMarker }))
    await flushPromises()
    expect(wrapper.text()).toContain(protectedMarker)

    stream.fail(new TypeError('Failed to fetch'))
    await flushPromises()

    const persistedState = JSON.parse(localStorage.getItem('moviepilot-agent-assistant-state') || '{}')
    expect(wrapper.text()).not.toContain(protectedMarker)
    expect(persistedState.streamRecovery).toMatchObject({ attempts: 0 })
    expect(persistedState.messages.at(-1)).toMatchObject({ role: 'assistant', status: 'streaming' })
    expect(JSON.stringify(persistedState)).not.toContain(protectedMarker)
    expect(localStorage.getItem('moviepilot-agent-assistant-history')).not.toContain(protectedMarker)
    expect(JSON.stringify(wrapper.emitted('assistant-preview') || [])).not.toContain(protectedMarker)
    fetchMock.mock.calls
      .filter(([input]) => String(input).includes('/display'))
      .forEach(([, init]) => expect(String(init?.body)).not.toContain(protectedMarker))

    wrapper.unmount()
  })

  it('clears protected delivery for a new session and never restores it after remount', async () => {
    const protectedMarker = 'MP-SESSION-PROTECTED-MARKER'
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).endsWith('/message/agent/stream') && init?.method === 'POST') {
        return createAgentStreamResponse([
          protectedSseFrame({ content: protectedMarker }),
          legacySseFrame({ type: 'done' }),
        ])
      }
      return createAgentResponse([])
    })
    vi.stubGlobal('fetch', fetchMock)

    const wrapper = mountPanel()
    await wrapper.find('textarea').setValue('读取会话结果')
    await wrapper.find('textarea').trigger('keydown', { key: 'Enter' })
    await flushPromises()
    expect(wrapper.text()).toContain(protectedMarker)

    await wrapper.get('[title="agentAssistant.newChat"]').trigger('click')
    expect(wrapper.text()).not.toContain(protectedMarker)

    wrapper.unmount()
    const remounted = mountPanel()
    await flushPromises()
    expect(remounted.text()).not.toContain(protectedMarker)
    expect(localStorage.getItem('moviepilot-agent-assistant-state')).not.toContain(protectedMarker)
    expect(localStorage.getItem('moviepilot-agent-assistant-history')).not.toContain(protectedMarker)
    fetchMock.mock.calls
      .filter(([input]) => String(input).includes('/display'))
      .forEach(([, init]) => expect(String(init?.body)).not.toContain(protectedMarker))
    remounted.unmount()
  })

  it('clears protected delivery before loading another history session', async () => {
    const protectedMarker = 'MP-HISTORY-PROTECTED-MARKER'
    const historySessionId = 'web-agent:history-target'
    const historyMessage = {
      id: 'history-user',
      role: 'user',
      content: '历史会话内容',
      createdAt: Date.now() - 1000,
      status: 'done',
      attachments: [],
      choices: [],
      tools: [],
    }
    const serverSession = {
      session_id: historySessionId,
      client_session_id: 'history-target',
      title: '历史会话',
      updated_at: new Date().toISOString(),
      is_processing: false,
      messages: [historyMessage],
    }
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith('/message/agent/stream') && init?.method === 'POST') {
        return createAgentStreamResponse([
          protectedSseFrame({ content: protectedMarker }),
          legacySseFrame({ type: 'done' }),
        ])
      }
      if (url.includes(`/sessions/${encodeURIComponent(historySessionId)}`)) return createAgentResponse(serverSession)
      if (url.includes('/message/agent/sessions?')) return createAgentResponse([serverSession])
      return createAgentResponse([])
    })
    vi.stubGlobal('fetch', fetchMock)

    const wrapper = mountPanel()
    await flushPromises()
    await wrapper.find('textarea').setValue('读取后切换历史')
    await wrapper.find('textarea').trigger('keydown', { key: 'Enter' })
    await flushPromises()
    expect(wrapper.text()).toContain(protectedMarker)

    await wrapper.get('.agent-assistant-history-item').trigger('click')
    await flushPromises()
    expect(wrapper.text()).not.toContain(protectedMarker)
    expect(wrapper.text()).toContain('历史会话内容')
    wrapper.unmount()
  })

  it('keeps exact confirmation controls out of Web history while preserving the backend response', async () => {
    const controlText = '确认'
    const backendFeedback = '确认无效或已过期'
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).endsWith('/message/agent/stream') && init?.method === 'POST') {
        return createAgentStreamResponse(
          [
            legacySseFrame({ type: 'start', session_id: 'web-agent:control' }),
            legacySseFrame({ type: 'delta', content: backendFeedback }),
            legacySseFrame({ type: 'done' }),
          ],
          { 'X-MoviePilot-Agent-Control': 'secret-confirmation' },
        )
      }

      return createAgentResponse([])
    })
    vi.stubGlobal('fetch', fetchMock)

    const wrapper = mountPanel()
    await wrapper.find('textarea').setValue(controlText)
    await wrapper.find('textarea').trigger('keydown', { key: 'Enter' })
    await flushPromises()

    const streamCall = fetchMock.mock.calls.find(([input]) => String(input).endsWith('/message/agent/stream'))
    const streamBody = JSON.parse(String(streamCall?.[1]?.body || '{}'))
    expect(streamBody).toMatchObject({ text: controlText, display_text: controlText, echo_user: true })
    expect(wrapper.text()).toContain(backendFeedback)
    expect(wrapper.find('.agent-assistant-message--user').exists()).toBe(false)
    const localState = JSON.parse(localStorage.getItem('moviepilot-agent-assistant-state') || '{}')
    const localHistory = JSON.parse(localStorage.getItem('moviepilot-agent-assistant-history') || '[]')
    expect(localState.messages || []).not.toContainEqual(
      expect.objectContaining({ role: 'user', content: controlText }),
    )
    expect(localHistory).not.toContainEqual(expect.objectContaining({ role: 'user', content: controlText }))
    fetchMock.mock.calls
      .filter(([input]) => String(input).includes('/display'))
      .forEach(([, init]) => {
        const displayBody = JSON.parse(String(init?.body || '{}'))
        expect(displayBody.messages || []).not.toContainEqual(
          expect.objectContaining({ role: 'user', content: controlText }),
        )
      })

    wrapper.unmount()
  })

  it('does not commit confirmation controls before the response header classifies the request', async () => {
    const controlText = '确认'
    const backendFeedback = '确认请求已处理'
    const deferredStreamResponse = createDeferred<Response>()
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).endsWith('/message/agent/stream') && init?.method === 'POST') {
        return deferredStreamResponse.promise
      }

      return Promise.resolve(createAgentResponse([]))
    })
    vi.stubGlobal('fetch', fetchMock)

    const wrapper = mountPanel()
    await wrapper.find('textarea').setValue(controlText)
    await wrapper.find('textarea').trigger('keydown', { key: 'Enter' })
    await flushPromises()

    expect(wrapper.find('.agent-assistant-message--user').exists()).toBe(false)
    expect(localStorage.getItem('moviepilot-agent-assistant-state') || '').not.toContain(controlText)
    expect(localStorage.getItem('moviepilot-agent-assistant-history') || '').not.toContain(controlText)
    expect(fetchMock.mock.calls.some(([input]) => String(input).includes('/display'))).toBe(false)

    deferredStreamResponse.resolve(
      createAgentStreamResponse(
        [legacySseFrame({ type: 'delta', content: backendFeedback }), legacySseFrame({ type: 'done' })],
        { 'X-MoviePilot-Agent-Control': 'secret-confirmation' },
      ),
    )
    await flushPromises()

    expect(wrapper.text()).toContain(backendFeedback)
    expect(wrapper.find('.agent-assistant-message--user').exists()).toBe(false)
    const localState = JSON.parse(localStorage.getItem('moviepilot-agent-assistant-state') || '{}')
    const localHistory = JSON.parse(localStorage.getItem('moviepilot-agent-assistant-history') || '[]')
    expect(localState.messages || []).not.toContainEqual(
      expect.objectContaining({ role: 'user', content: controlText }),
    )
    expect(localHistory).not.toContainEqual(expect.objectContaining({ role: 'user', content: controlText }))
    fetchMock.mock.calls
      .filter(([input]) => String(input).includes('/display'))
      .forEach(([, init]) => {
        const displayBody = JSON.parse(String(init?.body || '{}'))
        expect(displayBody.messages || []).not.toContainEqual(
          expect.objectContaining({ role: 'user', content: controlText }),
        )
      })

    wrapper.unmount()
  })

  it('recovers an ordinary request when the connection fails before response classification', async () => {
    const userText = '检查下载任务'
    const assistantText = '下载任务检查完成'
    let requestedSessionId = ''
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith('/message/agent/stream') && init?.method === 'POST') {
        requestedSessionId = JSON.parse(String(init.body)).session_id
        throw new TypeError('Failed to fetch')
      }
      if (requestedSessionId && url.includes(`/sessions/${encodeURIComponent(requestedSessionId)}`)) {
        return createAgentResponse({
          session_id: 'web-agent:preheader-recovery',
          client_session_id: requestedSessionId,
          updated_at: new Date(Date.now() + 1000).toISOString(),
          is_processing: false,
          messages: [
            {
              id: 'user-preheader-recovery',
              role: 'user',
              content: userText,
              createdAt: Date.now(),
              status: 'done',
              attachments: [],
              choices: [],
              tools: [],
            },
            {
              id: 'assistant-preheader-recovery',
              role: 'assistant',
              content: assistantText,
              createdAt: Date.now() + 1000,
              status: 'done',
              attachments: [],
              choices: [],
              tools: [],
            },
          ],
        })
      }

      return createAgentResponse([])
    })
    vi.stubGlobal('fetch', fetchMock)

    const wrapper = mountPanel()
    await wrapper.find('textarea').setValue(userText)
    await wrapper.find('textarea').trigger('keydown', { key: 'Enter' })
    await flushPromises()

    expect(wrapper.find('.agent-assistant-message--user').exists()).toBe(false)
    expect(localStorage.getItem('moviepilot-agent-assistant-state') || '').not.toContain(userText)
    expect(JSON.parse(localStorage.getItem('moviepilot-agent-assistant-state') || '{}').streamRecovery).toMatchObject({
      sessionId: requestedSessionId,
      attempts: 0,
    })

    await vi.advanceTimersByTimeAsync(1200)
    await flushPromises()

    expect(wrapper.text()).toContain(userText)
    expect(wrapper.text()).toContain(assistantText)
    expect(JSON.parse(localStorage.getItem('moviepilot-agent-assistant-state') || '{}').streamRecovery).toBeNull()

    wrapper.unmount()
  })

  it('commits ordinary messages in user and assistant order after response classification', async () => {
    const userText = '检查下载任务'
    const assistantText = '检查完成'
    const deferredStreamResponse = createDeferred<Response>()
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).endsWith('/message/agent/stream') && init?.method === 'POST') {
        return deferredStreamResponse.promise
      }

      return Promise.resolve(createAgentResponse([]))
    })
    vi.stubGlobal('fetch', fetchMock)

    const wrapper = mountPanel()
    await wrapper.find('textarea').setValue(userText)
    await wrapper.find('textarea').trigger('keydown', { key: 'Enter' })
    await flushPromises()

    expect(wrapper.findAll('.agent-assistant-message')).toHaveLength(0)

    deferredStreamResponse.resolve(
      createAgentStreamResponse([
        legacySseFrame({ type: 'delta', content: assistantText }),
        legacySseFrame({ type: 'done' }),
      ]),
    )
    await flushPromises()

    const messages = wrapper.findAll('.agent-assistant-message')
    expect(messages).toHaveLength(2)
    expect(messages[0].classes()).toContain('agent-assistant-message--user')
    expect(messages[0].text()).toContain(userText)
    expect(messages[1].classes()).toContain('agent-assistant-message--assistant')
    expect(messages[1].text()).toContain(assistantText)

    wrapper.unmount()
  })

  it('keeps an exact confirmation word on the ordinary path without a pending control', async () => {
    const controlText = '确认'
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).endsWith('/message/agent/stream') && init?.method === 'POST') {
        return createAgentStreamResponse([legacySseFrame({ type: 'done' })])
      }
      return createAgentResponse([])
    })
    vi.stubGlobal('fetch', fetchMock)

    const wrapper = mountPanel()
    await wrapper.find('textarea').setValue(controlText)
    await wrapper.find('textarea').trigger('keydown', { key: 'Enter' })
    await flushPromises()

    const streamCall = fetchMock.mock.calls.find(([input]) => String(input).endsWith('/message/agent/stream'))
    const streamBody = JSON.parse(String(streamCall?.[1]?.body || '{}'))
    expect(streamBody.echo_user).toBe(true)
    expect(wrapper.find('.agent-assistant-message--user').text()).toContain(controlText)
    wrapper.unmount()
  })

  it.each([
    ['confirmation with details', '确认 TMDB_API_KEY'],
    ['cancellation with details', '取消 TMDB_API_KEY'],
    ['extra prose', '确认，请执行'],
    ['different verb', '同意'],
  ])('keeps the %s control-like text on the ordinary echo path', async (_caseName, controlLikeText) => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).endsWith('/message/agent/stream') && init?.method === 'POST') {
        return createAgentStreamResponse([legacySseFrame({ type: 'done' })])
      }
      return createAgentResponse([])
    })
    vi.stubGlobal('fetch', fetchMock)

    const wrapper = mountPanel()
    await wrapper.find('textarea').setValue(controlLikeText)
    await wrapper.find('textarea').trigger('keydown', { key: 'Enter' })
    await flushPromises()

    const streamCall = fetchMock.mock.calls.find(([input]) => String(input).endsWith('/message/agent/stream'))
    const streamBody = JSON.parse(String(streamCall?.[1]?.body || '{}'))
    expect(streamBody.echo_user).toBe(true)
    expect(wrapper.find('.agent-assistant-message--user').exists()).toBe(true)
    wrapper.unmount()
  })

  it('keeps an exact confirmation string with an attachment on the ordinary echo path', async () => {
    const controlText = '确认'
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith('/message/agent/upload') && init?.method === 'POST') {
        return createAgentResponse({
          ref: 'attachment-ref',
          url: '/api/v1/message/agent/attachments/attachment-ref',
          name: 'proof.txt',
          mime_type: 'text/plain',
          size: 5,
          kind: 'file',
        })
      }
      if (url.endsWith('/message/agent/stream') && init?.method === 'POST') {
        return createAgentStreamResponse([legacySseFrame({ type: 'done' })])
      }
      return createAgentResponse([])
    })
    vi.stubGlobal('fetch', fetchMock)

    const wrapper = mountPanel()
    const fileInput = wrapper.get('input[type="file"]')
    Object.defineProperty(fileInput.element, 'files', {
      configurable: true,
      value: [new File(['proof'], 'proof.txt', { type: 'text/plain' })],
    })
    await fileInput.trigger('change')
    await wrapper.find('textarea').setValue(controlText)
    await wrapper.find('textarea').trigger('keydown', { key: 'Enter' })
    await flushPromises()

    const streamCall = fetchMock.mock.calls.find(([input]) => String(input).endsWith('/message/agent/stream'))
    const streamBody = JSON.parse(String(streamCall?.[1]?.body || '{}'))
    expect(streamBody.echo_user).toBe(true)
    expect(wrapper.find('.agent-assistant-message--user').text()).toContain(controlText)

    const uploadCall = fetchMock.mock.calls.find(([input]) => String(input).endsWith('/message/agent/upload'))
    const uploadHeaders = new Headers(uploadCall?.[1]?.headers)
    expect(uploadHeaders.has('X-MoviePilot-Agent-Interaction')).toBe(false)
    wrapper.unmount()
  })

  it.each([
    [
      'uses the localized backend message for a standard failure envelope',
      { success: false, message: '附件不受支持', data: null },
      '附件不受支持',
    ],
    [
      'rejects a legacy envelope with an extra localized-message field',
      { success: false, message: '标准错误', message_i18n: '旧字段错误', data: null },
      'Invalid API response envelope',
    ],
  ])('%s', async (_caseName, payload, expectedMessage) => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).endsWith('/message/agent/upload') && init?.method === 'POST') {
        return createAgentEnvelopeResponse(payload)
      }
      return createAgentResponse([])
    })
    vi.stubGlobal('fetch', fetchMock)

    const wrapper = mountPanel()
    const fileInput = wrapper.get('input[type="file"]')
    Object.defineProperty(fileInput.element, 'files', {
      configurable: true,
      value: [new File(['proof'], 'proof.txt', { type: 'text/plain' })],
    })
    await fileInput.trigger('change')
    await wrapper.find('textarea').setValue('检查附件')
    await wrapper.find('textarea').trigger('keydown', { key: 'Enter' })
    await flushPromises()

    expect(wrapper.text()).toContain(expectedMessage)
    wrapper.unmount()
  })

  it('clears protected delivery through Escape and the close button', async () => {
    const protectedMarker = 'MP-CLOSE-PROTECTED-MARKER'
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).endsWith('/message/agent/stream') && init?.method === 'POST') {
        return createAgentStreamResponse([
          protectedSseFrame({ content: protectedMarker }),
          legacySseFrame({ type: 'done' }),
        ])
      }
      return createAgentResponse([])
    })
    vi.stubGlobal('fetch', fetchMock)

    const wrapper = mountPanel()
    await wrapper.find('textarea').setValue('读取后按 Escape')
    await wrapper.find('textarea').trigger('keydown', { key: 'Enter' })
    await flushPromises()
    expect(wrapper.text()).toContain(protectedMarker)

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await flushPromises()
    expect(wrapper.text()).not.toContain(protectedMarker)

    await wrapper.setProps({ modelValue: true })
    await wrapper.find('textarea').setValue('读取后点击关闭')
    await wrapper.find('textarea').trigger('keydown', { key: 'Enter' })
    await flushPromises()
    expect(wrapper.text()).toContain(protectedMarker)

    await wrapper.get('[title="common.close"]').trigger('click')
    expect(wrapper.text()).not.toContain(protectedMarker)
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
