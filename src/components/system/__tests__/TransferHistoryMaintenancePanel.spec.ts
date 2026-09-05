import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { cwd } from 'node:process'
import TransferHistoryMaintenancePanel from '@/components/system/TransferHistoryMaintenancePanel.vue'
import { fireEvent, screen, waitFor } from '@testing-library/vue'
import { renderWithProviders } from '@tests/support/render'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const componentSource = readFileSync(
  resolve(cwd(), 'src/components/system/TransferHistoryMaintenancePanel.vue'),
  'utf8',
)

const mocks = vi.hoisted(() => ({
  clearHistory: vi.fn(),
  confirm: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}))

vi.mock('@/api/history', () => ({
  clearLegacyTransferHistory: mocks.clearHistory,
}))

vi.mock('@/composables/useConfirm', () => ({
  useConfirm: () => mocks.confirm,
}))

vi.mock('vue-toastification', () => ({
  useToast: () => ({
    error: mocks.toastError,
    success: mocks.toastSuccess,
  }),
}))

function renderPanel(superUser = true) {
  return renderWithProviders(TransferHistoryMaintenancePanel, {
    initialState: { user: { superUser } },
  })
}

function createDeferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(resolvePromise => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

describe('TransferHistoryMaintenancePanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.confirm.mockResolvedValue(true)
    mocks.clearHistory.mockResolvedValue(undefined)
  })

  it('clears transfer history only after explicit confirmation', async () => {
    await renderPanel()

    await fireEvent.click(screen.getByRole('button', { name: '清空整理历史' }))

    await waitFor(() => expect(mocks.clearHistory).toHaveBeenCalledOnce())
    expect(mocks.confirm).toHaveBeenCalledWith(
      expect.objectContaining({
        confirmText: '清空整理历史',
        content: expect.stringContaining('不会删除源文件或媒体库文件'),
        title: '清空整理历史',
      }),
    )
    expect(mocks.toastSuccess).toHaveBeenCalledWith('旧整理记录已清空，失败任务记录已保留')
  })

  it('does not call the destructive endpoint when confirmation is cancelled', async () => {
    mocks.confirm.mockResolvedValue(false)
    await renderPanel()

    await fireEvent.click(screen.getByRole('button', { name: '清空整理历史' }))

    await waitFor(() => expect(mocks.confirm).toHaveBeenCalledOnce())
    expect(mocks.clearHistory).not.toHaveBeenCalled()
  })

  it('blocks duplicate submissions while the clear request is pending', async () => {
    const request = createDeferred<void>()
    mocks.clearHistory.mockReturnValue(request.promise)
    await renderPanel()
    const button = screen.getByRole('button', { name: '清空整理历史' })

    await fireEvent.click(button)
    await waitFor(() => expect(mocks.clearHistory).toHaveBeenCalledOnce())
    await fireEvent.click(button)

    expect(mocks.confirm).toHaveBeenCalledOnce()
    expect(mocks.clearHistory).toHaveBeenCalledOnce()
    request.resolve()
    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalledOnce())
  })

  it('reports a failed clear and remains available for retry', async () => {
    mocks.clearHistory.mockRejectedValueOnce(new Error('unavailable')).mockResolvedValueOnce(undefined)
    await renderPanel()
    const button = screen.getByRole('button', { name: '清空整理历史' })

    await fireEvent.click(button)
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('整理历史清空失败，请稍后重试'))
    await fireEvent.click(button)

    await waitFor(() => expect(mocks.clearHistory).toHaveBeenCalledTimes(2))
    expect(mocks.toastSuccess).toHaveBeenCalledWith('旧整理记录已清空，失败任务记录已保留')
  })

  it('is hidden for non-superusers and uses a full-width mobile action', async () => {
    await renderPanel(false)

    expect(screen.queryByRole('button', { name: '清空整理历史' })).not.toBeInTheDocument()
    expect(componentSource).toContain('@media (max-width: 600px)')
    expect(componentSource).toContain('inline-size: 100%;')
  })
})
