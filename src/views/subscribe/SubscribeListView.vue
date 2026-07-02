<script lang="ts" setup>
import draggable from 'vuedraggable'
import api from '@/api'
import type { Subscribe } from '@/api/types'
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

// 数据列表
const dataList = ref<Subscribe[]>([])

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
  () => displayList.value.length > 0 && selectedSubscribes.value.length === displayList.value.length,
)

// 归一化订阅排序方式，电影订阅不使用缺失集数排序。
const normalizedSortBy = computed<SubscribeSortBy | ''>(() => {
  const sortBy = props.sortBy as SubscribeSortBy | ''
  if (props.type === '电影' && sortBy === 'lack_episode') {
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

  // 如果是电影，只有洗版和状态
  if (subscribe.type === '电影') {
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
const orderRequestKey = computed(() => (props.type === '电影' ? 'SubscribeMovieOrder' : 'SubscribeTvOrder'))

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
    const response = await api.get(`/user/config/${orderRequestKey.value}`)
    if (response && response.data && response.data.value) {
      orderConfig.value = response.data.value
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
  // 顺序配置
  const orderObj = displayList.value.map(item => ({ id: item.id }))
  orderConfig.value = orderObj
  emit('update:sortBy', 'custom')

  // 保存到服务端
  try {
    await api.post(`/user/config/${orderRequestKey.value}`, orderObj)
  } catch (error) {
    console.error(error)
  }
}

// 获取订阅列表数据
async function fetchData(context: KeepAliveRefreshContext = {}) {
  const showLoading = !context.silent || !isRefreshed.value

  try {
    if (showLoading) {
      loading.value = true
    }
    dataList.value = await api.get('subscribe/')
    isRefreshed.value = true
  } catch (error) {
    console.error(error)
  } finally {
    if (showLoading) {
      loading.value = false
    }
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
    const promises = selectedSubscribes.value.map(id => api.delete(`subscribe/${id}`))
    const results = await Promise.allSettled(promises)

    const successCount = results.filter(result => result.status === 'fulfilled').length
    const failedCount = results.length - successCount

    if (successCount > 0) {
      $toast.success(t('subscribe.batchDeleteSuccess', { count: successCount }))
    }
    if (failedCount > 0) {
      $toast.error(t('subscribe.batchDeleteFailed', { count: failedCount }))
    }

    await fetchData()
    exitBatchMode()
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
    const promises = selectedSubscribes.value.map(id => api.put(`subscribe/status/${id}?state=R`))
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
    const promises = selectedSubscribes.value.map(id => api.put(`subscribe/status/${id}?state=S`))
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
  await loadSubscribeOrderConfig()
  await fetchData()
  if (props.subid) {
    // 找到这个订阅
    const sub = dataList.value.find(sub => sub.id.toString() == props.subid?.toString())
    if (sub) {
      // 打开编辑弹窗
      sub.page_open = true
    }
  }

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
    v-if="displayList.length === 0 && isRefreshed"
    error-code="404"
    :error-title="errorTitle"
    :error-description="errorDescription"
  />
</template>
