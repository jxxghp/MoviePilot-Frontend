<script setup lang="ts">
import type {
  ClassificationCategory,
  ClassificationEvaluation,
  ClassificationFactSource,
  ClassificationFactScalar,
  ClassificationFactValue,
  ClassificationFacts,
  ClassificationFieldDefinition,
  ClassificationMediaFacts,
  ClassificationMediaType,
  ClassificationMusicFacts,
  ClassificationPreviewInput,
  ClassificationSelection,
  ClassificationSourceSupport,
} from '@/api/mediaClassificationTypes'

defineOptions({ name: 'ClassificationPreviewPanel' })

/** 事实预览可选择的策略快照。 */
type ClassificationPreviewPolicyMode = 'draft' | 'active'

/** 事实预览组件的只读输入。 */
interface ClassificationPreviewPanelProps {
  fields: readonly ClassificationFieldDefinition[]
  categories: readonly ClassificationCategory[]
  result: ClassificationEvaluation | null
  loading: boolean
}

/** 向父层请求预览时提交的完整事实和策略模式。 */
interface ClassificationPreviewEvent {
  input: ClassificationPreviewInput
  policyMode: ClassificationPreviewPolicyMode
}

/** 动态字段在界面中的分组。 */
interface ClassificationPreviewFieldGroup {
  name: string
  fields: ClassificationFieldDefinition[]
}

/** 扩展字段在事实对象中的来源与来源内键名。 */
interface ClassificationExtensionPath {
  source: string
  key: string
}

const props = defineProps<ClassificationPreviewPanelProps>()

const emit = defineEmits<{
  'request-preview': [request: ClassificationPreviewEvent]
}>()

const { t } = useI18n()

const MEDIA_TYPES: ReadonlyArray<{ value: ClassificationMediaType; labelKey: string; icon: string }> = [
  { value: '电影', labelKey: 'setting.classification.preview.mediaTypes.movie', icon: 'mdi-movie-open-outline' },
  { value: '电视剧', labelKey: 'setting.classification.preview.mediaTypes.tv', icon: 'mdi-television-classic' },
  { value: '音乐', labelKey: 'setting.classification.preview.mediaTypes.music', icon: 'mdi-music-note-outline' },
]

const booleanItems = computed<ReadonlyArray<{ title: string; value: boolean | null }>>(() => [
  { title: t('setting.classification.preview.boolean.unset'), value: null },
  { title: t('setting.classification.preview.boolean.yes'), value: true },
  { title: t('setting.classification.preview.boolean.no'), value: false },
])

const previewMode = ref<ClassificationPreviewPolicyMode>('draft')
const mediaType = ref<ClassificationMediaType>('电影')
const mediaSource = ref('')
const mediaId = ref('')
const fieldValues = ref<Record<string, ClassificationFactValue | undefined>>({})
const validationMessage = ref('')
const validationErrorId = `classification-preview-error-${useId()}`

const editableFields = computed(() =>
  props.fields.filter(
    field =>
      field.id !== 'identity.media_source' &&
      field.id !== 'media.type' &&
      field.media_types.includes(mediaType.value) &&
      (field.id.startsWith('media.') || field.id.startsWith('music.') || field.id.startsWith('extensions.')),
  ),
)

const fieldGroups = computed<ClassificationPreviewFieldGroup[]>(() => {
  const groups = new Map<string, ClassificationFieldDefinition[]>()
  for (const field of editableFields.value) {
    const groupName =
      field.group ||
      t(
        field.id.startsWith('extensions.')
          ? 'setting.classification.preview.groups.sourceExtension'
          : 'setting.classification.preview.groups.shared',
      )
    const group = groups.get(groupName) ?? []
    group.push(field)
    groups.set(groupName, group)
  }
  return [...groups].map(([name, fields]) => ({ name, fields }))
})

const categoryMap = computed(() => new Map(props.categories.map(category => [category.id, category])))

/** 为 VSelect 与 VCombobox 提供业务标签和有界浮层参数。 */
function comboboxMenuProps(label: string) {
  return {
    activatorProps: { 'aria-label': label },
    contentClass: 'classification-preview-menu',
    maxHeight: 280,
    location: 'bottom start' as const,
    offset: 4,
  }
}

/** 返回字段当前保存的值，数组会复制后再交给控件。 */
function fieldValue(fieldId: string): ClassificationFactValue | undefined {
  const value = fieldValues.value[fieldId]
  return Array.isArray(value) ? [...value] : value
}

/** 返回多值控件需要的稳定数组，忽略与字段目录不一致的标量旧值。 */
function listFieldValue(fieldId: string): ClassificationFactScalar[] {
  const value = fieldValues.value[fieldId]
  return Array.isArray(value) ? [...value] : []
}

/** 为 Vuetify 可自定义枚举控件收窄模板泛型，运行时仍保留原始标量。 */
function comboboxScalarValue(fieldId: string): never {
  const value = fieldValues.value[fieldId]
  return (Array.isArray(value) ? undefined : value) as never
}

/** 为 Vuetify 可自定义列表控件收窄模板泛型，运行时仍保留原始列表。 */
function comboboxListValue(fieldId: string): never[] {
  return listFieldValue(fieldId) as never[]
}

/** 将控件值归一为字段目录声明的 JSON 值类型。 */
function normalizeFieldValue(
  field: ClassificationFieldDefinition,
  value: unknown,
): ClassificationFactValue | undefined {
  if (value === undefined || value === null || value === '') return undefined

  if (field.value_type === 'string_list') {
    const values = Array.isArray(value) ? value : [value]
    const normalized = values
      .filter(
        (item): item is Exclude<ClassificationFactScalar, null> => item !== null && item !== undefined && item !== '',
      )
      .map(item => (typeof item === 'string' ? item.trim() : item))
      .filter(item => item !== '')
    return normalized.length ? normalized : undefined
  }

  if (field.value_type === 'integer' || field.value_type === 'year' || field.value_type === 'number') {
    const numericValue = Number(value)
    if (!Number.isFinite(numericValue)) return undefined
    return field.value_type === 'number' ? numericValue : Math.trunc(numericValue)
  }

  if (field.value_type === 'boolean') return value === true || value === false ? value : undefined
  if (typeof value === 'string') return value.trim() || undefined
  if (typeof value === 'number' || typeof value === 'boolean') return value
  return String(value)
}

/** 更新单个动态事实；空值会从请求中移除而不是提交 null。 */
function updateFieldValue(field: ClassificationFieldDefinition, value: unknown): void {
  const normalized = normalizeFieldValue(field, value)
  const nextValues = { ...fieldValues.value }
  if (normalized === undefined) delete nextValues[field.id]
  else nextValues[field.id] = Array.isArray(normalized) ? [...normalized] : normalized
  fieldValues.value = nextValues
}

/** 从字段能力声明中解析允许包含点号的扩展来源。 */
function extensionPath(field: ClassificationFieldDefinition): ClassificationExtensionPath | null {
  const source = Object.entries(field.source_support).find(([, support]) => support === 'extension')?.[0]
  if (!source) return null

  const prefix = `extensions.${source}.`
  if (!field.id.startsWith(prefix)) return null
  const key = field.id.slice(prefix.length)
  return key ? { source, key } : null
}

/** 复制事实值，防止组件内部数组与父层请求共享引用。 */
function cloneFactValue(value: ClassificationFactValue): ClassificationFactValue {
  return Array.isArray(value) ? [...value] : value
}

/** 按后端标准事实结构组装当前可见字段，不把动态字段写回 identity。 */
function buildFacts(): ClassificationFacts {
  const media: Record<string, ClassificationFactValue> = { type: mediaType.value }
  const music: Record<string, ClassificationFactValue> = {}
  const extensions: Record<string, Record<string, ClassificationFactValue>> = {}

  for (const field of editableFields.value) {
    const value = fieldValues.value[field.id]
    if (value === undefined) continue
    const clonedValue = cloneFactValue(value)

    if (field.id.startsWith('media.')) {
      media[field.id.slice('media.'.length)] = clonedValue
      continue
    }
    if (field.id.startsWith('music.')) {
      music[field.id.slice('music.'.length)] = clonedValue
      continue
    }

    const path = extensionPath(field)
    if (!path) continue
    extensions[path.source] = { ...(extensions[path.source] ?? {}), [path.key]: clonedValue }
  }

  return {
    identity: {
      media_source: mediaSource.value.trim(),
      media_id: mediaId.value.trim(),
    },
    media: media as unknown as ClassificationMediaFacts,
    ...(mediaType.value === '音乐' ? { music: music as unknown as ClassificationMusicFacts } : {}),
    extensions,
    field_sources: {},
  }
}

/** 校验稳定身份后发出预览请求，实际 API 调用由父层负责。 */
function requestPreview(): void {
  if (!mediaSource.value.trim()) {
    validationMessage.value = t('setting.classification.preview.validation.mediaSourceRequired')
    return
  }
  if (!mediaId.value.trim()) {
    validationMessage.value = t('setting.classification.preview.validation.mediaIdRequired')
    return
  }

  validationMessage.value = ''
  emit('request-preview', {
    input: { kind: 'facts', facts: buildFacts() },
    policyMode: previewMode.value,
  })
}

/** 返回当前媒体来源对字段的能力提示。 */
function sourceSupportHint(field: ClassificationFieldDefinition): string | null {
  const source = mediaSource.value.trim()
  if (!source) return null
  const support = field.source_support[source]
  if (!support) return null
  const supportKeys: Partial<Record<ClassificationSourceSupport, string>> = {
    partial: 'setting.classification.preview.support.partial',
    unavailable: 'setting.classification.preview.support.unavailable',
    extension: 'setting.classification.preview.support.extension',
  }
  const key = supportKeys[support]
  return key ? t(key) : null
}

/** 将分类选择解析为名称、路径和稳定 ID。 */
function selectionTitle(selection: ClassificationSelection | null | undefined): string {
  if (!selection?.category_id) return t('setting.classification.preview.selection.unmatched')
  const category = categoryMap.value.get(selection.category_id)
  const path = selection.category_path.length ? selection.category_path : (category?.path ?? [])
  const name = category?.name ?? t('setting.classification.preview.selection.unknown')
  return t('setting.classification.preview.selection.summary', {
    name,
    path: path.length ? path.join(' / ') : t('setting.classification.preview.selection.unsetPath'),
    id: selection.category_id,
  })
}

/** 将选择来源转换为界面可读文本。 */
function selectionSourceLabel(source: string | null | undefined): string {
  const labels: Record<string, string> = {
    automatic: t('setting.classification.preview.selectionSource.automatic'),
    source_fallback: t('setting.classification.preview.selectionSource.sourceFallback'),
    fallback: t('setting.classification.preview.selectionSource.fallback'),
  }
  return source ? (labels[source] ?? source) : t('setting.classification.preview.missing')
}

/** 将求值状态转换为界面可读文本。 */
function stateLabel(state: ClassificationEvaluation['result']['state']): string {
  const labels: Record<ClassificationEvaluation['result']['state'], string> = {
    complete: t('setting.classification.preview.states.complete'),
    partial: t('setting.classification.preview.states.partial'),
    not_evaluated: t('setting.classification.preview.states.notEvaluated'),
    invalid_policy: t('setting.classification.preview.states.invalidPolicy'),
  }
  return labels[state]
}

/** 按求值状态返回一致的 Vuetify 语义色。 */
function stateColor(state: ClassificationEvaluation['result']['state']): string {
  if (state === 'complete') return 'success'
  if (state === 'partial') return 'warning'
  return 'error'
}

/** 将结构化路径格式化为可定位的点号与数组索引形式。 */
function formatPath(path: readonly (string | number)[]): string {
  if (!path.length) return t('setting.classification.preview.root')
  return path.reduce<string>((result, segment) => {
    if (typeof segment === 'number') return `${result}[${segment}]`
    return result ? `${result}.${segment}` : segment
  }, '')
}

/** 将 expected 与 actual 值稳定格式化，明确区分缺失和 null。 */
function formatFactValue(value: ClassificationFactValue | undefined): string {
  if (value === undefined) return t('setting.classification.preview.missing')
  return JSON.stringify(value)
}

/** 将字段级来源转换为提供者和媒体源的稳定展示文本。 */
function factSourceLabel(source: ClassificationFactSource | null | undefined): string {
  if (!source) return t('setting.classification.preview.missing')
  return `${source.provider_name} · ${source.media_source}`
}
</script>

<template>
  <section class="classification-preview" aria-labelledby="classification-preview-title">
    <header class="classification-preview__header">
      <div>
        <h2 id="classification-preview-title">{{ t('setting.classification.preview.title') }}</h2>
        <p>{{ t('setting.classification.preview.description') }}</p>
      </div>
      <VBtn
        color="primary"
        prepend-icon="mdi-play-outline"
        :loading="loading"
        :disabled="loading"
        :aria-label="t('setting.classification.preview.run')"
        @click="requestPreview"
      >
        {{ t('setting.classification.preview.run') }}
      </VBtn>
    </header>

    <div class="classification-preview__mode">
      <span id="classification-preview-mode-label">{{ t('setting.classification.preview.modeLabel') }}</span>
      <VBtnToggle
        v-model="previewMode"
        mandatory
        color="primary"
        variant="outlined"
        aria-labelledby="classification-preview-mode-label"
      >
        <VBtn value="draft">{{ t('setting.classification.preview.draftPolicy') }}</VBtn>
        <VBtn value="active">{{ t('setting.classification.preview.activePolicy') }}</VBtn>
      </VBtnToggle>
    </div>

    <section
      class="classification-preview__facts"
      aria-labelledby="classification-preview-facts-title"
      :aria-describedby="validationMessage ? validationErrorId : undefined"
    >
      <h3 id="classification-preview-facts-title">{{ t('setting.classification.preview.factsTitle') }}</h3>

      <div class="classification-preview__identity">
        <VTextField
          v-model="mediaSource"
          :label="t('setting.classification.preview.mediaSource')"
          :placeholder="t('setting.classification.preview.mediaSourcePlaceholder')"
          autocomplete="off"
          density="comfortable"
          hide-details="auto"
        />
        <VTextField
          v-model="mediaId"
          :label="t('setting.classification.preview.mediaId')"
          :placeholder="t('setting.classification.preview.mediaIdPlaceholder')"
          autocomplete="off"
          density="comfortable"
          hide-details="auto"
        />
      </div>

      <div class="classification-preview__media-type">
        <span id="classification-preview-media-type-label">{{ t('setting.classification.preview.mediaType') }}</span>
        <VBtnToggle
          v-model="mediaType"
          mandatory
          color="primary"
          variant="outlined"
          aria-labelledby="classification-preview-media-type-label"
        >
          <VBtn v-for="item in MEDIA_TYPES" :key="item.value" :value="item.value">
            <VIcon :icon="item.icon" start />
            {{ t(item.labelKey) }}
          </VBtn>
        </VBtnToggle>
      </div>

      <VAlert
        v-if="validationMessage"
        :id="validationErrorId"
        type="error"
        variant="tonal"
        density="compact"
        role="alert"
      >
        {{ validationMessage }}
      </VAlert>

      <div v-if="fieldGroups.length" class="classification-preview__field-groups">
        <section
          v-for="(group, groupIndex) in fieldGroups"
          :key="group.name"
          class="classification-preview__field-group"
          :aria-labelledby="`classification-preview-field-group-${groupIndex}`"
        >
          <h4 :id="`classification-preview-field-group-${groupIndex}`">{{ group.name }}</h4>
          <div class="classification-preview__field-grid">
            <div v-for="field in group.fields" :key="field.id" class="classification-preview__field">
              <VSelect
                v-if="field.value_type === 'boolean'"
                :model-value="fieldValue(field.id) ?? null"
                :items="booleanItems"
                :label="field.label"
                :menu-props="comboboxMenuProps(field.label)"
                clearable
                density="comfortable"
                hide-details="auto"
                @update:model-value="value => updateFieldValue(field, value)"
              />

              <VSelect
                v-else-if="field.value_type === 'enum' && !field.allow_custom_values"
                :model-value="fieldValue(field.id)"
                :items="field.options"
                item-title="label"
                item-value="value"
                :label="field.label"
                :menu-props="comboboxMenuProps(field.label)"
                clearable
                density="comfortable"
                hide-details="auto"
                @update:model-value="value => updateFieldValue(field, value)"
              />

              <VSelect
                v-else-if="field.value_type === 'string_list' && field.options.length && !field.allow_custom_values"
                :model-value="listFieldValue(field.id)"
                :items="field.options"
                item-title="label"
                item-value="value"
                :label="field.label"
                :menu-props="comboboxMenuProps(field.label)"
                multiple
                chips
                closable-chips
                clearable
                density="comfortable"
                hide-details="auto"
                @update:model-value="value => updateFieldValue(field, value)"
              />

              <VCombobox
                v-else-if="field.value_type === 'enum'"
                :model-value="comboboxScalarValue(field.id)"
                :items="field.options"
                item-title="label"
                item-value="value"
                :label="field.label"
                :menu-props="comboboxMenuProps(field.label)"
                clearable
                density="comfortable"
                hide-details="auto"
                @update:model-value="value => updateFieldValue(field, value)"
              />

              <VCombobox
                v-else-if="field.value_type === 'string_list'"
                :model-value="comboboxListValue(field.id)"
                :items="field.options"
                item-title="label"
                item-value="value"
                :label="field.label"
                :menu-props="comboboxMenuProps(field.label)"
                multiple
                chips
                closable-chips
                clearable
                density="comfortable"
                hide-details="auto"
                @update:model-value="value => updateFieldValue(field, value)"
              />

              <VTextField
                v-else
                :model-value="fieldValue(field.id)"
                :label="field.label"
                :type="['integer', 'number', 'year'].includes(field.value_type) ? 'number' : 'text'"
                :step="field.value_type === 'number' ? 'any' : undefined"
                autocomplete="off"
                clearable
                density="comfortable"
                hide-details="auto"
                @update:model-value="value => updateFieldValue(field, value)"
              />

              <div class="classification-preview__field-meta">
                <code>{{ field.id }}</code>
                <span v-if="field.description">{{ field.description }}</span>
                <VChip
                  v-if="sourceSupportHint(field)"
                  size="x-small"
                  variant="tonal"
                  :color="field.source_support[mediaSource.trim()] === 'unavailable' ? 'error' : 'warning'"
                >
                  {{ sourceSupportHint(field) }}
                </VChip>
              </div>
            </div>
          </div>
        </section>
      </div>
      <p v-else class="classification-preview__empty">{{ t('setting.classification.preview.noEditableFields') }}</p>
    </section>

    <section
      class="classification-preview__result"
      aria-labelledby="classification-preview-result-title"
      aria-live="polite"
      :aria-busy="loading"
    >
      <div class="classification-preview__result-heading">
        <h3 id="classification-preview-result-title">{{ t('setting.classification.preview.resultTitle') }}</h3>
        <VProgressCircular
          v-if="loading"
          indeterminate
          size="24"
          width="2"
          :aria-label="t('setting.classification.preview.loading')"
        />
      </div>

      <p v-if="!result && !loading" class="classification-preview__empty">
        {{ t('setting.classification.preview.emptyResult') }}
      </p>

      <template v-if="result">
        <div class="classification-preview__summary">
          <div>
            <span>{{ t('setting.classification.preview.status') }}</span>
            <VChip :color="stateColor(result.result.state)" variant="tonal" size="small">
              {{ stateLabel(result.result.state) }}
            </VChip>
          </div>
          <div>
            <span>{{ t('setting.classification.preview.policyRevision') }}</span>
            <strong>{{ result.result.policy_revision }}</strong>
          </div>
        </div>

        <div class="classification-preview__selections">
          <section aria-labelledby="classification-preview-recommended-title">
            <h4 id="classification-preview-recommended-title">{{ t('setting.classification.preview.recommended') }}</h4>
            <strong>{{ selectionTitle(result.result.recommended) }}</strong>
            <dl v-if="result.result.recommended">
              <div>
                <dt>{{ t('setting.classification.preview.rule') }}</dt>
                <dd>{{ result.result.recommended.rule_id || t('setting.classification.preview.none') }}</dd>
              </div>
              <div>
                <dt>{{ t('setting.classification.preview.source') }}</dt>
                <dd>{{ selectionSourceLabel(result.result.recommended.source) }}</dd>
              </div>
            </dl>
          </section>
          <section aria-labelledby="classification-preview-effective-title">
            <h4 id="classification-preview-effective-title">{{ t('setting.classification.preview.effective') }}</h4>
            <strong>{{ selectionTitle(result.result.effective) }}</strong>
            <dl v-if="result.result.effective">
              <div>
                <dt>{{ t('setting.classification.preview.rule') }}</dt>
                <dd>{{ result.result.effective.rule_id || t('setting.classification.preview.none') }}</dd>
              </div>
              <div>
                <dt>{{ t('setting.classification.preview.source') }}</dt>
                <dd>{{ selectionSourceLabel(result.result.effective.source) }}</dd>
              </div>
            </dl>
          </section>
        </div>

        <section class="classification-preview__labels" aria-labelledby="classification-preview-labels-title">
          <h4 id="classification-preview-labels-title">{{ t('setting.classification.preview.labels') }}</h4>
          <div v-if="result.result.labels.length" class="classification-preview__chips">
            <VChip v-for="label in result.result.labels" :key="label" size="small" variant="tonal">
              {{ label }}
            </VChip>
          </div>
          <span v-else>{{ t('setting.classification.preview.none') }}</span>
        </section>

        <section
          v-if="result.warnings.length"
          class="classification-preview__warnings"
          aria-labelledby="classification-preview-warnings-title"
        >
          <h4 id="classification-preview-warnings-title">{{ t('setting.classification.preview.warnings') }}</h4>
          <VAlert
            v-for="(warning, index) in result.warnings"
            :key="`${warning.code}-${index}`"
            type="warning"
            variant="tonal"
            density="compact"
          >
            <strong>{{ warning.code }}</strong
            >：{{ warning.message }}
            <div class="classification-preview__warning-meta">
              <code>{{ formatPath(warning.path) }}</code>
              <span v-if="warning.field">{{
                t('setting.classification.preview.warningField', { field: warning.field })
              }}</span>
              <span v-if="warning.source">{{
                t('setting.classification.preview.warningSource', { source: warning.source })
              }}</span>
            </div>
          </VAlert>
        </section>

        <section class="classification-preview__trace" aria-labelledby="classification-preview-trace-title">
          <h4 id="classification-preview-trace-title">{{ t('setting.classification.preview.trace') }}</h4>
          <p v-if="!result.trace.length" class="classification-preview__empty">
            {{ t('setting.classification.preview.noRules') }}
          </p>
          <details
            v-for="rule in result.trace"
            :key="rule.rule_id"
            class="classification-preview__rule"
            :open="rule.matched"
          >
            <summary>
              <code>{{ rule.rule_id }}</code>
              <VChip :color="rule.matched ? 'success' : 'default'" size="x-small" variant="tonal">
                {{
                  t(
                    rule.matched
                      ? 'setting.classification.preview.matched'
                      : 'setting.classification.preview.notMatched',
                  )
                }}
              </VChip>
            </summary>
            <div v-if="rule.conditions.length" class="classification-preview__trace-table">
              <VTable density="compact">
                <table :aria-label="t('setting.classification.preview.traceTableAria', { rule: rule.rule_id })">
                  <thead>
                    <tr>
                      <th scope="col">{{ t('setting.classification.preview.columns.result') }}</th>
                      <th scope="col">{{ t('setting.classification.preview.columns.field') }}</th>
                      <th scope="col">{{ t('setting.classification.preview.columns.operator') }}</th>
                      <th scope="col">{{ t('setting.classification.preview.columns.expected') }}</th>
                      <th scope="col">{{ t('setting.classification.preview.columns.actual') }}</th>
                      <th scope="col">{{ t('setting.classification.preview.columns.factSource') }}</th>
                      <th scope="col">{{ t('setting.classification.preview.columns.path') }}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="(condition, index) in rule.conditions" :key="`${condition.field}-${index}`">
                      <td>
                        <VIcon
                          :icon="condition.matched ? 'mdi-check-circle-outline' : 'mdi-close-circle-outline'"
                          :color="condition.matched ? 'success' : 'error'"
                          :aria-label="
                            t(
                              condition.matched
                                ? 'setting.classification.preview.conditionMatched'
                                : 'setting.classification.preview.conditionNotMatched',
                            )
                          "
                        />
                      </td>
                      <td>
                        <code>{{ condition.field }}</code>
                      </td>
                      <td>{{ condition.operator }}</td>
                      <td>
                        <code>{{ formatFactValue(condition.expected) }}</code>
                      </td>
                      <td>
                        <code>{{ formatFactValue(condition.actual) }}</code>
                      </td>
                      <td>
                        <span :title="condition.source?.provider_id">{{ factSourceLabel(condition.source) }}</span>
                      </td>
                      <td>
                        <code>{{ formatPath(condition.path) }}</code>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </VTable>
            </div>
            <p v-else class="classification-preview__empty">
              {{ t('setting.classification.preview.noConditionTrace') }}
            </p>
          </details>
        </section>
      </template>
    </section>
  </section>
</template>

<style scoped>
.classification-preview {
  display: grid;
  gap: 1.25rem;
}

.classification-preview__header,
.classification-preview__result-heading,
.classification-preview__mode,
.classification-preview__media-type,
.classification-preview__summary > div,
.classification-preview__rule summary {
  display: flex;
  align-items: center;
}

.classification-preview__header {
  justify-content: space-between;
  gap: 1rem;
}

.classification-preview__header h2,
.classification-preview__facts h3,
.classification-preview__result h3,
.classification-preview h4,
.classification-preview p {
  margin: 0;
}

.classification-preview__header p,
.classification-preview__field-meta,
.classification-preview__empty {
  color: rgb(var(--v-theme-on-surface-variant));
}

.classification-preview__mode,
.classification-preview__media-type {
  flex-wrap: wrap;
  gap: 0.75rem;
}

.classification-preview__mode > span,
.classification-preview__media-type > span {
  min-inline-size: 5rem;
  font-weight: 600;
}

.classification-preview__facts,
.classification-preview__result {
  display: grid;
  gap: 1rem;
  padding-block: 1rem;
  border-block-start: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}

.classification-preview__identity,
.classification-preview__field-grid,
.classification-preview__selections {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem;
}

.classification-preview__field-groups,
.classification-preview__field-group,
.classification-preview__result,
.classification-preview__warnings,
.classification-preview__trace {
  display: grid;
  gap: 0.875rem;
}

.classification-preview__field-group {
  padding-block-start: 0.25rem;
}

.classification-preview__field {
  min-inline-size: 0;
}

.classification-preview__field-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.375rem 0.75rem;
  padding-block-start: 0.35rem;
  font-size: 0.75rem;
}

.classification-preview code {
  overflow-wrap: anywhere;
}

.classification-preview__result-heading {
  justify-content: space-between;
  gap: 1rem;
}

.classification-preview__summary {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem 1.5rem;
}

.classification-preview__summary > div {
  gap: 0.5rem;
}

.classification-preview__selections > section {
  display: grid;
  gap: 0.625rem;
  padding-block: 0.875rem;
  border-block: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}

.classification-preview__selections strong {
  overflow-wrap: anywhere;
}

.classification-preview__selections dl {
  display: grid;
  gap: 0.35rem;
  margin: 0;
}

.classification-preview__selections dl > div {
  display: grid;
  grid-template-columns: 4rem minmax(0, 1fr);
  gap: 0.5rem;
}

.classification-preview__selections dt {
  color: rgb(var(--v-theme-on-surface-variant));
}

.classification-preview__selections dd {
  min-inline-size: 0;
  margin: 0;
  overflow-wrap: anywhere;
}

.classification-preview__labels,
.classification-preview__chips {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
}

.classification-preview__warning-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem 0.75rem;
  padding-block-start: 0.25rem;
  font-size: 0.75rem;
}

.classification-preview__rule {
  border-block-start: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}

.classification-preview__rule summary {
  justify-content: space-between;
  gap: 0.75rem;
  min-block-size: 3rem;
  cursor: pointer;
}

.classification-preview__trace-table {
  max-inline-size: 100%;
  overflow-x: auto;
}

.classification-preview__trace-table table {
  min-inline-size: 48rem;
}

.classification-preview__trace-table th {
  white-space: nowrap;
}

@media (max-width: 700px) {
  .classification-preview__header {
    align-items: stretch;
    flex-direction: column;
  }

  .classification-preview__identity,
  .classification-preview__field-grid,
  .classification-preview__selections {
    grid-template-columns: minmax(0, 1fr);
  }

  .classification-preview__mode .v-btn-toggle,
  .classification-preview__media-type .v-btn-toggle {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    inline-size: 100%;
  }

  .classification-preview__media-type .v-btn-toggle {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .classification-preview__mode .v-btn,
  .classification-preview__media-type .v-btn {
    min-inline-size: 0;
  }
}
</style>
