import FilterRuleCard from '@/components/cards/FilterRuleCard.vue'
import { innerFilterRules } from '@/api/constants'
import { parseRuleCards } from '@/utils/filterRuleGroup'
import { renderWithProviders } from '@tests/support/render'
import { screen } from '@testing-library/vue'
import { describe, expect, it } from 'vitest'

describe('FilterRuleCard', () => {
  it('renders saved built-in and custom rule IDs as selection titles', async () => {
    const [card] = parseRuleCards('!720P & !BLU & RULE1')
    await renderWithProviders(FilterRuleCard, {
      props: {
        pri: card.pri,
        rules: card.rules,
        custom_rules: [{ id: 'RULE1', name: '自定义规则' }],
      },
      global: { stubs: { VDialogCloseBtn: true } },
    })

    expect(screen.getByText(innerFilterRules.find(rule => rule.value === '!720P')!.title)).toBeVisible()
    expect(screen.getByText(innerFilterRules.find(rule => rule.value === '!BLU')!.title)).toBeVisible()
    expect(screen.getByText('自定义规则')).toBeVisible()
    expect(screen.queryByText('!720P')).not.toBeInTheDocument()
  })
})
