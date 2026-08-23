import { mount, type VueWrapper } from '@vue/test-utils'
import { defineComponent, h, ref, type Ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useBackground } from '@/composables/useBackground'

type SSEStatus = 'idle' | 'connecting' | 'open' | 'error' | 'closed'
type StatusListener = (status: SSEStatus) => void
type MessageListener = (event: MessageEvent) => void

interface MockManager {
  url: string
  options?: Record<string, unknown>
  readyState: number
  addStatusListener: ReturnType<typeof vi.fn>
  removeStatusListener: ReturnType<typeof vi.fn>
  addMessageListener: ReturnType<typeof vi.fn>
  removeMessageListener: ReturnType<typeof vi.fn>
  forceReconnect: ReturnType<typeof vi.fn>
  emitStatus: (status: SSEStatus) => void
  closed: boolean
}

const { closeIndependentManager, getCurrentLocaleMock, getIndependentManager, managers } = vi.hoisted(() => {
  const managers = new Map<string, MockManager>()

  const createManager = (url: string, options?: Record<string, unknown>): MockManager => {
    let status: SSEStatus = 'idle'
    let statusListener: StatusListener | undefined
    let messageListener: MessageListener | undefined

    const manager = {
      url,
      options,
      readyState: 0,
      closed: false,
      addStatusListener: vi.fn((_id: string, listener: StatusListener, emitCurrent = true) => {
        statusListener = listener
        if (emitCurrent) listener(status)
      }),
      removeStatusListener: vi.fn(() => {
        statusListener = undefined
      }),
      addMessageListener: vi.fn((_id: string, listener: MessageListener) => {
        messageListener = listener
      }),
      removeMessageListener: vi.fn(() => {
        messageListener = undefined
      }),
      forceReconnect: vi.fn(),
      emitStatus: (nextStatus: SSEStatus) => {
        status = nextStatus
        statusListener?.(nextStatus)
      },
    }

    void messageListener
    return manager
  }

  const getIndependentManager = vi.fn((url: string, listenerId: string, options?: Record<string, unknown>) => {
    const key = `${url}::${listenerId}`
    const existing = managers.get(key)
    if (existing) return existing

    const manager = createManager(url, options)
    managers.set(key, manager)
    return manager
  })

  const closeIndependentManager = vi.fn((url: string, listenerId: string) => {
    const key = `${url}::${listenerId}`
    const manager = managers.get(key)
    if (manager) manager.closed = true
    managers.delete(key)
  })

  return {
    closeIndependentManager,
    getCurrentLocaleMock: vi.fn(() => 'zh-CN'),
    getIndependentManager,
    managers,
  }
})

vi.mock('@/utils/sseManager', () => ({
  sseManagerSingleton: {
    closeIndependentManager,
    getIndependentManager,
  },
}))

vi.mock('@/plugins/i18n', () => ({
  getCurrentLocale: getCurrentLocaleMock,
}))

type Background = ReturnType<typeof useBackground>
type UseSSEResult = ReturnType<Background['useSSE']>
type UseDelayedSSEResult = ReturnType<Background['useDelayedSSE']>
type UseProgressSSEResult = ReturnType<Background['useProgressSSE']>

const wrappers: VueWrapper[] = []

function managerKey(url: string, listenerId: string) {
  return `${url}::${listenerId}`
}

function mountSSE(url = '/api/v1/events', listenerId = 'sse-listener', options?: Parameters<Background['useSSE']>[3]) {
  let result!: UseSSEResult
  const messageHandler = vi.fn<(event: MessageEvent) => void>()
  const Component = defineComponent({
    setup() {
      result = useBackground().useSSE(url, messageHandler, listenerId, options)
      return () => h('div')
    },
  })

  const wrapper = mount(Component)
  wrappers.push(wrapper)
  return { messageHandler, result, wrapper }
}

function mountDelayedSSE(url = '/api/v1/delayed-events', listenerId = 'delayed-listener', delay = 3_000) {
  let result!: UseDelayedSSEResult
  const messageHandler = vi.fn<(event: MessageEvent) => void>()
  const Component = defineComponent({
    setup() {
      result = useBackground().useDelayedSSE(url, messageHandler, listenerId, delay)
      return () => h('div')
    },
  })

  const wrapper = mount(Component)
  wrappers.push(wrapper)
  return { messageHandler, result, wrapper }
}

function mountProgressSSE(active: Ref<boolean>, url = '/api/v1/progress', listenerId = 'progress-listener') {
  let result!: UseProgressSSEResult
  const messageHandler = vi.fn<(event: MessageEvent) => void>()
  const Component = defineComponent({
    setup() {
      result = useBackground().useProgressSSE(url, messageHandler, listenerId, active)
      return () => h('div')
    },
  })

  const wrapper = mount(Component)
  wrappers.push(wrapper)
  return { messageHandler, result, wrapper }
}

function unmount(wrapper: VueWrapper) {
  const index = wrappers.indexOf(wrapper)
  if (index >= 0) wrappers.splice(index, 1)
  wrapper.unmount()
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  managers.clear()
  getCurrentLocaleMock.mockReturnValue('zh-CN')
})

afterEach(() => {
  for (const wrapper of wrappers.splice(0)) wrapper.unmount()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('useBackground SSE composables', () => {
  describe('useSSE', () => {
    it('延迟注册消息监听器并透传 manager options', async () => {
      const options = { connectDelay: 25, reconnectDelay: 800 }
      const { messageHandler, result } = mountSSE('/api/v1/events', 'events', options)
      const manager = managers.get(managerKey('/api/v1/events', 'events'))!

      expect(getIndependentManager).toHaveBeenCalledWith('/api/v1/events', 'events', options)
      expect(manager.addMessageListener).not.toHaveBeenCalled()

      await vi.advanceTimersByTimeAsync(24)
      expect(manager.addMessageListener).not.toHaveBeenCalled()

      await vi.advanceTimersByTimeAsync(1)
      expect(manager.addMessageListener).toHaveBeenCalledWith('events', messageHandler)
      unmount(wrappers[0])
      expect(result.isConnected.value).toBe(false)
    })

    it('映射连接状态并透传 readyState 与 forceReconnect', () => {
      const { result, wrapper } = mountSSE()
      const manager = managers.get(managerKey('/api/v1/events', 'sse-listener'))!

      manager.emitStatus('connecting')
      expect(result.isConnected.value).toBe(false)
      manager.emitStatus('open')
      expect(result.isConnected.value).toBe(true)
      manager.emitStatus('closed')
      expect(result.isConnected.value).toBe(false)

      manager.readyState = 1
      expect(result.readyState()).toBe(1)
      result.forceReconnect()
      expect(manager.forceReconnect).toHaveBeenCalledOnce()

      unmount(wrapper)
    })

    it('隔离延迟连接时的 manager 异常', async () => {
      const { result, wrapper } = mountSSE('/api/v1/events', 'throwing-listener', { connectDelay: 1 })
      const manager = managers.get(managerKey('/api/v1/events', 'throwing-listener'))!
      const error = new Error('connect failed')
      manager.addMessageListener.mockImplementationOnce(() => {
        throw error
      })
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)

      await vi.advanceTimersByTimeAsync(1)

      expect(consoleError).toHaveBeenCalledWith('SSE连接建立失败:', error)
      expect(result.isConnected.value).toBe(false)
      unmount(wrapper)
    })

    it('close 是幂等的', () => {
      const { result, wrapper } = mountSSE()
      const manager = managers.get(managerKey('/api/v1/events', 'sse-listener'))!

      result.close()
      result.close()

      expect(manager.removeStatusListener).toHaveBeenCalledOnce()
      expect(manager.removeMessageListener).toHaveBeenCalledOnce()
      expect(closeIndependentManager).toHaveBeenCalledOnce()

      unmount(wrapper)
    })

    it('提前卸载会取消延迟连接并清理 manager', async () => {
      const { wrapper } = mountSSE('/api/v1/events', 'early-unmount', { connectDelay: 100 })
      const manager = managers.get(managerKey('/api/v1/events', 'early-unmount'))!

      unmount(wrapper)
      await vi.advanceTimersByTimeAsync(100)

      expect(manager.addMessageListener).not.toHaveBeenCalled()
      expect(manager.removeStatusListener).toHaveBeenCalledOnce()
      expect(manager.removeMessageListener).toHaveBeenCalledOnce()
      expect(closeIndependentManager).toHaveBeenCalledWith('/api/v1/events', 'early-unmount')
    })
  })

  describe('useDelayedSSE', () => {
    it('使用自定义 delay 注册消息监听器', async () => {
      const { messageHandler, result, wrapper } = mountDelayedSSE('/api/v1/delayed', 'delayed', 40)
      const manager = managers.get(managerKey('/api/v1/delayed', 'delayed'))!

      await vi.advanceTimersByTimeAsync(39)
      expect(manager.addMessageListener).not.toHaveBeenCalled()
      await vi.advanceTimersByTimeAsync(1)
      expect(manager.addMessageListener).toHaveBeenCalledWith('delayed', messageHandler)
      expect(result.isConnected.value).toBe(false)

      unmount(wrapper)
    })

    it('映射状态并在卸载时清理监听器和延迟任务', async () => {
      const { result, wrapper } = mountDelayedSSE('/api/v1/delayed', 'delayed-state', 100)
      const manager = managers.get(managerKey('/api/v1/delayed', 'delayed-state'))!

      manager.emitStatus('open')
      expect(result.isConnected.value).toBe(true)
      unmount(wrapper)
      await vi.advanceTimersByTimeAsync(100)

      expect(manager.addMessageListener).not.toHaveBeenCalled()
      expect(manager.removeStatusListener).toHaveBeenCalledOnce()
      expect(manager.removeMessageListener).toHaveBeenCalledOnce()
      expect(closeIndependentManager).toHaveBeenCalledWith('/api/v1/delayed', 'delayed-state')
      expect(result.isConnected.value).toBe(false)
    })
  })

  describe('useProgressSSE', () => {
    it('按活动状态惰性创建 manager，并避免重复 start', () => {
      const active = ref(false)
      const { result, wrapper } = mountProgressSSE(active)

      result.start()
      expect(getIndependentManager).not.toHaveBeenCalled()

      active.value = true
      result.start()
      result.start()

      const managerUrl = new URL('/api/v1/progress', window.location.origin)
      managerUrl.searchParams.set('locale', 'zh-CN')
      const manager = managers.get(managerKey(managerUrl.toString(), 'progress-listener'))!
      expect(getIndependentManager).toHaveBeenCalledOnce()
      expect(manager.addMessageListener).toHaveBeenCalledOnce()
      expect(result.manager).toBe(manager)

      unmount(wrapper)
    })

    it('为已有 query 的 URL 追加 locale，并传递进度连接选项', () => {
      const active = ref(true)
      const { result, wrapper } = mountProgressSSE(active, '/api/v1/progress?task=42', 'progress-query')
      result.start()

      const expectedUrl = new URL('/api/v1/progress?task=42', window.location.origin)
      expectedUrl.searchParams.set('locale', 'zh-CN')
      expect(getIndependentManager).toHaveBeenCalledWith(expectedUrl.toString(), 'progress-query', {
        backgroundCloseDelay: 1_000,
        reconnectDelay: 1_000,
        maxReconnectAttempts: 5,
      })

      unmount(wrapper)
    })

    it('URL 无法解析时保留原始地址并使用 query fallback', () => {
      const active = ref(true)
      const malformedUrl = 'https://[invalid?task=42'
      const { result, wrapper } = mountProgressSSE(active, malformedUrl, 'progress-fallback')
      result.start()

      expect(getIndependentManager).toHaveBeenCalledWith(
        `${malformedUrl}&locale=zh-CN`,
        'progress-fallback',
        expect.any(Object),
      )
      unmount(wrapper)
    })

    it('stop(false) 保留 manager，stop(true) 销毁 manager', () => {
      const active = ref(true)
      const { result, wrapper } = mountProgressSSE(active, '/api/v1/progress', 'progress-stop')
      result.start()
      const manager = result.manager!
      const managerUrl = new URL('/api/v1/progress', window.location.origin)
      managerUrl.searchParams.set('locale', 'zh-CN')

      result.stop(false)
      expect(manager.removeMessageListener).toHaveBeenCalledOnce()
      expect(closeIndependentManager).not.toHaveBeenCalled()
      expect(result.manager).toBe(manager)

      result.start()
      expect(manager.addMessageListener).toHaveBeenCalledTimes(2)

      result.stop(true)
      expect(closeIndependentManager).toHaveBeenCalledWith(managerUrl.toString(), 'progress-stop')
      expect(result.manager).toBeNull()

      unmount(wrapper)
    })

    it('setup scope 卸载时停止监听并销毁 manager', () => {
      const active = ref(true)
      const { result, wrapper } = mountProgressSSE(active, '/api/v1/progress', 'progress-unmount')
      result.start()
      const manager = result.manager!

      unmount(wrapper)

      expect(manager.removeMessageListener).toHaveBeenCalledOnce()
      expect(closeIndependentManager).toHaveBeenCalledOnce()
      expect(result.manager).toBeNull()
    })
  })
})
