<script setup lang="ts">
import api from '@/api'
import { Workflow } from '@/api/types'
import WorkflowTaskCard from '@/components/cards/WorkflowTaskCard.vue'
import NoDataFound from '@/components/states/NoDataFound.vue'
import ProgressiveCardGrid from '@/components/misc/ProgressiveCardGrid.vue'
import { useI18n } from 'vue-i18n'
import { useKeepAliveRefresh } from '@/composables/useKeepAliveRefresh'
import { openSharedDialog } from '@/composables/useSharedDialog'

const WorkflowAddEditDialog = defineAsyncComponent(() => import('@/components/dialog/WorkflowAddEditDialog.vue'))

// 国际化
const { t } = useI18n()

// 是否刷新
const isRefreshed = ref(false)

// 是否加载中
const loading = ref(false)

// 最近一次工作流列表加载是否失败
const loadFailed = ref(false)

// 仅允许最新请求提交列表状态，避免并发刷新按完成顺序覆盖较新的结果
let latestRequestId = 0

// 所有任务
const workflowList = ref<Workflow[]>([])

// 事件类型列表
const eventTypes = ref<Array<{ title: string; value: string }>>([])

// 加载事件类型列表
async function loadEventTypes() {
  try {
    eventTypes.value = await api.get('workflow/event_types')
  } catch (error) {
    console.error('Failed to load event types:', error)
  }
}

// 加载数据
async function fetchData() {
  const requestId = ++latestRequestId
  loading.value = true
  try {
    const workflows = await api.get<Workflow[]>('workflow/')
    if (requestId !== latestRequestId) return
    workflowList.value = workflows
    loadFailed.value = false
  } catch (error) {
    if (requestId !== latestRequestId) return
    loadFailed.value = true
    console.error(error)
  } finally {
    if (requestId === latestRequestId) {
      loading.value = false
      isRefreshed.value = true
    }
  }
}

// 新增完成
function addDone() {
  fetchData()
}

onMounted(() => {
  loadEventTypes()
  fetchData()
})

useKeepAliveRefresh(fetchData)

function openAddDialog() {
  openSharedDialog(
    WorkflowAddEditDialog,
    {},
    {
      save: addDone,
    },
    { closeOn: ['close', 'save'] },
  )
}

defineExpose({
  openAddDialog,
  refresh: fetchData,
})
</script>
<template>
  <div>
    <LoadingBanner v-if="loading && !isRefreshed" class="mt-12" />
    <NoDataFound
      v-else-if="loadFailed && workflowList.length === 0"
      error-code="500"
      :error-title="t('common.serverConnectionFailed')"
    >
      <template #button>
        <VBtn color="primary" variant="tonal" :loading="loading" @click="fetchData">
          {{ t('common.retry') }}
        </VBtn>
      </template>
    </NoDataFound>
    <VAlert
      v-else-if="loadFailed"
      type="error"
      variant="tonal"
      :title="t('common.serverConnectionFailed')"
      class="mx-2 mb-4"
    >
      <template #append>
        <VBtn color="error" variant="text" :loading="loading" @click="fetchData">
          {{ t('common.retry') }}
        </VBtn>
      </template>
    </VAlert>
    <ProgressiveCardGrid
      v-if="workflowList.length > 0 && isRefreshed"
      :items="workflowList"
      :get-item-key="item => item.id"
      :min-item-width="288"
      :estimated-item-height="420"
      class="px-2"
    >
      <template #default="{ item }">
        <WorkflowTaskCard :workflow="item" :event-types="eventTypes" @refresh="fetchData" />
      </template>
    </ProgressiveCardGrid>
    <NoDataFound
      v-if="workflowList.length === 0 && isRefreshed && !loadFailed"
      error-code="404"
      :error-title="t('workflow.noWorkflow')"
      :error-description="t('workflow.noWorkflowDescription')"
    />
  </div>
</template>
