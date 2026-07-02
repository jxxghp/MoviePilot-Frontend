import { computed, ref } from 'vue'
import { useOnline } from '@vueuse/core'

export type ConnectionStatus = 'online' | 'checking' | 'offline'
export type ConnectionFailureReason = 'browser-offline' | 'network-error' | 'timeout' | 'server-unreachable'

const browserOnline = useOnline()
const connectionStatus = ref<ConnectionStatus>('online')
const connectionReason = ref<ConnectionFailureReason | null>(null)
const connectionCheckRequestId = ref(0)
const serverSuccessSequence = ref(0)

/** 管理 MoviePilot 服务的全局连接状态。 */
export function useGlobalOfflineStatus() {
  const isOnline = computed(() => connectionStatus.value === 'online')
  const isChecking = computed(() => connectionStatus.value === 'checking')
  const isOffline = computed(() => connectionStatus.value === 'offline')
  const canPerformNetworkAction = computed(() => connectionStatus.value !== 'offline')

  /** 记录任意 MoviePilot API 成功响应并恢复在线状态。 */
  function markServerOnline() {
    connectionStatus.value = 'online'
    connectionReason.value = null
    serverSuccessSequence.value += 1
  }

  /** 将连接状态标记为待确认，但不直接阻断页面操作。 */
  function markConnectionChecking(reason?: ConnectionFailureReason) {
    connectionStatus.value = 'checking'
    if (reason) connectionReason.value = reason
  }

  /** 在权威探测失败后标记 MoviePilot 服务不可达。 */
  function markServerOffline(reason: ConnectionFailureReason = 'server-unreachable') {
    connectionStatus.value = 'offline'
    connectionReason.value = reason
  }

  /** 将普通请求的网络错误降级为待确认状态，并请求一次去重后的服务探测。 */
  function reportNetworkError(reason: ConnectionFailureReason = 'network-error') {
    markConnectionChecking(reason)
    connectionCheckRequestId.value += 1
  }

  /** 请求立即检查 MoviePilot 服务连接。 */
  function requestConnectionCheck(reason?: ConnectionFailureReason) {
    markConnectionChecking(reason)
    connectionCheckRequestId.value += 1
  }

  return {
    browserOnline,
    connectionStatus,
    connectionReason,
    connectionCheckRequestId,
    serverSuccessSequence,
    isOnline,
    isChecking,
    isOffline,
    canPerformNetworkAction,
    markServerOnline,
    markConnectionChecking,
    markServerOffline,
    reportNetworkError,
    requestConnectionCheck,
  }
}

/** 为单个组件提供 MoviePilot 服务连接状态。 */
export function useOfflineStatus() {
  const status = useGlobalOfflineStatus()

  return {
    browserOnline: status.browserOnline,
    isOnline: status.isOnline,
    isChecking: status.isChecking,
    isOffline: status.isOffline,
    canPerformNetworkAction: status.canPerformNetworkAction,
    connectionReason: status.connectionReason,
    requestConnectionCheck: status.requestConnectionCheck,
  }
}
