<script setup lang="ts">
import type {
  ClassificationCategory,
  ClassificationImpactAnalysis,
  ClassificationResult,
  ClassificationSelection,
} from '@/api/mediaClassificationTypes'
import type { MediaSourceInfo } from '@/api/types'
import { formatClassificationCategoryOptionTitle } from '@/utils/mediaClassification'

/** 影响分析面板输入属性。 */
interface ClassificationImpactPanelProps {
  categories?: readonly ClassificationCategory[]
  sources?: readonly MediaSourceInfo[]
  analysis: ClassificationImpactAnalysis | null
  loading: boolean
  disabled: boolean
}

/** 触发有界影响分析时提交的样本和示例上限。 */
interface ClassificationImpactAnalyzeOptions {
  sampleLimit: number
  exampleLimit: number
}

/** 统计网格中的单个可读指标。 */
interface ClassificationImpactMetric {
  key: string
  label: string
  value: string | number
}

const props = defineProps<ClassificationImpactPanelProps>()

const emit = defineEmits<{
  analyze: [options: ClassificationImpactAnalyzeOptions]
}>()

const { t, locale } = useI18n()
const sampleLimit = ref('100')
const exampleLimit = ref('20')
const scopeDescriptionId = `classification-impact-scope-${useId()}`

const overviewMetrics = computed<ClassificationImpactMetric[]>(() => {
  const analysis = props.analysis
  if (!analysis) return []
  return [
    {
      key: 'requested_limit',
      label: t('setting.classification.impact.metrics.requestedLimit'),
      value: analysis.requested_limit,
    },
    {
      key: 'scanned_count',
      label: t('setting.classification.impact.metrics.scannedCount'),
      value: analysis.scanned_count,
    },
    {
      key: 'skipped_count',
      label: t('setting.classification.impact.metrics.skippedCount'),
      value: analysis.skipped_count,
    },
    {
      key: 'unresolved_count',
      label: t('setting.classification.impact.metrics.unresolvedCount'),
      value: analysis.unresolved_count,
    },
    {
      key: 'truncated',
      label: t('setting.classification.impact.metrics.truncated'),
      value: t(analysis.truncated ? 'setting.classification.impact.yes' : 'setting.classification.impact.no'),
    },
    {
      key: 'sample_count',
      label: t('setting.classification.impact.metrics.sampleCount'),
      value: analysis.sample_count,
    },
    {
      key: 'changed_count',
      label: t('setting.classification.impact.metrics.changedCount'),
      value: analysis.changed_count,
    },
    {
      key: 'unchanged_count',
      label: t('setting.classification.impact.metrics.unchangedCount'),
      value: analysis.unchanged_count,
    },
  ]
})

const changeTypeMetrics = computed<ClassificationImpactMetric[]>(() => {
  const analysis = props.analysis
  if (!analysis) return []
  return [
    {
      key: 'category_changed_count',
      label: t('setting.classification.impact.metrics.categoryChangedCount'),
      value: analysis.category_changed_count,
    },
    {
      key: 'path_only_changed_count',
      label: t('setting.classification.impact.metrics.pathOnlyChangedCount'),
      value: analysis.path_only_changed_count,
    },
    {
      key: 'rule_changed_only_count',
      label: t('setting.classification.impact.metrics.ruleChangedOnlyCount'),
      value: analysis.rule_changed_only_count,
    },
    {
      key: 'became_fallback_count',
      label: t('setting.classification.impact.metrics.becameFallbackCount'),
      value: analysis.became_fallback_count,
    },
    {
      key: 'partial_count',
      label: t('setting.classification.impact.metrics.partialCount'),
      value: analysis.partial_count,
    },
    {
      key: 'degraded_count',
      label: t('setting.classification.impact.metrics.degradedCount'),
      value: analysis.degraded_count,
    },
  ]
})

/** 将输入约束为服务端允许的整数范围，避免空值或小数进入分析请求。 */
function normalizeLimit(value: string, minimum: number, maximum: number, fallback: number): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(maximum, Math.max(minimum, Math.trunc(parsed)))
}

/** 提交经过边界规范化的分析参数。 */
function requestAnalysis(): void {
  if (props.loading || props.disabled) return

  const normalizedSampleLimit = normalizeLimit(sampleLimit.value, 1, 200, 100)
  const normalizedExampleLimit = normalizeLimit(exampleLimit.value, 0, 50, 20)
  sampleLimit.value = String(normalizedSampleLimit)
  exampleLimit.value = String(normalizedExampleLimit)
  emit('analyze', { sampleLimit: normalizedSampleLimit, exampleLimit: normalizedExampleLimit })
}

/** 返回影响分析来源的本地化说明，同时保留原始 sample_source 值。 */
function sampleSourceLabel(source: ClassificationImpactAnalysis['sample_source']): string {
  return t(
    source === 'request'
      ? 'setting.classification.impact.sampleSources.request'
      : 'setting.classification.impact.sampleSources.recentHistory',
  )
}

/** 将采样时间格式化为本地可读时间；无效值保持原样以便诊断。 */
function formatSampledAt(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(locale.value, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date)
}

/** 按分类名称排序聚合计数，保证前后策略列表易于比对。 */
function sortedCategoryCounts(counts: Record<string, number>): [string, number][] {
  return Object.entries(counts).sort(([left], [right]) => left.localeCompare(right))
}

/** 将分类编号转换为分类名称和路径，未找到时保留未分类提示。 */
function categoryLabel(categoryId: string): string {
  const category = props.categories?.find(item => item.id === categoryId)
  if (!category) return t('setting.classification.impact.uncategorized')
  return formatClassificationCategoryOptionTitle(category, {
    emptyPathLabel: t('setting.classification.impact.noCategoryPath'),
  })
}

/** 将来源编号转换为来源目录中的显示名称。 */
function sourceDisplayName(source: string): string {
  return (
    props.sources?.find(item => item.media_source === source)?.name || t('setting.classification.impact.unknownSource')
  )
}

/** 选择最终有效结果，缺失时退回自动推荐结果。 */
function resultSelection(result: ClassificationResult): ClassificationSelection | null {
  return result.effective ?? result.recommended ?? null
}

/** 返回结果中的分类名称和路径。 */
function resultCategory(result: ClassificationResult): string {
  const categoryId = resultSelection(result)?.category_id
  return categoryId ? categoryLabel(categoryId) : t('setting.classification.impact.uncategorized')
}

/** 返回结果中的多级分类路径。 */
function resultPath(result: ClassificationResult): string {
  const path = resultSelection(result)?.category_path ?? []
  return path.length ? path.join(' / ') : t('setting.classification.impact.noCategoryPath')
}

/** 返回结果中的规则命中状态，避免把内部规则编号当作用户术语。 */
function resultRule(result: ClassificationResult): string {
  return resultSelection(result)?.rule_id
    ? t('setting.classification.preview.selectionSource.automatic')
    : t('setting.classification.impact.none')
}

/** 返回结果中的分类来源说明。 */
function resultSource(result: ClassificationResult): string {
  const source = resultSelection(result)?.source
  const labels: Record<string, string> = {
    automatic: t('setting.classification.preview.selectionSource.automatic'),
    fallback: t('setting.classification.preview.selectionSource.fallback'),
  }
  return source ? (labels[source] ?? source) : t('setting.classification.impact.none')
}

/** 返回求值状态的本地化说明。 */
function resultState(result: ClassificationResult): string {
  const stateKeys: Record<ClassificationResult['state'], string> = {
    complete: 'setting.classification.impact.states.complete',
    partial: 'setting.classification.impact.states.partial',
    not_evaluated: 'setting.classification.impact.states.notEvaluated',
    invalid_policy: 'setting.classification.impact.states.invalidPolicy',
  }
  return t(stateKeys[result.state])
}

/** 返回变化字段的用户可读名称，并保留未知扩展字段。 */
function changedFieldLabel(field: string): string {
  const fieldKeys: Record<string, string> = {
    category_id: 'setting.classification.impact.changedFields.categoryId',
    category_path: 'setting.classification.impact.changedFields.categoryPath',
    rule_id: 'setting.classification.impact.changedFields.ruleId',
    labels: 'setting.classification.impact.changedFields.labels',
    state: 'setting.classification.impact.changedFields.state',
  }
  return fieldKeys[field] ? t(fieldKeys[field]) : field
}
</script>

<template>
  <section class="classification-impact-panel" aria-labelledby="classification-impact-title" :aria-busy="loading">
    <header class="classification-impact-header">
      <div>
        <h2 id="classification-impact-title">{{ t('setting.classification.impact.title') }}</h2>
        <p>{{ t('setting.classification.impact.description') }}</p>
      </div>
      <VChip v-if="analysis" color="info" variant="tonal" size="small">
        {{
          t('setting.classification.impact.sampleSource', {
            source: analysis.sample_source,
            label: sampleSourceLabel(analysis.sample_source),
          })
        }}
      </VChip>
    </header>

    <form
      class="classification-impact-controls"
      :aria-describedby="scopeDescriptionId"
      @submit.prevent="requestAnalysis"
    >
      <VTextField
        v-model="sampleLimit"
        type="number"
        :label="t('setting.classification.impact.sampleLimit')"
        :aria-label="t('setting.classification.impact.sampleLimit')"
        min="1"
        max="200"
        step="1"
        inputmode="numeric"
        density="compact"
        hide-details="auto"
        :disabled="disabled || loading"
      />
      <VTextField
        v-model="exampleLimit"
        type="number"
        :label="t('setting.classification.impact.exampleLimit')"
        :aria-label="t('setting.classification.impact.exampleLimit')"
        min="0"
        max="50"
        step="1"
        inputmode="numeric"
        density="compact"
        hide-details="auto"
        :disabled="disabled || loading"
      />
      <VBtn
        type="submit"
        color="primary"
        variant="tonal"
        prepend-icon="mdi-chart-box-outline"
        class="classification-impact-analyze"
        :loading="loading"
        :disabled="disabled || loading"
        :aria-label="t('setting.classification.impact.analyzeAria')"
        @click.prevent="requestAnalysis"
      >
        {{ t('setting.classification.impact.analyze') }}
      </VBtn>
    </form>

    <p :id="scopeDescriptionId" class="classification-impact-scope">
      {{ t('setting.classification.impact.scope') }}
    </p>

    <p v-if="loading" class="classification-impact-status" role="status" aria-live="polite">
      {{ t('setting.classification.impact.loading') }}
    </p>

    <div v-if="analysis" class="classification-impact-result">
      <div class="classification-impact-meta" :aria-label="t('setting.classification.impact.metadataAria')">
        <span>{{ t('setting.classification.impact.baselineRevision', { revision: analysis.baseline_revision }) }}</span>
        <VIcon icon="mdi-arrow-right" size="small" aria-hidden="true" />
        <span>{{
          t('setting.classification.impact.candidateRevision', { revision: analysis.candidate_revision })
        }}</span>
        <span class="classification-impact-time">{{
          t('setting.classification.impact.sampledAt', { time: formatSampledAt(analysis.sampled_at) })
        }}</span>
      </div>

      <section aria-labelledby="classification-impact-overview-title">
        <h3 id="classification-impact-overview-title">{{ t('setting.classification.impact.overviewTitle') }}</h3>
        <dl class="classification-impact-metrics">
          <div
            v-for="metric in overviewMetrics"
            :key="metric.key"
            class="classification-impact-metric"
            :data-testid="`impact-metric-${metric.key}`"
          >
            <dt>
              {{ metric.label }}
            </dt>
            <dd>{{ metric.value }}</dd>
          </div>
        </dl>
        <p v-if="analysis.truncated" class="classification-impact-truncated" role="note">
          {{ t('setting.classification.impact.truncated') }}
        </p>
      </section>

      <section aria-labelledby="classification-impact-change-types-title">
        <h3 id="classification-impact-change-types-title">{{ t('setting.classification.impact.changeTypesTitle') }}</h3>
        <dl class="classification-impact-metrics classification-impact-metrics--changes">
          <div
            v-for="metric in changeTypeMetrics"
            :key="metric.key"
            class="classification-impact-metric"
            :data-testid="`impact-metric-${metric.key}`"
          >
            <dt>
              {{ metric.label }}
            </dt>
            <dd>{{ metric.value }}</dd>
          </div>
        </dl>
      </section>

      <section
        class="classification-impact-category-comparison"
        aria-labelledby="classification-impact-categories-title"
      >
        <h3 id="classification-impact-categories-title">{{ t('setting.classification.impact.categoriesTitle') }}</h3>
        <div class="classification-impact-category-columns">
          <div :aria-label="t('setting.classification.impact.previousCategoriesAria')">
            <h4>{{ t('setting.classification.impact.previous') }}</h4>
            <dl v-if="sortedCategoryCounts(analysis.previous_categories).length" class="classification-impact-counts">
              <div v-for="[categoryId, count] in sortedCategoryCounts(analysis.previous_categories)" :key="categoryId">
                <dt>{{ categoryLabel(categoryId) }}</dt>
                <dd>{{ count }}</dd>
              </div>
            </dl>
            <p v-else class="classification-impact-empty">
              {{ t('setting.classification.impact.emptyCategoryCounts') }}
            </p>
          </div>
          <div :aria-label="t('setting.classification.impact.candidateCategoriesAria')">
            <h4>{{ t('setting.classification.impact.candidate') }}</h4>
            <dl v-if="sortedCategoryCounts(analysis.candidate_categories).length" class="classification-impact-counts">
              <div v-for="[categoryId, count] in sortedCategoryCounts(analysis.candidate_categories)" :key="categoryId">
                <dt>{{ categoryLabel(categoryId) }}</dt>
                <dd>{{ count }}</dd>
              </div>
            </dl>
            <p v-else class="classification-impact-empty">
              {{ t('setting.classification.impact.emptyCategoryCounts') }}
            </p>
          </div>
        </div>
      </section>

      <section aria-labelledby="classification-impact-groups-title">
        <h3 id="classification-impact-groups-title">{{ t('setting.classification.impact.groupsTitle') }}</h3>
        <div
          v-if="analysis.groups.length"
          class="classification-impact-table-wrap"
          role="region"
          :aria-label="t('setting.classification.impact.groupsAria')"
          tabindex="0"
        >
          <table>
            <thead>
              <tr>
                <th scope="col">{{ t('setting.classification.impact.columns.mediaType') }}</th>
                <th scope="col">{{ t('setting.classification.impact.columns.source') }}</th>
                <th scope="col">{{ t('setting.classification.impact.columns.sample') }}</th>
                <th scope="col">{{ t('setting.classification.impact.columns.changed') }}</th>
                <th scope="col">{{ t('setting.classification.impact.columns.degraded') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="group in analysis.groups" :key="`${group.media_type}:${group.media_source}`">
                <th scope="row">{{ group.media_type }}</th>
                <td>
                  {{ sourceDisplayName(group.media_source) }}
                </td>
                <td>{{ group.sampled }}</td>
                <td>{{ group.changed }}</td>
                <td>{{ group.degraded }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-else class="classification-impact-empty">{{ t('setting.classification.impact.emptyGroups') }}</p>
      </section>

      <section aria-labelledby="classification-impact-examples-title">
        <div class="classification-impact-section-head">
          <h3 id="classification-impact-examples-title">{{ t('setting.classification.impact.examplesTitle') }}</h3>
          <span>{{
            t('setting.classification.impact.exampleSummary', {
              returned: analysis.changes.length,
              changed: analysis.changed_count,
            })
          }}</span>
        </div>
        <ol
          v-if="analysis.changes.length"
          class="classification-impact-changes"
          :aria-label="t('setting.classification.impact.examplesAria')"
        >
          <li
            v-for="(change, index) in analysis.changes"
            :key="`${change.identity.media_source}:${change.identity.media_id}`"
          >
            <article
              :aria-label="
                t('setting.classification.impact.exampleAria', {
                  index: index + 1,
                  title: change.title || change.identity.media_id,
                })
              "
            >
              <header class="classification-impact-change-head">
                <div>
                  <strong>{{ change.title || t('setting.classification.impact.untitledMedia') }}</strong>
                  <span>{{ change.media_type }}</span>
                </div>
                <span>{{ sourceDisplayName(change.identity.media_source) }}</span>
              </header>

              <ul
                class="classification-impact-fields"
                :aria-label="t('setting.classification.impact.changedFieldsAria')"
              >
                <li v-for="field in change.changed_fields" :key="field">{{ changedFieldLabel(field) }}</li>
              </ul>

              <div class="classification-impact-result-comparison">
                <section :aria-label="t('setting.classification.impact.previousResultAria', { index: index + 1 })">
                  <h4>{{ t('setting.classification.impact.previous') }}</h4>
                  <dl>
                    <div>
                      <dt>{{ t('setting.classification.impact.resultFields.category') }}</dt>
                      <dd>
                        {{ resultCategory(change.previous) }}
                      </dd>
                    </div>
                    <div>
                      <dt>{{ t('setting.classification.impact.resultFields.path') }}</dt>
                      <dd>{{ resultPath(change.previous) }}</dd>
                    </div>
                    <div>
                      <dt>{{ t('setting.classification.impact.resultFields.rule') }}</dt>
                      <dd>
                        {{ resultRule(change.previous) }}
                      </dd>
                    </div>
                    <div>
                      <dt>{{ t('setting.classification.impact.resultFields.source') }}</dt>
                      <dd>
                        {{ resultSource(change.previous) }}
                      </dd>
                    </div>
                    <div>
                      <dt>{{ t('setting.classification.impact.resultFields.state') }}</dt>
                      <dd>{{ resultState(change.previous) }}</dd>
                    </div>
                  </dl>
                </section>
                <section :aria-label="t('setting.classification.impact.candidateResultAria', { index: index + 1 })">
                  <h4>{{ t('setting.classification.impact.candidate') }}</h4>
                  <dl>
                    <div>
                      <dt>{{ t('setting.classification.impact.resultFields.category') }}</dt>
                      <dd>
                        {{ resultCategory(change.candidate) }}
                      </dd>
                    </div>
                    <div>
                      <dt>{{ t('setting.classification.impact.resultFields.path') }}</dt>
                      <dd>{{ resultPath(change.candidate) }}</dd>
                    </div>
                    <div>
                      <dt>{{ t('setting.classification.impact.resultFields.rule') }}</dt>
                      <dd>
                        {{ resultRule(change.candidate) }}
                      </dd>
                    </div>
                    <div>
                      <dt>{{ t('setting.classification.impact.resultFields.source') }}</dt>
                      <dd>
                        {{ resultSource(change.candidate) }}
                      </dd>
                    </div>
                    <div>
                      <dt>{{ t('setting.classification.impact.resultFields.state') }}</dt>
                      <dd>{{ resultState(change.candidate) }}</dd>
                    </div>
                  </dl>
                </section>
              </div>
            </article>
          </li>
        </ol>
        <p v-else class="classification-impact-empty">{{ t('setting.classification.impact.emptyExamples') }}</p>
      </section>

      <section v-if="analysis.warnings.length" aria-labelledby="classification-impact-warnings-title">
        <h3 id="classification-impact-warnings-title">{{ t('setting.classification.impact.warningsTitle') }}</h3>
        <div class="classification-impact-warnings" role="alert">
          <VIcon icon="mdi-alert-outline" aria-hidden="true" />
          <ul>
            <li v-for="warning in analysis.warnings" :key="warning">{{ warning }}</li>
          </ul>
        </div>
      </section>
    </div>

    <div v-else-if="!loading" class="classification-impact-empty-state" role="status">
      <VIcon icon="mdi-chart-box-outline" size="30" aria-hidden="true" />
      <span>{{ t('setting.classification.impact.emptyAnalysis') }}</span>
    </div>
  </section>
</template>

<style scoped>
.classification-impact-panel,
.classification-impact-result {
  display: grid;
  gap: 16px;
  min-width: 0;
}

.classification-impact-header,
.classification-impact-meta,
.classification-impact-section-head,
.classification-impact-change-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-width: 0;
}

.classification-impact-header h2,
.classification-impact-result h3,
.classification-impact-result h4 {
  margin: 0;
}

.classification-impact-header h2 {
  font-size: 1rem;
}

.classification-impact-header p,
.classification-impact-scope,
.classification-impact-time,
.classification-impact-section-head span,
.classification-impact-empty {
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 0.8125rem;
}

.classification-impact-header p {
  margin: 4px 0 0;
}

.classification-impact-header :deep(.v-chip) {
  max-width: 100%;
}

.classification-impact-controls {
  display: grid;
  grid-template-columns: minmax(130px, 180px) minmax(150px, 190px) auto;
  align-items: start;
  gap: 10px;
}

.classification-impact-controls :deep(.v-btn) {
  min-height: 40px;
}

.classification-impact-analyze {
  justify-self: start;
  inline-size: fit-content;
  max-inline-size: 100%;
}

.classification-impact-scope,
.classification-impact-status,
.classification-impact-empty {
  margin: 0;
}

.classification-impact-status {
  color: rgb(var(--v-theme-primary));
  font-size: 0.875rem;
}

.classification-impact-result > section {
  display: grid;
  gap: 10px;
  min-width: 0;
  padding-block-start: 14px;
  border-top: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}

.classification-impact-result h3 {
  font-size: 0.9375rem;
}

.classification-impact-result h4 {
  font-size: 0.8125rem;
}

.classification-impact-meta {
  justify-content: flex-start;
  flex-wrap: wrap;
  font-size: 0.8125rem;
}

.classification-impact-time {
  margin-inline-start: auto;
}

.classification-impact-metrics {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(112px, 1fr));
  gap: 8px;
  margin: 0;
}

.classification-impact-metrics--changes {
  grid-template-columns: repeat(auto-fit, minmax(128px, 1fr));
}

.classification-impact-metric {
  display: grid;
  gap: 6px;
  min-width: 0;
  padding: 9px 10px;
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 6px;
}

.classification-impact-metric dt {
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 0.75rem;
}

.classification-impact-metric dd {
  margin: 0;
  font-size: 1.125rem;
  font-weight: 600;
}

.classification-impact-truncated {
  margin: 0;
  padding: 8px 10px;
  border-inline-start: 3px solid rgb(var(--v-theme-warning));
  background: rgba(var(--v-theme-warning), 0.08);
  font-size: 0.8125rem;
}

.classification-impact-category-columns,
.classification-impact-result-comparison {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  min-width: 0;
}

.classification-impact-category-columns > div,
.classification-impact-result-comparison > section {
  min-width: 0;
  padding: 10px;
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 6px;
}

.classification-impact-counts,
.classification-impact-result-comparison dl {
  display: grid;
  gap: 6px;
  margin: 8px 0 0;
}

.classification-impact-counts > div,
.classification-impact-result-comparison dl > div {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  min-width: 0;
}

.classification-impact-counts dt,
.classification-impact-result-comparison dt {
  min-width: 0;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 0.75rem;
}

.classification-impact-counts dd,
.classification-impact-result-comparison dd {
  min-width: 0;
  margin: 0;
  overflow-wrap: anywhere;
  text-align: end;
  font-size: 0.8125rem;
}

.classification-impact-table-wrap {
  max-width: 100%;
  overflow-x: auto;
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 6px;
}

.classification-impact-table-wrap:focus-visible {
  outline: 2px solid rgb(var(--v-theme-primary));
  outline-offset: 2px;
}

.classification-impact-table-wrap table {
  width: 100%;
  min-width: 520px;
  border-collapse: collapse;
}

.classification-impact-table-wrap th,
.classification-impact-table-wrap td {
  padding: 9px 10px;
  border-bottom: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  text-align: start;
  font-size: 0.8125rem;
}

.classification-impact-table-wrap tbody tr:last-child th,
.classification-impact-table-wrap tbody tr:last-child td {
  border-bottom: 0;
}

.classification-impact-table-wrap thead th {
  background: rgba(var(--v-theme-on-surface), 0.04);
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-weight: 600;
}

.classification-impact-changes {
  display: grid;
  gap: 10px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.classification-impact-changes article {
  display: grid;
  gap: 10px;
  min-width: 0;
  padding: 11px;
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 6px;
}

.classification-impact-change-head > div {
  display: flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
}

.classification-impact-change-head span {
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 0.75rem;
}

.classification-impact-change-head code {
  overflow-wrap: anywhere;
  text-align: end;
}

.classification-impact-fields {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.classification-impact-fields li {
  padding: 3px 7px;
  border-radius: 4px;
  background: rgba(var(--v-theme-primary), 0.1);
  color: rgb(var(--v-theme-primary));
  font-size: 0.75rem;
}

.classification-impact-warnings {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 10px;
  border-inline-start: 3px solid rgb(var(--v-theme-warning));
  background: rgba(var(--v-theme-warning), 0.08);
}

.classification-impact-warnings ul {
  display: grid;
  gap: 4px;
  margin: 0;
  padding-inline-start: 18px;
  font-size: 0.8125rem;
}

.classification-impact-empty-state {
  display: grid;
  place-items: center;
  gap: 6px;
  min-height: 104px;
  padding: 12px;
  border: 1px dashed rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 6px;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  text-align: center;
  font-size: 0.875rem;
}

@media (max-width: 980px) {
  .classification-impact-metrics,
  .classification-impact-metrics--changes {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (max-width: 640px) {
  .classification-impact-header,
  .classification-impact-section-head,
  .classification-impact-change-head {
    align-items: flex-start;
    flex-direction: column;
  }

  .classification-impact-controls,
  .classification-impact-category-columns,
  .classification-impact-result-comparison {
    grid-template-columns: minmax(0, 1fr);
  }

  .classification-impact-controls :deep(.v-btn) {
    inline-size: 100%;
  }

  .classification-impact-meta {
    align-items: flex-start;
  }

  .classification-impact-time {
    flex-basis: 100%;
    margin-inline-start: 0;
  }

  .classification-impact-metrics,
  .classification-impact-metrics--changes {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .classification-impact-change-head code {
    text-align: start;
  }
}

@media (max-width: 390px) {
  .classification-impact-metrics,
  .classification-impact-metrics--changes {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
