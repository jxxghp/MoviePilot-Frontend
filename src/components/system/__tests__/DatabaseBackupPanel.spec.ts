import DatabaseBackupPanel from '@/components/system/DatabaseBackupPanel.vue'
import { fireEvent, screen, waitFor } from '@testing-library/vue'
import { renderWithProviders } from '@tests/support/render'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createBackup: vi.fn(),
  deleteBackup: vi.fn(),
  listBackups: vi.fn(),
  confirm: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  verifyBackup: vi.fn(),
}))

vi.mock('@/api/databaseBackup', () => ({
  createDatabaseBackup: mocks.createBackup,
  deleteDatabaseBackup: mocks.deleteBackup,
  listDatabaseBackups: mocks.listBackups,
  verifyDatabaseBackup: mocks.verifyBackup,
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

const existingBackup = {
  name: 'moviepilot_v3.0.0_sqlite_20260825_120000.db',
  db_type: 'sqlite',
  created_at: '2026-08-25T12:00:00',
  size: 4096,
}

describe('DatabaseBackupPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.listBackups.mockResolvedValue([existingBackup])
    mocks.createBackup.mockResolvedValue(existingBackup)
    mocks.deleteBackup.mockResolvedValue(undefined)
    mocks.confirm.mockResolvedValue(true)
    mocks.verifyBackup.mockResolvedValue({ valid: true, method: 'PRAGMA integrity_check' })
  })

  it('loads only after activation and exposes managed backup fields', async () => {
    const view = await renderWithProviders(DatabaseBackupPanel, { props: { active: false } })

    expect(mocks.listBackups).not.toHaveBeenCalled()
    await view.rerender({ active: true })

    expect(await screen.findByText(existingBackup.name)).toBeInTheDocument()
    expect(screen.getByText('SQLite')).toBeInTheDocument()
    expect(screen.getByText('4 KB')).toBeInTheDocument()
    expect(screen.queryByText('未校验')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: '查看还原命令' })).toHaveAttribute(
      'href',
      expect.stringContaining('docs/cli.md'),
    )
  })

  it('refreshes the list after creating a backup', async () => {
    const newBackup = {
      ...existingBackup,
      name: 'moviepilot_v3.0.0_sqlite_20260825_120001.db',
      created_at: '2026-08-25T12:00:01',
    }
    mocks.listBackups.mockResolvedValueOnce([existingBackup]).mockResolvedValueOnce([newBackup, existingBackup])
    mocks.createBackup.mockResolvedValue(newBackup)
    await renderWithProviders(DatabaseBackupPanel, { props: { active: true } })
    await screen.findByText(existingBackup.name)

    await fireEvent.click(screen.getByRole('button', { name: '立即备份' }))

    expect(await screen.findByText(newBackup.name)).toBeInTheDocument()
    expect(mocks.createBackup).toHaveBeenCalledTimes(1)
    expect(mocks.listBackups).toHaveBeenCalledTimes(2)
    expect(mocks.toastSuccess).toHaveBeenCalledWith('数据库备份已创建')
  })

  it('reports the result when verifying a backup', async () => {
    await renderWithProviders(DatabaseBackupPanel, { props: { active: true } })
    await screen.findByText(existingBackup.name)

    await fireEvent.click(screen.getByRole('button', { name: `管理备份 ${existingBackup.name}` }))
    await fireEvent.click(await screen.findByText('校验'))

    await waitFor(() => expect(mocks.verifyBackup).toHaveBeenCalledWith(existingBackup.name))
    expect(mocks.verifyBackup).toHaveBeenCalledWith(existingBackup.name)
    expect(mocks.toastSuccess).toHaveBeenCalledWith('数据库备份校验通过')
  })

  it('deletes a backup after confirmation and removes its row', async () => {
    await renderWithProviders(DatabaseBackupPanel, { props: { active: true } })
    await screen.findByText(existingBackup.name)

    await fireEvent.click(screen.getByRole('button', { name: `管理备份 ${existingBackup.name}` }))
    await fireEvent.click(await screen.findByText('删除'))

    await waitFor(() => expect(screen.queryByText(existingBackup.name)).not.toBeInTheDocument())
    expect(mocks.confirm).toHaveBeenCalledWith(
      expect.objectContaining({
        title: '删除数据库备份',
        content: `确定删除 ${existingBackup.name} 吗？删除后无法恢复。`,
      }),
    )
    expect(mocks.deleteBackup).toHaveBeenCalledWith(existingBackup.name)
    expect(mocks.toastSuccess).toHaveBeenCalledWith('数据库备份已删除')
  })

  it('keeps the backup when deletion is cancelled', async () => {
    mocks.confirm.mockResolvedValue(false)
    await renderWithProviders(DatabaseBackupPanel, { props: { active: true } })
    await screen.findByText(existingBackup.name)

    await fireEvent.click(screen.getByRole('button', { name: `管理备份 ${existingBackup.name}` }))
    await fireEvent.click(await screen.findByText('删除'))

    await waitFor(() => expect(mocks.confirm).toHaveBeenCalledTimes(1))
    expect(mocks.deleteBackup).not.toHaveBeenCalled()
    expect(screen.getByText(existingBackup.name)).toBeInTheDocument()
  })

  it('keeps the panel recoverable after a list failure', async () => {
    mocks.listBackups.mockRejectedValueOnce(new Error('unavailable')).mockResolvedValueOnce([])
    await renderWithProviders(DatabaseBackupPanel, { props: { active: true } })

    expect(await screen.findByText('备份列表加载失败')).toBeInTheDocument()
    await fireEvent.click(screen.getByRole('button', { name: '重试' }))

    expect(await screen.findByText('暂无数据库备份')).toBeInTheDocument()
    expect(mocks.listBackups).toHaveBeenCalledTimes(2)
  })
})
