import type { ConnectionAwareRequestConfig } from '@/api'
import type { ConnectionFailureReason, useGlobalOfflineStatus } from '@/composables/useOfflineStatus'
import { toValue, type MaybeRefOrGetter } from 'vue'

interface ServerConnectionProbeOptions {
  /** 当前会话是否已具备访问 MoviePilot API 的登录态。 */
  isLoggedIn: MaybeRefOrGetter<unknown>
  /** 系统是否处于主动重启流程。 */
  isRestarting: MaybeRefOrGetter<boolean>
  /** 全局连接状态及其唯一写入操作。 */
  offlineStatus: ReturnType<typeof useGlobalOfflineStatus>
  /** 使用静默连接选项请求 MoviePilot API。 */
  request: (path: string, config: ConnectionAwareRequestConfig) => Promise<unknown>
}

const SERVER_PROBE_TIMEOUT_MS = 8_000
const SERVER_PROBE_FAILURE_THRESHOLD = 2
const SERVER_RETRY_DELAYS_MS = [2_000, 5_000, 10_000, 30_000] as const
const SERVER_HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000

/** 编排 MoviePilot 服务探测、退避重试和在线心跳。 */
export function useServerConnectionProbe(options: ServerConnectionProbeOptions) {
  let heartbeatInterval: number | null = null
  let connectionRetryTimer: number | null = null
  let connectionProbePromise: Promise<boolean> | null = null
  let connectionProbeFailures = 0

  /** 清除等待中的服务重连任务。 */
  function clearConnectionRetryTimer() {
    if (!connectionRetryTimer) return

    window.clearTimeout(connectionRetryTimer)
    connectionRetryTimer = null
  }

  /** 根据浏览器状态和请求错误判断本次探测失败原因。 */
  function resolveProbeFailureReason(error: unknown): ConnectionFailureReason {
    if (!options.offlineStatus.browserOnline.value) return 'browser-offline'

    const errorCode = (error as { code?: string } | null)?.code
    if (errorCode === 'ECONNABORTED' || errorCode === 'ETIMEDOUT') return 'timeout'

    return 'server-unreachable'
  }

  /** 按退避间隔安排下一次 MoviePilot 服务探测。 */
  function scheduleConnectionRetry() {
    clearConnectionRetryTimer()

    const retryIndex = Math.min(Math.max(connectionProbeFailures - 1, 0), SERVER_RETRY_DELAYS_MS.length - 1)
    connectionRetryTimer = window.setTimeout(() => {
      connectionRetryTimer = null
      void probeServerConnection()
    }, SERVER_RETRY_DELAYS_MS[retryIndex])
  }

  /** 使用后端 ping 接口执行去重后的权威服务连通性探测。 */
  async function probeServerConnection(showChecking = false): Promise<boolean> {
    if (!toValue(options.isLoggedIn)) return false
    if (connectionProbePromise) return connectionProbePromise

    clearConnectionRetryTimer()
    if (showChecking) {
      options.offlineStatus.markConnectionChecking(options.offlineStatus.connectionReason.value ?? undefined)
    }

    const successSequenceAtProbeStart = options.offlineStatus.serverSuccessSequence.value
    const probePromise = (async () => {
      try {
        await options.request('system/ping', {
          feedback: 'silent',
          skipNavigationCancellation: true,
          skipConnectionTracking: true,
          timeout: SERVER_PROBE_TIMEOUT_MS,
        })
        connectionProbeFailures = 0
        return true
      } catch (error) {
        if (!toValue(options.isLoggedIn)) {
          options.offlineStatus.markServerOnline()
          return false
        }

        // 探测期间若已有其他接口成功，则以更新的成功响应为准，避免旧失败覆盖新状态。
        if (options.offlineStatus.serverSuccessSequence.value > successSequenceAtProbeStart) {
          connectionProbeFailures = 0
          return true
        }

        // 重启期间服务不可达属预期行为，由重启进度弹窗承载反馈，不累计离线阈值。
        if (toValue(options.isRestarting)) return false

        connectionProbeFailures += 1
        const failureReason = resolveProbeFailureReason(error)

        if (connectionProbeFailures >= SERVER_PROBE_FAILURE_THRESHOLD) {
          options.offlineStatus.markServerOffline(failureReason)
        } else {
          options.offlineStatus.markConnectionChecking(failureReason)
        }

        scheduleConnectionRetry()
        return false
      }
    })()

    connectionProbePromise = probePromise
    try {
      return await probePromise
    } finally {
      if (connectionProbePromise === probePromise) connectionProbePromise = null
    }
  }

  /** 清除失败计数和等待中的重试，用于任意 API 已证明服务恢复在线的场景。 */
  function resetAfterServerOnline() {
    connectionProbeFailures = 0
    clearConnectionRetryTimer()
  }

  /** 启动即时服务探测和五分钟在线心跳。 */
  function startHeartbeat() {
    if (heartbeatInterval) window.clearInterval(heartbeatInterval)

    void probeServerConnection()
    heartbeatInterval = window.setInterval(() => {
      if (toValue(options.isLoggedIn)) void probeServerConnection()
    }, SERVER_HEARTBEAT_INTERVAL_MS)
  }

  /** 停止心跳、重试和失败计数。 */
  function stopHeartbeat() {
    if (heartbeatInterval) {
      window.clearInterval(heartbeatInterval)
      heartbeatInterval = null
    }

    resetAfterServerOnline()
  }

  return {
    probeServerConnection,
    resetAfterServerOnline,
    startHeartbeat,
    stopHeartbeat,
  }
}
