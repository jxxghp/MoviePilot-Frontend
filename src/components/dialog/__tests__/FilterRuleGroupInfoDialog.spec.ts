import FilterRuleGroupInfoDialog from '@/components/dialog/FilterRuleGroupInfoDialog.vue'
import userEvent from '@testing-library/user-event'
import { screen } from '@testing-library/vue'
import { renderWithProviders } from '@tests/support/render'
import { describe, expect, it, vi } from 'vitest'

vi.mock('vue-toastification', () => ({
  useToast: () => ({ error: vi.fn(), success: vi.fn() }),
}))

vi.mock('@/composables/useSharedDialog', () => ({
  openSharedDialog: vi.fn(),
}))

describe('FilterRuleGroupInfoDialog', () => {
  it('saves loaded rules with consistent separators and custom IDs', async () => {
    const user = userEvent.setup()
    const { emitted } = await renderWithProviders(FilterRuleGroupInfoDialog, {
      props: {
        modelValue: true,
        group: {
          name: '前置过滤',
          rule_string: '!720P & !BLU &RULE1> 4K & HDR',
          media_type: '',
          category: '',
        },
        groups: [],
        categories: {},
        custom_rules: [{ id: 'RULE1', name: '自定义规则' }],
      },
      global: { stubs: { VDialogCloseBtn: true } },
    })

    await user.click(screen.getByRole('button', { name: '保存' }))
    expect(emitted().change).toEqual([
      [expect.objectContaining({ rule_string: '!720P & !BLU & RULE1 > 4K & HDR' }), '前置过滤'],
    ])
  })

  it('offers music as a rule group media type', async () => {
    const user = userEvent.setup()
    await renderWithProviders(FilterRuleGroupInfoDialog, {
      props: {
        modelValue: true,
        group: { name: '音乐规则', rule_string: 'FLAC', media_type: '', category: '' },
        groups: [],
        categories: {},
        custom_rules: [],
      },
      global: {
        stubs: { VDialogCloseBtn: true },
      },
    })

    await user.click(screen.getByRole('textbox', { name: '媒体类型' }))

    expect(await screen.findByRole('option', { name: '音乐' })).toBeVisible()
  })
})
