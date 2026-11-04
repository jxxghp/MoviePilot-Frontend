import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@tests/support/render'
import AgentTransferNotificationPolicy from '@/components/system/AgentTransferNotificationPolicy.vue'

const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), success: vi.fn() }))
vi.mock('@/api', () => ({ default: createDataApiMock({ get: mocks.get, post: mocks.post }) }))
vi.mock('vue-toastification', () => ({ useToast: () => ({ success: mocks.success }) }))

describe('自动整理接管通知策略控件', () => {
  beforeEach(() => {
    mocks.get.mockReset()
    mocks.post.mockReset()
    mocks.success.mockReset()
    mocks.get.mockResolvedValue({ success: true, data: { value: { agent_transfer_takeover: 'all' } } })
    mocks.post.mockResolvedValue({ success: true })
  })

  it('单一入口编辑并独立保存通知策略，不提交智能体系统设置', async () => {
    const user = userEvent.setup()
    await renderWithProviders(AgentTransferNotificationPolicy, { stubActions: false })
    const field = screen.getByRole('combobox', { name: '自动整理接管通知' })
    await waitFor(() => expect(field).toHaveAttribute('aria-disabled', 'false'))
    await user.click(field)
    await user.click(await screen.findByRole('option', { name: '仅需人工处理时通知' }))
    const section = screen.getByRole('region', { name: '自动整理接管通知' })
    expect(within(section).getByText('仅需人工处理时通知')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '保存通知策略' }))
    await waitFor(() => expect(mocks.success).toHaveBeenCalledWith('通知策略已保存'))
    expect(mocks.get).toHaveBeenCalledTimes(1)
    expect(mocks.post).toHaveBeenCalledTimes(1)
    expect(mocks.post.mock.calls[0][1]).toEqual({
      setting_key: 'NotificationPolicies',
      operation: 'replace',
      value: { agent_transfer_takeover: 'attention' },
    })
  })

  it('后端读取失败时不允许盲目保存，并显示明确的重试入口', async () => {
    mocks.get.mockRejectedValueOnce(new Error('offline'))
    const user = userEvent.setup()
    await renderWithProviders(AgentTransferNotificationPolicy, { stubActions: false })
    expect(await screen.findByText(/无法读取通知策略/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '保存通知策略' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: '重试' }))
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: '自动整理接管通知' })).toHaveAttribute('aria-disabled', 'false'),
    )
    expect(mocks.post).not.toHaveBeenCalled()
  })

  it('保存失败时不显示成功，保留用户草稿用于重试', async () => {
    mocks.post.mockRejectedValueOnce(new Error('offline'))
    const user = userEvent.setup()
    await renderWithProviders(AgentTransferNotificationPolicy, { stubActions: false })
    const field = screen.getByRole('combobox', { name: '自动整理接管通知' })
    await waitFor(() => expect(field).toHaveAttribute('aria-disabled', 'false'))
    await user.click(field)
    await user.click(await screen.findByRole('option', { name: '关闭主动通知' }))
    await user.click(screen.getByRole('button', { name: '保存通知策略' }))
    expect(await screen.findByText(/通知策略保存失败/)).toBeInTheDocument()
    expect(mocks.success).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: '保存通知策略' })).not.toBeDisabled()
  })
})
