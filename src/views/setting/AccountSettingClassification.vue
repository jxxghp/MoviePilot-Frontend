<script lang="ts" setup>
import api from '@/api'
import type { TransferDirectoryConf } from '@/api/types'
import type {
  ClassificationCategory,
  ClassificationEnrichmentMode,
  ClassificationEvaluation,
  ClassificationFieldDefinition,
  ClassificationImpactAnalysis,
  ClassificationMediaType,
  ClassificationPolicy,
  ClassificationPolicyHistory,
  ClassificationPreviewInput,
  ClassificationRule,
  ClassificationValidationResult,
} from '@/api/mediaClassificationTypes'
import ClassificationCategoryEditor from '@/components/classification/ClassificationCategoryEditor.vue'
import ClassificationImpactPanel from '@/components/classification/ClassificationImpactPanel.vue'
import ClassificationPolicyControlPanel from '@/components/classification/ClassificationPolicyControlPanel.vue'
import ClassificationPreviewPanel from '@/components/classification/ClassificationPreviewPanel.vue'
import ClassificationRuleEditor from '@/components/classification/ClassificationRuleEditor.vue'
import { useMediaClassification } from '@/composables/useMediaClassification'
import { cloneDeep, isEqual } from 'lodash-es'
import { useToast } from 'vue-toastification'

/** 事实预览组件提交的策略模式与完整输入。 */
interface ClassificationPreviewRequestEvent {
  input: ClassificationPreviewInput
  policyMode: 'draft' | 'active'
}

/** 影响分析组件提交的服务端有界参数。 */
interface ClassificationImpactRequestEvent {
  sampleLimit: number
  exampleLimit: number
}

const props = withDefaults(
  defineProps<{
    active?: boolean
  }>(),
  { active: true },
)

const { t } = useI18n()
const toast = useToast()
const initialized = ref(false)
const initializing = ref(false)
const loadError = ref(false)
const directoryReferencesUnavailable = ref(false)
const directories = ref<TransferDirectoryConf[]>([])
const analysisTab = ref<'preview' | 'impact' | 'publish'>('preview')
const validatedDraftSnapshot = ref<ClassificationPolicy | null>(null)
const analyzedDraftSnapshot = ref<ClassificationPolicy | null>(null)
const lastImpactOptions = ref<ClassificationImpactRequestEvent>({ sampleLimit: 100, exampleLimit: 20 })
const mediaTypes: ClassificationMediaType[] = ['电影', '电视剧', '音乐']

const {
  activeRevision,
  analyzingImpact,
  conflict,
  draftPolicy,
  fieldCatalog,
  history,
  impactResult,
  isDirty,
  loadingHistory,
  loadingFields,
  loadingPolicy,
  previewResult,
  previewing,
  publishing,
  rollingBack,
  validationResult,
  validating,
  analyzeImpact,
  initialize,
  loadHistory,
  preview,
  publishDraft,
  refreshPolicy,
  resetDraft,
  rollback,
  validateDraft,
} = useMediaClassification()

/** 服务端校验结果是否仍对应当前未发布草稿。 */
const validationIsCurrent = computed(
  () =>
    validationResult.value?.valid === true &&
    !!draftPolicy.value &&
    !!validatedDraftSnapshot.value &&
    isEqual(draftPolicy.value, validatedDraftSnapshot.value),
)

/** 影响分析是否仍对应当前草稿和当前活动 revision。 */
const impactIsCurrent = computed(
  () =>
    !!impactResult.value &&
    impactResult.value.baseline_revision === activeRevision.value &&
    !!draftPolicy.value &&
    !!analyzedDraftSnapshot.value &&
    isEqual(draftPolicy.value, analyzedDraftSnapshot.value),
)

/** 汇总规则和来源兜底引用；全局兜底由分类树按媒体类型单独判断。 */
const referencedCategoryIds = computed(() => {
  const policy = draftPolicy.value
  if (!policy) return []

  const references = new Set<string>()
  for (const rule of policy.rules) {
    if (rule.target.category_id) references.add(rule.target.category_id)
  }
  for (const sourceFallbacks of Object.values(policy.source_fallbacks)) {
    for (const categoryId of Object.values(sourceFallbacks)) {
      if (categoryId) references.add(categoryId)
    }
  }
  return [...references]
})

/** 按稳定分类 ID 汇总目录名称，供分类树展示并执行引用保护。 */
const directoryCategoryReferences = computed(() => {
  const references = new Map<string, Set<string>>()
  for (const directory of directories.value) {
    const categoryId = directory.media_category_id?.trim()
    if (!categoryId) continue
    const names = references.get(categoryId) ?? new Set<string>()
    names.add(directory.name)
    references.set(categoryId, names)
  }
  return [...references.entries()].map(([categoryId, names]) => ({
    categoryId,
    directoryNames: [...names].sort((left, right) => left.localeCompare(right)),
  }))
})

/** 从动态字段支持表汇总当前可配置的内置和插件来源。 */
const availableSources = computed(() => {
  const sources = new Set<string>()
  for (const field of fieldCatalog.value?.fields ?? []) {
    for (const source of Object.keys(field.source_support)) sources.add(source)
  }
  for (const source of Object.keys(draftPolicy.value?.source_fallbacks ?? {})) sources.add(source)
  return [...sources].sort((left, right) => left.localeCompare(right))
})

/** 将只读 API 字段目录复制为编辑器输入，避免组件边界泄漏深层响应式只读类型。 */
const editorFields = computed<ClassificationFieldDefinition[]>(() =>
  (fieldCatalog.value?.fields ?? []).map(field => ({
    ...field,
    media_types: [...field.media_types],
    operators: [...field.operators],
    options: field.options.map(option => ({ ...option })),
    source_support: { ...field.source_support },
  })),
)

/** 将 JSON API 深层只读值复制并恢复为组件 DTO，副本不会回写 composable 状态。 */
function mutableApiSnapshot<T>(value: unknown): T {
  return cloneDeep(value) as T
}

/** 将深层只读预览响应复制为展示组件无法回写服务状态的隔离快照。 */
const previewResultSnapshot = computed<ClassificationEvaluation | null>(() =>
  previewResult.value ? mutableApiSnapshot<ClassificationEvaluation>(previewResult.value) : null,
)

/** 将深层只读影响响应复制为展示组件输入。 */
const impactResultSnapshot = computed<ClassificationImpactAnalysis | null>(() =>
  impactResult.value ? mutableApiSnapshot<ClassificationImpactAnalysis>(impactResult.value) : null,
)

/** 将深层只读校验响应复制为发布控制组件输入。 */
const validationResultSnapshot = computed<ClassificationValidationResult | null>(() =>
  validationResult.value ? mutableApiSnapshot<ClassificationValidationResult>(validationResult.value) : null,
)

/** 将深层只读历史快照复制为发布控制组件输入。 */
const historySnapshot = computed<ClassificationPolicyHistory | null>(() =>
  history.value ? mutableApiSnapshot<ClassificationPolicyHistory>(history.value) : null,
)

/** 返回指定媒体类型可作为来源兜底的启用分类。 */
function fallbackCategoryOptions(mediaType: ClassificationMediaType) {
  return (draftPolicy.value?.categories ?? [])
    .filter(category => category.enabled && category.media_type === mediaType)
    .map(category => ({
      title: `${category.name} · ${category.path.join(' / ')} · ${category.id}`,
      value: category.id,
    }))
}

/** 将来源兜底标签传给 VSelect 的真实 combobox 激活元素。 */
function sourceFallbackMenuProps(source: string, mediaType: ClassificationMediaType) {
  return {
    activatorProps: {
      'aria-label': t('setting.classification.sourceFallbackFor', { source, mediaType }),
    },
  }
}

/** 标签首次激活时加载策略与动态字段，失败后允许用户显式重试。 */
async function ensureInitialized(force = false): Promise<void> {
  if (!props.active || initializing.value || (initialized.value && !force)) return
  initializing.value = true
  loadError.value = false
  try {
    await Promise.all([initialize(), loadDirectoryReferences()])
    initialized.value = true
  } catch (error) {
    console.error(error)
    loadError.value = true
  } finally {
    initializing.value = false
  }
}

/** 读取目录配置中的稳定分类引用；失败时保留策略编辑但明确提示保护信息不完整。 */
async function loadDirectoryReferences(): Promise<void> {
  directoryReferencesUnavailable.value = false
  try {
    const result = await api.get<{ value?: TransferDirectoryConf[] }>('system/setting/public/Directories', {
      feedback: 'silent',
    })
    directories.value = result.value ?? []
  } catch (error) {
    console.error(error)
    directories.value = []
    directoryReferencesUnavailable.value = true
  }
}

/** 使用不可变数组替换分类草稿，避免子组件原地污染活动策略。 */
function updateCategories(categories: ClassificationCategory[]): void {
  if (!draftPolicy.value) return
  draftPolicy.value = { ...draftPolicy.value, categories }
}

/** 更新三个媒体类型的稳定兜底分类 ID。 */
function updateFallbacks(fallbacks: Partial<Record<ClassificationMediaType, string>>): void {
  if (!draftPolicy.value) return
  draftPolicy.value = { ...draftPolicy.value, fallbacks }
}

/** 切换分类前的缺失事实补充策略，空值不会覆盖当前草稿。 */
function updateEnrichmentMode(mode: ClassificationEnrichmentMode | null): void {
  if (!draftPolicy.value || !mode) return
  draftPolicy.value = { ...draftPolicy.value, enrichment_mode: mode }
}

/** 使用规则编辑器返回的优先级顺序替换草稿规则。 */
function updateRules(rules: ClassificationRule[]): void {
  if (!draftPolicy.value) return
  draftPolicy.value = { ...draftPolicy.value, rules }
}

/** 更新单个来源和媒体类型的稳定兜底引用，空值会清理无用来源节点。 */
function updateSourceFallback(source: string, mediaType: ClassificationMediaType, categoryId: string | null): void {
  if (!draftPolicy.value) return
  const sourceFallbacks = Object.fromEntries(
    Object.entries(draftPolicy.value.source_fallbacks).map(([sourceId, values]) => [sourceId, { ...values }]),
  )
  const sourceValues = { ...(sourceFallbacks[source] ?? {}) }
  if (categoryId) sourceValues[mediaType] = categoryId
  else delete sourceValues[mediaType]
  if (Object.keys(sourceValues).length) sourceFallbacks[source] = sourceValues
  else delete sourceFallbacks[source]
  draftPolicy.value = { ...draftPolicy.value, source_fallbacks: sourceFallbacks }
}

/** 通过服务端真实字段目录校验当前草稿，并保留结构化问题供页面展示。 */
async function validateCurrentDraft(): Promise<void> {
  if (!draftPolicy.value) return
  const requestedPolicy = cloneDeep(draftPolicy.value)
  try {
    const result = await validateDraft(requestedPolicy)
    validatedDraftSnapshot.value = result.valid ? requestedPolicy : null
    if (result.valid) toast.success(t('setting.classification.validationPassed'))
    else toast.error(t('setting.classification.validationFailed', { count: result.issues.length }))
  } catch (error) {
    console.error(error)
    validatedDraftSnapshot.value = null
    toast.error(t('setting.classification.validationRequestFailed'))
  }
}

/** 使用草稿或活动策略执行显式事实预览，并保留完整命中解释。 */
async function previewFacts(request: ClassificationPreviewRequestEvent): Promise<void> {
  try {
    await preview(request.input, { policy: request.policyMode === 'active' ? null : undefined })
  } catch (error) {
    console.error(error)
    toast.error(t('setting.classification.previewFailed'))
  }
}

/** 分析当前草稿对有界近期历史样本的影响，并冻结本次分析对应的草稿。 */
async function analyzeCurrentDraft(options: ClassificationImpactRequestEvent = lastImpactOptions.value): Promise<void> {
  if (!draftPolicy.value) return
  lastImpactOptions.value = { ...options }
  const requestedPolicy = cloneDeep(draftPolicy.value)
  try {
    await analyzeImpact({
      policy: requestedPolicy,
      sampleLimit: options.sampleLimit,
      exampleLimit: options.exampleLimit,
    })
    analyzedDraftSnapshot.value = requestedPolicy
    analysisTab.value = 'impact'
  } catch (error) {
    console.error(error)
    analyzedDraftSnapshot.value = null
    toast.error(t('setting.classification.impactFailed'))
  }
}

/** 发布已经通过当前校验、影响分析和人工审阅门禁的草稿。 */
async function publishCurrentDraft(): Promise<void> {
  if (!validationIsCurrent.value || !impactIsCurrent.value) return
  try {
    const policy = await publishDraft()
    validatedDraftSnapshot.value = null
    analyzedDraftSnapshot.value = null
    await loadHistory()
    toast.success(t('setting.classification.publishSucceeded', { revision: policy.revision }))
  } catch (error) {
    console.error(error)
    toast.error(t('setting.classification.publishFailed'))
  }
}

/** 放弃冲突中的本地草稿，重新加载并使用服务端当前活动策略。 */
async function reloadRemotePolicy(): Promise<void> {
  try {
    await refreshPolicy()
    resetDraft()
    validatedDraftSnapshot.value = null
    analyzedDraftSnapshot.value = null
    await loadHistory()
    toast.info(t('setting.classification.remoteReloaded'))
  } catch (error) {
    console.error(error)
    toast.error(t('setting.classification.remoteReloadFailed'))
  }
}

/** 保留本地草稿，先刷新活动 revision，再顺序执行最新影响分析。 */
async function keepDraftAndReanalyze(): Promise<void> {
  try {
    await refreshPolicy()
    validatedDraftSnapshot.value = null
    await analyzeCurrentDraft(lastImpactOptions.value)
  } catch (error) {
    console.error(error)
  }
}

/** 按需读取有界策略历史。 */
async function loadPolicyHistory(): Promise<void> {
  try {
    await loadHistory()
  } catch (error) {
    console.error(error)
    toast.error(t('setting.classification.historyFailed'))
  }
}

/** 将历史内容通过 CAS 发布为新 revision，并刷新历史列表。 */
async function rollbackPolicy(revision: number): Promise<void> {
  try {
    const result = await rollback(revision)
    validatedDraftSnapshot.value = null
    analyzedDraftSnapshot.value = null
    await loadHistory()
    toast.success(
      t('setting.classification.rollbackSucceeded', {
        source: result.restored_from_revision,
        revision: result.policy.revision,
      }),
    )
  } catch (error) {
    console.error(error)
    toast.error(t('setting.classification.rollbackFailed'))
  }
}

/** 放弃全部未保存编辑并恢复当前活动 revision。 */
function discardDraft(): void {
  resetDraft()
  validatedDraftSnapshot.value = null
  analyzedDraftSnapshot.value = null
  toast.info(t('setting.classification.draftReset'))
}

watch(
  () => props.active,
  active => {
    if (active) void ensureInitialized()
  },
  { immediate: true },
)

watch(analysisTab, tab => {
  if (tab === 'publish' && initialized.value && !history.value && !loadingHistory.value) {
    void loadPolicyHistory()
  }
})
</script>

<template>
  <VCard class="classification-settings">
    <VCardItem>
      <template #prepend>
        <VAvatar color="primary" variant="tonal" size="40">
          <VIcon icon="mdi-file-tree" />
        </VAvatar>
      </template>
      <VCardTitle>{{ t('setting.classification.title') }}</VCardTitle>
      <VCardSubtitle>{{ t('setting.classification.description') }}</VCardSubtitle>
      <template #append>
        <div class="classification-settings__status">
          <VChip size="small" variant="tonal" prepend-icon="mdi-source-branch">
            {{ t('setting.classification.revision', { revision: activeRevision }) }}
          </VChip>
          <VChip v-if="isDirty" size="small" color="warning" variant="tonal">
            {{ t('setting.classification.unsaved') }}
          </VChip>
        </div>
      </template>
    </VCardItem>

    <VDivider />

    <VCardText v-if="loadError">
      <VAlert type="error" variant="tonal" :title="t('setting.classification.loadFailed')">
        <template #append>
          <VBtn variant="text" prepend-icon="mdi-refresh" @click="ensureInitialized(true)">
            {{ t('common.retry') }}
          </VBtn>
        </template>
      </VAlert>
    </VCardText>

    <VCardText v-else-if="initializing || loadingPolicy || loadingFields || !draftPolicy || !fieldCatalog">
      <div class="classification-settings__loading" role="status" :aria-label="t('common.loading')">
        <VProgressCircular color="primary" indeterminate />
        <span>{{ t('setting.classification.loading') }}</span>
      </div>
    </VCardText>

    <template v-else>
      <VCardText class="classification-settings__workspace">
        <VAlert
          v-if="directoryReferencesUnavailable"
          type="warning"
          variant="tonal"
          density="compact"
          class="mb-4"
          :title="t('setting.classification.directoryReferencesUnavailable')"
        >
          {{ t('setting.classification.directoryReferencesUnavailableHint') }}
        </VAlert>

        <section class="classification-settings__enrichment" aria-labelledby="classification-enrichment-title">
          <div class="classification-settings__section-heading">
            <div>
              <h3 id="classification-enrichment-title">{{ t('setting.classification.enrichmentTitle') }}</h3>
              <p>{{ t('setting.classification.enrichmentHint') }}</p>
            </div>
          </div>
          <div class="classification-settings__enrichment-control">
            <span id="classification-enrichment-mode-label">{{ t('setting.classification.enrichmentModeLabel') }}</span>
            <VBtnToggle
              :model-value="draftPolicy.enrichment_mode"
              mandatory
              color="primary"
              variant="outlined"
              aria-labelledby="classification-enrichment-mode-label"
              @update:model-value="updateEnrichmentMode"
            >
              <VBtn value="primary_only">{{ t('setting.classification.enrichmentPrimaryOnly') }}</VBtn>
              <VBtn value="enrich_missing">{{ t('setting.classification.enrichmentMissing') }}</VBtn>
            </VBtnToggle>
          </div>
        </section>

        <VRow align="start">
          <VCol cols="12" lg="4">
            <ClassificationCategoryEditor
              :categories="draftPolicy.categories"
              :fallbacks="draftPolicy.fallbacks"
              :referenced-category-ids="referencedCategoryIds"
              :directory-references="directoryCategoryReferences"
              :max-depth="fieldCatalog.limits.max_category_depth"
              @update:categories="updateCategories"
              @update:fallbacks="updateFallbacks"
            />
          </VCol>
          <VCol cols="12" lg="8">
            <ClassificationRuleEditor
              :rules="draftPolicy.rules"
              :categories="draftPolicy.categories"
              :fields="editorFields"
              :max-rules="fieldCatalog.limits.max_rules"
              :max-condition-depth="fieldCatalog.limits.max_condition_depth"
              @update:rules="updateRules"
            />
          </VCol>
        </VRow>

        <section v-if="availableSources.length" class="classification-settings__source-fallbacks">
          <div class="classification-settings__section-heading">
            <div>
              <h3>{{ t('setting.classification.sourceFallbacks') }}</h3>
              <p>{{ t('setting.classification.sourceFallbacksHint') }}</p>
            </div>
            <VChip size="small" variant="tonal">{{ availableSources.length }}</VChip>
          </div>
          <div class="classification-settings__source-table">
            <VTable density="compact">
              <thead>
                <tr>
                  <th>{{ t('setting.classification.source') }}</th>
                  <th v-for="mediaType in mediaTypes" :key="mediaType">{{ mediaType }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="source in availableSources" :key="source">
                  <td>
                    <code>{{ source }}</code>
                  </td>
                  <td v-for="mediaType in mediaTypes" :key="mediaType">
                    <VSelect
                      :model-value="draftPolicy.source_fallbacks[source]?.[mediaType] ?? null"
                      :items="fallbackCategoryOptions(mediaType)"
                      :aria-label="t('setting.classification.sourceFallbackFor', { source, mediaType })"
                      :menu-props="sourceFallbackMenuProps(source, mediaType)"
                      density="compact"
                      variant="outlined"
                      hide-details
                      clearable
                      @update:model-value="updateSourceFallback(source, mediaType, $event)"
                    />
                  </td>
                </tr>
              </tbody>
            </VTable>
          </div>
        </section>

        <section class="classification-settings__analysis" aria-labelledby="classification-analysis-title">
          <div class="classification-settings__section-heading">
            <div>
              <h3 id="classification-analysis-title">{{ t('setting.classification.analysisTitle') }}</h3>
              <p>{{ t('setting.classification.analysisHint') }}</p>
            </div>
          </div>

          <VTabs v-model="analysisTab" color="primary" show-arrows>
            <VTab value="preview" prepend-icon="mdi-play-box-outline">
              {{ t('setting.classification.previewTab') }}
            </VTab>
            <VTab value="impact" prepend-icon="mdi-chart-box-outline">
              {{ t('setting.classification.impactTab') }}
            </VTab>
            <VTab value="publish" prepend-icon="mdi-source-branch-sync">
              {{ t('setting.classification.publishTab') }}
            </VTab>
          </VTabs>

          <VWindow v-model="analysisTab" class="classification-settings__analysis-window">
            <VWindowItem value="preview">
              <ClassificationPreviewPanel
                :fields="editorFields"
                :categories="draftPolicy.categories"
                :result="previewResultSnapshot"
                :loading="previewing"
                @request-preview="previewFacts"
              />
            </VWindowItem>
            <VWindowItem value="impact">
              <ClassificationImpactPanel
                :analysis="impactResultSnapshot"
                :loading="analyzingImpact"
                :disabled="publishing || rollingBack"
                @analyze="analyzeCurrentDraft"
              />
            </VWindowItem>
            <VWindowItem value="publish">
              <ClassificationPolicyControlPanel
                :active-revision="activeRevision"
                :is-dirty="isDirty"
                :validation-result="validationResultSnapshot"
                :validation-is-current="validationIsCurrent"
                :impact-result="impactResultSnapshot"
                :impact-is-current="impactIsCurrent"
                :conflict="conflict"
                :history="historySnapshot"
                :validating="validating"
                :publishing="publishing"
                :refreshing="loadingPolicy"
                :loading-history="loadingHistory"
                :rolling-back="rollingBack"
                :analyzing-impact="analyzingImpact"
                @validate="validateCurrentDraft"
                @analyze="analyzeCurrentDraft()"
                @publish="publishCurrentDraft"
                @refresh="reloadRemotePolicy"
                @keep-draft="keepDraftAndReanalyze"
                @load-history="loadPolicyHistory"
                @rollback="rollbackPolicy"
              />
            </VWindowItem>
          </VWindow>
        </section>
      </VCardText>

      <VCardText v-if="validationResult?.issues.length" class="pt-0">
        <VAlert
          :type="validationResult.valid ? 'warning' : 'error'"
          variant="tonal"
          :title="t('setting.classification.validationIssues', { count: validationResult.issues.length })"
        >
          <ul class="classification-settings__issues">
            <li v-for="(issue, index) in validationResult.issues" :key="`${issue.code}-${index}`">
              <strong>{{ issue.code }}</strong>
              <span>{{ issue.message }}</span>
            </li>
          </ul>
        </VAlert>
      </VCardText>

      <VDivider />
      <VCardActions class="classification-settings__actions">
        <VBtn variant="text" prepend-icon="mdi-undo-variant" :disabled="!isDirty || validating" @click="discardDraft">
          {{ t('setting.classification.discardDraft') }}
        </VBtn>
        <VSpacer />
        <VBtn
          color="primary"
          variant="tonal"
          prepend-icon="mdi-check-decagram-outline"
          :loading="validating"
          @click="validateCurrentDraft"
        >
          {{ t('setting.classification.validateDraft') }}
        </VBtn>
      </VCardActions>
    </template>
  </VCard>
</template>

<style scoped>
.classification-settings {
  overflow: hidden;
}

.classification-settings__status {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 0.5rem;
}

.classification-settings__loading {
  display: flex;
  min-block-size: 18rem;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  color: rgba(var(--v-theme-on-surface), 0.68);
}

.classification-settings__workspace {
  padding-block: 1.25rem;
}

.classification-settings__enrichment {
  margin-block-end: 1.25rem;
  padding-block-end: 1.25rem;
  border-block-end: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}

.classification-settings__enrichment-control {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem;
}

.classification-settings__enrichment-control > span {
  min-inline-size: 6rem;
  font-weight: 600;
}

.classification-settings__source-fallbacks {
  border-block-start: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  margin-block-start: 1rem;
  padding-block-start: 1.25rem;
}

.classification-settings__analysis {
  border-block-start: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  margin-block-start: 1.5rem;
  padding-block-start: 1.25rem;
}

.classification-settings__analysis-window {
  margin-block-start: 0.75rem;
}

.classification-settings__analysis-window :deep(.v-window-item) {
  padding-block: 0.5rem;
}

.classification-settings__section-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  margin-block-end: 0.75rem;
}

.classification-settings__section-heading h3,
.classification-settings__section-heading p {
  margin: 0;
}

.classification-settings__section-heading h3 {
  font-size: 1rem;
  font-weight: 600;
}

.classification-settings__section-heading p {
  color: rgba(var(--v-theme-on-surface), 0.62);
  font-size: 0.8125rem;
  margin-block-start: 0.25rem;
}

.classification-settings__source-table {
  overflow-x: auto;
}

.classification-settings__source-table :deep(table) {
  min-inline-size: 48rem;
  table-layout: fixed;
}

.classification-settings__source-table :deep(th:first-child),
.classification-settings__source-table :deep(td:first-child) {
  inline-size: 13rem;
}

.classification-settings__issues {
  display: grid;
  gap: 0.4rem;
  margin: 0.75rem 0 0;
  padding-inline-start: 1.25rem;
}

.classification-settings__issues li {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.classification-settings__actions {
  min-block-size: 4rem;
  padding: 0.75rem 1.25rem;
}

@media (max-width: 599px) {
  .classification-settings :deep(.v-card-item__append) {
    align-self: flex-start;
  }

  .classification-settings__status {
    max-inline-size: 8rem;
  }

  .classification-settings__enrichment-control :deep(.v-btn-toggle) {
    display: grid;
    inline-size: 100%;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .classification-settings__enrichment-control :deep(.v-btn) {
    min-inline-size: 0;
  }

  .classification-settings__actions {
    align-items: stretch;
    flex-direction: column-reverse;
  }

  .classification-settings__actions :deep(.v-spacer) {
    display: none;
  }
}
</style>
