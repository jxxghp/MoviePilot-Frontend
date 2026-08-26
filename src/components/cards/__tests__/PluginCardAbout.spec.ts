import type { Plugin } from '@/api/types'
import PluginCard from '@/components/cards/PluginCard.vue'
import { usePluginSidebarNavStore } from '@/stores/pluginSidebarNav'
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

vi.mock('@/@core/utils/image', () => ({
  extractDominantColor: vi.fn().mockResolvedValue(undefined),
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
    mocks.openSharedDialog.mockReset().mockReturnValue({
      close: mocks.closeDialog,
      updateProps: vi.fn(),
    })
  })

  it('loads installed plugin detail and opens the shared market detail dialog', async () => {
    const { container, emitted, pinia } = await renderWithProviders(PluginCard, {
      props: { plugin, count: 24 },
    })
    const sidebarStore = usePluginSidebarNavStore(pinia)
    vi.mocked(sidebarStore.ensureSidebarNav).mockResolvedValue(undefined)

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
    })
    expect(dialogProps.count).toBe(24)
    expect(mocks.openSharedDialog.mock.calls[0][3]).toEqual({
      closeOn: ['close', 'install', 'update:modelValue'],
    })
    const dialogEvents = mocks.openSharedDialog.mock.calls[0][2] as {
      install: () => void
      rating: (pluginRating: { plugin_id: string; average_rating: number; rating_count: number }) => void
    }
    dialogEvents.rating({ plugin_id: 'DemoPlugin', average_rating: 4.5, rating_count: 13 })
    expect(emitted().rating).toContainEqual([
      expect.objectContaining({ plugin_id: 'DemoPlugin', average_rating: 4.5, rating_count: 13 }),
    ])
    expect(emitted()).not.toHaveProperty('save')
    expect(sidebarStore.ensureSidebarNav).not.toHaveBeenCalled()

    dialogEvents.install()
    expect(emitted().save).toHaveLength(1)
    expect(sidebarStore.ensureSidebarNav).toHaveBeenCalledWith(true)
  })

  it('routes a history source action into the source management dialog', async () => {
    const { container } = await renderWithProviders(PluginCard, {
      props: { plugin: { ...plugin, has_update: true }, count: 24 },
    })

    await fireEvent.click(container.querySelector<HTMLButtonElement>('.v-card .v-btn')!)
    await fireEvent.click(await screen.findByText('更新'))

    const historyEvents = mocks.openSharedDialog.mock.calls[0][2] as {
      sourceAction: () => Promise<void>
    }
    expect(historyEvents.sourceAction).toBeTypeOf('function')
    await historyEvents.sourceAction()

    expect(mocks.closeDialog).toHaveBeenCalled()
    expect(mocks.apiGet).toHaveBeenCalledWith('plugin/history/DemoPlugin', {
      params: { force: false },
    })
    expect(mocks.openSharedDialog).toHaveBeenCalledTimes(2)
    expect(mocks.openSharedDialog.mock.calls[1][1].plugin).toMatchObject({
      id: 'DemoPlugin',
      installed: true,
    })
  })

  it('resolves a missing installed repo from market metadata before opening the project page', async () => {
    mocks.apiGet.mockImplementation((url: string) => {
      if (url === 'plugin/history/DemoPlugin') return Promise.resolve({ ...plugin, repo_url: 'local://DemoPlugin' })
      if (url === 'plugin/') {
        return Promise.resolve([
          {
            ...plugin,
            repo_url: 'https://raw.githubusercontent.com/example/plugins/main/package.json',
          },
        ])
      }
      throw new Error(`Unexpected request: ${url}`)
    })
    const replace = vi.fn()
    const popup = {
      close: vi.fn(),
      location: { replace },
      opener: window,
    } as unknown as Window
    const open = vi.spyOn(window, 'open').mockReturnValue(popup)
    const { container } = await renderWithProviders(PluginCard, { props: { plugin } })

    await fireEvent.click(container.querySelector<HTMLButtonElement>('.v-card .v-btn')!)
    await fireEvent.click(await screen.findByText('项目主页'))

    await waitFor(() => {
      expect(mocks.apiGet).toHaveBeenCalledWith('plugin/', {
        params: { force: false, state: 'market' },
      })
    })
    expect(open).toHaveBeenCalledWith('about:blank', '_blank')
    await waitFor(() => expect(replace).toHaveBeenCalledWith('https://github.com/example/plugins'))
    expect(popup.opener).toBeNull()
  })

  it('prioritizes the update status over the rating status', async () => {
    await renderWithProviders(PluginCard, {
      props: {
        plugin: { ...plugin, has_update: true, average_rating: 4.3, rating_count: 12 },
      },
    })

    expect(screen.getByLabelText('有更新')).toBeInTheDocument()
    expect(screen.queryByLabelText('4.3 分，共 12 人评分')).not.toBeInTheDocument()
  })

  it('shows the rating status when no update is available', async () => {
    await renderWithProviders(PluginCard, {
      props: {
        plugin: { ...plugin, has_update: false, average_rating: 4.3, rating_count: 12 },
      },
    })

    const ratingStatus = screen.getByLabelText('4.3 分，共 12 人评分')

    expect(ratingStatus).toHaveClass('plugin-card__status--rating')
    expect(ratingStatus).toHaveTextContent('4.3')
    expect(screen.queryByLabelText('有更新')).not.toBeInTheDocument()
  })

  it('leaves the status position empty without an update or rating', async () => {
    await renderWithProviders(PluginCard, {
      props: {
        plugin: { ...plugin, has_update: false, average_rating: 0, rating_count: 0 },
      },
    })

    expect(document.querySelector('.plugin-card__status')).toBeNull()
  })
})
