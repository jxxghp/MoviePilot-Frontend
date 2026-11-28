/** 每个条件内允许任一值，各个条件之间同时满足。 */
export interface ChannelRuleFilters {
  name: string
  status: 'all' | 'enabled' | 'disabled'
  messageTypes: string[]
  kinds: string[]
  targets: string[]
  audiences: string[]
}

/** 新建独立的规则筛选草稿。 */
export function emptyChannelRuleFilters(): ChannelRuleFilters {
  return { name: '', status: 'all', messageTypes: [], kinds: [], targets: [], audiences: [] }
}

/** 用于通知和交互规则的纯筛选输入。 */
export interface ChannelRuleFilterInput {
  name?: string
  enabled?: boolean
  kind: string
  target?: string | null
  message_types?: string[]
  audience?: string
  audiences?: string[] | null
}

/** 名称支持包含匹配，平台 ID 按原始值精确匹配。 */
export function matchesChannelRuleFilters(rule: ChannelRuleFilterInput, filters: ChannelRuleFilters): boolean {
  const audiences = rule.audiences ?? (rule.audience && rule.audience !== 'any' ? [rule.audience] : [])
  return (
    (filters.status === 'all' || (rule.enabled !== false) === (filters.status === 'enabled')) &&
    (!filters.name.trim() || (rule.name ?? '').toLowerCase().includes(filters.name.trim().toLowerCase())) &&
    (!filters.messageTypes.length || filters.messageTypes.some(type => rule.message_types?.includes(type))) &&
    (!filters.kinds.length || filters.kinds.includes(rule.kind)) &&
    (!filters.targets.length || (!!rule.target && filters.targets.includes(rule.target))) &&
    (!filters.audiences.length ||
      filters.audiences.some(audience => (audiences.length ? audiences : ['any']).includes(audience)))
  )
}

/** 只统计实际生效的条件，不把空白名称当作筛选。 */
export function channelRuleFilterCount(filters: ChannelRuleFilters): number {
  return [
    filters.status !== 'all',
    filters.name.trim(),
    filters.messageTypes.length,
    filters.kinds.length,
    filters.targets.length,
    filters.audiences.length,
  ].filter(Boolean).length
}
