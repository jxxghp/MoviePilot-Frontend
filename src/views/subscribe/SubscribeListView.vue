<script lang="ts" setup>
import draggable from 'vuedraggable'
import api from '@/api'
import type { Subscribe, SubscriptionBatchStatus, SubscribeDeletionResult } from '@/api/types'
import NoDataFound from '@/components/states/NoDataFound.vue'
import SubscribeCard from '@/components/cards/SubscribeCard.vue'
import ProgressiveCardGrid from '@/components/misc/ProgressiveCardGrid.vue'
import { useUserStore } from '@/stores'
import { useI18n } from 'vue-i18n'
import { useToast } from 'vue-toastification'
import { useConfirm } from '@/composables/useConfirm'
import { useKeepAliveRefresh, type KeepAliveRefreshContext } from '@/composables/useKeepAliveRefresh'
import { openSharedDialog } from '@/composables/useSharedDialog'
import { useDisplay } from 'vuetify'

const SubscribeHistoryDialog = defineAsyncComponent(() => import('@/components/dialog/SubscribeHistoryDialog.vue'))
const ACTIVE_CARD_REFRESH_INTERVAL_MS = 15_000

// 国际化
const { t } = useI18n()

// 响应式断点用于切换订阅卡片网格密度。
const display = useDisplay()

// 用户 Store
const userStore = useUserStore()

// 提示框
const $toast = useToast()

// 确认框
const createConfirm = useConfirm()

// 从 Store 中获取用户信息
const superUser = userStore.superUser
const userName = userStore.userName

// 输入参数
const props = defineProps({
  type: String,
  subid: String,
  keyword: String,
  statusFilter: String,
  sortMode: {
    type: Boolean,
    default: false,
  },
  sortBy: {
    type: String,
    default: '',
  },
  active: {
    type: Boolean,
    default: true,
  },
})

const emit = defineEmits<{
  'update:sortMode': [value: boolean]
  'update:sortBy': [value: SubscribeSortBy]
  'batch-state-change': [state: SubscribeBatchState]
}>()

type SubscribeSortBy = 'custom' | 'last_update' | 'date' | 'lack_episode'

// 订阅批量模式状态快照，供父页面渲染外部批量操作按钮。
interface SubscribeBatchState {
  enabled: boolean
  selectedCount: number
  totalCount: number
  allSelected: boolean
}

// 是否刷新过
let isRefreshed = ref(false)

// 刷新状态
const loading = ref(false)

// 最近一次列表请求是否失败，用于保留旧数据时持续展示错误状态。
const loadError = ref(false)
let initialSubscriptionOpened = false
let lastSubscriptionRequestAt = Number.NEGATIVE_INFINITY
let subscriptionRequest: Promise<void> | undefined
let pendingSubscriptionRefreshContext: KeepAliveRefreshContext | undefined

// 数据列表
const dataList = ref<Subscribe[]>([])

// 最近批次用于展示聚合进度；订阅级状态仍由卡片各自渲染。
const executionBatches = ref<SubscriptionBatchStatus[]>([])
let executionPollTimer: ReturnType<typeof setTimeout> | undefined
let isUnmounted = false

const activeExecutionStates = new Set([
  'queued',
  'running',
  'matching',
  'searching',
  'waiting_site_budget',
  'preparing',
  'submitting',
  'cancelling',
])
const terminalExecutionStates = new Set(['completed', 'failed', 'cancelled', 'skipped'])

function isActiveExecutionBatch(batch: SubscriptionBatchStatus) {
  return (
    !terminalExecutionStates.has(batch.state) &&
    (activeExecutionStates.has(batch.state) || activeExecutionStates.has(batch.phase))
  )
}

const visibleExecutionBatch = computed(() => {
  return (
    executionBatches.value.find(isActiveExecutionBatch) ||
    executionBatches.value.find(batch => ['failed', 'cancelled', 'skipped'].includes(batch.state)) ||
    null
  )
})

const visibleExecutionBatchAppearance = computed(() => {
  const batch = visibleExecutionBatch.value
  if (!batch || isActiveExecutionBatch(batch)) {
    return { color: 'info', icon: 'mdi-progress-clock' }
  }
  if (batch.state === 'failed') {
    return { color: 'error', icon: 'mdi-alert-outline' }
  }
  if (batch.state === 'skipped') {
    return { color: 'secondary', icon: 'mdi-skip-next-circle-outline' }
  }
  return { color: 'secondary', icon: 'mdi-cancel' }
})

const visibleExecutionBatchState = computed(() => {
  const batch = visibleExecutionBatch.value
  if (!batch) return 'queued'
  return terminalExecutionStates.has(batch.state) ? batch.state : batch.phase
})

const batchProgress = computed(() => {
  const batch = visibleExecutionBatch.value
  if (!batch?.total_count) return 0
  return Math.min(100, Math.round((batch.processed_count / batch.total_count) * 100))
})

const hasActiveCardExecution = computed(() => {
  return dataList.value.some(item => {
    const execution = item.execution_status
    return !!execution && (activeExecutionStates.has(execution.state) || activeExecutionStates.has(execution.phase))
  })
})

// 订阅顺序配置
const orderConfig = ref<{ id: number }[]>([])

// 显示的订阅列表
const displayList = ref<Subscribe[]>([])

// 批量管理相关状态
const isBatchMode = ref(false)
const selectedSubscribes = ref<number[]>([])

const normalizedKeyword = computed(() => props.keyword?.trim().toLowerCase() || '')
const selectedSubscribesSet = computed(() => new Set(selectedSubscribes.value))
const hasCustomOrder = computed(() => orderConfig.value.length > 0)
const isAllSubscribesSelected = computed(
  () => displayList.value.length > 0 && displayList.value.every(item => selectedSubscribesSet.value.has(item.id)),
)

// 归一化订阅排序方式，只有电视剧订阅使用缺失集数排序。
const normalizedSortBy = computed<SubscribeSortBy | ''>(() => {
  const sortBy = props.sortBy as SubscribeSortBy | ''
  if (props.type !== '电视剧' && sortBy === 'lack_episode') {
    return 'date'
  }

  return sortBy
})
const effectiveSortBy = computed<SubscribeSortBy>(() => {
  return normalizedSortBy.value || (hasCustomOrder.value ? 'custom' : 'date')
})
const canSortContext = computed(
  () =>
    effectiveSortBy.value === 'custom' &&
    !normalizedKeyword.value &&
    (!props.statusFilter || props.statusFilter === 'all') &&
    !isBatchMode.value,
)
const sortMode = computed({
  get: () => props.sortMode,
  set: value => emit('update:sortMode', value),
})
const canDragSort = computed(() => sortMode.value && canSortContext.value)
const shouldVirtualizeList = computed(() => !sortMode.value)
const subscribeGridMinItemWidth = computed(() => (display.xs.value ? 144 : 240))
const subscribeGridEstimatedItemHeight = computed(() => (display.xs.value ? 190 : 300))
const subscribeGridGap = computed(() => (display.xs.value ? 12 : 16))
const scrollToIndex = computed(() => {
  if (!props.subid || sortMode.value) {
    return undefined
  }

  const targetIndex = displayList.value.findIndex(item => item.id.toString() === props.subid?.toString())

  return targetIndex >= 0 ? targetIndex : undefined
})

// 根据订阅数据判断订阅状态
function getSubscribeStatus(subscribe: Subscribe) {
  // 洗版中
  if (subscribe.best_version) {
    return 'best_version'
  }

  // 根据订阅状态判断
  if (subscribe.state === 'P') {
    return 'pending' // 待定
  } else if (subscribe.state === 'S') {
    return 'paused' // 暂停
  }

  // 电影、单曲和整专都是原子下载目标；整专曲目总数由订阅卡片单独展示，不映射成分集进度。
  if (subscribe.type === '电影' || subscribe.type === '音乐') {
    return 'all'
  }

  // 电视剧根据集数情况判断：completed_episode 由后端按订阅类型派生
  // （普通=已入库集数，洗版=起始集前 + [start, total] 范围内 priority==100 命中）
  if (subscribe.total_episode && subscribe.total_episode > 0) {
    const lackEpisode = subscribe.lack_episode || 0
    const completedEpisode = subscribe.completed_episode ?? 0

    if (lackEpisode === 0) {
      return 'completed' // 订阅完成
    } else if (completedEpisode > 0) {
      return 'subscribing' // 订阅中
    } else {
      return 'not_started' // 未开始
    }
  }

  return 'not_started' // 默认未开始
}

// API请求键值（计算属性）
const orderRequestKey = computed(() => {
  if (props.type === '电影') return 'SubscribeMovieOrder'
  if (props.type === '音乐') return 'SubscribeMusicOrder'
  return 'SubscribeTvOrder'
})

// 转换订阅时间字段为可排序时间戳。
function getSubscribeTimeValue(value?: string) {
  if (!value) return 0

  const directTime = Date.parse(value)
  if (!Number.isNaN(directTime)) return directTime

  const compatibleTime = Date.parse(value.replace(/-/g, '/'))
  return Number.isNaN(compatibleTime) ? 0 : compatibleTime
}

// 按自定义顺序排序订阅，未配置顺序的订阅按添加时间倒序补齐。
function sortByCustomOrder(a: Subscribe, b: Subscribe, orderIndexMap: Map<number, number>) {
  const aIndex = orderIndexMap.get(a.id) ?? Number.MAX_SAFE_INTEGER
  const bIndex = orderIndexMap.get(b.id) ?? Number.MAX_SAFE_INTEGER

  if (aIndex !== bIndex) {
    return aIndex - bIndex
  }

  return getSubscribeTimeValue(b.date) - getSubscribeTimeValue(a.date)
}

// 按当前排序选项调整订阅列表顺序。
function sortSubscribeList(list: Subscribe[]) {
  const orderIndexMap = new Map(orderConfig.value.map((item, index) => [item.id, index]))

  list.sort((a, b) => {
    if (effectiveSortBy.value === 'custom') {
      return sortByCustomOrder(a, b, orderIndexMap)
    }

    if (effectiveSortBy.value === 'last_update') {
      return getSubscribeTimeValue(b.last_update) - getSubscribeTimeValue(a.last_update)
    }

    if (effectiveSortBy.value === 'lack_episode') {
      const lackEpisodeDiff = (b.lack_episode || 0) - (a.lack_episode || 0)
      return lackEpisodeDiff || getSubscribeTimeValue(b.date) - getSubscribeTimeValue(a.date)
    }

    return getSubscribeTimeValue(b.date) - getSubscribeTimeValue(a.date)
  })
}

// 同步订阅排序默认值给父组件。
function syncDefaultSortBy() {
  if (!props.sortBy) {
    emit('update:sortBy', hasCustomOrder.value ? 'custom' : 'date')
  }
}

// 监听数据、筛选和排序变化，同步更新显示列表
watch(
  [dataList, normalizedKeyword, () => props.statusFilter, orderConfig, effectiveSortBy],
  () => {
    const nextDisplayList = dataList.value.filter(data => {
      if (data.type !== props.type) {
        return false
      }

      if (!superUser && data.username !== userName) {
        return false
      }

      if (normalizedKeyword.value && !data.name?.toLowerCase().includes(normalizedKeyword.value)) {
        return false
      }

      if (props.statusFilter && props.statusFilter !== 'all' && getSubscribeStatus(data) !== props.statusFilter) {
        return false
      }

      return true
    })

    sortSubscribeList(nextDisplayList)

    displayList.value = nextDisplayList
    const visibleIds = new Set(nextDisplayList.map(item => item.id))
    selectedSubscribes.value = selectedSubscribes.value.filter(id => visibleIds.has(id))
  },
  { immediate: true },
)

watch(
  canSortContext,
  canSort => {
    if (!canSort && sortMode.value) {
      sortMode.value = false
    }
  },
  { immediate: true },
)

watch(
  [isBatchMode, () => selectedSubscribes.value.length, () => displayList.value.length, isAllSubscribesSelected],
  emitBatchStateChange,
  { immediate: true },
)

// 加载顺序
async function loadSubscribeOrderConfig() {
  try {
    const response = await api.get<{ value?: { id: number }[] }>(`/user/config/${orderRequestKey.value}`)
    if (response.value) {
      orderConfig.value = response.value
    }
    syncDefaultSortBy()
  } catch (error) {
    console.error('Failed to load subscribe order config:', error)
    orderConfig.value = []
    syncDefaultSortBy()
  }
}

// 保存顺序设置
async function saveSubscribeOrder() {
  const confirmedOrder = orderConfig.value.map(item => ({ ...item }))
  const orderObj = displayList.value.map(item => ({ id: item.id }))
  orderConfig.value = orderObj
  emit('update:sortBy', 'custom')

  try {
    await api.post(`/user/config/${orderRequestKey.value}`, orderObj)
  } catch (error) {
    console.error(error)
    orderConfig.value = confirmedOrder
    const restoredDisplayList = [...displayList.value]
    sortSubscribeList(restoredDisplayList)
    displayList.value = restoredDisplayList
    $toast.error(t('subscribe.requestFailed'))
  }
}

// 获取订阅列表；批次状态使用独立错误边界，不参与列表成功判定。
async function requestSubscriptions(context: KeepAliveRefreshContext = {}) {
  const showLoading = !context.silent || !isRefreshed.value
  const isInitialLoad = !isRefreshed.value
  lastSubscriptionRequestAt = Date.now()

  try {
    if (showLoading) {
      loading.value = true
    }
    const subscribes = await api.get<Subscribe[]>('subscribe/', { feedback: 'silent' })
    if (!initialSubscriptionOpened) {
      initialSubscriptionOpened = true
      const initialSubscription = subscribes.find(subscribe => subscribe.id.toString() === props.subid?.toString())
      if (initialSubscription) initialSubscription.page_open = true
    }
    dataList.value = subscribes
    loadError.value = false
    isRefreshed.value = true
  } catch (error) {
    if (isCancelledRequest(error)) return
    console.error(error)
    loadError.value = true
    if (isInitialLoad) {
      isRefreshed.value = true
    }
    if (!context.silent || isInitialLoad) {
      $toast.error(t('subscribe.requestFailed'))
    }
  } finally {
    if (showLoading) {
      loading.value = false
    }
  }
}

// 合并在途请求期间的刷新意图，显式刷新优先于静默刷新。
function mergeSubscriptionRefreshContext(current: KeepAliveRefreshContext | undefined, next: KeepAliveRefreshContext) {
  if (!current) return next

  return {
    // 只要有一个显式入口，trailing 请求就不能继续静默处理。
    silent: current.silent === true && next.silent === true ? true : undefined,
    source: next.source ?? current.source,
  }
}

// 在途请求结束后补一次最新列表；重复静默触发只更新同一个 trailing 槽位。
async function runSubscriptionRefresh(context: KeepAliveRefreshContext) {
  let nextContext = context

  while (true) {
    pendingSubscriptionRefreshContext = undefined
    await requestSubscriptions(nextContext)

    if (!pendingSubscriptionRefreshContext) return
    nextContext = pendingSubscriptionRefreshContext
  }
}

// 所有刷新入口共享列表刷新 worker，避免慢响应期间并发读取和旧快照回写。
async function fetchSubscriptions(context: KeepAliveRefreshContext = {}) {
  if (subscriptionRequest) {
    pendingSubscriptionRefreshContext = mergeSubscriptionRefreshContext(pendingSubscriptionRefreshContext, context)
    return subscriptionRequest
  }

  const request = runSubscriptionRefresh(context)
  subscriptionRequest = request
  try {
    await request
  } finally {
    if (subscriptionRequest === request) subscriptionRequest = undefined
    pendingSubscriptionRefreshContext = undefined
  }
}

function executionBatchSignature(batches: SubscriptionBatchStatus[]) {
  return JSON.stringify(
    batches.map(batch => [
      batch.batch_id,
      batch.source,
      batch.state,
      batch.phase,
      batch.total_count,
      batch.processed_count,
      batch.finished_count,
      batch.failed_count,
      batch.cancelled_count,
      batch.skipped_count,
      batch.created_at,
      batch.current_subscription_id,
      batch.current_site_id,
      batch.updated_at,
      batch.error,
      batch.can_cancel,
    ]),
  )
}

let lastExecutionBatchSignature: string | undefined
let executionBatchRequest: Promise<boolean> | undefined
let executionPollRequest: Promise<void> | undefined
let executionBatchRequestFailed = false

// 批次读取失败时保留上次快照，让订阅列表和后续轮询仍可独立工作。
async function requestExecutionBatches() {
  try {
    const batches = await api.get<SubscriptionBatchStatus[]>('subscribe/execution/batches?limit=10', {
      feedback: 'silent',
    })
    if (isUnmounted) return false
    const nextSignature = executionBatchSignature(batches)
    const changed =
      executionBatchRequestFailed ||
      (lastExecutionBatchSignature !== undefined && nextSignature !== lastExecutionBatchSignature)
    executionBatchRequestFailed = false
    lastExecutionBatchSignature = nextSignature
    executionBatches.value = batches
    return changed
  } catch (error) {
    if (!isUnmounted && !isCancelledRequest(error)) {
      console.error(error)
      executionBatchRequestFailed = true
    }
    return false
  }
}

// 可见性、手工刷新和定时轮询共享同一个在途请求，避免旧快照覆盖新状态。
async function fetchExecutionBatches() {
  if (executionBatchRequest) return executionBatchRequest
  const request = requestExecutionBatches()
  executionBatchRequest = request
  try {
    return await request
  } finally {
    if (executionBatchRequest === request) executionBatchRequest = undefined
  }
}

// 列表和批次各自收口请求错误，任一失败都不覆盖另一份成功数据。
async function fetchData(context: KeepAliveRefreshContext = {}) {
  await Promise.all([fetchSubscriptions(context), fetchExecutionBatches()])
  scheduleExecutionPoll()
}

function clearExecutionPoll() {
  if (executionPollTimer) {
    clearTimeout(executionPollTimer)
    executionPollTimer = undefined
  }
}

// 高频只读取轻量批次；进度变化、活动卡片或列表错误恢复时才刷新完整订阅列表。
async function runExecutionPoll() {
  executionPollTimer = undefined
  if (isUnmounted || !props.active || document.hidden) return
  const batchChanged = await fetchExecutionBatches()
  const cardRefreshDue =
    (hasActiveCardExecution.value || loadError.value) &&
    Date.now() - lastSubscriptionRequestAt >= ACTIVE_CARD_REFRESH_INTERVAL_MS
  if (!isUnmounted && props.active && !document.hidden && (batchChanged || cardRefreshDue)) {
    void fetchSubscriptions({ silent: true })
  }
  scheduleExecutionPoll()
}

// 可见性和定时器触发的轮询共用完整生命周期，避免同一批次结果触发多次列表刷新。
async function pollExecutionState() {
  if (executionPollRequest) return executionPollRequest

  const request = runExecutionPoll()
  executionPollRequest = request
  try {
    await request
  } finally {
    if (executionPollRequest === request) {
      executionPollRequest = undefined
    }
  }
}

// 页面可见时持续读取轻量批次，使外部入口启动的新批次和接口恢复能够被发现。
function scheduleExecutionPoll() {
  clearExecutionPoll()
  if (isUnmounted || !props.active || document.hidden) return
  executionPollTimer = setTimeout(() => {
    void pollExecutionState()
  }, 2500)
}

function handleExecutionVisibilityChange() {
  if (document.hidden) {
    clearExecutionPoll()
    return
  }
  if (!isUnmounted && props.active) void pollExecutionState()
}

// 页面切换触发的请求取消是正常生命周期，不应展示为业务失败。
function isCancelledRequest(error: unknown) {
  return !!error && typeof error === 'object' && 'code' in error && error.code === 'ERR_CANCELED'
}

async function cancelExecutionBatch() {
  const batch = visibleExecutionBatch.value
  if (!batch?.can_cancel) return
  try {
    await api.put(`subscribe/execution/batches/${batch.batch_id}/cancel`, undefined, { feedback: 'silent' })
    $toast.success(t('subscribe.execution.cancelRequested'))
    await fetchData({ silent: true })
  } catch (error) {
    console.error(error)
    $toast.error(t('subscribe.execution.cancelFailed'))
  }
}

// 历史记录窗口完成
function historyDone() {
  fetchData()
}

function openHistoryDialog() {
  openSharedDialog(
    SubscribeHistoryDialog,
    { type: props.type },
    {
      save: historyDone,
    },
    { closeOn: ['close', 'save'] },
  )
}

// 向父组件同步批量操作状态，供 Footer/FAB 动态按钮渲染。
function emitBatchStateChange() {
  emit('batch-state-change', {
    enabled: isBatchMode.value,
    selectedCount: selectedSubscribes.value.length,
    totalCount: displayList.value.length,
    allSelected: isAllSubscribesSelected.value,
  })
}

// 进入批量模式。
function enterBatchMode() {
  isBatchMode.value = true
}

// 退出批量模式并清空已选择的订阅。
function exitBatchMode() {
  isBatchMode.value = false
  selectedSubscribes.value = []
}

// 切换批量模式。
function toggleBatchMode() {
  if (isBatchMode.value) {
    exitBatchMode()
    return
  }

  enterBatchMode()
}

// 全选或取消全选当前显示的订阅。
function toggleSelectAll() {
  if (isAllSubscribesSelected.value) {
    selectedSubscribes.value = []
  } else {
    selectedSubscribes.value = displayList.value.map(item => item.id)
  }
}

// 切换单个订阅的选中状态。
function toggleSelectSubscribe(id: number) {
  const index = selectedSubscribes.value.indexOf(id)
  if (index > -1) {
    selectedSubscribes.value.splice(index, 1)
  } else {
    selectedSubscribes.value.push(id)
  }
}

// 批量删除已选中的订阅。
async function batchDeleteSubscribes() {
  if (selectedSubscribes.value.length === 0) {
    $toast.warning(t('subscribe.noSelectedItems'))
    return
  }

  const isConfirmed = await createConfirm({
    title: t('common.confirm'),
    content: t('subscribe.batchDeleteConfirm', { count: selectedSubscribes.value.length }),
  })

  if (!isConfirmed) return

  try {
    loading.value = true
    const selectedIds = [...selectedSubscribes.value]
    const promises = selectedIds.map(id =>
      api.delete<SubscribeDeletionResult>(`subscribe/${id}`, { feedback: 'silent' }),
    )
    const results = await Promise.allSettled(promises)

    const deletedIds = selectedIds.filter((_, index) => {
      const result = results[index]
      return result.status === 'fulfilled' && result.value?.status === 'deleted'
    })
    const failedIds = selectedIds.filter(id => !deletedIds.includes(id))
    const successCount = deletedIds.length
    const failedCount = failedIds.length

    if (successCount > 0) {
      $toast.success(t('subscribe.batchDeleteSuccess', { count: successCount }))
    }
    if (failedCount > 0) {
      $toast.error(t('subscribe.batchDeleteFailed', { count: failedCount }))
    }

    // 失败项保留在选择集中，用户可直接修复后重试；全部成功时才退出批量模式。
    selectedSubscribes.value = failedIds
    await fetchData()
    if (failedIds.length === 0) exitBatchMode()
  } catch (error) {
    console.error(error)
    $toast.error(t('subscribe.batchDeleteError'))
  } finally {
    loading.value = false
  }
}

// 批量启用已选中的订阅。
async function batchEnableSubscribes() {
  if (selectedSubscribes.value.length === 0) {
    $toast.warning(t('subscribe.noSelectedItems'))
    return
  }

  const isConfirmed = await createConfirm({
    title: t('common.confirm'),
    content: t('subscribe.batchEnableConfirm', { count: selectedSubscribes.value.length }),
  })

  if (!isConfirmed) return

  try {
    loading.value = true
    const promises = selectedSubscribes.value.map(id =>
      api.put<null>(`subscribe/status/${id}?state=R`, undefined, { feedback: 'silent' }),
    )
    const results = await Promise.allSettled(promises)

    const successCount = results.filter(result => result.status === 'fulfilled').length
    const failedCount = results.length - successCount

    if (successCount > 0) {
      $toast.success(t('subscribe.batchEnableSuccess', { count: successCount }))
    }
    if (failedCount > 0) {
      $toast.error(t('subscribe.batchEnableFailed', { count: failedCount }))
    }

    await fetchData()
    exitBatchMode()
  } catch (error) {
    console.error(error)
    $toast.error(t('subscribe.batchEnableError'))
  } finally {
    loading.value = false
  }
}

// 批量暂停已选中的订阅。
async function batchPauseSubscribes() {
  if (selectedSubscribes.value.length === 0) {
    $toast.warning(t('subscribe.noSelectedItems'))
    return
  }

  const isConfirmed = await createConfirm({
    title: t('common.confirm'),
    content: t('subscribe.batchPauseConfirm', { count: selectedSubscribes.value.length }),
  })

  if (!isConfirmed) return

  try {
    loading.value = true
    const promises = selectedSubscribes.value.map(id =>
      api.put<null>(`subscribe/status/${id}?state=S`, undefined, { feedback: 'silent' }),
    )
    const results = await Promise.allSettled(promises)

    const successCount = results.filter(result => result.status === 'fulfilled').length
    const failedCount = results.length - successCount

    if (successCount > 0) {
      $toast.success(t('subscribe.batchPauseSuccess', { count: successCount }))
    }
    if (failedCount > 0) {
      $toast.error(t('subscribe.batchPauseFailed', { count: failedCount }))
    }

    await fetchData()
    exitBatchMode()
  } catch (error) {
    console.error(error)
    $toast.error(t('subscribe.batchPauseError'))
  } finally {
    loading.value = false
  }
}

// 错误描述
const errorDescription = computed(() => {
  if ((props.statusFilter && props.statusFilter !== 'all') || props.keyword) {
    return t('common.tryChangingFilters')
  }
  return t('subscribe.noSubscribeData')
})

// 错误标题
const errorTitle = computed(() => {
  if ((props.statusFilter && props.statusFilter !== 'all') || props.keyword) {
    return t('common.noMatchingData')
  }
  return t('common.noData')
})

onMounted(async () => {
  isUnmounted = false
  document.addEventListener('visibilitychange', handleExecutionVisibilityChange)
  await loadSubscribeOrderConfig()
  await fetchData()
})

watch(
  () => props.active,
  active => {
    if (!active) {
      clearExecutionPoll()
      return
    }
    scheduleExecutionPoll()
  },
)

onBeforeUnmount(() => {
  isUnmounted = true
  clearExecutionPoll()
  document.removeEventListener('visibilitychange', handleExecutionVisibilityChange)
})

useKeepAliveRefresh(fetchData, {
  active: computed(() => props.active),
})

defineExpose({
  openHistoryDialog,
  enterBatchMode,
  exitBatchMode,
  toggleBatchMode,
  toggleSelectAll,
  batchEnableSubscribes,
  batchPauseSubscribes,
  batchDeleteSubscribes,
})
</script>

<template>
  <LoadingBanner v-if="!isRefreshed" class="mt-12" />

  <VAlert v-if="loadError" type="error" variant="tonal" class="mb-4 mx-2">
    {{ t('subscribe.requestFailed') }}
  </VAlert>

  <VAlert
    v-if="visibleExecutionBatch"
    :color="visibleExecutionBatchAppearance.color"
    variant="tonal"
    class="subscribe-execution-banner mb-4 mx-2 py-2"
  >
    <div class="d-flex min-w-0 align-center gap-3">
      <VIcon :icon="visibleExecutionBatchAppearance.icon" size="20" />
      <div class="min-w-0 flex-grow-1">
        <div class="d-flex min-w-0 align-center justify-space-between gap-2 text-body-2 font-weight-medium">
          <span class="text-truncate">
            {{ t(`subscribe.execution.state.${visibleExecutionBatchState}`) }}
          </span>
          <span class="flex-shrink-0">
            {{
              t('subscribe.execution.batchProgress', {
                processed: visibleExecutionBatch.processed_count,
                total: visibleExecutionBatch.total_count,
              })
            }}
          </span>
        </div>
        <VProgressLinear
          :model-value="batchProgress"
          :indeterminate="
            visibleExecutionBatch.total_count === 0 && activeExecutionStates.has(visibleExecutionBatch.state)
          "
          height="3"
          class="mt-2"
        />
        <div v-if="visibleExecutionBatch.error" class="text-caption mt-1 text-truncate">
          {{ visibleExecutionBatch.error }}
        </div>
      </div>
      <IconBtn
        v-if="visibleExecutionBatch.can_cancel"
        size="small"
        :title="t('subscribe.execution.cancel')"
        @click="cancelExecutionBatch"
      >
        <VIcon icon="mdi-close-circle-outline" />
      </IconBtn>
    </div>
  </VAlert>

  <VAlert v-if="sortMode" color="warning" variant="tonal" class="mb-4 mx-2 py-0 app-surface-static">
    <div class="d-flex flex-wrap align-center justify-space-between gap-2 py-5">
      <span>{{ t('common.sortModeHint') }}</span>
      <VBtn variant="tonal" color="error" @click="sortMode = false">
        {{ t('common.exit') }}
      </VBtn>
    </div>
  </VAlert>

  <draggable
    v-if="displayList.length > 0 && canDragSort"
    v-model="displayList"
    @end="saveSubscribeOrder"
    item-key="id"
    tag="div"
    :component-data="{ class: 'grid gap-4 grid-subscribe-card px-2' }"
  >
    <template #item="{ element }">
      <SubscribeCard
        :key="element.id"
        :media="element"
        :batch-mode="isBatchMode"
        :selected="selectedSubscribesSet.has(element.id)"
        :sortable="true"
        @remove="fetchData"
        @save="fetchData"
        @select="toggleSelectSubscribe(element.id)"
      />
    </template>
  </draggable>
  <ProgressiveCardGrid
    v-else-if="displayList.length > 0 && shouldVirtualizeList"
    :items="displayList"
    :get-item-key="item => item.id"
    :min-item-width="subscribeGridMinItemWidth"
    :estimated-item-height="subscribeGridEstimatedItemHeight"
    :gap="subscribeGridGap"
    :scroll-to-index="scrollToIndex"
    class="px-2"
  >
    <template #default="{ item }">
      <SubscribeCard
        :key="item.id"
        :media="item"
        :batch-mode="isBatchMode"
        :selected="selectedSubscribesSet.has(item.id)"
        :sortable="false"
        @remove="fetchData"
        @save="fetchData"
        @select="toggleSelectSubscribe(item.id)"
      />
    </template>
  </ProgressiveCardGrid>
  <NoDataFound
    v-if="displayList.length === 0 && isRefreshed && !loadError"
    error-code="404"
    :error-title="errorTitle"
    :error-description="errorDescription"
  />
</template>
