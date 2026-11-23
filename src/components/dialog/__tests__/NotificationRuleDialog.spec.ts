import type { NotificationRule } from '@/api/channelSettings'
import NotificationRuleDialog from '@/components/dialog/NotificationRuleDialog.vue'
import { fireEvent, screen, waitFor, within } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@tests/support/render'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ copy: vi.fn(), open: vi.fn(), success: vi.fn(), error: vi.fn() }))
vi.mock('@/composables/useSharedDialog', () => ({ openSharedDialog: mocks.open }))
vi.mock('@/@core/utils/navigator', () => ({ copyToClipboard: mocks.copy }))
vi.mock('vue-toastification', () => ({ useToast: () => ({ success: mocks.success, error: mocks.error }) }))

/** 旧单选规则样本，同时用于检查编辑不会污染外部草稿。 */
function rule(): NotificationRule {
  return {
    name: '旧规则',
    kind: 'bound',
    audience: 'admin',
    enabled: true,
    message_types: ['订阅'],
    target: null,
    thread_id: null,
    fallback_only: false,
    legacy_usernames: [],
    owner_identity: null,
  }
}
async function renderRules(source = rule()) {
  const apply = vi.fn()
  await renderWithProviders(NotificationRuleDialog, {
    props: {
      provider: 'telegram',
      kinds: ['bound', 'user', 'conversation'],
      messageOptions: [{ value: '订阅', title: '订阅' }],
      rules: [source],
      onApply: apply,
    },
  })
  return { apply, main: within(screen.getByText('投递规则', { exact: true }).closest('.v-card')!) }
}

describe('投递规则多选范围', () => {
  beforeEach(() => {
    mocks.open.mockReset().mockReturnValue({ close: vi.fn() })
    mocks.copy.mockReset().mockResolvedValue(true)
    mocks.error.mockReset()
  })
  it('旧单选转成多选，保存管理员与操作用户组合，原始对象保持不变', async () => {
    const source = rule(),
      user = userEvent.setup(),
      { apply, main } = await renderRules(source)
    await user.click(main.getByRole('button', { name: '编辑规则 旧规则' }))
    const editor = within(screen.getByText('编辑投递规则', { exact: true }).closest('.v-card')!)
    await user.click(editor.getAllByRole('combobox')[2])
    await user.click(await screen.findByRole('option', { name: '操作用户通知' }))
    await user.keyboard('{Escape}')
    await user.click(editor.getByRole('button', { name: '保存' }))
    await user.click(main.getByRole('button', { name: '保存' }))
    expect(apply).toHaveBeenCalledWith([expect.objectContaining({ audience: 'any', audiences: ['admin', 'user'] })])
    expect(source.audience).toBe('admin')
    expect(source.audiences).toBeUndefined()
  })
  it('取消编辑保留旧范围，分享使用支持多选的第二版格式', async () => {
    const { apply, main } = await renderRules(),
      user = userEvent.setup()
    await user.click(main.getByRole('button', { name: '编辑规则 旧规则' }))
    const editor = within(screen.getByText('编辑投递规则', { exact: true }).closest('.v-card')!)
    await user.click(editor.getAllByRole('combobox')[2])
    await user.click(await screen.findByRole('option', { name: '操作用户通知' }))
    await user.keyboard('{Escape}')
    await user.click(editor.getByRole('button', { name: '取消' }))
    await user.click(main.getByRole('button', { name: '分享规则' }))
    await waitFor(() => expect(mocks.copy).toHaveBeenCalled())
    const exported = JSON.parse(mocks.copy.mock.calls[0][0])
    expect(exported.version).toBe(2)
    expect(exported.rules[0].audiences).toEqual(['admin'])
    await user.click(main.getByRole('button', { name: '保存' }))
    expect(apply).toHaveBeenCalledWith([expect.objectContaining({ audiences: ['admin'] })])
  })
  it('接受旧版单选导入，并拒绝个人范围指向第三方的多选规则', async () => {
    const { apply, main } = await renderRules()
    await fireEvent.click(main.getByRole('button', { name: '导入规则' }))
    const handlers = mocks.open.mock.calls.at(-1)![2]
    handlers.save(
      undefined,
      JSON.stringify({
        version: 1,
        provider: 'telegram',
        purpose: 'notification',
        rules: [{ ...rule(), name: '旧个人规则', audience: 'user' }],
      }),
    )
    await screen.findByText('旧个人规则', { exact: true })
    await fireEvent.click(main.getByRole('button', { name: '导入规则' }))
    mocks.open.mock.calls.at(-1)![2].save(
      undefined,
      JSON.stringify({
        version: 2,
        provider: 'telegram',
        purpose: 'notification',
        rules: [{ ...rule(), kind: 'user', target: '123', audiences: ['admin', 'user'] }],
      }),
    )
    expect(mocks.error).toHaveBeenCalled()
    await fireEvent.click(main.getByRole('button', { name: '保存' }))
    expect(apply).toHaveBeenCalledWith([expect.objectContaining({ name: '旧个人规则', audiences: ['user'] })])
  })
})
