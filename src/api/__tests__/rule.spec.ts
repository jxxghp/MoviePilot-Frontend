import {
  createCustomRule,
  createFilterRuleGroup,
  deleteCustomRule,
  deleteFilterRuleGroup,
  listCustomRules,
  listFilterRuleGroups,
  reorderCustomRules,
  reorderFilterRuleGroups,
  updateCustomRule,
  updateFilterRuleGroup,
} from '@/api/rule'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  apiDelete: vi.fn(),
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiPut: vi.fn(),
}))

vi.mock('@/api', () => ({
  default: createDataApiMock({
    delete: (...args: unknown[]) => mocks.apiDelete(...args),
    get: (...args: unknown[]) => mocks.apiGet(...args),
    post: (...args: unknown[]) => mocks.apiPost(...args),
    put: (...args: unknown[]) => mocks.apiPut(...args),
  }),
}))

describe('rule API adapters', () => {
  beforeEach(() => {
    mocks.apiDelete.mockReset().mockResolvedValue(null)
    mocks.apiGet.mockReset().mockResolvedValue(null)
    mocks.apiPost.mockReset().mockResolvedValue(null)
    mocks.apiPut.mockReset().mockResolvedValue(null)
  })

  it('queries and narrows custom rule analysis fields', async () => {
    mocks.apiGet.mockResolvedValueOnce({
      count: 2,
      rules: [
        { id: 'A', name: '规则 A', include: 'WEB', source: 'custom', referenced_by_rule_groups: ['默认'] },
        { id: '', name: 'invalid' },
      ],
    })

    await expect(listCustomRules()).resolves.toEqual([{ id: 'A', name: '规则 A', include: 'WEB' }])
    expect(mocks.apiGet).toHaveBeenCalledWith('rule/custom', { params: { include_group_refs: false } })
  })

  it('queries and narrows rule group analysis fields', async () => {
    mocks.apiGet.mockResolvedValueOnce({
      rule_groups: [{ name: '默认', rule_string: '4K', media_type: '电影', syntax_valid: true, usage: {} }, null],
    })

    await expect(listFilterRuleGroups()).resolves.toEqual([
      { name: '默认', rule_string: '4K', media_type: '电影', category: undefined },
    ])
    expect(mocks.apiGet).toHaveBeenCalledWith('rule/groups', { params: { include_usage: false } })
  })

  it('normalizes malformed query collections to empty lists', async () => {
    mocks.apiGet.mockResolvedValueOnce({ rules: null }).mockResolvedValueOnce({ rule_groups: {} })

    await expect(listCustomRules()).resolves.toEqual([])
    await expect(listFilterRuleGroups()).resolves.toEqual([])
  })

  it('uses incremental custom rule mutation endpoints', async () => {
    await createCustomRule({ rule_id: 'A/B', name: '规则' })
    await updateCustomRule('A/B', { new_rule_id: 'C', include: '' })
    await deleteCustomRule('A/B')
    await reorderCustomRules(['C'], ['A/B'])

    expect(mocks.apiPost).toHaveBeenCalledWith('rule/custom', { rule_id: 'A/B', name: '规则' })
    expect(mocks.apiPut).toHaveBeenNthCalledWith(1, 'rule/custom/A%2FB', { new_rule_id: 'C', include: '' })
    expect(mocks.apiDelete).toHaveBeenCalledWith('rule/custom/A%2FB')
    expect(mocks.apiPut).toHaveBeenNthCalledWith(2, 'rule/custom/reorder', {
      rule_ids: ['C'],
      expected_rule_ids: ['A/B'],
    })
  })

  it('uses incremental rule group mutation endpoints', async () => {
    await createFilterRuleGroup({ name: '组/一', rule_string: '4K' })
    await updateFilterRuleGroup('组/一', { new_name: '组二', category: '' })
    await deleteFilterRuleGroup('组/一')
    await reorderFilterRuleGroups(['组二'], ['组/一'])

    expect(mocks.apiPost).toHaveBeenCalledWith('rule/groups', { name: '组/一', rule_string: '4K' })
    expect(mocks.apiPut).toHaveBeenNthCalledWith(1, 'rule/groups/%E7%BB%84%2F%E4%B8%80', {
      new_name: '组二',
      category: '',
    })
    expect(mocks.apiDelete).toHaveBeenCalledWith('rule/groups/%E7%BB%84%2F%E4%B8%80')
    expect(mocks.apiPut).toHaveBeenNthCalledWith(2, 'rule/groups/reorder', {
      group_names: ['组二'],
      expected_group_names: ['组/一'],
    })
  })
})
