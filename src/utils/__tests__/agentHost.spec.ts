import { afterEach, describe, expect, it, vi } from 'vitest'
import { AgentHostCore } from '@/utils/agentHost'
import { createAgentPhaseTracker } from '@/utils/agentHostPhase'

describe('AgentHostCore', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('calls subscribers immediately with the current snapshot and stops after cancel', () => {
    const host = new AgentHostCore()
    const scoped = host.createScoped(() => 'plugin-a')
    const listener = vi.fn()

    const cancel = scoped.subscribe(listener)
    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener.mock.calls[0][0]).toMatchObject({ available: false, panelOpen: false, phase: 'idle' })

    host.setState({ panelOpen: true })
    expect(listener).toHaveBeenCalledTimes(2)
    expect(listener.mock.calls[1][0].panelOpen).toBe(true)

    // 字段未变化时不重复通知。
    host.setState({ panelOpen: true })
    expect(listener).toHaveBeenCalledTimes(2)

    cancel()
    host.setState({ panelOpen: false })
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('rejects plugin events with the reserved agent prefix and tags custom events with the plugin source', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const host = new AgentHostCore()
    const emitter = host.createScoped(() => 'plugin-a')
    const listener = host.createScoped(() => 'plugin-b')
    const reserved = vi.fn()
    const custom = vi.fn()
    listener.on('agent.panel.open', reserved)
    listener.on('pet.resize', custom)

    emitter.emit('agent.panel.open', {})
    emitter.emit('pet.resize', { scale: 1.5 })

    expect(reserved).not.toHaveBeenCalled()
    expect(custom).toHaveBeenCalledTimes(1)
    expect(custom.mock.calls[0][0]).toMatchObject({ name: 'pet.resize', source: 'plugin-a', data: { scale: 1.5 } })
    expect(typeof custom.mock.calls[0][0].at).toBe('number')
  })

  it('treats open as a no-op while the agent is unavailable and forwards drafts once available', () => {
    const host = new AgentHostCore()
    const controller = { open: vi.fn(), close: vi.fn() }
    host.bindController(controller)
    const scoped = host.createScoped(() => 'plugin-a')

    scoped.open({ draft: '你好' })
    expect(controller.open).not.toHaveBeenCalled()

    host.setState({ available: true })
    scoped.open({ draft: '你好' })
    expect(controller.open).toHaveBeenCalledWith({ draft: '你好' })
  })

  it('clears every subscription of a scoped view on dispose', () => {
    const host = new AgentHostCore()
    const scoped = host.createScoped(() => 'plugin-a')
    const stateListener = vi.fn()
    const eventListener = vi.fn()
    scoped.subscribe(stateListener)
    scoped.on('agent.done', eventListener)

    scoped.dispose()
    host.setState({ thinking: true })
    host.emitHostEvent('agent.done')

    expect(stateListener).toHaveBeenCalledTimes(1)
    expect(eventListener).not.toHaveBeenCalled()
  })

  it('isolates failing plugin callbacks from other subscribers', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const host = new AgentHostCore()
    const healthy = vi.fn()
    host.on('agent.done', () => {
      throw new Error('boom')
    })
    host.on('agent.done', healthy)

    host.emitHostEvent('agent.done')

    expect(healthy).toHaveBeenCalledTimes(1)
  })
})

describe('createAgentPhaseTracker', () => {
  function setup() {
    const host = new AgentHostCore()
    const tracker = createAgentPhaseTracker(host)
    const events: Array<[string, Record<string, unknown>]> = []
    ;[
      'agent.thinking.start',
      'agent.thinking.end',
      'agent.tool.start',
      'agent.tool.end',
      'agent.awaiting',
      'agent.done',
      'agent.error',
    ].forEach(name => host.on(name, payload => events.push([payload.name, payload.data])))
    return { host, tracker, events }
  }

  it('derives thinking, tool, done phases from panel signals', () => {
    const { host, tracker, events } = setup()

    tracker.handleThinkingChange(true)
    expect(host.getState()).toMatchObject({ thinking: true, phase: 'thinking' })

    tracker.handleStreamPhase({ type: 'tool', id: 't1', name: 'search', status: 'running' })
    expect(host.getState()).toMatchObject({ phase: 'tool', toolName: 'search' })

    tracker.handleStreamPhase({ type: 'tool', id: 't1', name: null, status: 'done' })
    expect(host.getState()).toMatchObject({ phase: 'thinking', toolName: null })

    tracker.handleStreamPhase({ type: 'done' })
    tracker.handleThinkingChange(false)
    expect(host.getState()).toMatchObject({ thinking: false, phase: 'done' })

    expect(events).toEqual([
      ['agent.thinking.start', {}],
      ['agent.tool.start', { name: 'search' }],
      ['agent.tool.end', { name: 'search' }],
      ['agent.done', {}],
      ['agent.thinking.end', {}],
    ])
  })

  it('keeps awaiting after a choice even when the stream completes', () => {
    const { host, tracker } = setup()

    tracker.handleThinkingChange(true)
    tracker.handleStreamPhase({ type: 'choice' })
    tracker.handleStreamPhase({ type: 'done' })
    tracker.handleThinkingChange(false)

    expect(host.getState().phase).toBe('awaiting')
  })

  it('reports errors and closes a tool that never finished', () => {
    const { host, tracker, events } = setup()

    tracker.handleThinkingChange(true)
    tracker.handleStreamPhase({ type: 'tool', id: '', name: null, status: 'running' })
    tracker.handleStreamPhase({ type: 'error', message: '模型超时' })

    expect(host.getState().phase).toBe('error')
    expect(events.slice(-2)).toEqual([
      ['agent.tool.end', { name: null }],
      ['agent.error', { message: '模型超时' }],
    ])
  })

  it('returns to idle when thinking stops without a terminal event', () => {
    const { host, tracker } = setup()

    tracker.handleThinkingChange(true)
    tracker.handleThinkingChange(false)

    expect(host.getState().phase).toBe('idle')
  })
})
