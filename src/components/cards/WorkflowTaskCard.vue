<script lang="ts" setup>
import { Workflow } from '@/api/types'
import { useToast } from 'vue-toastification'
import { useConfirm } from '@/composables/useConfirm'
import api from '@/api'
import { useI18n } from 'vue-i18n'
import { openSharedDialog } from '@/composables/useSharedDialog'

const WorkflowActionsDialog = defineAsyncComponent(() => import('@/components/dialog/WorkflowActionsDialog.vue'))
const WorkflowAddEditDialog = defineAsyncComponent(() => import('@/components/dialog/WorkflowAddEditDialog.vue'))
const WorkflowShareDialog = defineAsyncComponent(() => import('@/components/dialog/WorkflowShareDialog.vue'))

const { t } = useI18n()

// 定义输入参数
const props = defineProps({
  workflow: {
    required: true,
    type: Object as PropType<Workflow>,
  },
  eventTypes: {
    type: Array as PropType<Array<{ title: string; value: string }>>,
    default: () => [],
  },
})

// 定义事件
const emit = defineEmits(['refresh'])

// 提示框
const $toast = useToast()

// 确认框
const createConfirm = useConfirm()

// 加载中
const loading = ref(false)

// 根据事件类型值获取显示文本
const getEventTypeText = (eventTypeValue: string) => {
  const eventType = props.eventTypes.find(item => item.value === eventTypeValue)
  return eventType ? eventType.title : eventTypeValue
}

// 编辑任务
function handleEdit(item: Workflow) {
  openSharedDialog(
    WorkflowAddEditDialog,
    { workflow: item },
    {
      save: editDone,
    },
    { closeOn: ['close', 'save'] },
  )
}

// 编辑流程
function handleFlow(item: Workflow) {
  openSharedDialog(
    WorkflowActionsDialog,
    { workflow: item },
    {
      save: editDone,
    },
    { closeOn: ['close', 'save'] },
  )
}

// 分享工作流
function handleShare(item: Workflow) {
  openSharedDialog(WorkflowShareDialog, { workflow: item }, {}, { closeOn: ['close'] })
}

// 编辑完成
function editDone() {
  emit('refresh')
}

// 删除任务
async function handleDelete(item: Workflow) {
  const isConfirmed = await createConfirm({
    title: t('common.confirm'),
    content: t('workflow.task.confirmDelete', { name: item.name }),
  })

  if (!isConfirmed) return

  try {
    const result: { [key: string]: string } = await api.delete(`workflow/${item.id}`)
    if (result.success) {
      $toast.success(t('workflow.task.deleteSuccess'))
      emit('refresh')
    } else {
      $toast.error(t('workflow.task.deleteFailed', { message: result.message }))
    }
  } catch (error) {
    console.error(error)
  }
}

// 开始任务
async function handleEnable(item: Workflow) {
  loading.value = true
  try {
    const result: { [key: string]: string } = await api.post(`workflow/${item.id}/start`)
    if (result.success) {
      $toast.success(t('workflow.task.enableSuccess'))
      emit('refresh')
    } else {
      $toast.error(t('workflow.task.enableFailed', { message: result.message }))
    }
  } catch (error) {
    console.error(error)
  }
  loading.value = false
}

// 停用任务
async function handlePause(item: Workflow) {
  loading.value = true
  try {
    const result: { [key: string]: string } = await api.post(`workflow/${item.id}/pause`)
    if (result.success) {
      $toast.success(t('workflow.task.pauseSuccess'))
      emit('refresh')
    } else {
      $toast.error(t('workflow.task.pauseFailed', { message: result.message }))
    }
  } catch (error) {
    console.error(error)
  }
  loading.value = false
}

// 立即执行任务
async function handleRun(item: Workflow, from_begin: boolean) {
  loading.value = true
  try {
    setTimeout(() => {
      emit('refresh')
    }, 500)
    const result: { [key: string]: string } = await api.post(`workflow/${item.id}/run?from_begin=${from_begin}`, {
      from_begin,
    })
    if (result.success) {
      $toast.success(t('workflow.task.runSuccess'))
      emit('refresh')
    } else {
      $toast.error(t('workflow.task.runFailed', { message: result.message }))
      emit('refresh')
    }
  } catch (error) {
    console.error(error)
  }
  loading.value = false
}

// 重置任务
async function handleReset(item: Workflow) {
  const isConfirmed = await createConfirm({
    title: t('common.confirm'),
    content: t('workflow.task.confirmReset', { name: item.name }),
  })

  if (!isConfirmed) return

  try {
    const result: { [key: string]: string } = await api.post(`workflow/${item.id}/reset`)
    if (result.success) {
      $toast.success(t('workflow.task.resetSuccess'))
      emit('refresh')
    } else {
      $toast.error(t('workflow.task.resetFailed', { message: result.message }))
    }
  } catch (error) {
    console.error(error)
  }
}

// 计算状态颜色
const resolveStatusVariant = (status: string | undefined) => {
  if (status === 'S')
    return {
      color: 'success',
      bgColor: 'linear-gradient(to bottom right, rgba(76, 175, 80, 0.9), rgba(76, 175, 80, 0.7))',
      text: t('workflow.task.status.success'),
    }
  else if (status === 'R')
    return {
      color: 'primary',
      bgColor: 'linear-gradient(to bottom right, rgba(33, 150, 243, 0.9), rgba(33, 150, 243, 0.7))',
      text: t('workflow.task.status.running'),
    }
  else if (status === 'F')
    return {
      color: 'error',
      bgColor: 'linear-gradient(to bottom right, rgba(244, 67, 54, 0.9), rgba(244, 67, 54, 0.7))',
      text: t('workflow.task.status.failed'),
    }
  else if (status === 'P')
    return {
      color: 'warning',
      bgColor: 'linear-gradient(to bottom right, rgba(255, 152, 0, 0.9), rgba(255, 152, 0, 0.7))',
      text: t('workflow.task.status.paused'),
    }
  else
    return {
      color: 'info',
      bgColor: 'linear-gradient(to bottom right, rgba(33, 150, 243, 0.9), rgba(33, 150, 243, 0.7))',
      text: t('workflow.task.status.waiting'),
    }
}

// 计算当前动作占比
const resolveProgress = (item: Workflow) => {
  const current_action_length = item.current_action?.split(',').length || 0
  return item.actions?.length ? Math.round((current_action_length / (item.actions.length || 1)) * 100) : 0
}
</script>
<template>
  <div class="h-full">
    <VHover v-slot="hover">
      <!-- Hover 命中区域保持静止，避免卡片上浮后底边反复触发 mouseleave。 -->
      <div v-bind="hover.props" class="workflow-task-card-hover-area h-full">
        <VCard
          class="app-hover-lift-card mx-auto h-full"
          @click="handleFlow(workflow)"
          :ripple="false"
          :loading="loading"
          :class="{ 'app-hover-lift-card--hovering': hover.isHovering }"
        >
        <VCardItem
          class="px-2 py-2"
          :style="{
            background: resolveStatusVariant(workflow?.state).bgColor,
          }"
        >
          <template #prepend>
            <VAvatar variant="text" size="small">
              <VIcon
                v-if="workflow?.state === 'P'"
                color="success"
                icon="mdi-play"
                @click.stop="handleEnable(workflow)"
              />
              <VIcon v-else color="warning" icon="mdi-pause" @click.stop="handlePause(workflow)" />
            </VAvatar>
          </template>
          <VCardTitle class="text-white text-lg">
            <span :title="workflow?.description">{{ workflow?.name }}</span>
          </VCardTitle>
          <template #append>
            <IconBtn>
              <VIcon icon="mdi-dots-vertical" />
              <VMenu activator="parent" close-on-content-click>
                <VList>
                  <VListItem base-color="primary" @click="handleEdit(workflow)">
                    <template #prepend>
                      <VIcon icon="mdi-note-edit" />
                    </template>
                    <VListItemTitle>{{ t('workflow.task.edit') }}</VListItemTitle>
                  </VListItem>
                  <VListItem base-color="success" @click="handleFlow(workflow)">
                    <template #prepend>
                      <VIcon icon="mdi-vector-polyline" />
                    </template>
                    <VListItemTitle>{{ t('workflow.task.editFlow') }}</VListItemTitle>
                  </VListItem>
                  <VListItem v-if="workflow.current_action" base-color="info" @click="handleRun(workflow, false)">
                    <template #prepend>
                      <VIcon icon="mdi-play-speed" />
                    </template>
                    <VListItemTitle>{{ t('workflow.task.continue') }}</VListItemTitle>
                  </VListItem>
                  <VListItem v-if="workflow.current_action" base-color="info" @click="handleRun(workflow, true)">
                    <template #prepend>
                      <VIcon icon="mdi-replay" />
                    </template>
                    <VListItemTitle>{{ t('workflow.task.restart') }}</VListItemTitle>
                  </VListItem>
                  <VListItem v-else base-color="info" @click="handleRun(workflow, true)">
                    <template #prepend>
                      <VIcon icon="mdi-run" />
                    </template>
                    <VListItemTitle>{{ t('workflow.task.run') }}</VListItemTitle>
                  </VListItem>
                  <VListItem base-color="warning" @click="handleReset(workflow)">
                    <template #prepend>
                      <VIcon icon="mdi-restore-alert" />
                    </template>
                    <VListItemTitle>{{ t('workflow.task.reset') }}</VListItemTitle>
                  </VListItem>
                  <VListItem base-color="info" @click="handleShare(workflow)">
                    <template #prepend>
                      <VIcon icon="mdi-share" />
                    </template>
                    <VListItemTitle>{{ t('workflow.task.share') }}</VListItemTitle>
                  </VListItem>
                  <VListItem base-color="error" @click="handleDelete(workflow)">
                    <template #prepend>
                      <VIcon icon="mdi-delete" />
                    </template>
                    <VListItemTitle>{{ t('workflow.task.delete') }}</VListItemTitle>
                  </VListItem>
                </VList>
              </VMenu>
            </IconBtn>
          </template>
        </VCardItem>
        <VDivider />
        <VCardText class="pa-3">
          <div class="d-flex flex-column gap-y-3">
            <div class="d-flex flex-wrap gap-x-3">
              <div class="flex-1">
                <div class="mb-1">{{ t('workflow.task.info.trigger') }}</div>
                <h5>
                  <span v-if="workflow?.trigger_type === 'timer' || !workflow?.trigger_type">
                    <VIcon icon="mdi-clock-outline" size="small" class="me-1" />
                    {{ workflow?.timer }}
                  </span>
                  <span v-else-if="workflow?.trigger_type === 'event'">
                    <VIcon icon="mdi-calendar-check" size="small" class="me-1" />
                    {{ getEventTypeText(workflow?.event_type || '') }}
                  </span>
                  <span v-else-if="workflow?.trigger_type === 'manual'">
                    <VIcon icon="mdi-hand-pointing-up" size="small" class="me-1" />
                    {{ t('workflow.task.info.manualTrigger') }}
                  </span>
                </h5>
              </div>
              <div class="flex-1">
                <div class="mb-1">{{ t('workflow.task.info.status') }}</div>
                <h5 :class="`text-${resolveStatusVariant(workflow?.state).color}`">
                  {{ resolveStatusVariant(workflow?.state).text }}
                </h5>
              </div>
            </div>
            <div class="d-flex flex-wrap gap-x-3">
              <div class="flex-1">
                <div class="mb-1">{{ t('workflow.task.info.actionCount') }}</div>
                <div>
                  <VAvatar size="24" color="primary" variant="tonal">
                    <span class="text-xs">{{ workflow?.actions?.length }}</span>
                  </VAvatar>
                </div>
              </div>
              <div class="flex-1">
                <div class="mb-1">{{ t('workflow.task.info.runCount') }}</div>
                <h5>{{ workflow?.run_count }}</h5>
              </div>
            </div>
            <div class="d-flex flex-wrap gap-x-3">
              <div class="flex-1">
                <div class="mb-1">{{ t('workflow.task.info.progress') }}</div>
                <div class="d-flex align-center gap-5">
                  <div class="flex-grow-1">
                    <VProgressLinear color="info" rounded :model-value="resolveProgress(workflow)" />
                  </div>
                  <span> {{ resolveProgress(workflow) }}% </span>
                </div>
              </div>
            </div>
            <div class="d-flex flex-wrap gap-x-3" v-if="workflow?.result">
              <div class="flex-1">
                <div class="mb-1">{{ t('workflow.task.info.error') }}</div>
                <div class="text-error">{{ workflow?.result }}</div>
              </div>
            </div>
          </div>
        </VCardText>
        </VCard>
      </div>
    </VHover>
  </div>
</template>

<style scoped>
.workflow-task-card-hover-area {
  inline-size: 100%;
}
</style>
