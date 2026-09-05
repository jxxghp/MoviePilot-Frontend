import type { DownloadingInfo, DownloadTaskUpdateData, DownloadTaskUpdateRequest } from '@/api/types'
import DownloadTaskSettingsDialog from '@/components/dialog/DownloadTaskSettingsDialog.vue'
import { fireEvent, screen, waitFor } from '@testing-library/vue'
import { renderWithProviders } from '@tests/support/render'
import { updateDownloadTaskHandler } from '@tests/support/msw/handlers/download'
import { server } from '@tests/support/msw/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  toastWarning: vi.fn(),
}))

vi.mock('vue-toastification', () => ({
  useToast: () => ({
    error: mocks.toastError,
    success: mocks.toastSuccess,
    warning: mocks.toastWarning,
  }),
}))

const HASH = '0123456789abcdef0123456789abcdef01234567'

/** 创建包含后端高级字段的最小下载任务。 */
function task(overrides: Partial<DownloadingInfo> = {}): DownloadingInfo {
  return {
    category: 'movies',
    download_limit: 128,
    hash: HASH,
    media: {},
    ratio_limit: 2,
    save_path: '/downloads',
    seeding_time_limit: 60,
    title: '测试下载任务',
    upload_limit: 64,
    ...overrides,
  }
}

/** 创建指定逐项结果的高级修改响应。 */
function mutationData(results: DownloadTaskUpdateData['results']): DownloadTaskUpdateData {
  return { downloader: 'qb-main', hash: HASH, results }
}

/** 渲染下载任务高级设置弹窗。 */
async function renderDialog(downloaderType = 'qbittorrent', currentTask = task()) {
  return renderWithProviders(DownloadTaskSettingsDialog, {
    global: {
      stubs: { VDialogCloseBtn: true },
    },
    props: {
      downloaderName: 'qb-main',
      downloaderType,
      modelValue: true,
      task: currentTask,
    },
  })
}

beforeEach(() => {
  mocks.toastError.mockReset()
  mocks.toastSuccess.mockReset()
  mocks.toastWarning.mockReset()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('DownloadTaskSettingsDialog', () => {
  it('submits only changed values and explicit additions', async () => {
    const requested = vi.fn<(body: DownloadTaskUpdateRequest) => void>()
    server.use(
      updateDownloadTaskHandler(
        HASH,
        {
          success: true,
          data: mutationData([
            { message: '限速/做种策略修改成功', operation: 'limits', success: true },
            { message: 'Tracker修改成功', operation: 'trackers', success: true },
            { message: '分类修改成功', operation: 'category', success: true },
          ]),
        },
        200,
        requested,
      ),
    )
    const { emitted } = await renderDialog()

    await fireEvent.update(screen.getByLabelText('下载限速'), '256')
    await fireEvent.update(screen.getByLabelText('下载器分类'), 'archive')
    await fireEvent.update(screen.getByLabelText('更新 Tracker'), 'https://tracker.example.com/announce')
    await fireEvent.click(screen.getByRole('button', { name: '保存' }))

    await waitFor(() => expect(requested).toHaveBeenCalledOnce())
    expect(requested).toHaveBeenCalledWith({
      category: 'archive',
      download_limit: 256,
      downloader: 'qb-main',
      trackers: ['https://tracker.example.com/announce'],
    })
    expect(mocks.toastSuccess).toHaveBeenCalledWith('下载任务设置已保存')
    expect(emitted().saved).toHaveLength(1)
    expect(emitted()['update:modelValue']).toContainEqual([false])
  })

  it('keeps partial operation results visible instead of reporting full success', async () => {
    const requested = vi.fn<(body: DownloadTaskUpdateRequest) => void>()
    server.use(
      updateDownloadTaskHandler(
        HASH,
        {
          success: false,
          message: '',
          data: mutationData([
            { message: '保存目录修改成功', operation: 'save_path', success: true },
            { message: '分类修改失败或下载器不支持', operation: 'category', success: false },
          ]),
        },
        200,
        requested,
      ),
    )
    const { emitted } = await renderDialog()

    await fireEvent.update(screen.getByLabelText('保存目录'), '/new-downloads')
    await fireEvent.update(screen.getByLabelText('下载器分类'), 'archive')
    await fireEvent.click(screen.getByRole('button', { name: '保存' }))

    expect(await screen.findByText('保存目录修改成功')).toBeInTheDocument()
    expect(screen.getByText('分类修改失败或下载器不支持')).toBeInTheDocument()
    expect(mocks.toastWarning).toHaveBeenCalledWith('部分设置未生效，请查看逐项结果')
    expect(mocks.toastSuccess).not.toHaveBeenCalled()
    expect(emitted().saved).toHaveLength(1)
    expect(emitted()['update:modelValue']).toBeUndefined()

    await fireEvent.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() => expect(requested).toHaveBeenCalledTimes(2))
    expect(requested.mock.calls[1][0]).toEqual({ category: 'archive', downloader: 'qb-main' })
  })

  it('hides settings that rTorrent cannot apply while retaining common controls', async () => {
    await renderDialog('rtorrent')

    expect(screen.getByLabelText('下载限速')).toBeInTheDocument()
    expect(screen.getByLabelText('上传限速')).toBeInTheDocument()
    expect(screen.getByLabelText('保存目录')).toBeInTheDocument()
    expect(screen.getByLabelText('添加标签')).toBeInTheDocument()
    expect(screen.queryByLabelText('分享率限制')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('做种时间限制')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('下载器分类')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('更新 Tracker')).not.toBeInTheDocument()
  })

  it('does not submit an unchanged task', async () => {
    await renderDialog()

    expect(screen.getByRole('button', { name: '保存' })).toBeDisabled()
  })
})
