<script lang="ts" setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import CryptoJS from 'crypto-js'
import { useDisplay } from 'vuetify'
import { useI18n } from 'vue-i18n'
import noImage from '@images/no-image.jpeg'
import { formatFileSize } from '@/@core/utils/formatters'
import api from '@/api'
import type { FileItem, MediaInfo, TransferQueue } from '@/api/types'
import { useBackground } from '@/composables/useBackground'
import { useGlobalSettingsStore } from '@/stores'
import { getDisplayImageUrl } from '@/utils/imageUtils'

type TransferTask = TransferQueue['tasks'][number]

interface MediaTaskGroup {
  media: TransferQueue['media']
  titleYear: string
  tasks: TransferTask[]
  total: number
  completed: number
}

// 多语言支持
const { t } = useI18n()
const { useProgressSSE } = useBackground()

// 显示器宽度
const display = useDisplay()

// 全局图片设置
const globalSettingsStore = useGlobalSettingsStore()
const globalSettings = globalSettingsStore.globalSettings

// 定义触发的自定义事件
const emit = defineEmits(['close'])

// 数据列表
const dataList = ref<TransferQueue[]>([])

// 文件进度映射
const fileProgressMap = ref<Map<string, { enable: boolean; value: number }>>(new Map())

// 进度是否激活
const progressActive = ref(false)

// 活动媒体
const activeTab = ref('')

// 定时器引用
const queueTimer = ref<NodeJS.Timeout | null>(null)

// 文件进度SSE连接映射
const fileProgressSSEMap = ref<Map<string, any>>(new Map())

// 状态标签
const stateDict = computed<Record<string, string>>(() => ({
  waiting: t('dialog.transferQueue.waitingState'),
  running: t('dialog.transferQueue.runningState'),
  completed: t('dialog.transferQueue.finishedState'),
  failed: t('dialog.transferQueue.failedState'),
  cancelled: t('dialog.transferQueue.cancelledState'),
}))

// 按媒体聚合队列，避免模板中重复扫描 dataList
const mediaTaskGroups = computed<MediaTaskGroup[]>(() => {
  const groupMap = new Map<string, MediaTaskGroup>()

  dataList.value.forEach(item => {
    const titleYear = item.media.title_year || ''
    let group = groupMap.get(titleYear)

    if (!group) {
      group = {
        media: item.media,
        titleYear,
        tasks: [],
        total: 0,
        completed: 0,
      }
      groupMap.set(titleYear, group)
    }

    group.tasks.push(...item.tasks)
    group.total += item.tasks.length
    group.completed += item.tasks.filter(task => task.state === 'completed').length
  })

  return Array.from(groupMap.values())
})

// 当前选中的媒体分组
const activeMediaGroup = computed(() => {
  return mediaTaskGroups.value.find(item => item.titleYear === activeTab.value)
})

// 当前媒体的文件任务
const activeTasks = computed(() => activeMediaGroup.value?.tasks ?? [])

// 队列任务总数
const totalTaskCount = computed(() => {
  return mediaTaskGroups.value.reduce((total, group) => total + group.total, 0)
})

// 已完成任务总数
const completedTaskCount = computed(() => {
  return mediaTaskGroups.value.reduce((total, group) => total + group.completed, 0)
})

// 当前媒体文件总大小
const activeMediaSize = computed(() => {
  return activeTasks.value.reduce((total, task) => total + (task.fileitem.size || 0), 0)
})

// 计算整体进度
const overallProgressComputed = computed(() => {
  return totalTaskCount.value > 0 ? (completedTaskCount.value / totalTaskCount.value) * 100 : 0
})

// 整体进度整数显示
const overallProgressDisplay = computed(() => Math.round(overallProgressComputed.value))

// 获取状态颜色。
function getStateColor(state: string) {
  if (state === 'running') return 'info'
  if (state === 'completed') return 'success'
  if (state === 'failed') return 'error'
  if (state === 'cancelled') return 'warning'
  return 'secondary'
}

// 获取状态图标。
function getStateIcon(state: string) {
  if (state === 'running') return 'mdi-progress-clock'
  if (state === 'completed') return 'mdi-check-circle-outline'
  if (state === 'failed') return 'mdi-alert-outline'
  if (state === 'cancelled') return 'mdi-cancel'
  return 'mdi-clock-outline'
}

// 获取媒体显示标题。
function getMediaTitle(media?: MediaInfo) {
  if (!media) return '-'
  if (media.title_year) return media.title_year
  return [media.title, media.year ? `（${media.year}）` : ''].filter(Boolean).join('') || '-'
}

// 获取适配全局图片设置的媒体海报地址。
function getPosterUrl(media?: MediaInfo) {
  const posterPath = media?.poster_path
  if (!posterPath) return noImage

  let posterUrl = posterPath
  if (posterPath.startsWith('/')) {
    posterUrl = `https://${globalSettings.TMDB_IMAGE_DOMAIN}/t/p/w500${posterPath}`
  } else {
    posterUrl = posterPath.replace('original', 'w500')
  }

  return getDisplayImageUrl(posterUrl, globalSettings.GLOBAL_IMAGE_CACHE)
}

// 获取媒体完成数量文本。
function getMediaCount(group: MediaTaskGroup) {
  return t('dialog.transferQueue.mediaProgressCount', {
    completed: group.completed,
    total: group.total,
  })
}

// 获取媒体完成进度。
function getMediaProgress(group: MediaTaskGroup) {
  return group.total > 0 ? (group.completed / group.total) * 100 : 0
}

// 获取文件实时进度信息。
function getFileProgress(filePath: string) {
  return fileProgressMap.value.get(filePath) || { enable: false, value: 0 }
}

// 获取文件任务的展示进度。
function getTaskProgress(task: TransferTask) {
  if (task.state === 'completed') return 100
  if (task.state !== 'running') return 0
  return getFileProgress(task.fileitem.path).value
}

// 调用API获取队列信息。
async function get_transfer_queue() {
  try {
    dataList.value = await api.get('transfer/queue')
    if (dataList.value.length > 0) {
      if (!activeTab.value || activeTasks.value.length === 0) activeTab.value = dataList.value[0].media.title_year || ''

      if (!progressActive.value) startLoadingProgress()
    } else if (progressActive.value) {
      stopLoadingProgress()
    }
  } catch (error) {
    console.error(error)
  }
}

// 移除队列任务。
async function remove_queue_task(fileitem: FileItem) {
  try {
    await api.delete('transfer/queue', { data: fileitem })
    get_transfer_queue()
  } catch (error) {
    console.error(error)
  }
}

// 创建文件进度SSE消息处理函数。
function createFileProgressHandler(filePath: string) {
  // 处理单个文件的进度消息。
  function handleFileProgressMessage(event: MessageEvent) {
    try {
      const progress = JSON.parse(event.data)
      if (progress) {
        fileProgressMap.value.set(filePath, {
          enable: progress.enable || false,
          value: progress.value || 0,
        })
      }
    } catch (error) {
      console.error('解析文件进度消息失败:', error)
    }
  }

  return handleFileProgressMessage
}

// 启动文件进度监听。
function startFileProgress(filePath: string) {
  if (fileProgressSSEMap.value.has(filePath)) return

  const filePathMd5 = CryptoJS.MD5(filePath).toString()
  const uniqueListenerId = `transfer-queue-file-progress-${filePathMd5}`
  const fileProgressUrl = `${import.meta.env.VITE_API_BASE_URL}system/progress/${filePathMd5}`
  const fileProgressSSE = useProgressSSE(
    fileProgressUrl,
    createFileProgressHandler(filePath),
    uniqueListenerId,
    progressActive,
  )

  fileProgressSSE.start()
  fileProgressSSEMap.value.set(filePath, fileProgressSSE)
}

// 停止所有文件进度监听。
function stopAllFileProgress() {
  fileProgressSSEMap.value.forEach(sse => sse.stop())
  fileProgressSSEMap.value.clear()
  fileProgressMap.value.clear()
}

// 监听队列变化，自动管理文件进度SSE
watch(
  dataList,
  newDataList => {
    const currentRunningFiles = new Set<string>()
    newDataList.forEach(item => {
      item.tasks.forEach(task => {
        if (task.state === 'running') currentRunningFiles.add(task.fileitem.path)
      })
    })

    const currentSSEFiles = new Set(fileProgressSSEMap.value.keys())
    currentSSEFiles.forEach(filePath => {
      if (!currentRunningFiles.has(filePath)) {
        fileProgressSSEMap.value.get(filePath)?.stop()
        fileProgressSSEMap.value.delete(filePath)
        fileProgressMap.value.delete(filePath)
      }
    })

    currentRunningFiles.forEach(filePath => {
      if (!fileProgressSSEMap.value.has(filePath)) startFileProgress(filePath)
    })
  },
  { deep: true },
)

// 使用SSE监听加载进度。
function startLoadingProgress() {
  progressActive.value = true
}

// 停止监听加载进度。
function stopLoadingProgress() {
  progressActive.value = false
  if (dataList.value.length === 0) stopAllFileProgress()
}

// 启动定时获取队列。
function startQueueTimer() {
  if (queueTimer.value) clearInterval(queueTimer.value)

  get_transfer_queue()
  queueTimer.value = setInterval(() => get_transfer_queue(), 3000)
}

// 停止定时获取队列。
function stopQueueTimer() {
  if (queueTimer.value) {
    clearInterval(queueTimer.value)
    queueTimer.value = null
  }
}

onMounted(() => startQueueTimer())

onUnmounted(() => {
  stopQueueTimer()
  stopLoadingProgress()
})
</script>

<template>
  <VDialog scrollable max-width="60rem" :fullscreen="!display.mdAndUp.value">
    <VCard class="mx-auto" width="100%">
      <VCardItem :class="{'py-2': dataList.length > 0}">
        <VDialogCloseBtn @click="emit('close')" />
        <template #prepend>
          <VIcon icon="mdi-menu" color="primary" size="28" class="me-2" />
        </template>
        <VCardTitle>{{ t('dialog.transferQueue.title') }}</VCardTitle>
        <VCardSubtitle v-if="dataList.length > 0">
          {{
            t('dialog.transferQueue.queueSummary', {
              media: mediaTaskGroups.length,
              tasks: totalTaskCount,
            })
          }}
        </VCardSubtitle>
      </VCardItem>

      <VDivider />

      <VCardText v-if="dataList.length === 0" class="transfer-queue-empty">
        <VIcon class="transfer-queue-empty__icon" icon="mdi-sync" size="30" />
        <div class="transfer-queue-empty__headline">
          {{ t('dialog.transferQueue.noTasks') }}
        </div>
        <div class="transfer-queue-empty__description">
          {{ t('dialog.transferQueue.noTasksHint') }}
        </div>
      </VCardText>

      <VCardText v-else class="transfer-queue-content">
        <section class="queue-overall app-surface-shape" :aria-label="t('dialog.transferQueue.overallProgress')">
          <div class="queue-overall__label">{{ t('dialog.transferQueue.overallProgress') }}</div>
          <div class="queue-overall__count">
            {{
              t('dialog.transferQueue.overallCount', {
                completed: completedTaskCount,
                total: totalTaskCount,
              })
            }}
          </div>
          <div class="queue-overall__value">{{ overallProgressDisplay }}%</div>
          <VProgressLinear
            class="queue-overall__progress"
            :model-value="overallProgressComputed"
            color="primary"
            bg-color="secondary"
            :height="6"
            rounded
          />
        </section>

        <div class="queue-main">
          <nav class="media-selector" :aria-label="t('dialog.transferQueue.mediaList')">
            <button
              v-for="group in mediaTaskGroups"
              :key="group.titleYear"
              type="button"
              class="media-selector__item app-surface-shape"
              :class="{ 'media-selector__item--active': activeTab === group.titleYear }"
              :aria-current="activeTab === group.titleYear ? 'true' : undefined"
              @click="activeTab = group.titleYear"
            >
              <VImg
                class="media-selector__poster"
                :src="getPosterUrl(group.media)"
                :alt="getMediaTitle(group.media)"
                cover
              />
              <div class="media-selector__info">
                <div class="media-selector__title">{{ getMediaTitle(group.media) }}</div>
                <div class="media-selector__meta">
                  <span>{{ getMediaCount(group) }}</span>
                  <span class="media-selector__percent">{{ Math.round(getMediaProgress(group)) }}%</span>
                </div>
                <VProgressLinear
                  :model-value="getMediaProgress(group)"
                  color="primary"
                  bg-color="secondary"
                  :height="4"
                  rounded
                />
              </div>
            </button>
          </nav>

          <section class="queue-detail">
            <header class="active-media">
              <VImg
                class="active-media__poster"
                :src="getPosterUrl(activeMediaGroup?.media)"
                :alt="getMediaTitle(activeMediaGroup?.media)"
                cover
              />
              <div class="active-media__info">
                <h3 class="active-media__title">{{ getMediaTitle(activeMediaGroup?.media) }}</h3>
                <p class="active-media__meta">
                  {{
                    t('dialog.transferQueue.mediaFileSummary', {
                      count: activeTasks.length,
                      size: formatFileSize(activeMediaSize),
                    })
                  }}
                </p>
              </div>
            </header>

            <div class="queue-task-header" aria-hidden="true">
              <span></span>
              <span>{{ t('dialog.transferQueue.fileName') }}</span>
              <span>{{ t('dialog.transferQueue.sizeTitle') }}</span>
              <span>{{ t('dialog.transferQueue.state') }}</span>
              <span>{{ t('dialog.transferQueue.progress') }}</span>
              <span>{{ t('dialog.transferQueue.operation') }}</span>
            </div>

            <div class="queue-task-list">
              <div v-for="task in activeTasks" :key="task.fileitem.path" class="queue-task">
                <VIcon
                  class="queue-task__state-icon"
                  :icon="getStateIcon(task.state)"
                  :color="getStateColor(task.state)"
                  size="22"
                />
                <div class="queue-task__content">
                  <div class="queue-task__name" :title="task.fileitem.name">
                    {{ task.fileitem.name }}
                  </div>
                  <div class="queue-task__size">{{ formatFileSize(task.fileitem.size || 0) }}</div>
                  <div class="queue-task__status">
                    <VChip size="small" :color="getStateColor(task.state)" variant="tonal">
                      {{ stateDict[task.state] }}
                    </VChip>
                  </div>
                  <div
                    class="queue-task__progress"
                    :class="{ 'queue-task__progress--completed': task.state === 'completed' }"
                  >
                    <VProgressLinear
                      v-if="task.state !== 'completed'"
                      :model-value="getTaskProgress(task)"
                      color="primary"
                      bg-color="secondary"
                      :height="5"
                      rounded
                    />
                    <span>{{ Math.round(getTaskProgress(task)) }}%</span>
                  </div>
                </div>
                <IconBtn
                  class="queue-task__action"
                  size="small"
                  icon="mdi-close-circle-outline"
                  :aria-label="t('dialog.transferQueue.cancelTask')"
                  :disabled="task.state === 'completed'"
                  @click="remove_queue_task(task.fileitem)"
                />
              </div>
            </div>
          </section>
        </div>
      </VCardText>
    </VCard>
  </VDialog>
</template>

<style scoped>
/* stylelint-disable selector-pseudo-class-no-unknown */

.transfer-queue-content {
  display: flex;
  overflow: hidden;
  flex-direction: column;
  padding: 1.5rem !important;
  min-block-size: 34rem;
  scrollbar-width: none;
}

.transfer-queue-content::-webkit-scrollbar,
.media-selector::-webkit-scrollbar,
.queue-task-list::-webkit-scrollbar {
  display: none;
}

.queue-overall {
  display: grid;
  align-items: center;
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  gap: 1.25rem;
  grid-template-columns: auto auto auto minmax(8rem, 1fr);
  padding-block: 1.15rem;
  padding-inline: 1.25rem;
}

.queue-overall__label {
  color: rgba(var(--v-theme-on-surface), 0.9);
  font-size: 0.95rem;
  font-weight: 600;
}

.queue-overall__count {
  color: rgba(var(--v-theme-on-surface), 0.65);
  font-size: 0.875rem;
}

.queue-overall__value {
  color: rgb(var(--v-theme-primary));
  font-size: 1.05rem;
  font-weight: 700;
}

.queue-overall__progress {
  min-inline-size: 0;
}

.queue-main {
  display: grid;
  overflow: hidden;
  flex: 1 1 auto;
  grid-template-columns: minmax(14rem, 19rem) minmax(0, 1fr);
  margin-block-start: 1.5rem;
  min-block-size: 0;
}

.media-selector {
  display: flex;
  flex-direction: column;
  border-inline-end: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  gap: 0.75rem;
  overflow-y: auto;
  padding-block: 0.25rem;
  padding-inline: 0.25rem 1rem;
  scrollbar-width: none;
}

.media-selector__item {
  position: relative;
  display: grid;
  align-items: center;
  padding: 0.9rem;
  border: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
  gap: 0.9rem;
  grid-template-columns: 4.25rem minmax(0, 1fr);
  inline-size: 100%;
  text-align: start;
  transition:
    background-color 0.18s ease,
    color 0.18s ease;
}

.media-selector__item + .media-selector__item {
  border-block-start: 0;
}

.media-selector__item::before {
  position: absolute;
  border-radius: var(--app-vuetify-rounded-pill);
  background: rgb(var(--v-theme-primary));
  block-size: 0;
  content: '';
  inline-size: 3px;
  inset-block-start: 50%;
  inset-inline-start: 0.25rem;
  transition:
    block-size 0.18s ease,
    inset-block-start 0.18s ease;
}

.media-selector__item:hover {
  background: rgba(var(--v-theme-on-surface), var(--v-hover-opacity));
}

.media-selector__item--active {
  background: rgba(var(--v-theme-primary), 0.08);
}

.media-selector__item--active::before {
  block-size: calc(100% - 1rem);
  inset-block-start: 0.5rem;
}

.media-selector__poster,
.active-media__poster {
  border-radius: var(--app-control-radius);
  background: rgba(var(--v-theme-on-surface), 0.06);
}

.media-selector__poster {
  flex: 0 0 4.25rem;
  aspect-ratio: 2 / 3;
  inline-size: 4.25rem;
  max-inline-size: 4.25rem;
}

.media-selector__info {
  min-inline-size: 0;
}

.media-selector__title {
  overflow: hidden;
  color: rgba(var(--v-theme-on-surface), 0.92);
  font-size: 0.92rem;
  font-weight: 600;
  line-height: 1.45;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.media-selector__meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: rgba(var(--v-theme-on-surface), 0.55);
  font-size: 0.78rem;
  gap: 0.75rem;
  margin-block: 0.65rem 0.4rem;
}

.media-selector__percent {
  color: rgb(var(--v-theme-primary));
}

.queue-detail {
  overflow: hidden;
  min-inline-size: 0;
  padding-inline-start: 1.5rem;
}

.active-media {
  display: flex;
  align-items: center;
  border-block-end: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  gap: 1rem;
  min-block-size: 7rem;
  padding-block: 0 1rem;
}

.active-media__poster {
  flex: 0 0 4rem;
  aspect-ratio: 2 / 3;
  inline-size: 4rem !important;
  max-inline-size: 4rem;
}

.active-media__info {
  min-inline-size: 0;
}

.active-media__title {
  margin: 0;
  color: rgba(var(--v-theme-on-surface), 0.95);
  font-size: 1.15rem;
  font-weight: 600;
  line-height: 1.45;
}

.active-media__meta {
  color: rgba(var(--v-theme-on-surface), 0.55);
  font-size: 0.86rem;
  margin-block: 0.5rem 0;
}

.queue-task-header,
.queue-task {
  display: grid;
  align-items: center;
  grid-template-columns: 2rem minmax(0, 1fr) 5.75rem 6.75rem 8.75rem 2.5rem;
}

.queue-task-header {
  border-block-end: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  color: rgba(var(--v-theme-on-surface), 0.5);
  font-size: 0.75rem;
  gap: 0.5rem;
  min-block-size: 3rem;
}

.queue-task-list {
  max-block-size: 23rem;
  overflow-y: auto;
  scrollbar-width: none;
}

.queue-task {
  border-block-end: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  gap: 0.5rem;
  min-block-size: 4.15rem;
}

.queue-task__content {
  display: contents;
}

.queue-task__name {
  overflow: hidden;
  color: rgba(var(--v-theme-on-surface), 0.9);
  font-size: 0.8rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.queue-task__size {
  color: rgba(var(--v-theme-on-surface), 0.62);
  font-size: 0.75rem;
}

.queue-task__status :deep(.v-chip) {
  max-inline-size: 100%;
}

.queue-task__progress {
  display: grid;
  align-items: center;
  color: rgba(var(--v-theme-on-surface), 0.6);
  font-size: 0.75rem;
  gap: 0.5rem;
  grid-template-columns: minmax(0, 1fr) auto;
}

.queue-task__progress--completed {
  display: block;
  text-align: end;
}

.queue-task__action {
  justify-self: end;
}

.transfer-queue-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  min-block-size: 13rem;
  padding-block: 2.5rem !important;
  padding-inline: 1.5rem !important;
  text-align: center;
}

.transfer-queue-empty__icon {
  color: rgba(var(--v-theme-on-surface), 0.32);
}

.transfer-queue-empty__headline {
  color: rgba(var(--v-theme-on-surface), 0.9);
  font-size: 1.15rem;
  font-weight: 600;
  line-height: 1.4;
}

.transfer-queue-empty__description {
  color: rgba(var(--v-theme-on-surface), 0.6);
  font-size: 0.92rem;
  line-height: 1.65;
  max-inline-size: 25rem;
}

@media (width <= 959.98px) {
  .transfer-queue-content {
    min-block-size: 0;
    overflow-y: auto;
    padding-block: 0.75rem calc(0.75rem + env(safe-area-inset-bottom)) !important;
    padding-inline: 1rem !important;
  }

  .queue-overall {
    flex: 0 0 auto;
    gap: 0.5rem 0.75rem;
    grid-template-columns: auto 1fr auto;
    padding-block: 0.75rem;
    padding-inline: 1rem;
  }

  .queue-overall__count {
    justify-self: center;
  }

  .queue-overall__progress {
    grid-column: 1 / -1;
    margin-block-start: 0.35rem;
  }

  .queue-main {
    display: block;
    overflow: visible;
    margin-block-start: 1rem;
  }

  .media-selector {
    flex-direction: row;
    border-inline-end: 0;
    gap: 0.75rem;
    margin-inline: -1rem;
    overflow: auto hidden;
    padding-block: 0.5rem 1rem;
    padding-inline: 1.25rem;
    scroll-snap-type: inline mandatory;
  }

  .media-selector__item {
    flex: 0 0 10rem;
    padding: 0.5rem;
    border: 1px solid transparent;
    gap: 0.5rem;
    grid-template-columns: 3.5rem minmax(0, 1fr);
    scroll-snap-align: start;
  }

  .media-selector__item + .media-selector__item {
    border-block-start-color: transparent;
  }

  .media-selector__item--active {
    border-color: rgba(var(--v-theme-primary), 0.2);
  }

  .media-selector__poster {
    flex-basis: 3.25rem;
    inline-size: 3.25rem;
    max-inline-size: 3.25rem;
  }

  .media-selector__title {
    display: -webkit-box;
    overflow: hidden;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    white-space: normal;
  }

  .media-selector__meta {
    font-size: 0.68rem;
    gap: 0.25rem;
  }

  .media-selector__meta > span {
    white-space: nowrap;
  }

  .queue-detail {
    overflow: visible;
    padding-inline-start: 0;
  }

  .active-media {
    min-block-size: 7rem;
    padding-block: 0.75rem;
  }

  .active-media__poster {
    flex-basis: 3.25rem;
    inline-size: 3.25rem !important;
    max-inline-size: 3.25rem;
  }

  .active-media__title {
    font-size: 1.1rem;
  }

  .queue-task-header {
    display: none;
  }

  .queue-task-list {
    overflow: visible;
    max-block-size: none;
  }

  .queue-task {
    align-items: start;
    gap: 0.75rem;
    grid-template-columns: 2rem minmax(0, 1fr) 2.75rem;
    min-block-size: 0;
    padding-block: 1rem;
  }

  .queue-task__state-icon {
    margin-block-start: 0.15rem;
  }

  .queue-task__content {
    display: flex;
    flex-direction: column;
    min-inline-size: 0;
  }

  .queue-task__name {
    font-size: 0.9rem;
    line-height: 1.45;
  }

  .queue-task__size {
    font-size: 0.8rem;
    margin-block-start: 0.55rem;
  }

  .queue-task__status {
    margin-block-start: 0.45rem;
  }

  .queue-task__progress {
    margin-block-start: 0.75rem;
  }

  .queue-task__progress--completed {
    display: none;
  }

  .queue-task__action {
    align-self: start;
    margin-block-start: -0.35rem;
  }
}

@media (width <= 600px) {
  .transfer-queue-empty {
    min-block-size: 11rem;
    padding-block: 2rem !important;
    padding-inline: 1rem !important;
  }

  .transfer-queue-empty__headline {
    font-size: 1.05rem;
  }

  .transfer-queue-empty__description {
    font-size: 0.9rem;
  }
}
</style>
