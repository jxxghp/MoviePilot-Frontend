<script lang="ts" setup>
import { vNativeCardMenu, nativeCardAction, type NativeCardMenuBinding } from '@/native/card'
import { Workflow } from '@/api/types'
import { useToast } from 'vue-toastification'
import { useConfirm } from '@/composables/useConfirm'
import api from '@/api'
import { useI18n } from 'vue-i18n'
import { openSharedDialog } from '@/composables/useSharedDialog'
import { useWorkflowPreviewActionCount } from '@/composables/useWorkflowPreview'
import { formatDateDifference } from '@/@core/utils/formatters'
import {
  getWorkflowActionIcon,
  getWorkflowActionLabel,
  getWorkflowGradient,
  orderWorkflowActions,
  type WorkflowCardActionItem,
} from '@/@core/utils/workflowGradient'

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
    S: { color: 'success', icon: 'mdi-check-circle', text: t('workflow.task.status.success') },
    R: { color: 'primary', icon: 'mdi-progress-clock', text: t('workflow.task.status.running') },
    F: { color: 'error', icon: 'mdi-alert-circle', text: t('workflow.task.status.failed') },
    P: { color: 'secondary', icon: 'mdi-pause-circle', text: t('workflow.task.status.paused') },
    W: { color: 'warning', icon: 'mdi-clock-outline', text: t('workflow.task.status.waiting') },
  }

  return variants[status || 'W'] || variants.W
}

const statusVariant = computed(() => resolveStatusVariant(props.workflow.state))
const isPaused = computed(() => props.workflow.state === 'P')

// 通过稳定色相变量驱动横幅柔光与圆角图标章，前景全程走语义令牌以同时适配浅色与深色主题。
const gradientStyle = computed(() => {
  const { startRgb, endRgb } = getWorkflowGradient(props.workflow.id)

  return {
    '--workflow-card-gradient-start-rgb': startRgb,
    '--workflow-card-gradient-end-rgb': endRgb,
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

const workflowActions = computed<WorkflowCardActionItem[]>(() =>
  Array.isArray(props.workflow.actions) ? props.workflow.actions : [],
)

const orderedActions = computed(() => orderWorkflowActions(workflowActions.value, props.workflow.flows))
const workflowPipelineRef = ref<HTMLElement | null>(null)
const { visibleActionCount } = useWorkflowPreviewActionCount(workflowPipelineRef, () => orderedActions.value.length)
const previewActions = computed(() => orderedActions.value.slice(0, visibleActionCount.value))
const hiddenActionCount = computed(() => Math.max(orderedActions.value.length - previewActions.value.length, 0))

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

function resolveStepNodeState(action: WorkflowCardActionItem): 'active' | 'done' | 'failed' | 'idle' {
  const actionId = action.id == null ? '' : String(action.id)
  if (!actionId) return 'idle'
  const nodeState = executionNodes.value[actionId]?.state
  if (nodeState === 'running' || nodeState === 'queued') return 'active'
  if (nodeState === 'failed' || nodeState === 'error') return 'failed'
  if (nodeState === 'success' || nodeState === 'completed' || currentActionIds.value.has(actionId)) return 'done'
  return 'idle'
}

const finishedActionCount = computed(() => {
  const runtimeCount = Number(props.workflow.execution_state?.runtime?.finished_actions)
  const knownActionIds = new Set(workflowActions.value.map(action => String(action.id || '')).filter(Boolean))
  const fallbackCount = [...currentActionIds.value].filter(actionId => knownActionIds.has(actionId)).length
  const count = Number.isFinite(runtimeCount) && runtimeCount >= 0 ? Math.trunc(runtimeCount) : fallbackCount

  return Math.min(Math.max(count, 0), totalActionCount.value)
})

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
        tone: 'primary' as const,
        icon: 'mdi-pulse',
        text: t('workflow.task.info.executingAction', { name: runningActionName.value }),
      }
    }

    return {
      tone: 'primary' as const,
      icon: 'mdi-progress-clock',
      text: t('workflow.task.status.running'),
    }
  }

  if (props.workflow.state === 'F') {
    return {
      tone: 'error' as const,
      icon: 'mdi-alert-circle-outline',
      text: props.workflow.result || t('workflow.task.status.failed'),
    }
  }

  if (props.workflow.last_time) {
    return {
      tone: 'muted' as const,
      icon: 'mdi-history',
      text: `${t('workflow.task.info.lastExecuted', { time: formatDateDifference(props.workflow.last_time) })}${runCountText.value}`,
    }
  }

  if (finishedActionCount.value > 0) {
    return {
      tone: 'muted' as const,
      icon: 'mdi-history',
      text: t('workflow.task.info.executionIncomplete'),
    }
  }

  return {
    tone: 'muted' as const,
    icon: 'mdi-history',
    text: t('workflow.task.info.neverExecuted'),
  }
})

/** 原工作流状态决定继续、重启或运行；原生选择仍调用现有确认及业务方法。 */
const nativeCardMenu = computed<NativeCardMenuBinding>(() => ({
  key: props.workflow.id,
  title: props.workflow.name,
  items: () => [
    nativeCardAction('edit', {
      title: t('workflow.task.edit'),
      icon: 'mdi-note-edit',
      color: 'primary',
      invoke: () => handleEdit(props.workflow),
    }),
    nativeCardAction('flow', {
      title: t('workflow.task.editFlow'),
      icon: 'mdi-vector-polyline',
      color: 'success',
      invoke: () => handleFlow(props.workflow),
    }),
    nativeCardAction('continue', {
      title: t('workflow.task.continue'),
      icon: 'mdi-play-speed',
      color: 'info',
      visible: Boolean(props.workflow.current_action),
      invoke: () => handleRun(props.workflow, false),
    }),
    nativeCardAction('restart', {
      title: t('workflow.task.restart'),
      icon: 'mdi-replay',
      color: 'info',
      visible: Boolean(props.workflow.current_action),
      invoke: () => handleRun(props.workflow, true),
    }),
    nativeCardAction('run', {
      title: t('workflow.task.run'),
      icon: 'mdi-run',
      color: 'info',
      visible: !props.workflow.current_action,
      invoke: () => handleRun(props.workflow, true),
    }),
    nativeCardAction('reset', {
      title: t('workflow.task.reset'),
      icon: 'mdi-restore-alert',
      color: 'warning',
      invoke: () => handleReset(props.workflow),
    }),
    nativeCardAction('share', {
      title: t('workflow.task.share'),
      icon: 'mdi-share',
      color: 'info',
      invoke: () => handleShare(props.workflow),
    }),
    nativeCardAction('delete', {
      title: t('workflow.task.delete'),
      icon: 'mdi-delete',
      color: 'error',
      invoke: () => handleDelete(props.workflow),
    }),
  ],
}))
</script>

<template>
  <div class="h-full">
    <VHover v-slot="hover">
      <!-- Hover 命中区域保持静止，避免卡片上浮后底边反复触发 mouseleave。 -->
      <div v-bind="hover.props" class="workflow-task-card-hover-area h-full">
        <VCard
          v-native-card-menu="nativeCardMenu"
          class="workflow-task-card app-hover-lift-card mx-auto h-full"
          :style="gradientStyle"
          :ripple="false"
          :loading="loading"
          :class="[
            `workflow-task-card--status-${statusVariant.color}`,
            {
              'workflow-task-card--paused': isPaused,
              'app-hover-lift-card--hovering': hover.isHovering,
            },
          ]"
          @click="handleFlow(workflow)"
        >
          <div class="workflow-task-card__banner">
            <div class="workflow-task-card__header">
              <div class="workflow-task-card__trigger-icon">
                <VIcon :icon="triggerDisplay.icon" :data-workflow-trigger-icon="triggerDisplay.icon" size="20" />
              </div>

              <div class="workflow-task-card__heading">
                <VCardTitle class="workflow-task-card__title" :title="workflow.description || workflow.name">
                  {{ workflow.name }}
                </VCardTitle>
                <div class="workflow-task-card__subline">
                  <VChip
                    class="workflow-task-card__status-chip"
                    :color="statusVariant.color"
                    size="x-small"
                    variant="tonal"
                  >
                    <span class="workflow-task-card__status-dot" aria-hidden="true" />
                    {{ statusVariant.text }}
                  </VChip>
                  <span class="workflow-task-card__trigger-text num" :title="triggerDisplay.text">
                    {{ triggerDisplay.text }}
                  </span>
                </div>
              </div>

              <div class="workflow-task-card__controls">
                <button
                  v-if="isPaused"
                  type="button"
                  class="workflow-task-card__toggle workflow-task-card__toggle--enable"
                  :aria-label="t('common.enable')"
                  :disabled="loading"
                  @click.stop="handleEnable(workflow)"
                >
                  <VIcon icon="mdi-play" size="14" />
                  <span>{{ t('common.enable') }}</span>
                </button>
                <button
                  v-else
                  type="button"
                  class="workflow-task-card__toggle workflow-task-card__toggle--pause"
                  :aria-label="t('common.pause')"
                  :disabled="loading"
                  @click.stop="handlePause(workflow)"
                >
                  <VIcon icon="mdi-pause" size="14" />
                  <span>{{ t('common.pause') }}</span>
                </button>

                <IconBtn
                  data-native-card-menu-trigger
                  class="workflow-task-card__menu"
                  size="small"
                  density="compact"
                  :aria-label="t('workflow.task.moreActions')"
                  @click.stop
                >
                  <VIcon icon="mdi-dots-horizontal" size="18" />
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
              </div>
            </div>

            <div class="workflow-task-card__body">
              <p v-if="workflow.description" class="workflow-task-card__desc" :title="workflow.description">
                {{ workflow.description }}
              </p>

              <div v-if="orderedActions.length > 0" ref="workflowPipelineRef" class="workflow-task-card__pipeline">
                <template v-for="(action, index) in previewActions" :key="action.id || index">
                  <span
                    class="workflow-task-card__step"
                    :class="`workflow-task-card__step--${resolveStepNodeState(action)}`"
                    :aria-label="getWorkflowActionLabel(action, t('workflow.preview.unknownAction'), t)"
                    :title="getWorkflowActionLabel(action, t('workflow.preview.unknownAction'), t)"
                    role="img"
                  >
                    <VIcon :icon="getWorkflowActionIcon(action.type)" size="15" aria-hidden="true" />
                  </span>
                  <VIcon
                    v-if="index < previewActions.length - 1"
                    icon="mdi-chevron-right"
                    size="13"
                    class="workflow-task-card__step-arrow"
                  />
                </template>
                <span v-if="hiddenActionCount > 0" class="workflow-task-card__step-more num">
                  +{{ hiddenActionCount }}
                </span>
              </div>
              <div v-else class="workflow-task-card__pipeline workflow-task-card__pipeline--empty">
                <span class="workflow-task-card__step workflow-task-card__step--empty">
                  <VIcon icon="mdi-vector-polyline" size="12" />
                  <span>{{ t('workflow.task.info.noActions') }}</span>
                </span>
              </div>
            </div>
          </div>

          <div
            class="workflow-task-card__progress"
            :class="{ 'workflow-task-card__progress--active': globalProgressPercent > 0 }"
            role="progressbar"
            :aria-label="workflow.name"
            aria-valuemin="0"
            aria-valuemax="100"
            :aria-valuenow="globalProgressPercent"
          >
            <span class="workflow-task-card__progress-fill" :style="{ inlineSize: `${globalProgressPercent}%` }" />
          </div>

          <!-- 静态吸收底座：承托实时运行状态与等宽动作进度指标，严禁叠加二次模糊 -->
          <footer class="workflow-task-card__dock">
            <div
              v-if="executionStatus"
              class="workflow-task-card__execution-status num"
              :class="`workflow-task-card__execution-status--${executionStatus.tone}`"
              :title="executionStatus.text"
            >
              <VIcon :icon="executionStatus.icon" size="14" />
              <span>{{ executionStatus.text }}</span>
            </div>

            <div class="workflow-task-card__metrics num">
              <span class="workflow-task-card__metric">
                <span class="workflow-task-card__metric-label">{{ t('workflow.task.info.actionCount') }}</span>
                <strong class="workflow-task-card__metric-value">{{ actionCountText }}</strong>
              </span>
              <span class="workflow-task-card__metric-divider" aria-hidden="true" />
              <span class="workflow-task-card__metric">
                <span class="workflow-task-card__metric-label">{{ t('workflow.task.info.progress') }}</span>
                <strong class="workflow-task-card__metric-value">{{ globalProgressPercent }}%</strong>
              </span>
            </div>
          </footer>
        </VCard>
      </div>
    </VHover>
  </div>
</template>

<style lang="scss" scoped>
.workflow-task-card-hover-area {
  inline-size: 100%;
}

.workflow-task-card {
  --workflow-status-rgb: var(--v-theme-info);
  --workflow-progress-rgb: var(--v-theme-primary);
  --workflow-card-gradient-start-rgb: 10, 132, 255;
  --workflow-card-gradient-end-rgb: 0, 102, 220;
  --workflow-banner-start-rgb: var(--workflow-card-gradient-start-rgb);
  --workflow-banner-end-rgb: var(--workflow-card-gradient-end-rgb);

  display: flex;
  overflow: hidden;
  flex-direction: column;
  cursor: pointer;
}

.workflow-task-card--status-primary {
  --workflow-status-rgb: var(--v-theme-primary);
  --workflow-progress-rgb: var(--v-theme-primary);
}

.workflow-task-card--status-secondary {
  --workflow-status-rgb: var(--v-theme-secondary);
  --workflow-progress-rgb: var(--v-theme-secondary);
}

.workflow-task-card--status-info {
  --workflow-status-rgb: var(--v-theme-info);
  --workflow-progress-rgb: var(--v-theme-info);
}

.workflow-task-card--status-success {
  --workflow-status-rgb: var(--v-theme-success);
  --workflow-progress-rgb: var(--v-theme-success);
}

.workflow-task-card--status-warning {
  --workflow-status-rgb: var(--v-theme-warning);
  --workflow-progress-rgb: var(--v-theme-primary);
}

.workflow-task-card--status-error {
  --workflow-status-rgb: var(--v-theme-error);
  --workflow-progress-rgb: var(--v-theme-error);
}

.workflow-task-card__banner {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  justify-content: space-between;
  gap: 0.6875rem;
  padding-block: 0.875rem 0.75rem;
  padding-inline: 1rem;
}

.workflow-task-card__header {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  min-inline-size: 0;
}

.workflow-task-card__trigger-icon {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(var(--workflow-card-gradient-start-rgb), 0.24);
  border-radius: calc(var(--app-control-radius, 14px) - 2px);
  background: linear-gradient(
    145deg,
    rgba(var(--workflow-card-gradient-start-rgb), 0.2) 0%,
    rgba(var(--workflow-card-gradient-end-rgb), 0.08) 100%
  );
  block-size: 2.375rem;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.22);
  color: color-mix(
    in srgb,
    rgb(var(--workflow-card-gradient-start-rgb)) 82%,
    var(--mp-fg, rgb(var(--v-theme-on-surface)))
  );
  inline-size: 2.375rem;
  transition:
    filter 0.2s ease,
    opacity 0.2s ease;
}

.workflow-task-card--paused .workflow-task-card__trigger-icon {
  filter: saturate(0.55);
  opacity: 0.82;
}

.workflow-task-card__heading {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 0.25rem;
  min-inline-size: 0;
}

.workflow-task-card__title {
  overflow: hidden;
  padding: 0;
  color: var(--mp-fg, rgb(var(--v-theme-on-surface)));
  font-size: 1rem;
  font-weight: 600;
  letter-spacing: 0;
  line-height: 1.32 !important;
  min-inline-size: 0;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workflow-task-card__subline {
  display: flex;
  align-items: center;
  gap: 0.4375rem;
  min-inline-size: 0;
}

.workflow-task-card__status-chip {
  flex: 0 0 auto;
  border: 1px solid rgba(var(--workflow-status-rgb), 0.28);
  block-size: 1.25rem !important;
  color: color-mix(
    in srgb,
    rgb(var(--workflow-status-rgb)) 84%,
    var(--mp-fg, rgb(var(--v-theme-on-surface)))
  ) !important;
  font-size: 0.6875rem !important;
  font-weight: 600;
  letter-spacing: 0;
  padding-inline: 0.4375rem !important;
}

.workflow-task-card__status-chip :deep(.v-chip__underlay) {
  background-color: rgb(var(--workflow-status-rgb)) !important;
  opacity: 0.14;
}

.workflow-task-card__status-chip :deep(.v-chip__content) {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
}

.workflow-task-card__status-dot {
  border-radius: 9999px;
  background-color: rgb(var(--workflow-status-rgb));
  block-size: 0.375rem;
  inline-size: 0.375rem;
}

.workflow-task-card__trigger-text {
  overflow: hidden;
  color: var(--mp-muted-fg, rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity)));
  font-size: 0.75rem;
  font-weight: 500;
  letter-spacing: 0;
  line-height: 1.25;
  min-inline-size: 0;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workflow-task-card__controls {
  z-index: 2;
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 0.25rem;
  margin-inline-end: -0.25rem;
}

.workflow-task-card[data-native-card-menu-ready] .workflow-task-card__controls {
  margin-inline-end: 0;
}

.workflow-task-card__toggle {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  border-radius: 9999px;
  block-size: 1.75rem;
  cursor: pointer;
  font-size: 0.75rem;
  font-weight: 600;
  gap: 0.1875rem;
  letter-spacing: 0;
  line-height: 1;
  padding-inline: 0.625rem 0.6875rem;
  transition:
    background-color 0.16s ease,
    border-color 0.16s ease,
    transform 0.14s ease,
    opacity 0.16s ease;
  white-space: nowrap;

  &:active {
    transform: scale(0.96);
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }

  &:focus-visible {
    outline: 2px solid var(--mp-ring, rgba(var(--v-theme-primary), 0.68));
    outline-offset: 2px;
  }
}

.workflow-task-card__toggle--enable {
  border: 1px solid var(--mp-success-border, rgba(var(--v-theme-success), 0.3));
  background: var(--mp-success-soft, rgba(var(--v-theme-success), 0.14));
  color: color-mix(in srgb, rgb(var(--v-theme-success)) 84%, var(--mp-fg, rgb(var(--v-theme-on-surface))));

  &:hover:not(:disabled) {
    background: rgba(var(--v-theme-success), 0.22);
  }
}

.workflow-task-card__toggle--pause {
  border: 1px solid var(--mp-border, rgba(128, 128, 128, 0.14));
  background: rgba(var(--v-theme-on-surface), 0.055);
  color: var(--mp-fg, rgb(var(--v-theme-on-surface)));

  &:hover:not(:disabled) {
    background: rgba(var(--v-theme-on-surface), 0.1);
  }
}

.workflow-task-card__menu {
  flex: 0 0 auto;
  block-size: 1.75rem !important;
  color: var(--mp-muted-fg, rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity))) !important;
  inline-size: 1.75rem !important;
}

.workflow-task-card__body {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  min-inline-size: 0;
}

.workflow-task-card__desc {
  margin: 0;
  overflow: hidden;
  color: var(--mp-muted-fg, rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity)));
  font-size: 0.8125rem;
  line-height: 1.45;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workflow-task-card--paused .workflow-task-card__desc {
  opacity: 0.85;
}

.workflow-task-card__pipeline {
  display: flex;
  overflow: hidden;
  align-items: center;
  gap: 4px;
  min-inline-size: 0;
}

.workflow-task-card__step {
  display: inline-flex;
  flex: 0 0 1.625rem;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--mp-border, rgba(128, 128, 128, 0.1));
  border-radius: 7px;
  background: rgba(var(--v-theme-on-surface), 0.04);
  color: var(--mp-muted-fg, rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity)));
  block-size: 1.625rem;
  inline-size: 1.625rem;
}

.workflow-task-card__step > .v-icon {
  flex: 0 0 auto;
  opacity: 0.82;
}

.workflow-task-card__step--active {
  border-color: var(--mp-primary-border, rgba(var(--v-theme-primary), 0.32));
  background: var(--mp-primary-soft, rgba(var(--v-theme-primary), 0.14));
  color: color-mix(in srgb, rgb(var(--v-theme-primary)) 84%, var(--mp-fg, rgb(var(--v-theme-on-surface))));
  font-weight: 600;
}

.workflow-task-card__step--done {
  border-color: var(--mp-success-border, rgba(var(--v-theme-success), 0.24));
  background: var(--mp-success-soft, rgba(var(--v-theme-success), 0.1));
  color: var(--mp-fg, rgb(var(--v-theme-on-surface)));
}

.workflow-task-card__step--failed {
  border-color: var(--mp-destructive-border, rgba(var(--v-theme-error), 0.3));
  background: var(--mp-destructive-soft, rgba(var(--v-theme-error), 0.12));
  color: var(--mp-destructive-fg);
}

.workflow-task-card__step--empty {
  color: var(--mp-faint, rgba(var(--v-theme-on-surface), 0.46));
}

.workflow-task-card__step-arrow {
  flex: 0 0 13px;
  color: var(--mp-faint, rgba(var(--v-theme-on-surface), 0.42));
  inline-size: 13px;
  justify-content: center;
}

.workflow-task-card__step-more {
  display: inline-flex;
  flex: 0 0 32px;
  align-items: center;
  justify-content: center;
  border-radius: 9999px;
  background: rgba(var(--v-theme-on-surface), 0.06);
  color: var(--mp-muted-fg, rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity)));
  font-size: 0.6875rem;
  font-weight: 600;
  line-height: 1.2;
  inline-size: 32px;
  padding-block: 0.125rem;
  padding-inline: 0.375rem;
}

.workflow-task-card__progress {
  flex: 0 0 auto;
  background: var(--mp-card-dock-border, var(--mp-border-subtle, rgba(128, 128, 128, 0.08)));
  block-size: 2px;
  inline-size: 100%;
  overflow: hidden;
}

.workflow-task-card__progress--active {
  background: rgba(var(--workflow-progress-rgb), 0.14);
}

.workflow-task-card__progress-fill {
  display: block;
  border-radius: var(--app-control-radius);
  background: rgb(var(--workflow-progress-rgb));
  block-size: 100%;
  transition: inline-size 0.3s ease;
}

.workflow-task-card__dock {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: space-between;
  background: var(--mp-card-dock-bg, var(--mp-muted, rgba(var(--v-theme-on-surface), 0.04)));
  block-size: 2.5rem;
  gap: 0.625rem;
  inline-size: 100%;
  min-block-size: 2.5rem;
  padding-inline: 1rem;
}

.workflow-task-card__execution-status {
  display: flex;
  flex: 1 1 auto;
  align-items: center;
  font-size: 0.75rem;
  font-weight: 500;
  gap: 0.3125rem;
  line-height: 1.25;
  min-inline-size: 0;
}

.workflow-task-card__execution-status--muted {
  color: var(--mp-muted-fg, rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity)));
}

.workflow-task-card__execution-status--primary {
  color: color-mix(in srgb, rgb(var(--v-theme-primary)) 86%, var(--mp-fg, rgb(var(--v-theme-on-surface))));
  font-weight: 600;
}

.workflow-task-card__execution-status--error {
  color: var(--mp-destructive-fg);
  font-weight: 600;
}

.workflow-task-card__execution-status .v-icon {
  flex: 0 0 auto;
}

.workflow-task-card__execution-status span {
  overflow: hidden;
  min-inline-size: 0;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workflow-task-card__metrics {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 0.4375rem;
}

.workflow-task-card__metric {
  display: inline-flex;
  align-items: baseline;
  gap: 0.25rem;
  white-space: nowrap;
}

.workflow-task-card__metric-label {
  color: var(--mp-faint, rgba(var(--v-theme-on-surface), 0.46));
  font-size: 0.6875rem;
  font-weight: 500;
  line-height: 1.2;
}

.workflow-task-card__metric-value {
  color: var(--mp-fg, rgb(var(--v-theme-on-surface)));
  font-size: 0.75rem;
  font-weight: 600;
  line-height: 1.2;
}

.workflow-task-card__metric-divider {
  background: var(--mp-border, rgba(128, 128, 128, 0.16));
  block-size: 0.6875rem;
  inline-size: 1px;
}

@media (width <= 599.98px) {
  .workflow-task-card__banner {
    padding-inline: 0.875rem;
  }

  .workflow-task-card__dock {
    padding-inline: 0.875rem;
  }
}
</style>
