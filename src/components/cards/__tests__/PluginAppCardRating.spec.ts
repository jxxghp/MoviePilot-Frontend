import type { Plugin } from '@/api/types'
import PluginAppCard from '@/components/cards/PluginAppCard.vue'
import { normalizePluginAccentColor } from '@/utils/glassColor'
import { renderWithProviders } from '@tests/support/render'
import { fireEvent, screen, waitFor } from '@testing-library/vue'
import { defineComponent } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  accentFromImage: vi.fn(),
  apiGet: vi.fn(),
  confirm: vi.fn(),
  dialogCloses: [] as Array<ReturnType<typeof vi.fn>>,
  openSharedDialog: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  toastWarning: vi.fn(),
}))

vi.mock('@/api', () => ({
  default: createDataApiMock({ get: mocks.apiGet }),
}))

vi.mock('@/composables/useConfirm', () => ({
  useConfirm: () => mocks.confirm,
}))

vi.mock('@/composables/useSharedDialog', () => ({
  openSharedDialog: (...args: unknown[]) => mocks.openSharedDialog(...args),
}))

vi.mock('vue-toastification', () => ({
  useToast: () => ({ error: mocks.toastError, success: mocks.toastSuccess, warning: mocks.toastWarning }),
}))

vi.mock('@/@core/utils/image', () => ({
  extractDominantColor: mocks.accentFromImage,
}))

const plugin: Plugin = {
  id: 'DemoPlugin',
  plugin_name: '演示插件',
  plugin_desc: '用于测试市场卡片评分',
  plugin_version: '1.0.0',
  plugin_author: 'MoviePilot',
  installed: false,
}

const ImageStub = defineComponent({
  name: 'VImg',
  emits: ['error', 'load'],
  template:
    '<button data-testid="plugin-image" @click="$emit(\'load\')" @contextmenu.prevent="$emit(\'error\')"><img /></button>',
})

describe('PluginAppCard rating badge', () => {
  beforeEach(() => {
    mocks.accentFromImage.mockReset().mockResolvedValue('#123456')
    mocks.apiGet.mockReset()
    mocks.confirm.mockReset().mockResolvedValue(true)
    mocks.dialogCloses.length = 0
    mocks.openSharedDialog.mockReset().mockImplementation(() => {
      const close = vi.fn()
      mocks.dialogCloses.push(close)
      return {
        close,
        id: mocks.dialogCloses.length,
        updateProps: vi.fn(),
      }
    })
    mocks.toastError.mockReset()
    mocks.toastSuccess.mockReset()
    mocks.toastWarning.mockReset()
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  it('shows the top-right score only after the plugin has ratings', async () => {
    const unrated = await renderWithProviders(PluginAppCard, {
      props: { plugin: { ...plugin, average_rating: 0, rating_count: 0 } },
    })
    expect(unrated.container.querySelector('.plugin-app-card__rating')).toBeNull()
    expect(unrated.container.querySelector('.plugin-app-card__title--with-rating')).toBeNull()
    unrated.unmount()

    const rated = await renderWithProviders(PluginAppCard, {
      props: { plugin: { ...plugin, average_rating: 4.3, rating_count: 12 } },
    })
    const badge = rated.container.querySelector('.plugin-app-card__rating')
    expect(badge).toHaveTextContent('4.3')
    expect(rated.container.querySelector('.plugin-app-card__title--with-rating')).not.toBeNull()
  })

  it('reports an HTTP failure without emitting install or hiding the card', async () => {
    mocks.apiGet.mockRejectedValue(new Error('network unavailable'))
    const lifecyclePlugin = {
      ...plugin,
      history: { 'v1.0.0': '初始版本' },
      repo_url: 'https://github.com/example/plugins',
    }
    const { container, emitted } = await renderWithProviders(PluginAppCard, {
      props: { plugin: lifecyclePlugin },
    })

    const menuButton = container.querySelector<HTMLButtonElement>('.v-card .v-btn')
    expect(menuButton).not.toBeNull()
    await fireEvent.click(menuButton!)
    await fireEvent.click(await screen.findByText('版本历史'))
    await waitFor(() => expect(mocks.openSharedDialog).toHaveBeenCalledOnce())

    const dialogEvents = mocks.openSharedDialog.mock.calls[0][2] as {
      update: (releaseVersion?: string, repoUrl?: string) => Promise<void>
    }
    await dialogEvents.update()

    expect(mocks.toastError).toHaveBeenCalledWith(expect.stringContaining('安装失败'))
    expect(emitted()).not.toHaveProperty('install')
    expect(container.querySelector('.plugin-app-card-hover-area')).not.toBeNull()
  })

  it('opens market details and forwards only the detail completion event', async () => {
    const { container, emitted } = await renderWithProviders(PluginAppCard, {
      props: { plugin, count: 12 },
    })

    await fireEvent.click(container.querySelector('.v-card')!)

    expect(mocks.openSharedDialog).toHaveBeenCalledOnce()
    expect(mocks.openSharedDialog.mock.calls[0][1]).toMatchObject({ plugin, count: 12 })
    expect(mocks.openSharedDialog.mock.calls[0][3]).toEqual({
      closeOn: ['close', 'install', 'update:modelValue'],
    })
    const detailEvents = mocks.openSharedDialog.mock.calls[0][2] as { install: () => void }
    detailEvents.install()
    expect(emitted().install).toHaveLength(1)
    expect(mocks.apiGet).not.toHaveBeenCalled()
  })

  it('passes the host install handler into market details', async () => {
    const installHandler = vi.fn().mockResolvedValue(undefined)
    const { container } = await renderWithProviders(PluginAppCard, {
      props: { plugin, installHandler },
    })

    await fireEvent.click(container.querySelector('.v-card')!)

    const detailProps = mocks.openSharedDialog.mock.calls[0][1] as {
      installHandler?: (...args: unknown[]) => unknown
    }
    expect(detailProps.installHandler).toBe(installHandler)
    await detailProps.installHandler?.()
    expect(installHandler).toHaveBeenCalledWith()
    expect(mocks.apiGet).not.toHaveBeenCalled()
  })

  it('installs a selected release with exact parameters and emits completion', async () => {
    mocks.apiGet.mockResolvedValue({ success: true })
    const lifecyclePlugin = {
      ...plugin,
      history: { 'v1.0.0': '初始版本' },
      repo_url: 'https://github.com/example/plugins',
    }
    const { container, emitted } = await renderWithProviders(PluginAppCard, {
      props: { plugin: lifecyclePlugin },
    })

    const menuButton = container.querySelector<HTMLButtonElement>('.v-card .v-btn')
    await fireEvent.click(menuButton!)
    await fireEvent.click(await screen.findByText('版本历史'))
    const dialogEvents = mocks.openSharedDialog.mock.calls[0][2] as {
      update: (releaseVersion?: string, repoUrl?: string) => Promise<void>
    }
    await dialogEvents.update('0.9.0', 'https://github.com/example/releases')

    expect(mocks.confirm).toHaveBeenCalledWith(expect.objectContaining({ content: expect.stringContaining('v0.9.0') }))
    expect(mocks.apiGet).toHaveBeenCalledWith('plugin/install/DemoPlugin', {
      params: {
        force: true,
        release_version: '0.9.0',
      },
    })
    expect(mocks.toastSuccess).toHaveBeenCalledWith('插件 演示插件 安装成功！')
    expect(emitted().install).toHaveLength(1)
    expect(mocks.toastError).not.toHaveBeenCalled()
    expect(mocks.dialogCloses[0]).toHaveBeenCalled()
    expect(mocks.dialogCloses[1]).toHaveBeenCalled()
  })

  it('uses a warning when a direct install needs a restart', async () => {
    mocks.apiGet.mockResolvedValue({ success: true, data: { restart_required: true } })
    const lifecyclePlugin = {
      ...plugin,
      history: { 'v1.0.0': '初始版本' },
      repo_url: 'https://github.com/example/plugins',
    }
    const { container } = await renderWithProviders(PluginAppCard, {
      props: { plugin: lifecyclePlugin },
    })

    await fireEvent.click(container.querySelector<HTMLButtonElement>('.v-card .v-btn')!)
    await fireEvent.click(await screen.findByText('版本历史'))
    const dialogEvents = mocks.openSharedDialog.mock.calls[0][2] as { update: () => Promise<void> }
    await dialogEvents.update()

    expect(mocks.toastWarning).toHaveBeenCalledWith('插件 演示插件 已安装，重启 MoviePilot 后完成依赖更新')
    expect(mocks.toastSuccess).not.toHaveBeenCalled()
  })

  it('keeps the version dialog open and emits nothing on a business failure', async () => {
    mocks.apiGet.mockResolvedValue({ success: false, message: '下载失败' })
    const lifecyclePlugin = {
      ...plugin,
      history: { 'v1.0.0': '初始版本' },
      repo_url: 'https://github.com/example/plugins',
    }
    const { container, emitted } = await renderWithProviders(PluginAppCard, {
      props: { plugin: lifecyclePlugin },
    })

    await fireEvent.click(container.querySelector<HTMLButtonElement>('.v-card .v-btn')!)
    await fireEvent.click(await screen.findByText('版本历史'))
    const dialogEvents = mocks.openSharedDialog.mock.calls[0][2] as { update: () => Promise<void> }
    await dialogEvents.update()

    expect(mocks.toastError).toHaveBeenCalledWith('插件 演示插件 安装失败：下载失败')
    expect(mocks.dialogCloses[0]).not.toHaveBeenCalled()
    expect(mocks.dialogCloses[1]).toHaveBeenCalled()
    expect(emitted()).not.toHaveProperty('install')
  })

  it('blocks incompatible latest installs and honors a cancelled release confirmation', async () => {
    const lifecyclePlugin = {
      ...plugin,
      history: { 'v1.0.0': '初始版本' },
      repo_url: 'https://github.com/example/plugins',
      system_version_compatible: false,
      system_version_message: '需要更高版本',
    }
    const { container } = await renderWithProviders(PluginAppCard, {
      props: { plugin: lifecyclePlugin },
    })

    await fireEvent.click(container.querySelector<HTMLButtonElement>('.v-card .v-btn')!)
    await fireEvent.click(await screen.findByText('版本历史'))
    const dialogEvents = mocks.openSharedDialog.mock.calls[0][2] as {
      update: (releaseVersion?: string, repoUrl?: string) => Promise<void>
    }
    await dialogEvents.update()
    expect(mocks.toastError).toHaveBeenCalledWith('需要更高版本')
    expect(mocks.apiGet).not.toHaveBeenCalled()

    mocks.confirm.mockResolvedValueOnce(false)
    await dialogEvents.update('0.9.0', 'https://github.com/example/releases')
    expect(mocks.apiGet).not.toHaveBeenCalled()
  })

  it('renders normalized labels, handles image events, and opens a raw GitHub repository', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    const { container } = await renderWithProviders(PluginAppCard, {
      props: {
        plugin: {
          ...plugin,
          plugin_icon: 'https://example.com/plugin.png',
          plugin_label: ' 工具, 自动化, ,工具 ',
          repo_url: 'https://raw.githubusercontent.com/example/plugins/main/package.json',
        },
      },
      global: { stubs: { VImg: ImageStub } },
    })

    expect(screen.getAllByText('工具')).toHaveLength(2)
    expect(screen.getByText('自动化')).toBeInTheDocument()
    const image = screen.getByTestId('plugin-image')
    await fireEvent.click(image)
    await waitFor(() => expect(mocks.accentFromImage).toHaveBeenCalled())
    expect(
      container.querySelector<HTMLElement>('.plugin-card')?.style.getPropertyValue('--plugin-card-accent-rgb'),
    ).toBe(normalizePluginAccentColor('#123456')?.rgb)
    await fireEvent.contextMenu(image)
    mocks.accentFromImage.mockResolvedValueOnce('#654321')
    await fireEvent.click(image)
    await waitFor(() => expect(mocks.accentFromImage).toHaveBeenCalledTimes(2))
    expect(
      container.querySelector<HTMLElement>('.plugin-card')?.style.getPropertyValue('--plugin-card-accent-rgb'),
    ).toBe(normalizePluginAccentColor('#654321')?.rgb)
    await fireEvent.contextMenu(image)
    expect(
      container.querySelector<HTMLElement>('.plugin-card')?.style.getPropertyValue('--plugin-card-accent-rgb'),
    ).toBe('')

    await fireEvent.click(container.querySelector<HTMLButtonElement>('.v-card .v-btn')!)
    await fireEvent.click(await screen.findByText('项目主页'))
    expect(open).toHaveBeenCalledWith('https://github.com/example/plugins', '_blank')
  })

  it('uses the author page for a local plugin project link', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    const { container } = await renderWithProviders(PluginAppCard, {
      props: {
        plugin: {
          ...plugin,
          is_local: true,
          repo_url: 'local://DemoPlugin',
          author_url: 'https://github.com/example-author',
        },
      },
    })

    await fireEvent.click(container.querySelector<HTMLButtonElement>('.v-card .v-btn')!)
    await fireEvent.click(await screen.findByText('项目主页'))
    expect(open).toHaveBeenCalledWith('https://github.com/example-author', '_blank')
  })
})
