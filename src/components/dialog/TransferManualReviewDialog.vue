<script lang="ts" setup>
import { computed, ref, watch } from 'vue'
import { useDisplay } from 'vuetify'
import { useI18n } from 'vue-i18n'
import { useToast } from 'vue-toastification'
import api from '@/api'
import type { TransferManualReviewDecision, TransferManualReviewTask } from '@/api/types'

const props = defineProps<{
  review: TransferManualReviewTask
}>()

const emit = defineEmits<{
  close: []
  resolved: [decision: TransferManualReviewDecision]
  discarded: []
}>()

const { t } = useI18n()
const toast = useToast()
// 小屏详情弹窗占满可用屏幕，避免长提示和操作区被裁切。
const display = useDisplay()

const reason = ref('')
const submitError = ref('')
const submittingDecision = ref<TransferManualReviewDecision | null>(null)
const sourceCleanupConfirmed = ref(false)
const discardConfirmed = ref(false)

// 跨存储移动的上传已完成，此处判定的是源文件删除，不能复用目标落地证据。
const isMoveSourceCleanup = computed(() => props.review.step.kind === 'delete_move_source')
const cleanupSourcePath = computed(() => {
  const source = props.review.step.intent.source
  if (!source || typeof source !== 'object' || Array.isArray(source)) return ''
  const path = (source as Record<string, unknown>).path
  return typeof path === 'string' ? path : ''
})

// 人工确认只适用于当前步骤和复核版本，刷新任务后必须重新核验。
watch(
  () => [props.review.task_id, props.review.step.operation_id, props.review.review_revision],
  () => {
    sourceCleanupConfirmed.value = false
    discardConfirmed.value = false
  },
)

// 删除步骤必须由管理员确认已清理；其他步骤继续使用已有目标事实证据。
const appliedResultPayload = computed<Record<string, unknown> | null>(() => {
  if (isMoveSourceCleanup.value) {
    return sourceCleanupConfirmed.value && cleanupSourcePath.value
      ? { source_path: cleanupSourcePath.value, deleted: true }
      : null
  }
  const evidence = props.review.step.evidence
  return props.review.step.kind !== 'legacy_execution_review' && evidence?.item ? evidence : null
})
const canMarkApplied = computed(() => appliedResultPayload.value !== null)

// 展示冻结意图中的目标位置，避免把整段任意 JSON 塞进主信息区。
const targetPath = computed(() => {
  const value = props.review.step.intent.target_path
  return typeof value === 'string' ? value : ''
})

// 把接口返回的证据转换成可读摘要，异常数据也不能阻塞详情弹窗。
const evidenceSummary = computed(() => {
  const evidence = props.review.step.evidence
  if (!evidence) return ''

  try {
    return JSON.stringify(evidence, null, 2)
  } catch (error) {
    console.error('格式化整理复核证据失败:', error)
    return String(evidence)
  }
})

const isSubmitting = computed(() => submittingDecision.value !== null)

// 复核说明选填；提交人工判定后，让队列弹窗重新拉取 durable 状态。
async function resolveManualReview(decision: TransferManualReviewDecision) {
  const trimmedReason = reason.value.trim()
  if (submittingDecision.value) return
  if (decision === 'applied' && !canMarkApplied.value) {
    toast.error(t('dialog.transferQueue.manualReviewAppliedUnavailable'))
    return
  }

  submitError.value = ''
  submittingDecision.value = decision
  const payload: {
    operation_id: string
    decision: TransferManualReviewDecision
    reason: string
    result_payload?: Record<string, unknown>
  } = {
    operation_id: props.review.step.operation_id,
    decision,
    reason: trimmedReason,
  }
  if (decision === 'applied' && appliedResultPayload.value) {
    payload.result_payload = appliedResultPayload.value
  }

  try {
    await api.post(`transfer/tasks/${encodeURIComponent(props.review.task_id)}/manual-review`, payload, {
      feedback: 'silent',
    })
    toast.success(t('dialog.transferQueue.manualReviewSubmitted'))
    emit('resolved', decision)
  } catch (error) {
    console.error('提交整理人工复核失败:', error)
    submitError.value = error instanceof Error ? error.message : t('dialog.transferQueue.manualReviewSubmitFailed')
    toast.error(submitError.value)
  } finally {
    submittingDecision.value = null
  }
}

// 显式放弃只释放 durable 整理任务，后端不会移动、删除或回滚任何文件。
async function discardManualReview() {
  if (submittingDecision.value || !discardConfirmed.value) return
  submitError.value = ''
  submittingDecision.value = 'not_applied'
  try {
    await api.post(`transfer/tasks/${encodeURIComponent(props.review.task_id)}/manual-review/discard`, {
      operation_id: props.review.step.operation_id,
      reason: reason.value.trim(),
    }, { feedback: 'silent' })
    toast.success('已放弃整理任务，未修改任何文件')
    emit('discarded')
  } catch (error) {
    console.error('放弃整理人工复核失败:', error)
    submitError.value = error instanceof Error ? error.message : t('dialog.transferQueue.manualReviewSubmitFailed')
    toast.error(submitError.value)
  } finally {
    submittingDecision.value = null
  }
}
</script>

<template>
  <VDialog scrollable max-width="52rem" :fullscreen="!display.mdAndUp.value">
    <VCard class="manual-review-dialog" width="100%">
      <VCardItem class="manual-review-dialog__header">
        <VDialogCloseBtn @click="emit('close')" />
        <template #prepend>
          <VIcon icon="mdi-help-circle-outline" color="warning" size="28" class="me-2" />
        </template>
        <VCardTitle class="manual-review-dialog__title">
          {{ t('dialog.transferQueue.manualReviewTitle') }}
        </VCardTitle>
        <VCardSubtitle class="manual-review-dialog__subtitle">
          {{
            t(
              isMoveSourceCleanup
                ? 'dialog.transferQueue.manualReviewCleanupHint'
                : 'dialog.transferQueue.manualReviewHint',
            )
          }}
        </VCardSubtitle>
      </VCardItem>

      <VDivider />

      <VCardText class="manual-review-dialog__content">
        <section class="manual-review-dialog__summary app-surface-shape">
          <div class="manual-review-dialog__summary-row">
            <span class="manual-review-dialog__label">{{ t('dialog.transferQueue.manualReviewSource') }}</span>
            <span
              class="manual-review-dialog__value manual-review-dialog__value--path"
              :title="isMoveSourceCleanup ? cleanupSourcePath : review.source.path"
            >
              {{ isMoveSourceCleanup ? cleanupSourcePath : review.source.path }}
            </span>
          </div>
          <div class="manual-review-dialog__summary-row">
            <span class="manual-review-dialog__label">{{ t('dialog.transferQueue.manualReviewStorage') }}</span>
            <span class="manual-review-dialog__value">{{ review.source.storage }}</span>
          </div>
          <div class="manual-review-dialog__summary-row">
            <span class="manual-review-dialog__label">{{ t('dialog.transferQueue.manualReviewOperation') }}</span>
            <span class="manual-review-dialog__value manual-review-dialog__value--mono">
              {{ review.step.kind }} · {{ review.step.operation_id }}
            </span>
          </div>
          <div v-if="targetPath" class="manual-review-dialog__summary-row">
            <span class="manual-review-dialog__label">{{ t('dialog.transferQueue.manualReviewTarget') }}</span>
            <span class="manual-review-dialog__value manual-review-dialog__value--path" :title="targetPath">
              {{ targetPath }}
            </span>
          </div>
          <div v-if="review.step.error" class="manual-review-dialog__error">
            <VIcon icon="mdi-alert-outline" color="error" size="18" />
            <span>{{ review.step.error }}</span>
          </div>
        </section>

        <VAlert
          v-if="isMoveSourceCleanup"
          class="manual-review-dialog__notice"
          type="warning"
          variant="tonal"
          density="comfortable"
        >
          {{ t('dialog.transferQueue.manualReviewCleanupWarning') }}
        </VAlert>
        <VAlert
          v-else-if="!canMarkApplied"
          class="manual-review-dialog__notice"
          type="warning"
          variant="tonal"
          density="comfortable"
        >
          {{ t('dialog.transferQueue.manualReviewAppliedUnavailable') }}
        </VAlert>
        <VAlert v-else class="manual-review-dialog__notice" type="warning" variant="tonal" density="comfortable">
          {{ t('dialog.transferQueue.manualReviewAppliedWarning') }}
        </VAlert>

        <VCheckbox
          v-if="isMoveSourceCleanup"
          v-model="sourceCleanupConfirmed"
          :label="t('dialog.transferQueue.manualReviewCleanupConfirm')"
          :disabled="isSubmitting || !cleanupSourcePath"
          hide-details
        />

        <VCheckbox
          v-model="discardConfirmed"
          label="我确认仅放弃本次整理任务，保留源文件和目标文件不变"
          :disabled="isSubmitting"
          hide-details
        />

        <VExpansionPanels v-if="evidenceSummary" variant="accordion" class="manual-review-dialog__evidence">
          <VExpansionPanel>
            <VExpansionPanelTitle>{{ t('dialog.transferQueue.manualReviewEvidence') }}</VExpansionPanelTitle>
            <VExpansionPanelText>
              <pre>{{ evidenceSummary }}</pre>
            </VExpansionPanelText>
          </VExpansionPanel>
        </VExpansionPanels>

        <VAlert v-if="submitError" type="error" variant="tonal" class="manual-review-dialog__notice">
          {{ submitError }}
          <div>{{ t('transferRecovery.reviewFailureHint') }}</div>
        </VAlert>

        <VTextarea
          v-model="reason"
          :label="t('dialog.transferQueue.manualReviewReasonLabel')"
          :placeholder="t('dialog.transferQueue.manualReviewReasonPlaceholder')"
          :disabled="isSubmitting"
          rows="3"
          auto-grow
          counter="2000"
          maxlength="2000"
          variant="outlined"
        />
      </VCardText>

      <VDivider />

      <VCardActions class="manual-review-dialog__actions">
        <VBtn variant="text" :disabled="isSubmitting" @click="emit('close')">
          {{ t('dialog.transferQueue.close') }}
        </VBtn>
        <VSpacer />
        <VBtn
          color="error"
          variant="text"
          :loading="isSubmitting && discardConfirmed"
          :disabled="isSubmitting || !discardConfirmed"
          @click="discardManualReview"
        >
          放弃任务
        </VBtn>
        <VBtn
          color="warning"
          variant="tonal"
          :loading="submittingDecision === 'not_applied'"
          :disabled="isSubmitting"
          @click="resolveManualReview('not_applied')"
        >
          {{
            t(
              isMoveSourceCleanup
                ? 'dialog.transferQueue.manualReviewCleanupRetry'
                : 'dialog.transferQueue.manualReviewNotApplied',
            )
          }}
        </VBtn>
        <VBtn
          color="primary"
          variant="flat"
          :loading="submittingDecision === 'applied'"
          :disabled="isSubmitting || !canMarkApplied"
          @click="resolveManualReview('applied')"
        >
          {{
            t(
              isMoveSourceCleanup
                ? 'dialog.transferQueue.manualReviewCleanupApplied'
                : 'dialog.transferQueue.manualReviewApplied',
            )
          }}
        </VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
</template>

<style scoped>
.manual-review-dialog__content {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  min-block-size: 0;
  min-inline-size: 0;
  overflow-y: auto;
  padding: 1.5rem !important;
}

.manual-review-dialog__header :deep(.v-card-item__content) {
  min-inline-size: 0;
  overflow: visible;
  padding-inline-end: 2.5rem;
}

.manual-review-dialog :deep(.manual-review-dialog__title),
.manual-review-dialog :deep(.manual-review-dialog__subtitle) {
  overflow: visible;
  overflow-wrap: anywhere;
  text-overflow: clip;
  white-space: normal;
  word-break: break-word;
}

.manual-review-dialog :deep(.manual-review-dialog__title) {
  line-height: 1.35;
}

.manual-review-dialog :deep(.manual-review-dialog__subtitle) {
  line-height: 1.5;
}

.manual-review-dialog__summary {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  padding: 1rem;
}

.manual-review-dialog__summary-row {
  display: grid;
  gap: 1rem;
  grid-template-columns: 6rem minmax(0, 1fr);
}

.manual-review-dialog__label {
  color: rgba(var(--v-theme-on-surface), 0.58);
  font-size: 0.8rem;
}

.manual-review-dialog__value {
  min-inline-size: 0;
  overflow-wrap: anywhere;
  color: rgba(var(--v-theme-on-surface), 0.9);
  font-size: 0.86rem;
}

.manual-review-dialog__value--path {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace;
}

.manual-review-dialog__value--mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace;
  font-size: 0.78rem;
}

.manual-review-dialog__error {
  display: flex;
  align-items: flex-start;
  border-block-start: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  color: rgb(var(--v-theme-error));
  font-size: 0.84rem;
  gap: 0.5rem;
  line-height: 1.5;
  min-inline-size: 0;
  padding-block-start: 0.75rem;
}

.manual-review-dialog__error > span {
  min-inline-size: 0;
  overflow-wrap: anywhere;
  white-space: normal;
  word-break: break-word;
}

.manual-review-dialog__notice {
  flex: 0 0 auto;
  inline-size: 100%;
  margin: 0;
}

.manual-review-dialog__notice :deep(.v-alert__content) {
  min-inline-size: 0;
  overflow: visible;
  overflow-wrap: anywhere;
  white-space: normal;
  word-break: break-word;
}

.manual-review-dialog__evidence pre {
  max-block-size: 12rem;
  margin: 0;
  overflow: auto;
  color: rgba(var(--v-theme-on-surface), 0.72);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace;
  font-size: 0.75rem;
  line-height: 1.5;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.manual-review-dialog__actions {
  flex-wrap: wrap;
  gap: 0.5rem;
  padding: 1rem 1.5rem;
}

@media (width <= 600px) {
  .manual-review-dialog__content {
    padding: 1rem !important;
  }

  .manual-review-dialog__summary-row {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
  }

  .manual-review-dialog__actions {
    align-items: stretch;
    flex-direction: column-reverse;
    padding: 1rem;
  }

  .manual-review-dialog__actions :deep(.v-btn) {
    inline-size: 100%;
  }

  .manual-review-dialog__actions :deep(.v-spacer) {
    display: none;
  }
}
</style>
