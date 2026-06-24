<script lang="ts" setup>
import { formatDateDifference } from '@/@core/utils/formatters'
import type { WorkflowShare } from '@/api/types'
import { openSharedDialog } from '@/composables/useSharedDialog'

const ForkWorkflowDialog = defineAsyncComponent(() => import('../dialog/ForkWorkflowDialog.vue'))

// 输入参数
const props = defineProps({
  workflow: Object as PropType<WorkflowShare>,
  eventTypes: {
    type: Array as PropType<Array<{ title: string; value: string }>>,
    default: () => [],
  },
})

// 定义删除事件
const emit = defineEmits(['delete', 'update'])

// 工作流ID
const workflowId = ref<string>()

// 分享时间
const dateText = ref(props.workflow && props.workflow?.date ? formatDateDifference(props.workflow.date) : '')

// 随机渐变背景
const gradientStyle = ref('')

// 生成随机渐变背景
function generateRandomGradient() {
  const gradients = [
    'linear-gradient(135deg, #4a5568 0%, #2d3748 100%)',
    'linear-gradient(135deg, #553c9a 0%, #b794f4 100%)',
    'linear-gradient(135deg, #2c5aa0 0%, #1a365d 100%)',
    'linear-gradient(135deg, #2f855a 0%, #22543d 100%)',
    'linear-gradient(135deg, #c53030 0%, #742a2a 100%)',
    'linear-gradient(135deg, #d69e2e 0%, #975a16 100%)',
    'linear-gradient(135deg, #805ad5 0%, #553c9a 100%)',
    'linear-gradient(135deg, #3182ce 0%, #2c5282 100%)',
    'linear-gradient(135deg, #38a169 0%, #276749 100%)',
    'linear-gradient(135deg, #e53e3e 0%, #c53030 100%)',
    'linear-gradient(135deg, #dd6b20 0%, #c05621 100%)',
    'linear-gradient(135deg, #6b46c1 0%, #553c9a 100%)',
    'linear-gradient(135deg, #2b6cb0 0%, #2c5282 100%)',
    'linear-gradient(135deg, #38a169 0%, #2f855a 100%)',
    'linear-gradient(135deg, #d53f8c 0%, #97266d 100%)',
  ]

  // 基于工作流ID生成固定的随机数，确保同一工作流总是显示相同的渐变
  const seed = String(props.workflow?.id || Math.random())
  const hash = seed.split('').reduce((a, b) => {
    a = (a << 5) - a + b.charCodeAt(0)
    return a & a
  }, 0)

  const index = Math.abs(hash) % gradients.length
  return gradients[index]
}

// 初始化渐变背景
onMounted(() => {
  gradientStyle.value = generateRandomGradient()
})

// 复用工作流
function showForkWorkflow() {
  openSharedDialog(
    ForkWorkflowDialog,
    {
      workflow: props.workflow,
      eventTypes: props.eventTypes,
    },
    {
      fork: finishForkWorkflow,
      delete: doDelete,
    },
    { closeOn: ['close', 'fork', 'delete'] },
  )
}

// 完成复用工作流
function finishForkWorkflow(wid: string) {
  workflowId.value = wid
  emit('update')
}

// 删除工作流分享时处理
function doDelete() {
  // 通知父组件刷新
  emit('delete')
}
</script>

<template>
  <div class="h-full">
    <VHover>
      <template #default="hover">
        <!-- Hover 命中区域保持静止，避免卡片上浮后底边反复触发 mouseleave。 -->
        <div v-bind="hover.props" class="workflow-share-card-hover-area h-full">
          <VCard
            :key="props.workflow?.id"
            class="workflow-share-card app-hover-lift-card flex flex-col h-full cursor-pointer overflow-hidden"
            :class="{
              'app-hover-lift-card--hovering': hover.isHovering,
            }"
            min-height="150"
            :style="{ background: gradientStyle }"
            @click="showForkWorkflow"
          >
          <div class="h-full flex flex-col">
            <VCardText class="flex items-center pa-3 pb-1 grow">
              <div class="flex flex-col justify-center w-full">
                <VCardTitle class="text-lg text-bold text-white line-clamp-2 break-words">
                  {{ props.workflow?.share_title }}
                </VCardTitle>
                <div class="px-4 text-white text-opacity-90 overflow-hidden line-clamp-3 break-all ...">
                  {{ props.workflow?.share_comment }}
                </div>
              </div>
            </VCardText>
            <VCardText class="flex justify-space-between align-center flex-wrap py-2">
              <div class="flex align-center">
                <IconBtn v-bind="props" icon="mdi-account" class="me-1 text-white" />
                <div class="text-subtitle-2 me-4 text-white text-opacity-90">
                  {{ props.workflow?.share_user }}
                </div>
                <IconBtn v-if="props.workflow?.count" icon="mdi-fire" class="me-1 text-white" />
                <span v-if="props.workflow?.count" class="text-subtitle-2 me-4 text-white text-opacity-90">
                  {{ props.workflow?.count.toLocaleString() }}
                </span>
              </div>
            </VCardText>
            <VCardText class="absolute right-0 bottom-0 d-flex align-center p-2 text-white text-sm text-opacity-75">
              <VIcon icon="mdi-calendar" size="small" class="me-1" />
              {{ dateText }}
            </VCardText>
          </div>
          </VCard>
        </div>
      </template>
    </VHover>
  </div>
</template>

<style lang="scss" scoped>
.workflow-share-card-hover-area {
  inline-size: 100%;
}

</style>
