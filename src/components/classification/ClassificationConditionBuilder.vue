<script setup lang="ts">
import type {
  ClassificationCondition,
  ClassificationConditionNode,
  ClassificationFactScalar,
  ClassificationFactValue,
  ClassificationFieldDefinition,
  ClassificationMediaType,
  ClassificationOperator,
  ClassificationSourceSupport,
} from '@/api/mediaClassificationTypes'

defineOptions({ name: 'ClassificationConditionBuilder' })

const props = withDefaults(
  defineProps<{
    modelValue: ClassificationConditionNode
    fields: readonly ClassificationFieldDefinition[]
    mediaTypes: readonly ClassificationMediaType[]
    sources: readonly string[]
    depth?: number
    maxDepth?: number
  }>(),
  {
    depth: 0,
    maxDepth: 3,
  },
)

const emit = defineEmits<{
  (event: 'update:modelValue', value: ClassificationConditionNode): void
}>()

type ConditionNodeKind = 'condition' | 'all' | 'any' | 'not'
type ValueControlKind = 'none' | 'range' | 'list' | 'boolean' | 'number' | 'select' | 'text'

interface SourceSupportHint {
  source: string
  support: Extract<ClassificationSourceSupport, 'partial' | 'unavailable'>
  label: string
  color: 'warning' | 'error'
  icon: string
}

const NO_VALUE_OPERATORS = new Set<ClassificationOperator>(['is_true', 'is_false', 'exists', 'not_exists'])
const LIST_VALUE_OPERATORS = new Set<ClassificationOperator>([
  'in',
  'not_in',
  'contains_any',
  'contains_all',
  'contains_none',
])

const NODE_KIND_ITEMS: ReadonlyArray<{ title: string; value: ConditionNodeKind }> = [
  { title: '条件', value: 'condition' },
  { title: '全部', value: 'all' },
  { title: '任一', value: 'any' },
  { title: '非', value: 'not' },
]

const OPERATOR_LABELS: Record<ClassificationOperator, string> = {
  equals: '等于',
  not_equals: '不等于',
  in: '属于',
  not_in: '不属于',
  contains: '包含',
  starts_with: '开头为',
  ends_with: '结尾为',
  gt: '大于',
  gte: '大于等于',
  lt: '小于',
  lte: '小于等于',
  between: '介于',
  contains_any: '包含任一',
  contains_all: '包含全部',
  contains_none: '不包含任一',
  is_true: '为真',
  is_false: '为假',
  exists: '存在',
  not_exists: '不存在',
}

/** 判断节点是否为字段条件叶子。 */
function isCondition(node: ClassificationConditionNode): node is ClassificationCondition {
  return 'field' in node && 'operator' in node
}

/** 读取当前节点类型，并兼容服务端允许的显式 null 组字段。 */
function getNodeKind(node: ClassificationConditionNode): ConditionNodeKind {
  if (isCondition(node)) return 'condition'
  if (node.all !== undefined && node.all !== null) return 'all'
  if (node.any !== undefined && node.any !== null) return 'any'
  return 'not'
}

/** 返回当前条件组的子节点快照，避免后续编辑直接改写 props。 */
function getGroupChildren(node: ClassificationConditionNode): ClassificationConditionNode[] {
  if (isCondition(node)) return []
  if (node.all !== undefined && node.all !== null) return [...node.all]
  if (node.any !== undefined && node.any !== null) return [...node.any]
  return node.not ? [node.not] : []
}

/** 判断字段是否同时适用于规则当前选择的全部媒体类型。 */
function supportsSelectedMediaTypes(field: ClassificationFieldDefinition): boolean {
  return props.mediaTypes.length === 0 || props.mediaTypes.every(mediaType => field.media_types.includes(mediaType))
}

const availableFields = computed(() => props.fields.filter(supportsSelectedMediaTypes))
const selectableFields = computed(() => availableFields.value.filter(field => field.selectable !== false))

/** 将标准字段排在扩展字段之前，避免迁移字段遮住常用的风格、年份和国家字段。 */
function fieldOrder(field: ClassificationFieldDefinition): number {
  if (field.id.startsWith('extensions.')) return 100
  if (field.group === '音乐') return 20
  if (field.group === '影视') return 10
  return 0
}

const fieldItems = computed(() =>
  [...availableFields.value]
    .sort((left, right) => fieldOrder(left) - fieldOrder(right))
    .filter(field => field.selectable !== false || field.id === selectedCondition.value?.field)
    .map(field => ({
      title: field.group ? `${field.group} · ${field.label}` : field.label,
      value: field.id,
      props: { disabled: field.selectable === false },
    })),
)

const nodeKind = computed(() => getNodeKind(props.modelValue))
const groupChildren = computed(() => getGroupChildren(props.modelValue))
const canUseGroup = computed(() => props.depth < props.maxDepth)
const canAddChild = computed(
  () =>
    nodeKind.value !== 'condition' &&
    selectableFields.value.length > 0 &&
    (nodeKind.value !== 'not' || groupChildren.value.length === 0),
)

const selectedCondition = computed<ClassificationCondition | null>(() =>
  isCondition(props.modelValue) ? props.modelValue : null,
)

const selectedDefinition = computed(() => {
  const fieldId = selectedCondition.value?.field
  return fieldId ? availableFields.value.find(field => field.id === fieldId) : undefined
})

const replacementDefinition = computed(() => {
  const replacementId = selectedDefinition.value?.replacement_field
  return replacementId ? props.fields.find(field => field.id === replacementId) : undefined
})

const operatorItems = computed(() =>
  (selectedDefinition.value?.operators ?? []).map(operator => ({
    title: OPERATOR_LABELS[operator],
    value: operator,
  })),
)

const optionItems = computed(() =>
  (selectedDefinition.value?.options ?? []).map(option => ({
    title: option.label,
    value: option.value,
  })),
)

const catalogListSelection = computed(() =>
  optionItems.value.filter(option => listValue.value.some(value => Object.is(value, option.value))),
)

const catalogScalarSelection = computed(
  () => optionItems.value.find(option => Object.is(option.value, scalarValue.value)) ?? null,
)

const sourceSupportHints = computed<SourceSupportHint[]>(() => {
  const definition = selectedDefinition.value
  if (!definition) return []

  const hints: SourceSupportHint[] = []
  for (const source of new Set(props.sources)) {
    const support = definition.source_support[source]
    if (support === 'partial') {
      hints.push({ source, support, label: '部分支持', color: 'warning', icon: 'mdi-alert-outline' })
    }
    if (support === 'unavailable') {
      hints.push({ source, support, label: '不可用', color: 'error', icon: 'mdi-database-off-outline' })
    }
  }
  return hints
})

const valueControlKind = computed<ValueControlKind>(() => {
  const condition = selectedCondition.value
  const definition = selectedDefinition.value
  if (!condition || !definition || NO_VALUE_OPERATORS.has(condition.operator)) return 'none'
  if (condition.operator === 'between') return 'range'
  if (LIST_VALUE_OPERATORS.has(condition.operator) || definition.value_type === 'string_list') return 'list'
  if (definition.value_type === 'boolean') return 'boolean'
  if (['integer', 'number', 'year'].includes(definition.value_type)) return 'number'
  if (definition.value_type === 'enum' || definition.options.length > 0) return 'select'
  return 'text'
})

const listValue = computed<ClassificationFactScalar[]>(() => {
  const value = selectedCondition.value?.value
  return Array.isArray(value) ? [...value] : value === undefined ? [] : [value]
})

const rangeValue = computed<[number | null, number | null]>(() => {
  const value = selectedCondition.value?.value
  if (Array.isArray(value) && value.length === 2) {
    return [typeof value[0] === 'number' ? value[0] : null, typeof value[1] === 'number' ? value[1] : null]
  }
  return [null, null]
})

const scalarValue = computed(() => {
  const value = selectedCondition.value?.value
  return Array.isArray(value) ? undefined : value
})

const booleanValue = computed(() => scalarValue.value === true)
const numericStep = computed(() => (selectedDefinition.value?.value_type === 'number' ? 'any' : 1))
const usesCatalogSelect = computed(
  () => (selectedDefinition.value?.options.length ?? 0) > 0 && !selectedDefinition.value?.allow_custom_values,
)
// Vuetify 会从对象 items 推断 return-object；这里仅收窄模板泛型，运行时仍传递原始标量。
const comboboxListModel = computed(() => listValue.value as never[])
const comboboxScalarModel = computed(() => scalarValue.value as never)

/** 根据字段值类型把控件输出转换为分类条件允许的标量。 */
function normalizeScalarValue(value: unknown, definition: ClassificationFieldDefinition): ClassificationFactScalar {
  if (value === null || value === undefined || value === '') return null
  if (definition.value_type === 'integer' || definition.value_type === 'year') {
    const numberValue = Number(value)
    return Number.isFinite(numberValue) ? Math.trunc(numberValue) : null
  }
  if (definition.value_type === 'number') {
    const numberValue = Number(value)
    return Number.isFinite(numberValue) ? numberValue : null
  }
  if (definition.value_type === 'boolean') return value === true || value === 'true'
  return typeof value === 'string' ? value : String(value)
}

/** 根据字段目录和操作符生成可继续编辑的初始值。 */
function createDefaultValue(
  definition: ClassificationFieldDefinition,
  operator: ClassificationOperator,
): ClassificationFactValue | undefined {
  if (NO_VALUE_OPERATORS.has(operator)) return undefined
  if (operator === 'between') return [null, null]
  if (LIST_VALUE_OPERATORS.has(operator) || definition.value_type === 'string_list') return []
  if (definition.value_type === 'boolean') return false
  if (definition.value_type === 'integer' || definition.value_type === 'number' || definition.value_type === 'year') {
    return null
  }
  return definition.options[0]?.value ?? ''
}

/** 由字段目录的首个可用字段构造叶子，不在前端臆造字段或操作符。 */
function createDefaultCondition(): ClassificationCondition | null {
  const definition = selectableFields.value[0]
  const operator = definition?.operators[0]
  if (!definition || !operator) return null

  const value = createDefaultValue(definition, operator)
  return value === undefined ? { field: definition.id, operator } : { field: definition.id, operator, value }
}

/** 发出新的受控节点，所有编辑均保持 props 不变。 */
function updateNode(node: ClassificationConditionNode): void {
  emit('update:modelValue', node)
}

/** 切换叶子或条件组类型，并尽量保留当前已有条件子树。 */
function updateNodeKind(kind: ConditionNodeKind): void {
  if (kind === nodeKind.value) return
  if (kind !== 'condition' && !canUseGroup.value) return

  if (kind === 'condition') {
    const condition = createDefaultCondition()
    if (condition) updateNode(condition)
    return
  }

  const existingChildren = isCondition(props.modelValue) ? [props.modelValue] : groupChildren.value
  const fallbackCondition = existingChildren.length === 0 ? createDefaultCondition() : null
  const children = existingChildren.length > 0 ? existingChildren : fallbackCondition ? [fallbackCondition] : []

  if (kind === 'not') {
    if (children[0]) updateNode({ not: children[0] })
    return
  }
  updateNode(kind === 'all' ? { all: children } : { any: children })
}

/** 切换字段时同步采用该字段目录声明的首个操作符和值类型。 */
function updateField(fieldId: string): void {
  const definition = availableFields.value.find(field => field.id === fieldId)
  const operator = definition?.operators[0]
  if (!definition || definition.selectable === false || !operator) return

  const value = createDefaultValue(definition, operator)
  updateNode(value === undefined ? { field: fieldId, operator } : { field: fieldId, operator, value })
}

/** 切换操作符时重置值形状，防止旧操作符的数组或标量泄漏到新条件。 */
function updateOperator(operator: ClassificationOperator): void {
  const condition = selectedCondition.value
  const definition = selectedDefinition.value
  if (!condition || !definition || !definition.operators.includes(operator)) return

  const value = createDefaultValue(definition, operator)
  updateNode(value === undefined ? { field: condition.field, operator } : { field: condition.field, operator, value })
}

/** 写入标量、枚举或布尔值，并按字段类型保持 JSON 值类型。 */
function updateScalarValue(value: unknown): void {
  const condition = selectedCondition.value
  const definition = selectedDefinition.value
  if (!condition || !definition) return
  updateNode({ ...condition, value: normalizeScalarValue(value, definition) })
}

/** 写入成员列表，数字字段会把控件字符串转换为 number。 */
function updateListValue(value: unknown): void {
  const condition = selectedCondition.value
  const definition = selectedDefinition.value
  if (!condition || !definition) return

  const values = Array.isArray(value) ? value : value === null || value === undefined ? [] : [value]
  const normalized = values
    .map(item => normalizeScalarValue(item, definition))
    .filter((item): item is Exclude<ClassificationFactScalar, null> => item !== null)
  updateNode({ ...condition, value: normalized })
}

/** 从 VSelect 的 return-object 结果中读取字段目录声明的原始值。 */
function catalogOptionValue(value: unknown): unknown {
  return typeof value === 'object' && value !== null && 'value' in value ? (value as { value: unknown }).value : value
}

/** 将目录多选结果还原为规则条件的标量数组。 */
function updateCatalogListValue(value: unknown): void {
  updateListValue(Array.isArray(value) ? value.map(catalogOptionValue) : [])
}

/** 将目录单选结果还原为规则条件的标量值。 */
function updateCatalogScalarValue(value: unknown): void {
  updateScalarValue(catalogOptionValue(value))
}

/** 更新 between 的单个边界，同时保留另一侧边界。 */
function updateRangeBoundary(index: 0 | 1, value: unknown): void {
  const condition = selectedCondition.value
  const definition = selectedDefinition.value
  if (!condition || !definition) return

  const nextValue: ClassificationFactScalar[] = [...rangeValue.value]
  nextValue[index] = normalizeScalarValue(value, definition)
  updateNode({ ...condition, value: nextValue })
}

/** 替换指定条件组子节点。 */
function updateChild(index: number, child: ClassificationConditionNode): void {
  const children = [...groupChildren.value]
  children[index] = child
  if (nodeKind.value === 'all') updateNode({ all: children })
  else if (nodeKind.value === 'any') updateNode({ any: children })
  else if (children[0]) updateNode({ not: children[0] })
}

/** 向 all/any 组追加叶子，not 组仅在缺少子节点时补充一次。 */
function addChild(): void {
  if (!canAddChild.value) return
  const child = createDefaultCondition()
  if (!child) return

  if (nodeKind.value === 'not') updateNode({ not: child })
  else if (nodeKind.value === 'all') updateNode({ all: [...groupChildren.value, child] })
  else if (nodeKind.value === 'any') updateNode({ any: [...groupChildren.value, child] })
}

/** 删除 all/any 组中的子节点，并至少保留一个可编辑条件。 */
function removeChild(index: number): void {
  if (!['all', 'any'].includes(nodeKind.value) || groupChildren.value.length <= 1) return
  const children = groupChildren.value.filter((_, childIndex) => childIndex !== index)
  updateNode(nodeKind.value === 'all' ? { all: children } : { any: children })
}
</script>

<template>
  <section
    class="classification-condition-builder"
    :data-depth="props.depth"
    :aria-label="`条件节点，第 ${props.depth + 1} 层`"
  >
    <div class="classification-condition-builder__toolbar">
      <VBtnToggle
        :model-value="nodeKind"
        mandatory
        color="primary"
        variant="outlined"
        density="compact"
        class="classification-condition-builder__kind-toggle"
        aria-label="条件节点类型"
        @update:model-value="updateNodeKind"
      >
        <VBtn
          v-for="item in NODE_KIND_ITEMS"
          :key="item.value"
          :value="item.value"
          :disabled="item.value !== 'condition' && !canUseGroup"
          size="small"
        >
          {{ item.title }}
        </VBtn>
      </VBtnToggle>

      <VChip v-if="!canUseGroup" size="small" variant="tonal" color="warning" data-testid="depth-limit">
        已达最大组深度
      </VChip>
    </div>

    <template v-if="nodeKind === 'condition'">
      <VAlert v-if="availableFields.length === 0" type="warning" variant="tonal" density="compact" class="mt-3">
        当前媒体类型没有共同可用的条件字段
      </VAlert>

      <div v-else class="classification-condition-builder__leaf">
        <VAutocomplete
          :model-value="selectedCondition?.field"
          :items="fieldItems"
          label="字段"
          placeholder="搜索风格、年份、国家或字段 ID"
          aria-label="条件字段"
          variant="outlined"
          density="compact"
          hide-details="auto"
          auto-select-first
          :menu-props="{ contentClass: 'classification-field-menu', maxWidth: 420 }"
          data-testid="field-select"
          @update:model-value="updateField"
        />

        <VSelect
          :model-value="selectedCondition?.operator"
          :items="operatorItems"
          label="操作符"
          aria-label="条件操作符"
          variant="outlined"
          density="compact"
          hide-details="auto"
          data-testid="operator-select"
          @update:model-value="updateOperator"
        />

        <div class="classification-condition-builder__value">
          <VChip
            v-if="valueControlKind === 'none'"
            size="small"
            variant="tonal"
            color="secondary"
            data-testid="no-value"
          >
            此操作符无需值
          </VChip>

          <div v-else-if="valueControlKind === 'range'" class="classification-condition-builder__range">
            <VTextField
              :model-value="rangeValue[0]"
              type="number"
              :step="numericStep"
              label="起始值"
              variant="outlined"
              density="compact"
              hide-details="auto"
              data-testid="range-start"
              @update:model-value="updateRangeBoundary(0, $event)"
            />
            <VTextField
              :model-value="rangeValue[1]"
              type="number"
              :step="numericStep"
              label="结束值"
              variant="outlined"
              density="compact"
              hide-details="auto"
              data-testid="range-end"
              @update:model-value="updateRangeBoundary(1, $event)"
            />
          </div>

          <template v-else-if="valueControlKind === 'list'">
            <VSelect
              v-if="usesCatalogSelect"
              :model-value="catalogListSelection"
              :items="optionItems"
              return-object
              label="条件值"
              aria-label="条件值列表"
              multiple
              chips
              closable-chips
              variant="outlined"
              density="compact"
              hide-details="auto"
              data-testid="list-value-input"
              @update:model-value="updateCatalogListValue"
            />
            <VCombobox
              v-else
              :model-value="comboboxListModel"
              :items="optionItems"
              label="条件值"
              aria-label="条件值列表"
              multiple
              chips
              closable-chips
              variant="outlined"
              density="compact"
              hide-details="auto"
              data-testid="list-value-input"
              @update:model-value="updateListValue"
            />
          </template>

          <VBtnToggle
            v-else-if="valueControlKind === 'boolean'"
            :model-value="booleanValue"
            mandatory
            color="primary"
            variant="outlined"
            density="compact"
            aria-label="布尔条件值"
            data-testid="boolean-value-input"
            @update:model-value="updateScalarValue"
          >
            <VBtn :value="true" size="small">是</VBtn>
            <VBtn :value="false" size="small">否</VBtn>
          </VBtnToggle>

          <VTextField
            v-else-if="valueControlKind === 'number'"
            :model-value="scalarValue"
            type="number"
            :step="numericStep"
            label="条件值"
            variant="outlined"
            density="compact"
            hide-details="auto"
            data-testid="number-value-input"
            @update:model-value="updateScalarValue"
          />

          <template v-else-if="valueControlKind === 'select'">
            <VSelect
              v-if="usesCatalogSelect"
              :model-value="catalogScalarSelection"
              :items="optionItems"
              return-object
              label="条件值"
              aria-label="条件值"
              variant="outlined"
              density="compact"
              hide-details="auto"
              data-testid="select-value-input"
              @update:model-value="updateCatalogScalarValue"
            />
            <VCombobox
              v-else
              :model-value="comboboxScalarModel"
              :items="optionItems"
              label="条件值"
              aria-label="条件值"
              variant="outlined"
              density="compact"
              hide-details="auto"
              data-testid="select-value-input"
              @update:model-value="updateScalarValue"
            />
          </template>

          <VTextField
            v-else
            :model-value="scalarValue"
            label="条件值"
            variant="outlined"
            density="compact"
            hide-details="auto"
            data-testid="text-value-input"
            @update:model-value="updateScalarValue"
          />
        </div>
      </div>

      <p
        v-if="selectedDefinition?.selectable === false"
        class="classification-condition-builder__retired-field"
        data-testid="retired-field-hint"
      >
        <VIcon icon="mdi-history" size="16" />
        <span>
          此字段只保留旧规则的原始匹配。
          <template v-if="replacementDefinition">建议改用“{{ replacementDefinition.label }}”。</template>
        </span>
      </p>

      <div
        v-if="sourceSupportHints.length > 0"
        class="classification-condition-builder__source-hints"
        role="status"
        aria-label="数据源字段支持提示"
        data-testid="source-support-hints"
      >
        <VChip
          v-for="hint in sourceSupportHints"
          :key="`${hint.source}:${hint.support}`"
          :color="hint.color"
          :prepend-icon="hint.icon"
          size="small"
          variant="tonal"
        >
          {{ hint.source }}：{{ hint.label }}
        </VChip>
      </div>
    </template>

    <div v-else class="classification-condition-builder__group">
      <div v-for="(child, index) in groupChildren" :key="index" class="classification-condition-builder__child">
        <ClassificationConditionBuilder
          :model-value="child"
          :fields="props.fields"
          :media-types="props.mediaTypes"
          :sources="props.sources"
          :depth="props.depth + 1"
          :max-depth="props.maxDepth"
          @update:model-value="updateChild(index, $event)"
        />

        <div
          v-if="nodeKind !== 'not' && groupChildren.length > 1"
          class="classification-condition-builder__child-action"
        >
          <VTooltip text="删除子条件" location="top">
            <template #activator="{ props: tooltipProps }">
              <VBtn
                v-bind="tooltipProps"
                icon="mdi-delete-outline"
                variant="text"
                color="error"
                size="small"
                :aria-label="`删除子条件 ${index + 1}`"
                @click="removeChild(index)"
              />
            </template>
          </VTooltip>
        </div>
      </div>

      <div class="classification-condition-builder__group-actions">
        <VTooltip :text="canAddChild ? '新增子条件' : '没有可用字段或 not 已有子条件'" location="top">
          <template #activator="{ props: tooltipProps }">
            <VBtn
              v-bind="tooltipProps"
              icon="mdi-plus"
              variant="tonal"
              color="primary"
              size="small"
              aria-label="新增子条件"
              :disabled="!canAddChild"
              @click="addChild"
            />
          </template>
        </VTooltip>
      </div>
    </div>
  </section>
</template>

<style scoped>
.classification-condition-builder {
  min-inline-size: 0;
  padding: 12px;
  border: 1px solid var(--classification-border, rgba(var(--v-border-color), var(--v-border-opacity)));
  border-radius: 8px;
  background: var(--classification-panel, rgba(var(--v-theme-surface-variant), 0.12));
}

.classification-condition-builder:not([data-depth='0']) {
  padding: 8px 0 8px 10px;
  border: 0;
  border-inline-start: 2px solid var(--classification-border, rgba(var(--v-border-color), var(--v-border-opacity)));
  border-radius: 0;
  background: transparent;
}

.classification-condition-builder__toolbar,
.classification-condition-builder__source-hints,
.classification-condition-builder__group-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.classification-condition-builder__kind-toggle {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  inline-size: min(100%, 360px);
  block-size: auto;
}

.classification-condition-builder__kind-toggle :deep(.v-btn) {
  inline-size: 100%;
  min-inline-size: 0;
  min-block-size: 36px;
  padding-inline: 6px;
  letter-spacing: 0;
}

.classification-condition-builder__leaf {
  display: grid;
  grid-template-columns: minmax(180px, 1.15fr) minmax(150px, 0.85fr) minmax(220px, 1.4fr);
  gap: 12px;
  align-items: start;
  min-inline-size: 0;
  margin-block-start: 12px;
}

.classification-condition-builder__value {
  min-inline-size: 0;
}

.classification-condition-builder__range {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.classification-condition-builder__source-hints {
  margin-block-start: 10px;
}

.classification-condition-builder__retired-field {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin: 10px 0 0;
  color: rgb(var(--v-theme-warning));
  font-size: 0.8125rem;
}

.classification-condition-builder__group {
  display: grid;
  gap: 10px;
  min-inline-size: 0;
  margin-block-start: 12px;
}

.classification-condition-builder__child {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 36px;
  gap: 8px;
  align-items: start;
  min-inline-size: 0;
}

.classification-condition-builder__child-action {
  display: flex;
  justify-content: center;
  padding-block-start: 4px;
}

.classification-condition-builder__group-actions {
  justify-content: flex-end;
}

:global(.classification-field-menu .v-list-item-title) {
  overflow: visible;
  text-overflow: clip;
  white-space: normal;
}

@media (max-width: 720px) {
  .classification-condition-builder {
    padding: 10px;
  }

  .classification-condition-builder__toolbar {
    align-items: stretch;
  }

  .classification-condition-builder__kind-toggle {
    inline-size: 100%;
  }

  .classification-condition-builder__leaf,
  .classification-condition-builder__range {
    grid-template-columns: minmax(0, 1fr);
  }

  .classification-condition-builder__child {
    grid-template-columns: minmax(0, 1fr);
  }

  .classification-condition-builder__child-action {
    justify-content: flex-end;
    padding-block-start: 0;
  }
}

@media (max-width: 420px) {
  .classification-condition-builder {
    padding: 8px;
  }

  .classification-condition-builder:not([data-depth='0']) {
    padding: 7px 0 7px 8px;
  }

  .classification-condition-builder__kind-toggle :deep(.v-btn) {
    padding-inline: 2px;
    font-size: 0.75rem;
  }
}
</style>
