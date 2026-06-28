import api from '@/api'
import type { ApiResponse, ScheduleInfo, ScheduleProgress } from '@/api/types'
import { useBackground } from '@/composables/useBackground'
import type { Ref } from 'vue'

const SCHEDULE_PROGRESS_REFRESH_INTERVAL = 1000

/** 判断定时服务是否仍在运行，兼容列表状态与进度详情两种后端信号。 */
export function isScheduleRunning(schedule: ScheduleInfo) {
  return (
    schedule.status === '正在运行' ||
    schedule.progress_enable === true ||
    schedule.progress_detail?.enable === true ||
    schedule.progress_detail?.status === 'running'
  )
}

/** 为定时服务列表提供仅针对运行中任务的实时进度轮询。 */
export function useScheduleProgress(schedules: Ref<ScheduleInfo[]>, refreshId: string) {
  const { useDataRefresh } = useBackground()
  const progressById = ref<Record<string, ScheduleProgress>>({})

  /** 请求指定运行中任务的最新进度。 */
  async function loadScheduleProgress(schedule: ScheduleInfo) {
    const response = (await api.get(
      `dashboard/schedule/${encodeURIComponent(schedule.id)}/progress`,
    )) as ApiResponse<ScheduleProgress>

    return response.success ? response.data : undefined
  }

  /** 刷新所有运行中任务的进度，并清理已经停止任务的缓存。 */
  async function refreshRunningProgress() {
    const runningSchedules = schedules.value.filter(
      schedule => schedule.id && isScheduleRunning(schedule),
    )
    const runningIds = new Set(runningSchedules.map(schedule => schedule.id))
    const nextProgress = Object.fromEntries(
      Object.entries(progressById.value).filter(([id]) => runningIds.has(id)),
    )

    if (!runningSchedules.length) {
      progressById.value = {}
      return
    }

    const results = await Promise.allSettled(runningSchedules.map(loadScheduleProgress))
    const currentRunningIds = new Set(
      schedules.value
        .filter(schedule => schedule.id && isScheduleRunning(schedule))
        .map(schedule => schedule.id),
    )

    results.forEach((result, index) => {
      const schedule = runningSchedules[index]
      if (result.status === 'fulfilled' && result.value && currentRunningIds.has(schedule.id)) {
        nextProgress[schedule.id] = result.value
      }
    })

    progressById.value = Object.fromEntries(
      Object.entries(nextProgress).filter(([id]) => currentRunningIds.has(id)),
    )
  }

  /** 获取任务当前应展示的百分比，并限制在合法范围内。 */
  function getScheduleProgressValue(schedule: ScheduleInfo) {
    const value = Number(progressById.value[schedule.id]?.value ?? schedule.progress ?? 0)

    return Math.min(Math.max(value, 0), 100)
  }

  /** 获取任务当前应展示的进度说明。 */
  function getScheduleProgressText(schedule: ScheduleInfo) {
    return progressById.value[schedule.id]?.text || schedule.progress_text || ''
  }

  useDataRefresh(refreshId, refreshRunningProgress, SCHEDULE_PROGRESS_REFRESH_INTERVAL, true)

  return {
    getScheduleProgressText,
    getScheduleProgressValue,
    refreshRunningProgress,
  }
}
