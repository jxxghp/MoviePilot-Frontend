import DialogCloseBtn from '@/@core/components/DialogCloseBtn.vue'
import type { Plugin, PluginRating } from '@/api/types'
import PluginMarketDetailDialog from '@/components/dialog/PluginMarketDetailDialog.vue'
import { renderWithProviders } from '@tests/support/render'
import { fireEvent, screen, waitFor } from '@testing-library/vue'
import type { Stubs } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  confirm: vi.fn(),
  dialogClose: vi.fn(),
  openSharedDialog: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}))

vi.mock('@/api', () => ({
  default: createDataApiMock({
    get: mocks.apiGet,
    post: mocks.apiPost,
  }),
}))

vi.mock('vue-toastification', () => ({
  useToast: () => ({ error: mocks.toastError, success: mocks.toastSuccess }),
}))

vi.mock('@/composables/useSharedDialog', () => ({
  openSharedDialog: (...args: unknown[]) => mocks.openSharedDialog(...args),
}))

vi.mock('@/composables/useConfirm', () => ({
  useConfirm: () => mocks.confirm,
}))

const basePlugin: Plugin = {
  id: 'DemoPlugin',
  plugin_name: '演示插件',
  plugin_desc: '用于测试插件评分',
  plugin_version: '1.0.0',
  plugin_author: 'MoviePilot',
  repo_url: 'https://github.com/example/plugins',
  average_rating: 4.3,
  rating_count: 12,
  user_rating: 4.0,
}

const ratingResult: PluginRating = {
  plugin_id: 'DemoPlugin',
  average_rating: 4.3,
  rating_count: 12,
  user_rating: 4.0,
}

const ImageStub = defineComponent({
  name: 'VImg',
  emits: ['error'],
  template: '<button data-testid="plugin-image" @contextmenu.prevent="$emit(\'error\')" />',
})

async function renderDialog(plugin: Plugin, stubs: Stubs = {}, extraProps: Record<string, unknown> = {}) {
  return renderWithProviders(PluginMarketDetailDialog, {
    props: {
      modelValue: true,
      plugin,
      ...extraProps,
    },
    global: {
      components: { VDialogCloseBtn: DialogCloseBtn },
      stubs,
    },
  })
}

describe('PluginMarketDetailDialog', () => {
  beforeEach(() => {
    mocks.apiGet.mockReset().mockImplementation((url: string) => {
      if (url === 'plugin/rating/DemoPlugin') return Promise.resolve(ratingResult)
      return Promise.resolve({ success: true })
    })
    mocks.apiPost.mockReset().mockResolvedValue({
      success: true,
      data: { ...ratingResult, average_rating: 4.5, user_rating: 4.5 },
    })
    mocks.confirm.mockReset().mockResolvedValue(true)
    mocks.dialogClose.mockReset()
    mocks.openSharedDialog.mockReset().mockReturnValue({
      close: mocks.dialogClose,
      id: 1,
      updateProps: vi.fn(),
    })
    mocks.toastError.mockReset()
    mocks.toastSuccess.mockReset()
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  it('shows install action and readonly rating for a market plugin', async () => {
    await renderDialog({ ...basePlugin, installed: false })

    expect(await screen.findByText('安装到本地')).toBeInTheDocument()
    expect(screen.queryByText('提交评分')).not.toBeInTheDocument()
    expect(screen.getByLabelText('4.3 / 5')).toBeInTheDocument()
  })

  it('hides install action and submits a half-star rating for an installed plugin', async () => {
    const { emitted } = await renderDialog({ ...basePlugin, installed: true })

    expect(await screen.findByText('提交评分')).toBeInTheDocument()
    expect(screen.queryByText('安装到本地')).not.toBeInTheDocument()

    const ratingInput = document.querySelector<HTMLInputElement>('.v-rating input[value="4.5"]')
    expect(ratingInput).not.toBeNull()
    const ratingLabel = document.querySelector<HTMLLabelElement>(`label[for="${ratingInput?.id}"]`)
    expect(ratingLabel).not.toBeNull()
    await fireEvent.click(ratingLabel!)
    await fireEvent.click(screen.getByRole('button', { name: '提交评分' }))

    await waitFor(() => {
      expect(mocks.apiPost).toHaveBeenCalledWith('plugin/rating/DemoPlugin', { rating: 4.5 })
    })
    expect(emitted().rating).toContainEqual([
      expect.objectContaining({ average_rating: 4.5, plugin_id: 'DemoPlugin', user_rating: 4.5 }),
    ])
    expect(mocks.toastSuccess).toHaveBeenCalledWith('已提交对插件 演示插件 的评分')
  })

  it('keeps plugin metadata and rating input visible when nobody has rated yet', async () => {
    mocks.apiGet.mockResolvedValueOnce({
      plugin_id: 'DemoPlugin',
      average_rating: 0,
      rating_count: 0,
      user_rating: undefined,
    })

    await renderDialog({
      ...basePlugin,
      installed: true,
      average_rating: 0,
      rating_count: 0,
      user_rating: undefined,
    })

    expect(await screen.findByText('v1.0.0')).toBeInTheDocument()
    expect(screen.queryByText('插件评分：')).not.toBeInTheDocument()
    expect(screen.getByText('我的评分')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '提交评分' })).toBeInTheDocument()
  })

  it('keeps long plugin details in centered metadata rows', async () => {
    const pluginDescription = '支持包含较长说明文字和换行内容的插件详情。\n第二行内容保持完整展示。'
    const pluginAuthor = 'MoviePilot-Plugin-Author-With-A-Long-Name'

    await renderDialog({
      ...basePlugin,
      installed: true,
      plugin_desc: pluginDescription,
      plugin_author: pluginAuthor,
      system_version: 'v2.15.0 or later',
    })

    const description = document.querySelector('.plugin-market-detail__description')

    expect(description).toHaveTextContent('支持包含较长说明文字和换行内容的插件详情。 第二行内容保持完整展示。')
    expect(screen.getByRole('button', { name: pluginAuthor })).toHaveClass('plugin-market-detail__author')

    const metadata = document.querySelector('.plugin-market-detail__metadata')
    const metadataRows = metadata?.querySelectorAll('.plugin-market-detail__metadata-row')

    expect(metadataRows).toHaveLength(2)
    metadataRows?.forEach(row => {
      expect(row.querySelector(':scope > dt')).not.toBeNull()
      expect(row.querySelector(':scope > dd')).not.toBeNull()
    })

    const headerRating = document.querySelector('.plugin-market-detail__header-rating')

    expect(headerRating?.previousElementSibling).toBe(description)
    expect(headerRating?.querySelector('.plugin-rating-display')).not.toBeNull()
    expect(screen.queryByText('插件评分：')).not.toBeInTheDocument()
    expect(screen.queryByText('v2.15.0 or later')).not.toBeInTheDocument()
  })

  it('emits installation completion only after installation succeeds', async () => {
    const { emitted } = await renderDialog({ ...basePlugin, installed: false })

    await fireEvent.click(await screen.findByRole('button', { name: '安装到本地' }))

    await waitFor(() => {
      expect(mocks.apiGet).toHaveBeenCalledWith('plugin/install/DemoPlugin', {
        params: {
          force: false,
          release_version: undefined,
          repo_url: 'https://github.com/example/plugins',
        },
      })
    })
    expect(mocks.toastSuccess).toHaveBeenCalledWith('插件 演示插件 安装成功！')
    expect(emitted().install).toHaveLength(1)
    expect(emitted()['update:modelValue']).toContainEqual([false])
    expect(mocks.dialogClose).toHaveBeenCalled()
  })

  it('delegates a confirmed install without calling the API itself', async () => {
    const installHandler = vi.fn().mockResolvedValue(undefined)
    const { emitted } = await renderDialog({ ...basePlugin, installed: false }, {}, { installHandler })

    await fireEvent.click(await screen.findByRole('button', { name: '安装到本地' }))

    expect(installHandler).toHaveBeenCalledWith(undefined, undefined)
    expect(mocks.apiGet).not.toHaveBeenCalledWith('plugin/install/DemoPlugin', expect.anything())
    expect(emitted().install).toBeUndefined()
    expect(emitted()['update:modelValue']).toContainEqual([false])
  })

  it('keeps the detail open and emits nothing after a business failure', async () => {
    mocks.apiGet.mockImplementation((url: string) => {
      if (url === 'plugin/rating/DemoPlugin') return Promise.resolve(ratingResult)
      return Promise.resolve({ success: false, message: '安装包损坏' })
    })
    const { emitted } = await renderDialog({ ...basePlugin, installed: false })

    await fireEvent.click(await screen.findByRole('button', { name: '安装到本地' }))

    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    expect(mocks.toastError).toHaveBeenCalledWith('插件 演示插件 安装失败：安装包损坏')
    expect(emitted()).not.toHaveProperty('install')
    expect(emitted()).not.toHaveProperty('update:modelValue')
  })

  it('reports an HTTP install failure without closing or emitting completion', async () => {
    mocks.apiGet.mockImplementation((url: string) => {
      if (url === 'plugin/rating/DemoPlugin') return Promise.resolve(ratingResult)
      return Promise.reject(new Error('network unavailable'))
    })
    const { emitted } = await renderDialog({ ...basePlugin, installed: false })

    await fireEvent.click(await screen.findByRole('button', { name: '安装到本地' }))

    expect(mocks.toastError).toHaveBeenCalledWith(expect.stringContaining('安装失败'))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(emitted()).not.toHaveProperty('install')
    expect(emitted()).not.toHaveProperty('update:modelValue')
    expect(mocks.dialogClose).toHaveBeenCalled()
  })

  it('blocks an incompatible latest install before sending a request', async () => {
    await renderDialog({
      ...basePlugin,
      installed: false,
      system_version_compatible: false,
      system_version_message: '需要更高版本',
    })

    const installButton = await screen.findByRole('button', { name: '安装到本地' })
    expect(installButton).toBeDisabled()
    expect(screen.getByText('需要更高版本')).toBeInTheDocument()
    expect(mocks.apiGet).not.toHaveBeenCalledWith('plugin/install/DemoPlugin', expect.anything())
  })

  it('installs a confirmed historical Release with its repo URL', async () => {
    const { emitted } = await renderDialog({ ...basePlugin, installed: false, release: true })

    await fireEvent.click(await screen.findByRole('button', { name: '版本历史' }))
    const versionEvents = mocks.openSharedDialog.mock.calls[0][2] as {
      update: (releaseVersion?: string, repoUrl?: string) => Promise<void>
    }
    await versionEvents.update('0.9.0', 'https://github.com/example/releases')

    expect(mocks.confirm).toHaveBeenCalledWith(expect.objectContaining({ content: expect.stringContaining('v0.9.0') }))
    expect(mocks.apiGet).toHaveBeenCalledWith('plugin/install/DemoPlugin', {
      params: {
        force: true,
        release_version: '0.9.0',
        repo_url: 'https://github.com/example/releases',
      },
    })
    expect(emitted().install).toHaveLength(1)
  })

  it('shows update semantics for an installed plugin with a newer version', async () => {
    await renderDialog({ ...basePlugin, installed: true, has_update: true })

    await fireEvent.click(await screen.findByRole('button', { name: '更新' }))

    expect(mocks.apiGet).toHaveBeenCalledWith('plugin/install/DemoPlugin', {
      params: {
        force: true,
        release_version: undefined,
        repo_url: 'https://github.com/example/plugins',
      },
    })
    expect(mocks.toastSuccess).toHaveBeenCalledWith('插件 演示插件 更新成功！')
  })

  it('reports an HTTP update failure with update semantics', async () => {
    mocks.apiGet.mockImplementation((url: string) => {
      if (url === 'plugin/rating/DemoPlugin') return Promise.resolve(ratingResult)
      return Promise.reject(new Error('network unavailable'))
    })
    const { emitted } = await renderDialog({ ...basePlugin, installed: true, has_update: true })

    await fireEvent.click(await screen.findByRole('button', { name: '更新' }))

    expect(mocks.toastError).toHaveBeenCalledWith('插件 演示插件 更新失败：服务器连接失败')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(emitted()).not.toHaveProperty('install')
    expect(emitted()).not.toHaveProperty('update:modelValue')
    expect(mocks.dialogClose).toHaveBeenCalled()
  })

  it('reports a business update failure with the backend message', async () => {
    mocks.apiGet.mockImplementation((url: string) => {
      if (url === 'plugin/rating/DemoPlugin') return Promise.resolve(ratingResult)
      return Promise.resolve({ success: false, message: '更新包损坏' })
    })
    const { emitted } = await renderDialog({ ...basePlugin, installed: true, has_update: true })

    await fireEvent.click(await screen.findByRole('button', { name: '更新' }))

    expect(mocks.toastError).toHaveBeenCalledWith('插件 演示插件 更新失败：更新包损坏')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(emitted()).not.toHaveProperty('install')
    expect(emitted()).not.toHaveProperty('update:modelValue')
  })

  it('forces a latest Release update when the installed plugin snapshot has no update flag', async () => {
    const { emitted } = await renderDialog({ ...basePlugin, installed: true, has_update: false, release: true })

    await fireEvent.click(await screen.findByRole('button', { name: '版本历史' }))
    const versionEvents = mocks.openSharedDialog.mock.calls[0][2] as {
      update: (releaseVersion?: string, repoUrl?: string) => Promise<void>
    }
    await versionEvents.update(undefined, 'https://github.com/example/releases')

    expect(mocks.apiGet).toHaveBeenCalledWith('plugin/install/DemoPlugin', {
      params: {
        force: true,
        release_version: undefined,
        repo_url: 'https://github.com/example/releases',
      },
    })
    expect(mocks.toastSuccess).toHaveBeenCalledWith('插件 演示插件 更新成功！')
    expect(emitted().install).toHaveLength(1)
    expect(emitted()['update:modelValue']).toContainEqual([false])
  })

  it('handles image fallback and opens a raw GitHub repository from the author row', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    await renderDialog(
      {
        ...basePlugin,
        installed: false,
        plugin_icon: 'https://example.com/plugin.png',
        repo_url: 'https://raw.githubusercontent.com/example/plugins/main/package.json',
      },
      { VImg: ImageStub },
    )

    await fireEvent.contextMenu(screen.getByTestId('plugin-image'))
    await fireEvent.click(await screen.findByText('MoviePilot'))

    expect(open).toHaveBeenCalledWith('https://github.com/example/plugins', '_blank')
  })

  it('reports rating business and HTTP failures with stable feedback', async () => {
    mocks.apiPost.mockResolvedValueOnce({ success: false })
    const businessFailed = await renderDialog({ ...basePlugin, installed: true })
    const businessButton = await screen.findByRole('button', { name: '提交评分' })
    await waitFor(() => expect(businessButton).toBeEnabled())
    await fireEvent.click(businessButton)
    expect(mocks.toastError).toHaveBeenCalledWith('评分提交失败：未知')
    businessFailed.unmount()

    mocks.apiPost.mockRejectedValueOnce(new Error('network unavailable'))
    await renderDialog({ ...basePlugin, installed: true })
    const httpButton = await screen.findByRole('button', { name: '提交评分' })
    await waitFor(() => expect(httpButton).toBeEnabled())
    await fireEvent.click(httpButton)
    expect(mocks.toastError).toHaveBeenCalledWith('评分提交失败：服务器连接失败')
  })

  it('refreshes the current plugin rating when the detail opens', async () => {
    await renderDialog({ ...basePlugin, installed: false })

    expect(await screen.findByRole('button', { name: '安装到本地' })).toBeEnabled()
    expect(screen.getByLabelText('4.3 / 5')).toBeInTheDocument()
    expect(mocks.apiGet).toHaveBeenCalledOnce()
    expect(mocks.apiGet).toHaveBeenCalledWith('plugin/rating/DemoPlugin')
  })

  it('opens installed version history without an update action and closes through the model contract', async () => {
    const { emitted } = await renderDialog({ ...basePlugin, installed: true, has_update: false })

    await fireEvent.click(await screen.findByRole('button', { name: '版本历史' }))
    expect(mocks.openSharedDialog.mock.calls[0][1]).toMatchObject({
      actionMode: 'update',
      showUpdateAction: false,
    })

    const closeButton = document.querySelector<HTMLButtonElement>('.absolute.right-3.top-3')
    expect(closeButton).not.toBeNull()
    await fireEvent.click(closeButton!)
    expect(emitted()['update:modelValue']).toContainEqual([false])
    expect(emitted().close).toHaveLength(1)
  })
})
