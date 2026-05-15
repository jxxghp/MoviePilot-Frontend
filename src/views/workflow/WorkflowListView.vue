<script setup lang="ts">
import api from '@/api'
import { Workflow } from '@/api/types'
import WorkflowAddEditDialog from '@/components/dialog/WorkflowAddEditDialog.vue'
import WorkflowTaskCard from '@/components/cards/WorkflowTaskCard.vue'
import NoDataFound from '@/components/NoDataFound.vue'
import VirtualGrid from '@/components/virtual/VirtualGrid.vue'
import { useBreakpointCols } from '@/composables/virtual/useBreakpointCols'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

// 列数：按视口断点（路由级全宽页）
const cols = useBreakpointCols({ xs: 1, sm: 2, md: 2, lg: 3, xl: 4, xxl: 4 })

const isRefreshed = ref(false)
const addDialog = ref(false)
const workflowList = ref<Workflow[]>([])
const eventTypes = ref<Array<{ title: string; value: string }>>([])

async function loadEventTypes() {
  try {
    eventTypes.value = await api.get('workflow/event_types')
  } catch (error) {
    console.error('Failed to load event types:', error)
  }
}

async function fetchData() {
  try {
    workflowList.value = await api.get('workflow/')
    isRefreshed.value = true
  } catch (error) {
    console.error(error)
  }
}

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
    <VirtualGrid
      v-if="workflowList.length > 0 && isRefreshed"
      :items="workflowList"
      :columns="cols"
      :row-estimate-size="420"
      :gap="12"
      :overscan="2"
      key-field="id"
      use-window-scroll
      class="px-2"
    >
      <template #item="{ item }">
        <WorkflowTaskCard :workflow="item" :event-types="eventTypes" @refresh="fetchData" />
      </template>
    </VirtualGrid>
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
