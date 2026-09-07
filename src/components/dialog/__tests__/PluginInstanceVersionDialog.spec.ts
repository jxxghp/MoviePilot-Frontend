import DialogCloseBtn from '@/@core/components/DialogCloseBtn.vue'
import type { Plugin, PluginInstanceLogLevelOverview, PluginVersionOverview } from '@/api/types'
import PluginInstanceVersionDialog from '@/components/dialog/PluginInstanceVersionDialog.vue'
import { renderWithProviders } from '@tests/support/render'
import { fireEvent, screen, waitFor } from '@testing-library/vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  clearPluginInstanceDefaultTarget: vi.fn(),
  clearPluginInstanceLogLevel: vi.fn(),
  getPluginInstanceLogLevels: vi.fn(),
  getPluginVersionOverview: vi.fn(),
  recyclePluginVersions: vi.fn(),
  setPluginInstanceDefaultTarget: vi.fn(),
  setPluginInstanceLogLevel: vi.fn(),
  setPluginInstanceVersion: vi.fn(),
  createConfirm: vi.fn(),
  toastError: vi.fn(),
  toastInfo: vi.fn(),
  toastSuccess: vi.fn(),
}))

vi.mock('@/api/pluginVersion', () => ({
  clearPluginInstanceDefaultTarget: mocks.clearPluginInstanceDefaultTarget,
  clearPluginInstanceLogLevel: mocks.clearPluginInstanceLogLevel,
  getPluginInstanceLogLevels: mocks.getPluginInstanceLogLevels,
  getPluginVersionOverview: mocks.getPluginVersionOverview,
  recyclePluginVersions: mocks.recyclePluginVersions,
  setPluginInstanceDefaultTarget: mocks.setPluginInstanceDefaultTarget,
  setPluginInstanceLogLevel: mocks.setPluginInstanceLogLevel,
  setPluginInstanceVersion: mocks.setPluginInstanceVersion,
}))

vi.mock('@/api', () => ({
  getApiErrorMessage: (error: unknown) => (error instanceof Error ? error.message : undefined),
}))

vi.mock('@/composables/useConfirm', () => ({
  useConfirm: () => mocks.createConfirm,
}))

vi.mock('vue-toastification', () => ({
  useToast: () => ({ error: mocks.toastError, info: mocks.toastInfo, success: mocks.toastSuccess }),
}))

const plugin: Plugin = {
  id: 'DemoPlugin',
  plugin_name: '演示插件',
  plugin_version: '1.1.0',
  installed: true,
}

const overview: PluginVersionOverview = {
  plugin_id: 'DemoPlugin',
  current_version: '1.1.0',
  installed_versions: [
    {
      version: '1.0.0',
      directory: 'v1.0.0',
      installed_at: '2026-01-01T00:00:00Z',
      source: 'market',
      is_current: false,
    },
    { version: '1.1.0', directory: 'v1.1.0', installed_at: '2026-02-01T00:00:00Z', source: 'market', is_current: true },
  ],
  instances: [
    {
      instance_id: 'DemoPlugin',
      plugin_version: '1.1.0',
      follow_current_version: true,
      running: true,
      is_host: true,
      is_default_target: true,
    },
    {
      instance_id: 'DemoPluginwork',
      plugin_version: '1.0.0',
      follow_current_version: false,
      running: false,
      is_host: false,
      is_default_target: false,
    },
  ],
}

const logLevels: PluginInstanceLogLevelOverview = {
  plugin_id: 'DemoPlugin',
  instances: [
    { instance_id: 'DemoPlugin', configured_level: null, expires_at: null, effective_level: 'INFO' },
    {
      instance_id: 'DemoPluginwork',
      configured_level: 'DEBUG',
      expires_at: '2026-09-10T00:00:00Z',
      effective_level: 'DEBUG',
    },
  ],
}

async function renderDialog(props: Record<string, unknown>) {
  return renderWithProviders(PluginInstanceVersionDialog, {
    props,
    global: { components: { VDialogCloseBtn: DialogCloseBtn } },
  })
}

describe('PluginInstanceVersionDialog', () => {
  beforeEach(() => {
    Object.values(mocks).forEach(mock => {
      if (typeof mock === 'function' && 'mockReset' in mock) mock.mockReset()
    })
    mocks.getPluginVersionOverview.mockResolvedValue(overview)
    mocks.getPluginInstanceLogLevels.mockResolvedValue(logLevels)
    mocks.createConfirm.mockResolvedValue(true)
    mocks.setPluginInstanceVersion.mockResolvedValue(null)
    mocks.setPluginInstanceDefaultTarget.mockResolvedValue(null)
    mocks.clearPluginInstanceDefaultTarget.mockResolvedValue(null)
    mocks.setPluginInstanceLogLevel.mockResolvedValue(null)
    mocks.clearPluginInstanceLogLevel.mockResolvedValue(null)
    mocks.recyclePluginVersions.mockResolvedValue({ removed: [], kept: {} })
  })

  it('loads and renders installed versions and instance rows', async () => {
    await renderDialog({ modelValue: true, plugin })

    expect(mocks.getPluginVersionOverview).toHaveBeenCalledWith('DemoPlugin')
    expect(mocks.getPluginInstanceLogLevels).toHaveBeenCalledWith('DemoPlugin')

    expect(await screen.findAllByText('v1.0.0')).toHaveLength(2)
    expect(screen.getAllByText('v1.1.0')).toHaveLength(2)
    expect(screen.getByText('本体')).toBeInTheDocument()
    expect(screen.getByText('分身')).toBeInTheDocument()
    expect(screen.getByText('运行中')).toBeInTheDocument()
    expect(screen.getByText('已停止')).toBeInTheDocument()
    expect(screen.getByText('已配置：DEBUG')).toBeInTheDocument()
    expect(screen.getByText('跟随全局')).toBeInTheDocument()
  })

  it('resolves API calls to the true source plugin id when opened from a clone card', async () => {
    const clonePlugin: Plugin = {
      id: 'DemoPluginwork',
      plugin_name: '演示插件（分身）',
      plugin_version: '1.1.0',
      installed: true,
      is_instance: true,
      instance_mode: 'virtual',
      source_plugin_id: 'DemoPlugin',
    }

    await renderDialog({ modelValue: true, plugin: clonePlugin })

    expect(mocks.getPluginVersionOverview).toHaveBeenCalledWith('DemoPlugin')
    expect(mocks.getPluginInstanceLogLevels).toHaveBeenCalledWith('DemoPlugin')
  })

  it('shows a load error with a retry action', async () => {
    mocks.getPluginVersionOverview.mockRejectedValueOnce(new Error('版本信息加载失败'))

    await renderDialog({ modelValue: true, plugin })

    expect(await screen.findByText('版本信息加载失败')).toBeInTheDocument()
    mocks.getPluginVersionOverview.mockResolvedValueOnce(overview)
    await fireEvent.click(screen.getByRole('button', { name: '重试' }))

    expect(await screen.findAllByText('v1.0.0')).toHaveLength(2)
  })

  it('sets the default target for a non-default instance and emits save', async () => {
    const { emitted } = await renderDialog({ modelValue: true, plugin })
    await screen.findByText('已装版本')

    await fireEvent.click(screen.getByRole('button', { name: '设为默认调用目标' }))

    await waitFor(() =>
      expect(mocks.setPluginInstanceDefaultTarget).toHaveBeenCalledWith('DemoPlugin', 'DemoPluginwork'),
    )
    expect(mocks.toastSuccess).toHaveBeenCalledWith('已将该实例设为默认调用目标')
    await waitFor(() => expect(emitted().save).toHaveLength(1))
  })

  it('clears the default target for the currently default instance', async () => {
    await renderDialog({ modelValue: true, plugin })
    await screen.findByText('已装版本')

    await fireEvent.click(screen.getByRole('button', { name: '取消默认调用目标' }))

    await waitFor(() => expect(mocks.clearPluginInstanceDefaultTarget).toHaveBeenCalledWith('DemoPlugin', 'DemoPlugin'))
    expect(mocks.toastSuccess).toHaveBeenCalledWith('已取消该实例的默认调用目标')
  })

  it('recycles unreferenced versions after confirmation and shows the outcome', async () => {
    mocks.recyclePluginVersions.mockResolvedValue({ removed: ['0.9.0'], kept: { '1.0.0': '仍被实例引用' } })

    await renderDialog({ modelValue: true, plugin })
    await screen.findByText('已装版本')

    await fireEvent.click(screen.getByRole('button', { name: '回收旧版本' }))

    expect(mocks.createConfirm).toHaveBeenCalled()
    await waitFor(() => expect(mocks.recyclePluginVersions).toHaveBeenCalledWith('DemoPlugin'))
    expect(await screen.findByText('已删除版本：v0.9.0')).toBeInTheDocument()
    expect(screen.getByText(/v1.0.0 — 仍被实例引用/)).toBeInTheDocument()
  })

  it('does not recycle when the confirmation is declined', async () => {
    mocks.createConfirm.mockResolvedValueOnce(false)

    await renderDialog({ modelValue: true, plugin })
    await screen.findByText('已装版本')

    await fireEvent.click(screen.getByRole('button', { name: '回收旧版本' }))

    await waitFor(() => expect(mocks.createConfirm).toHaveBeenCalled())
    expect(mocks.recyclePluginVersions).not.toHaveBeenCalled()
  })

  it('switches an instance to follow the current version and stops-and-restarts it', async () => {
    const { emitted } = await renderDialog({ modelValue: true, plugin })
    await screen.findByText('已装版本')

    await fireEvent.click(screen.getByText('钉住 v1.0.0'))
    await fireEvent.click(await screen.findByRole('radio', { name: '跟随当前版本' }))
    await fireEvent.click(screen.getByRole('button', { name: '确认' }))

    await waitFor(() =>
      expect(mocks.setPluginInstanceVersion).toHaveBeenCalledWith('DemoPlugin', 'DemoPluginwork', {
        follow_current_version: true,
        plugin_version: null,
      }),
    )
    expect(mocks.toastSuccess).toHaveBeenCalledWith('版本绑定已更新')
    await waitFor(() => expect(emitted().save).toHaveLength(1))
  })

  it('sets and clears an instance log level override', async () => {
    await renderDialog({ modelValue: true, plugin })
    await screen.findByText('已装版本')

    await fireEvent.click(screen.getByText('已配置：DEBUG'))
    await fireEvent.click(await screen.findByRole('button', { name: '清除覆盖' }))

    await waitFor(() => expect(mocks.clearPluginInstanceLogLevel).toHaveBeenCalledWith('DemoPlugin', 'DemoPluginwork'))
    expect(mocks.toastSuccess).toHaveBeenCalledWith('已清除日志等级覆盖，回落全局等级')
  })

  it('closes through the model contract', async () => {
    const { emitted } = await renderDialog({ modelValue: true, plugin })

    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
    const closeButton = document.querySelector<HTMLButtonElement>('.absolute.right-3.top-3')
    expect(closeButton).not.toBeNull()
    await fireEvent.click(closeButton!)

    expect(emitted()['update:modelValue']).toContainEqual([false])
    expect(emitted().close).toHaveLength(1)
  })
})
