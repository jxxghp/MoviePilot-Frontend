import DialogCloseBtn from '@/@core/components/DialogCloseBtn.vue'
import type { Plugin, PluginInstanceLogLevelOverview, PluginVersionOverview } from '@/api/types'
import PluginInstanceVersionDialog from '@/components/dialog/PluginInstanceVersionDialog.vue'
import { renderWithProviders } from '@tests/support/render'
import { fireEvent, screen, waitFor } from '@testing-library/vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  setPluginInstanceEnabled: vi.fn(),
  clearPluginInstanceDefaultTarget: vi.fn(),
  clearPluginInstanceLogLevel: vi.fn(),
  getPluginInstanceLogLevels: vi.fn(),
  getPluginVersionOverview: vi.fn(),
  getInstalledPlugins: vi.fn(),
  openSharedDialog: vi.fn(),
  createClone: vi.fn(),
  recyclePluginVersions: vi.fn(),
  setPluginInstanceDefaultTarget: vi.fn(),
  setPluginInstanceLogLevel: vi.fn(),
  setPluginInstanceVersion: vi.fn(),
  resetPluginInstance: vi.fn(),
  uninstallPluginInstance: vi.fn(),
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
  getInstalledPlugins: mocks.getInstalledPlugins,
  recyclePluginVersions: mocks.recyclePluginVersions,
  setPluginInstanceDefaultTarget: mocks.setPluginInstanceDefaultTarget,
  setPluginInstanceLogLevel: mocks.setPluginInstanceLogLevel,
  setPluginInstanceVersion: mocks.setPluginInstanceVersion,
  resetPluginInstance: mocks.resetPluginInstance,
  uninstallPluginInstance: mocks.uninstallPluginInstance,
  setPluginInstanceEnabled: mocks.setPluginInstanceEnabled,
}))

vi.mock('@/api', () => ({
  getApiErrorMessage: (error: unknown) => (error instanceof Error ? error.message : undefined),
}))

vi.mock('@/composables/useConfirm', () => ({
  useConfirm: () => mocks.createConfirm,
}))

vi.mock('@/composables/useSharedDialog', () => ({
  openSharedDialog: (...args: unknown[]) => mocks.openSharedDialog(...args),
}))

vi.mock('@/composables/usePluginCloneCreation', () => ({
  usePluginCloneCreation: () => ({ createClone: mocks.createClone }),
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
      plugin_name: '演示插件',
      pinned_version: null,
      running_version: '1.1.0',
      running: true,
      is_host: true,
      is_default_target: true,
      is_enabled: true,
    },
    {
      instance_id: 'DemoPluginwork',
      plugin_name: '工作实例',
      running_version: null,
      pinned_version: '1.0.0',
      running: false,
      is_host: false,
      is_default_target: false,
      is_enabled: true,
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
    mocks.resetPluginInstance.mockResolvedValue(null)
    mocks.uninstallPluginInstance.mockResolvedValue(null)
    mocks.getInstalledPlugins.mockResolvedValue([
      { id: 'DemoPlugin', plugin_name: '演示插件', installed: true },
      { id: 'DemoPluginwork', plugin_name: '工作实例', installed: true },
    ])
    mocks.createClone.mockResolvedValue({ success: true, cloneId: 'DemoPluginnew' })
    mocks.openSharedDialog.mockReturnValue({ close: vi.fn(), id: 1, updateProps: vi.fn() })
  })

  it('loads and renders installed versions and instance rows', async () => {
    await renderDialog({ modelValue: true, plugin })

    expect(mocks.getPluginVersionOverview).toHaveBeenCalledWith('DemoPlugin')
    expect(mocks.getPluginInstanceLogLevels).toHaveBeenCalledWith('DemoPlugin')

    expect(await screen.findAllByText('v1.0.0')).toHaveLength(1)
    expect(screen.getAllByText('v1.1.0')).toHaveLength(3)
    expect(screen.getByText('本体')).toBeInTheDocument()
    expect(screen.getByText('分身')).toBeInTheDocument()
    expect(screen.getByText('运行中')).toBeInTheDocument()
    expect(screen.getByText('已停止')).toBeInTheDocument()
    expect(screen.getByText('已配置：DEBUG')).toBeInTheDocument()
    expect(screen.getByText('跟随全局')).toBeInTheDocument()
  })

  it('shows the running version separately from the requested binding', async () => {
    const runningDifferentVersionOverview: PluginVersionOverview = {
      ...overview,
      instances: overview.instances.map(item =>
        item.instance_id === 'DemoPluginwork'
          ? { ...item, plugin_version: '1.0.0', running: true, running_version: '1.1.0' }
          : item,
      ),
    }
    mocks.getPluginVersionOverview.mockResolvedValueOnce(runningDifferentVersionOverview)

    await renderDialog({ modelValue: true, plugin })

    await waitFor(() => expect(screen.getAllByText('v1.1.0')).toHaveLength(4))
    expect(screen.getByText('钉住 v1.0.0')).toBeInTheDocument()
  })

  it('does not use the requested binding as the running version when the backend reports null', async () => {
    mocks.getPluginVersionOverview.mockResolvedValueOnce({
      ...overview,
      instances: overview.instances.map(item =>
        item.instance_id === 'DemoPluginwork' ? { ...item, running: true, running_version: null } : item,
      ),
    })

    await renderDialog({ modelValue: true, plugin })

    expect(await screen.findByText('运行中（版本未知）')).toBeInTheDocument()
    expect(screen.getAllByText('v1.0.0')).toHaveLength(1)
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

    expect(await screen.findAllByText('v1.0.0')).toHaveLength(1)
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
        pinned_version: null,
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

  it('opens the uninstall dialog instead of deleting on a one-line confirm', async () => {
    // 卸载默认保留配置与业务数据，还允许勾选一并清除的范围——这两件事一行确认
    // 文案承载不了，之前那句「配置与业务数据将一并删除，且无法恢复」更是说反了。
    await renderDialog({ modelValue: true, plugin })
    await screen.findByText('本体')

    await fireEvent.click(screen.getByTestId('instance-actions-DemoPluginwork'))
    await fireEvent.click(await screen.findByTestId('instance-action-uninstall-DemoPluginwork'))

    expect(mocks.createConfirm).not.toHaveBeenCalled()
    expect(mocks.uninstallPluginInstance).not.toHaveBeenCalled()
    await waitFor(() => expect(screen.getByTestId('uninstall-submit')).toBeInTheDocument())
  })

  it('tells the user which clones a host uninstall will take with it', async () => {
    // 不列出会被一并卸载的分身，用户点下去才发现分身没了
    await renderDialog({ modelValue: true, plugin })
    await screen.findByText('本体')

    await fireEvent.click(screen.getByTestId('instance-actions-DemoPlugin'))
    await fireEvent.click(await screen.findByTestId('instance-action-uninstall-DemoPlugin'))

    await waitFor(() => expect(screen.getByTestId('uninstall-submit')).toBeInTheDocument())
    // 卡片上也有这个名字，断言要锁定到弹窗里的级联提示那一句
    expect(screen.getByText(/它的分身（.*工作实例.*）会被一并卸载/)).toBeInTheDocument()

    await fireEvent.click(screen.getByTestId('uninstall-submit'))

    // 本体卸载必须级联：否则会留下指向不存在源码的孤儿分身
    await waitFor(() => expect(mocks.uninstallPluginInstance).toHaveBeenCalledWith('DemoPlugin', true))
  })

  it('resets a single instance after confirmation', async () => {
    await renderDialog({ modelValue: true, plugin })
    await screen.findByText('本体')

    await fireEvent.click(screen.getByTestId('instance-actions-DemoPluginwork'))
    await fireEvent.click(await screen.findByTestId('instance-action-reset-DemoPluginwork'))

    await waitFor(() => expect(mocks.resetPluginInstance).toHaveBeenCalledWith('DemoPluginwork'))
  })

  it('shows each instance name next to its id', async () => {
    await renderDialog({ modelValue: true, plugin })

    expect(await screen.findByText('演示插件')).toBeInTheDocument()
    expect(screen.getByText('工作实例')).toBeInTheDocument()
  })

  it('creates a clone against the source plugin even when opened from a clone card', async () => {
    // 入口是分身卡片时，源插件仍必须是本体，否则会基于分身再分身
    const clonePlugin: Plugin = {
      id: 'DemoPluginwork',
      plugin_name: '演示插件（分身）',
      installed: true,
      is_instance: true,
      source_plugin_id: 'DemoPlugin',
    }
    await renderDialog({ modelValue: true, plugin: clonePlugin })
    await screen.findByText('本体')

    await fireEvent.click(screen.getByTestId('instance-create-clone'))
    const cloneEvents = mocks.openSharedDialog.mock.calls.at(-1)?.[2] as {
      clone: (form: Record<string, unknown>) => Promise<void>
    }
    await cloneEvents.clone({ suffix: 'New', name: '新分身', description: '', icon: '' })

    expect(mocks.openSharedDialog.mock.calls.at(-1)?.[1]).toMatchObject({
      plugin: expect.objectContaining({ id: 'DemoPlugin' }),
    })
    expect(mocks.createClone).toHaveBeenCalledWith('DemoPlugin', expect.objectContaining({ suffix: 'New' }))
  })

  it('opens the configuration of the very instance whose row was used', async () => {
    await renderDialog({ modelValue: true, plugin })
    await screen.findByText('本体')

    await fireEvent.click(screen.getByTestId('instance-actions-DemoPluginwork'))
    await fireEvent.click(await screen.findByTestId('instance-action-open-DemoPluginwork'))

    await waitFor(() =>
      expect(mocks.openSharedDialog.mock.calls.at(-1)?.[1]).toMatchObject({
        plugin: expect.objectContaining({ id: 'DemoPluginwork' }),
      }),
    )
  })

  it('offers the host a plain version switch instead of a follow-or-pin choice', async () => {
    // 本体就是插件本身，「跟随当前版本」对它是循环定义，只会让人困惑
    await renderDialog({ modelValue: true, plugin })
    await screen.findByText('本体')

    await fireEvent.click(screen.getByTestId('instance-version-chip-DemoPlugin'))

    expect(screen.queryByText('钉在指定版本')).not.toBeInTheDocument()
    expect(screen.queryByText('跟随当前版本')).not.toBeInTheDocument()
    expect(screen.getByLabelText('选择版本')).toBeInTheDocument()
  })

  it('writes the host binding as follow when the picked version is the current one', async () => {
    // 选中当前版本却写成钉住，会让本体从此对更新免疫
    await renderDialog({ modelValue: true, plugin })
    await screen.findByText('本体')

    await fireEvent.click(screen.getByTestId('instance-version-chip-DemoPlugin'))
    await fireEvent.click(screen.getByText('确认'))

    await waitFor(() =>
      expect(mocks.setPluginInstanceVersion).toHaveBeenCalledWith('DemoPlugin', 'DemoPlugin', {
        pinned_version: null,
      }),
    )
  })

  it('keeps the host pinned when its bound version is not the current one', async () => {
    // 本体钉在旧版本时重新确认，不能被当成「选中当前版本」而静默改成跟随
    mocks.getPluginVersionOverview.mockResolvedValueOnce({
      ...overview,
      instances: overview.instances.map(item =>
        item.is_host ? { ...item, pinned_version: '1.0.0', plugin_version: '1.0.0' } : item,
      ),
    })
    await renderDialog({ modelValue: true, plugin })
    await screen.findByText('本体')

    await fireEvent.click(screen.getByTestId('instance-version-chip-DemoPlugin'))
    await fireEvent.click(screen.getByText('确认'))

    await waitFor(() =>
      expect(mocks.setPluginInstanceVersion).toHaveBeenCalledWith('DemoPlugin', 'DemoPlugin', {
        pinned_version: '1.0.0',
      }),
    )
  })

  it('keeps instance ids out of the table', async () => {
    await renderDialog({ modelValue: true, plugin })
    await screen.findByText('本体')

    expect(screen.queryByText('DemoPluginwork')).not.toBeInTheDocument()
    expect(screen.getByText('工作实例')).toBeInTheDocument()
  })

  it('offers no enable switch on an instance card', async () => {
    // 实例的移除动作是卸载，不是开关：两个入口并存只会让人分不清「关掉」和「卸载」
    // 到底差在哪，而卸载本身已经保留配置、可经创建对话框恢复。
    await renderDialog({ modelValue: true, plugin })
    await screen.findByText('本体')

    // 先确认卡片确实渲染出来了，否则「查不到开关」只是因为什么都没渲染
    expect(screen.getByTestId('instance-card-DemoPluginwork')).toBeInTheDocument()
    expect(screen.queryByTestId('instance-enabled-DemoPluginwork')).not.toBeInTheDocument()
    expect(screen.getByTestId('instance-actions-DemoPluginwork')).toBeInTheDocument()
  })
})
