<script setup lang="ts">
import api from '@/api'
import { Workflow } from '@/api/types'
import WorkflowAddEditDialog from '@/components/dialog/WorkflowAddEditDialog.vue'
import WorkflowTaskCard from '@/components/cards/WorkflowTaskCard.vue'
import NoDataFound from '@/components/NoDataFound.vue'
import { useI18n } from 'vue-i18n'
import { usePWA } from '@/composables/usePWA'

// 国际化
const { t } = useI18n()

// 路由
const route = useRoute()

// PWA模式检测
const { appMode } = usePWA()

// 是否刷新
const isRefreshed = ref(false)

// 新增对话框
const addDialog = ref(false)

// 所有任务
const workflowList = ref<Workflow[]>([])

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
  fetchData()
})

onActivated(() => {
  fetchData()
})
</script>
<template>
  <div>
    <VPageContentTitle :title="t('workflow.title')" />
    <LoadingBanner v-if="!isRefreshed" class="mt-12" />
    <div v-if="workflowList.length > 0 && isRefreshed" class="grid gap-4 grid-workflow-card px-2">
      <WorkflowTaskCard v-for="item in workflowList" :key="item.id" :workflow="item" @refresh="fetchData" />
    </div>
    <NoDataFound
      v-if="workflowList.length === 0 && isRefreshed"
      error-code="404"
      :error-title="t('workflow.noWorkflow')"
      :error-description="t('workflow.noWorkflowDescription')"
    />
  </div>
</template>
