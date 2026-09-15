<script lang="ts" setup>
import { Workflow } from '@/api/types'
import { useToast } from 'vue-toastification'
import { useConfirm } from '@/composables/useConfirm'
import api from '@/api'
import { useI18n } from 'vue-i18n'
import { openSharedDialog } from '@/composables/useSharedDialog'
import { formatDateDifference } from '@/@core/utils/formatters'
import { getWorkflowGradient } from '@/@core/utils/workflowGradient'

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
    await api.delete(`workflow/${item.id}`)
    $toast.success(t('workflow.task.deleteSuccess'))
    emit('refresh')
  } catch (error) {
    console.error(error)
  }
}

// 开始任务
async function handleEnable(item: Workflow) {
  loading.value = true
  try {
    await api.post(`workflow/${item.id}/start`)
    $toast.success(t('workflow.task.enableSuccess'))
    emit('refresh')
  } catch (error) {
    console.error(error)
  }
  loading.value = false
}

// 停用任务
async function handlePause(item: Workflow) {
  loading.value = true
  try {
    await api.post(`workflow/${item.id}/pause`)
    $toast.success(t('workflow.task.pauseSuccess'))
    emit('refresh')
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
    await api.post(`workflow/${item.id}/run?from_begin=${from_begin}`, {
      from_begin,
    })
    $toast.success(t('workflow.task.runSuccess'))
    emit('refresh')
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
    await api.post(`workflow/${item.id}/reset`)
    $toast.success(t('workflow.task.resetSuccess'))
    emit('refresh')
  } catch (error) {
    console.error(error)
  }
}

type WorkflowStatusColor = 'error' | 'info' | 'primary' | 'secondary' | 'success' | 'warning'

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

// 复用分享卡片的稳定随机渐变，保证同一个工作流在不同卡片位置保持一致的识别色。
const gradientStyle = computed(() => {
  const { startRgb, endRgb, backgroundImage } = getWorkflowGradient(props.workflow.id)

  return {
    '--workflow-card-gradient-start-rgb': startRgb,
    '--workflow-card-gradient-end-rgb': endRgb,
    backgroundImage,
  }
})

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

// 卡片中部展示已完成动作数与总动作数，避免空白区域只剩状态按钮。
const actionCountText = computed(() => {
  return totalActionCount.value > 0
    ? `${finishedActionCount.value}/${totalActionCount.value}`
    : t('workflow.task.info.noActions')
})

// 全局执行进度（%）：优先使用后端下发的整体进度，缺失时按已完成动作数兜底计算
const globalProgressPercent = computed(() => {
  const runtimeProgress = Number(props.workflow.execution_state?.runtime?.progress)
  if (Number.isFinite(runtimeProgress)) {
    return Math.min(Math.max(Math.round(runtimeProgress), 0), 100)
  }

  if (totalActionCount.value <= 0) return 0

  return Math.min(100, Math.round((finishedActionCount.value / totalActionCount.value) * 100))
})

// 已执行次数：大于 0 时追加在执行状态行后展示
const runCountText = computed(() => {
  const count = props.workflow.run_count || 0
  return count > 0 ? ` · ${t('workflow.task.info.runCount', { count })}` : ''
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

    return null
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
      text: `${t('workflow.task.info.lastExecuted', { time: formatDateDifference(props.workflow.last_time) })}${runCountText.value}`,
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
          :style="gradientStyle"
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
              <VChip
                class="workflow-task-card__status-chip"
                :color="statusVariant.color"
                :prepend-icon="statusVariant.icon"
                size="small"
                variant="tonal"
              >
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
                <VIcon icon="mdi-vector-polyline" size="small" />
                <div class="workflow-task-card__metric-copy">
                  <span class="workflow-task-card__metric-label">{{ t('workflow.task.info.actionCount') }}</span>
                  <strong class="workflow-task-card__metric-value">{{ actionCountText }}</strong>
                </div>
              </div>
              <div class="workflow-task-card__metric">
                <VIcon icon="mdi-progress-check" size="small" />
                <div class="workflow-task-card__metric-copy">
                  <span class="workflow-task-card__metric-label">{{ t('workflow.task.info.progress') }}</span>
                  <strong class="workflow-task-card__metric-value">{{ globalProgressPercent }}%</strong>
                </div>
              </div>
            </div>

            <div
              v-if="executionStatus"
              class="workflow-task-card__execution-status"
              :class="executionStatus.color ? `text-${executionStatus.color}` : 'text-medium-emphasis'"
              :title="executionStatus.text"
            >
              <VIcon :icon="executionStatus.icon" size="small" />
              <span>{{ executionStatus.text }}</span>
            </div>
          </VCardText>

          <footer
            class="workflow-task-card__progress"
            role="progressbar"
            :aria-label="workflow.name"
            aria-valuemin="0"
            aria-valuemax="100"
            :aria-valuenow="globalProgressPercent"
          >
            <span class="workflow-task-card__progress-fill" :style="{ inlineSize: `${globalProgressPercent}%` }" />
          </footer>
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
  --workflow-progress-rgb: var(--v-theme-primary);
  --workflow-card-gradient-start-rgb: 74, 85, 104;
  --workflow-card-gradient-end-rgb: 45, 55, 72;
  --workflow-card-header-content-rgb: 255, 255, 255;
  --workflow-card-header-background:
    linear-gradient(145deg, rgba(255, 255, 255, 0.12), transparent 38%),
    linear-gradient(
      135deg,
      rgb(var(--workflow-card-gradient-start-rgb)) 0%,
      rgb(var(--workflow-card-gradient-end-rgb)) 100%
    );
  --workflow-card-header-shadow: none;
  /* 标题栏渐变覆盖整张卡片，避免主体的默认 surface 切出第二层底色。 */
  --workflow-card-background: var(--workflow-card-header-background);
  /* Glass V3 的全局卡片规则通过该 token 绘制背景，这里保留工作流自身的整卡材质。 */
  --glass-v3-card-background: var(--workflow-card-background);

  display: flex;
  min-block-size: 176px;
  flex-direction: column;
  overflow: hidden;
  background: var(--workflow-card-background) !important;
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
  padding: 9px 16px 8px !important;
  background: transparent;
  box-shadow: none;
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
  padding: 14px 16px 14px !important;
  background: transparent;
  color: rgba(var(--workflow-card-header-content-rgb), 0.88);
}

.workflow-task-card__status-row {
  display: flex;
  min-inline-size: 0;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.workflow-task-card__status-chip {
  color: rgb(var(--workflow-card-header-content-rgb)) !important;
}

.workflow-task-card__status-chip :deep(.v-chip__underlay) {
  background-color: rgb(var(--workflow-status-rgb)) !important;
  opacity: 0.24;
}

.workflow-task-card__metrics {
  display: grid;
  min-inline-size: 0;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
  padding-block: 4px;
}

.workflow-task-card__metric {
  display: flex;
  min-inline-size: 0;
  align-items: center;
  gap: 7px;
}

.workflow-task-card__metric + .workflow-task-card__metric {
  padding-inline-start: 0;
}

.workflow-task-card__metric > .v-icon {
  flex: 0 0 auto;
  color: rgb(var(--workflow-progress-rgb));
}

.workflow-task-card__metric-copy {
  display: flex;
  min-inline-size: 0;
  flex-direction: column;
  gap: 1px;
}

.workflow-task-card__metric-label {
  overflow: hidden;
  color: rgba(var(--workflow-card-header-content-rgb), 0.65);
  font-size: 0.68rem;
  line-height: 14px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workflow-task-card__metric-value {
  overflow: hidden;
  color: rgb(var(--workflow-card-header-content-rgb));
  font-size: 0.86rem;
  font-weight: 600;
  line-height: 18px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workflow-task-card__progress {
  flex: 0 0 auto;
  block-size: 3px;
  inline-size: 100%;
  overflow: hidden;
  background: rgba(var(--workflow-progress-rgb), 0.18);
}

.workflow-task-card__progress-fill {
  display: block;
  block-size: 100%;
  border-radius: var(--app-control-radius);
  background: rgb(var(--workflow-progress-rgb));
  transition: inline-size 0.3s ease;
}

.workflow-task-card__execution-status {
  display: flex;
  min-inline-size: 0;
  align-items: center;
  gap: 7px;
  margin-block-start: auto;
}

.workflow-task-card__execution-status.text-medium-emphasis {
  color: rgba(var(--workflow-card-header-content-rgb), 0.78) !important;
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
    min-block-size: 170px;
  }

  .workflow-task-card__header,
  .workflow-task-card__body {
    padding-inline: 14px !important;
  }

  .workflow-task-card__body {
    gap: 8px;
    padding-inline: 14px !important;
  }
}
</style>
