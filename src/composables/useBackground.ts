import { getCurrentInstance, onMounted, onUnmounted, ref, type Ref } from 'vue'
import { sseManagerSingleton, type SSEManagerOptions } from '@/utils/sseManager'
import { addBackgroundTimer, removeBackgroundTimer } from '@/utils/backgroundManager'
import { getCurrentLocale } from '@/plugins/i18n'

type UseSSEOptions = Partial<SSEManagerOptions> & {
  connectDelay?: number
}

/** 为 SSE 请求补充当前前端语言，弥补 EventSource 不能设置自定义请求头的问题。 */
function appendLocaleParam(url: string) {
  const locale = getCurrentLocale()

  try {
    const parsedUrl = new URL(url, window.location.origin)
    parsedUrl.searchParams.set('locale', locale)
    return parsedUrl.toString()
  } catch {
    const separator = url.includes('?') ? '&' : '?'
    return `${url}${separator}locale=${encodeURIComponent(locale)}`
  }
}

/**
 * 后台任务组合函数
 * 统一管理SSE连接和定时器，减少后台常驻活动。
 */
export function useBackground() {
  /**
   * 使用SSE连接
   * @param url SSE连接地址
   * @param messageHandler 消息处理函数
   * @param listenerId 监听器ID（用于区分不同的监听器）
   * @param options 选项
   */
  const useSSE = (
    url: string,
    messageHandler: (event: MessageEvent) => void,
    listenerId: string,
    options?: UseSSEOptions,
  ) => {
    // 使用独立的SSE管理器，确保每个监听器都有独立的连接
    const manager = sseManagerSingleton.getIndependentManager(url, listenerId, options)
    const isConnected = ref(false)
    let connectTimer: ReturnType<typeof setTimeout> | null = null
    let isClosed = false
    const statusListenerId = `${listenerId}:status`

    manager.addStatusListener(statusListenerId, status => {
      isConnected.value = status === 'open'
    })

    const cleanup = () => {
      if (isClosed) return

      isClosed = true

      if (connectTimer) {
        clearTimeout(connectTimer)
        connectTimer = null
      }

      manager.removeStatusListener(statusListenerId)
      manager.removeMessageListener(listenerId)
      sseManagerSingleton.closeIndependentManager(url, listenerId)
      isConnected.value = false
    }

    onMounted(() => {
      // 延迟建立连接，确保组件完全挂载
      const connectDelay = options?.connectDelay || 100
      connectTimer = setTimeout(() => {
        connectTimer = null
        if (isClosed) return

        try {
          manager.addMessageListener(listenerId, messageHandler)
        } catch (error) {
          console.error('SSE连接建立失败:', error)
        }
      }, connectDelay)
    })

    onUnmounted(cleanup)

    return {
      manager,
      readyState: () => manager.readyState,
      close: cleanup,
      isConnected,
      forceReconnect: () => manager.forceReconnect(),
    }
  }

  /**
   * 使用定时器
   * @param id 定时器ID
   * @param callback 回调函数
   * @param interval 间隔时间（毫秒）
   * @param options 选项
   */
  const useTimer = (
    id: string,
    callback: () => void,
    interval: number,
    options?: {
      runInBackground?: boolean
      skipInitialRun?: boolean
    },
  ) => {
    onMounted(() => {
      addBackgroundTimer(id, callback, interval, options)
    })

    onUnmounted(() => {
      removeBackgroundTimer(id)
    })

    return {
      remove: () => removeBackgroundTimer(id),
    }
  }

  /**
   * 使用延迟SSE连接（类似原来的setTimeout延迟）
   * @param url SSE连接地址
   * @param messageHandler 消息处理函数
   * @param listenerId 监听器ID
   * @param delay 延迟时间（毫秒）
   * @param options SSE选项
   */
  const useDelayedSSE = (
    url: string,
    messageHandler: (event: MessageEvent) => void,
    listenerId: string,
    delay: number = 3000,
    options?: UseSSEOptions,
  ) => {
    // 使用独立的SSE管理器，确保每个监听器都有独立的连接
    const manager = sseManagerSingleton.getIndependentManager(url, listenerId, options)
    const isConnected = ref(false)
    let connectTimer: ReturnType<typeof setTimeout> | null = null
    let isClosed = false
    const statusListenerId = `${listenerId}:status`

    manager.addStatusListener(statusListenerId, status => {
      isConnected.value = status === 'open'
    })

    const cleanup = () => {
      if (isClosed) return

      isClosed = true

      if (connectTimer) {
        clearTimeout(connectTimer)
        connectTimer = null
      }

      manager.removeStatusListener(statusListenerId)
      manager.removeMessageListener(listenerId)
      sseManagerSingleton.closeIndependentManager(url, listenerId)
      isConnected.value = false
    }

    onMounted(() => {
      connectTimer = setTimeout(() => {
        connectTimer = null
        if (isClosed) return

        manager.addMessageListener(listenerId, messageHandler)
      }, delay)
    })

    onUnmounted(cleanup)

    return {
      manager,
      readyState: () => manager.readyState,
      close: cleanup,
      isConnected,
    }
  }

  /**
   * 使用进度SSE连接（用于进度监听）
   * @param url SSE连接地址
   * @param messageHandler 消息处理函数
   * @param listenerId 监听器ID
   * @param isActive 是否激活的响应式变量
   */
  const useProgressSSE = (
    url: string,
    messageHandler: (event: MessageEvent) => void,
    listenerId: string,
    isActive: Ref<boolean>,
  ) => {
    let managerUrl = ''
    const getManager = () => {
      managerUrl = appendLocaleParam(url)
      return sseManagerSingleton.getIndependentManager(managerUrl, listenerId, {
        backgroundCloseDelay: 1000, // 进度SSE更快关闭
        reconnectDelay: 1000,
        maxReconnectAttempts: 5,
      })
    }

    let manager: ReturnType<typeof getManager> | null = null
    let isListening = false

    const startProgress = () => {
      if (!isActive.value || isListening) return

      manager ??= getManager()
      manager.addMessageListener(listenerId, messageHandler)
      isListening = true
    }

    const stopProgress = (destroyManager = true) => {
      if (!manager) {
        isListening = false
        return
      }

      manager.removeMessageListener(listenerId)

      if (destroyManager) {
        sseManagerSingleton.closeIndependentManager(managerUrl || appendLocaleParam(url), listenerId)
        manager = null
        managerUrl = ''
      }

      isListening = false
    }

    // 进度监听有些场景会在用户操作后动态创建；只有 setup 阶段创建时才注册自动卸载钩子。
    if (getCurrentInstance()) {
      onUnmounted(() => {
        stopProgress(true)
      })
    }

    return {
      start: startProgress,
      stop: stopProgress,
      get manager() {
        return manager
      },
    }
  }

  /**
   * 使用数据刷新定时器（用于仪表盘等数据刷新）
   * @param id 定时器ID
   * @param loadDataFunc 加载数据函数
   * @param interval 刷新间隔（毫秒）
   * @param immediate 是否立即执行
   */
  const useDataRefresh = (
    id: string,
    loadDataFunc: () => Promise<void> | void,
    interval: number = 3000,
    immediate: boolean = true,
  ) => {
    const loading = ref(false)

    const wrappedLoadData = async () => {
      if (loading.value) return

      loading.value = true
      try {
        await loadDataFunc()
      } catch (error) {
        console.error(`数据刷新失败 [${id}]:`, error)
      } finally {
        loading.value = false
      }
    }

    onMounted(async () => {
      if (immediate) {
        await wrappedLoadData()
      }

      addBackgroundTimer(id, wrappedLoadData, interval, {
        runInBackground: false, // 后台不刷新数据
        skipInitialRun: true, // 已经手动执行过了
      })
    })

    onUnmounted(() => {
      removeBackgroundTimer(id)
    })

    return {
      loading,
      refresh: wrappedLoadData,
      stop: () => removeBackgroundTimer(id),
    }
  }

  /**
   * 使用条件性数据刷新定时器（用于需要动态启停的场景）
   * @param id 定时器ID
   * @param loadDataFunc 加载数据函数
   * @param condition 条件响应式引用，为true时启动定时器
   * @param interval 刷新间隔（毫秒）
   * @param immediate 是否立即执行
   */
  const useConditionalDataRefresh = (
    id: string,
    loadDataFunc: () => Promise<void> | void,
    condition: Ref<boolean>,
    interval: number = 3000,
    immediate: boolean = true,
  ) => {
    const loading = ref(false)
    const isTimerActive = ref(false)

    const wrappedLoadData = async () => {
      if (loading.value || !condition.value) return

      loading.value = true
      try {
        await loadDataFunc()
      } catch (error) {
        console.error(`条件数据刷新失败 [${id}]:`, error)
      } finally {
        loading.value = false
      }
    }

    const startTimer = () => {
      if (!isTimerActive.value && condition.value) {
        addBackgroundTimer(id, wrappedLoadData, interval, {
          runInBackground: false,
          skipInitialRun: !immediate,
        })
        isTimerActive.value = true
      }
    }

    const stopTimer = () => {
      if (isTimerActive.value) {
        removeBackgroundTimer(id)
        isTimerActive.value = false
      }
    }

    onMounted(() => {
      if (condition.value) {
        startTimer()
      }

      // 监听条件变化
      watch(condition, (newValue: boolean) => {
        if (newValue) {
          startTimer()
        } else {
          stopTimer()
        }
      })
    })

    onUnmounted(() => {
      stopTimer()
    })

    return {
      loading,
      refresh: wrappedLoadData,
      stop: stopTimer,
      start: startTimer,
      isActive: isTimerActive,
    }
  }

  return {
    useSSE,
    useTimer,
    useDelayedSSE,
    useProgressSSE,
    useDataRefresh,
    useConditionalDataRefresh,
  }
}
