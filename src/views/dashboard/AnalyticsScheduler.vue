<script setup lang="ts">
import api from '@/api'
import type { ScheduleInfo, TransferQueue } from '@/api/types'
import { useI18n } from 'vue-i18n'
import { useBackground } from '@/composables/useBackground'
import {
  getScheduleName,
  getScheduleNextRunText,
  getScheduleProvider,
  getScheduleStatusText,
  isScheduleRunning,
  useScheduleProgress,
} from '@/composables/useScheduleProgress'
import { getSchedulerVisual } from '@/utils/schedulerVisual'

// 国际化
const { t } = useI18n()
const { useDataRefresh } = useBackground()

// 输入参数
const props = defineProps({
  // 是否允许刷新数据
  allowRefresh: {
    type: Boolean,
    default: true,
  },
})

// 定时服务列表
const schedulerList = ref<ScheduleInfo[]>([])
const transferQueue = ref<TransferQueue[]>([])
const { getScheduleProgressText, getScheduleProgressValue } = useScheduleProgress(
  schedulerList,
  'dashboard-scheduler-progress',
)

interface BackgroundTaskItem {
  color: string
  icon: string
  id: string
  progress?: number
  status: string
  subtitle: string
  title: string
}

const BACKGROUND_TASK_RUNNING_ICON = 'mdi-loading'
const BACKGROUND_TASK_WAITING_ICON = 'mdi-clock-outline'

// 将正在运行的服务和整理队列排在前面，再补充最近即将执行的定时任务。
const backgroundTasks = computed<BackgroundTaskItem[]>(() => {
  const runningSchedulers = schedulerList.value.filter(isScheduleRunning)
  const waitingSchedulers = schedulerList.value.filter(item => !isScheduleRunning(item))
  const schedulerTasks = [...runningSchedulers, ...waitingSchedulers].map(item => {
    const isRunning = isScheduleRunning(item)
    const visual = getSchedulerVisual(item)

    return {
      id: `schedule-${item.id}`,
      title: getScheduleName(item) || t('dashboard.scheduler'),
      subtitle:
        (isRunning && getScheduleProgressText(item)) || getScheduleProvider(item) || getScheduleNextRunText(item),
      status: isRunning ? t('dashboard.taskRunning') : getScheduleStatusText(item) || t('dashboard.taskWaiting'),
      icon: visual.icon,
      color: visual.color,
      progress: isRunning ? getScheduleProgressValue(item) : undefined,
    }
  })
  const transferTasks = transferQueue.value.map((item, index) => {
    const tasks = item.tasks ?? []
    const completed = tasks.filter(task => task.state === 'completed').length
    const progress = tasks.length ? Math.round((completed / tasks.length) * 100) : 0
    const isRunning = tasks.some(task => task.state === 'running')

    return {
      id: `transfer-${item.media?.tmdb_id ?? index}-${item.season ?? ''}`,
      title: item.media?.title_year || item.media?.title || t('dashboard.transferQueue'),
      subtitle: t('dashboard.transferProgress', { completed, total: tasks.length }),
      status: isRunning ? t('dashboard.taskRunning') : t('dashboard.taskWaiting'),
      icon: 'mdi-folder-sync-outline',
      color: 'warning',
      progress: isRunning ? progress : undefined,
    }
  })

  return [...transferTasks, ...schedulerTasks]
})

// 调用API加载定时服务列表
async function loadSchedulerList() {
  if (!props.allowRefresh) {
    return
  }
  try {
    const [schedulers, queue] = await Promise.all([api.get('dashboard/schedule'), api.get('transfer/queue')])
    schedulerList.value = schedulers as unknown as ScheduleInfo[]
    transferQueue.value = queue as unknown as TransferQueue[]
  } catch (e) {
    console.log(e)
  }
}

// 使用数据刷新定时器
useDataRefresh(
  'dashboard-scheduler',
  loadSchedulerList,
  3000, // 3秒间隔，及时发现任务启停；运行中进度由独立轮询每秒刷新
  true, // 立即执行
)
</script>

<template>
  <VCard class="dashboard-work-card dashboard-grid-fill">
    <VCardItem>
      <VCardTitle>{{ t('dashboard.scheduler') }}</VCardTitle>
    </VCardItem>

    <VCardText class="dashboard-work-content">
      <VList class="card-list">
        <VListItem v-for="item in backgroundTasks" :key="item.id" class="background-task-item">
          <template #prepend>
            <VAvatar size="38" variant="tonal" :color="item.color" class="me-3">
              <VIcon :icon="item.icon" size="20" />
            </VAvatar>
          </template>

          <div class="background-task-body">
            <div class="background-task-summary">
              <div class="background-task-copy">
                <VListItemTitle class="background-task-title">
                  {{ item.title }}
                </VListItemTitle>
                <VListItemSubtitle class="background-task-subtitle">
                  {{ item.subtitle }}
                </VListItemSubtitle>
              </div>

              <div class="background-task-state">
                <span class="background-task-status">{{ item.status }}</span>
                <VIcon
                  :icon="item.progress === undefined ? BACKGROUND_TASK_WAITING_ICON : BACKGROUND_TASK_RUNNING_ICON"
                  :color="item.progress === undefined ? undefined : 'primary'"
                  :class="{
                    'background-task-running-icon': item.progress !== undefined,
                    'text-medium-emphasis': item.progress === undefined,
                  }"
                  size="15"
                />
              </div>
            </div>

            <VProgressLinear
              v-if="item.progress !== undefined"
              :model-value="item.progress"
              :color="item.color"
              height="2"
              rounded
              class="background-task-progress"
            />
          </div>
        </VListItem>
        <VListItem v-if="backgroundTasks.length === 0">
          <VListItemTitle class="text-center"> {{ t('dashboard.noSchedulers') }} </VListItemTitle>
        </VListItem>
      </VList>
    </VCardText>
  </VCard>
</template>

<style lang="scss" scoped>
.dashboard-work-card {
  display: flex;
  flex-direction: column;
  block-size: 100%;
  max-block-size: 350px;
  min-block-size: 350px;
}

.card-list {
  --v-card-list-gap: 0.45rem;

  overflow: hidden auto;
  flex: 1 1 auto;
  min-block-size: 0;
  overscroll-behavior: contain;
}

.background-task-item {
  border-radius: 0;
}

.background-task-body,
.background-task-copy {
  min-inline-size: 0;
}

.background-task-body {
  inline-size: 100%;
}

.background-task-summary {
  display: grid;
  align-items: center;
  gap: 0.75rem;
  grid-template-columns: minmax(0, 1fr) auto;
}

.background-task-state {
  display: flex;
  align-items: center;
}

.background-task-title {
  font-size: 0.82rem;
  font-weight: 600;
}

.background-task-subtitle,
.background-task-status {
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 0.68rem;
}

.background-task-status {
  margin-inline-end: 0.35rem;
  white-space: nowrap;
}

.background-task-progress {
  margin-block-start: 0.4rem;
}

.background-task-running-icon {
  animation: background-task-rotate 1s linear infinite;
}

.dashboard-work-content {
  display: flex;
  overflow: hidden;
  flex: 1 1 auto;
  flex-direction: column;
  min-block-size: 0;
}

.card-list::-webkit-scrollbar {
  display: none;
}

@keyframes background-task-rotate {
  from {
    transform: rotate(0deg);
  }

  to {
    transform: rotate(360deg);
  }
}
</style>
