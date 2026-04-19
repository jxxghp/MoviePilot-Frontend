<script setup lang="ts">
import api from '@/api'
import { Workflow } from '@/api/types'
import WorkflowAddEditDialog from '@/components/dialog/WorkflowAddEditDialog.vue'
import WorkflowTaskCard from '@/components/cards/WorkflowTaskCard.vue'
import NoDataFound from '@/components/NoDataFound.vue'
import { useI18n } from 'vue-i18n'

// 国际化
const { t } = useI18n()

// 是否刷新
const isRefreshed = ref(false)

// 新增对话框
const addDialog = ref(false)

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
  try {
    workflowList.value = await api.get('workflow/')
    isRefreshed.value = true
  } catch (error) {
    console.error(error)
  }
}

// 新增完成
function addDone() {
  addDialog.value = false
  fetchData()
}

onMounted(() => {
  loadEventTypes()
  fetchData()
})

onActivated(() => {
  fetchData()
})

function openAddDialog() {
  addDialog.value = true
}

defineExpose({
  openAddDialog,
})
</script>
<template>
  <div>
    <LoadingBanner v-if="!isRefreshed" class="mt-12" />
    <div v-if="workflowList.length > 0 && isRefreshed" class="grid gap-4 grid-workflow-card px-2">
      <WorkflowTaskCard v-for="item in workflowList" :key="item.id" :workflow="item" :event-types="eventTypes" @refresh="fetchData" />
    </div>
    <NoDataFound
      v-if="workflowList.length === 0 && isRefreshed"
      error-code="404"
      :error-title="t('workflow.noWorkflow')"
      :error-description="t('workflow.noWorkflowDescription')"
    />
    <!-- 新增对话框 -->
    <WorkflowAddEditDialog v-if="addDialog" v-model="addDialog" @close="addDialog = false" @save="addDone" />
  </div>
</template>
