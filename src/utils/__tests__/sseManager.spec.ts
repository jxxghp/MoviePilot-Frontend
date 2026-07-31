import { SSEManager, sseManagerSingleton, type SSEManagerOptions } from '@/utils/sseManager'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/** 提供 SSEManager 生命周期测试所需的最小 EventSource 协议。 */
class FakeEventSource {
  static readonly CLOSED = 2
  static readonly CONNECTING = 0
  static readonly OPEN = 1
  static instances: FakeEventSource[] = []
  static throwOnNextConstruction = false

  readonly url: string
  readyState = FakeEventSource.CONNECTING
  onerror: ((event: Event) => void) | null = null
  onmessage: ((event: MessageEvent) => void) | null = null
  onopen: ((event: Event) => void) | null = null
  close = vi.fn(() => {
    this.readyState = FakeEventSource.CLOSED
  })

  constructor(url: string | URL) {
    if (FakeEventSource.throwOnNextConstruction) {
      FakeEventSource.throwOnNextConstruction = false
      throw new Error('EventSource construction failed')
    }

    this.url = String(url)
    FakeEventSource.instances.push(this)
  }

  emit(data: unknown) {
    this.onmessage?.(new MessageEvent('message', { data }))
  }

  fail() {
    this.readyState = FakeEventSource.CLOSED
    this.onerror?.(new Event('error'))
  }

  open() {
    this.readyState = FakeEventSource.OPEN
    this.onopen?.(new Event('open'))
  }

  static reset() {
    FakeEventSource.instances = []
    FakeEventSource.throwOnNextConstruction = false
  }
}

const managerOptions: SSEManagerOptions = {
  backgroundCloseDelay: 500,
  maxReconnectAttempts: 2,
  maxReconnectDelay: 150,
  reconnectBackoffMultiplier: 10,
  reconnectDelay: 100,
}

describe('SSEManager', () => {
  const managers: SSEManager[] = []
  let hidden = false

  function createManager(options: Partial<SSEManagerOptions> = {}) {
    const manager = new SSEManager('/api/events', { ...managerOptions, ...options })
    managers.push(manager)
    return manager
  }

  beforeEach(() => {
    vi.useFakeTimers()
    FakeEventSource.reset()
    vi.stubGlobal('EventSource', FakeEventSource as unknown as typeof EventSource)
    vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden)
    hidden = false
  })

  afterEach(() => {
    managers.splice(0).forEach(manager => manager.destroy())
    sseManagerSingleton.closeAllManagers()
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('首个监听器建连，多监听器共享连接且互不传播处理错误', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const manager = createManager()
    const firstMessageListener = vi.fn(() => {
      throw new Error('message listener failed')
    })
    const secondMessageListener = vi.fn()
    const failingStatusListener = vi.fn(() => {
      throw new Error('status listener failed')
    })
    const statusListener = vi.fn()

    manager.addStatusListener('failing-status', failingStatusListener, false)
    manager.addStatusListener('status', statusListener)
    manager.addMessageListener('first', firstMessageListener)
    manager.addMessageListener('second', secondMessageListener)

    expect(FakeEventSource.instances).toHaveLength(1)
    expect(manager.status).toBe('connecting')
    expect(manager.readyState).toBe(FakeEventSource.CONNECTING)
    expect(manager.connectionUrl).toBe('/api/events')

    const source = FakeEventSource.instances[0]
    source.open()
    source.emit({ id: 1 })

    expect(manager.status).toBe('open')
    expect(manager.readyState).toBe(FakeEventSource.OPEN)
    expect(firstMessageListener).toHaveBeenCalledOnce()
    expect(secondMessageListener).toHaveBeenCalledOnce()
    expect(statusListener.mock.calls.map(([status]) => status)).toEqual(['idle', 'connecting', 'open'])
    expect(consoleError).toHaveBeenCalledWith('SSE: 监听器错误 [first]', expect.any(Error))
    expect(consoleError).toHaveBeenCalledWith('SSE: 状态监听器错误 [failing-status]', expect.any(Error))

    manager.removeMessageListener('first')
    expect(source.close).not.toHaveBeenCalled()

    manager.removeMessageListener('second')
    expect(source.close).toHaveBeenCalledOnce()
    expect(manager.hasActiveListeners).toBe(false)
    expect(manager.status).toBe('idle')
  })

  it('按退避上限重连并在达到最大次数后关闭', () => {
    const manager = createManager()
    manager.addMessageListener('listener', vi.fn())

    FakeEventSource.instances[0].fail()
    expect(manager.status).toBe('error')
    expect(manager.currentReconnectAttempts).toBe(1)

    vi.advanceTimersByTime(99)
    expect(FakeEventSource.instances).toHaveLength(1)
    vi.advanceTimersByTime(1)
    expect(FakeEventSource.instances).toHaveLength(2)

    FakeEventSource.instances[1].fail()
    expect(manager.currentReconnectAttempts).toBe(2)
    vi.advanceTimersByTime(149)
    expect(FakeEventSource.instances).toHaveLength(2)
    vi.advanceTimersByTime(1)
    expect(FakeEventSource.instances).toHaveLength(3)

    FakeEventSource.instances[2].fail()
    expect(manager.status).toBe('closed')
    expect(manager.currentReconnectAttempts).toBe(2)
    expect(manager.hasReachedMaxAttempts).toBe(true)

    vi.advanceTimersByTime(1_000)
    expect(FakeEventSource.instances).toHaveLength(3)
  })

  it('成功建连后清零失败次数，并从首档延迟重新退避', () => {
    const manager = createManager({ maxReconnectAttempts: 3 })
    manager.addMessageListener('listener', vi.fn())

    FakeEventSource.instances[0].fail()
    vi.advanceTimersByTime(100)
    FakeEventSource.instances[1].open()

    expect(manager.status).toBe('open')
    expect(manager.currentReconnectAttempts).toBe(0)
    expect(manager.hasReachedMaxAttempts).toBe(false)

    FakeEventSource.instances[1].fail()
    vi.advanceTimersByTime(99)
    expect(FakeEventSource.instances).toHaveLength(2)
    vi.advanceTimersByTime(1)
    expect(FakeEventSource.instances).toHaveLength(3)
  })

  it('EventSource 构造失败时记录错误并按相同策略恢复', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const manager = createManager()
    FakeEventSource.throwOnNextConstruction = true

    manager.addMessageListener('listener', vi.fn())

    expect(manager.status).toBe('error')
    expect(manager.currentReconnectAttempts).toBe(1)
    expect(consoleError).toHaveBeenCalledWith('SSE: 连接创建失败', expect.any(Error))

    vi.advanceTimersByTime(100)
    expect(FakeEventSource.instances).toHaveLength(1)
    expect(manager.status).toBe('connecting')
  })

  it('短暂进入后台会取消延迟关闭，长期后台关闭后在前台恢复', () => {
    const manager = createManager()
    manager.addMessageListener('listener', vi.fn())
    const source = FakeEventSource.instances[0]
    source.open()

    hidden = true
    document.dispatchEvent(new Event('visibilitychange'))
    vi.advanceTimersByTime(499)
    expect(source.close).not.toHaveBeenCalled()

    hidden = false
    document.dispatchEvent(new Event('visibilitychange'))
    vi.advanceTimersByTime(500)
    expect(source.close).not.toHaveBeenCalled()

    hidden = true
    document.dispatchEvent(new Event('visibilitychange'))
    vi.advanceTimersByTime(500)
    expect(source.close).toHaveBeenCalledOnce()
    expect(manager.status).toBe('closed')

    hidden = false
    document.dispatchEvent(new Event('visibilitychange'))
    expect(FakeEventSource.instances).toHaveLength(2)
    expect(manager.status).toBe('connecting')
  })

  it('close 清理待重连定时器并保留监听器供强制重连', () => {
    const manager = createManager()
    manager.addMessageListener('listener', vi.fn())
    const firstSource = FakeEventSource.instances[0]

    firstSource.fail()
    expect(vi.getTimerCount()).toBe(1)

    manager.close()
    expect(firstSource.close).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
    expect(manager.status).toBe('closed')
    expect(manager.hasActiveListeners).toBe(true)

    vi.advanceTimersByTime(1_000)
    expect(FakeEventSource.instances).toHaveLength(1)

    manager.forceReconnect()
    expect(FakeEventSource.instances).toHaveLength(2)
    expect(manager.status).toBe('connecting')
  })

  it('forceReconnect 取代待执行的自动重连，不会由旧定时器重复建连', () => {
    const manager = createManager()
    manager.addMessageListener('listener', vi.fn())

    FakeEventSource.instances[0].fail()
    expect(vi.getTimerCount()).toBe(1)

    manager.forceReconnect()
    expect(FakeEventSource.instances).toHaveLength(2)
    expect(vi.getTimerCount()).toBe(0)

    vi.advanceTimersByTime(1_000)
    expect(FakeEventSource.instances).toHaveLength(2)
  })

  it('destroy 清理后台定时器、监听器和构造时注册的 DOM 订阅', () => {
    const addDocumentListener = vi.spyOn(document, 'addEventListener')
    const addWindowListener = vi.spyOn(window, 'addEventListener')
    const removeDocumentListener = vi.spyOn(document, 'removeEventListener')
    const removeWindowListener = vi.spyOn(window, 'removeEventListener')
    const manager = createManager()
    manager.addMessageListener('listener', vi.fn())
    const source = FakeEventSource.instances[0]
    source.open()
    const visibilityHandler = addDocumentListener.mock.calls.find(([event]) => event === 'visibilitychange')?.[1]
    const beforeUnloadHandler = addWindowListener.mock.calls.find(([event]) => String(event) === 'beforeunload')?.[1]

    hidden = true
    document.dispatchEvent(new Event('visibilitychange'))
    expect(vi.getTimerCount()).toBe(1)

    manager.destroy()
    expect(source.close).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
    vi.runAllTimers()

    expect(FakeEventSource.instances).toHaveLength(1)
    expect(manager.hasActiveListeners).toBe(false)
    expect(manager.status).toBe('idle')
    expect(removeDocumentListener).toHaveBeenCalledWith('visibilitychange', visibilityHandler)
    expect(removeWindowListener).toHaveBeenCalledWith('beforeunload', beforeUnloadHandler)

    manager.addMessageListener('ignored', vi.fn())
    manager.forceReconnect()
    expect(FakeEventSource.instances).toHaveLength(1)
  })
})

describe('sseManagerSingleton', () => {
  beforeEach(() => {
    FakeEventSource.reset()
    vi.stubGlobal('EventSource', FakeEventSource as unknown as typeof EventSource)
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false)
  })

  afterEach(() => {
    sseManagerSingleton.closeAllManagers()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('按 URL 复用共享实例，只有注册表关闭操作才替换 identity', () => {
    const manager = sseManagerSingleton.getManager('/shared', managerOptions)
    manager.addMessageListener('listener', vi.fn())
    const source = FakeEventSource.instances[0]

    expect(sseManagerSingleton.getManager('/shared')).toBe(manager)
    expect(sseManagerSingleton.getManager('/other')).not.toBe(manager)

    sseManagerSingleton.closeManager('/shared')
    expect(source.close).toHaveBeenCalledOnce()
    expect(manager.hasActiveListeners).toBe(false)

    manager.forceReconnect()
    expect(FakeEventSource.instances).toHaveLength(1)

    const replacement = sseManagerSingleton.getManager('/shared', managerOptions)
    expect(replacement).not.toBe(manager)
  })

  it('按 URL 与 listenerId 隔离独立实例，关闭指定注册项后重新创建', () => {
    const first = sseManagerSingleton.getIndependentManager('/independent', 'first', managerOptions)
    const second = sseManagerSingleton.getIndependentManager('/independent', 'second', managerOptions)
    first.addMessageListener('first-listener', vi.fn())
    second.addMessageListener('second-listener', vi.fn())
    const firstSource = FakeEventSource.instances[0]

    expect(sseManagerSingleton.getIndependentManager('/independent', 'first')).toBe(first)
    expect(second).not.toBe(first)

    sseManagerSingleton.closeIndependentManager('/independent', 'first')
    expect(firstSource.close).toHaveBeenCalledOnce()
    expect(first.hasActiveListeners).toBe(false)

    first.forceReconnect()
    expect(FakeEventSource.instances).toHaveLength(2)

    const replacement = sseManagerSingleton.getIndependentManager('/independent', 'first', managerOptions)
    expect(replacement).not.toBe(first)
    expect(sseManagerSingleton.getIndependentManager('/independent', 'second')).toBe(second)
  })
})
