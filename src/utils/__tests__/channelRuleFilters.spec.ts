import { channelRuleFilterCount, emptyChannelRuleFilters, matchesChannelRuleFilters } from '@/utils/channelRuleFilters'
import { describe, expect, it } from 'vitest'

describe('channel rule filters', () => {
  const rule = { name: 'TG 下载提醒', kind: 'user', target: '123', message_types: ['下载', '订阅'], audience: 'admin' }
  it('combines dimensions with AND and values within each dimension with OR', () => {
    const filters = {
      ...emptyChannelRuleFilters(),
      name: ' tg ',
      kinds: ['user', 'conversation'],
      targets: ['456', '123'],
      messageTypes: ['整理', '下载'],
      audiences: ['admin'],
    }
    expect(matchesChannelRuleFilters(rule, filters)).toBe(true)
    expect(channelRuleFilterCount(filters)).toBe(5)
    expect(matchesChannelRuleFilters(rule, { ...filters, targets: ['12'] })).toBe(false)
    expect(matchesChannelRuleFilters(rule, { ...filters, audiences: ['user'] })).toBe(false)
    expect(matchesChannelRuleFilters(rule, { ...filters, kinds: ['conversation'] })).toBe(false)
  })
  it('allows old unnamed rules with no filters and uses independent reset arrays', () => {
    const filters = emptyChannelRuleFilters()
    expect(matchesChannelRuleFilters({ kind: 'bound' }, filters)).toBe(true)
    expect(channelRuleFilterCount({ ...filters, name: '  ' })).toBe(0)
    filters.kinds.push('webhook')
    expect(emptyChannelRuleFilters().kinds).toEqual([])
  })
  it('filters enabled and disabled rules, treating omitted legacy switches as enabled', () => {
    const filters = emptyChannelRuleFilters()
    for (const enabled of [undefined, true, false]) {
      expect(matchesChannelRuleFilters({ ...rule, enabled }, filters)).toBe(true)
      expect(matchesChannelRuleFilters({ ...rule, enabled }, { ...filters, status: 'enabled' })).toBe(enabled !== false)
      expect(matchesChannelRuleFilters({ ...rule, enabled }, { ...filters, status: 'disabled' })).toBe(
        enabled === false,
      )
    }
    expect(channelRuleFilterCount({ ...filters, status: 'disabled' })).toBe(1)
    expect(channelRuleFilterCount(filters)).toBe(0)
  })
  it('combines switch state with other filters without changing the source rule', () => {
    const disabled = { ...rule, enabled: false }
    const filters = { ...emptyChannelRuleFilters(), status: 'disabled' as const, name: 'TG' }
    expect(matchesChannelRuleFilters(disabled, filters)).toBe(true)
    expect(matchesChannelRuleFilters(disabled, { ...filters, name: '不存在' })).toBe(false)
    expect(channelRuleFilterCount(filters)).toBe(2)
    expect(disabled.enabled).toBe(false)
  })
})

describe('多选通知范围过滤', () => {
  it('按规则选择的任一类别匹配，不把全体通知当成全选', () => {
    const rule = { kind: 'bound', audience: 'any', audiences: ['admin', 'user'] }
    const filters = emptyChannelRuleFilters()
    expect(matchesChannelRuleFilters(rule, { ...filters, audiences: ['user'] })).toBe(true)
    expect(matchesChannelRuleFilters(rule, { ...filters, audiences: ['admin', 'all'] })).toBe(true)
    expect(matchesChannelRuleFilters(rule, { ...filters, audiences: ['all'] })).toBe(false)
    expect(matchesChannelRuleFilters(rule, { ...filters, audiences: ['any'] })).toBe(false)
    expect(matchesChannelRuleFilters({ ...rule, audiences: [] }, { ...filters, audiences: ['any'] })).toBe(true)
  })
})
