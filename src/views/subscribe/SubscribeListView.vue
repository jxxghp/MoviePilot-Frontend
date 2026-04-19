<script lang="ts" setup>
import draggable from 'vuedraggable'
import api from '@/api'
import type { Subscribe } from '@/api/types'
import NoDataFound from '@/components/NoDataFound.vue'
import SubscribeCard from '@/components/cards/SubscribeCard.vue'
import SubscribeHistoryDialog from '@/components/dialog/SubscribeHistoryDialog.vue'
import { useUserStore } from '@/stores'
import { useI18n } from 'vue-i18n'
import { useToast } from 'vue-toastification'
import { useConfirm } from '@/composables/useConfirm'

// 国际化
const { t } = useI18n()

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
})

// 是否刷新过
let isRefreshed = ref(false)

// 刷新状态
const loading = ref(false)

// 数据列表
const dataList = ref<Subscribe[]>([])

// 历史记录弹窗
const historyDialog = ref(false)

// 订阅顺序配置
const orderConfig = ref<{ id: number }[]>([])

// 显示的订阅列表
const displayList = ref<Subscribe[]>([])

// 批量管理相关状态
const isBatchMode = ref(false)
const selectedSubscribes = ref<number[]>([])

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

  // 电视剧根据集数情况判断
  if (subscribe.total_episode && subscribe.total_episode > 0) {
    const lackEpisode = subscribe.lack_episode || 0
    const completedEpisode = subscribe.total_episode - lackEpisode

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

// 监听dataList变化，同步更新displayList
watch([dataList, () => props.keyword, () => props.statusFilter], () => {
  if (superUser)
    displayList.value = dataList.value.filter(
      data =>
        data.type === props.type &&
        (!props.keyword || data.name.toLowerCase().includes(props.keyword.toLowerCase())) &&
        (!props.statusFilter || props.statusFilter === 'all' || getSubscribeStatus(data) === props.statusFilter),
    )
  else
    displayList.value = dataList.value.filter(
      data =>
        data.type === props.type &&
        data.username === userName &&
        (!props.keyword || data.name.toLowerCase().includes(props.keyword.toLowerCase())) &&
        (!props.statusFilter || props.statusFilter === 'all' || getSubscribeStatus(data) === props.statusFilter),
    )
  // 排序
  sortSubscribeOrder()
})

// 加载顺序
async function loadSubscribeOrderConfig() {
  try {
    const response = await api.get(`/user/config/${orderRequestKey.value}`)
    if (response && response.data && response.data.value) {
      orderConfig.value = response.data.value
    }
  } catch (error) {
    console.error('Failed to load subscribe order config:', error)
    orderConfig.value = []
  }
}

// 按order的顺序排序
async function sortSubscribeOrder() {
  if (!orderConfig.value) {
    return
  }
  if (displayList.value.length === 0) {
    return
  }
  await loadSubscribeOrderConfig()
  displayList.value.sort((a, b) => {
    const aIndex = orderConfig.value.findIndex((item: { id: number }) => item.id === a.id)
    const bIndex = orderConfig.value.findIndex((item: { id: number }) => item.id === b.id)
    return (aIndex === -1 ? 999 : aIndex) - (bIndex === -1 ? 999 : bIndex)
  })
}

// 保存顺序设置
async function saveSubscribeOrder() {
  // 顺序配置
  const orderObj = displayList.value.map(item => ({ id: item.id }))
  orderConfig.value = orderObj

  // 保存到服务端
  try {
    await api.post(`/user/config/${orderRequestKey.value}`, orderObj)
  } catch (error) {
    console.error(error)
  }
}

// 获取订阅列表数据
async function fetchData() {
  try {
    loading.value = true
    dataList.value = await api.get('subscribe/')
    loading.value = false
    isRefreshed.value = true
  } catch (error) {
    console.error(error)
  }
}

// 历史记录窗口完成
function historyDone() {
  historyDialog.value = false
  fetchData()
}

function openHistoryDialog() {
  historyDialog.value = true
}

// 批量管理相关函数
// 切换批量模式
function toggleBatchMode() {
  isBatchMode.value = !isBatchMode.value
  if (!isBatchMode.value) {
    selectedSubscribes.value = []
  }
}

// 全选/取消全选
function toggleSelectAll() {
  if (selectedSubscribes.value.length === displayList.value.length) {
    selectedSubscribes.value = []
  } else {
    selectedSubscribes.value = displayList.value.map(item => item.id)
  }
}

// 选择单个订阅
function toggleSelectSubscribe(id: number) {
  const index = selectedSubscribes.value.indexOf(id)
  if (index > -1) {
    selectedSubscribes.value.splice(index, 1)
  } else {
    selectedSubscribes.value.push(id)
  }
}

// 批量删除订阅
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

    // 刷新数据
    await fetchData()
    // 退出批量模式
    isBatchMode.value = false
    selectedSubscribes.value = []
  } catch (error) {
    console.error(error)
    $toast.error(t('subscribe.batchDeleteError'))
  } finally {
    loading.value = false
  }
}

// 批量启用订阅
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

    // 刷新数据
    await fetchData()
    // 退出批量模式
    isBatchMode.value = false
    selectedSubscribes.value = []
  } catch (error) {
    console.error(error)
    $toast.error(t('subscribe.batchEnableError'))
  } finally {
    loading.value = false
  }
}

// 批量暂停订阅
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

    // 刷新数据
    await fetchData()
    // 退出批量模式
    isBatchMode.value = false
    selectedSubscribes.value = []
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
  await fetchData()
  if (props.subid) {
    // 找到这个订阅
    const sub = dataList.value.find(sub => sub.id.toString() == props.subid?.toString())
    if (sub) {
      // 打开编辑弹窗
      sub.page_open = true
    }
  }

  // 监听批量管理模式切换事件
  window.addEventListener('toggle-batch-mode', toggleBatchMode)
})

onUnmounted(() => {
  // 移除事件监听器
  window.removeEventListener('toggle-batch-mode', toggleBatchMode)
})

onActivated(async () => {
  if (!loading.value) {
    fetchData()
  }
})

defineExpose({
  openHistoryDialog,
})
</script>

<template>
  <LoadingBanner v-if="!isRefreshed" class="mt-12" />

  <!-- 批量管理工具栏 -->
  <div v-if="isBatchMode" class="mb-4 px-2">
    <VCard class="pa-4">
      <div class="d-flex align-center justify-space-between">
        <div class="d-flex align-center">
          <VCheckbox
            :model-value="selectedSubscribes.length === displayList.length"
            :indeterminate="selectedSubscribes.length > 0 && selectedSubscribes.length < displayList.length"
            @update:model-value="toggleSelectAll"
            hide-details
            class="me-4"
          />
          <span class="text-body-1 font-weight-medium">
            {{ t('subscribe.selectedCount', { count: selectedSubscribes.length, total: displayList.length }) }}
          </span>
        </div>
        <div class="d-flex gap-2">
          <VBtn
            color="success"
            variant="outlined"
            size="small"
            :disabled="selectedSubscribes.length === 0"
            @click="batchEnableSubscribes"
          >
            <VIcon icon="mdi-play" class="me-sm-1" />
            <span class="d-none d-sm-inline">{{ t('subscribe.batchEnable') }}</span>
          </VBtn>
          <VBtn
            color="info"
            variant="outlined"
            size="small"
            :disabled="selectedSubscribes.length === 0"
            @click="batchPauseSubscribes"
          >
            <VIcon icon="mdi-pause" class="me-sm-1" />
            <span class="d-none d-sm-inline">{{ t('subscribe.batchPause') }}</span>
          </VBtn>
          <VBtn
            color="error"
            variant="outlined"
            size="small"
            :disabled="selectedSubscribes.length === 0"
            @click="batchDeleteSubscribes"
          >
            <VIcon icon="mdi-delete" class="me-sm-1" />
            <span class="d-none d-sm-inline">{{ t('subscribe.batchDelete') }}</span>
          </VBtn>
          <VBtn color="secondary" variant="outlined" size="small" @click="toggleBatchMode">
            <VIcon icon="mdi-close" class="me-sm-1" />
            <span class="d-none d-sm-inline">{{ t('common.cancel') }}</span>
          </VBtn>
        </div>
      </div>
    </VCard>
  </div>

  <draggable
    v-if="displayList.length > 0"
    v-model="displayList"
    @end="saveSubscribeOrder"
    handle=".cursor-move"
    item-key="id"
    tag="div"
    :component-data="{ class: 'grid gap-4 grid-subscribe-card px-2' }"
    :disabled="props.keyword || (props.statusFilter && props.statusFilter !== 'all') || isBatchMode"
  >
    <template #item="{ element }">
      <SubscribeCard
        :key="element.id"
        :media="element"
        :batch-mode="isBatchMode"
        :selected="selectedSubscribes.includes(element.id)"
        @remove="fetchData"
        @save="fetchData"
        @select="toggleSelectSubscribe(element.id)"
      />
    </template>
  </draggable>
  <NoDataFound
    v-if="displayList.length === 0 && isRefreshed"
    error-code="404"
    :error-title="errorTitle"
    :error-description="errorDescription"
  />
  <!-- 历史记录弹窗 -->
  <SubscribeHistoryDialog
    v-if="historyDialog"
    v-model="historyDialog"
    :type="props.type"
    @close="historyDialog = false"
    @save="historyDone"
  />
</template>
