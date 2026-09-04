import type {
  ClassificationCategory,
  ClassificationCondition,
  ClassificationConditionNode,
  ClassificationFactValue,
  ClassificationMediaType,
  ClassificationPolicy,
} from '@/api/mediaClassificationTypes'

/** 分类下拉标题的可选显示配置。 */
interface ClassificationCategoryOptionTitleOptions {
  emptyPathLabel?: string
  includeId?: boolean
  pathSeparator?: string
}

/** 生成分类选择器标题，避免分类名与路径末级名称重复显示。 */
export function formatClassificationCategoryOptionTitle(
  category: Pick<ClassificationCategory, 'name' | 'path' | 'id'>,
  options: ClassificationCategoryOptionTitleOptions = {},
): string {
  const pathSegments = [...category.path]
  while (pathSegments[pathSegments.length - 1] === category.name) pathSegments.pop()
  const path = pathSegments.join(options.pathSeparator ?? ' / ')
  const displayPath = path || (category.path.length ? '' : (options.emptyPathLabel ?? ''))
  const parts = [category.name, displayPath]
  if (options.includeId) parts.push(category.id)
  return parts.filter(Boolean).join(' · ')
}

/** 根据规则媒体类型生成一个明确、可直接编辑的默认条件。 */
export function createClassificationTypeCondition(
  mediaTypes: readonly ClassificationMediaType[],
): ClassificationConditionNode {
  const selectedMediaTypes = [...new Set(mediaTypes)]
  if (selectedMediaTypes.length === 1) {
    return { field: 'media.type', operator: 'equals', value: selectedMediaTypes[0] }
  }
  if (selectedMediaTypes.length > 1) {
    return {
      any: selectedMediaTypes.map(type => ({ field: 'media.type', operator: 'equals', value: type })),
    }
  }
  return { field: 'media.type', operator: 'exists' }
}

/** 复制条件值，避免请求体继续携带 Vue 响应式数组。 */
function cloneClassificationConditionValue(
  value: ClassificationFactValue | undefined,
): ClassificationFactValue | undefined {
  return Array.isArray(value) ? [...value] : value
}

/** 判断未知条件节点是否为字段条件叶子。 */
function isClassificationCondition(value: unknown): value is ClassificationCondition {
  return Boolean(value && typeof value === 'object' && 'field' in value && 'operator' in value)
}

/** 清理条件组中的显式 null 分支，避免服务端把兼容空值解析成非法条件组。 */
export function normalizeClassificationConditionNode(
  node: ClassificationConditionNode,
  fallback?: ClassificationConditionNode,
): ClassificationConditionNode {
  if (isClassificationCondition(node)) {
    return {
      field: node.field,
      operator: node.operator,
      ...(node.value === undefined ? {} : { value: cloneClassificationConditionValue(node.value) }),
    }
  }

  const group = node && typeof node === 'object' ? node : null
  if (group && Array.isArray(group.all)) {
    return { all: group.all.map(child => normalizeClassificationConditionNode(child)) }
  }
  if (group && Array.isArray(group.any)) {
    return { any: group.any.map(child => normalizeClassificationConditionNode(child)) }
  }
  if (group && group.not !== undefined && group.not !== null) {
    return { not: normalizeClassificationConditionNode(group.not) }
  }

  if (fallback) return normalizeClassificationConditionNode(fallback)
  return { all: [] }
}

/** 生成可安全提交的策略副本，并把旧的空条件转换为规则媒体类型条件。 */
export function normalizeClassificationPolicy(policy: ClassificationPolicy): ClassificationPolicy {
  // 旧版本曾生成来源默认分类；新策略只允许按媒体类型设置默认分类，不能把废弃字段发回服务端。
  const normalizedPolicy = { ...policy } as ClassificationPolicy & { source_fallbacks?: unknown }
  delete normalizedPolicy.source_fallbacks

  return {
    ...normalizedPolicy,
    categories: policy.categories.map(category => ({
      ...category,
      path: [...category.path],
      labels: [...category.labels],
    })),
    rules: policy.rules.map(rule => ({
      ...rule,
      media_types: [...rule.media_types],
      sources: [...rule.sources],
      when: normalizeClassificationConditionNode(rule.when, createClassificationTypeCondition(rule.media_types)),
      target: {
        ...rule.target,
        labels: [...rule.target.labels],
      },
    })),
    fallbacks: { ...policy.fallbacks },
    field_aliases: Object.fromEntries(
      Object.entries(policy.field_aliases).map(([field, aliases]) => [field, { ...aliases }]),
    ),
  }
}
