<script setup lang="ts">
import { debounce } from 'lodash-es'
import { useToast } from 'vue-toastification'
import api from '@/api'
import type { StorageConf, TransferHistory } from '@/api/types'
import ReorganizeDialog from '@/components/dialog/ReorganizeDialog.vue'
import TransferQueueDialog from '@/components/dialog/TransferQueueDialog.vue'
import ProgressDialog from '@/components/dialog/ProgressDialog.vue'
import { useRoute } from 'vue-router'
import router from '@/router'
import { useDisplay } from 'vuetify'
import { formatFileSize } from '@/@core/utils/formatters'
import { useI18n } from 'vue-i18n'
import { usePWA } from '@/composables/usePWA'
import { useDynamicButton } from '@/composables/useDynamicButton'
import { useAvailableHeight } from '@/composables/useAvailableHeight'
import { useBackground } from '@/composables/useBackground'
import { useGlobalSettingsStore } from '@/stores'
import { openSharedDialog } from '@/composables/useSharedDialog'

const TransferHistoryDeleteDialog = defineAsyncComponent(() => import('@/components/dialog/TransferHistoryDeleteDialog.vue'))

// i18n
const { t } = useI18n()

// 全局设置
const globalSettingsStore = useGlobalSettingsStore()

// APP
const display = useDisplay()
// PWA模式检测
const { appMode } = usePWA()
const { useProgressSSE } = useBackground()

// 计算列表可用高度
// componentOffset = VCardItem搜索栏(68) + VDivider(1) + 分页栏(40) + VCard边距(2) = 111
const { availableHeight } = useAvailableHeight(125, 300)

// 提示框
const $toast = useToast()

// 路由
const route = useRoute()
let syncingRouteQuery = false
let fetchDataRequestSeed = 0

// 组合式输入法状态
const isComposing = ref(false)

// 当前操作记录
const currentHistory = ref<TransferHistory>()

// AI整理中的记录
const aiRedoIds = ref<number[]>([])

// AI整理进度
const aiRedoProgressActive = ref(false)
const aiRedoProgressText = ref(t('transferHistory.actions.aiRedoPending'))
const aiRedoProgressSSE = ref<any>(null)
const aiRedoProgressHistoryIds = ref<number[]>([])
let aiRedoProgressDialogController: ReturnType<typeof openSharedDialog> | null = null
let progressDialogController: ReturnType<typeof openSharedDialog> | null = null
let deleteDialogController: ReturnType<typeof openSharedDialog> | null = null

// 重新整理IDS
const redoIds = ref<number[]>([])
const redoTargetStorage = ref<string>()

// 已选中的数据
const selected = ref<TransferHistory[]>([])

const getNum = (s?: string) => (s ? parseInt(s.replace(/[^0-9]/g, ''), 10) || 0 : 0)

function sortByTitle(a: TransferHistory, b: TransferHistory) {
  if (a.type !== b.type) {
    return (a.type ?? '').localeCompare(b.type ?? '')
  }
  if (a.title !== b.title) {
    return (a.title ?? '').toLocaleLowerCase().localeCompare((b.title ?? '').toLocaleLowerCase())
  }
  if (a.type === '电视剧') {
    if (a.seasons !== b.seasons) {
      return getNum(a.seasons) - getNum(b.seasons)
    }
    if (a.episodes !== b.episodes) {
      return getNum(a.episodes) - getNum(b.episodes)
    }
  }
  return 0
}

function sortBySourceSize(a: TransferHistory, b: TransferHistory) {
  return (a.src_fileitem?.size ?? 0) - (b.src_fileitem?.size ?? 0)
}

// 表头
const headers = [
  {
    title: t('transferHistory.titleColumn'),
    key: 'title',
    sortable: true,
    sortRaw: sortByTitle,
  },
  {
    title: t('transferHistory.pathColumn'),
    key: 'src',
    sortable: true,
  },
  {
    title: t('transferHistory.modeColumn'),
    key: 'mode',
    sortable: true,
  },
  {
    title: t('transferHistory.sizeColumn'),
    key: 'size',
    sortable: true,
    sortRaw: sortBySourceSize,
  },
  {
    title: t('transferHistory.dateColumn'),
    key: 'date',
    sortable: true,
  },
  {
    title: t('transferHistory.statusColumn'),
    key: 'status',
    sortable: true,
  },
  {
    title: '',
    key: 'actions',
    sortable: false,
  },
]

// 分组表头
const groupHeaders = [
  {
    title: t('transferHistory.seasonEpisode'),
    key: 'title',
    sortable: true,
    sortRaw: sortByTitle,
  },
  {
    title: t('transferHistory.pathColumn'),
    key: 'src',
    sortable: true,
  },
  {
    title: t('transferHistory.modeColumn'),
    key: 'mode',
    sortable: true,
  },
  {
    title: t('transferHistory.sizeColumn'),
    key: 'size',
    sortable: true,
    sortRaw: sortBySourceSize,
  },
  {
    title: t('transferHistory.dateColumn'),
    key: 'date',
    sortable: true,
  },
  {
    title: t('transferHistory.statusColumn'),
    key: 'status',
    sortable: true,
  },
  {
    title: '',
    key: 'actions',
    sortable: false,
  },
]

const pageRange = [
  { title: '25', value: 25 },
  { title: '50', value: 50 },
  { title: '100', value: 100 },
  { title: '500', value: 500 },
  { title: '1000', value: 1000 },
]

const pageRangeValues = pageRange.map(item => item.value)

// 数据列表
const dataList = ref<TransferHistory[]>([])

// 搜索
const search = ref(getRouteQueryString(route.query.search))

// 搜索提示词列表
const searchHintList = ref<string[]>([])

// 加载状态
const loading = ref(false)

// 总条数
const totalItems = ref(0)

// 是否要分组
const group = ref<boolean>(route.query.grouped === 'true')

// 分组条件
const groupBy = ref<any>([
  {
    key: 'title',
  },
])

// 每页条数
const itemsPerPage = ref<number>(ensurePageSize(route.query.itemsPerPage, 50))

// 当前页码
const currentPage = ref<number>(Math.max(1, ensureNumber(route.query.currentPage, 1)))

// 进度条
const progressText = ref(t('transferHistory.progress.pleaseWait'))

// 进度值
const progressValue = ref(0)

// 是否已刷新
const isRefreshed = ref(false)

// 是否已完成首次激活
const hasActivatedOnce = ref(false)

// 确认框标题
const confirmTitle = ref('')

// 所有存储
const storages = ref<StorageConf[]>([])

// 查询存储
async function loadStorages() {
  try {
    const result: { [key: string]: any } = await api.get('system/setting/Storages')

    storages.value = result.data?.value ?? []
  } catch (error) {
    console.log(error)
  }
}

// 打开共享进度弹窗，长任务完成后统一关闭。
function openProgressDialog(text = progressText.value, value = progressValue.value) {
  progressDialogController?.close()
  progressDialogController = openSharedDialog(ProgressDialog, { text, value }, {}, { closeOn: false })
}

// 关闭共享进度弹窗。
function closeProgressDialog() {
  progressDialogController?.close()
  progressDialogController = null
}

// 打开整理队列进度弹窗。
function openTransferQueueDialog() {
  openSharedDialog(TransferQueueDialog, {}, {}, { closeOn: ['close'] })
}

// 打开共享删除确认弹窗。
function openDeleteConfirmDialog() {
  deleteDialogController?.close()
  deleteDialogController = openSharedDialog(
    TransferHistoryDeleteDialog,
    {
      title: confirmTitle.value,
    },
    {
      close: () => {
        deleteDialogController = null
      },
      delete: deleteConfirmHandler,
      'update:modelValue': (value: boolean) => {
        if (!value) deleteDialogController = null
      },
    },
    { closeOn: ['close', 'delete', 'update:modelValue'] },
  )
}

// 关闭共享删除确认弹窗。
function closeDeleteConfirmDialog() {
  deleteDialogController?.close()
  deleteDialogController = null
}

// 打开重新整理弹窗，完成后刷新历史列表。
function openRedoDialog() {
  openSharedDialog(
    ReorganizeDialog,
    {
      logids: redoIds.value,
      target_storage: redoTargetStorage.value,
    },
    {
      done: transferDone,
    },
    { closeOn: ['close', 'done'] },
  )
}

// 存储字典
const storageDict = computed(() => {
  return storages.value.reduce(
    (dict, item) => {
      dict[item.type] = item.name
      return dict
    },
    {} as Record<string, string>,
  )
})

// 转移方式字典
const TransferDict: { [key: string]: string } = {
  copy: t('transferHistory.transferMode.copy'),
  move: t('transferHistory.transferMode.move'),
  link: t('transferHistory.transferMode.link'),
  softlink: t('transferHistory.transferMode.softlink'),
  rclone_copy: t('transferHistory.transferMode.rclone_copy'),
  rclone_move: t('transferHistory.transferMode.rclone_move'),
}

// 分页提示
const pageTip = computed(() => {
  const begin = itemsPerPage.value * (currentPage.value - 1) + 1
  const end = Math.min(itemsPerPage.value * currentPage.value, totalItems.value)
  return {
    begin,
    end,
  }
})

// 分页总数
const totalPage = computed(() => {
  const total = Math.ceil(totalItems.value / itemsPerPage.value)
  return Math.max(1, total)
})

// 延迟同步分页参数到地址栏，避免快速翻页时连续触发请求。
const debouncedReloadPage = debounce(() => {
  void reloadPage()
}, 1000)

// 延迟同步搜索参数到地址栏，输入完成后再重置页码并刷新。
const debouncedReloadSearchPage = debounce(() => {
  console.log('search: ' + search.value)
  void reloadPage(true)
}, 1000)

// 切换页签
watch([() => currentPage.value, () => itemsPerPage.value], () => {
  if (syncingRouteQuery) return

  debouncedReloadPage()
})

// 搜索监听
watch([() => search.value, () => isComposing.value], () => {
  if (syncingRouteQuery || isComposing.value) return

  debouncedReloadSearchPage()
})

// 分组模式变化时同步到地址栏，方便返回页面时恢复用户选择。
watch(
  () => group.value,
  () => {
    if (syncingRouteQuery) return

    void reloadPage()
  },
)

// 路由参数变化时同步页面状态并重新请求列表数据。
watch(
  () => route.query,
  () => {
    void refreshDataFromRouteQuery()
  },
  { deep: true },
)

// 获取历史记录数据，keep-alive 重新进入时可静默刷新，避免表格出现重新加载感。
async function fetchData(page = currentPage.value, count = itemsPerPage.value, options: { silent?: boolean } = {}) {
  const requestSeed = ++fetchDataRequestSeed
  if (!options.silent) {
    loading.value = true
  }

  try {
    const result: { [key: string]: any } = await api.get('history/transfer', {
      params: {
        page,
        count,
        title: search.value,
      },
    })
    if (requestSeed !== fetchDataRequestSeed) return

    const list: TransferHistory[] = Array.isArray(result.data?.list) ? result.data.list : []

    isRefreshed.value = true
    dataList.value = list
    totalItems.value = ensureNumber(result.data?.total, 0)
    searchHintList.value = ['失败', '成功', ...new Set(list.map((item: TransferHistory) => item.title || ''))].filter(
      (title): title is string => title !== '',
    )

    return {
      list,
      total: totalItems.value,
    }
  } catch (error) {
    console.error(error)
  } finally {
    if (requestSeed === fetchDataRequestSeed && !options.silent) {
      loading.value = false
    }
  }
}

// 从路由查询参数中取出单值字符串，统一处理数组和空值场景。
function getRouteQueryString(value: unknown) {
  if (Array.isArray(value)) {
    return value.find(item => typeof item === 'string') ?? ''
  }

  return typeof value === 'string' ? value : ''
}

// 将当前路由查询参数同步回页面状态，并避免触发本地监听器反向写入地址栏。
async function syncStateFromRouteQuery() {
  syncingRouteQuery = true
  try {
    search.value = getRouteQueryString(route.query.search)
    itemsPerPage.value = ensurePageSize(route.query.itemsPerPage, 50)
    currentPage.value = Math.max(1, ensureNumber(route.query.currentPage, 1))
    group.value = route.query.grouped === 'true'
  } finally {
    await nextTick()
    syncingRouteQuery = false
  }
}

// 根据地址栏中的查询参数刷新历史列表。
async function refreshDataFromRouteQuery(options: { silent?: boolean } = {}) {
  await syncStateFromRouteQuery()
  await fetchData(currentPage.value, itemsPerPage.value, options)
}

// 操作完成后刷新列表；如果当前页被删空，则跳回最后一个有效页。
async function refreshDataAfterOperation() {
  const result = await fetchData()
  if (!result) return

  const lastAvailablePage = Math.max(1, Math.ceil(result.total / itemsPerPage.value))
  if (currentPage.value <= lastAvailablePage) return

  await router.replace(createHistoryUrl(false, lastAvailablePage))
  await refreshDataFromRouteQuery()
}

// 根据 type 返回不同的图标
function getIcon(type: string) {
  if (type === '电影') return 'mdi-movie'
  else if (type === '电视剧') return 'mdi-television-classic'
  else return 'mdi-help-circle'
}

// 删除历史记录
async function removeHistory(item: TransferHistory) {
  currentHistory.value = item
  confirmTitle.value = t('transferHistory.deleteConfirm', {
    title: item.title,
    seasons: item.seasons || '',
    episodes: item.episodes || '',
  })
  openDeleteConfirmDialog()
}

// 调用API删除记录
async function remove(item: TransferHistory, deleteSrc: boolean, deleteDest: boolean) {
  try {
    // 调用删除API
    const result: {
      [key: string]: any
    } = await api.delete(`history/transfer?deletesrc=${deleteSrc}&deletedest=${deleteDest}`, {
      data: item,
    })

    if (!result.success) $toast.error(`删除失败: ${result.message}`)
  } catch (error) {
    console.error(error)
  }
}

// 删除单条记录
async function removeSingle(deleteSrc: boolean, deleteDest: boolean) {
  // 关闭弹窗
  closeDeleteConfirmDialog()
  if (!currentHistory.value) return

  // 删除
  await remove(currentHistory.value, deleteSrc, deleteDest)
  // 刷新
  await refreshDataAfterOperation()
}

// 批量删除记录
async function removeBatch(deleteSrc: boolean, deleteDest: boolean) {
  if (hasRunningAiRedo.value) return
  // 关闭弹窗
  closeDeleteConfirmDialog()
  // 总条数
  const total = selected.value.length
  if (total === 0) return

  // 已处理条数
  let handled = 0
  // 显示进度条
  openProgressDialog()
  // 循环调用removeHistory
  for (const item of selected.value) {
    // 开始删除
    progressText.value = `正在删除 ${item.title} ${item.seasons}${item.episodes} ...`
    await remove(item, deleteSrc, deleteDest)
    // 删除完成
    handled++
    progressValue.value = (handled / total) * 100
    progressDialogController?.updateProps({ text: progressText.value, value: progressValue.value })
  }
  // 清空选中项
  selected.value = []
  // 隐藏进度条
  closeProgressDialog()
  // 重新获取数据
  await refreshDataAfterOperation()
}

// 响应删除操作
async function deleteConfirmHandler(deleteSrc: boolean, deleteDest: boolean) {
  if (currentHistory.value) await removeSingle(deleteSrc, deleteDest)
  else await removeBatch(deleteSrc, deleteDest)
}

// 批量删除历史记录
async function removeHistoryBatch() {
  if (hasRunningAiRedo.value) return
  if (selected.value.length === 0) return

  // 清空当前操作记录
  currentHistory.value = undefined
  confirmTitle.value = t('transferHistory.deleteConfirmBatch', {
    count: selected.value.length,
  })
  // 打开确认弹窗
  openDeleteConfirmDialog()
}
// 批量重新整理
async function retransferBatch() {
  if (hasRunningAiRedo.value) return
  if (selected.value.length === 0) return

  // 清空当前操作记录
  currentHistory.value = undefined
  // 重新整理IDS
  redoIds.value = selected.value.map(item => item.id)
  // 打开识别弹窗
  openRedoDialog()
}

// 整理完成
async function transferDone() {
  // 清空当前操作记录
  currentHistory.value = undefined
  selected.value = []
  // 刷新
  await refreshDataAfterOperation()
}

// AI助手是否启用
const aiAgentEnabled = computed(() => Boolean(globalSettingsStore.globalSettings.AI_AGENT_ENABLE))
const hasRunningAiRedo = computed(() => aiRedoIds.value.length > 0)

// AI整理中的记录
function isAiRedoing(historyId: number) {
  return aiRedoIds.value.includes(historyId)
}

// 停止AI整理进度
function stopAiRedoProgress() {
  aiRedoProgressActive.value = false

  if (aiRedoProgressSSE.value) {
    aiRedoProgressSSE.value.stop()
    aiRedoProgressSSE.value = null
  }
}

// AI整理完成
async function finishAiRedo(success: boolean, errorMessage?: string) {
  const historyIds = [...aiRedoProgressHistoryIds.value]
  const historyIdSet = new Set(historyIds)

  stopAiRedoProgress()
  aiRedoProgressDialogController?.close()
  aiRedoProgressDialogController = null
  aiRedoProgressHistoryIds.value = []
  aiRedoIds.value = aiRedoIds.value.filter(id => !historyIdSet.has(id))
  selected.value = selected.value.filter(item => !historyIdSet.has(item.id))

  await refreshDataAfterOperation()

  if (!success && errorMessage) {
    $toast.error(errorMessage)
  }
}

// 处理AI整理进度
async function handleAiRedoProgressMessage(event: MessageEvent) {
  const progress = JSON.parse(event.data)
  if (!progress) return

  aiRedoProgressText.value = progress.text || t('transferHistory.actions.aiRedoPending')
  aiRedoProgressDialogController?.updateProps({ text: aiRedoProgressText.value })

  if (progress.enable === false) {
    await finishAiRedo(progress.data?.success !== false, progress.data?.error)
  }
}

// 开始监听整理进度
function startAiRedoProgress(historyId: number, progressKey: string) {
  startAiRedoProgressBatch([historyId], progressKey)
}

// 开始监听批量整理进度
function startAiRedoProgressBatch(historyIds: number[], progressKey: string) {
  stopAiRedoProgress()

  aiRedoProgressHistoryIds.value = historyIds
  aiRedoProgressActive.value = true
  aiRedoProgressText.value = t('transferHistory.actions.aiRedoPending')
  aiRedoProgressDialogController = openSharedDialog(
    ProgressDialog,
    { text: aiRedoProgressText.value },
    {},
    { closeOn: false },
  )

  const url = `${import.meta.env.VITE_API_BASE_URL}system/progress/${progressKey}`

  aiRedoProgressSSE.value = useProgressSSE(
    url,
    handleAiRedoProgressMessage,
    `transfer-history-ai-redo-${progressKey}`,
    aiRedoProgressActive,
  )

  aiRedoProgressSSE.value.start()
}

// 触发AI整理
async function triggerAiRedo(item: TransferHistory) {
  if (!aiAgentEnabled.value) {
    $toast.error(t('transferHistory.aiRedoDisabled'))
    return
  }
  if (hasRunningAiRedo.value) return

  aiRedoIds.value = [...aiRedoIds.value, item.id]
  let progressStarted = false
  try {
    const result: { [key: string]: any } = await api.post(`history/transfer/${item.id}/ai-redo`)

    const progressKey = result.data?.progress_key

    if (!result.success || !progressKey) {
      $toast.error(result.message || t('transferHistory.aiRedoFailed'))
      return
    }
    startAiRedoProgress(item.id, progressKey)
    progressStarted = true
  } catch (error) {
    console.error(error)
    $toast.error(t('transferHistory.aiRedoFailed'))
  } finally {
    if (!progressStarted) {
      aiRedoIds.value = aiRedoIds.value.filter(id => id !== item.id)
    }
  }
}

// 批量触发AI整理
async function triggerBatchAiRedo() {
  if (!aiAgentEnabled.value) {
    $toast.error(t('transferHistory.aiRedoDisabled'))
    return
  }
  if (hasRunningAiRedo.value) return

  const historyIds = [...new Set(selected.value.map(item => item.id))]
  if (historyIds.length === 0) return

  aiRedoIds.value = [...new Set([...aiRedoIds.value, ...historyIds])]
  let progressStarted = false
  try {
    const result: { [key: string]: any } = await api.post('history/transfer/ai-redo', {
      history_ids: historyIds,
    })

    const progressKey = result.data?.progress_key
    const acceptedIds = (result.data?.history_ids as number[] | undefined) ?? historyIds

    if (!result.success || !progressKey) {
      $toast.error(result.message || t('transferHistory.aiRedoFailed'))
      return
    }
    startAiRedoProgressBatch(acceptedIds, progressKey)
    selected.value = selected.value.filter(item => !acceptedIds.includes(item.id))
    progressStarted = true
  } catch (error) {
    console.error(error)
    $toast.error(t('transferHistory.aiRedoFailed'))
  } finally {
    if (!progressStarted) {
      aiRedoIds.value = aiRedoIds.value.filter(id => !historyIds.includes(id))
    }
  }
}

// 计算下拉菜单
function getDropdownItems(item: TransferHistory) {
  return [
    {
      title: isAiRedoing(item.id) ? t('transferHistory.actions.aiRedoPending') : t('transferHistory.actions.aiRedo'),
      value: 0,
      props: {
        prependIcon: 'mdi-robot-outline',
        disabled: !aiAgentEnabled.value || (hasRunningAiRedo.value && !isAiRedoing(item.id)),
        click: () => {
          triggerAiRedo(item)
        },
      },
    },
    {
      title: t('transferHistory.actions.redo'),
      value: 1,
      props: {
        prependIcon: 'mdi-redo-variant',
        click: () => {
          redoIds.value = [item.id]
          redoTargetStorage.value = item.dest_storage
          openRedoDialog()
        },
      },
    },
    {
      title: t('transferHistory.actions.delete'),
      value: 2,
      props: {
        prependIcon: 'mdi-trash-can-outline',
        color: 'error',
        click: () => {
          removeHistory(item)
        },
      },
    },
  ]
}

// 生成历史记录页地址，确保刷新入口和分页入口使用一致的查询参数。
function createHistoryUrl(resetPage = false, page = resetPage ? 1 : currentPage.value) {
  const query: Record<string, string> = {}

  if (search.value) {
    query.search = search.value
  }
  if (itemsPerPage.value) {
    query.itemsPerPage = String(itemsPerPage.value)
  }
  if (page) {
    query.currentPage = String(page)
  }
  if (group.value) {
    query.grouped = 'true'
  }

  return {
    path: '/history',
    query,
  }
}

// 重载页面，先更新路由，再由路由监听统一拉取列表数据。
async function reloadPage(resetPage = false) {
  await router.push(createHistoryUrl(resetPage))
}

// 确保值为number类型
function ensureNumber(value: any, defaultValue: number = 0) {
  value = Number(value)
  // 如果不是数字
  if (Number.isNaN(value)) {
    value = defaultValue
  }
  return value
}

function ensurePageSize(value: any, defaultValue: number = 50) {
  const pageSize = ensureNumber(value, defaultValue)
  return pageRangeValues.includes(pageSize) ? pageSize : defaultValue
}

// 按标题分组后的选中数量统计，键为标题，值为对应分组的选中数
const selectedCountsGroupedByTitle = computed(() => {
  return selected.value.reduce(
    (acc, item) => {
      const title = item.title || ''
      acc[title] = (acc[title] || 0) + 1
      return acc
    },
    {} as Record<string, number>,
  )
})

// 控制分组内所有子项的选中状态
const toggleGroupSelection = (checked: boolean | null, items: readonly any[]) => {
  const values = items.map(item => item.value)
  if (checked) {
    selected.value = [...new Set([...selected.value, ...values])]
  } else {
    const itemsSet = new Set(values)
    selected.value = selected.value.filter(item => !itemsSet.has(item))
  }
}

const historyDynamicIcon = computed(() => (selected.value.length > 0 ? 'mdi-chevron-up' : 'mdi-timer-sand-paused'))
const historyDynamicMenuItems = computed(() => {
  if (selected.value.length === 0) return undefined

  const items: Array<{ titleKey: string; icon: string; action: () => void; color?: string }> = [
    {
      titleKey: 'dialog.transferQueue.title',
      icon: 'mdi-timer-sand-paused',
      action: openTransferQueueDialog,
    },
  ]

  if (!hasRunningAiRedo.value) {
    items.push(
      {
        titleKey: 'transferHistory.actions.batchAiRedo',
        icon: 'mdi-robot-outline',
        action: () => {
          triggerBatchAiRedo()
        },
      },
      {
        titleKey: 'transferHistory.actions.batchRedo',
        icon: 'mdi-redo-variant',
        action: () => {
          retransferBatch()
        },
      },
      {
        titleKey: 'transferHistory.actions.batchDelete',
        icon: 'mdi-trash-can-outline',
        color: 'error',
        action: () => {
          removeHistoryBatch()
        },
      },
    )
  }

  return items
})

useDynamicButton({
  icon: historyDynamicIcon,
  onClick: openTransferQueueDialog,
  menuItems: historyDynamicMenuItems,
  show: computed(() => appMode.value),
})

// 初始加载数据
onMounted(() => {
  void loadStorages()
  void refreshDataFromRouteQuery()
})

onActivated(() => {
  if (!hasActivatedOnce.value) {
    hasActivatedOnce.value = true
    return
  }

  if (!loading.value) {
    void refreshDataFromRouteQuery({ silent: true })
  }
})

onUnmounted(() => {
  debouncedReloadPage.cancel()
  debouncedReloadSearchPage.cancel()
  stopAiRedoProgress()
  closeProgressDialog()
  aiRedoProgressDialogController?.close()
})
</script>

<template>
  <VCard>
    <VCardItem>
      <VCardTitle>
        <VRow>
          <VCol cols="8" md="6" class="flex">
            <VCombobox
              key="search_navbar"
              v-model="search"
              :items="searchHintList"
              @compositionstart="isComposing = true"
              @compositionend="isComposing = false"
              class="text-disabled"
              density="compact"
              :label="t('transferHistory.searchPlaceholder')"
              prepend-inner-icon="mdi-magnify"
              variant="solo-filled"
              max-width="25rem"
              single-line
              hide-details
              flat
              rounded="pill"
              clearable
            />
          </VCol>
          <VCol cols="4" md="6" class="text-end">
            <VBtnGroup variant="outlined" divided rounded>
              <VBtn :icon="group ? 'mdi-format-list-bulleted' : 'mdi-format-list-group'" @click="group = !group" />
            </VBtnGroup>
          </VCol>
        </VRow>
      </VCardTitle>
    </VCardItem>
    <!-- 分组模式 -->
    <VDataTableVirtual
      v-if="group"
      v-model="selected"
      :groupBy="groupBy"
      :headers="groupHeaders"
      :items="dataList"
      :loading="loading"
      density="compact"
      return-object
      fixed-header
      show-select
      :loading-text="t('transferHistory.loading')"
      hover
      :style="{ height: `${availableHeight}px` }"
    >
      <template #header.data-table-group>
        <span>{{ t('transferHistory.titleColumn') }}</span>
      </template>
      <template v-slot:group-header="{ item, columns, toggleGroup, isGroupOpen }">
        <tr>
          <td :colspan="columns.length">
            <div class="d-flex align-center gap-2">
              <VBtn
                :icon="isGroupOpen(item) ? '$expand' : '$next'"
                size="small"
                variant="text"
                @click="toggleGroup(item)"
              />
              <VCheckbox
                :model-value="selectedCountsGroupedByTitle[item.value] == item.items.length"
                :indeterminate="selectedCountsGroupedByTitle[item.value] < item.items.length"
                @update:modelValue="checked => toggleGroupSelection(checked, item.items)"
              />
              {{ item.value }}
            </div>
          </td>
        </tr>
      </template>
      <template #item.title="{ item }">
        <div class="d-flex align-center">
          <VAvatar>
            <VIcon :icon="getIcon(item.type || '')" />
          </VAvatar>
          <div class="d-flex flex-column ms-1">
            <span v-if="item.type === '电视剧'" class="d-block text-high-emphasis min-w-20">
              {{ item?.seasons }}{{ item?.episodes }}
            </span>
            <small>{{ item?.category }}</small>
          </div>
        </div>
      </template>
      <template #item.src="{ item }">
        <div>
          <span>
            <VChip variant="tonal" size="small" label class="my-1"> {{ storageDict[item?.src_storage || ''] }}</VChip>
            <small>{{ item?.src }}</small>
          </span>
          <span class="text-high-emphasis text-bold"> => </span>
          <br />
          <span v-if="item?.dest">
            <VChip variant="tonal" size="small" label class="my-1"> {{ storageDict[item?.dest_storage || ''] }}</VChip>
            <small>{{ item?.dest }}</small>
          </span>
        </div>
      </template>
      <template #item.mode="{ item }">
        <VChip variant="outlined" color="primary" size="small">
          {{ TransferDict[item?.mode ?? ''] || t('common.unknown') }}
        </VChip>
      </template>
      <template #item.status="{ item }">
        <VChip v-if="item?.status" color="success" size="small"> {{ t('transferHistory.status.success') }} </VChip>
        <VTooltip v-else :text="item?.errmsg">
          <template #activator="{ props }">
            <VChip v-bind="props" color="error" size="small"> {{ t('transferHistory.status.failed') }} </VChip>
          </template>
        </VTooltip>
      </template>
      <template #item.size="{ item }">
        <small>{{ formatFileSize(item?.src_fileitem?.size || 0) }}</small>
      </template>
      <template #item.date="{ item }">
        <small>{{ item?.date }}</small>
      </template>
      <template #item.actions="{ item }">
        <IconBtn>
          <VIcon icon="mdi-dots-vertical" />
          <VMenu activator="parent" close-on-content-click>
            <VList>
              <VListItem
                v-for="(menu, i) in getDropdownItems(item)"
                :key="i"
                :base-color="menu.props.color"
                :disabled="menu.props.disabled"
                @click="menu.props.click()"
              >
                <template #prepend>
                  <VIcon :icon="menu.props.prependIcon" />
                </template>
                <VListItemTitle v-text="menu.title" />
              </VListItem>
            </VList>
          </VMenu>
        </IconBtn>
      </template>
      <template #no-data> {{ t('transferHistory.noData') }} </template>
    </VDataTableVirtual>
    <!-- 列表模式 -->
    <VDataTableVirtual
      v-else
      v-model="selected"
      :headers="headers"
      :items="dataList"
      :loading="loading"
      density="compact"
      return-object
      fixed-header
      show-select
      :loading-text="t('transferHistory.loading')"
      hover
      :style="{ height: `${availableHeight}px` }"
    >
      <template #item.title="{ item }">
        <div class="d-flex align-center">
          <VAvatar>
            <VIcon :icon="getIcon(item.type || '')" />
          </VAvatar>
          <div class="d-flex flex-column ms-1">
            <span v-if="item.type === '电视剧'" class="d-block text-high-emphasis min-w-20">
              {{ item?.title }} {{ item?.seasons }}{{ item?.episodes }}
            </span>
            <span v-else class="d-block text-high-emphasis min-w-20">
              {{ item?.title }}
            </span>
            <small>{{ item?.category }}</small>
          </div>
        </div>
      </template>
      <template #item.src="{ item }">
        <div>
          <span>
            <VChip variant="tonal" size="small" label class="my-1"> {{ storageDict[item?.src_storage || ''] }}</VChip>
            <small>{{ item?.src }}</small>
          </span>
          <span class="text-high-emphasis text-bold"> => </span>
          <br />
          <span v-if="item?.dest">
            <VChip variant="tonal" size="small" label class="my-1"> {{ storageDict[item?.dest_storage || ''] }}</VChip>
            <small>{{ item?.dest }}</small>
          </span>
        </div>
      </template>
      <template #item.mode="{ item }">
        <VChip variant="outlined" color="primary" size="small">
          {{ TransferDict[item?.mode ?? ''] || t('common.unknown') }}
        </VChip>
      </template>
      <template #item.status="{ item }">
        <VChip v-if="item?.status" color="success" size="small"> {{ t('transferHistory.status.success') }} </VChip>
        <VTooltip v-else :text="item?.errmsg">
          <template #activator="{ props }">
            <VChip v-bind="props" color="error" size="small"> {{ t('transferHistory.status.failed') }} </VChip>
          </template>
        </VTooltip>
      </template>
      <template #item.size="{ item }">
        <small>{{ formatFileSize(item?.src_fileitem?.size || 0) }}</small>
      </template>
      <template #item.date="{ item }">
        <small>{{ item?.date }}</small>
      </template>
      <template #item.actions="{ item }">
        <IconBtn>
          <VIcon icon="mdi-dots-vertical" />
          <VMenu activator="parent" close-on-content-click>
            <VList>
              <VListItem
                v-for="(menu, i) in getDropdownItems(item)"
                :key="i"
                :base-color="menu.props.color"
                :disabled="menu.props.disabled"
                @click="menu.props.click()"
              >
                <template #prepend>
                  <VIcon :icon="menu.props.prependIcon" />
                </template>
                <VListItemTitle v-text="menu.title" />
              </VListItem>
            </VList>
          </VMenu>
        </IconBtn>
      </template>
      <template #no-data> {{ t('transferHistory.noData') }} </template>
    </VDataTableVirtual>
    <VDivider />
    <div class="flex items-center justify-between">
      <div class="w-auto">
        <VSelect v-model="itemsPerPage" :items="pageRange" density="compact" flat class="ms-1" />
      </div>
      <div class="w-auto text-sm">{{ t('transferHistory.pageInfo', pageTip) }} {{ totalItems }}</div>
      <VPagination
        v-model="currentPage"
        show-first-last-page
        :length="totalPage"
        :total-visible="display.mdAndUp.value ? 7 : 0"
        @next="currentPage + 1"
        @prev="currentPage - 1"
      >
      </VPagination>
    </div>
  </VCard>

  <!-- 非 app 模式下的 FAB 按钮 -->
  <Teleport to="body" v-if="!appMode && route.path === '/history'">
    <div v-if="isRefreshed" class="compact-fab-stack compact-fab-stack--history">
      <VFab
        v-if="selected.length > 0 && !hasRunningAiRedo"
        icon="mdi-trash-can-outline"
        color="warning"
        variant="tonal"
        appear
        class="compact-fab compact-fab--secondary"
        @click="removeHistoryBatch"
      />
      <VFab
        v-if="selected.length > 0 && !hasRunningAiRedo"
        icon="mdi-redo-variant"
        color="success"
        variant="tonal"
        appear
        class="compact-fab compact-fab--secondary"
        @click="retransferBatch"
      />
      <VFab
        v-if="selected.length > 0 && !hasRunningAiRedo"
        icon="mdi-robot-outline"
        color="info"
        variant="tonal"
        appear
        class="compact-fab compact-fab--secondary"
        @click="triggerBatchAiRedo"
      />
      <VFab
        icon="mdi-timer-sand-paused"
        color="primary"
        appear
        class="compact-fab compact-fab--primary"
        @click="openTransferQueueDialog"
      />
    </div>
  </Teleport>

</template>

<style lang="scss">
.v-table th {
  white-space: nowrap;
}

.v-table__wrapper {
  border-radius: 0;
}
</style>
