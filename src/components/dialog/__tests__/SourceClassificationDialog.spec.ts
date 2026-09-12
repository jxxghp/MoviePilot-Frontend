import { fireEvent, screen, waitFor } from '@testing-library/vue'
import { renderWithProviders } from '@tests/support/render'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import SourceClassificationDialog from '../SourceClassificationDialog.vue'

const mocks = vi.hoisted(() => ({ post: vi.fn(), get: vi.fn(), success: vi.fn() }))
vi.mock('@/api', () => ({
  default: { post: mocks.post, get: mocks.get },
  getApiBusinessErrorMessage: () => '核验失败',
}))
vi.mock('vue-toastification', () => ({ useToast: () => ({ success: mocks.success }) }))
vi.mock('@/components/misc/MediaIdSelector.vue', () => ({ default: { template: '<div />' } }))

const preview = {
  hash: 'a'.repeat(40),
  downloader: 'qb',
  mode: 'keep',
  recognized: true,
  current_save_path: '/music',
  target_save_path: '/music',
  current_content_path: '/music/old',
  target_content_path: '/music/new',
  current_root_name: 'old',
  proposed_root_name: 'new',
  secondary_categories: [],
  rename_kind: 'folder',
  changed: true,
  executed: false,
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.get.mockResolvedValue([])
})

describe('资源规范化确认与核验', () => {
  it('文件入口使用相同 API，qB 接收请求后不关闭或报告成功', async () => {
    mocks.post.mockResolvedValueOnce(preview).mockResolvedValueOnce({
      ...preview,
      operation_id: 'operation',
      state: 'rename_requested',
      message: '等待路径核验',
    })
    const view = await renderWithProviders(SourceClassificationDialog, {
      props: {
        embedded: true,
        sourceFile: { storage: 'local', path: '/music/old', type: 'dir', name: 'old' },
      },
    })
    await fireEvent.click(screen.getByText('识别并预览'))
    await waitFor(() => expect(screen.getByText('确认由下载器执行')).toBeTruthy())
    await fireEvent.click(screen.getByText('确认由下载器执行'))
    await waitFor(() => expect(screen.getByText('继续核验')).toBeTruthy())
    expect(mocks.post.mock.calls[0][0]).toBe('download/source/normalize')
    expect(mocks.post.mock.calls[1][1]).toMatchObject({
      execute: true,
      expected_root_name: 'new',
      expected_content_path: '/music/old',
    })
    expect(mocks.success).not.toHaveBeenCalled()
    expect(view.emitted().close).toBeUndefined()
    expect(view.emitted().done).toBeUndefined()
    view.unmount()
  })

  it('仅核验完成才通知 MP 记录已同步，查询使用原操作身份', async () => {
    mocks.post
      .mockResolvedValueOnce({ ...preview, operation_id: 'operation', state: 'move_requested' })
      .mockResolvedValueOnce({ ...preview, operation_id: 'operation', state: 'complete', executed: true })
    const view = await renderWithProviders(SourceClassificationDialog, {
      props: {
        embedded: true,
        task: { download_hash: preview.hash, downloader: 'qb', title: '专辑' },
      },
    })
    await fireEvent.click(screen.getByText('识别并预览'))
    await waitFor(() => expect(screen.getByText('继续核验')).toBeTruthy())
    await fireEvent.click(screen.getByText('继续核验'))
    await waitFor(() => expect(mocks.success).toHaveBeenCalledOnce())
    expect(mocks.post.mock.calls[1]).toEqual([
      `download/${preview.hash}/source-status`,
      { downloader: 'qb', operation_id: 'operation' },
      { feedback: 'silent' },
    ])
    expect(view.emitted().done).toHaveLength(1)
    view.unmount()
  })
})
