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
import ProgressiveCardGrid from '@/components/misc/ProgressiveCardGrid.vue'
import { useDynamicButton, type DynamicButtonMenuItem } from '@/composables/useDynamicButton'
import { useAvailableHeight } from '@/composables/useAvailableHeight'
import { useBackground } from '@/composables/useBackground'
import { useGlobalSettingsStore, useUserStore } from '@/stores'
import { openSharedDialog } from '@/composables/useSharedDialog'
import { buildUserPermissionContext, hasPermission } from '@/utils/permission'

const TransferHistoryDeleteDialog = defineAsyncComponent(
  () => import('@/components/dialog/TransferHistoryDeleteDialog.vue'),
)

// i18n
const { t } = useI18n()

// 全局设置
const globalSettingsStore = useGlobalSettingsStore()

// APP
const display = useDisplay()
const isDesktop = computed(() => display.mdAndUp.value)
const isMobile = computed(() => display.smAndDown.value)
// PWA模式检测
const { appMode } = usePWA()
const { useProgressSSE } = useBackground()

// 计算列表可用高度
const { availableHeight } = useAvailableHeight(135, 300)

// 提示框
const $toast = useToast()

// 路由
const route = useRoute()
const userStore = useUserStore()
const canManage = computed(() =>
  hasPermission(buildUserPermissionContext(userStore.superUser, userStore.permissions), 'manage'),
)
let syncingRouteQuery = false
let fetchDataRequestSeed = 0
let mobileFetchDataRequestSeed = 0

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

// 移动端批量选择模式
const mobileBatchMode = ref(false)

// 从季集字符串中提取可排序的数字。
const getNum = (s?: string) => (s ? parseInt(s.replace(/[^0-9]/g, ''), 10) || 0 : 0)

// 按媒体类型、标题和剧集序号排序历史记录。
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

// 按源文件体积排序历史记录。
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

// 移动端历史记录列表，独立于桌面分页表格。
const mobileDataList = ref<TransferHistory[]>([])

// 移动端每次触底加载的记录数。
const mobilePageSize = 25

// 移动端触底加载页码。
const mobileCurrentPage = ref(1)

// 移动端是否还有下一页。
const mobileHasMore = ref(true)

// 移动端无限滚动组件重置键。
const mobileInfiniteKey = ref(0)

// 移动端加载状态。
const mobileLoading = ref(false)

// 移动端已展开完整路径的记录 ID。
const mobileExpandedPathIds = ref<number[]>([])

// 搜索
const search = ref(getRouteQueryString(route.query.search))

// 写入搜索值时统一把空字符串归一为 null，避免 VCombobox 把空字符串当作已有值。
function setSearchValue(value: unknown) {
  search.value = typeof value === 'string' && value !== '' ? value : null
}

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
    const result: { [key: string]: any } = await api.get('system/setting/public/Storages')

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
  console.log('search: ' + (search.value ?? ''))
  void reloadPage(true)
}, 1000)

// 延迟刷新移动端无限列表，输入完成后再从第一页重新加载。
const debouncedReloadMobileSearchPage = debounce(() => {
  resetMobileHistory()
}, 600)

// 切换页签
watch([() => currentPage.value, () => itemsPerPage.value], () => {
  if (syncingRouteQuery || !isDesktop.value) return

  debouncedReloadPage()
})

// 搜索监听
watch([() => search.value, () => isComposing.value], () => {
  if (syncingRouteQuery || isComposing.value) return

  if (isMobile.value) {
    debouncedReloadMobileSearchPage()
    return
  }

  debouncedReloadSearchPage()
})

// 分组模式变化时同步到地址栏，方便返回页面时恢复用户选择。
watch(
  () => group.value,
  () => {
    if (syncingRouteQuery || !isDesktop.value) return

    void reloadPage()
  },
)

// 路由参数变化时同步页面状态并重新请求列表数据。
watch(
  () => route.query,
  () => {
    if (isDesktop.value) {
      void refreshDataFromRouteQuery()
    } else {
      syncMobileSearchFromRouteQuery()
      resetMobileHistory()
    }
  },
  { deep: true },
)

// 响应桌面与移动端断点切换，进入对应布局后刷新对应数据源。
watch(isDesktop, desktop => {
  if (desktop) {
    void refreshDataFromRouteQuery()
  } else {
    resetMobileHistory()
  }
})

// 获取历史记录数据，keep-alive 重新进入时可静默刷新，避免表格出现重新加载感。
async function fetchData(page = currentPage.value, count = itemsPerPage.value, options: { silent?: boolean } = {}) {
  const requestSeed = ++fetchDataRequestSeed
  const shouldShowLoading = !options.silent
  if (shouldShowLoading) {
    loading.value = true
  }

  try {
    const result: { [key: string]: any } = await api.get('history/transfer', {
      params: {
        page,
        count,
        title: search.value ?? '',
      },
    })
    if (requestSeed !== fetchDataRequestSeed) return

    const list: TransferHistory[] = Array.isArray(result.data?.list) ? result.data.list : []

    isRefreshed.value = true
    dataList.value = list
    totalItems.value = ensureNumber(result.data?.total, 0)
    updateSearchHintList(list)

    return {
      list,
      total: totalItems.value,
    }
  } catch (error) {
    console.error(error)
  } finally {
    // 静默刷新可能会接管前一个可见请求，也需要负责清掉遗留的表格加载态。
    if (requestSeed === fetchDataRequestSeed && (shouldShowLoading || loading.value)) {
      loading.value = false
    }
  }
}

// 更新搜索建议，移动端追加加载时会合并已加载记录的标题。
function updateSearchHintList(list: TransferHistory[]) {
  searchHintList.value = ['失败', '成功', ...new Set(list.map((item: TransferHistory) => item.title || ''))].filter(
    (title): title is string => title !== '',
  )
}

// 重置移动端无限列表，让 VInfiniteScroll 从第一页重新触发加载。
function resetMobileHistory() {
  mobileFetchDataRequestSeed++
  mobileDataList.value = []
  mobileCurrentPage.value = 1
  mobileHasMore.value = true
  mobileLoading.value = false
  isRefreshed.value = false
  totalItems.value = 0
  mobileExpandedPathIds.value = []
  selected.value = []
  mobileBatchMode.value = false
  mobileInfiniteKey.value++
}

// 移动端只从路由同步搜索词，不接收桌面分页和分组状态。
function syncMobileSearchFromRouteQuery() {
  syncingRouteQuery = true
  try {
    search.value = getRouteQueryString(route.query.search)
  } finally {
    void nextTick(() => {
      syncingRouteQuery = false
    })
  }
}

// 移动端触底加载历史记录，并将新页追加到虚拟列表数据源。
async function loadMobileHistory({ done }: { done: (status: 'ok' | 'empty' | 'error') => void }) {
  if (mobileLoading.value) {
    done('ok')
    return
  }

  if (!mobileHasMore.value) {
    done('empty')
    return
  }

  const requestSeed = ++mobileFetchDataRequestSeed

  try {
    mobileLoading.value = true
    const result: { [key: string]: any } = await api.get('history/transfer', {
      params: {
        page: mobileCurrentPage.value,
        count: mobilePageSize,
        title: search.value ?? '',
      },
    })
    if (requestSeed !== mobileFetchDataRequestSeed) {
      done('ok')
      return
    }

    const list: TransferHistory[] = Array.isArray(result.data?.list) ? result.data.list : []
    const total = ensureNumber(result.data?.total, 0)

    appendMobileHistory(list, total)
    done(mobileHasMore.value ? 'ok' : 'empty')
  } catch (error) {
    console.error(error)
    done('error')
  } finally {
    if (requestSeed === mobileFetchDataRequestSeed) {
      mobileLoading.value = false
    }
  }
}

// 将移动端新页数据合并到列表，并维护下一页状态。
function appendMobileHistory(list: TransferHistory[], total: number) {
  isRefreshed.value = true
  totalItems.value = total

  if (list.length === 0) {
    mobileHasMore.value = false
    updateSearchHintList(mobileDataList.value)
    return
  }

  const existingIds = new Set(mobileDataList.value.map(item => item.id))
  const newItems = list.filter(item => !existingIds.has(item.id))

  mobileDataList.value = [...mobileDataList.value, ...newItems]
  mobileCurrentPage.value++
  mobileHasMore.value = mobileDataList.value.length < total && list.length >= mobilePageSize
  updateSearchHintList(mobileDataList.value)
}

// 从路由查询参数中取出单值字符串，空搜索统一返回 null 以保持输入框 placeholder 可见。
function getRouteQueryString(value: unknown): string | null {
  if (Array.isArray(value)) {
    return value.find(item => typeof item === 'string' && item !== '') ?? null
  }

  return typeof value === 'string' && value !== '' ? value : null
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
  if (isMobile.value) {
    resetMobileHistory()
    return
  }

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
  if (isMobile.value) {
    mobileBatchMode.value = false
  }
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
  if (isMobile.value) {
    mobileBatchMode.value = false
  }
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

  aiRedoProgressText.value = progress.text_i18n || progress.text || t('transferHistory.actions.aiRedoPending')
  aiRedoProgressDialogController?.updateProps({ text: aiRedoProgressText.value })

  if (progress.enable === false) {
    await finishAiRedo(progress.data?.success !== false, progress.data?.error_i18n || progress.data?.error)
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
    if (isMobile.value && selected.value.length === 0) {
      mobileBatchMode.value = false
    }
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

// 校验分页条数，避免地址栏参数超出可选范围。
function ensurePageSize(value: any, defaultValue: number = 50) {
  const pageSize = ensureNumber(value, defaultValue)
  return pageRangeValues.includes(pageSize) ? pageSize : defaultValue
}

// 已选历史记录 ID 集合，供移动端卡片和分组选择状态复用。
const selectedIdSet = computed(() => new Set(selected.value.map(item => item.id)))

// 移动端当前已加载记录数量，用于批量菜单展示选择进度。
const mobileBatchTotalCount = computed(() => mobileDataList.value.length)

// 移动端当前已加载记录中的已选数量。
const mobileBatchSelectedCount = computed(() => {
  return mobileDataList.value.filter(item => selectedIdSet.value.has(item.id)).length
})

// 移动端当前已加载记录是否已全部选中。
const isAllMobileHistorySelected = computed(() => {
  return mobileBatchTotalCount.value > 0 && mobileBatchSelectedCount.value === mobileBatchTotalCount.value
})

// 拼接移动端展示用的季集文本。
function getHistoryEpisodeText(item: TransferHistory) {
  return `${item.seasons || ''}${item.episodes || ''}`
}

// 获取移动端卡片标题，剧集记录会追加季集信息。
function getHistoryDisplayTitle(item: TransferHistory) {
  const title = item.title || t('common.unknown')
  const episodeText = getHistoryEpisodeText(item)

  return item.type === '电视剧' && episodeText ? `${title} ${episodeText}` : title
}

// 获取移动端卡片副标题，优先展示二级分类和年份。
function getHistorySubtitle(item: TransferHistory) {
  return [item.category, item.year].filter(Boolean).join(' / ')
}

// 获取存储展示名称，配置缺失时回退到原始存储标识。
function getHistoryStorageName(storage?: string) {
  if (!storage) return t('common.unknown')

  const fallbackNames: Record<string, string> = {
    local: '本地',
    downloads: '下载',
    library: '媒体库',
    smb: 'SMB',
  }

  return storageDict.value[storage] || fallbackNames[storage] || storage
}

// 获取移动端卡片状态对应的主题色。
function getHistoryStatusColor(item: TransferHistory) {
  return item.status ? 'success' : 'error'
}

// 获取移动端卡片状态文本。
function getHistoryStatusText(item: TransferHistory) {
  return item.status ? t('transferHistory.status.success') : t('transferHistory.status.failed')
}

// 将历史记录时间压缩成移动端卡片展示文本。
function getHistoryDateText(date?: string) {
  if (!date) return ''

  const match = date.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/)
  if (!match) return date

  const [, year, month, day, hour, minute] = match
  const recordDate = new Date(Number(year), Number(month) - 1, Number(day))
  const today = new Date()
  const todayDate = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const diffDays = Math.round((todayDate.getTime() - recordDate.getTime()) / 86400000)
  const time = `${hour}:${minute}`

  if (diffDays === 0) return `今天 ${time}`
  if (diffDays === 1) return `昨天 ${time}`

  return `${month}-${day} ${time}`
}

// 判断移动端路径是否已展开。
function isMobilePathExpanded(item: TransferHistory) {
  return mobileExpandedPathIds.value.includes(item.id)
}

// 切换移动端路径完整展示状态。
function toggleMobilePathExpanded(item: TransferHistory) {
  if (isMobilePathExpanded(item)) {
    mobileExpandedPathIds.value = mobileExpandedPathIds.value.filter(id => id !== item.id)
    return
  }

  mobileExpandedPathIds.value = [...mobileExpandedPathIds.value, item.id]
}

// 判断指定历史记录是否已被选中。
function isHistorySelected(item: TransferHistory) {
  return selectedIdSet.value.has(item.id)
}

// 获取移动端历史记录卡片的稳定渲染 key。
function getMobileHistoryItemKey(item: TransferHistory) {
  return item.id
}

// 批量设置历史记录选中状态，并按 ID 去重。
function updateHistorySelection(items: readonly TransferHistory[], checked: boolean | null) {
  const itemIds = new Set(items.map(item => item.id))

  if (checked) {
    const selectedIds = new Set(selected.value.map(item => item.id))

    selected.value = [...selected.value, ...items.filter(item => !selectedIds.has(item.id))]
    return
  }

  selected.value = selected.value.filter(item => !itemIds.has(item.id))
}

// 切换单条历史记录的选中状态。
function toggleHistorySelection(item: TransferHistory, checked: boolean | null) {
  updateHistorySelection([item], checked)
}

// 切换移动端批量选择模式，退出时清空移动端选择状态。
function toggleMobileBatchMode() {
  if (mobileBatchMode.value) {
    exitMobileBatchMode()
    return
  }

  selected.value = []
  mobileBatchMode.value = true
}

// 退出移动端批量选择模式并清空选择状态。
function exitMobileBatchMode() {
  mobileBatchMode.value = false
  selected.value = []
}

// 批量模式下点击移动端记录卡片时切换该记录的选择状态。
function handleMobileRecordClick(item: TransferHistory) {
  if (!mobileBatchMode.value) return

  toggleHistorySelection(item, !isHistorySelected(item))
}

// 移动端路径点击在批量模式下转为选择记录，普通模式下展开路径。
function handleMobilePathClick(item: TransferHistory) {
  if (mobileBatchMode.value) {
    handleMobileRecordClick(item)
    return
  }

  toggleMobilePathExpanded(item)
}

// 选中移动端当前已加载的全部历史记录。
function selectAllMobileHistory() {
  updateHistorySelection(mobileDataList.value, true)
}

// 取消移动端历史记录的全部选择。
function deselectAllMobileHistory() {
  updateHistorySelection(mobileDataList.value, false)
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
  updateHistorySelection(values, checked)
}

const historyDynamicIcon = computed(() => 'mdi-timer-sand-paused')
const historyDynamicMenuItems = computed(() => {
  if (!appMode.value) return undefined

  if (mobileBatchMode.value) {
    const hasSelectedHistory = mobileBatchSelectedCount.value > 0

    const items: DynamicButtonMenuItem[] = [
      {
        titleKey: 'transferHistory.selectedCount',
        titleParams: {
          count: mobileBatchSelectedCount.value,
          total: mobileBatchTotalCount.value,
        },
        icon: 'mdi-checkbox-multiple-marked-outline',
        permission: 'manage',
        disabled: true,
        action: () => {},
      },
      {
        titleKey: isAllMobileHistorySelected.value
          ? 'transferHistory.actions.deselectAll'
          : 'transferHistory.actions.selectAll',
        icon: isAllMobileHistorySelected.value ? 'mdi-checkbox-blank-outline' : 'mdi-checkbox-multiple-marked',
        permission: 'manage',
        disabled: mobileBatchTotalCount.value === 0,
        action: () => {
          if (isAllMobileHistorySelected.value) {
            deselectAllMobileHistory()
            return
          }

          selectAllMobileHistory()
        },
      },
    ]

    if (!hasRunningAiRedo.value) {
      items.push(
        {
          titleKey: 'transferHistory.actions.batchAiRedo',
          icon: 'mdi-robot-outline',
          color: 'info',
          permission: 'manage',
          disabled: !hasSelectedHistory,
          action: () => {
            triggerBatchAiRedo()
          },
        },
        {
          titleKey: 'transferHistory.actions.batchRedo',
          icon: 'mdi-redo-variant',
          color: 'success',
          permission: 'manage',
          disabled: !hasSelectedHistory,
          action: () => {
            retransferBatch()
          },
        },
        {
          titleKey: 'transferHistory.actions.batchDelete',
          icon: 'mdi-trash-can-outline',
          color: 'error',
          permission: 'manage',
          disabled: !hasSelectedHistory,
          action: () => {
            removeHistoryBatch()
          },
        },
      )
    }

    items.push({
      titleKey: 'transferHistory.actions.exitBatchMode',
      icon: 'mdi-close',
      permission: 'manage',
      action: exitMobileBatchMode,
    })

    return items
  }

  if (selected.value.length === 0) return undefined

  const items: DynamicButtonMenuItem[] = [
    {
      titleKey: 'dialog.transferQueue.title',
      icon: 'mdi-timer-sand-paused',
      color: 'primary',
      permission: 'manage',
      action: openTransferQueueDialog,
    },
  ]

  if (!hasRunningAiRedo.value) {
    items.push(
      {
        titleKey: 'transferHistory.actions.batchAiRedo',
        icon: 'mdi-robot-outline',
        color: 'info',
        permission: 'manage',
        action: () => {
          triggerBatchAiRedo()
        },
      },
      {
        titleKey: 'transferHistory.actions.batchRedo',
        icon: 'mdi-redo-variant',
        color: 'success',
        permission: 'manage',
        action: () => {
          retransferBatch()
        },
      },
      {
        titleKey: 'transferHistory.actions.batchDelete',
        icon: 'mdi-trash-can-outline',
        color: 'error',
        permission: 'manage',
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
  permission: 'manage',
  show: computed(() => appMode.value),
})

// 初始加载数据
onMounted(() => {
  void loadStorages()
  if (isDesktop.value) {
    void refreshDataFromRouteQuery()
  } else {
    resetMobileHistory()
  }
})

onActivated(() => {
  if (!hasActivatedOnce.value) {
    hasActivatedOnce.value = true
    return
  }

  if (isDesktop.value && !loading.value) {
    void refreshDataFromRouteQuery({ silent: true })
  } else if (isMobile.value && !mobileLoading.value) {
    resetMobileHistory()
  }
})

onUnmounted(() => {
  debouncedReloadPage.cancel()
  debouncedReloadSearchPage.cancel()
  debouncedReloadMobileSearchPage.cancel()
  stopAiRedoProgress()
  closeProgressDialog()
  aiRedoProgressDialogController?.close()
})
</script>

<template>
  <VCard v-if="isDesktop">
    <VCardItem>
      <VCardTitle>
        <VRow>
          <VCol cols="8" md="6" class="flex">
            <VCombobox
              key="search_navbar"
              :model-value="search"
              @update:model-value="setSearchValue"
              :items="searchHintList"
              @compositionstart="isComposing = true"
              @compositionend="isComposing = false"
              class="text-disabled"
              density="compact"
              :placeholder="t('transferHistory.searchPlaceholder')"
              :aria-label="t('transferHistory.searchPlaceholder')"
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
      <div class="transfer-history-pagination__size w-auto">
        <VSelect v-model="itemsPerPage" :items="pageRange" density="compact" flat class="ms-1" />
      </div>
      <div class="transfer-history-pagination__info w-auto text-sm">
        {{ t('transferHistory.pageInfo', pageTip) }} {{ totalItems }}
      </div>
      <VPagination
        v-model="currentPage"
        show-first-last-page
        :length="totalPage"
        :total-visible="7"
        @next="currentPage + 1"
        @prev="currentPage - 1"
      >
      </VPagination>
    </div>
  </VCard>

  <section v-else class="transfer-history-mobile-page">
    <div class="transfer-history-mobile-titlebar">
      <VPageContentTitle
        :title="t('navItems.mediaOrganize')"
        class="transfer-history-mobile-title my-0"
        style="margin-block: 0"
      />
      <VBtn
        v-if="canManage"
        icon="mdi-checkbox-multiple-marked-outline"
        :color="mobileBatchMode ? 'primary' : 'gray'"
        :aria-label="
          mobileBatchMode ? t('transferHistory.actions.exitBatchSelect') : t('transferHistory.actions.batchSelect')
        "
        :title="
          mobileBatchMode ? t('transferHistory.actions.exitBatchSelect') : t('transferHistory.actions.batchSelect')
        "
        variant="text"
        class="settings-icon-button transfer-history-mobile-titlebar__batch"
        @click="toggleMobileBatchMode"
      />
    </div>

    <VCombobox
      key="search_mobile"
      :model-value="search"
      @update:model-value="setSearchValue"
      :items="searchHintList"
      @compositionstart="isComposing = true"
      @compositionend="isComposing = false"
      class="transfer-history-mobile-search"
      density="comfortable"
      :placeholder="t('transferHistory.searchPlaceholder')"
      :aria-label="t('transferHistory.searchPlaceholder')"
      prepend-inner-icon="mdi-magnify"
      variant="outlined"
      single-line
      hide-details
      flat
      rounded="pill"
      clearable
    />

    <VInfiniteScroll
      :key="mobileInfiniteKey"
      mode="intersect"
      side="end"
      :items="mobileDataList"
      class="transfer-history-mobile-scroll"
      @load="loadMobileHistory"
    >
      <template #loading>
        <div class="transfer-history-mobile-state transfer-history-mobile-state--loading">
          <VProgressCircular indeterminate color="primary" size="26" width="3" />
        </div>
      </template>
      <template #empty />

      <ProgressiveCardGrid
        v-if="mobileDataList.length > 0"
        :items="mobileDataList"
        :columns="1"
        :gap="14"
        :estimated-item-height="280"
        :overscan-rows="5"
        :get-item-key="getMobileHistoryItemKey"
      >
        <template #default="{ item }">
          <article
            class="transfer-history-mobile-record"
            :class="{
              'transfer-history-mobile-record--batch': mobileBatchMode,
              'transfer-history-mobile-record--selected': mobileBatchMode && isHistorySelected(item),
              'transfer-history-mobile-record--failed': !item.status,
            }"
            @click="handleMobileRecordClick(item)"
          >
            <header class="transfer-history-mobile-record__header">
              <VAvatar class="transfer-history-mobile-record__avatar" size="40">
                <VIcon :icon="getIcon(item.type || '')" />
              </VAvatar>

              <div class="transfer-history-mobile-record__heading">
                <div class="transfer-history-mobile-record__title">
                  {{ getHistoryDisplayTitle(item) }}
                </div>
                <div class="transfer-history-mobile-record__subtitle">
                  {{ getHistorySubtitle(item) || item.type || t('common.unknown') }}
                </div>
              </div>

              <VChip
                class="transfer-history-mobile-record__status"
                variant="tonal"
                :color="getHistoryStatusColor(item)"
                size="small"
              >
                {{ getHistoryStatusText(item) }}
              </VChip>

              <VCheckbox
                v-if="mobileBatchMode"
                class="transfer-history-mobile-record__checkbox"
                :model-value="isHistorySelected(item)"
                density="compact"
                hide-details
                @click.stop
                @update:model-value="checked => toggleHistorySelection(item, checked)"
              />

              <IconBtn v-else class="transfer-history-mobile-record__menu" size="small">
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
            </header>

            <div class="transfer-history-mobile-record__meta">
              <VChip class="transfer-history-mobile-record__mode" variant="outlined" color="primary" size="small">
                {{ TransferDict[item?.mode ?? ''] || t('common.unknown') }}
              </VChip>
              <span>{{ formatFileSize(item?.src_fileitem?.size || 0) }}</span>
              <span class="transfer-history-mobile-record__dot">·</span>
              <span v-if="item?.date">{{ getHistoryDateText(item.date) }}</span>
            </div>

            <button
              type="button"
              class="transfer-history-mobile-record__paths"
              :class="{ 'transfer-history-mobile-record__paths--expanded': isMobilePathExpanded(item) }"
              @click.stop="handleMobilePathClick(item)"
            >
              <div class="transfer-history-mobile-record__path-row">
                <span class="transfer-history-mobile-record__storage">
                  {{ getHistoryStorageName(item?.src_storage) }}
                </span>
                <p>{{ item?.src || t('common.unknown') }}</p>
              </div>
              <div v-if="item?.dest" class="transfer-history-mobile-record__path-arrow">
                <VIcon icon="mdi-arrow-down" size="18" />
              </div>
              <div v-if="item?.dest" class="transfer-history-mobile-record__path-row">
                <span class="transfer-history-mobile-record__storage">
                  {{ getHistoryStorageName(item?.dest_storage) }}
                </span>
                <p>{{ item.dest }}</p>
              </div>
            </button>

            <div v-if="!item?.status && item?.errmsg" class="transfer-history-mobile-record__error">
              <VIcon icon="mdi-alert-circle" size="18" />
              {{ item.errmsg }}
            </div>
          </article>
        </template>
      </ProgressiveCardGrid>
    </VInfiniteScroll>

    <div v-if="mobileDataList.length === 0 && isRefreshed && !mobileLoading" class="transfer-history-mobile-empty">
      <VIcon icon="mdi-history" size="32" />
      <span>{{ t('transferHistory.noData') }}</span>
    </div>
  </section>

  <!-- 非 app 模式下的 FAB 按钮 -->
  <Teleport to="body" v-if="!appMode && route.path === '/history'">
    <div v-if="isRefreshed && canManage" class="compact-fab-stack compact-fab-stack--history">
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

.transfer-history-mobile-page {
  --transfer-history-mobile-surface-opacity: 0.92;
  --transfer-history-mobile-search-bg: rgba(var(--v-theme-on-surface), 0.045);
  --transfer-history-mobile-muted-bg: rgba(var(--v-theme-on-surface), 0.06);
  --transfer-history-mobile-border: rgba(var(--v-theme-on-surface), 0.1);
  --transfer-history-mobile-storage-width: 4.85rem;
  --transfer-history-mobile-surface-blur: none;

  display: flex;
  flex-direction: column;
  gap: 1rem;
  min-block-size: 100%;
  padding-block: 0.25rem 1.25rem;
  padding-inline: 0.35rem;
}

.transfer-history-mobile-titlebar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.transfer-history-mobile-title {
  flex: 1;
  min-inline-size: 0;
}

.transfer-history-mobile-titlebar__batch {
  flex: 0 0 auto;
}

.transfer-history-mobile-title :deep(h2) {
  font-size: 1.875rem;
  line-height: 1.15;
}

.transfer-history-mobile-search {
  min-inline-size: 0;
}

.transfer-history-mobile-search :deep(.v-field) {
  background: var(--transfer-history-mobile-search-bg);
  min-block-size: 3.75rem;
}

.transfer-history-mobile-search :deep(.v-field__input) {
  font-size: 1rem;
}

.transfer-history-mobile-scroll {
  overflow: visible !important;
  min-block-size: 22rem;
}

.transfer-history-mobile-scroll :deep(.v-infinite-scroll__container),
.transfer-history-mobile-scroll :deep(.progressive-card-grid),
.transfer-history-mobile-scroll :deep(.progressive-card-grid__track) {
  overflow: visible !important;
}

.transfer-history-mobile-scroll :deep(.v-infinite-scroll__side) {
  padding-block: 0.75rem;
}

.transfer-history-mobile-state,
.transfer-history-mobile-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.transfer-history-mobile-state {
  min-block-size: 4rem;
}

.transfer-history-mobile-empty {
  flex-direction: column;
  gap: 0.75rem;
  min-block-size: 18rem;
}

.transfer-history-mobile-record {
  overflow: hidden;
  border-radius: 10px;
  backdrop-filter: var(--transfer-history-mobile-surface-blur);
  background: rgba(var(--v-theme-surface), var(--transfer-history-mobile-surface-opacity));
  box-shadow: var(--app-card-rest-shadow);
}

.transfer-history-mobile-record--batch {
  cursor: pointer;
}

.transfer-history-mobile-record--selected {
  outline: 2px solid rgb(var(--v-theme-primary));
  outline-offset: -2px;
}

.transfer-history-mobile-record__header {
  display: grid;
  align-items: start;
  gap: 0.75rem;
  grid-template-columns: 3rem minmax(0, 1fr) auto 2rem;
  padding-block: 1rem 0.75rem;
  padding-inline: 1rem 0.85rem;
}

.transfer-history-mobile-record__avatar {
  background: transparent;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.transfer-history-mobile-record__avatar :deep(.v-icon) {
  font-size: 2rem;
}

.transfer-history-mobile-record__heading {
  min-inline-size: 0;
}

.transfer-history-mobile-record__title {
  overflow: hidden;
  color: rgba(var(--v-theme-on-surface), var(--v-high-emphasis-opacity));
  font-size: 1.125rem;
  font-weight: 650;
  line-height: 1.25;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.transfer-history-mobile-record__subtitle {
  overflow: hidden;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 0.875rem;
  line-height: 1.45;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.transfer-history-mobile-record__status {
  align-self: start;
  border-radius: 999px !important;
  font-weight: 650;
  padding-inline: 0.65rem !important;
}

.transfer-history-mobile-record__menu {
  place-self: start end;
}

.transfer-history-mobile-record__checkbox {
  place-self: start end;
  margin-block-start: -0.35rem;
  margin-inline-end: -0.35rem;
}

.transfer-history-mobile-record__checkbox :deep(.v-selection-control) {
  min-block-size: 2rem;
}

.transfer-history-mobile-record__meta {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  overflow-x: auto;
  padding-block: 0 0.85rem;
  padding-inline: 1rem;
  scrollbar-width: none;
  white-space: nowrap;
}

.transfer-history-mobile-record__meta::-webkit-scrollbar {
  display: none;
}

.transfer-history-mobile-record__meta > span {
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 0.875rem;
}

.transfer-history-mobile-record__mode {
  border-color: rgb(var(--v-theme-primary)) !important;
  border-radius: 999px !important;
  color: rgb(var(--v-theme-primary)) !important;
  font-weight: 650;
}

.transfer-history-mobile-record__dot {
  color: rgba(var(--v-theme-on-surface), var(--v-disabled-opacity)) !important;
}

.transfer-history-mobile-record__paths {
  display: grid;
  border: 0;
  background: transparent;
  border-block-start: 1px solid rgba(var(--v-theme-on-surface), 0.08);
  color: inherit;
  cursor: pointer;
  gap: 0.45rem;
  grid-template-columns: 1fr;
  inline-size: 100%;
  padding-block: 0.85rem 0.95rem;
  padding-inline: 1rem;
  text-align: start;
}

.transfer-history-mobile-record__path-row {
  display: grid;
  align-items: center;
  gap: 0.75rem;
  grid-template-columns: var(--transfer-history-mobile-storage-width) minmax(0, 1fr);
}

.transfer-history-mobile-record__path-arrow {
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  inline-size: var(--transfer-history-mobile-storage-width);
  padding-inline-start: 0.5rem;
}

.transfer-history-mobile-record__storage {
  display: inline-flex;
  overflow: hidden;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  background: var(--transfer-history-mobile-muted-bg);
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 0.75rem;
  line-height: 1.4;
  max-inline-size: 100%;
  min-block-size: 1.55rem;
  padding-block: 0.125rem;
  padding-inline: 0.425rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.transfer-history-mobile-record__path-row p {
  overflow: hidden;
  margin: 0;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 0.875rem;
  line-height: 1.45;
  overflow-wrap: anywhere;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.transfer-history-mobile-record__paths--expanded .transfer-history-mobile-record__path-row p {
  white-space: normal;
}

.transfer-history-mobile-record__error {
  display: flex;
  align-items: center;
  border: 1px solid rgba(var(--v-theme-error), 0.2);
  border-radius: 8px;
  background: rgba(var(--v-theme-error), 0.08);
  color: rgb(var(--v-theme-error));
  font-size: 0.875rem;
  font-weight: 650;
  gap: 0.5rem;
  line-height: 1.45;
  margin-block: 0 1rem;
  margin-inline: 1rem;
  overflow-wrap: anywhere;
  padding-block: 0.65rem;
  padding-inline: 0.75rem;
}

html[data-theme='transparent'] .transfer-history-mobile-page,
.v-theme--transparent .transfer-history-mobile-page {
  --transfer-history-mobile-surface-opacity: var(--transparent-opacity-light, 0.2);
  --transfer-history-mobile-search-bg: rgba(var(--v-theme-surface), var(--transparent-opacity-light, 0.2));
  --transfer-history-mobile-muted-bg: rgba(var(--v-theme-surface), var(--transparent-opacity, 0.3));
  --transfer-history-mobile-border: rgba(var(--v-theme-on-surface), 0.14);
  --transfer-history-mobile-surface-blur: blur(var(--transparent-blur, 10px));
}
</style>
