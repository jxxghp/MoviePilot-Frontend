import DatabaseBackupPanel from '@/components/system/DatabaseBackupPanel.vue'
import { fireEvent, screen, waitFor } from '@testing-library/vue'
import { renderWithProviders } from '@tests/support/render'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createBackup: vi.fn(),
  listBackups: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  verifyBackup: vi.fn(),
}))

vi.mock('@/api/databaseBackup', () => ({
  createDatabaseBackup: mocks.createBackup,
  listDatabaseBackups: mocks.listBackups,
  verifyDatabaseBackup: mocks.verifyBackup,
}))

vi.mock('vue-toastification', () => ({
  useToast: () => ({
    error: mocks.toastError,
    success: mocks.toastSuccess,
  }),
}))

const existingBackup = {
  name: 'sqlite_20260825_120000.db',
  db_type: 'sqlite',
  created_at: '2026-08-25T12:00:00',
  size: 4096,
}

describe('DatabaseBackupPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.listBackups.mockResolvedValue([existingBackup])
    mocks.createBackup.mockResolvedValue(existingBackup)
    mocks.verifyBackup.mockResolvedValue({ valid: true, method: 'PRAGMA integrity_check' })
  })

  it('loads only after activation and exposes managed backup fields', async () => {
    const view = await renderWithProviders(DatabaseBackupPanel, { props: { active: false } })

    expect(mocks.listBackups).not.toHaveBeenCalled()
    await view.rerender({ active: true })

    expect(await screen.findByText(existingBackup.name)).toBeInTheDocument()
    expect(screen.getByText('SQLite')).toBeInTheDocument()
    expect(screen.getByText('4 KB')).toBeInTheDocument()
    expect(screen.getByText('未校验')).toBeInTheDocument()
  })

  it('refreshes the list after creating a backup', async () => {
    const newBackup = {
      ...existingBackup,
      name: 'sqlite_20260825_120001.db',
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

  it('keeps verification state on the selected row', async () => {
    await renderWithProviders(DatabaseBackupPanel, { props: { active: true } })
    await screen.findByText(existingBackup.name)

    await fireEvent.click(screen.getByRole('button', { name: `校验备份 ${existingBackup.name}` }))

    await waitFor(() => expect(screen.getByText('有效')).toBeInTheDocument())
    expect(mocks.verifyBackup).toHaveBeenCalledWith(existingBackup.name)
    expect(mocks.toastSuccess).toHaveBeenCalledWith('数据库备份校验通过')
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
