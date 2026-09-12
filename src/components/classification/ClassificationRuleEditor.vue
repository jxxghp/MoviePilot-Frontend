<script lang="ts" setup>
import type {
  ClassificationCategory,
  ClassificationConditionNode,
  ClassificationFieldDefinition,
  ClassificationMediaType,
  ClassificationRule,
  ClassificationRuleKind,
  ClassificationSourceOption,
} from '@/api/mediaClassificationTypes'
import {
  createClassificationTypeCondition,
  formatClassificationCategoryOptionTitle,
  normalizeClassificationConditionNode,
} from '@/utils/mediaClassification'
import ClassificationConditionBuilder from './ClassificationConditionBuilder.vue'

const MEDIA_TYPES: ClassificationMediaType[] = ['电影', '电视剧', '音乐']
const DEFAULT_MAX_RULES = 200
const DEFAULT_MAX_CONDITION_DEPTH = 8
const classificationRuleMenuProps = {
  contentClass: 'classification-rule-menu',
  maxHeight: 280,
  location: 'bottom start' as const,
  offset: 4,
}

const props = withDefaults(
  defineProps<{
    rules: ClassificationRule[]
    categories: ClassificationCategory[]
    fields: readonly ClassificationFieldDefinition[]
    sourceOptions?: readonly ClassificationSourceOption[]
    maxRules?: number
    maxConditionDepth?: number
    advanced?: boolean
  }>(),
  {
    sourceOptions: () => [],
    maxRules: DEFAULT_MAX_RULES,
    maxConditionDepth: DEFAULT_MAX_CONDITION_DEPTH,
    advanced: true,
  },
)

const emit = defineEmits<{
  'update:rules': [rules: ClassificationRule[]]
}>()
const { t } = useI18n()

// 拖拽能力仅在规则编辑器出现时加载，避免增加其他设置页的首屏体积。
const Draggable = defineAsyncComponent(() => import('vuedraggable').then(module => module.default))
const draftRules = ref<ClassificationRule[]>([])
const expandedRuleId = ref<string | null>(null)
const ruleIdDrafts = ref<Record<number, string>>({})
const ruleIdErrors = ref<Record<number, string>>({})

/** 按条件联合类型递归复制，避免 Vue 响应式代理进入 structuredClone。 */
function cloneCondition(node: ClassificationConditionNode): ClassificationConditionNode {
  return normalizeClassificationConditionNode(node)
}

/** 深拷贝规则，隔离父级策略草稿和编辑器内部的临时修改。 */
function cloneRule(rule: ClassificationRule): ClassificationRule {
  return {
    ...rule,
    media_types: [...rule.media_types],
    sources: [...rule.sources],
    when: normalizeClassificationConditionNode(rule.when, createClassificationTypeCondition(rule.media_types)),
    target: {
      category_id: rule.target.category_id ?? null,
      labels: [...rule.target.labels],
    },
  }
}

/** 按当前数组索引生成零基优先级，与后端 schema 和迁移保持一致。 */
function normalizePriorities(rules: ClassificationRule[]): ClassificationRule[] {
  return rules.map((rule, index) => ({ ...cloneRule(rule), priority: index }))
}

/** 更新本地草稿并向父级提交一个不共享引用的新数组。 */
function commitRules(rules: ClassificationRule[]) {
  const normalized = normalizePriorities(rules)
  draftRules.value = normalized
  emit('update:rules', normalized.map(cloneRule))
}

/** 生成在当前规则集合中唯一且可读的稳定标识。 */
function uniqueId(base: string): string {
  const usedIds = new Set(draftRules.value.map(rule => rule.id))
  if (!usedIds.has(base)) return base

  let suffix = 2
  while (usedIds.has(`${base}-${suffix}`)) suffix += 1
  return `${base}-${suffix}`
}

/** 生成不与现有规则重复的默认名称。 */
function uniqueName(base: string): string {
  const usedNames = new Set(draftRules.value.map(rule => rule.name))
  if (!usedNames.has(base)) return base

  let suffix = 2
  while (usedNames.has(`${base} ${suffix}`)) suffix += 1
  return `${base} ${suffix}`
}

/** 返回新规则的首个可用顺序编号。 */
function nextRuleNumber(): number {
  let sequence = draftRules.value.length + 1
  while (draftRules.value.some(rule => rule.id === `rule-${sequence}`)) sequence += 1
  return sequence
}

/** 按当前规则媒体类型返回允许选择的分类目标。 */
function categoryItems(rule: ClassificationRule) {
  const selectedMediaTypes = new Set(rule.media_types)
  return props.categories
    .filter(category => selectedMediaTypes.size === 0 || selectedMediaTypes.has(category.media_type))
    .map(category => ({
      title: `${formatClassificationCategoryOptionTitle(category, { includeMediaType: rule.media_types.length !== 1 })}${category.enabled ? '' : `（${t('setting.classification.rule.disabledCategory')}）`}`,
      value: category.id,
      props: { disabled: !category.enabled },
    }))
}

/** 判断分类目标是否仍与规则媒体类型兼容。 */
function isCategoryCompatible(categoryId: string | null | undefined, mediaTypes: ClassificationMediaType[]): boolean {
  if (!categoryId) return true
  const category = props.categories.find(item => item.id === categoryId)
  return Boolean(category && (mediaTypes.length === 0 || mediaTypes.includes(category.media_type)))
}

/** 替换单条规则并统一提交，避免模板直接修改 props。 */
function updateRule(index: number, patch: Partial<ClassificationRule>) {
  const current = draftRules.value[index]
  if (!current) return
  if (patch.id !== undefined) {
    const id = String(patch.id).trim()
    if (!/^[a-z0-9][a-z0-9._-]{0,127}$/.test(id)) return
    if (draftRules.value.some((rule, ruleIndex) => ruleIndex !== index && rule.id === id)) return
  }
  const nextRules = draftRules.value.map((rule, ruleIndex) =>
    ruleIndex === index ? cloneRule({ ...current, ...patch }) : cloneRule(rule),
  )
  commitRules(nextRules)
  if (patch.id !== undefined && expandedRuleId.value === current.id) expandedRuleId.value = patch.id
}

/** 返回规则编号输入框的本地值，允许用户先清空再输入新编号。 */
function ruleIdValue(index: number, rule: ClassificationRule): string {
  return ruleIdDrafts.value[index] ?? rule.id
}

/** 返回规则编号校验错误，并把错误绑定到对应的输入框。 */
function ruleIdError(index: number): string | undefined {
  return ruleIdErrors.value[index]
}

/** 校验并提交规则稳定编号，避免静默丢弃用户输入。 */
function updateRuleId(index: number, rawValue: unknown): void {
  const value = String(rawValue ?? '').trim()
  ruleIdDrafts.value[index] = value
  if (!/^[a-z0-9][a-z0-9._-]{0,127}$/.test(value)) {
    ruleIdErrors.value[index] = t('setting.classification.rule.invalidId')
    return
  }
  if (draftRules.value.some((rule, ruleIndex) => ruleIndex !== index && rule.id === value)) {
    ruleIdErrors.value[index] = t('setting.classification.rule.duplicateId', { id: value })
    return
  }
  delete ruleIdErrors.value[index]
  updateRule(index, { id: value })
}

/** 按新媒体类型修复条件树中的不兼容字段，避免留下无法编辑的失效条件。 */
function normalizeConditionForMediaTypes(
  node: ClassificationConditionNode,
  mediaTypes: ClassificationMediaType[],
): ClassificationConditionNode {
  if ('field' in node) {
    const definition = props.fields.find(field => field.id === node.field)
    if (
      definition &&
      (mediaTypes.length === 0 || mediaTypes.every(mediaType => definition.media_types.includes(mediaType)))
    ) {
      return cloneCondition(node)
    }
    return createClassificationTypeCondition(mediaTypes)
  }
  if (node.all !== undefined && node.all !== null) {
    return { all: node.all.map(child => normalizeConditionForMediaTypes(child, mediaTypes)) }
  }
  if (node.any !== undefined && node.any !== null) {
    return { any: node.any.map(child => normalizeConditionForMediaTypes(child, mediaTypes)) }
  }
  return {
    not: node.not
      ? normalizeConditionForMediaTypes(node.not, mediaTypes)
      : createClassificationTypeCondition(mediaTypes),
  }
}

/** 新增一条具备稳定默认值的分类规则。 */
function addRule() {
  if (draftRules.value.length >= props.maxRules) return
  const sequence = nextRuleNumber()
  const mediaTypes: ClassificationMediaType[] = ['电影']
  const defaultCategory = props.categories.find(category => category.enabled && category.media_type === mediaTypes[0])
  const rule: ClassificationRule = {
    id: uniqueId(`rule-${sequence}`),
    name: uniqueName(t('setting.classification.rule.newName', { sequence })),
    kind: 'category',
    enabled: true,
    priority: draftRules.value.length,
    media_types: mediaTypes,
    sources: [],
    when: createClassificationTypeCondition(mediaTypes),
    target: {
      category_id: defaultCategory?.id ?? null,
      labels: [],
    },
  }
  commitRules([...draftRules.value, rule])
  expandedRuleId.value = rule.id
}

/** 复制规则的完整条件与输出，同时生成新的稳定 ID 和名称。 */
function copyRule(index: number) {
  if (draftRules.value.length >= props.maxRules) return
  const source = draftRules.value[index]
  if (!source) return
  const copied = cloneRule(source)
  copied.id = uniqueId(`${source.id}-copy`)
  copied.name = uniqueName(t('setting.classification.rule.copyName', { name: source.name }))
  commitRules([...draftRules.value.slice(0, index + 1), copied, ...draftRules.value.slice(index + 1)])
  expandedRuleId.value = copied.id
}

/** 删除指定位置的规则。 */
function deleteRule(index: number) {
  const deletedRule = draftRules.value[index]
  if (!deletedRule) return
  if (!window.confirm(t('setting.classification.rule.deleteConfirm', { name: deletedRule.name || deletedRule.id })))
    return
  const deletedId = deletedRule.id
  commitRules(draftRules.value.filter((_, ruleIndex) => ruleIndex !== index))
  if (expandedRuleId.value === deletedId) expandedRuleId.value = null
  delete ruleIdDrafts.value[index]
  delete ruleIdErrors.value[index]
}

/** 将规则移动到目标位置，并保护首尾边界。 */
function moveRule(index: number, targetIndex: number) {
  if (targetIndex < 0 || targetIndex >= draftRules.value.length || index === targetIndex) return
  const nextRules = draftRules.value.map(cloneRule)
  const [rule] = nextRules.splice(index, 1)
  if (!rule) return
  nextRules.splice(targetIndex, 0, rule)
  commitRules(nextRules)
}

/** 切换规则类型，并移除标签规则不应携带的分类目标。 */
function updateKind(index: number, value: ClassificationRuleKind | null) {
  if (!value) return
  const rule = draftRules.value[index]
  if (!rule) return
  updateRule(index, {
    kind: value,
    target: {
      ...rule.target,
      category_id: value === 'label' ? null : rule.target.category_id,
    },
  })
}

/** 更新规则媒体类型，并清理已不兼容的分类目标。 */
function updateMediaTypes(index: number, value: ClassificationMediaType[] | null) {
  const rule = draftRules.value[index]
  if (!rule) return
  const mediaTypes = value ?? []
  updateRule(index, {
    media_types: [...mediaTypes],
    when: normalizeConditionForMediaTypes(rule.when, mediaTypes),
    target: {
      ...rule.target,
      category_id: isCategoryCompatible(rule.target.category_id, mediaTypes) ? rule.target.category_id : null,
    },
  })
}

/** 更新规则限定的数据源集合。 */
function updateSources(index: number, value: string[] | null) {
  updateRule(index, { sources: [...(value ?? [])] })
}

/** 更新条件树并保留其他规则字段。 */
function updateCondition(index: number, value: ClassificationConditionNode) {
  updateRule(index, { when: cloneCondition(value) })
}

/** 更新分类和标签输出。 */
function updateTarget(index: number, patch: Partial<ClassificationRule['target']>) {
  const rule = draftRules.value[index]
  if (!rule) return
  updateRule(index, {
    target: {
      category_id: patch.category_id === undefined ? rule.target.category_id : patch.category_id,
      labels: patch.labels === undefined ? [...rule.target.labels] : [...patch.labels],
    },
  })
}

/** 只展开当前正在编辑的规则，避免长条件树同时占满移动端页面。 */
function toggleRule(ruleId: string): void {
  expandedRuleId.value = expandedRuleId.value === ruleId ? null : ruleId
}

/** 递归统计叶子条件数量，供折叠摘要快速判断规则复杂度。 */
function conditionCount(node: ClassificationConditionNode): number {
  if ('field' in node) return 1
  if (node.all) return node.all.reduce((count, child) => count + conditionCount(child), 0)
  if (node.any) return node.any.reduce((count, child) => count + conditionCount(child), 0)
  return node.not ? conditionCount(node.not) : 0
}

/** 将媒体类型压缩为可扫描的规则摘要。 */
function mediaTypeSummary(rule: ClassificationRule): string {
  return rule.media_types.length ? rule.media_types.join('、') : t('setting.classification.rule.allMediaTypes')
}

/** 将来源限制压缩为可扫描的规则摘要。 */
function sourceSummary(rule: ClassificationRule): string {
  return rule.sources.length
    ? rule.sources
        .map(source => props.sourceOptions.find(option => option.value === source)?.title ?? source)
        .join('、')
    : t('setting.classification.rule.allSources')
}

/** 返回规则输出的人类可读摘要，不暴露稳定 ID 作为首要信息。 */
function targetSummary(rule: ClassificationRule): string {
  if (rule.kind === 'label')
    return rule.target.labels.length
      ? t('setting.classification.rule.labelsSummary', { labels: rule.target.labels.join('、') })
      : t('setting.classification.rule.unsetLabels')
  const category = props.categories.find(item => item.id === rule.target.category_id)
  return category ? formatClassificationCategoryOptionTitle(category) : t('setting.classification.rule.unsetCategory')
}

const sourceItems = computed(() => {
  const knownOptions = new Map(props.sourceOptions.map(option => [option.value, option.title]))
  const sourceIds = new Set([
    ...props.sourceOptions.map(option => option.value),
    ...props.fields.flatMap(field => Object.keys(field.source_support)),
  ])
  return [...sourceIds]
    .sort((left, right) => (knownOptions.get(left) ?? left).localeCompare(knownOptions.get(right) ?? right))
    .map(value => ({ title: knownOptions.get(value) ?? value, value }))
})

const orderedRules = computed({
  get: () => draftRules.value,
  set: (rules: ClassificationRule[]) => commitRules(rules),
})

const hasReachedLimit = computed(() => draftRules.value.length >= props.maxRules)

watch(
  () => props.rules,
  rules => {
    draftRules.value = normalizePriorities(rules)
    ruleIdDrafts.value = {}
    ruleIdErrors.value = {}
  },
  { deep: true, immediate: true },
)
</script>

<template>
  <section class="classification-rule-editor" :aria-label="t('setting.classification.rule.editorAria')">
    <header class="classification-rule-toolbar">
      <div class="classification-rule-count">
        <strong>{{
          props.advanced
            ? t('setting.classification.rule.orderedRules')
            : t('setting.classification.rule.matchingRules')
        }}</strong>
        <span>{{ draftRules.length }} / {{ maxRules }}</span>
      </div>
      <VBtn
        color="primary"
        variant="tonal"
        prepend-icon="mdi-plus"
        :disabled="hasReachedLimit"
        :aria-label="t('setting.classification.rule.add')"
        @click="addRule"
      >
        {{ t('setting.classification.rule.add') }}
        <VTooltip activator="parent" location="top">
          {{
            hasReachedLimit
              ? t('setting.classification.rule.limitReached', { count: maxRules })
              : t('setting.classification.rule.add')
          }}
        </VTooltip>
      </VBtn>
    </header>

    <VAlert v-if="!props.advanced" type="info" variant="tonal" density="compact">
      {{ t('setting.classification.rule.simpleModeHint') }}
    </VAlert>

    <Draggable
      v-model="orderedRules"
      item-key="id"
      handle=".classification-rule-drag"
      tag="div"
      :component-data="{ class: 'classification-rule-list' }"
    >
      <template #item="{ element: rule, index }">
        <VCard
          class="classification-rule"
          :class="{ 'classification-rule--expanded': expandedRuleId === rule.id }"
          variant="outlined"
          role="article"
          :aria-label="t('setting.classification.rule.itemAria', { index: index + 1, name: rule.name || rule.id })"
        >
          <div class="classification-rule-head">
            <VBtn
              class="classification-rule-drag cursor-move"
              data-testid="classification-rule-drag"
              icon
              variant="text"
              color="secondary"
              :aria-label="t('setting.classification.rule.dragAria', { name: rule.name || rule.id })"
            >
              <VIcon icon="mdi-drag-vertical" size="20" />
              <VTooltip activator="parent" location="top">{{ t('setting.classification.rule.drag') }}</VTooltip>
            </VBtn>

            <button
              class="classification-rule-summary"
              type="button"
              :aria-expanded="expandedRuleId === rule.id"
              :aria-controls="`classification-rule-body-${rule.id}`"
              @click="toggleRule(rule.id)"
            >
              <span class="classification-rule-title">
                <strong>{{ rule.name || rule.id }}</strong>
                <span>{{ t('setting.classification.rule.priority', { priority: rule.priority + 1 }) }}</span>
              </span>
              <span class="classification-rule-meta">
                <span>{{ mediaTypeSummary(rule) }}</span>
                <span>{{ sourceSummary(rule) }}</span>
                <span>{{ t('setting.classification.rule.conditionCount', { count: conditionCount(rule.when) }) }}</span>
                <span>{{ targetSummary(rule) }}</span>
              </span>
            </button>

            <VSwitch
              :model-value="rule.enabled"
              class="classification-rule-enabled"
              color="primary"
              density="compact"
              hide-details
              inset
              :aria-label="t('setting.classification.rule.enableAria', { name: rule.name || rule.id })"
              @update:model-value="value => updateRule(index, { enabled: Boolean(value) })"
            />

            <VMenu location="bottom end">
              <template #activator="{ props: menuProps }">
                <IconBtn
                  v-bind="menuProps"
                  icon="mdi-dots-vertical"
                  variant="text"
                  :aria-label="t('setting.classification.rule.actionsAria', { name: rule.name || rule.id })"
                />
              </template>
              <VList density="compact" min-width="180">
                <VListItem
                  prepend-icon="mdi-arrow-up"
                  :title="t('setting.classification.rule.moveUp', { name: rule.name || rule.id })"
                  :disabled="index === 0"
                  @click="moveRule(index, index - 1)"
                />
                <VListItem
                  prepend-icon="mdi-arrow-down"
                  :title="t('setting.classification.rule.moveDown', { name: rule.name || rule.id })"
                  :disabled="index === draftRules.length - 1"
                  @click="moveRule(index, index + 1)"
                />
                <VListItem
                  prepend-icon="mdi-content-copy"
                  :title="t('setting.classification.rule.copy', { name: rule.name || rule.id })"
                  :disabled="hasReachedLimit"
                  @click="copyRule(index)"
                />
                <VListItem
                  prepend-icon="mdi-delete-outline"
                  :title="t('setting.classification.rule.delete', { name: rule.name || rule.id })"
                  base-color="error"
                  @click="deleteRule(index)"
                />
              </VList>
            </VMenu>

            <IconBtn
              :icon="expandedRuleId === rule.id ? 'mdi-chevron-up' : 'mdi-chevron-down'"
              variant="text"
              :aria-label="
                t(
                  expandedRuleId === rule.id
                    ? 'setting.classification.rule.collapse'
                    : 'setting.classification.rule.edit',
                  { name: rule.name || rule.id },
                )
              "
              @click="toggleRule(rule.id)"
            />
          </div>

          <div
            v-if="expandedRuleId === rule.id"
            :id="`classification-rule-body-${rule.id}`"
            class="classification-rule-body"
          >
            <div class="classification-rule-grid classification-rule-grid--identity">
              <VTextField
                :model-value="rule.name"
                :label="t('setting.classification.rule.name')"
                density="compact"
                hide-details="auto"
                :aria-label="t('setting.classification.rule.nameAria', { index: index + 1 })"
                @update:model-value="value => updateRule(index, { name: value })"
              />
              <VTextField
                v-if="props.advanced"
                :model-value="ruleIdValue(index, rule)"
                :error-messages="ruleIdError(index)"
                :label="t('setting.classification.rule.id')"
                density="compact"
                hide-details="auto"
                :aria-label="t('setting.classification.rule.idAria', { index: index + 1 })"
                @update:model-value="value => updateRuleId(index, value)"
              />
              <VBtnToggle
                v-if="props.advanced"
                :model-value="rule.kind"
                mandatory
                divided
                density="compact"
                variant="outlined"
                class="classification-rule-kind"
                :aria-label="t('setting.classification.rule.kindAria', { name: rule.name || rule.id })"
                @update:model-value="value => updateKind(index, value)"
              >
                <VBtn value="category">{{ t('setting.classification.rule.categoryKind') }}</VBtn>
                <VBtn value="label">{{ t('setting.classification.rule.labelKind') }}</VBtn>
              </VBtnToggle>
            </div>

            <div class="classification-rule-grid">
              <VSelect
                :model-value="rule.media_types"
                :items="MEDIA_TYPES"
                :label="t('setting.classification.rule.mediaTypes')"
                multiple
                chips
                closable-chips
                clearable
                density="compact"
                hide-details="auto"
                :menu-props="classificationRuleMenuProps"
                :aria-label="t('setting.classification.rule.mediaTypesAria', { name: rule.name || rule.id })"
                @update:model-value="value => updateMediaTypes(index, value)"
              />
              <VSelect
                v-if="props.advanced"
                :model-value="rule.sources"
                :items="sourceItems"
                :label="t('setting.classification.rule.sources')"
                multiple
                chips
                closable-chips
                clearable
                density="compact"
                hide-details="auto"
                :hint="t('setting.classification.rule.sourcesHint')"
                :menu-props="classificationRuleMenuProps"
                :aria-label="t('setting.classification.rule.sourcesAria', { name: rule.name || rule.id })"
                @update:model-value="value => updateSources(index, value)"
              />
            </div>

            <div class="classification-rule-condition">
              <div class="classification-rule-section-title">{{ t('setting.classification.rule.conditions') }}</div>
              <ClassificationConditionBuilder
                :model-value="rule.when"
                :fields="fields"
                :media-types="rule.media_types"
                :sources="rule.sources"
                :source-options="sourceOptions"
                :advanced="props.advanced"
                :max-depth="maxConditionDepth"
                @update:model-value="value => updateCondition(index, value)"
              />
            </div>

            <div class="classification-rule-target">
              <div class="classification-rule-section-title">{{ t('setting.classification.rule.action') }}</div>
              <div class="classification-rule-grid">
                <VSelect
                  v-if="rule.kind === 'category'"
                  :model-value="rule.target.category_id"
                  :items="categoryItems(rule)"
                  :label="t('setting.classification.rule.categoryTarget')"
                  clearable
                  density="compact"
                  hide-details="auto"
                  :no-data-text="t('setting.classification.rule.noCategoryOptions')"
                  :menu-props="classificationRuleMenuProps"
                  :aria-label="t('setting.classification.rule.categoryTargetAria', { name: rule.name || rule.id })"
                  @update:model-value="value => updateTarget(index, { category_id: value })"
                />
                <VCombobox
                  :model-value="rule.target.labels"
                  :label="t('setting.classification.rule.labels')"
                  multiple
                  chips
                  closable-chips
                  clearable
                  density="compact"
                  hide-details="auto"
                  :menu-props="classificationRuleMenuProps"
                  :class="{ 'classification-rule-labels--wide': rule.kind === 'label' }"
                  :aria-label="t('setting.classification.rule.labelsAria', { name: rule.name || rule.id })"
                  @update:model-value="value => updateTarget(index, { labels: value })"
                />
              </div>
            </div>
          </div>
        </VCard>
      </template>
    </Draggable>

    <div v-if="draftRules.length === 0" class="classification-rule-empty">
      <VIcon icon="mdi-filter-plus-outline" size="30" />
      <span>{{ t('setting.classification.rule.empty') }}</span>
    </div>
  </section>
</template>

<style scoped>
.classification-rule-editor {
  --glass-button-surface-hover: rgba(var(--v-theme-primary), 0.12);

  display: grid;
  gap: 12px;
  min-width: 0;
}

.classification-rule-toolbar,
.classification-rule-head,
.classification-rule-count {
  display: flex;
  align-items: center;
}

.classification-rule-toolbar,
.classification-rule-head {
  justify-content: space-between;
  gap: 12px;
}

.classification-rule-count {
  align-items: baseline;
  gap: 8px;
  min-width: 0;
}

.classification-rule-count strong {
  font-size: 1rem;
}

.classification-rule-count span {
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 0.8125rem;
}

.classification-rule-list {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  align-items: start;
  gap: 10px;
}

.classification-rule {
  display: grid;
  min-width: 0;
  overflow: hidden;
  border: 1px solid var(--classification-border, rgba(var(--v-border-color), var(--v-border-opacity)));
  border-radius: 8px;
  background-color: var(--classification-panel-raised, rgb(var(--v-theme-surface)));
}

:global(html[data-theme='glass'] .classification-rule) {
  border-color: var(--glass-border-raised) !important;
  -webkit-backdrop-filter: var(--glass-raised-backdrop-filter) !important;
  backdrop-filter: var(--glass-raised-backdrop-filter) !important;
  background-color: var(--glass-surface-raised) !important;
  background-image: var(--glass-sheen) !important;
  box-shadow: var(--glass-shadow-raised) !important;
}

.classification-rule-head {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto auto auto;
  gap: 4px;
  min-inline-size: 0;
  padding: 8px;
}

.classification-rule-drag {
  touch-action: none;
}

.classification-rule-summary {
  display: grid;
  gap: 3px;
  min-inline-size: 0;
  padding: 5px 8px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: inherit;
  cursor: pointer;
  text-align: start;
}

.classification-rule-summary:hover,
.classification-rule-summary:focus-visible {
  background: rgba(var(--v-theme-primary), 0.08);
}

.classification-rule-summary:focus-visible {
  outline: 2px solid rgb(var(--v-theme-primary));
  outline-offset: -2px;
}

.classification-rule-title,
.classification-rule-meta {
  display: flex;
  align-items: center;
  min-inline-size: 0;
}

.classification-rule-title {
  gap: 8px;
}

.classification-rule-title strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.classification-rule-title > span {
  flex: 0 0 auto;
  color: rgb(var(--v-theme-primary));
  font-size: 0.75rem;
}

.classification-rule-meta {
  flex-wrap: wrap;
  gap: 3px 10px;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 0.75rem;
}

.classification-rule-meta > span {
  position: relative;
}

.classification-rule-meta > span:not(:first-child)::before {
  position: absolute;
  inset-inline-start: -6px;
  content: '·';
}

.classification-rule-enabled {
  flex: 0 0 auto;
}

.classification-rule-body {
  display: grid;
  gap: 12px;
  min-inline-size: 0;
  padding: 12px;
  border-block-start: 1px solid var(--classification-border, rgba(var(--v-border-color), var(--v-border-opacity)));
}

.classification-rule-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  min-width: 0;
}

.classification-rule-grid--identity {
  grid-template-columns: minmax(160px, 1.2fr) minmax(150px, 1fr) auto;
}

.classification-rule-kind {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-self: start;
  min-width: 144px;
  block-size: auto;
}

.classification-rule-kind :deep(.v-btn) {
  min-width: 0;
  min-block-size: 36px;
}

.classification-rule-condition,
.classification-rule-target {
  display: grid;
  gap: 8px;
  min-width: 0;
}

.classification-rule-section-title {
  color: rgba(var(--v-theme-on-surface), var(--v-high-emphasis-opacity));
  font-size: 0.8125rem;
  font-weight: 600;
}

.classification-rule-labels--wide {
  grid-column: 1 / -1;
}

.classification-rule-empty {
  display: grid;
  place-items: center;
  gap: 6px;
  min-height: 112px;
  border: 1px dashed rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 6px;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 0.875rem;
}

@media (min-width: 960px) {
  .classification-rule-list {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  /* 展开的条件编辑器保留整行空间，规则顺序仍按列表从左到右排列。 */
  .classification-rule--expanded {
    grid-column: 1 / -1;
  }
}

@media (max-width: 760px) {
  .classification-rule-toolbar {
    align-items: stretch;
    flex-direction: column;
  }

  .classification-rule-toolbar :deep(.v-btn) {
    width: 100%;
  }

  .classification-rule-grid,
  .classification-rule-grid--identity {
    grid-template-columns: minmax(0, 1fr);
  }

  .classification-rule-kind {
    width: 100%;
  }

  .classification-rule-kind :deep(.v-btn) {
    flex: 1 1 0;
  }

  .classification-rule-labels--wide {
    grid-column: auto;
  }
}

@media (max-width: 420px) {
  .classification-rule-head {
    grid-template-columns: minmax(0, 1fr) auto auto auto;
    padding: 6px;
  }

  .classification-rule-drag {
    display: none;
  }

  .classification-rule-summary {
    padding-inline: 6px;
  }

  .classification-rule-title {
    align-items: flex-start;
    flex-direction: column;
    gap: 1px;
  }

  .classification-rule-meta > span:nth-child(2),
  .classification-rule-meta > span:nth-child(3) {
    display: none;
  }

  .classification-rule-body {
    padding: 10px;
  }
}
</style>
