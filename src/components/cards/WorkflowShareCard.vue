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

const gradientPalettes = [
  ['74, 85, 104', '45, 55, 72'],
  ['85, 60, 154', '183, 148, 244'],
  ['44, 90, 160', '26, 54, 93'],
  ['47, 133, 90', '34, 84, 61'],
  ['197, 48, 48', '116, 42, 42'],
  ['214, 158, 46', '151, 90, 22'],
  ['128, 90, 213', '85, 60, 154'],
  ['49, 130, 206', '44, 82, 130'],
  ['56, 161, 105', '39, 103, 73'],
  ['229, 62, 62', '197, 48, 48'],
  ['221, 107, 32', '192, 86, 33'],
  ['107, 70, 193', '85, 60, 154'],
  ['43, 108, 176', '44, 82, 130'],
  ['56, 161, 105', '47, 133, 90'],
  ['213, 63, 140', '151, 38, 109'],
] as const

// 暴露渐变色通道，让材质主题能够保留色相并单独控制透光率。
const gradientStyle = computed(() => {
  const seed = String(props.workflow?.id || Math.random())
  const hash = seed.split('').reduce((a, b) => {
    a = (a << 5) - a + b.charCodeAt(0)
    return a & a
  }, 0)
  const [startRgb, endRgb] = gradientPalettes[Math.abs(hash) % gradientPalettes.length]

  return {
    '--workflow-share-gradient-start-rgb': startRgb,
    '--workflow-share-gradient-end-rgb': endRgb,
    backgroundImage: `linear-gradient(135deg, rgb(${startRgb}) 0%, rgb(${endRgb}) 100%)`,
  }
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
            :style="gradientStyle"
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
