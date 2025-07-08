<script lang="ts" setup>
import { formatDateDifference } from '@/@core/utils/formatters'
import type { WorkflowShare } from '@/api/types'
import WorkflowEditDialog from '../dialog/WorkflowAddEditDialog.vue'
import ForkWorkflowDialog from '../dialog/ForkWorkflowDialog.vue'
import { useGlobalSettingsStore } from '@/stores'

// 输入参数
const props = defineProps({
  media: Object as PropType<WorkflowShare>,
})

// 定义删除事件
const emit = defineEmits(['delete'])

// 从 provide 中获取全局设置
// 全局设置
const globalSettingsStore = useGlobalSettingsStore()
const globalSettings = globalSettingsStore.globalSettings

// 工作流编辑弹窗
const workflowEditDialog = ref(false)

// 复用工作流弹窗
const forkWorkflowDialog = ref(false)

// 工作流ID
const workflowId = ref<string>()

// 分享时间
const dateText = ref(props.media && props.media?.date ? formatDateDifference(props.media.date) : '')

// 复用工作流
function showForkWorkflow() {
  forkWorkflowDialog.value = true
}

// 完成复用工作流
function finishForkWorkflow(wid: string) {
  workflowId.value = wid
  forkWorkflowDialog.value = false
  workflowEditDialog.value = true
}

// 删除工作流分享时处理
function doDelete() {
  forkWorkflowDialog.value = false
  // 通知父组件刷新
  emit('delete')
}
</script>

<template>
  <div class="h-full">
    <VHover>
      <template #default="hover">
        <div
          class="w-full h-full rounded-lg overflow-hidden"
          :class="{
            'transition transform-cpu duration-300 -translate-y-1': hover.isHovering,
          }"
        >
          <VCard
            v-bind="hover.props"
            :key="props.media?.id"
            class="flex flex-col h-full"
            rounded="0"
            min-height="150"
            @click="showForkWorkflow"
          >
            <div class="h-full flex flex-col">
              <VCardText class="flex items-center pa-3 pb-1 grow">
                <div class="flex flex-col justify-center">
                  <div class="mr-2 min-w-0 text-lg font-bold line-clamp-2 overflow-hidden text-ellipsis ...">
                    {{ props.media?.share_title }}
                  </div>
                  <div class="text-sm font-medium text-gray-600 sm:pt-1 line-clamp-3 overflow-hidden text-ellipsis ...">
                    {{ props.media?.share_comment }}
                  </div>
                </div>
              </VCardText>
              <VCardText class="flex justify-space-between align-center flex-wrap py-2">
                <div class="flex align-center">
                  <IconBtn v-bind="props" icon="mdi-account" class="me-1" />
                  <div class="text-subtitle-2 me-4">
                    {{ props.media?.share_user }}
                  </div>
                  <IconBtn v-if="props.media?.count" icon="mdi-fire" class="me-1" />
                  <span v-if="props.media?.count" class="text-subtitle-2 me-4">
                    {{ props.media?.count.toLocaleString() }}
                  </span>
                </div>
              </VCardText>
              <VCardText class="absolute right-0 bottom-0 d-flex align-center p-2 text-gray-500">
                <VIcon icon="mdi-calendar" class="me-1" />
                {{ dateText }}
              </VCardText>
            </div>
          </VCard>
        </div>
      </template>
    </VHover>
    <!-- 工作流编辑弹窗 -->
    <WorkflowEditDialog
      v-if="workflowEditDialog"
      v-model="workflowEditDialog"
      :workflow="workflowId ? { id: workflowId } : undefined"
      @close="workflowEditDialog = false"
      @save="workflowEditDialog = false"
      @remove="workflowEditDialog = false"
    />
    <!-- 复用工作流弹窗 -->
    <ForkWorkflowDialog
      v-if="forkWorkflowDialog"
      :media="props.media"
      @close="forkWorkflowDialog = false"
      @fork="finishForkWorkflow"
      @delete="doDelete"
    />
  </div>
</template>