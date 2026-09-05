<script lang="ts" setup>
import { computed, ref } from 'vue'
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
}>()

const { t } = useI18n()
const toast = useToast()
// 小屏详情弹窗占满可用屏幕，避免长提示和操作区被裁切。
const display = useDisplay()

const reason = ref('')
const submittingDecision = ref<TransferManualReviewDecision | null>(null)

// 复核接口要求 applied 携带目标事实证据；没有目标对象时只能安全地选择重试。
const canMarkApplied = computed(() => {
  const evidence = props.review.step.evidence
  return props.review.step.kind !== 'legacy_execution_review' && Boolean(evidence && evidence.item)
})

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

// 向服务端提交人工判定，并让队列弹窗在成功后重新拉取 durable 状态。
async function resolveManualReview(decision: TransferManualReviewDecision) {
  const trimmedReason = reason.value.trim()
  if (!trimmedReason || submittingDecision.value) {
    if (!trimmedReason) toast.error(t('dialog.transferQueue.manualReviewReasonRequired'))
    return
  }
  if (decision === 'applied' && !canMarkApplied.value) {
    toast.error(t('dialog.transferQueue.manualReviewAppliedUnavailable'))
    return
  }

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
  if (decision === 'applied' && props.review.step.evidence) {
    payload.result_payload = props.review.step.evidence
  }

  try {
    await api.post(`transfer/tasks/${encodeURIComponent(props.review.task_id)}/manual-review`, payload, {
      feedback: 'silent',
    })
    toast.success(t('dialog.transferQueue.manualReviewSubmitted'))
    emit('resolved', decision)
  } catch (error) {
    console.error('提交整理人工复核失败:', error)
    toast.error(t('dialog.transferQueue.manualReviewSubmitFailed'))
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
          {{ t('dialog.transferQueue.manualReviewHint') }}
        </VCardSubtitle>
      </VCardItem>

      <VDivider />

      <VCardText class="manual-review-dialog__content">
        <section class="manual-review-dialog__summary app-surface-shape">
          <div class="manual-review-dialog__summary-row">
            <span class="manual-review-dialog__label">{{ t('dialog.transferQueue.manualReviewSource') }}</span>
            <span class="manual-review-dialog__value manual-review-dialog__value--path" :title="review.source.path">
              {{ review.source.path }}
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
          v-if="!canMarkApplied"
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

        <VExpansionPanels v-if="evidenceSummary" variant="accordion" class="manual-review-dialog__evidence">
          <VExpansionPanel>
            <VExpansionPanelTitle>{{ t('dialog.transferQueue.manualReviewEvidence') }}</VExpansionPanelTitle>
            <VExpansionPanelText>
              <pre>{{ evidenceSummary }}</pre>
            </VExpansionPanelText>
          </VExpansionPanel>
        </VExpansionPanels>

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
          color="warning"
          variant="tonal"
          :loading="submittingDecision === 'not_applied'"
          :disabled="isSubmitting"
          @click="resolveManualReview('not_applied')"
        >
          {{ t('dialog.transferQueue.manualReviewNotApplied') }}
        </VBtn>
        <VBtn
          color="primary"
          variant="flat"
          :loading="submittingDecision === 'applied'"
          :disabled="isSubmitting || !canMarkApplied"
          @click="resolveManualReview('applied')"
        >
          {{ t('dialog.transferQueue.manualReviewApplied') }}
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
