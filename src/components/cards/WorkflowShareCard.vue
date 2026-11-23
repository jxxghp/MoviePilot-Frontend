<script lang="ts" setup>
import { formatDateDifference } from '@/@core/utils/formatters'
import {
  getWorkflowActionIcon,
  getWorkflowActionLabel,
  getWorkflowGradient,
  orderWorkflowActions,
} from '@/@core/utils/workflowGradient'
import type { WorkflowShare } from '@/api/types'
import { openSharedDialog } from '@/composables/useSharedDialog'
import { useWorkflowPreviewActionCount } from '@/composables/useWorkflowPreview'
import { useI18n } from 'vue-i18n'

const ForkWorkflowDialog = defineAsyncComponent(() => import('../dialog/ForkWorkflowDialog.vue'))

const { t } = useI18n()

// 输入参数
const props = defineProps({
  workflow: Object as PropType<WorkflowShare>,
  eventTypes: {
    type: Array as PropType<Array<{ title: string; value: string }>>,
    default: () => [],
  },
})

// 定义删除与更新事件
const emit = defineEmits(['delete', 'update'])

// 分享时间（响应式计算，确保列表复用或属性刷新时同步更新）
const dateText = computed(() => (props.workflow?.date ? formatDateDifference(props.workflow.date) : ''))

// 暴露色相通道，由主题横幅染色层按浅深与玻璃材质统一控制透光和对比度
const gradientStyle = computed(() => {
  const { startRgb, endRgb } = getWorkflowGradient(props.workflow?.id)

  return {
    '--workflow-share-gradient-start-rgb': startRgb,
    '--workflow-share-gradient-end-rgb': endRgb,
  }
})

// 解析事件类型标题
function getEventTypeText(eventTypeValue: string) {
  const matched = props.eventTypes.find(item => item.value === eventTypeValue)
  return matched ? matched.title : eventTypeValue
}

// 解析触发方式图标与文案
const triggerDisplay = computed(() => {
  const triggerType = props.workflow?.trigger_type
  if (triggerType === 'event') {
    return {
      icon: 'mdi-calendar-check-outline',
      text: getEventTypeText(props.workflow?.event_type || '') || t('workflow.trigger'),
    }
  }
  if (triggerType === 'manual') {
    return {
      icon: 'mdi-hand-pointing-up',
      text: t('workflow.task.info.manualTrigger'),
    }
  }
  if (triggerType === 'timer' || props.workflow?.timer) {
    return {
      icon: 'mdi-clock-outline',
      text: props.workflow?.timer || t('workflow.task.info.timer'),
    }
  }
  return {
    icon: 'mdi-source-branch',
    text: '',
  }
})

// 解析并按连线拓扑排序动作节点，提供实用的分享流预览
const orderedActions = computed(() => orderWorkflowActions(props.workflow?.actions, props.workflow?.flows))
const workflowPipelineRef = ref<HTMLElement | null>(null)
const { visibleActionCount } = useWorkflowPreviewActionCount(workflowPipelineRef, () => orderedActions.value.length)
const previewActions = computed(() => orderedActions.value.slice(0, visibleActionCount.value))
const hiddenActionCount = computed(() => Math.max(orderedActions.value.length - previewActions.value.length, 0))

const shareDescription = computed(() => props.workflow?.share_comment || props.workflow?.description || '')

const formattedUsageCount = computed(() => {
  const count = Number(props.workflow?.count || 0)
  return count > 0 ? count.toLocaleString() : ''
})

const authorInitial = computed(() => {
  const name = (props.workflow?.share_user || '').trim()
  return name ? name.slice(0, 1).toUpperCase() : ''
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
function finishForkWorkflow() {
  emit('update')
}

// 删除工作流分享时处理
function doDelete() {
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
            class="workflow-share-card app-hover-lift-card h-full"
            :class="{
              'app-hover-lift-card--hovering': hover.isHovering,
            }"
            :style="gradientStyle"
            @click="showForkWorkflow"
          >
            <div class="workflow-share-card__banner">
              <div class="workflow-share-card__header">
                <div class="workflow-share-card__icon-badge">
                  <VIcon :icon="triggerDisplay.icon" size="20" />
                </div>

                <div class="workflow-share-card__heading">
                  <VCardTitle
                    class="workflow-share-card__title"
                    :title="props.workflow?.share_title || props.workflow?.name"
                  >
                    {{ props.workflow?.share_title || props.workflow?.name }}
                  </VCardTitle>

                  <div v-if="triggerDisplay.text || orderedActions.length > 0" class="workflow-share-card__subline">
                    <span v-if="orderedActions.length > 0" class="workflow-share-card__count-pill num">
                      {{ t('workflow.preview.actionCount', { count: orderedActions.length }) }}
                    </span>
                    <span
                      v-if="triggerDisplay.text"
                      class="workflow-share-card__trigger num"
                      :title="triggerDisplay.text"
                    >
                      {{ triggerDisplay.text }}
                    </span>
                  </div>
                </div>
              </div>

              <div class="workflow-share-card__body">
                <p
                  v-if="shareDescription"
                  class="workflow-share-card__desc"
                  :class="orderedActions.length > 0 ? 'line-clamp-2' : 'line-clamp-3'"
                  :title="shareDescription"
                >
                  {{ shareDescription }}
                </p>

                <div v-if="orderedActions.length > 0" ref="workflowPipelineRef" class="workflow-share-card__pipeline">
                  <template v-for="(action, index) in previewActions" :key="action.id || index">
                    <span
                      class="workflow-share-card__step"
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
                      class="workflow-share-card__step-arrow"
                    />
                  </template>
                  <span v-if="hiddenActionCount > 0" class="workflow-share-card__step-more num">
                    +{{ hiddenActionCount }}
                  </span>
                </div>
              </div>
            </div>

            <!-- 创作者与热度底座：对齐插件市场卡片的静态吸收色层，消除旧绝对定位遮挡 -->
            <footer class="workflow-share-card__dock">
              <div class="workflow-share-card__creator">
                <span class="workflow-share-card__avatar" aria-hidden="true">
                  <span v-if="authorInitial" class="workflow-share-card__avatar-initial">{{ authorInitial }}</span>
                  <VIcon v-else icon="mdi-account-outline" size="13" />
                </span>
                <span class="workflow-share-card__user" :title="props.workflow?.share_user">
                  {{ props.workflow?.share_user }}
                </span>
              </div>

              <div class="workflow-share-card__stats num">
                <span
                  v-if="formattedUsageCount"
                  class="workflow-share-card__heat"
                  :title="t('workflow.usageCount', { count: formattedUsageCount })"
                >
                  <VIcon icon="mdi-fire" color="warning" size="13" />
                  <span>{{ formattedUsageCount }}</span>
                </span>
                <span v-if="dateText" class="workflow-share-card__date">
                  {{ dateText }}
                </span>
              </div>
            </footer>
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

.workflow-share-card {
  --workflow-share-gradient-start-rgb: 10, 132, 255;
  --workflow-share-gradient-end-rgb: 0, 102, 220;
  --workflow-banner-start-rgb: var(--workflow-share-gradient-start-rgb);
  --workflow-banner-end-rgb: var(--workflow-share-gradient-end-rgb);

  display: flex;
  overflow: hidden;
  flex-direction: column;
  cursor: pointer;
}

.workflow-share-card__banner {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  justify-content: space-between;
  gap: 0.625rem;
  padding-block: 0.875rem 0.75rem;
  padding-inline: 1rem;
}

.workflow-share-card__header {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  min-inline-size: 0;
}

.workflow-share-card__icon-badge {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(var(--workflow-share-gradient-start-rgb), 0.24);
  border-radius: calc(var(--app-control-radius, 14px) - 2px);
  background: linear-gradient(
    145deg,
    rgba(var(--workflow-share-gradient-start-rgb), 0.2) 0%,
    rgba(var(--workflow-share-gradient-end-rgb), 0.08) 100%
  );
  block-size: 2.375rem;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.22);
  color: color-mix(
    in srgb,
    rgb(var(--workflow-share-gradient-start-rgb)) 82%,
    var(--mp-fg, rgb(var(--v-theme-on-surface)))
  );
  inline-size: 2.375rem;
}

.workflow-share-card__heading {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 0.25rem;
  min-inline-size: 0;
}

.workflow-share-card__title {
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

.workflow-share-card__subline {
  display: flex;
  align-items: center;
  gap: 0.4375rem;
  min-inline-size: 0;
}

.workflow-share-card__count-pill {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  border: 1px solid rgba(var(--workflow-share-gradient-start-rgb), 0.24);
  border-radius: 9999px;
  background: rgba(var(--workflow-share-gradient-start-rgb), 0.11);
  color: color-mix(
    in srgb,
    rgb(var(--workflow-share-gradient-start-rgb)) 80%,
    var(--mp-fg, rgb(var(--v-theme-on-surface)))
  );
  font-size: 0.6875rem;
  font-weight: 600;
  line-height: 1.15;
  padding-block: 0.125rem;
  padding-inline: 0.4375rem;
  white-space: nowrap;
}

.workflow-share-card__trigger {
  overflow: hidden;
  color: var(--mp-muted-fg, rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity)));
  font-size: 0.75rem;
  font-weight: 500;
  line-height: 1.25;
  min-inline-size: 0;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workflow-share-card__body {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  justify-content: space-between;
  gap: 0.5rem;
  min-inline-size: 0;
}

.workflow-share-card__desc {
  margin: 0;
  color: var(--mp-muted-fg, rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity)));
  font-size: 0.8125rem;
  line-height: 1.48;
  overflow-wrap: anywhere;
}

.workflow-share-card__pipeline {
  display: flex;
  overflow: hidden;
  align-items: center;
  gap: 4px;
  margin-block-start: auto;
  min-inline-size: 0;
}

.workflow-share-card__step {
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

.workflow-share-card__step > .v-icon {
  flex: 0 0 auto;
  opacity: 0.82;
}

.workflow-share-card__step-arrow {
  flex: 0 0 13px;
  color: var(--mp-faint, rgba(var(--v-theme-on-surface), 0.42));
  inline-size: 13px;
  justify-content: center;
}

.workflow-share-card__step-more {
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

.workflow-share-card__dock {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: space-between;
  background: var(--mp-card-dock-bg, var(--mp-muted, rgba(var(--v-theme-on-surface), 0.04)));
  block-size: 2.5rem;
  border-block-start: 1px solid var(--mp-card-dock-border, var(--mp-border-subtle, rgba(128, 128, 128, 0.08)));
  gap: 0.5rem;
  inline-size: 100%;
  min-block-size: 2.5rem;
  padding-inline: 1rem;
}

.workflow-share-card__creator {
  display: flex;
  flex: 1 1 auto;
  align-items: center;
  gap: 0.4375rem;
  min-inline-size: 0;
}

.workflow-share-card__avatar {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(var(--workflow-share-gradient-start-rgb), 0.22);
  border-radius: 9999px;
  background: rgba(var(--workflow-share-gradient-start-rgb), 0.12);
  block-size: 1.375rem;
  color: color-mix(
    in srgb,
    rgb(var(--workflow-share-gradient-start-rgb)) 80%,
    var(--mp-fg, rgb(var(--v-theme-on-surface)))
  );
  inline-size: 1.375rem;
}

.workflow-share-card__avatar-initial {
  font-size: 0.6875rem;
  font-weight: 700;
  line-height: 1;
}

.workflow-share-card__user {
  overflow: hidden;
  color: var(--mp-muted-fg, rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity)));
  font-size: 0.8125rem;
  font-weight: 500;
  line-height: 1.25;
  min-inline-size: 0;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workflow-share-card__stats {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 0.5rem;
}

.workflow-share-card__heat {
  display: inline-flex;
  align-items: center;
  border: 1px solid var(--mp-warning-border, rgba(var(--v-theme-warning), 0.24));
  border-radius: 9999px;
  background: var(--mp-warning-soft, rgba(var(--v-theme-warning), 0.1));
  color: var(--mp-fg, rgb(var(--v-theme-on-surface)));
  font-size: 0.75rem;
  font-weight: 600;
  gap: 0.1875rem;
  line-height: 1.2;
  padding-block: 0.125rem;
  padding-inline: 0.375rem;
}

.workflow-share-card__date {
  color: var(--mp-faint, rgba(var(--v-theme-on-surface), 0.48));
  font-size: 0.75rem;
  font-weight: 500;
  line-height: 1.2;
  white-space: nowrap;
}

@media (width <= 599.98px) {
  .workflow-share-card__banner,
  .workflow-share-card__dock {
    padding-inline: 0.875rem;
  }
}
</style>
