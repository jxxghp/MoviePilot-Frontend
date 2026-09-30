import SmbConfigDialog from '@/components/dialog/SmbConfigDialog.vue'
import { manageStorage } from '@/api/manage'
import { renderWithProviders } from '@tests/support/render'
import { fireEvent, screen, waitFor } from '@testing-library/vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/api/manage', () => ({ manageStorage: vi.fn() }))

/** 通过真实表单验证配置格式，弹窗容器不依赖浏览器定位。 */
async function openConfig(conf: Record<string, unknown>) {
  return renderWithProviders(SmbConfigDialog, {
    props: { conf },
    global: { stubs: { VDialog: { template: '<div><slot /></div>' }, VDialogCloseBtn: true } },
  })
}

beforeEach(() => {
  vi.mocked(manageStorage).mockReset().mockResolvedValue({})
})

describe('SmbConfigDialog', () => {
  it('keeps legacy share configuration unchanged when saving', async () => {
    const conf = { host: '10.10.10.11', share: 'video', port: 445 }
    await openConfig(conf)
    await fireEvent.click(screen.getByRole('button', { name: '完成' }))
    await waitFor(() => expect(manageStorage).toHaveBeenCalledWith('smb', 'save_config', { conf }))
    expect(conf).toEqual({ host: '10.10.10.11', share: 'video', port: 445 })
  })

  it('saves multiple shares under one service and shows the path migration hint', async () => {
    const conf = { host: '10.10.10.11', share: 'video', username: 'user' }
    await openConfig(conf)
    await fireEvent.click(screen.getByRole('checkbox', { name: '同时挂载多个共享' }))
    await fireEvent.update(screen.getByRole('textbox', { name: '共享名称列表' }), ' video \ndownloads\n')
    expect(screen.getByText(/切换模式后，请同步更新目录配置/)).toBeInTheDocument()
    await fireEvent.click(screen.getByRole('button', { name: '完成' }))
    await waitFor(() =>
      expect(manageStorage).toHaveBeenCalledWith('smb', 'save_config', {
        conf: { host: '10.10.10.11', username: 'user', shares: ['video', 'downloads'] },
      }),
    )
    expect(conf.share).toBe('video')
  })

  it.each(['', 'video\nVIDEO', '../video', 'video/downloads'])('rejects invalid share names: %s', async value => {
    await openConfig({ host: 'host', shares: ['video', 'downloads'] })
    await fireEvent.update(screen.getByRole('textbox', { name: '共享名称列表' }), value)
    expect(screen.getByRole('button', { name: '完成' })).toBeDisabled()
    expect(manageStorage).not.toHaveBeenCalled()
  })

  it('retains the namespace when only one share remains', async () => {
    await openConfig({ host: 'host', shares: ['video', 'downloads'] })
    await fireEvent.update(screen.getByRole('textbox', { name: '共享名称列表' }), 'video')
    await fireEvent.click(screen.getByRole('button', { name: '完成' }))
    await waitFor(() =>
      expect(manageStorage).toHaveBeenCalledWith('smb', 'save_config', {
        conf: { host: 'host', shares: ['video'] },
      }),
    )
  })

  it('does not close or emit success when saving fails', async () => {
    vi.mocked(manageStorage).mockRejectedValueOnce(new Error('offline'))
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const { emitted } = await openConfig({ host: 'host', shares: ['video'] })
    await fireEvent.click(screen.getByRole('button', { name: '完成' }))
    await waitFor(() => expect(manageStorage).toHaveBeenCalledTimes(1))
    expect(emitted().done).toBeUndefined()
  })

  it('resets without saving the stale form again', async () => {
    await openConfig({ host: 'host', shares: ['video'] })
    await fireEvent.click(screen.getByRole('button', { name: '重置' }))
    await waitFor(() => expect(manageStorage).toHaveBeenCalledExactlyOnceWith('smb', 'reset_config'))
  })
})
