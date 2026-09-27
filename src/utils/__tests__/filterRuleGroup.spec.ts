import { innerFilterRules } from '@/api/constants'
import { parseRuleCards, serializeRuleCards } from '@/utils/filterRuleGroup'
import { describe, expect, it } from 'vitest'

describe('filter rule group editing', () => {
  it('matches saved first and last tokens to preset titles across levels', () => {
    const cards = parseRuleCards('!720P & !BLU & RULE1 > 4K & HDR')
    const titles = new Map(innerFilterRules.map(rule => [rule.value, rule.title]))

    expect(innerFilterRules).toHaveLength(51)
    expect(innerFilterRules.every(rule => rule.value === rule.value.trim())).toBe(true)
    expect(cards).toEqual([
      { pri: '1', rules: ['!720P', '!BLU', 'RULE1'] },
      { pri: '2', rules: ['4K', 'HDR'] },
    ])
    expect(
      cards.map(card => card.rules.map(rule => titles.get(rule) ?? (rule === 'RULE1' ? '自定义规则' : rule))),
    ).toEqual([
      ['Exclude: 720P', 'Exclude: Blu-ray', '自定义规则'],
      ['Resolution: 4K', 'Effect: HDR'],
    ])
    expect(serializeRuleCards(cards)).toBe('!720P & !BLU & RULE1 > 4K & HDR')
  })

  it('normalizes legacy spaced values and API strings on the next save', () => {
    const cards = parseRuleCards(' !720P & !BLU &RULE1> 4K & HDR ')
    expect(serializeRuleCards(cards)).toBe('!720P & !BLU & RULE1 > 4K & HDR')
  })
})
