import api from '@/api'
import type { CustomRule, FilterRuleGroup } from '@/api/types'

interface CustomRuleQueryResult {
  count?: number
  rules?: unknown
}

interface FilterRuleGroupQueryResult {
  count?: number
  rule_groups?: unknown
}

/** 新增自定义规则的结构化请求。 */
export interface CustomRuleCreateInput {
  rule_id: string
  name: string
  include?: string
  exclude?: string
  size_range?: string
  seeders?: string
  publish_time?: string
}

/** 更新自定义规则的增量请求。 */
export interface CustomRuleUpdateInput {
  new_rule_id?: string
  name?: string
  include?: string
  exclude?: string
  size_range?: string
  seeders?: string
  publish_time?: string
}

/** 新增规则组的结构化请求。 */
export interface FilterRuleGroupCreateInput {
  name: string
  rule_string: string
  media_type?: string
  category?: string
}

/** 更新规则组的增量请求。 */
export interface FilterRuleGroupUpdateInput {
  new_name?: string
  rule_string?: string
  media_type?: string
  category?: string
}

/** 从结构化查询响应中保留前端规则卡片需要的公开字段。 */
function normalizeCustomRules(value: unknown): CustomRule[] {
  if (!Array.isArray(value)) return []
  return value
    .filter(item => item && typeof item === 'object')
    .map(item => {
      const rule = item as Partial<CustomRule>
      return {
        id: typeof rule.id === 'string' ? rule.id : '',
        name: typeof rule.name === 'string' ? rule.name : '',
        include: typeof rule.include === 'string' ? rule.include : undefined,
        exclude: typeof rule.exclude === 'string' ? rule.exclude : undefined,
        size_range: typeof rule.size_range === 'string' ? rule.size_range : undefined,
        seeders: typeof rule.seeders === 'string' ? rule.seeders : undefined,
        publish_time: typeof rule.publish_time === 'string' ? rule.publish_time : undefined,
      }
    })
    .filter(rule => rule.id && rule.name)
}

/** 从结构化查询响应中保留前端规则组卡片需要的公开字段。 */
function normalizeFilterRuleGroups(value: unknown): FilterRuleGroup[] {
  if (!Array.isArray(value)) return []
  return value
    .filter(item => item && typeof item === 'object')
    .map(item => {
      const group = item as Partial<FilterRuleGroup>
      return {
        name: typeof group.name === 'string' ? group.name : '',
        rule_string: typeof group.rule_string === 'string' ? group.rule_string : undefined,
        media_type: typeof group.media_type === 'string' ? group.media_type : undefined,
        category: typeof group.category === 'string' ? group.category : undefined,
      }
    })
    .filter(group => group.name)
}

/** 查询自定义过滤规则，不加载规则组引用分析。 */
export async function listCustomRules(): Promise<CustomRule[]> {
  const result = await api.get<CustomRuleQueryResult>('rule/custom', {
    feedback: 'silent',
    params: { include_group_refs: false },
  })
  return normalizeCustomRules(result?.rules)
}

/** 查询规则组，不加载订阅和全局设置引用分析。 */
export async function listFilterRuleGroups(): Promise<FilterRuleGroup[]> {
  const result = await api.get<FilterRuleGroupQueryResult>('rule/groups', {
    feedback: 'silent',
    params: { include_usage: false },
  })
  return normalizeFilterRuleGroups(result?.rule_groups)
}

/** 新增一条自定义过滤规则。 */
export async function createCustomRule(payload: CustomRuleCreateInput): Promise<void> {
  await api.post('rule/custom', payload, { feedback: 'silent' })
}

/** 增量更新一条自定义过滤规则。 */
export async function updateCustomRule(ruleId: string, payload: CustomRuleUpdateInput): Promise<void> {
  await api.put(`rule/custom/${encodeURIComponent(ruleId)}`, payload, { feedback: 'silent' })
}

/** 删除一条未被规则组引用的自定义过滤规则。 */
export async function deleteCustomRule(ruleId: string): Promise<void> {
  await api.delete(`rule/custom/${encodeURIComponent(ruleId)}`, { feedback: 'silent' })
}

/** 按完整 ID 列表调整自定义规则顺序。 */
export async function reorderCustomRules(ruleIds: string[], expectedRuleIds: string[]): Promise<void> {
  await api.put(
    'rule/custom/reorder',
    { rule_ids: ruleIds, expected_rule_ids: expectedRuleIds },
    { feedback: 'silent' },
  )
}

/** 新增一个过滤规则组。 */
export async function createFilterRuleGroup(payload: FilterRuleGroupCreateInput): Promise<void> {
  await api.post('rule/groups', payload, { feedback: 'silent' })
}

/** 增量更新一个过滤规则组。 */
export async function updateFilterRuleGroup(name: string, payload: FilterRuleGroupUpdateInput): Promise<void> {
  await api.put(`rule/groups/${encodeURIComponent(name)}`, payload, { feedback: 'silent' })
}

/** 删除一个规则组并由后端清理其引用。 */
export async function deleteFilterRuleGroup(name: string): Promise<void> {
  await api.delete(`rule/groups/${encodeURIComponent(name)}`, { feedback: 'silent' })
}

/** 按完整名称列表调整规则组顺序。 */
export async function reorderFilterRuleGroups(groupNames: string[], expectedGroupNames: string[]): Promise<void> {
  await api.put(
    'rule/groups/reorder',
    { group_names: groupNames, expected_group_names: expectedGroupNames },
    { feedback: 'silent' },
  )
}
