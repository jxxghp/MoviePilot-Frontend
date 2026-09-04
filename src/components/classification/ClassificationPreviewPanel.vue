<script setup lang="ts">
import api from '@/api'
import type { MediaDataSource, MediaInfo, MediaSourceInfo } from '@/api/types'
import type {
  ClassificationCategory,
  ClassificationEvaluation,
  ClassificationFactSource,
  ClassificationFactValue,
  ClassificationMediaType,
  ClassificationPreviewInput,
  ClassificationSelection,
} from '@/api/mediaClassificationTypes'
import { formatClassificationCategoryOptionTitle } from '@/utils/mediaClassification'

defineOptions({ name: 'ClassificationPreviewPanel' })

/** 预览可选择的策略版本。 */
type ClassificationPreviewPolicyMode = 'draft' | 'active'

/** 预览面板需要的分类目录、来源目录和当前请求状态。 */
interface ClassificationPreviewPanelProps {
  categories: readonly ClassificationCategory[]
  sources?: readonly MediaSourceInfo[]
  result: ClassificationEvaluation | null
  loading: boolean
}

/** 向父层提交所选媒体和策略版本。 */
interface ClassificationPreviewEvent {
  input: ClassificationPreviewInput
  policyMode: ClassificationPreviewPolicyMode
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

const previewMode = ref<ClassificationPreviewPolicyMode>('draft')
const mediaType = ref<ClassificationMediaType>('电影')
const keyword = ref('')
const searchResults = ref<MediaInfo[]>([])
const selectedMedia = shallowRef<MediaInfo | null>(null)
const searching = ref(false)
const searchMessage = ref('')
const validationMessage = ref('')
const validationErrorId = `classification-preview-error-${useId()}`

const categoryMap = computed(() => new Map(props.categories.map(category => [category.id, category])))

/** 判断来源是否声明了当前预览媒体类型；未声明时按兼容来源处理。 */
function sourceSupportsMediaType(source: MediaSourceInfo): boolean {
  const types = (source.media_types ?? []).map(type => type.trim().toLowerCase())
  if (!types.length) return true
  if (mediaType.value === '音乐') return types.includes('音乐') || types.includes('music')
  return types.some(type => ['电影', '电视剧', 'movie', 'tv', 'media'].includes(type))
}

/** 返回当前媒体类型对应的已登记来源，保证搜索覆盖内置和插件来源。 */
function searchSourceIds(): MediaDataSource[] {
  return (props.sources ?? [])
    .filter(sourceSupportsMediaType)
    .map(source => source.media_source)
    .filter((source, index, sources) => sources.indexOf(source) === index)
}

/** 将媒体来源编号换成设置中登记的显示名称。 */
function sourceDisplayName(source: string | undefined): string {
  if (!source) return t('setting.classification.preview.missing')
  return (
    props.sources?.find(item => item.media_source === source)?.name || t('setting.classification.preview.unknownSource')
  )
}

/** 返回媒体搜索结果的可读标题，兼容艺术家结果没有 title 的情况。 */
function mediaTitle(media: MediaInfo): string {
  return media.title || media.artist || media.album || t('setting.classification.preview.untitledMedia')
}

/** 返回搜索结果卡片中的简短说明。 */
function mediaSummary(media: MediaInfo): string {
  const details = [media.type, media.year, media.artist || media.album].filter(Boolean)
  return details.join(' · ')
}

/** 将数组字段转换为单行可读文本。 */
function listText(values: string[] | undefined): string {
  return values?.filter(Boolean).join('、') || t('setting.classification.preview.none')
}

/** 以统一参数搜索当前媒体类型的候选媒体。 */
async function searchMedia(): Promise<void> {
  const query = keyword.value.trim()
  if (!query) {
    searchResults.value = []
    selectedMedia.value = null
    searchMessage.value = t('setting.classification.preview.keywordRequired')
    return
  }

  searching.value = true
  searchMessage.value = ''
  selectedMedia.value = null
  try {
    const params: Record<string, string | number | MediaDataSource[]> = {
      title: query,
      type: mediaType.value === '音乐' ? 'music' : 'media',
      page: 1,
      count: 20,
    }
    const sourceIds = searchSourceIds()
    if (sourceIds.length) params.media_source = sourceIds
    const result = await api.get<MediaInfo[]>('media/search', {
      params,
      paramsSerializer: { indexes: null },
      feedback: 'silent',
    })
    searchResults.value = (Array.isArray(result) ? result : []).filter(
      media => media.type === mediaType.value && !!media.media_source && !!media.media_id,
    )
    if (!searchResults.value.length) searchMessage.value = t('setting.classification.preview.noSearchResults')
  } catch (error) {
    console.error(error)
    searchResults.value = []
    searchMessage.value = t('setting.classification.preview.searchFailed')
  } finally {
    searching.value = false
  }
}

/** 切换媒体类型时清除旧搜索结果，避免把不同类型的数据误用于预览。 */
function changeMediaType(value: ClassificationMediaType): void {
  mediaType.value = value
  keyword.value = ''
  searchResults.value = []
  selectedMedia.value = null
  searchMessage.value = ''
  validationMessage.value = ''
}

/** 记住用户从搜索结果中选中的完整媒体对象。 */
function selectMedia(media: MediaInfo): void {
  selectedMedia.value = media
  validationMessage.value = ''
  searchMessage.value = ''
}

/** 清除已选媒体，要求用户重新搜索并选择。 */
function clearSelection(): void {
  selectedMedia.value = null
  validationMessage.value = ''
}

/** 使用选中的完整媒体信息请求分类结果，禁止手工拼接分类数据。 */
function requestPreview(): void {
  const media = selectedMedia.value
  if (!media) {
    validationMessage.value = t('setting.classification.preview.selectionRequired')
    return
  }
  validationMessage.value = ''
  emit('request-preview', {
    input: { kind: 'media', media: media as unknown as Record<string, unknown> },
    policyMode: previewMode.value,
  })
}

/** 将分类选择转换为不重复内部编号的可读名称和路径。 */
function selectionTitle(selection: ClassificationSelection | null | undefined): string {
  if (!selection?.category_id) return t('setting.classification.preview.selection.unmatched')
  const category = categoryMap.value.get(selection.category_id)
  const path = selection.category_path.length ? selection.category_path : (category?.path ?? [])
  const name = category?.name ?? t('setting.classification.preview.selection.unknown')
  return formatClassificationCategoryOptionTitle(
    {
      id: selection.category_id,
      name,
      path,
    },
    {
      emptyPathLabel: t('setting.classification.preview.selection.unsetPath'),
    },
  )
}

/** 将结果来源转换为界面可读文本。 */
function selectionSourceLabel(source: string | null | undefined): string {
  const labels: Record<string, string> = {
    automatic: t('setting.classification.preview.selectionSource.automatic'),
    source_fallback: t('setting.classification.preview.selectionSource.sourceFallback'),
    fallback: t('setting.classification.preview.selectionSource.fallback'),
  }
  return source ? (labels[source] ?? source) : t('setting.classification.preview.missing')
}

/** 将内部规则编号转换为“已命中”或“未使用”，避免把系统编号当成用户信息。 */
function ruleLabel(ruleId: string | null | undefined): string {
  return ruleId
    ? t('setting.classification.preview.selectionSource.automatic')
    : t('setting.classification.preview.none')
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

/** 将内部字段编号翻译成用户能理解的字段名称。 */
function fieldLabel(field: string): string {
  const labels: Record<string, string> = {
    'media.type': t('setting.classification.preview.fieldLabels.mediaType'),
    'media.title': t('setting.classification.preview.fieldLabels.title'),
    'media.year': t('setting.classification.preview.fieldLabels.year'),
    'media.language': t('setting.classification.preview.fieldLabels.language'),
    'media.countries': t('setting.classification.preview.fieldLabels.countries'),
    'media.genre_keys': t('setting.classification.preview.fieldLabels.genres'),
    'media.genre_names': t('setting.classification.preview.fieldLabels.genreNames'),
    'media.content_rating': t('setting.classification.preview.fieldLabels.contentRating'),
    'music.entity_type': t('setting.classification.preview.fieldLabels.musicType'),
    'music.album_type': t('setting.classification.preview.fieldLabels.albumType'),
    'music.genres': t('setting.classification.preview.fieldLabels.musicGenres'),
    'music.tags': t('setting.classification.preview.fieldLabels.tags'),
    'music.artists': t('setting.classification.preview.fieldLabels.artists'),
  }
  if (labels[field]) return labels[field]
  if (field.startsWith('extensions.')) return t('setting.classification.preview.fieldLabels.sourceExtension')
  return field
}

/** 将英文操作符翻译为普通中文。 */
function operatorLabel(operator: string): string {
  const labels: Record<string, string> = {
    equals: '等于',
    not_equals: '不等于',
    in: '属于',
    not_in: '不属于',
    contains: '包含',
    starts_with: '开头是',
    ends_with: '结尾是',
    gt: '大于',
    gte: '大于等于',
    lt: '小于',
    lte: '小于等于',
    between: '介于',
    contains_any: '包含任一项',
    contains_all: '包含全部',
    contains_none: '不包含这些项',
    is_true: '是',
    is_false: '否',
    exists: '有内容',
    not_exists: '没有内容',
  }
  return labels[operator] ?? operator
}

/** 将期望值和实际值稳定格式化，明确区分缺失和 null。 */
function formatFactValue(value: ClassificationFactValue | undefined): string {
  if (value === undefined) return t('setting.classification.preview.missing')
  return JSON.stringify(value)
}

/** 将字段来源转换为提供者和来源名称，避免只显示英文来源编号。 */
function factSourceLabel(source: ClassificationFactSource | null | undefined): string {
  if (!source) return t('setting.classification.preview.missing')
  const providerName = source.provider_name?.trim()
  const sourceName = sourceDisplayName(source.media_source)
  return providerName && providerName !== sourceName ? `${providerName} · ${sourceName}` : sourceName
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
        :disabled="loading || !selectedMedia"
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
        density="compact"
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
      <div class="classification-preview__section-heading">
        <div>
          <h3 id="classification-preview-facts-title">{{ t('setting.classification.preview.factsTitle') }}</h3>
          <p>{{ t('setting.classification.preview.searchDescription') }}</p>
        </div>
      </div>

      <div class="classification-preview__media-type">
        <span id="classification-preview-media-type-label">{{ t('setting.classification.preview.mediaType') }}</span>
        <VBtnToggle
          :model-value="mediaType"
          mandatory
          color="primary"
          variant="outlined"
          density="compact"
          aria-labelledby="classification-preview-media-type-label"
          @update:model-value="changeMediaType"
        >
          <VBtn v-for="item in MEDIA_TYPES" :key="item.value" :value="item.value">
            <VIcon :icon="item.icon" start />
            {{ t(item.labelKey) }}
          </VBtn>
        </VBtnToggle>
      </div>

      <form class="classification-preview__search" @submit.prevent="searchMedia">
        <VTextField
          v-model="keyword"
          :label="t('setting.classification.preview.keyword')"
          :placeholder="t('setting.classification.preview.keywordPlaceholder')"
          prepend-inner-icon="mdi-magnify"
          autocomplete="off"
          density="comfortable"
          variant="outlined"
          hide-details="auto"
          :loading="searching"
        />
        <VBtn
          type="submit"
          color="primary"
          variant="tonal"
          prepend-icon="mdi-magnify"
          :loading="searching"
          :disabled="searching"
        >
          {{ t('setting.classification.preview.search') }}
        </VBtn>
      </form>

      <VAlert v-if="searchMessage" type="info" variant="tonal" density="compact" role="status">
        {{ searchMessage }}
      </VAlert>

      <VList
        v-if="searchResults.length"
        class="classification-preview__search-results"
        lines="two"
        :aria-label="t('setting.classification.preview.searchResults')"
      >
        <VListItem
          v-for="media in searchResults"
          :key="`${media.media_source}:${media.media_id}`"
          :value="media.media_id"
          :active="selectedMedia?.media_id === media.media_id && selectedMedia?.media_source === media.media_source"
          color="primary"
          @click="selectMedia(media)"
        >
          <template #prepend>
            <VImg
              :src="media.cover_url || media.poster_path"
              width="48"
              height="68"
              aspect-ratio="2/3"
              cover
              class="classification-preview__search-poster"
            >
              <template #placeholder>
                <div class="classification-preview__poster-placeholder">
                  <VIcon icon="mdi-image-outline" />
                </div>
              </template>
            </VImg>
          </template>
          <VListItemTitle>{{ mediaTitle(media) }}</VListItemTitle>
          <VListItemSubtitle>{{ mediaSummary(media) }}</VListItemSubtitle>
          <template #append>
            <VIcon
              :icon="
                selectedMedia?.media_id === media.media_id && selectedMedia?.media_source === media.media_source
                  ? 'mdi-check-circle'
                  : 'mdi-chevron-right'
              "
              :color="
                selectedMedia?.media_id === media.media_id && selectedMedia?.media_source === media.media_source
                  ? 'primary'
                  : undefined
              "
            />
          </template>
        </VListItem>
      </VList>

      <article v-if="selectedMedia" class="classification-preview__selected" aria-labelledby="selected-media-title">
        <div class="classification-preview__selected-heading">
          <div>
            <span class="classification-preview__eyebrow">{{ t('setting.classification.preview.selectedTitle') }}</span>
            <h4 id="selected-media-title">{{ mediaTitle(selectedMedia) }}</h4>
          </div>
          <VBtn
            icon="mdi-close"
            variant="text"
            size="small"
            :aria-label="t('setting.classification.preview.clearSelection')"
            @click="clearSelection"
          />
        </div>
        <div class="classification-preview__selected-main">
          <VImg
            :src="selectedMedia.cover_url || selectedMedia.poster_path"
            width="72"
            height="104"
            aspect-ratio="2/3"
            cover
            class="classification-preview__selected-poster"
          >
            <template #placeholder>
              <div class="classification-preview__poster-placeholder">
                <VIcon icon="mdi-image-outline" />
              </div>
            </template>
          </VImg>
          <dl class="classification-preview__selected-details">
            <div>
              <dt>{{ t('setting.classification.preview.selectedSource') }}</dt>
              <dd>{{ sourceDisplayName(selectedMedia.media_source) }}</dd>
            </div>
            <div>
              <dt>{{ t('setting.classification.preview.selectedId') }}</dt>
              <dd>{{ selectedMedia.media_id }}</dd>
            </div>
            <div>
              <dt>{{ t('setting.classification.preview.selectedType') }}</dt>
              <dd>{{ selectedMedia.type }}</dd>
            </div>
            <div v-if="selectedMedia.year">
              <dt>{{ t('setting.classification.preview.year') }}</dt>
              <dd>{{ selectedMedia.year }}</dd>
            </div>
            <div v-if="selectedMedia.genres?.length">
              <dt>{{ t('setting.classification.preview.genres') }}</dt>
              <dd>{{ listText(selectedMedia.genres) }}</dd>
            </div>
            <div v-if="selectedMedia.artists?.length || selectedMedia.artist">
              <dt>{{ t('setting.classification.preview.artists') }}</dt>
              <dd>{{ listText(selectedMedia.artists || [selectedMedia.artist || '']) }}</dd>
            </div>
            <div v-if="selectedMedia.album">
              <dt>{{ t('setting.classification.preview.album') }}</dt>
              <dd>{{ selectedMedia.album }}</dd>
            </div>
          </dl>
        </div>
      </article>

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
                <dd>{{ ruleLabel(result.result.recommended.rule_id) }}</dd>
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
                <dd>{{ ruleLabel(result.result.effective.rule_id) }}</dd>
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
            {{ warning.message }}
            <div class="classification-preview__warning-meta">
              <span v-if="warning.field">{{ fieldLabel(warning.field) }}</span>
              <span v-if="warning.source">{{ sourceDisplayName(warning.source) }}</span>
            </div>
          </VAlert>
        </section>

        <section class="classification-preview__trace" aria-labelledby="classification-preview-trace-title">
          <h4 id="classification-preview-trace-title">{{ t('setting.classification.preview.trace') }}</h4>
          <p v-if="!result.trace.length" class="classification-preview__empty">
            {{ t('setting.classification.preview.noRules') }}
          </p>
          <details
            v-for="(rule, ruleIndex) in result.trace"
            :key="rule.rule_id"
            class="classification-preview__rule"
            :open="rule.matched"
          >
            <summary>
              <span>{{ t('setting.classification.preview.ruleNumber', { number: ruleIndex + 1 }) }}</span>
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
                <table :aria-label="t('setting.classification.preview.traceTableAria', { rule: ruleIndex + 1 })">
                  <thead>
                    <tr>
                      <th scope="col">{{ t('setting.classification.preview.columns.result') }}</th>
                      <th scope="col">{{ t('setting.classification.preview.columns.field') }}</th>
                      <th scope="col">{{ t('setting.classification.preview.columns.operator') }}</th>
                      <th scope="col">{{ t('setting.classification.preview.columns.expected') }}</th>
                      <th scope="col">{{ t('setting.classification.preview.columns.actual') }}</th>
                      <th scope="col">{{ t('setting.classification.preview.columns.factSource') }}</th>
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
                      <td>{{ fieldLabel(condition.field) }}</td>
                      <td>{{ operatorLabel(condition.operator) }}</td>
                      <td>{{ formatFactValue(condition.expected) }}</td>
                      <td>{{ formatFactValue(condition.actual) }}</td>
                      <td>
                        <span :title="condition.source?.provider_id">{{ factSourceLabel(condition.source) }}</span>
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
  min-width: 0;
}

.classification-preview__header,
.classification-preview__result-heading,
.classification-preview__mode,
.classification-preview__media-type,
.classification-preview__summary > div,
.classification-preview__rule summary,
.classification-preview__section-heading,
.classification-preview__selected-heading {
  display: flex;
  align-items: center;
}

.classification-preview__header,
.classification-preview__section-heading,
.classification-preview__selected-heading {
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
.classification-preview__section-heading p,
.classification-preview__empty,
.classification-preview__eyebrow {
  color: rgb(var(--v-theme-on-surface-variant));
}

.classification-preview__header p,
.classification-preview__section-heading p {
  margin-block-start: 0.25rem;
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

.classification-preview__search {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: start;
  gap: 0.75rem;
}

.classification-preview__search :deep(.v-btn) {
  min-block-size: 48px;
}

.classification-preview__search-results {
  max-block-size: min(23rem, 45dvh);
  overflow-y: auto;
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 8px;
  background: rgba(var(--v-theme-surface-variant), 0.12);
}

.classification-preview__search-results :deep(.v-list-item) {
  min-block-size: 84px;
  border-block-end: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}

.classification-preview__search-results :deep(.v-list-item:last-child) {
  border-block-end: 0;
}

.classification-preview__search-poster,
.classification-preview__selected-poster {
  flex: 0 0 auto;
  overflow: hidden;
  border-radius: 5px;
  background: rgba(var(--v-theme-on-surface), 0.08);
}

.classification-preview__poster-placeholder {
  display: grid;
  width: 100%;
  height: 100%;
  place-items: center;
  color: rgba(var(--v-theme-on-surface), 0.45);
}

.classification-preview__selected {
  display: grid;
  gap: 0.875rem;
  padding: 1rem;
  border: 1px solid rgba(var(--v-theme-primary), 0.45);
  border-radius: 8px;
  background: rgba(var(--v-theme-primary), 0.08);
}

.classification-preview__eyebrow {
  display: block;
  margin-block-end: 0.25rem;
  font-size: 0.75rem;
}

.classification-preview__selected-main {
  display: flex;
  gap: 1rem;
  min-width: 0;
}

.classification-preview__selected-details {
  display: grid;
  flex: 1 1 auto;
  gap: 0.4rem;
  min-width: 0;
  margin: 0;
}

.classification-preview__selected-details > div {
  display: grid;
  grid-template-columns: minmax(4rem, auto) minmax(0, 1fr);
  gap: 0.75rem;
  min-width: 0;
}

.classification-preview__selected-details dt {
  color: rgb(var(--v-theme-on-surface-variant));
  white-space: nowrap;
}

.classification-preview__selected-details dd {
  min-width: 0;
  margin: 0;
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

.classification-preview__selections {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem;
}

.classification-preview__selections > section {
  display: grid;
  gap: 0.625rem;
  min-width: 0;
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

.classification-preview__selections dt,
.classification-preview__selections dd {
  min-width: 0;
  overflow-wrap: anywhere;
}

.classification-preview__selections dt {
  color: rgb(var(--v-theme-on-surface-variant));
}

.classification-preview__selections dd {
  margin: 0;
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
  color: rgb(var(--v-theme-on-surface-variant));
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
  min-inline-size: 42rem;
}

.classification-preview__trace-table th {
  white-space: nowrap;
}

@media (max-width: 700px) {
  .classification-preview__header,
  .classification-preview__section-heading {
    align-items: stretch;
    flex-direction: column;
  }

  .classification-preview__header :deep(.v-btn) {
    inline-size: 100%;
  }

  .classification-preview__search,
  .classification-preview__selections {
    grid-template-columns: minmax(0, 1fr);
  }

  .classification-preview__search :deep(.v-btn) {
    inline-size: 100%;
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

@media (max-width: 420px) {
  .classification-preview__selected-main {
    align-items: flex-start;
    flex-direction: column;
  }
}

:global(html[data-theme='glass'] .classification-preview__search-results),
:global(html[data-theme='glass'] .classification-preview__selected) {
  border-color: var(--glass-border-raised);
  -webkit-backdrop-filter: var(--glass-surface-backdrop-filter);
  backdrop-filter: var(--glass-surface-backdrop-filter);
  background-color: var(--glass-surface-soft);
  background-image: var(--glass-sheen);
  box-shadow: var(--glass-control-shadow);
}
</style>
