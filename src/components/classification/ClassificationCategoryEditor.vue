<script setup lang="ts">
import type { ClassificationCategory, ClassificationMediaType } from '@/api/mediaClassificationTypes'
import { formatClassificationCategoryOptionTitle } from '@/utils/mediaClassification'

/** 分类树编辑器输入属性。 */
interface ClassificationCategoryEditorProps {
  categories: ClassificationCategory[]
  fallbacks: Partial<Record<ClassificationMediaType, string>>
  referencedCategoryIds?: string[]
  directoryReferences?: Array<{ categoryId: string; directoryNames: string[] }>
  maxDepth?: number
}

/** 分类表单在新增和编辑期间使用的本地草稿。 */
interface ClassificationCategoryDraft {
  originalId: string | null
  id: string
  mediaType: ClassificationMediaType
  name: string
  pathText: string
  enabled: boolean
}

/** 路径输入解析结果，错误信息由同一可访问状态区展示。 */
interface ParsedCategoryPath {
  path: string[]
  error: string | null
}

const props = withDefaults(defineProps<ClassificationCategoryEditorProps>(), {
  referencedCategoryIds: () => [],
  directoryReferences: () => [],
  maxDepth: 4,
})

const emit = defineEmits<{
  'update:categories': [categories: ClassificationCategory[]]
  'update:fallbacks': [fallbacks: Partial<Record<ClassificationMediaType, string>>]
}>()

const mediaTypes: ReadonlyArray<{ icon: string; label: ClassificationMediaType }> = [
  { label: '电影', icon: 'mdi-movie-open-outline' },
  { label: '电视剧', icon: 'mdi-television-classic' },
  { label: '音乐', icon: 'mdi-music-note-outline' },
]

const { t } = useI18n()
const activeMediaType = ref<ClassificationMediaType>('电影')
const draft = ref<ClassificationCategoryDraft | null>(null)
const validationMessage = ref('')
const statusMessage = ref('')
const validationErrorId = `classification-category-error-${useId()}`

const effectiveMaxDepth = computed(() => Math.max(1, Math.trunc(props.maxDepth)))
const visibleCategories = computed(() =>
  props.categories.filter(category => category.media_type === activeMediaType.value),
)
const referencedIds = computed(() => new Set(props.referencedCategoryIds))
const directoryReferenceMap = computed(
  () => new Map(props.directoryReferences.map(reference => [reference.categoryId, reference.directoryNames])),
)
const draftReferenceReasons = computed(() =>
  draft.value?.originalId ? categoryReferenceReasons(draft.value.originalId) : [],
)

/** 克隆分类数组，避免子组件把父级草稿中的路径或标签数组变为共享引用。 */
function cloneCategories(categories: ClassificationCategory[]): ClassificationCategory[] {
  return categories.map(category => ({
    ...category,
    labels: [...category.labels],
    path: [...category.path],
  }))
}

/** 将用户输入拆成明确的多级路径，并拒绝空层级。 */
function parseCategoryPath(pathText: string): ParsedCategoryPath {
  const trimmedPath = pathText.trim()
  if (!trimmedPath) return { path: [], error: t('setting.classification.category.pathRequired') }

  const path = trimmedPath.split('/').map(segment => segment.trim())
  if (path.some(segment => !segment)) {
    return { path: [], error: t('setting.classification.category.pathEmptySegment') }
  }
  if (path.length > effectiveMaxDepth.value) {
    return {
      path: [],
      error: t('setting.classification.category.pathTooDeep', { count: effectiveMaxDepth.value }),
    }
  }
  return { path, error: null }
}

/** 返回分类被规则、来源兜底和各媒体类型全局兜底引用的具体原因。 */
function categoryReferenceReasons(categoryId: string): string[] {
  const reasons: string[] = []
  if (referencedIds.value.has(categoryId)) reasons.push(t('setting.classification.category.ruleReference'))

  const fallbackTypes = mediaTypes
    .map(item => item.label)
    .filter(mediaType => props.fallbacks[mediaType] === categoryId)
  if (fallbackTypes.length) {
    reasons.push(
      t('setting.classification.category.globalFallbackReference', {
        mediaTypes: fallbackTypes.join(t('setting.classification.category.listSeparator')),
      }),
    )
  }
  const directoryNames = directoryReferenceMap.value.get(categoryId) ?? []
  if (directoryNames.length) {
    reasons.push(
      t('setting.classification.category.directoryReference', {
        directories: directoryNames.join(t('setting.classification.category.listSeparator')),
      }),
    )
  }
  return reasons
}

/** 生成删除操作及可访问提示共用的完整保护文案。 */
function deletionHint(category: ClassificationCategory): string {
  const reasons = categoryReferenceReasons(category.id)
  return reasons.length
    ? t('setting.classification.category.deleteBlocked', {
        name: category.name,
        reasons: reasons.join(t('setting.classification.category.reasonSeparator')),
      })
    : t('setting.classification.category.delete', { name: category.name })
}

/** 生成编辑表单和列表共用的引用保护说明。 */
function protectionHint(category: ClassificationCategory): string {
  return t('setting.classification.category.protectedHint', {
    name: category.name,
    reasons: categoryReferenceReasons(category.id).join(t('setting.classification.category.reasonSeparator')),
  })
}

/** 判断分类当前是否受规则或 fallback 引用保护。 */
function isCategoryProtected(categoryId: string): boolean {
  return categoryReferenceReasons(categoryId).length > 0
}

/** 为 fallback 选择器生成不带内部稳定 ID 的可读标题。 */
function fallbackItemTitle(category: ClassificationCategory): string {
  return formatClassificationCategoryOptionTitle(category, {
    emptyPathLabel: t('setting.classification.category.pathUnset'),
  })
}

/** 返回指定媒体类型可选的稳定分类 ID 列表。 */
function fallbackItems(mediaType: ClassificationMediaType): ClassificationCategory[] {
  return props.categories.filter(category => category.media_type === mediaType)
}

/** 将业务标签和有界浮层参数传给分类选择器。 */
function comboboxMenuProps(label: string) {
  return {
    activatorProps: { 'aria-label': label },
    contentClass: 'classification-category-menu',
    maxHeight: 280,
    location: 'bottom start' as const,
    offset: 4,
  }
}

/** 开始新增当前分段的分类。 */
function startAddCategory(): void {
  draft.value = {
    originalId: null,
    id: '',
    mediaType: activeMediaType.value,
    name: '',
    pathText: '',
    enabled: true,
  }
  validationMessage.value = ''
  statusMessage.value = t('setting.classification.category.addingStatus', { mediaType: activeMediaType.value })
}

/** 将现有分类复制到本地表单，保存前不修改父级数据。 */
function startEditCategory(category: ClassificationCategory): void {
  activeMediaType.value = category.media_type
  draft.value = {
    originalId: category.id,
    id: category.id,
    mediaType: category.media_type,
    name: category.name,
    pathText: category.path.join('/'),
    enabled: category.enabled,
  }
  validationMessage.value = ''
  statusMessage.value = t('setting.classification.category.editingStatus', { name: category.name })
}

/** 取消当前新增或编辑，并清除表单错误。 */
function cancelEdit(): void {
  draft.value = null
  validationMessage.value = ''
  statusMessage.value = t('setting.classification.category.cancelledStatus')
}

/** 校验并提交分类草稿；既有分类始终沿用创建时的稳定 ID。 */
function saveDraft(): void {
  const currentDraft = draft.value
  if (!currentDraft) return

  const id = currentDraft.originalId ?? currentDraft.id.trim()
  const name = currentDraft.name.trim()
  if (!name) {
    validationMessage.value = t('setting.classification.category.nameRequired')
    return
  }
  if (!id) {
    validationMessage.value = t('setting.classification.category.idRequired')
    return
  }
  if (props.categories.some(category => category.id === id && category.id !== currentDraft.originalId)) {
    validationMessage.value = t('setting.classification.category.idDuplicate', { id })
    return
  }

  const originalCategory = currentDraft.originalId
    ? props.categories.find(category => category.id === currentDraft.originalId)
    : null
  if (
    originalCategory &&
    isCategoryProtected(originalCategory.id) &&
    (currentDraft.mediaType !== originalCategory.media_type || (originalCategory.enabled && !currentDraft.enabled))
  ) {
    validationMessage.value = t('setting.classification.category.protectedMutationBlocked')
    return
  }

  const parsedPath = parseCategoryPath(currentDraft.pathText)
  if (parsedPath.error) {
    validationMessage.value = parsedPath.error
    return
  }

  const nextCategory: ClassificationCategory = {
    id,
    media_type: currentDraft.mediaType,
    name,
    path: parsedPath.path,
    enabled: currentDraft.enabled,
    labels: currentDraft.originalId
      ? [...(props.categories.find(category => category.id === currentDraft.originalId)?.labels ?? [])]
      : [],
  }
  const nextCategories = cloneCategories(props.categories)
  if (currentDraft.originalId) {
    const index = nextCategories.findIndex(category => category.id === currentDraft.originalId)
    if (index >= 0) nextCategories.splice(index, 1, nextCategory)
    else nextCategories.push(nextCategory)
  } else {
    nextCategories.push(nextCategory)
  }

  emit('update:categories', nextCategories)
  activeMediaType.value = nextCategory.media_type
  draft.value = null
  validationMessage.value = ''
  statusMessage.value = t('setting.classification.category.updatedStatus', { name: nextCategory.name })
}

/** 删除未被引用的分类；受保护分类只更新明确提示，不发出变更事件。 */
function removeCategory(category: ClassificationCategory): void {
  const hint = deletionHint(category)
  if (isCategoryProtected(category.id)) {
    statusMessage.value = hint
    return
  }

  emit('update:categories', cloneCategories(props.categories.filter(item => item.id !== category.id)))
  if (draft.value?.originalId === category.id) draft.value = null
  validationMessage.value = ''
  statusMessage.value = t('setting.classification.category.deletedStatus', { name: category.name })
}

/** 使用稳定分类 ID 更新指定媒体类型的 fallback。 */
function updateFallback(mediaType: ClassificationMediaType, categoryId: string | null): void {
  const nextFallbacks = { ...props.fallbacks }
  if (categoryId) nextFallbacks[mediaType] = categoryId
  else delete nextFallbacks[mediaType]
  emit('update:fallbacks', nextFallbacks)
  statusMessage.value = categoryId
    ? t('setting.classification.category.fallbackUpdatedStatus', { mediaType })
    : t('setting.classification.category.fallbackClearedStatus', { mediaType })
}
</script>

<template>
  <section class="classification-category-editor" aria-labelledby="classification-category-title">
    <header class="classification-category-header">
      <div class="classification-category-heading">
        <h2 id="classification-category-title">{{ t('setting.classification.category.title') }}</h2>
        <p>{{ t('setting.classification.category.description', { count: effectiveMaxDepth }) }}</p>
      </div>

      <VBtn
        icon
        color="primary"
        variant="tonal"
        :aria-label="t('setting.classification.category.add', { mediaType: activeMediaType })"
        @click="startAddCategory"
      >
        <VIcon icon="mdi-plus" />
        <VTooltip activator="parent" location="top">
          {{ t('setting.classification.category.add', { mediaType: activeMediaType }) }}
        </VTooltip>
      </VBtn>
    </header>

    <VBtnToggle
      v-model="activeMediaType"
      mandatory
      color="primary"
      variant="outlined"
      density="compact"
      class="classification-media-segments"
      :aria-label="t('setting.classification.category.mediaTypeSegments')"
    >
      <VBtn v-for="item in mediaTypes" :key="item.label" :value="item.label">
        <VIcon :icon="item.icon" start />
        {{ item.label }}
      </VBtn>
    </VBtnToggle>

    <p class="sr-only" role="status" aria-live="polite">{{ statusMessage }}</p>

    <VDialog
      :model-value="Boolean(draft)"
      class="classification-category-dialog"
      content-class="classification-category-dialog-content"
      width="calc(100% - 24px)"
      max-width="720"
      scrollable
      @update:model-value="
        value => {
          if (!value) cancelEdit()
        }
      "
    >
      <VCard
        v-if="draft"
        class="classification-category-form"
        tag="section"
        variant="flat"
        aria-labelledby="classification-category-form-title"
        :aria-describedby="validationMessage ? validationErrorId : undefined"
      >
        <div class="classification-category-form-header">
          <h3 id="classification-category-form-title">
            {{
              draft.originalId
                ? t('setting.classification.category.editTitle')
                : t('setting.classification.category.addTitle')
            }}
          </h3>
          <div class="classification-category-form-actions">
            <VBtn icon variant="text" :aria-label="t('setting.classification.category.cancelEdit')" @click="cancelEdit">
              <VIcon icon="mdi-close" />
              <VTooltip activator="parent" location="top">
                {{ t('setting.classification.category.cancelEdit') }}
              </VTooltip>
            </VBtn>
            <VBtn
              icon
              color="primary"
              variant="tonal"
              :aria-label="t('setting.classification.category.save')"
              @click="saveDraft"
            >
              <VIcon icon="mdi-content-save-outline" />
              <VTooltip activator="parent" location="top">
                {{ t('setting.classification.category.save') }}
              </VTooltip>
            </VBtn>
          </div>
        </div>

        <div class="classification-category-form-grid">
          <VTextField
            v-model="draft.name"
            :label="t('setting.classification.category.name')"
            hide-details="auto"
            required
          />
          <VTextField
            v-model="draft.id"
            :label="t('setting.classification.category.stableId')"
            :hint="
              draft.originalId
                ? t('setting.classification.category.existingIdHint')
                : t('setting.classification.category.newIdHint')
            "
            persistent-hint
            :readonly="draft.originalId !== null"
            required
          />
          <VTextField
            v-model="draft.pathText"
            :label="t('setting.classification.category.path')"
            :hint="t('setting.classification.category.pathHint', { count: effectiveMaxDepth })"
            persistent-hint
            required
          />
          <VSelect
            v-model="draft.mediaType"
            :label="t('setting.classification.category.mediaType')"
            :aria-label="t('setting.classification.category.mediaType')"
            :menu-props="comboboxMenuProps(t('setting.classification.category.mediaType'))"
            :items="mediaTypes"
            item-title="label"
            item-value="label"
            hide-details="auto"
            :disabled="draftReferenceReasons.length > 0"
          />
        </div>

        <VSwitch
          v-model="draft.enabled"
          :label="t('setting.classification.category.enabled')"
          color="primary"
          hide-details
          :disabled="draftReferenceReasons.length > 0 && draft.enabled"
        />
        <VAlert
          v-if="draftReferenceReasons.length"
          type="warning"
          variant="tonal"
          density="compact"
          :title="t('setting.classification.category.protectedEditTitle')"
        >
          {{ t('setting.classification.category.protectedEditHint') }}
          <ul class="classification-category-reference-list">
            <li v-for="reason in draftReferenceReasons" :key="reason">{{ reason }}</li>
          </ul>
        </VAlert>
        <p
          v-if="validationMessage"
          :id="validationErrorId"
          class="classification-category-error"
          role="alert"
          data-testid="classification-category-error"
        >
          {{ validationMessage }}
        </p>
      </VCard>
    </VDialog>

    <div
      class="classification-category-list"
      :aria-label="t('setting.classification.category.listAria', { mediaType: activeMediaType })"
    >
      <article
        v-for="category in visibleCategories"
        :key="category.id"
        class="classification-category-row"
        :data-category-id="category.id"
      >
        <div class="classification-category-summary">
          <div class="classification-category-title-line">
            <strong>{{ category.name }}</strong>
            <VChip size="small" :color="category.enabled ? 'success' : undefined" variant="tonal">
              {{
                category.enabled
                  ? t('setting.classification.category.enabledState')
                  : t('setting.classification.category.disabledState')
              }}
            </VChip>
          </div>
          <code class="classification-category-id">{{ category.id }}</code>
          <ol
            class="classification-category-path"
            :aria-label="t('setting.classification.category.pathAria', { name: category.name })"
          >
            <li v-for="(segment, index) in category.path" :key="`${category.id}-${index}`">
              <VIcon v-if="index > 0" icon="mdi-chevron-right" size="16" aria-hidden="true" />
              <span>{{ segment }}</span>
            </li>
            <li v-if="category.path.length === 0" class="classification-category-path-empty">
              {{ t('setting.classification.category.pathUnset') }}
            </li>
          </ol>

          <p
            v-if="isCategoryProtected(category.id)"
            :id="`classification-delete-protection-${category.id}`"
            class="classification-category-protection"
            role="note"
          >
            <VIcon icon="mdi-lock-outline" size="16" aria-hidden="true" />
            {{ protectionHint(category) }}
          </p>
        </div>

        <div class="classification-category-actions">
          <VBtn
            icon
            variant="text"
            :aria-label="t('setting.classification.category.edit', { name: category.name })"
            @click="startEditCategory(category)"
          >
            <VIcon icon="mdi-pencil-outline" />
            <VTooltip activator="parent" location="top">
              {{ t('setting.classification.category.editTitle') }}
            </VTooltip>
          </VBtn>
          <span
            class="classification-delete-activator"
            :tabindex="isCategoryProtected(category.id) ? 0 : -1"
            :aria-label="isCategoryProtected(category.id) ? deletionHint(category) : undefined"
          >
            <VBtn
              icon
              color="error"
              variant="text"
              :disabled="isCategoryProtected(category.id)"
              :aria-label="deletionHint(category)"
              :aria-describedby="
                isCategoryProtected(category.id) ? `classification-delete-protection-${category.id}` : undefined
              "
              @click="removeCategory(category)"
            >
              <VIcon icon="mdi-delete-outline" />
              <VTooltip v-if="!isCategoryProtected(category.id)" activator="parent" location="top">
                {{ deletionHint(category) }}
              </VTooltip>
            </VBtn>
            <VTooltip v-if="isCategoryProtected(category.id)" activator="parent" location="top">
              {{ deletionHint(category) }}
            </VTooltip>
          </span>
        </div>
      </article>

      <div v-if="visibleCategories.length === 0" class="classification-category-empty" role="status">
        <VIcon icon="mdi-folder-outline" size="32" />
        <span>{{ t('setting.classification.category.empty', { mediaType: activeMediaType }) }}</span>
      </div>
    </div>

    <section class="classification-fallbacks" aria-labelledby="classification-fallback-title">
      <div>
        <h3 id="classification-fallback-title">{{ t('setting.classification.category.fallbackTitle') }}</h3>
        <p>{{ t('setting.classification.category.fallbackHint') }}</p>
      </div>
      <div class="classification-fallback-grid">
        <VSelect
          v-for="item in mediaTypes"
          :key="item.label"
          :model-value="fallbacks[item.label] ?? null"
          :label="t('setting.classification.category.fallbackFor', { mediaType: item.label })"
          :aria-label="t('setting.classification.category.fallbackFor', { mediaType: item.label })"
          :menu-props="comboboxMenuProps(t('setting.classification.category.fallbackFor', { mediaType: item.label }))"
          :items="fallbackItems(item.label)"
          :item-title="fallbackItemTitle"
          item-value="id"
          clearable
          hide-details="auto"
          @update:model-value="updateFallback(item.label, $event)"
        />
      </div>
    </section>
  </section>
</template>

<style scoped>
.classification-category-editor {
  display: grid;
  gap: 20px;
  inline-size: 100%;
  min-inline-size: 0;
}

.classification-category-header,
.classification-category-form-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.classification-category-heading,
.classification-fallbacks > div:first-child {
  min-inline-size: 0;
}

.classification-category-heading h2,
.classification-category-form h3,
.classification-fallbacks h3 {
  margin: 0;
  font-size: 1rem;
  line-height: 1.4;
  letter-spacing: 0;
}

.classification-category-heading p,
.classification-fallbacks p {
  margin: 4px 0 0;
  color: rgb(var(--v-theme-on-surface-variant));
  font-size: 0.875rem;
}

.classification-media-segments {
  display: inline-grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  inline-size: min(100%, 360px);
  max-inline-size: 100%;
  justify-self: start;
}

.classification-media-segments :deep(.v-btn) {
  min-inline-size: 0;
}

.classification-category-form {
  display: grid;
  gap: 16px;
  padding: 16px;
  max-block-size: calc(100dvh - 32px);
  overflow-y: auto;
  border: 1px solid var(--classification-border, rgba(var(--v-border-color), var(--v-border-opacity)));
  border-radius: 8px;
  background: var(--classification-panel-raised, rgb(var(--v-theme-surface)));
}

.classification-category-form-actions,
.classification-category-actions {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 4px;
}

.classification-category-form-grid,
.classification-fallback-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.classification-category-error {
  margin: 0;
  color: rgb(var(--v-theme-error));
  font-size: 0.875rem;
  font-weight: 500;
}

.classification-category-reference-list {
  display: grid;
  gap: 4px;
  margin: 8px 0 0;
  padding-inline-start: 20px;
}

.classification-category-list {
  display: grid;
  gap: 10px;
  min-inline-size: 0;
}

.classification-category-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 12px;
  align-items: center;
  min-inline-size: 0;
  padding: 14px 12px 14px 16px;
  border: 1px solid var(--classification-border, rgba(var(--v-border-color), var(--v-border-opacity)));
  border-radius: 8px;
  background: var(--classification-panel-raised, rgb(var(--v-theme-surface)));
}

.classification-category-summary {
  display: grid;
  gap: 6px;
  min-inline-size: 0;
}

.classification-category-title-line {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.classification-category-id {
  overflow-wrap: anywhere;
  color: rgb(var(--v-theme-on-surface-variant));
  font-size: 0.8125rem;
}

.classification-category-path {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 2px;
  min-inline-size: 0;
  margin: 0;
  padding: 0;
  list-style: none;
}

.classification-category-path li {
  display: inline-flex;
  align-items: center;
  min-inline-size: 0;
}

.classification-category-path span {
  overflow-wrap: anywhere;
}

.classification-category-path-empty {
  color: rgb(var(--v-theme-on-surface-variant));
  font-size: 0.875rem;
}

.classification-category-protection {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin: 2px 0 0;
  color: rgb(var(--v-theme-warning));
  font-size: 0.8125rem;
  overflow-wrap: anywhere;
}

.classification-delete-activator {
  display: inline-flex;
  border-radius: 50%;
}

.classification-delete-activator:focus-visible {
  outline: 2px solid rgb(var(--v-theme-primary));
  outline-offset: 2px;
}

.classification-category-empty {
  display: grid;
  justify-items: center;
  gap: 6px;
  padding: 28px 16px;
  border-block: 1px dashed var(--classification-border, rgba(var(--v-border-color), var(--v-border-opacity)));
  color: rgb(var(--v-theme-on-surface-variant));
}

.classification-fallbacks {
  display: grid;
  gap: 14px;
  padding-block-start: 4px;
  border-block-start: 1px solid var(--classification-border, rgba(var(--v-border-color), var(--v-border-opacity)));
}

.classification-fallback-grid {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

:global(html[data-theme='glass'] .classification-category-dialog .classification-category-form) {
  border-color: var(--glass-border-raised) !important;
  -webkit-backdrop-filter: var(--glass-overlay-backdrop-filter) !important;
  backdrop-filter: var(--glass-overlay-backdrop-filter) !important;
  background-color: var(--glass-overlay-surface) !important;
  background-image: var(--glass-sheen) !important;
  box-shadow: var(--glass-shadow-raised) !important;
}

:global(html[data-theme='glass'] .classification-category-dialog .v-overlay__content) {
  max-block-size: calc(100dvh - 24px);
  padding: 0;
}

:global(html[data-theme='glass'] .classification-category-dialog .classification-category-form .v-field),
:global(html[data-theme='glass'] .classification-category-dialog .classification-category-form .v-selection-control) {
  --v-field-border-opacity: 0.72;
}

:global(html[data-theme='glass'] .classification-category-dialog .classification-category-form .v-field__overlay),
:global(
  html[data-theme='glass'] .classification-category-dialog .classification-category-form .v-selection-control__wrapper
) {
  background-color: var(--glass-control) !important;
}

:global(
  html[data-theme='glass']
    .classification-category-dialog
    .classification-category-form
    .v-field--focused
    .v-field__overlay
),
:global(
  html[data-theme='glass']
    .classification-category-dialog
    .classification-category-form
    .v-selection-control--dirty
    .v-selection-control__wrapper
) {
  background-color: var(--glass-control-prominent) !important;
}

:global(html[data-theme='glass'] .classification-category-dialog-content .v-card-actions) {
  border-block-start: 1px solid var(--glass-border);
}

:global(html[data-theme='glass'] .classification-category-dialog > .v-overlay__scrim) {
  -webkit-backdrop-filter: blur(8px);
  backdrop-filter: blur(8px);
  background: rgba(3, 7, 18, 72%);
}

:global(html[data-theme='transparent'] .classification-category-dialog .classification-category-form) {
  border-color: rgba(var(--v-theme-on-surface), 0.16) !important;
  -webkit-backdrop-filter: blur(var(--transparent-blur-heavy)) !important;
  backdrop-filter: blur(var(--transparent-blur-heavy)) !important;
  background-color: rgba(var(--v-theme-surface), var(--transparent-opacity-heavy)) !important;
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.28) !important;
}

:global(html[data-theme='transparent'] .classification-category-dialog .classification-category-form .v-field),
:global(
  html[data-theme='transparent'] .classification-category-dialog .classification-category-form .v-selection-control
) {
  --v-field-border-opacity: 0.72;
}

:global(html[data-theme='transparent'] .classification-category-dialog .classification-category-form .v-field__overlay),
:global(
  html[data-theme='transparent']
    .classification-category-dialog
    .classification-category-form
    .v-selection-control__wrapper
) {
  background-color: rgba(var(--v-theme-surface), var(--transparent-opacity)) !important;
}

:global(
  html[data-theme='transparent']
    .classification-category-dialog
    .classification-category-form
    .v-field--focused
    .v-field__overlay
),
:global(
  html[data-theme='transparent']
    .classification-category-dialog
    .classification-category-form
    .v-selection-control--dirty
    .v-selection-control__wrapper
) {
  background-color: rgba(var(--v-theme-primary), 0.14) !important;
}

:global(html[data-theme='transparent'] .classification-category-dialog-content .v-card-actions) {
  border-block-start: 1px solid rgba(var(--v-theme-on-surface), 0.14);
}

.sr-only {
  position: absolute;
  overflow: hidden;
  inline-size: 1px;
  block-size: 1px;
  padding: 0;
  border: 0;
  margin: -1px;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
}

@media (max-width: 720px) {
  .classification-category-form-grid,
  .classification-fallback-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (max-width: 600px) {
  .classification-media-segments {
    inline-size: 100%;
  }

  .classification-media-segments :deep(.v-btn) {
    padding-inline: 8px;
  }

  .classification-category-row {
    grid-template-columns: minmax(0, 1fr);
  }

  .classification-category-actions {
    justify-content: flex-end;
  }
}
</style>
