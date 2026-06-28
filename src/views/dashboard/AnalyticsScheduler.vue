<script setup lang="ts">
import api from '@/api'
import type { ScheduleInfo, TransferQueue } from '@/api/types'
import { useI18n } from 'vue-i18n'
import { useBackground } from '@/composables/useBackground'

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

interface BackgroundTaskItem {
  color: string
  icon: string
  id: string
  progress?: number
  status: string
  subtitle: string
  title: string
}

// 将正在运行的服务和整理队列排在前面，再补充最近即将执行的定时任务。
const backgroundTasks = computed<BackgroundTaskItem[]>(() => {
  const runningSchedulers = schedulerList.value.filter(item => item.status === '正在运行')
  const waitingSchedulers = schedulerList.value.filter(item => item.status !== '正在运行')
  const schedulerTasks = [...runningSchedulers, ...waitingSchedulers].map(item => ({
    id: `schedule-${item.id}`,
    title: item.name || t('dashboard.scheduler'),
    subtitle: item.provider || item.next_run || '',
    status: item.status || t('dashboard.taskWaiting'),
    icon: item.status === '正在运行' ? 'mdi-progress-clock' : 'mdi-clock-outline',
    color: item.status === '正在运行' ? 'primary' : 'info',
    progress: item.status === '正在运行' ? undefined : 0,
  }))
  const transferTasks = transferQueue.value.map((item, index) => {
    const tasks = item.tasks ?? []
    const completed = tasks.filter(task => task.state === 'completed').length
    const progress = tasks.length ? Math.round((completed / tasks.length) * 100) : 0

    return {
      id: `transfer-${item.media?.tmdb_id ?? index}-${item.season ?? ''}`,
      title: item.media?.title_year || item.media?.title || t('dashboard.transferQueue'),
      subtitle: t('dashboard.transferProgress', { completed, total: tasks.length }),
      status: tasks.some(task => task.state === 'running') ? t('dashboard.taskRunning') : t('dashboard.taskWaiting'),
      icon: 'mdi-folder-sync-outline',
      color: 'warning',
      progress,
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
    const [schedulers, queue] = await Promise.all([
      api.get('dashboard/schedule'),
      api.get('transfer/queue'),
    ])
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
  10000, // 10秒间隔，及时反映整理队列和运行状态
  true // 立即执行
)
</script>

<template>
  <VCard class="dashboard-work-card dashboard-grid-fill">
    <VCardItem>
      <VCardTitle>{{ t('dashboard.scheduler') }}</VCardTitle>
      <template #append>
        <VBtn size="small" variant="outlined" to="/history">{{ t('dashboard.viewAll') }}</VBtn>
      </template>
    </VCardItem>

    <VCardText class="dashboard-work-content">
      <VList class="card-list">
        <VListItem v-for="item in backgroundTasks" :key="item.id" class="background-task-item">
          <template #prepend>
            <VAvatar size="38" variant="tonal" :color="item.color" class="me-3">
              <VIcon :icon="item.icon" size="20" />
            </VAvatar>
          </template>

          <VListItemTitle class="background-task-title">
            {{ item.title }}
          </VListItemTitle>
          <VListItemSubtitle class="background-task-subtitle">
            {{ item.subtitle }}
          </VListItemSubtitle>
          <VProgressLinear
            v-if="item.progress !== undefined"
            :model-value="item.progress"
            :color="item.color"
            height="2"
            rounded
            class="mt-2"
          />

          <template #append>
            <span class="background-task-status">{{ item.status }}</span>
            <VIcon icon="mdi-check-circle" :color="item.progress === 100 ? 'success' : item.color" size="15" />
          </template>
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
  --v-card-list-gap: 0.2rem;

  flex: 1 1 auto;
  min-block-size: 0;
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.background-task-item {
  min-block-size: 58px;
}

.background-task-item + .background-task-item {
  border-block-start: 1px solid rgba(var(--v-border-color), calc(var(--v-border-opacity) * 0.7));
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

.dashboard-work-content {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-block-size: 0;
  overflow: hidden;
}

.card-list::-webkit-scrollbar {
  display: none;
}

</style>
