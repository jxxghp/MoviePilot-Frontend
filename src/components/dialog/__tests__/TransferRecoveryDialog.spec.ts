import type { TransferHistory } from '@/api/types'
import TransferRecoveryDialog from '@/components/dialog/TransferRecoveryDialog.vue'
import { fireEvent, screen, waitFor } from '@testing-library/vue'
import { renderWithProviders } from '@tests/support/render'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ post: vi.fn() }))
vi.mock('@/api', () => ({ default: { post: (...args: unknown[]) => mocks.post(...args) } }))

/** 构造具有完整路径和持久任务绑定的失败历史。 */
async function renderDialog(overrides: Partial<TransferHistory> = {}, canManage = true) {
  return renderWithProviders(TransferRecoveryDialog, {
    props: {
      canManage,
      history: {
        id: 17,
        status: false,
        src: '/downloads/movie.mkv',
        dest: '/media/movie.mkv',
        transfer_task_id: 'task-17',
        failure_stage: 'destination_access',
        errmsg: '目标目录不可写',
        recovery_action: '检查目标目录权限后重试',
        auto_paused: true,
        retry_count: 3,
        ...overrides,
      },
    },
    global: { stubs: { VDialog: { template: '<div><slot /></div>' } } },
  })
}

describe('TransferRecoveryDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.post.mockResolvedValue(null)
  })

  it('shows paths, stage, pause recovery and requires confirmation before detaching', async () => {
    const user = userEvent.setup()
    const { emitted } = await renderDialog()
    expect(screen.getByText(/\/downloads\/movie.mkv/)).toBeInTheDocument()
    expect(screen.getByText(/\/media\/movie.mkv/)).toBeInTheDocument()
    expect(screen.getByText('目标存储访问')).toBeInTheDocument()
    expect(screen.getByText(/移除“已整理”标签/)).toBeInTheDocument()
    const button = screen.getByRole('button', { name: '解除失效任务绑定' })
    expect(button).toBeDisabled()
    await user.click(screen.getByRole('checkbox'))
    await user.click(button)
    await waitFor(() => expect(emitted('updated')).toHaveLength(1))
    expect(mocks.post).toHaveBeenCalledWith('history/transfer/17/discard-corrupt', undefined, { feedback: 'silent' })
    expect(screen.getByText(/任务绑定已解除/)).toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '重新整理' }))
    expect(emitted('redo')).toHaveLength(1)
    await user.click(screen.getByRole('button', { name: '查看整理队列' }))
    expect(emitted('queue')).toHaveLength(1)
  })

  it('keeps imported media successful and resolves only cleanup after user confirmation', async () => {
    const user = userEvent.setup()
    await renderDialog({
      status: true,
      cleanup_status: 'failed',
      cleanup_error: '下载器离线',
      failure_stage: 'downloader_cleanup',
      auto_paused: false,
    })
    expect(screen.getByText('下载器离线')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '重新整理' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('checkbox'))
    await user.click(screen.getByRole('button', { name: '已手动清理下载器' }))
    await waitFor(() =>
      expect(mocks.post).toHaveBeenCalledWith('history/transfer/17/cleanup-resolved', undefined, {
        feedback: 'silent',
      }),
    )
    expect(await screen.findByText('下载器清理告警已关闭。')).toBeInTheDocument()
  })

  it('retains rejected recovery and allows retry without emitting success', async () => {
    mocks.post.mockRejectedValueOnce(new Error('整理任务正在处理中，暂时无法放弃'))
    const user = userEvent.setup()
    const { emitted } = await renderDialog()
    await user.click(screen.getByRole('checkbox'))
    await user.click(screen.getByRole('button', { name: '解除失效任务绑定' }))
    expect(await screen.findByText('整理任务正在处理中，暂时无法放弃')).toBeInTheDocument()
    expect(emitted('updated')).toBeUndefined()
    expect(screen.getByRole('button', { name: '查看整理队列' })).toBeEnabled()
    await user.click(screen.getByRole('button', { name: '解除失效任务绑定' }))
    await waitFor(() => expect(emitted('updated')).toHaveLength(1))
    expect(screen.queryByText('整理任务正在处理中，暂时无法放弃')).not.toBeInTheDocument()
    expect(mocks.post).toHaveBeenCalledTimes(2)
  })

  it('blocks repeated confirmation and follow-up actions while recovery is pending', async () => {
    let finish!: () => void
    mocks.post.mockImplementationOnce(
      () =>
        new Promise<void>(resolve => {
          finish = resolve
        }),
    )
    const user = userEvent.setup()
    const { emitted } = await renderDialog()
    await user.click(screen.getByRole('checkbox'))
    const confirm = screen.getByRole('button', { name: '解除失效任务绑定' })
    await fireEvent.click(confirm)
    await fireEvent.click(confirm)
    expect(mocks.post).toHaveBeenCalledTimes(1)
    expect(confirm).toBeDisabled()
    expect(screen.getByRole('checkbox')).toBeDisabled()
    expect(screen.getByRole('button', { name: '重新整理' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '查看整理队列' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '关闭' })).toBeDisabled()
    finish()
    await waitFor(() => expect(emitted('updated')).toHaveLength(1))
    expect(screen.getByRole('button', { name: '重新整理' })).toBeEnabled()
  })

  it('shows unknown backend stages verbatim and does not offer detachment without a task', async () => {
    await renderDialog({ failure_stage: 'new_backend_stage', transfer_task_id: undefined })
    expect(screen.getByText('new_backend_stage')).toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '重新整理' })).toBeEnabled()
  })

  it('does not expose mutations without manage permission', async () => {
    await renderDialog({}, false)
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '重新整理' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '查看整理队列' })).not.toBeInTheDocument()
    expect(mocks.post).not.toHaveBeenCalled()
  })
})
