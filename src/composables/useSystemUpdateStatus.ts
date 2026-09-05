import type { SystemUpdateStatus, SystemUpdateType } from '@/api/types'
import api from '@/api'

/** 头像菜单向全局升级提示发送的升级动作事件。 */
export const SYSTEM_UPDATE_MENU_EVENT = 'moviepilot:system-update-menu'

const status = ref<SystemUpdateStatus | null>(null)
const checking = ref(false)
let pollingConsumers = 0
let pollingTimer: ReturnType<typeof setTimeout> | null = null
let checkRequest: Promise<SystemUpdateStatus> | null = null

/** 共享后台更新状态，避免升级提示和头像菜单各自维护过期快照。 */
export function useSystemUpdateStatus() {
  async function loadStatus() {
    try {
      status.value = await api.get<SystemUpdateStatus>('system/update/status', { feedback: 'silent' })
    } catch (error) {
      console.error('[SystemUpdate] 获取更新状态失败', error)
    }
    schedulePolling()
    return status.value
  }

  /** 写入接口返回的最新状态，并按下载阶段切换轮询频率。 */
  function setStatus(nextStatus: SystemUpdateStatus) {
    status.value = nextStatus
    schedulePolling()
  }

  /** 立即检查更新并合并并发请求，成功后写入共享状态。 */
  function checkStatus(): Promise<SystemUpdateStatus> {
    if (checkRequest) return checkRequest

    checking.value = true
    checkRequest = api
      .post<SystemUpdateStatus>('system/update/check', undefined, { feedback: 'silent' })
      .then(nextStatus => {
        setStatus(nextStatus)
        return nextStatus
      })
      .finally(() => {
        checking.value = false
        checkRequest = null
      })
    return checkRequest
  }

  function clearPollingTimer() {
    if (pollingTimer) clearTimeout(pollingTimer)
    pollingTimer = null
  }

  function schedulePolling() {
    clearPollingTimer()
    if (pollingConsumers <= 0) return
    const hasActiveDownload = status.value?.updates?.some(item => ['downloading', 'installing'].includes(item.state))
    pollingTimer = setTimeout(
      async () => {
        await loadStatus()
      },
      hasActiveDownload ? 3000 : 60000,
    )
  }

  function startPolling() {
    pollingConsumers += 1
    if (pollingConsumers === 1) {
      void loadStatus()
    }
  }

  function stopPolling() {
    pollingConsumers = Math.max(0, pollingConsumers - 1)
    if (pollingConsumers === 0) clearPollingTimer()
  }

  function requestMenuUpdate(target: SystemUpdateType) {
    window.dispatchEvent(new CustomEvent(SYSTEM_UPDATE_MENU_EVENT, { detail: { target } }))
  }

  return { status, checking, checkStatus, loadStatus, setStatus, startPolling, stopPolling, requestMenuUpdate }
}
