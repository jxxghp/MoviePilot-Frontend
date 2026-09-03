<script setup lang="ts">
import type {
  ClassificationImpactAnalysis,
  ClassificationPolicyHistory,
  ClassificationRevisionConflict,
  ClassificationValidationResult,
} from '@/api/mediaClassificationTypes'

/** 策略发布、冲突恢复和历史回滚控制面板输入。 */
interface ClassificationPolicyControlPanelProps {
  activeRevision: number
  isDirty: boolean
  validationResult: ClassificationValidationResult | null
  validationIsCurrent?: boolean
  impactResult?: ClassificationImpactAnalysis | null
  impactIsCurrent?: boolean
  conflict: ClassificationRevisionConflict | null
  history: ClassificationPolicyHistory | null
  validating?: boolean
  publishing?: boolean
  refreshing?: boolean
  loadingHistory?: boolean
  rollingBack?: boolean
  analyzingImpact?: boolean
}

const props = withDefaults(defineProps<ClassificationPolicyControlPanelProps>(), {
  validationIsCurrent: false,
  impactResult: null,
  impactIsCurrent: false,
  validating: false,
  publishing: false,
  refreshing: false,
  loadingHistory: false,
  rollingBack: false,
  analyzingImpact: false,
})

const emit = defineEmits<{
  validate: []
  analyze: []
  publish: []
  refresh: []
  'keep-draft': []
  'load-history': []
  rollback: [revision: number]
}>()

const { t, locale } = useI18n()
const componentId = useId()
const titleId = 'classification-policy-control-title-' + componentId
const publishRequirementsId = 'classification-publish-requirements-' + componentId
const impactReviewed = ref(false)
const selectedRevision = ref<number | null>(null)
const statusMessage = ref('')

/** 当前任意策略写操作或其前置请求是否正在执行。 */
const isBusy = computed(
  () =>
    props.validating ||
    props.publishing ||
    props.refreshing ||
    props.loadingHistory ||
    props.rollingBack ||
    props.analyzingImpact,
)

/** 服务端校验是否通过且仍对应当前草稿。 */
const hasCurrentValidation = computed(() => props.validationIsCurrent && props.validationResult?.valid === true)

/** 影响分析是否基于当前活动 revision 且仍对应当前草稿。 */
const hasCurrentImpact = computed(
  () =>
    props.impactIsCurrent &&
    props.impactResult !== null &&
    props.impactResult.baseline_revision === props.activeRevision,
)

/** 发布动作必须满足的全部服务端和人工审阅前置条件。 */
const canPublish = computed(
  () =>
    props.isDirty &&
    hasCurrentValidation.value &&
    hasCurrentImpact.value &&
    impactReviewed.value &&
    !props.conflict &&
    !isBusy.value,
)

/** 历史版本按 revision 从新到旧展示，不修改父级只读快照。 */
const historyItems = computed(() =>
  [...(props.history?.items ?? [])].sort((left, right) => right.revision - left.revision),
)

/** 返回发布门禁项对应的图标和语义颜色。 */
function requirementPresentation(passed: boolean): { color: string; icon: string } {
  return passed
    ? { color: 'success', icon: 'mdi-check-circle-outline' }
    : { color: 'warning', icon: 'mdi-alert-circle-outline' }
}

/** 使用当前浏览器区域格式化历史更新时间，并保留无法解析的服务端原值。 */
function formatUpdatedAt(value?: string | null): string {
  if (!value) return t('setting.classification.control.updatedAtUnknown')
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(locale.value, {
    dateStyle: 'medium',
    timeStyle: 'short',
    hour12: false,
  }).format(date)
}

/** 发布前再次检查门禁，避免键盘或程序触发绕过禁用状态。 */
function requestPublish(): void {
  if (!canPublish.value) return
  statusMessage.value = t('setting.classification.control.publishingStatus', { revision: props.activeRevision })
  emit('publish')
}

/** 冲突后保留本地草稿，并立即请求以最新远端 revision 重新分析。 */
function keepDraftAndAnalyze(): void {
  statusMessage.value = t('setting.classification.control.keepDraftStatus')
  emit('keep-draft')
}

/** 对所选历史 revision 发起 CAS 回滚，服务端会创建一个全新版本。 */
function requestRollback(): void {
  if (selectedRevision.value === null || isBusy.value || props.conflict) return
  statusMessage.value = t('setting.classification.control.rollbackStatus', { revision: selectedRevision.value })
  emit('rollback', selectedRevision.value)
}

watch(
  () => [
    props.activeRevision,
    props.impactIsCurrent,
    props.impactResult?.baseline_revision,
    props.impactResult?.candidate_revision,
    props.impactResult?.sampled_at,
  ],
  () => {
    impactReviewed.value = false
  },
)

watch(
  () => [props.activeRevision, props.history?.active_revision, historyItems.value.map(item => item.revision).join(',')],
  () => {
    if (!historyItems.value.some(item => item.revision === selectedRevision.value)) selectedRevision.value = null
  },
)
</script>

<template>
  <section class="classification-policy-control" :aria-labelledby="titleId">
    <header class="classification-policy-control__header">
      <div>
        <h2 :id="titleId">{{ t('setting.classification.control.title') }}</h2>
        <p>{{ t('setting.classification.control.description') }}</p>
      </div>
      <div
        class="classification-policy-control__revision"
        :aria-label="t('setting.classification.control.policyStatusAria')"
      >
        <VChip size="small" prepend-icon="mdi-source-branch" variant="tonal"> revision {{ activeRevision }} </VChip>
        <VChip v-if="isDirty" size="small" color="warning" variant="tonal">
          {{ t('setting.classification.control.unpublishedChanges') }}
        </VChip>
      </div>
    </header>

    <p class="sr-only" role="status" aria-live="polite">{{ statusMessage }}</p>

    <VAlert
      v-if="conflict"
      class="classification-policy-control__conflict"
      type="warning"
      variant="tonal"
      :title="t('setting.classification.control.conflictTitle')"
      role="alert"
    >
      <p>
        {{
          t('setting.classification.control.conflictDescription', {
            expected: conflict.expected_revision,
            current: conflict.current_revision,
          })
        }}
      </p>
      <div class="classification-policy-control__actions">
        <VBtn
          color="warning"
          variant="outlined"
          prepend-icon="mdi-refresh"
          :loading="refreshing"
          :disabled="isBusy && !refreshing"
          :aria-label="t('setting.classification.control.reloadRemote')"
          @click="emit('refresh')"
        >
          {{ t('setting.classification.control.reloadRemote') }}
        </VBtn>
        <VBtn
          color="warning"
          variant="tonal"
          prepend-icon="mdi-chart-box-outline"
          :loading="analyzingImpact"
          :disabled="isBusy && !analyzingImpact"
          :aria-label="t('setting.classification.control.keepDraft')"
          @click="keepDraftAndAnalyze"
        >
          {{ t('setting.classification.control.keepDraft') }}
        </VBtn>
      </div>
    </VAlert>

    <div class="classification-policy-control__layout">
      <section class="classification-policy-control__section" aria-labelledby="classification-publish-title">
        <div class="classification-policy-control__section-header">
          <div>
            <h3 id="classification-publish-title">{{ t('setting.classification.control.publishTitle') }}</h3>
            <p>{{ t('setting.classification.control.publishDescription') }}</p>
          </div>
          <div class="classification-policy-control__actions">
            <VBtn
              variant="outlined"
              prepend-icon="mdi-shield-check-outline"
              :loading="validating"
              :disabled="isBusy && !validating"
              :aria-label="t('setting.classification.control.validateDraftAria')"
              @click="emit('validate')"
            >
              {{ t('setting.classification.control.serverValidation') }}
            </VBtn>
            <VBtn
              variant="outlined"
              prepend-icon="mdi-chart-box-outline"
              :loading="analyzingImpact"
              :disabled="isBusy && !analyzingImpact"
              :aria-label="t('setting.classification.control.analyzeDraftAria')"
              @click="emit('analyze')"
            >
              {{ t('setting.classification.control.impactAnalysis') }}
            </VBtn>
          </div>
        </div>

        <ul
          :id="publishRequirementsId"
          class="classification-policy-control__requirements"
          :aria-label="t('setting.classification.control.publishRequirementsAria')"
        >
          <li :data-passed="isDirty">
            <VIcon
              :icon="requirementPresentation(isDirty).icon"
              :color="requirementPresentation(isDirty).color"
              aria-hidden="true"
            />
            <span>{{
              t(
                isDirty
                  ? 'setting.classification.control.requirements.dirtyPassed'
                  : 'setting.classification.control.requirements.dirtyPending',
              )
            }}</span>
          </li>
          <li :data-passed="hasCurrentValidation">
            <VIcon
              :icon="requirementPresentation(hasCurrentValidation).icon"
              :color="requirementPresentation(hasCurrentValidation).color"
              aria-hidden="true"
            />
            <span>
              {{
                t(
                  hasCurrentValidation
                    ? 'setting.classification.control.requirements.validationPassed'
                    : 'setting.classification.control.requirements.validationPending',
                )
              }}
            </span>
          </li>
          <li :data-passed="hasCurrentImpact">
            <VIcon
              :icon="requirementPresentation(hasCurrentImpact).icon"
              :color="requirementPresentation(hasCurrentImpact).color"
              aria-hidden="true"
            />
            <span>
              {{
                hasCurrentImpact
                  ? t('setting.classification.control.requirements.impactPassed', { revision: activeRevision })
                  : t('setting.classification.control.requirements.impactPending')
              }}
            </span>
          </li>
          <li :data-passed="impactReviewed">
            <VIcon
              :icon="requirementPresentation(impactReviewed).icon"
              :color="requirementPresentation(impactReviewed).color"
              aria-hidden="true"
            />
            <span>{{
              t(
                impactReviewed
                  ? 'setting.classification.control.requirements.reviewPassed'
                  : 'setting.classification.control.requirements.reviewPending',
              )
            }}</span>
          </li>
          <li :data-passed="!conflict">
            <VIcon
              :icon="requirementPresentation(!conflict).icon"
              :color="requirementPresentation(!conflict).color"
              aria-hidden="true"
            />
            <span>{{
              t(
                conflict
                  ? 'setting.classification.control.requirements.conflictPending'
                  : 'setting.classification.control.requirements.conflictPassed',
              )
            }}</span>
          </li>
        </ul>

        <section
          v-if="impactResult"
          class="classification-policy-control__impact"
          :aria-label="t('setting.classification.control.latestImpactAria')"
        >
          <div class="classification-policy-control__metrics">
            <div>
              <span>{{ t('setting.classification.control.sample') }}</span>
              <strong>{{ impactResult.sample_count }}</strong>
            </div>
            <div>
              <span>{{ t('setting.classification.control.classificationChanges') }}</span>
              <strong>{{ impactResult.changed_count }}</strong>
            </div>
            <div>
              <span>{{ t('setting.classification.control.degraded') }}</span>
              <strong>{{ impactResult.degraded_count }}</strong>
            </div>
          </div>
          <p :class="{ 'text-warning': !hasCurrentImpact }">
            {{
              hasCurrentImpact
                ? t('setting.classification.control.analysisTime', { time: formatUpdatedAt(impactResult.sampled_at) })
                : t('setting.classification.control.impactExpired')
            }}
          </p>
        </section>

        <VCheckbox
          v-model="impactReviewed"
          color="primary"
          hide-details
          :label="t('setting.classification.control.reviewConfirmation')"
          :disabled="!hasCurrentImpact || isBusy"
        />

        <VBtn
          color="primary"
          variant="flat"
          size="large"
          block
          prepend-icon="mdi-cloud-upload-outline"
          :loading="publishing"
          :disabled="!canPublish"
          :aria-describedby="publishRequirementsId"
          :aria-label="t('setting.classification.control.publishAria')"
          @click="requestPublish"
        >
          {{ t('setting.classification.control.publish') }}
        </VBtn>
      </section>

      <section class="classification-policy-control__section" aria-labelledby="classification-history-title">
        <div class="classification-policy-control__section-header">
          <div>
            <h3 id="classification-history-title">{{ t('setting.classification.control.historyTitle') }}</h3>
            <p>{{ t('setting.classification.control.historyDescription', { revision: activeRevision }) }}</p>
          </div>
          <VBtn
            icon
            variant="text"
            :loading="loadingHistory"
            :disabled="isBusy && !loadingHistory"
            :aria-label="t('setting.classification.control.refreshHistory')"
            @click="emit('load-history')"
          >
            <VIcon icon="mdi-history" />
            <VTooltip activator="parent" location="top">{{
              t('setting.classification.control.refreshHistory')
            }}</VTooltip>
          </VBtn>
        </div>

        <div v-if="loadingHistory" class="classification-policy-control__loading" role="status">
          <VProgressCircular indeterminate size="24" color="primary" />
          <span>{{ t('setting.classification.control.loadingHistory') }}</span>
        </div>

        <div v-else-if="!history" class="classification-policy-control__empty" role="status">
          {{ t('setting.classification.control.historyNotLoaded') }}
        </div>

        <div v-else-if="historyItems.length === 0" class="classification-policy-control__empty" role="status">
          {{ t('setting.classification.control.historyEmpty') }}
        </div>

        <fieldset v-else class="classification-policy-control__history-list">
          <legend class="sr-only">{{ t('setting.classification.control.selectHistoryLegend') }}</legend>
          <label
            v-for="policy in historyItems"
            :key="policy.revision"
            class="classification-policy-control__history-row"
            :class="{ 'classification-policy-control__history-row--selected': selectedRevision === policy.revision }"
            :data-testid="'classification-history-revision-' + policy.revision"
          >
            <input
              v-model="selectedRevision"
              type="radio"
              name="classification-history-revision"
              :value="policy.revision"
              :aria-label="
                t('setting.classification.control.selectHistoryAria', {
                  revision: policy.revision,
                  categories: policy.categories.length,
                  rules: policy.rules.length,
                })
              "
            />
            <span class="classification-policy-control__history-summary">
              <span class="classification-policy-control__history-title">
                <strong>revision {{ policy.revision }}</strong>
                <time v-if="policy.updated_at" :datetime="policy.updated_at">{{
                  formatUpdatedAt(policy.updated_at)
                }}</time>
                <span v-else>{{ t('setting.classification.control.updatedAtUnknown') }}</span>
              </span>
              <span class="classification-policy-control__history-counts">
                <span>{{
                  t('setting.classification.control.categoryCount', { count: policy.categories.length })
                }}</span>
                <span>{{ t('setting.classification.control.ruleCount', { count: policy.rules.length }) }}</span>
              </span>
            </span>
          </label>
        </fieldset>

        <VAlert density="compact" type="info" variant="tonal">
          {{ t('setting.classification.control.rollbackNotice') }}
        </VAlert>

        <VBtn
          color="primary"
          variant="tonal"
          block
          prepend-icon="mdi-backup-restore"
          :loading="rollingBack"
          :disabled="selectedRevision === null || isBusy || !!conflict"
          :aria-label="t('setting.classification.control.rollbackAria')"
          @click="requestRollback"
        >
          {{
            selectedRevision === null
              ? t('setting.classification.control.selectBeforeRollback')
              : t('setting.classification.control.rollbackRevision', { revision: selectedRevision })
          }}
        </VBtn>
      </section>
    </div>
  </section>
</template>

<style scoped>
.classification-policy-control {
  display: grid;
  gap: 20px;
  inline-size: 100%;
  min-inline-size: 0;
}

.classification-policy-control__header,
.classification-policy-control__section-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.classification-policy-control__header h2,
.classification-policy-control__section-header h3 {
  margin: 0;
  font-size: 1rem;
  line-height: 1.4;
  letter-spacing: 0;
}

.classification-policy-control__header p,
.classification-policy-control__section-header p,
.classification-policy-control__impact p {
  margin: 4px 0 0;
  color: rgb(var(--v-theme-on-surface-variant));
  font-size: 0.875rem;
}

.classification-policy-control__revision,
.classification-policy-control__actions {
  display: flex;
  flex: 0 0 auto;
  flex-wrap: wrap;
  gap: 8px;
}

.classification-policy-control__layout {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
  align-items: start;
}

.classification-policy-control__section {
  display: grid;
  gap: 16px;
  min-inline-size: 0;
  padding: 16px;
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 8px;
}

.classification-policy-control__requirements {
  display: grid;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.classification-policy-control__requirements li {
  display: grid;
  grid-template-columns: 20px minmax(0, 1fr);
  gap: 8px;
  align-items: center;
  color: rgb(var(--v-theme-on-surface-variant));
  font-size: 0.875rem;
}

.classification-policy-control__requirements li[data-passed='true'] {
  color: rgb(var(--v-theme-on-surface));
}

.classification-policy-control__impact {
  display: grid;
  gap: 8px;
  padding: 12px;
  border-radius: 8px;
  background: rgba(var(--v-theme-surface-variant), 0.24);
}

.classification-policy-control__metrics {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.classification-policy-control__metrics div {
  display: grid;
  gap: 2px;
  min-inline-size: 0;
}

.classification-policy-control__metrics span,
.classification-policy-control__history-counts,
.classification-policy-control__history-title time,
.classification-policy-control__history-title > span {
  color: rgb(var(--v-theme-on-surface-variant));
  font-size: 0.75rem;
}

.classification-policy-control__metrics strong {
  font-size: 1.125rem;
}

.classification-policy-control__history-list {
  display: grid;
  gap: 8px;
  min-inline-size: 0;
  margin: 0;
  padding: 0;
  border: 0;
}

.classification-policy-control__history-row {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 12px;
  align-items: center;
  min-inline-size: 0;
  padding: 12px;
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 8px;
  cursor: pointer;
}

.classification-policy-control__history-row:hover,
.classification-policy-control__history-row:focus-within,
.classification-policy-control__history-row--selected {
  border-color: rgb(var(--v-theme-primary));
  background: rgba(var(--v-theme-primary), 0.06);
}

.classification-policy-control__history-row input {
  inline-size: 18px;
  block-size: 18px;
  accent-color: rgb(var(--v-theme-primary));
}

.classification-policy-control__history-summary,
.classification-policy-control__history-title,
.classification-policy-control__history-counts {
  display: flex;
  min-inline-size: 0;
}

.classification-policy-control__history-summary {
  flex-direction: column;
  gap: 6px;
}

.classification-policy-control__history-title {
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}

.classification-policy-control__history-counts {
  flex-wrap: wrap;
  gap: 12px;
}

.classification-policy-control__loading,
.classification-policy-control__empty {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  min-block-size: 88px;
  color: rgb(var(--v-theme-on-surface-variant));
  text-align: center;
}

@media (max-width: 1100px) {
  .classification-policy-control__layout {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (max-width: 600px) {
  .classification-policy-control__header,
  .classification-policy-control__section-header,
  .classification-policy-control__history-title {
    flex-direction: column;
  }

  .classification-policy-control__revision,
  .classification-policy-control__actions,
  .classification-policy-control__actions :deep(.v-btn) {
    inline-size: 100%;
  }

  .classification-policy-control__metrics {
    grid-template-columns: minmax(0, 1fr);
  }

  .classification-policy-control__section {
    padding: 14px;
  }
}
</style>
