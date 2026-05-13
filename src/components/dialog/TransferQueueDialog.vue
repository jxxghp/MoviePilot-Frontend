<script lang="ts" setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { formatFileSize } from '@/@core/utils/formatters'
import api from '@/api'
import { FileItem, TransferQueue } from '@/api/types'
import { useDisplay } from 'vuetify'
import { useI18n } from 'vue-i18n'
import { useBackgroundOptimization } from '@/composables/useBackgroundOptimization'
import CryptoJS from 'crypto-js'

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
const { useProgressSSE } = useBackgroundOptimization()

// 显示器宽度
const display = useDisplay()
// 定义触发的自定义事件
const emit = defineEmits(['close'])

// 数据列表
const dataList = ref<TransferQueue[]>([])

// 整体进度相关 - 根据完成的文件计算
const overallProgress = ref({
  value: 0,
  text: t('dialog.transferQueue.processing'),
})

// 文件进度映射
const fileProgressMap = ref<Map<string, { enable: boolean; value: number }>>(new Map())

// 进度是否激活
const progressActive = ref(false)

// 活动标签
const activeTab = ref('')

// 定时器引用
const queueTimer = ref<NodeJS.Timeout | null>(null)

// 状态标签
const stateDict: { [key: string]: string } = {
  'waiting': t('dialog.transferQueue.waitingState'),
  'running': t('dialog.transferQueue.runningState'),
  'completed': t('dialog.transferQueue.finishedState'),
  'failed': t('dialog.transferQueue.failedState'),
  'cancelled': t('dialog.transferQueue.cancelledState'),
}

// 获取状态颜色
function getStateColor(state: string) {
  if (state === 'waiting') return 'gray'
  else if (state === 'running') return 'primary'
  else if (state === 'completed') return 'success'
  else return 'error'
}

// 按媒体聚合队列，避免模板中按 tab 重复扫描 dataList
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

// 从dataList中提取所有的媒体信息，合并相同title_year的记录
const mediaList = computed(() => {
  return mediaTaskGroups.value.map(group => group.media)
})

// 按media计算总数和完成数，返回 x/x
function getMediaCount(title_year: string) {
  const group = mediaTaskGroups.value.find(item => item.titleYear === title_year)
  return `${group?.completed ?? 0} / ${group?.total ?? 0}`
}

// 根据媒体信息获取对应的整理任务，合并相同title_year的所有任务
const activeTasks = computed(() => {
  return mediaTaskGroups.value.find(item => item.titleYear === activeTab.value)?.tasks ?? []
})

// 根据媒体title_year获取对应的任务列表
function getTasksByMedia(title_year: string) {
  return mediaTaskGroups.value.find(item => item.titleYear === title_year)?.tasks ?? []
}

// 计算整体进度
const overallProgressComputed = computed(() => {
  const totalTasks = mediaTaskGroups.value.reduce((total, group) => total + group.total, 0)
  const completedTasks = mediaTaskGroups.value.reduce((total, group) => total + group.completed, 0)

  return totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0
})

// 获取文件进度
function getFileProgress(filePath: string) {
  return fileProgressMap.value.get(filePath) || { enable: false, value: 0 }
}

// 调用API获取队列信息
async function get_transfer_queue() {
  try {
    dataList.value = await api.get('transfer/queue')
    if (dataList.value.length > 0) {
      if (!activeTab.value || activeTasks.value?.length == 0) activeTab.value = dataList.value[0].media.title_year || ''

      // 如果有数据且SSE未启动，则启动SSE监听
      if (!progressActive.value) {
        startLoadingProgress()
      }
    } else {
      // 如果没有数据，停止SSE监听
      if (progressActive.value) {
        stopLoadingProgress()
      }
    }
  } catch (error) {
    console.error(error)
  }
}

// 移除队列任务
async function remove_queue_task(fileitem: FileItem) {
  try {
    await api.delete(`transfer/queue`, { data: fileitem })
    get_transfer_queue()
  } catch (error) {
    console.error(error)
  }
}

// 文件进度SSE消息处理函数
function createFileProgressHandler(filePath: string) {
  return function handleFileProgressMessage(event: MessageEvent) {
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
}

// 文件进度SSE连接映射
const fileProgressSSEMap = ref<Map<string, any>>(new Map())

// 启动文件进度监听
function startFileProgress(filePath: string) {
  if (fileProgressSSEMap.value.has(filePath)) {
    return // 已经存在连接
  }

  // filePath计算md5
  const filePathMd5 = CryptoJS.MD5(filePath).toString()
  // 使用包含文件路径的唯一监听器ID
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

// 停止所有文件进度监听
function stopAllFileProgress() {
  fileProgressSSEMap.value.forEach((sse, filePath) => {
    sse.stop()
  })
  fileProgressSSEMap.value.clear()
  fileProgressMap.value.clear()
}

// 监听队列变化，自动管理文件进度SSE
watch(
  dataList,
  newDataList => {
    // 获取当前正在运行的文件路径集合
    const currentRunningFiles = new Set<string>()
    newDataList.forEach(item => {
      item.tasks.forEach(task => {
        if (task.state === 'running') {
          currentRunningFiles.add(task.fileitem.path)
        }
      })
    })

    // 获取当前已建立SSE连接的文件路径集合
    const currentSSEFiles = new Set(fileProgressSSEMap.value.keys())

    // 停止不再需要的SSE连接
    currentSSEFiles.forEach(filePath => {
      if (!currentRunningFiles.has(filePath)) {
        const sse = fileProgressSSEMap.value.get(filePath)
        if (sse) {
          sse.stop()
          fileProgressSSEMap.value.delete(filePath)
        }
        // 清除对应的进度数据
        fileProgressMap.value.delete(filePath)
      }
    })

    // 为新的运行中文件建立SSE连接
    currentRunningFiles.forEach(filePath => {
      if (!fileProgressSSEMap.value.has(filePath)) {
        startFileProgress(filePath)
      }
    })
  },
  { deep: true },
)

// 使用SSE监听加载进度
function startLoadingProgress() {
  overallProgress.value.text = t('dialog.transferQueue.processing')
  progressActive.value = true
}

// 停止监听加载进度
function stopLoadingProgress() {
  progressActive.value = false
  // 只有在没有数据时才停止所有文件进度监听
  if (dataList.value.length === 0) {
    stopAllFileProgress()
  }
}

// 启动定时获取队列
function startQueueTimer() {
  // 清除可能存在的定时器
  if (queueTimer.value) {
    clearInterval(queueTimer.value)
  }

  // 立即执行一次
  get_transfer_queue()

  // 设置3秒定时器
  queueTimer.value = setInterval(() => {
    get_transfer_queue()
  }, 3000)
}

// 停止定时获取队列
function stopQueueTimer() {
  if (queueTimer.value) {
    clearInterval(queueTimer.value)
    queueTimer.value = null
  }
}

onMounted(() => {
  startQueueTimer()
})

onUnmounted(() => {
  stopQueueTimer()
  stopLoadingProgress()
})
</script>

<template>
  <VDialog scrollable max-width="60rem" :fullscreen="!display.mdAndUp.value">
    <VCard class="mx-auto" width="100%">
      <VCardItem>
        <VCardTitle>{{ t('dialog.transferQueue.title') }}</VCardTitle>
      </VCardItem>
      <VDialogCloseBtn @click="emit('close')" />

      <!-- 整体进度显示 -->
      <VProgressLinear v-if="dataList.length > 0" :model-value="overallProgressComputed" color="primary" />
      <VDivider v-else />

      <VCardText v-if="dataList.length === 0" class="text-center">
        {{ t('dialog.transferQueue.noTasks') }}
      </VCardText>

      <VCardText v-if="dataList.length > 0">
        <VTabs v-model="activeTab" show-arrows class="v-tabs-pill" stacked>
          <VTab
            v-for="media in mediaList"
            :value="media.title_year"
            selected-class="v-slide-group-item--active v-tab--selected"
          >
            <div class="font-bold text-lg">{{ media.title }}</div>
            <div>({{ getMediaCount(media.title_year || '') }})</div>
          </VTab>
        </VTabs>
        <VWindow v-model="activeTab" class="mt-5 disable-tab-transition" :touch="false">
          <VWindowItem v-for="media in mediaList" :value="media.title_year">
            <VList>
              <VListItem v-for="task in getTasksByMedia(media.title_year || '')" :key="task.fileitem.path">
                <VListItemTitle>{{ task.fileitem.name }}</VListItemTitle>
                <VListItemSubtitle class="py-1">
                  {{ t('dialog.transferQueue.sizeTitle') }}：{{ formatFileSize(task.fileitem.size || 0) }}
                  <VChip size="small" :color="getStateColor(task.state)" class="mx-2">
                    {{ stateDict[task.state] }}
                  </VChip>
                </VListItemSubtitle>

                <!-- 文件进度显示 -->
                <div v-if="task.state === 'running' && getFileProgress(task.fileitem.path).enable" class="mt-2">
                  <VProgressLinear
                    :model-value="getFileProgress(task.fileitem.path).value"
                    color="success"
                    class="mb-1"
                    :height="3"
                  />
                  <div class="text-xs text-medium-emphasis text-center">
                    {{ getFileProgress(task.fileitem.path).value.toFixed(1) }}%
                  </div>
                </div>
                <template #append>
                  <IconBtn
                    size="small"
                    icon="mdi-cancel"
                    @click="remove_queue_task(task.fileitem)"
                    :disabled="task.state === 'completed'"
                  />
                </template>
              </VListItem>
            </VList>
          </VWindowItem>
        </VWindow>
      </VCardText>
    </VCard>
  </VDialog>
</template>
