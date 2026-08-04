<script setup lang="ts">
import api from '@/api'
import { doneNProgress, startNProgress } from '@/api/nprogress'
import type { WorkflowShare } from '@/api/types'
import WorkflowSummaryPreview from '@/components/workflow/WorkflowSummaryPreview.vue'
import { useToast } from 'vue-toastification'
import { useI18n } from 'vue-i18n'
import { useGlobalSettingsStore } from '@/stores'

// 国际化
const { t } = useI18n()

// 输入参数
const props = defineProps({
  workflow: Object as PropType<WorkflowShare>,
  eventTypes: {
    type: Array as PropType<Array<{ title: string; value: string }>>,
    default: () => [],
  },
})

// 定义事件
const emit = defineEmits(['fork', 'delete', 'close'])

// 从 provide 中获取全局设置
// 全局设置
const globalSettingsStore = useGlobalSettingsStore()
const globalSettings = globalSettingsStore.globalSettings

// 提示框
const $toast = useToast()

// 处理中
const processing = ref(false)

// 删除中
const deleting = ref(false)

// 根据事件类型值获取显示文本
const getEventTypeText = (eventTypeValue: string) => {
  const eventType = props.eventTypes.find(item => item.value === eventTypeValue)
  return eventType ? eventType.title : eventTypeValue
}

// 解析工作流数据
const parsedWorkflow = computed(() => {
  if (!props.workflow) return null

  try {
    const workflow = { ...props.workflow }

    // 解析actions
    if (typeof workflow.actions === 'string') {
      workflow.actions = JSON.parse(workflow.actions)
    }

    // 解析flows
    if (typeof workflow.flows === 'string') {
      workflow.flows = JSON.parse(workflow.flows)
    }

    return workflow
  } catch (error) {
    console.error('解析工作流数据失败:', error)
    return props.workflow
  }
})

const previewActions = computed(() =>
  Array.isArray(parsedWorkflow.value?.actions) ? parsedWorkflow.value.actions : [],
)
const previewFlows = computed(() => (Array.isArray(parsedWorkflow.value?.flows) ? parsedWorkflow.value.flows : []))

// 复用工作流
async function doFork() {
  // 开始处理
  startNProgress()
  try {
    processing.value = true
    // 请求API
    const result: { [key: string]: any } = await api.post('workflow/fork', props.workflow)
    // 工作流状态
    if (result.success) {
      $toast.success(t('workflow.addSuccess', { name: props.workflow?.share_title }))
      // 完成
      emit('fork', result.data.id)
    } else {
      $toast.error(t('workflow.addFailed', { name: props.workflow?.share_title, message: result.message }))
    }
  } catch (error) {
    console.error(error)
  } finally {
    processing.value = false
    doneNProgress()
  }
}

// 删除工作流分享
async function doDelete() {
  // 开始处理
  startNProgress()
  try {
    deleting.value = true
    // 请求API
    const result: { [key: string]: any } = await api.delete(`workflow/share/${props.workflow?.id}`, {
      params: {
        share_uid: globalSettings.USER_UNIQUE_ID,
      },
    })
    // 工作流状态
    if (result.success) {
      $toast.success(t('workflow.cancelSuccess'))
      // 完成
      emit('delete', result.data.id)
    } else {
      $toast.error(t('workflow.cancelFailed', { message: result.message }))
    }
  } catch (error) {
    console.error(error)
  } finally {
    deleting.value = false
    doneNProgress()
  }
}
</script>
<template>
  <VDialog max-width="40rem" scrollable>
    <VCard>
      <VCardText>
        <VCol>
          <div class="workflow-share-layout">
            <div class="workflow-share-preview">
              <WorkflowSummaryPreview :actions="previewActions" :flows="previewFlows" />
            </div>

            <!-- 右侧内容 -->
            <div class="flex-grow workflow-share-detail">
              <VCardItem class="workflow-share-detail__header pa-0">
                <VCardTitle
                  class="workflow-share-detail__title break-words whitespace-break-spaces line-clamp-2 overflow-hidden text-ellipsis"
                >
                  {{ props.workflow?.share_title }}
                </VCardTitle>
                <VCardSubtitle
                  class="workflow-share-detail__description break-words whitespace-break-spaces line-clamp-4 overflow-hidden text-ellipsis"
                >
                  {{ props.workflow?.share_comment }}
                </VCardSubtitle>
                <dl class="workflow-share-detail__metadata">
                  <div class="workflow-share-detail__metadata-row">
                    <dt>{{ t('workflow.sharer') }}：</dt>
                    <dd>{{ props.workflow?.share_user }}</dd>
                  </div>
                  <div
                    v-if="props.workflow?.trigger_type || props.workflow?.timer"
                    class="workflow-share-detail__metadata-row"
                  >
                    <dt>{{ t('workflow.trigger') }}：</dt>
                    <dd>
                      <span v-if="props.workflow?.trigger_type === 'timer' || !props.workflow?.trigger_type">
                        <VIcon icon="mdi-clock-outline" size="small" class="me-1" />
                        {{ props.workflow?.timer }}
                      </span>
                      <span v-else-if="props.workflow?.trigger_type === 'event'">
                        <VIcon icon="mdi-calendar-check" size="small" class="me-1" />
                        {{ getEventTypeText(props.workflow?.event_type || '') }}
                      </span>
                      <span v-else-if="props.workflow?.trigger_type === 'manual'">
                        <VIcon icon="mdi-hand-pointing-up" size="small" class="me-1" />
                        {{ t('workflow.manualTrigger') }}
                      </span>
                    </dd>
                  </div>
                  <div v-if="parsedWorkflow?.actions" class="workflow-share-detail__metadata-row">
                    <dt>{{ t('workflow.actionCount') }}：</dt>
                    <dd>{{ parsedWorkflow?.actions?.length }}</dd>
                  </div>
                </dl>
                <div class="workflow-share-detail__actions">
                  <div class="workflow-share-detail__buttons">
                    <VBtn
                      color="primary"
                      :disabled="processing"
                      @click="doFork"
                      prepend-icon="mdi-heart"
                      :loading="processing"
                      class="workflow-share-detail__button"
                    >
                      {{ t('workflow.normalFork') }}
                    </VBtn>
                    <VBtn
                      v-if="
                        (props.workflow?.share_uid && props.workflow?.share_uid === globalSettings.USER_UNIQUE_ID) ||
                        globalSettings.WORKFLOW_SHARE_MANAGE
                      "
                      color="error"
                      :disabled="deleting"
                      @click="doDelete"
                      prepend-icon="mdi-delete"
                      :loading="deleting"
                      class="workflow-share-detail__button"
                    >
                      {{ t('workflow.cancelShare') }}
                    </VBtn>
                  </div>
                  <div class="workflow-share-detail__usage" v-if="props.workflow?.count">
                    <VIcon icon="mdi-fire" size="18" />
                    <span>{{ t('workflow.usageCount', { count: props.workflow?.count?.toLocaleString() }) }}</span>
                  </div>
                </div>
              </VCardItem>
            </div>
          </div>
        </VCol>
      </VCardText>
      <VDialogCloseBtn @click="emit('close')" />
    </VCard>
  </VDialog>
</template>

<style lang="scss">
.workflow-share-layout {
  display: grid;
  grid-template-columns: 13.5rem minmax(0, 1fr);
  align-items: center;
  gap: 1.25rem;
}

.workflow-share-preview {
  min-inline-size: 0;
}

.workflow-share-detail {
  min-inline-size: 0;
}

.workflow-share-detail__header {
  text-align: center;
}

.workflow-share-detail__title,
.workflow-share-detail__description {
  text-align: center;
}

.workflow-share-detail__metadata {
  display: grid;
  gap: 0.625rem;
  margin: 1.125rem auto;
}

.workflow-share-detail__metadata-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  align-items: center;
  gap: 0.625rem;
  min-inline-size: 0;
}

.workflow-share-detail__metadata dt {
  font-size: 0.875rem;
  font-weight: 600;
  line-height: 1.4;
  text-align: end;
  white-space: nowrap;
}

.workflow-share-detail__metadata dd {
  min-inline-size: 0;
  margin: 0;
  font-size: 0.9375rem;
  line-height: 1.4;
  overflow-wrap: anywhere;
  text-align: start;
}

.workflow-share-detail__actions {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  margin-block-start: 1rem;
}

.workflow-share-detail__buttons {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.5rem;
  inline-size: 100%;
}

.workflow-share-detail__usage {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.3rem;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 0.75rem;
  line-height: 1.4;
}

@media (width < 360px) {
  .workflow-share-detail__buttons {
    flex-direction: column;
  }

  .workflow-share-detail__button {
    inline-size: 100%;
  }
}

@media screen and (width <= 600px) {
  .workflow-share-layout {
    grid-template-columns: minmax(0, 1fr);
    gap: 1rem;
    padding-block-start: 2rem;
  }
}
</style>
