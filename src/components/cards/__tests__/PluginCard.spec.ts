import type { Plugin } from '@/api/types'
import PluginCard from '@/components/cards/PluginCard.vue'
import { usePluginRuntimeStore } from '@/stores/pluginRuntime'
import { usePluginSidebarNavStore } from '@/stores/pluginSidebarNav'
import { normalizePluginAccentColor } from '@/utils/glassColor'
import { renderWithProviders } from '@tests/support/render'
import { fireEvent, screen, waitFor } from '@testing-library/vue'
import { defineComponent } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  accentFromImage: vi.fn(),
  apiDelete: vi.fn(),
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  confirm: vi.fn(),
  dialogCloses: [] as Array<ReturnType<typeof vi.fn>>,
  openSharedDialog: vi.fn(),
  reloadPluginRuntime: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  toastWarning: vi.fn(),
}))

vi.mock('@/api', () => ({
  default: createDataApiMock({
    delete: mocks.apiDelete,
    get: mocks.apiGet,
    post: mocks.apiPost,
  }),
}))

vi.mock('@/composables/useConfirm', () => ({
  useConfirm: () => mocks.confirm,
}))

vi.mock('@/composables/useSharedDialog', () => ({
  openSharedDialog: (...args: unknown[]) => mocks.openSharedDialog(...args),
}))

vi.mock('@/api/pluginCapabilities', () => ({
  reloadPluginRuntime: mocks.reloadPluginRuntime,
}))

vi.mock('@/@core/utils/image', () => ({
  extractDominantColor: mocks.accentFromImage,
}))

vi.mock('vue-toastification', () => ({
  useToast: () => ({ error: mocks.toastError, success: mocks.toastSuccess, warning: mocks.toastWarning }),
}))

const plugin: Plugin = {
  id: 'DemoPlugin',
  plugin_name: '演示插件',
  plugin_desc: '用于测试插件生命周期',
  plugin_version: '1.0.0',
  plugin_author: 'MoviePilot',
  installed: true,
  state: true,
}

const ImageStub = defineComponent({
  name: 'VImg',
  emits: ['error', 'load'],
  template:
    '<button data-testid="plugin-image" @click="$emit(\'load\')" @contextmenu.prevent="$emit(\'error\')"><img /></button>',
})

/** 展开插件卡片一级菜单及其中的高级操作二级菜单。 */
async function openAdvancedActions(container: Element) {
  await fireEvent.click(container.querySelector<HTMLButtonElement>('.plugin-card__menu')!)
  await fireEvent.click(await screen.findByTestId('plugin-advanced-menu'))
}

describe('PluginCard lifecycle actions', () => {
  beforeEach(() => {
    mocks.accentFromImage.mockReset().mockResolvedValue('#123456')
    mocks.apiDelete.mockReset()
    mocks.apiGet.mockReset()
    mocks.apiPost.mockReset()
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
    mocks.reloadPluginRuntime.mockReset()
    mocks.toastError.mockReset()
    mocks.toastSuccess.mockReset()
    mocks.toastWarning.mockReset()
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  it('refreshes plugin sidebar navigation after uninstall succeeds', async () => {
    mocks.apiDelete.mockResolvedValue({ success: true })
    const { container, pinia } = await renderWithProviders(PluginCard, { props: { plugin } })
    const sidebarStore = usePluginSidebarNavStore(pinia)
    vi.mocked(sidebarStore.ensureSidebarNav).mockResolvedValue(undefined)

    const menuButton = container.querySelector<HTMLButtonElement>('.v-card .v-btn')
    expect(menuButton).not.toBeNull()
    await fireEvent.click(menuButton!)
    await fireEvent.click(await screen.findByText('卸载'))

    await waitFor(() => expect(mocks.apiDelete).toHaveBeenCalledWith('plugin/DemoPlugin'))
    await waitFor(() => expect(sidebarStore.ensureSidebarNav).toHaveBeenCalledWith(true))
    expect(mocks.toastSuccess).toHaveBeenCalledWith('插件 演示插件 卸载成功！')
    expect(mocks.dialogCloses[0]).toHaveBeenCalled()
  })

  it('honors uninstall cancellation and preserves the card on business failure', async () => {
    mocks.confirm.mockResolvedValueOnce(false)
    const cancelled = await renderWithProviders(PluginCard, { props: { plugin } })
    await fireEvent.click(cancelled.container.querySelector<HTMLButtonElement>('.v-card .v-btn')!)
    await fireEvent.click(await screen.findByText('卸载'))
    expect(mocks.apiDelete).not.toHaveBeenCalled()
    cancelled.unmount()

    mocks.confirm.mockResolvedValueOnce(true)
    mocks.apiDelete.mockResolvedValueOnce({ success: false, message: '仍有任务运行' })
    const failed = await renderWithProviders(PluginCard, { props: { plugin } })
    await fireEvent.click(failed.container.querySelector<HTMLButtonElement>('.v-card .v-btn')!)
    await fireEvent.click(await screen.findByText('卸载'))

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('插件 演示插件 卸载失败：仍有任务运行'))
    expect(failed.emitted()).not.toHaveProperty('remove')
    expect(failed.container.querySelector('.plugin-card-hover-area')).not.toBeNull()
  })

  it('reports uninstall HTTP failures and always closes progress', async () => {
    mocks.apiDelete.mockRejectedValue(new Error('network unavailable'))
    const { container, emitted } = await renderWithProviders(PluginCard, { props: { plugin } })

    await fireEvent.click(container.querySelector<HTMLButtonElement>('.v-card .v-btn')!)
    await fireEvent.click(await screen.findByText('卸载'))

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith(expect.stringContaining('卸载失败')))
    expect(mocks.dialogCloses[0]).toHaveBeenCalled()
    expect(emitted()).not.toHaveProperty('remove')
  })

  it('resets plugin data only after confirmation and refreshes navigation on success', async () => {
    mocks.apiGet.mockResolvedValue({ success: true })
    const { container, emitted, pinia } = await renderWithProviders(PluginCard, { props: { plugin } })
    const sidebarStore = usePluginSidebarNavStore(pinia)
    vi.mocked(sidebarStore.ensureSidebarNav).mockResolvedValue(undefined)

    await fireEvent.click(container.querySelector<HTMLButtonElement>('.v-card .v-btn')!)
    await fireEvent.click(await screen.findByText('重置'))

    await waitFor(() => expect(mocks.apiGet).toHaveBeenCalledWith('plugin/reset/DemoPlugin'))
    expect(mocks.confirm).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('演示插件') }),
    )
    expect(mocks.toastSuccess).toHaveBeenCalledWith('插件 演示插件 数据已重置')
    expect(sidebarStore.ensureSidebarNav).toHaveBeenCalledWith(true)
    expect(emitted().save).toHaveLength(1)
  })

  it('reports reset business and HTTP failures without emitting save', async () => {
    mocks.apiGet.mockResolvedValueOnce({ success: false, message: '无法清理数据' })
    const businessFailed = await renderWithProviders(PluginCard, { props: { plugin } })
    await fireEvent.click(businessFailed.container.querySelector<HTMLButtonElement>('.v-card .v-btn')!)
    await fireEvent.click(await screen.findByText('重置'))
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('插件 演示插件 重置失败：无法清理数据'))
    expect(businessFailed.emitted()).not.toHaveProperty('save')
    businessFailed.unmount()

    mocks.apiGet.mockRejectedValueOnce(new Error('network unavailable'))
    const httpFailed = await renderWithProviders(PluginCard, { props: { plugin } })
    await fireEvent.click(httpFailed.container.querySelector<HTMLButtonElement>('.v-card .v-btn')!)
    await fireEvent.click(await screen.findByText('重置'))
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('插件 演示插件 重置失败：服务器连接失败'))
    expect(httpFailed.emitted()).not.toHaveProperty('save')
  })

  it('delegates a confirmed Release update to the list transaction owner', async () => {
    const updatablePlugin = {
      ...plugin,
      has_update: true,
      repo_url: 'https://github.com/example/plugins',
    }
    const { container, emitted } = await renderWithProviders(PluginCard, {
      props: { plugin: updatablePlugin },
    })

    await fireEvent.click(container.querySelector<HTMLButtonElement>('.v-card .v-btn')!)
    await fireEvent.click(await screen.findByText('更新'))
    const versionEvents = mocks.openSharedDialog.mock.calls[0][2] as {
      update: (releaseVersion?: string, repoUrl?: string) => Promise<void>
    }
    await versionEvents.update('0.9.0', 'https://github.com/example/releases')

    expect(mocks.confirm).toHaveBeenCalledWith(expect.objectContaining({ content: expect.stringContaining('v0.9.0') }))
    expect(emitted().update).toEqual([[updatablePlugin, '0.9.0', 'https://github.com/example/releases']])
    expect(mocks.apiGet).not.toHaveBeenCalledWith('plugin/install/DemoPlugin', expect.anything())
    expect(mocks.toastSuccess).not.toHaveBeenCalled()
    expect(mocks.dialogCloses[0]).toHaveBeenCalled()
  })

  it('marks a plugin whose native dependency update requires a restart without blocking its actions', async () => {
    const { container, pinia } = await renderWithProviders(PluginCard, { props: { plugin } })
    const runtimeStore = usePluginRuntimeStore(pinia)
    runtimeStore.summary = {
      failed_count: 0,
      generation: 2,
      pending_count: 0,
      ready: true,
      restart_required_plugin_ids: ['DemoPlugin'],
    }

    expect(await screen.findByText('重启后生效')).toBeInTheDocument()
    expect(container.querySelector('.plugin-card')).not.toHaveClass('plugin-card--runtime-blocked')
    expect(container.querySelector('.plugin-card__runtime-state')).toBeNull()
  })

  it('shows the same card-level busy state for updates without opening a progress dialog', async () => {
    const updatablePlugin = { ...plugin, has_update: true }
    const { container } = await renderWithProviders(PluginCard, {
      props: { installing: true, plugin: updatablePlugin, updating: true },
    })

    expect(await screen.findByText('正在更新 演示插件 ...')).toBeInTheDocument()
    expect(container.querySelector('.plugin-card__runtime-state .v-progress-circular')).toBeInTheDocument()
    expect(mocks.openSharedDialog).not.toHaveBeenCalled()
  })

  it('shows the repository type and keeps bound updates on the version history flow', async () => {
    const updatablePlugin: Plugin = {
      ...plugin,
      has_update: true,
      update_candidate: {
        source_type: 'third_party',
        source_key: 'github:example/plugins',
        repo_url: 'https://github.com/example/plugins',
        version: '2.0.0',
        is_bound: true,
      },
    }
    const { container } = await renderWithProviders(PluginCard, { props: { plugin: updatablePlugin } })

    await fireEvent.mouseEnter(screen.getByLabelText('有更新'))
    expect(await screen.findByText('example/plugins 有可直接安装的新版本 v2.0.0')).toBeInTheDocument()
    await fireEvent.click(container.querySelector<HTMLButtonElement>('.v-card .v-btn')!)
    await fireEvent.click(await screen.findByText('更新'))

    expect(mocks.openSharedDialog).toHaveBeenCalledOnce()
    expect(mocks.apiGet).not.toHaveBeenCalledWith('plugin/history/DemoPlugin', expect.anything())
  })

  it('opens repository selection for an update published by another repository', async () => {
    const updatablePlugin: Plugin = {
      ...plugin,
      has_update: true,
      update_candidate: {
        source_type: 'official',
        source_key: 'github:jxxghp/moviepilot-plugins',
        repo_url: 'https://github.com/jxxghp/MoviePilot-Plugins',
        version: '2.0.0',
        is_bound: false,
      },
    }
    mocks.apiGet.mockResolvedValue(updatablePlugin)
    const { container } = await renderWithProviders(PluginCard, { props: { plugin: updatablePlugin } })

    await fireEvent.mouseEnter(screen.getByLabelText('有更新'))
    expect(await screen.findByText('jxxghp/moviepilot-plugins 有新版本 v2.0.0，需要确认更换仓库')).toBeInTheDocument()
    await fireEvent.click(container.querySelector<HTMLButtonElement>('.v-card .v-btn')!)
    await fireEvent.click(await screen.findByText('查看更新'))
    await waitFor(() => expect(mocks.openSharedDialog).toHaveBeenCalledOnce())

    expect(mocks.apiGet).toHaveBeenCalledWith('plugin/history/DemoPlugin', {
      params: { force: false },
    })
    expect(mocks.openSharedDialog.mock.calls[0][1]).toMatchObject({
      initialSourceSelectionOpen: true,
      plugin: expect.objectContaining({ id: 'DemoPlugin' }),
    })
    expect(mocks.apiGet).not.toHaveBeenCalledWith('plugin/install/DemoPlugin', expect.anything())
  })

  it('prioritizes repository confirmation over the update marker', async () => {
    await renderWithProviders(PluginCard, {
      props: {
        plugin: {
          ...plugin,
          has_update: true,
          source_binding_status: 'binding_required',
        },
      },
    })

    expect(screen.getByText('需确认仓库')).toBeInTheDocument()
    expect(screen.queryByLabelText('有更新')).not.toBeInTheDocument()
    await fireEvent.mouseEnter(screen.getByText('需确认仓库'))
    expect(await screen.findByText('该插件尚未绑定仓库，请在「关于」中确认')).toBeInTheDocument()
  })

  it('forwards a confirmed repository change to the list transaction owner', async () => {
    mocks.apiGet.mockResolvedValue(plugin)
    const { container, emitted } = await renderWithProviders(PluginCard, { props: { plugin } })

    await fireEvent.click(container.querySelector<HTMLButtonElement>('.v-card .v-btn')!)
    await fireEvent.click(await screen.findByText('关于'))
    await waitFor(() => expect(mocks.openSharedDialog).toHaveBeenCalledOnce())
    const detailEvents = mocks.openSharedDialog.mock.calls[0][2] as {
      sourceTransition: (transition: { action: 'change'; expected_revision: number; repo_url: string }) => void
    }
    detailEvents.sourceTransition({
      action: 'change',
      expected_revision: 7,
      repo_url: 'https://github.com/example/target',
    })

    expect(emitted().sourceTransition).toContainEqual([
      plugin,
      {
        action: 'change',
        expected_revision: 7,
        repo_url: 'https://github.com/example/target',
      },
    ])
  })

  it('opens about immediately and enriches the same dialog after history loads', async () => {
    let resolveHistory!: (value: Plugin) => void
    mocks.apiGet.mockImplementation(
      () =>
        new Promise<Plugin>(resolve => {
          resolveHistory = resolve
        }),
    )
    const { container } = await renderWithProviders(PluginCard, { props: { plugin } })

    await fireEvent.click(container.querySelector<HTMLButtonElement>('.v-card .v-btn')!)
    await fireEvent.click(await screen.findByText('关于'))

    expect(mocks.openSharedDialog).toHaveBeenCalledOnce()
    expect(mocks.openSharedDialog.mock.calls[0][1]).toMatchObject({ plugin })
    const controller = mocks.openSharedDialog.mock.results[0].value as {
      updateProps: ReturnType<typeof vi.fn>
    }
    expect(controller.updateProps).not.toHaveBeenCalled()

    resolveHistory({ ...plugin, plugin_desc: '市场补充详情' })
    await waitFor(() =>
      expect(controller.updateProps).toHaveBeenCalledWith({
        plugin: expect.objectContaining({ plugin_desc: '市场补充详情' }),
      }),
    )
  })

  it('blocks an incompatible latest update without sending a request', async () => {
    const updatablePlugin = {
      ...plugin,
      has_update: true,
      system_version_compatible: false,
      system_version_message: '需要更高版本',
    }
    const { container } = await renderWithProviders(PluginCard, { props: { plugin: updatablePlugin } })

    await fireEvent.click(container.querySelector<HTMLButtonElement>('.v-card .v-btn')!)
    await fireEvent.click(await screen.findByText('更新'))
    const versionEvents = mocks.openSharedDialog.mock.calls[0][2] as { update: () => Promise<void> }
    await versionEvents.update()

    expect(mocks.toastError).toHaveBeenCalledWith('需要更高版本')
    expect(mocks.apiGet).not.toHaveBeenCalledWith('plugin/install/DemoPlugin', expect.anything())
  })

  it('creates a clone with trimmed form values and refreshes navigation', async () => {
    mocks.apiPost.mockResolvedValue({ success: true })
    const { container, emitted, pinia } = await renderWithProviders(PluginCard, { props: { plugin } })
    const sidebarStore = usePluginSidebarNavStore(pinia)
    vi.mocked(sidebarStore.ensureSidebarNav).mockResolvedValue(undefined)

    await fireEvent.click(container.querySelector<HTMLButtonElement>('.v-card .v-btn')!)
    await fireEvent.click(await screen.findByText('分身'))
    const cloneEvents = mocks.openSharedDialog.mock.calls[0][2] as {
      clone: (form: { suffix: string; name: string; description: string; icon: string }) => Promise<void>
    }
    await cloneEvents.clone({
      suffix: ' Test ',
      name: '演示分身',
      description: ' 独立配置 ',
      icon: ' https://example.com/icon.png ',
    })

    expect(mocks.apiPost).toHaveBeenCalledWith('plugin/clone/DemoPlugin', {
      suffix: 'Test',
      name: '演示分身',
      description: '独立配置',
      icon: 'https://example.com/icon.png',
    })
    expect(mocks.toastSuccess).toHaveBeenCalledWith('插件分身 演示分身 创建成功！')
    expect(sidebarStore.ensureSidebarNav).toHaveBeenCalledWith(true)
    expect(emitted().remove).toHaveLength(1)
    expect(mocks.dialogCloses[0]).toHaveBeenCalled()
    expect(mocks.dialogCloses[1]).toHaveBeenCalled()
  })

  it('rejects an empty clone suffix before calling the API', async () => {
    const { container } = await renderWithProviders(PluginCard, { props: { plugin } })
    await fireEvent.click(container.querySelector<HTMLButtonElement>('.v-card .v-btn')!)
    await fireEvent.click(await screen.findByText('分身'))
    const cloneEvents = mocks.openSharedDialog.mock.calls[0][2] as {
      clone: (form: { suffix: string; name: string; description: string; icon: string }) => Promise<void>
    }
    await cloneEvents.clone({ suffix: ' ', name: '', description: '', icon: '' })

    expect(mocks.toastError).toHaveBeenCalledWith('分身后缀不能为空')
    expect(mocks.apiPost).not.toHaveBeenCalled()
  })

  it('keeps clone dialog open after business and HTTP failures', async () => {
    mocks.apiPost.mockResolvedValueOnce({ success: false, message: '后缀已存在' })
    const businessFailed = await renderWithProviders(PluginCard, { props: { plugin } })
    await fireEvent.click(businessFailed.container.querySelector<HTMLButtonElement>('.v-card .v-btn')!)
    await fireEvent.click(await screen.findByText('分身'))
    let cloneEvents = mocks.openSharedDialog.mock.calls[0][2] as {
      clone: (form: { suffix: string; name: string; description: string; icon: string }) => Promise<void>
    }
    const form = { suffix: 'Test', name: '测试', description: '', icon: '' }
    await cloneEvents.clone(form)
    expect(mocks.toastError).toHaveBeenCalledWith('插件分身创建失败：后缀已存在')
    expect(mocks.dialogCloses[0]).not.toHaveBeenCalled()
    businessFailed.unmount()

    mocks.openSharedDialog.mockClear()
    mocks.dialogCloses.length = 0
    mocks.apiPost.mockRejectedValueOnce(new Error('network unavailable'))
    const httpFailed = await renderWithProviders(PluginCard, { props: { plugin } })
    await fireEvent.click(httpFailed.container.querySelector<HTMLButtonElement>('.v-card .v-btn')!)
    await fireEvent.click(await screen.findByText('分身'))
    cloneEvents = mocks.openSharedDialog.mock.calls[0][2] as {
      clone: (value: typeof form) => Promise<void>
    }
    await cloneEvents.clone(form)
    expect(mocks.toastError).toHaveBeenCalledWith('插件分身创建失败')
    expect(mocks.dialogCloses[0]).not.toHaveBeenCalled()
    expect(httpFailed.emitted()).not.toHaveProperty('remove')
  })

  it('opens data and config surfaces with reciprocal switch contracts', async () => {
    const { container, emitted } = await renderWithProviders(PluginCard, {
      props: { plugin: { ...plugin, has_page: true } },
    })

    await fireEvent.click(container.querySelector('.v-card')!)
    expect(mocks.openSharedDialog.mock.calls[0][1]).toMatchObject({
      plugin: expect.objectContaining({ id: 'DemoPlugin' }),
    })
    expect(mocks.openSharedDialog.mock.calls[0][3]).toEqual({ closeOn: ['close', 'switch'] })

    const dataEvents = mocks.openSharedDialog.mock.calls[0][2] as { switch: () => void }
    dataEvents.switch()
    expect(mocks.openSharedDialog.mock.calls[1][3]).toEqual({ closeOn: ['close', 'save', 'switch'] })

    const configEvents = mocks.openSharedDialog.mock.calls[1][2] as { save: () => void; switch: () => void }
    configEvents.save()
    expect(emitted().save).toHaveLength(1)
    configEvents.switch()
    expect(mocks.openSharedDialog).toHaveBeenCalledTimes(3)
  })

  it('handles image lifecycle and ignores card clicks while sorting', async () => {
    mocks.accentFromImage.mockResolvedValueOnce(undefined).mockResolvedValueOnce('#123456')
    const { container } = await renderWithProviders(PluginCard, {
      props: {
        plugin: { ...plugin, plugin_icon: 'https://example.com/plugin.png' },
        sortable: true,
      },
      global: { stubs: { VImg: ImageStub } },
    })
    const [image, authorImage] = screen.getAllByTestId('plugin-image')
    await fireEvent.click(image)
    await waitFor(() => expect(mocks.accentFromImage).toHaveBeenCalled())
    expect(
      container.querySelector<HTMLElement>('.plugin-card')?.style.getPropertyValue('--plugin-card-accent-rgb'),
    ).toBe('')
    await fireEvent.contextMenu(image)
    await fireEvent.click(image)
    await waitFor(() => expect(mocks.accentFromImage).toHaveBeenCalledTimes(2))
    expect(
      container.querySelector<HTMLElement>('.plugin-card')?.style.getPropertyValue('--plugin-card-accent-rgb'),
    ).toBe(normalizePluginAccentColor('#123456')?.rgb)
    await fireEvent.contextMenu(image)
    expect(
      container.querySelector<HTMLElement>('.plugin-card')?.style.getPropertyValue('--plugin-card-accent-rgb'),
    ).toBe('')
    await fireEvent.click(authorImage)
    await fireEvent.click(container.querySelector('.v-card')!)
    expect(mocks.openSharedDialog).not.toHaveBeenCalled()
  })

  it('opens the shared log dialog from the menu', async () => {
    const { container } = await renderWithProviders(PluginCard, { props: { plugin } })
    await fireEvent.click(container.querySelector<HTMLButtonElement>('.v-card .v-btn')!)
    await fireEvent.click(await screen.findByText('查看日志'))

    expect(mocks.openSharedDialog).toHaveBeenCalledWith(
      expect.any(Object),
      { plugin },
      {},
      { closeOn: ['close', 'update:modelValue'] },
    )
  })

  it('opens the shared read-only runtime capabilities dialog from the menu', async () => {
    const { container } = await renderWithProviders(PluginCard, { props: { plugin } })
    await fireEvent.click(container.querySelector<HTMLButtonElement>('.plugin-card__menu')!)
    expect(screen.queryByText('运行能力')).not.toBeInTheDocument()
    await fireEvent.click(await screen.findByTestId('plugin-advanced-menu'))
    await fireEvent.click(await screen.findByText('运行能力'))

    expect(mocks.openSharedDialog).toHaveBeenCalledWith(
      expect.any(Object),
      { plugin },
      {},
      { closeOn: ['close', 'update:modelValue'] },
    )
  })

  it('opens the shared redacted data diagnostics dialog from the menu', async () => {
    const { container } = await renderWithProviders(PluginCard, { props: { plugin } })
    await openAdvancedActions(container)
    await fireEvent.click(await screen.findByText('数据诊断'))

    expect(mocks.openSharedDialog).toHaveBeenCalledWith(
      expect.any(Object),
      { plugin },
      {},
      { closeOn: ['close', 'update:modelValue'] },
    )
  })

  it('reloads an installed plugin and refreshes runtime, list and dynamic navigation facts', async () => {
    mocks.reloadPluginRuntime.mockResolvedValueOnce(undefined)
    const { container, emitted, pinia } = await renderWithProviders(PluginCard, { props: { plugin } })
    const runtimeStore = usePluginRuntimeStore(pinia)
    const sidebarStore = usePluginSidebarNavStore(pinia)
    vi.spyOn(runtimeStore, 'refreshNow').mockResolvedValue(undefined)
    vi.mocked(sidebarStore.ensureSidebarNav).mockResolvedValue(undefined)

    await openAdvancedActions(container)
    await fireEvent.click(await screen.findByText('重新加载'))

    await waitFor(() => expect(mocks.reloadPluginRuntime).toHaveBeenCalledWith('DemoPlugin'))
    expect(runtimeStore.refreshNow).toHaveBeenCalledOnce()
    expect(sidebarStore.ensureSidebarNav).toHaveBeenCalledWith(true)
    expect(mocks.toastSuccess).toHaveBeenCalledWith('插件 演示插件 已重新加载')
    expect(emitted().save).toHaveLength(1)
  })

  it('prevents a second reload while the first request is still running', async () => {
    let resolveReload!: () => void
    mocks.reloadPluginRuntime.mockImplementationOnce(
      () =>
        new Promise<void>(resolve => {
          resolveReload = resolve
        }),
    )
    const { container, pinia } = await renderWithProviders(PluginCard, { props: { plugin } })
    const runtimeStore = usePluginRuntimeStore(pinia)
    vi.spyOn(runtimeStore, 'refreshNow').mockResolvedValue(undefined)

    const menuButton = container.querySelector<HTMLButtonElement>('.plugin-card__menu')!
    await openAdvancedActions(container)
    await fireEvent.click(await screen.findByText('重新加载'))
    await fireEvent.click(menuButton)
    await fireEvent.click(await screen.findByTestId('plugin-advanced-menu'))
    const pendingReloadItem = (await screen.findByText('重新加载')).closest('.v-list-item')

    expect(pendingReloadItem).toHaveClass('v-list-item--disabled')
    await fireEvent.click(pendingReloadItem!)
    expect(mocks.reloadPluginRuntime).toHaveBeenCalledOnce()

    resolveReload()
    await waitFor(() => expect(runtimeStore.refreshNow).toHaveBeenCalledOnce())
  })

  it('keeps terminal load failures reloadable and reports reload errors without refreshing', async () => {
    mocks.reloadPluginRuntime.mockRejectedValueOnce(new Error('network unavailable'))
    const { container, emitted, pinia } = await renderWithProviders(PluginCard, {
      props: { plugin: { ...plugin, runtime_status: 'load_failed' } },
    })
    const runtimeStore = usePluginRuntimeStore(pinia)
    vi.spyOn(runtimeStore, 'refreshNow').mockResolvedValue(undefined)

    await openAdvancedActions(container)
    await fireEvent.click(await screen.findByText('重新加载'))

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('插件 演示插件 重新加载失败：服务器连接失败'))
    expect(runtimeStore.refreshNow).not.toHaveBeenCalled()
    expect(emitted()).not.toHaveProperty('save')
  })

  it('opens plugin detail from an external action exactly once', async () => {
    const { emitted, rerender } = await renderWithProviders(PluginCard, {
      props: { plugin, action: false },
    })

    await rerender({ plugin, action: true })
    await waitFor(() => expect(mocks.openSharedDialog).toHaveBeenCalledOnce())
    expect(emitted().actionDone).toHaveLength(1)
  })

  it('keeps the card in installation progress after the runtime becomes active', async () => {
    const pending = await renderWithProviders(PluginCard, {
      props: {
        installing: true,
        plugin: { ...plugin, runtime_status: 'active' },
      },
    })

    expect(screen.getByText('正在安装插件...')).toBeInTheDocument()
    await fireEvent.click(pending.container.querySelector('.v-card')!)
    expect(mocks.openSharedDialog).not.toHaveBeenCalled()
  })

  it('distinguishes a running recovery from a settled unavailable plugin', async () => {
    const recovering = await renderWithProviders(PluginCard, {
      props: {
        plugin: { ...plugin, runtime_status: 'dependency_pending' },
        runtimeSettling: true,
      },
    })
    expect(screen.getByText('正在安装插件依赖')).toBeInTheDocument()
    await fireEvent.click(recovering.container.querySelector('.v-card')!)
    expect(mocks.openSharedDialog).not.toHaveBeenCalled()
    recovering.unmount()

    await renderWithProviders(PluginCard, {
      props: {
        plugin: { ...plugin, runtime_status: 'dependency_pending' },
        runtimeSettling: false,
      },
    })
    expect(screen.getByText('插件依赖未就绪')).toBeInTheDocument()
  })

  it('uses the host policy and load failure copy for terminal runtime states', async () => {
    const blocked = await renderWithProviders(PluginCard, {
      props: {
        plugin: { ...plugin, runtime_status: 'blocked_by_policy' },
        runtimeSettling: false,
      },
    })
    expect(screen.getByText('未通过用户认证，请查看日志')).toBeInTheDocument()
    blocked.unmount()

    await renderWithProviders(PluginCard, {
      props: {
        plugin: { ...plugin, runtime_status: 'load_failed' },
        runtimeSettling: false,
      },
    })
    expect(screen.getByText('插件加载失败，请查看日志')).toBeInTheDocument()
  })
})
