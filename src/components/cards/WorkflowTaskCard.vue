<script lang="ts" setup>
import { Workflow } from '@/api/types'
import { useToast } from 'vue-toastification'
import { useConfirm } from '@/composables/useConfirm'
import api from '@/api'
import { useI18n } from 'vue-i18n'
import { openSharedDialog } from '@/composables/useSharedDialog'
import { formatDateDifference } from '@/@core/utils/formatters'

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

type WorkflowStatusColor = 'error' | 'info' | 'primary' | 'secondary' | 'success' | 'warning'
type WorkflowActionSegmentState = 'active' | 'complete' | 'failed' | 'pending'

interface WorkflowActionDisplay {
  id?: string
  name?: string
  type?: string
}

interface WorkflowExecutionNode {
  state?: string
}

const resolveStatusVariant = (status: string | undefined) => {
  const variants: Record<
    string,
    {
      color: WorkflowStatusColor
      icon: string
      text: string
    }
  > = {
    S: { color: 'success', icon: 'mdi-check-circle-outline', text: t('workflow.task.status.success') },
    R: { color: 'primary', icon: 'mdi-progress-clock', text: t('workflow.task.status.running') },
    F: { color: 'error', icon: 'mdi-alert-circle-outline', text: t('workflow.task.status.failed') },
    P: { color: 'secondary', icon: 'mdi-pause-circle-outline', text: t('workflow.task.status.paused') },
    W: { color: 'warning', icon: 'mdi-clock-outline', text: t('workflow.task.status.waiting') },
  }

  return variants[status || 'W'] || variants.W
}

const statusVariant = computed(() => resolveStatusVariant(props.workflow.state))

const triggerDisplay = computed(() => {
  if (props.workflow.trigger_type === 'event') {
    return {
      icon: 'mdi-calendar-check-outline',
      text: getEventTypeText(props.workflow.event_type || ''),
    }
  }

  if (props.workflow.trigger_type === 'manual') {
    return {
      icon: 'mdi-hand-pointing-up',
      text: t('workflow.task.info.manualTrigger'),
    }
  }

  return {
    icon: 'mdi-clock-outline',
    text: props.workflow.timer || t('workflow.task.info.timer'),
  }
})

const workflowActions = computed<WorkflowActionDisplay[]>(() =>
  Array.isArray(props.workflow.actions) ? props.workflow.actions : [],
)

const totalActionCount = computed(() => workflowActions.value.length)

const currentActionIds = computed(() => {
  return new Set(
    (props.workflow.current_action || '')
      .split(',')
      .map(actionId => actionId.trim())
      .filter(Boolean),
  )
})

const executionNodes = computed<Record<string, WorkflowExecutionNode>>(() => {
  const nodes = props.workflow.execution_state?.nodes
  return nodes && typeof nodes === 'object' && !Array.isArray(nodes)
    ? (nodes as Record<string, WorkflowExecutionNode>)
    : {}
})

const finishedActionCount = computed(() => {
  const runtimeCount = Number(props.workflow.execution_state?.runtime?.finished_actions)
  const knownActionIds = new Set(workflowActions.value.map(action => String(action.id || '')).filter(Boolean))
  const fallbackCount = [...currentActionIds.value].filter(actionId => knownActionIds.has(actionId)).length
  const count = Number.isFinite(runtimeCount) && runtimeCount >= 0 ? Math.trunc(runtimeCount) : fallbackCount

  return Math.min(Math.max(count, 0), totalActionCount.value)
})

const actionSegments = computed<WorkflowActionSegmentState[]>(() => {
  return workflowActions.value.map((action, index) => {
    const actionId = action.id ? String(action.id) : ''
    const nodeState = actionId ? executionNodes.value[actionId]?.state : undefined

    if (nodeState === 'failed') return 'failed'
    if (nodeState === 'running' || nodeState === 'queued') return 'active'
    if (nodeState === 'success' || nodeState === 'completed' || nodeState === 'skipped') return 'complete'
    if (actionId && currentActionIds.value.has(actionId)) return 'complete'
    if (index < finishedActionCount.value) return 'complete'
    if (props.workflow.state === 'R' && index === finishedActionCount.value) return 'active'

    return 'pending'
  })
})

const runningActionName = computed(() => {
  const runningAction = workflowActions.value.find(action => {
    if (!action.id) return false
    const nodeState = executionNodes.value[String(action.id)]?.state
    return nodeState === 'running' || nodeState === 'queued'
  })

  return runningAction?.name || runningAction?.type || ''
})

const executionStatus = computed(() => {
  if (props.workflow.state === 'R') {
    if (runningActionName.value) {
      return {
        color: 'primary' as WorkflowStatusColor,
        icon: 'mdi-pulse',
        text: t('workflow.task.info.executingAction', { name: runningActionName.value }),
      }
    }

    if (totalActionCount.value > 0) {
      return {
        color: 'primary' as WorkflowStatusColor,
        icon: 'mdi-pulse',
        text: t('workflow.task.info.preparingAction', {
          current: Math.min(finishedActionCount.value + 1, totalActionCount.value),
        }),
      }
    }

    return {
      color: 'secondary' as WorkflowStatusColor,
      icon: 'mdi-vector-polyline-remove',
      text: t('workflow.task.info.noActions'),
    }
  }

  if (props.workflow.state === 'F') {
    return {
      color: 'error' as WorkflowStatusColor,
      icon: 'mdi-alert-circle-outline',
      text: props.workflow.result || t('workflow.task.status.failed'),
    }
  }

  if (props.workflow.last_time) {
    return {
      color: undefined,
      icon: 'mdi-history',
      text: t('workflow.task.info.lastExecuted', { time: formatDateDifference(props.workflow.last_time) }),
    }
  }

  if (finishedActionCount.value > 0) {
    return {
      color: undefined,
      icon: 'mdi-history',
      text: t('workflow.task.info.executionIncomplete'),
    }
  }

  return {
    color: undefined,
    icon: 'mdi-history',
    text: t('workflow.task.info.neverExecuted'),
  }
})
</script>
<template>
  <div class="h-full">
    <VHover v-slot="hover">
      <!-- Hover 命中区域保持静止，避免卡片上浮后底边反复触发 mouseleave。 -->
      <div v-bind="hover.props" class="workflow-task-card-hover-area h-full">
        <VCard
          class="workflow-task-card app-hover-lift-card mx-auto h-full"
          @click="handleFlow(workflow)"
          :ripple="false"
          :loading="loading"
          :class="[
            `workflow-task-card--status-${statusVariant.color}`,
            { 'app-hover-lift-card--hovering': hover.isHovering },
          ]"
        >
          <VCardItem class="workflow-task-card__header">
            <template #prepend>
              <VAvatar
                :color="statusVariant.color"
                variant="tonal"
                rounded="md"
                size="32"
                class="workflow-task-card__trigger-icon"
              >
                <VIcon :icon="triggerDisplay.icon" :data-workflow-trigger-icon="triggerDisplay.icon" />
              </VAvatar>
            </template>

            <VCardTitle class="workflow-task-card__title text-body-1" :title="workflow.description || workflow.name">
              {{ workflow.name }}
            </VCardTitle>
            <VCardSubtitle class="workflow-task-card__trigger-text">
              {{ triggerDisplay.text }}
            </VCardSubtitle>

            <template #append>
              <IconBtn
                class="workflow-task-card__menu"
                size="small"
                density="compact"
                :aria-label="t('workflow.task.moreActions')"
                @click.stop
              >
                <VIcon icon="mdi-dots-vertical" />
                <VTooltip activator="parent" location="top">{{ t('workflow.task.moreActions') }}</VTooltip>
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

          <VCardText class="workflow-task-card__body">
            <div class="workflow-task-card__status-row">
              <VChip :color="statusVariant.color" :prepend-icon="statusVariant.icon" size="small" variant="tonal">
                {{ statusVariant.text }}
              </VChip>

              <VBtn
                v-if="workflow.state === 'P'"
                color="success"
                variant="text"
                size="small"
                density="compact"
                prepend-icon="mdi-play"
                :aria-label="t('common.enable')"
                @click.stop="handleEnable(workflow)"
              >
                {{ t('common.enable') }}
              </VBtn>
              <VBtn
                v-else
                :color="statusVariant.color"
                variant="text"
                size="small"
                density="compact"
                prepend-icon="mdi-pause"
                :aria-label="t('common.pause')"
                @click.stop="handlePause(workflow)"
              >
                {{ t('common.pause') }}
              </VBtn>
            </div>

            <div class="workflow-task-card__metrics">
              <div class="workflow-task-card__metric">
                <span>{{ t('workflow.task.info.actionCount') }}</span>
                <strong>{{ totalActionCount }}</strong>
              </div>
              <div class="workflow-task-card__metric">
                <span>{{ t('workflow.task.info.runCount') }}</span>
                <strong>{{ workflow.run_count || 0 }}</strong>
              </div>
            </div>

            <div class="workflow-task-card__progress">
              <div class="workflow-task-card__progress-label">
                <span>{{ t('workflow.task.info.actionProgress') }}</span>
                <strong>{{ finishedActionCount }} / {{ totalActionCount }}</strong>
              </div>
              <div
                class="workflow-task-card__action-track"
                role="progressbar"
                :aria-label="`${t('workflow.task.info.actionProgress')}: ${finishedActionCount} / ${totalActionCount}`"
                aria-valuemin="0"
                :aria-valuemax="Math.max(totalActionCount, 1)"
                :aria-valuenow="finishedActionCount"
              >
                <span
                  v-for="(segment, index) in actionSegments"
                  :key="workflowActions[index]?.id || index"
                  class="workflow-task-card__action-segment"
                  :class="`workflow-task-card__action-segment--${segment}`"
                />
                <span
                  v-if="totalActionCount === 0"
                  class="workflow-task-card__action-segment workflow-task-card__action-segment--empty"
                />
              </div>
            </div>

            <div
              class="workflow-task-card__execution-status"
              :class="executionStatus.color ? `text-${executionStatus.color}` : 'text-medium-emphasis'"
              :title="executionStatus.text"
            >
              <VIcon :icon="executionStatus.icon" size="small" />
              <span>{{ executionStatus.text }}</span>
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

.workflow-task-card {
  --workflow-status-rgb: var(--v-theme-info);
  --workflow-status-on-rgb: var(--v-theme-on-info);
  --workflow-card-header-content-rgb: var(--workflow-status-on-rgb);
  --workflow-card-header-background: linear-gradient(
    118deg,
    color-mix(in srgb, rgb(var(--workflow-status-rgb)) 88%, rgb(var(--v-theme-on-surface)) 12%) 0%,
    rgb(var(--workflow-status-rgb)) 52%,
    color-mix(in srgb, rgb(var(--workflow-status-rgb)) 78%, rgb(var(--v-theme-surface)) 22%) 100%
  );
  --workflow-card-header-shadow: none;

  display: flex;
  min-block-size: 226px;
  flex-direction: column;
  overflow: hidden;
}

.workflow-task-card--status-primary {
  --workflow-status-rgb: var(--v-theme-primary);
  --workflow-status-on-rgb: var(--v-theme-on-primary);
}

.workflow-task-card--status-secondary {
  --workflow-status-rgb: var(--v-theme-secondary);
  --workflow-status-on-rgb: var(--v-theme-on-secondary);
}

.workflow-task-card--status-info {
  --workflow-status-rgb: var(--v-theme-info);
  --workflow-status-on-rgb: var(--v-theme-on-info);
}

.workflow-task-card--status-success {
  --workflow-status-rgb: var(--v-theme-success);
  --workflow-status-on-rgb: var(--v-theme-on-success);
}

.workflow-task-card--status-warning {
  --workflow-status-rgb: var(--v-theme-warning);
  --workflow-status-on-rgb: var(--v-theme-on-warning);
}

.workflow-task-card--status-error {
  --workflow-status-rgb: var(--v-theme-error);
  --workflow-status-on-rgb: var(--v-theme-on-error);
}

.workflow-task-card__header {
  flex: 0 0 auto;
  padding: 6px 10px !important;
  background: var(--workflow-card-header-background);
  box-shadow: var(--workflow-card-header-shadow);
}

.workflow-task-card__trigger-icon {
  flex: 0 0 auto;
  color: rgb(var(--workflow-card-header-content-rgb)) !important;
}

.workflow-task-card__title {
  display: -webkit-box;
  min-inline-size: 0;
  overflow: hidden;
  color: rgb(var(--workflow-card-header-content-rgb));
  font-weight: 500;
  line-height: 20px !important;
  letter-spacing: 0;
  overflow-wrap: anywhere;
  white-space: normal;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.workflow-task-card__trigger-text {
  min-inline-size: 0;
  margin-block-start: 1px;
  overflow: hidden;
  color: rgba(var(--workflow-card-header-content-rgb), 0.78);
  font-size: 0.75rem;
  letter-spacing: 0;
  line-height: 16px !important;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workflow-task-card__menu {
  flex: 0 0 auto;
  color: rgb(var(--workflow-card-header-content-rgb)) !important;
}

.workflow-task-card__body {
  display: flex;
  min-inline-size: 0;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 10px;
  padding: 11px 12px !important;
}

.workflow-task-card__status-row {
  display: flex;
  min-inline-size: 0;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.workflow-task-card__metrics {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.workflow-task-card__metric {
  display: grid;
  min-inline-size: 0;
  gap: 1px;
  padding-inline-end: 10px;
}

.workflow-task-card__metric + .workflow-task-card__metric {
  padding-inline: 10px 0;
  border-inline-start: 1px solid rgba(var(--v-theme-on-surface), var(--v-border-opacity));
}

.workflow-task-card__metric span,
.workflow-task-card__progress-label span {
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.workflow-task-card__metric strong,
.workflow-task-card__progress-label strong {
  color: rgba(var(--v-theme-on-surface), var(--v-high-emphasis-opacity));
  font-weight: 500;
  font-variant-numeric: tabular-nums;
}

.workflow-task-card__progress {
  min-inline-size: 0;
}

.workflow-task-card__progress-label {
  display: flex;
  min-inline-size: 0;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
}

.workflow-task-card__action-track {
  display: flex;
  min-inline-size: 0;
  gap: 4px;
  margin-block-start: 6px;
}

.workflow-task-card__action-segment {
  block-size: 6px;
  min-inline-size: 2px;
  flex: 1 1 0;
  border-radius: var(--app-control-radius);
  background: rgba(var(--v-theme-on-surface), 0.12);
}

.workflow-task-card__action-segment--complete {
  background: rgb(var(--workflow-status-rgb));
}

.workflow-task-card__action-segment--active {
  background: rgba(var(--workflow-status-rgb), 0.22);
  box-shadow: inset 0 0 0 1px rgb(var(--workflow-status-rgb));
}

.workflow-task-card__action-segment--failed {
  background: rgb(var(--v-theme-error));
}

.workflow-task-card__action-segment--empty {
  background: rgba(var(--v-theme-on-surface), 0.08);
}

.workflow-task-card__execution-status {
  display: flex;
  min-inline-size: 0;
  align-items: center;
  gap: 7px;
  margin-block-start: auto;
  padding-block-start: 9px;
  border-block-start: 1px solid rgba(var(--v-theme-on-surface), var(--v-border-opacity));
}

.workflow-task-card__execution-status .v-icon {
  flex: 0 0 auto;
}

.workflow-task-card__execution-status span {
  min-inline-size: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (width <= 599.98px) {
  .workflow-task-card {
    min-block-size: 222px;
  }

  .workflow-task-card__header,
  .workflow-task-card__body {
    padding-inline: 10px !important;
  }

  .workflow-task-card__body {
    gap: 9px;
  }
}
</style>
