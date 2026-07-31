import DialogCloseBtn from '@/@core/components/DialogCloseBtn.vue'
import type { Plugin, PluginRating } from '@/api/types'
import PluginMarketDetailDialog from '@/components/dialog/PluginMarketDetailDialog.vue'
import { renderWithProviders } from '@tests/support/render'
import { fireEvent, screen, waitFor } from '@testing-library/vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}))

vi.mock('@/api', () => ({
  default: {
    get: mocks.apiGet,
    post: mocks.apiPost,
  },
}))

vi.mock('vue-toastification', () => ({
  useToast: () => ({ error: mocks.toastError, success: mocks.toastSuccess }),
}))

const basePlugin: Plugin = {
  id: 'DemoPlugin',
  plugin_name: '演示插件',
  plugin_desc: '用于测试插件评分',
  plugin_version: '1.0.0',
  plugin_author: 'MoviePilot',
  repo_url: 'https://github.com/example/plugins',
}

const ratingResult: PluginRating = {
  plugin_id: 'DemoPlugin',
  average_rating: 4.3,
  rating_count: 12,
  user_rating: 4.0,
}

async function renderDialog(plugin: Plugin) {
  return renderWithProviders(PluginMarketDetailDialog, {
    props: {
      modelValue: true,
      plugin,
    },
    global: { components: { VDialogCloseBtn: DialogCloseBtn } },
  })
}

describe('PluginMarketDetailDialog', () => {
  beforeEach(() => {
    mocks.apiGet.mockReset().mockResolvedValue(ratingResult)
    mocks.apiPost.mockReset().mockResolvedValue({
      success: true,
      data: { ...ratingResult, average_rating: 4.5, user_rating: 4.5 },
    })
    mocks.toastError.mockReset()
    mocks.toastSuccess.mockReset()
  })

  it('shows install action and readonly rating for a market plugin', async () => {
    await renderDialog({ ...basePlugin, installed: false })

    expect(await screen.findByText('安装到本地')).toBeInTheDocument()
    expect(screen.queryByText('提交评分')).not.toBeInTheDocument()
    expect(screen.getByLabelText('4.3 / 5')).toBeInTheDocument()
  })

  it('hides install action and submits a half-star rating for an installed plugin', async () => {
    await renderDialog({ ...basePlugin, installed: true })

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
    expect(mocks.toastSuccess).toHaveBeenCalledWith('已提交对插件 演示插件 的评分')
  })

  it('keeps plugin metadata and rating input visible when nobody has rated yet', async () => {
    mocks.apiGet.mockResolvedValueOnce({
      plugin_id: 'DemoPlugin',
      average_rating: 0,
      rating_count: 0,
      user_rating: undefined,
    })

    await renderDialog({ ...basePlugin, installed: true })

    expect(await screen.findByText('v1.0.0')).toBeInTheDocument()
    expect(screen.queryByText('插件评分：')).not.toBeInTheDocument()
    expect(screen.getByText('我的评分')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '提交评分' })).toBeInTheDocument()
  })
})
