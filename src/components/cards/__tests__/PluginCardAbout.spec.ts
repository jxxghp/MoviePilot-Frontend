import type { Plugin } from '@/api/types'
import PluginCard from '@/components/cards/PluginCard.vue'
import { renderWithProviders } from '@tests/support/render'
import { fireEvent, screen, waitFor } from '@testing-library/vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  closeDialog: vi.fn(),
  openSharedDialog: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}))

vi.mock('@/api', () => ({
  default: {
    get: mocks.apiGet,
    delete: vi.fn(),
    post: vi.fn(),
  },
}))

vi.mock('@/composables/useSharedDialog', () => ({
  openSharedDialog: mocks.openSharedDialog,
}))

vi.mock('@/composables/useCardAccentColor', () => ({
  getCardAccentRgbFromImage: vi.fn().mockResolvedValue('40, 169, 225'),
}))

vi.mock('vue-toastification', () => ({
  useToast: () => ({ error: mocks.toastError, success: mocks.toastSuccess }),
}))

const plugin: Plugin = {
  id: 'DemoPlugin',
  plugin_name: '演示插件',
  plugin_desc: '用于测试关于菜单',
  plugin_version: '1.0.0',
  plugin_author: 'MoviePilot',
  author_url: 'https://github.com/MoviePilot',
  installed: true,
  state: true,
}

describe('PluginCard about menu', () => {
  beforeEach(() => {
    mocks.apiGet.mockReset().mockResolvedValue({
      ...plugin,
      repo_url: 'https://github.com/example/plugins',
    })
    mocks.closeDialog.mockReset()
    mocks.openSharedDialog.mockReset().mockReturnValue({ close: mocks.closeDialog })
  })

  it('loads installed plugin detail and opens the shared market detail dialog', async () => {
    const { container } = await renderWithProviders(PluginCard, {
      props: { plugin, count: 24 },
    })

    const menuButton = container.querySelector<HTMLButtonElement>('.v-card .v-btn')
    expect(menuButton).not.toBeNull()
    await fireEvent.click(menuButton!)
    await fireEvent.click(await screen.findByText('关于'))

    await waitFor(() => {
      expect(mocks.apiGet).toHaveBeenCalledWith('plugin/history/DemoPlugin', {
        params: { force: false },
      })
      expect(mocks.openSharedDialog).toHaveBeenCalledOnce()
    })
    const dialogProps = mocks.openSharedDialog.mock.calls[0][1]
    expect(dialogProps.plugin).toMatchObject({
      id: 'DemoPlugin',
      installed: true,
      repo_url: 'https://github.com/example/plugins',
    })
    expect(dialogProps.count).toBe(24)
  })
})
