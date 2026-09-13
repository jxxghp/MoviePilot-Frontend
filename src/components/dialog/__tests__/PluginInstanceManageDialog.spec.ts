import DialogCloseBtn from '@/@core/components/DialogCloseBtn.vue'
import type { Plugin, PluginInstanceLogLevelOverview } from '@/api/types'
import PluginInstanceManageDialog from '@/components/dialog/PluginInstanceManageDialog.vue'
import { renderWithProviders } from '@tests/support/render'
import { fireEvent, screen, waitFor } from '@testing-library/vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  clearPluginInstanceDefaultTarget: vi.fn(),
  clearPluginInstanceLogLevel: vi.fn(),
  getInstalledPlugins: vi.fn(),
  getPluginInstanceLogLevels: vi.fn(),
  setPluginInstanceDefaultTarget: vi.fn(),
  setPluginInstanceEnabled: vi.fn(),
  setPluginInstanceLogLevel: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}))

vi.mock('@/api/pluginLogLevel', () => ({
  clearPluginInstanceLogLevel: mocks.clearPluginInstanceLogLevel,
  getPluginInstanceLogLevels: mocks.getPluginInstanceLogLevels,
  setPluginInstanceLogLevel: mocks.setPluginInstanceLogLevel,
}))

vi.mock('@/api/pluginInstanceManage', () => ({
  clearPluginInstanceDefaultTarget: mocks.clearPluginInstanceDefaultTarget,
  getInstalledPlugins: mocks.getInstalledPlugins,
  setPluginInstanceDefaultTarget: mocks.setPluginInstanceDefaultTarget,
  setPluginInstanceEnabled: mocks.setPluginInstanceEnabled,
}))

vi.mock('@/api', () => ({
  getApiErrorMessage: (error: unknown) => (error instanceof Error ? error.message : undefined),
}))

vi.mock('vue-toastification', () => ({
  useToast: () => ({ error: mocks.toastError, success: mocks.toastSuccess }),
}))

const plugin: Plugin = {
  id: 'DemoPlugin',
  plugin_name: '演示插件',
  plugin_version: '1.1.0',
  installed: true,
}

const overview: PluginInstanceLogLevelOverview = {
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

const hostOnlyOverview: PluginInstanceLogLevelOverview = {
  plugin_id: 'DemoPlugin',
  instances: [overview.instances[0]],
}

const installedPlugins: Plugin[] = [
  { id: 'DemoPlugin', plugin_name: '演示插件', is_default_target: false },
  { id: 'DemoPluginwork', plugin_name: '工作分身', is_instance: true, source_plugin_id: 'DemoPlugin' },
]

/** 渲染实例管理弹窗并注册真实关闭按钮。 */
async function renderDialog(props: Record<string, unknown> = {}) {
  return renderWithProviders(PluginInstanceManageDialog, {
    props: { modelValue: true, plugin, ...props },
    global: { components: { VDialogCloseBtn: DialogCloseBtn } },
  })
}

describe('PluginInstanceManageDialog', () => {
  beforeEach(() => {
    mocks.clearPluginInstanceDefaultTarget.mockReset().mockResolvedValue(null)
    mocks.clearPluginInstanceLogLevel.mockReset().mockResolvedValue(null)
    mocks.getInstalledPlugins.mockReset().mockResolvedValue(installedPlugins)
    mocks.getPluginInstanceLogLevels.mockReset().mockResolvedValue(overview)
    mocks.setPluginInstanceDefaultTarget.mockReset().mockResolvedValue(null)
    mocks.setPluginInstanceEnabled.mockReset().mockResolvedValue(null)
    mocks.setPluginInstanceLogLevel.mockReset().mockResolvedValue(null)
    mocks.toastError.mockReset()
    mocks.toastSuccess.mockReset()
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  it('列出本体与分身各自配置的与实际生效的等级', async () => {
    await renderDialog()

    expect(await screen.findByText('DemoPluginwork')).toBeInTheDocument()
    expect(mocks.getPluginInstanceLogLevels).toHaveBeenCalledWith('DemoPlugin')
    expect(screen.getByText('本体')).toBeInTheDocument()
    expect(screen.getByText('分身')).toBeInTheDocument()
    expect(screen.getByText('跟随全局')).toBeInTheDocument()
    expect(screen.getByText('已配置：DEBUG')).toBeInTheDocument()
    expect(screen.getByText('生效：INFO')).toBeInTheDocument()
    expect(screen.getByText('生效：DEBUG')).toBeInTheDocument()
  })

  it('实例展示名取自已安装插件清单，实例 ID 仍然可见', async () => {
    // 按实例的设置接口回执只带实例 ID，展示名只能从已安装清单上取
    await renderDialog()

    expect(await screen.findByText('工作分身')).toBeInTheDocument()
    expect(screen.getByText('DemoPluginwork')).toBeInTheDocument()
  })

  it('从分身卡片进入时改用源插件 ID 查询，并标出当前所在实例', async () => {
    // 后端对分身自身的实例 ID 直接拒绝，卡片是分身时必须重定向到源插件
    await renderDialog({
      plugin: { ...plugin, id: 'DemoPluginwork', is_instance: true, source_plugin_id: 'DemoPlugin' },
    })

    await waitFor(() => expect(mocks.getPluginInstanceLogLevels).toHaveBeenCalledWith('DemoPlugin'))
    expect(await screen.findByText('当前')).toBeInTheDocument()
  })

  it('已有分身却没有默认调用目标时，明说调用不会随机挑选也不会取第一个', async () => {
    await renderDialog()

    expect(
      await screen.findByText(
        '尚未指定默认调用目标：在指定之前，没有点名实例的外部调用（例如工作流动作）会直接失败——系统不会随机挑一个，也不会取第一个实例。',
      ),
    ).toBeInTheDocument()
  })

  it('只有本体、没有分身时不催促设置默认调用目标', async () => {
    mocks.getPluginInstanceLogLevels.mockResolvedValue(hostOnlyOverview)
    await renderDialog()

    expect(
      await screen.findByText('该插件只有本体、没有分身，未指定实例的调用直接落到本体，无需设置默认调用目标。'),
    ).toBeInTheDocument()
    expect(screen.queryByText(/尚未指定默认调用目标/)).toBeNull()
  })

  it('设为默认调用目标后重新读取权威状态', async () => {
    mocks.getPluginInstanceLogLevels.mockResolvedValue(overview)
    mocks.getInstalledPlugins
      .mockResolvedValueOnce(installedPlugins)
      .mockResolvedValue([installedPlugins[0], { ...installedPlugins[1], is_default_target: true }])
    await renderDialog()

    await fireEvent.click(await screen.findByTestId('instance-default-target-DemoPluginwork'))

    await waitFor(() =>
      expect(mocks.setPluginInstanceDefaultTarget).toHaveBeenCalledWith('DemoPlugin', 'DemoPluginwork'),
    )
    expect(mocks.toastSuccess).toHaveBeenCalledWith('已将该实例设为默认调用目标')
    expect(await screen.findByText('默认调用目标')).toBeInTheDocument()
    expect(screen.queryByText(/尚未指定默认调用目标/)).toBeNull()
  })

  it('已经是默认调用目标的实例给出取消入口', async () => {
    mocks.getInstalledPlugins.mockResolvedValue([
      installedPlugins[0],
      { ...installedPlugins[1], is_default_target: true },
    ])
    await renderDialog()

    await fireEvent.click(await screen.findByTestId('instance-default-target-DemoPluginwork'))

    await waitFor(() =>
      expect(mocks.clearPluginInstanceDefaultTarget).toHaveBeenCalledWith('DemoPlugin', 'DemoPluginwork'),
    )
    expect(mocks.toastSuccess).toHaveBeenCalledWith('已取消该实例的默认调用目标')
  })

  it('已安装清单读取失败时不谎报默认调用目标状态', async () => {
    mocks.getInstalledPlugins.mockRejectedValue(new Error('network unavailable'))
    await renderDialog()

    expect(await screen.findByText('已安装插件清单读取失败，实例展示名与默认调用目标暂不可用')).toBeInTheDocument()
    expect(screen.queryByText(/尚未指定默认调用目标/)).toBeNull()
    expect(screen.getByTestId('instance-default-target-DemoPluginwork')).toBeDisabled()
  })

  it('停用分身前先说明停用不是删除，确认后该行留在列表上标为已停用', async () => {
    await renderDialog()
    await fireEvent.click(await screen.findByTestId('instance-disable-DemoPluginwork'))

    expect(
      screen.getByText('停用不是删除：这个实例的业务参数与展示信息原样留在原处，再次启用即恢复。'),
    ).toBeInTheDocument()
    expect(screen.getByText('只对在册实例有意义的两项会被清掉：默认调用目标置位与日志等级覆盖。')).toBeInTheDocument()

    // 停用后后端的在册清单里不再有它，列表靠本地快照留住这一行
    mocks.getPluginInstanceLogLevels.mockResolvedValue(hostOnlyOverview)
    await fireEvent.click(screen.getByTestId('instance-disable-confirm-DemoPluginwork'))

    await waitFor(() => expect(mocks.setPluginInstanceEnabled).toHaveBeenCalledWith('DemoPluginwork', false))
    expect(mocks.toastSuccess).toHaveBeenCalledWith('工作分身 已停用，配置已保留')
    expect(await screen.findByText('已停用')).toBeInTheDocument()
    expect(screen.getByText('业务参数与展示信息仍在，启用即恢复')).toBeInTheDocument()
  })

  it('刚停用的实例可以当场再启用', async () => {
    await renderDialog()
    await fireEvent.click(await screen.findByTestId('instance-disable-DemoPluginwork'))
    mocks.getPluginInstanceLogLevels.mockResolvedValue(hostOnlyOverview)
    await fireEvent.click(screen.getByTestId('instance-disable-confirm-DemoPluginwork'))

    await fireEvent.click(await screen.findByTestId('instance-enable-DemoPluginwork'))

    await waitFor(() => expect(mocks.setPluginInstanceEnabled).toHaveBeenCalledWith('DemoPluginwork', true))
    expect(mocks.toastSuccess).toHaveBeenCalledWith('工作分身 已启用')
  })

  it('本体不提供停用入口：停掉它整个插件就不再装载，实例清单也随之读不到', async () => {
    await renderDialog()

    await screen.findByTestId('instance-disable-DemoPluginwork')
    expect(screen.queryByTestId('instance-disable-DemoPlugin')).toBeNull()
  })

  it('提交覆盖时把失效时间送成带时区的 ISO 字符串', async () => {
    // 后端把不带时区的失效时间按 UTC 解读，送裸本地时间会让覆盖提前或推迟失效
    await renderDialog()
    await fireEvent.click(await screen.findByTestId('log-level-edit-DemoPlugin'))
    await fireEvent.update(
      document.querySelector<HTMLInputElement>('input[type="datetime-local"]')!,
      '2026-09-10T08:30',
    )
    await fireEvent.click(screen.getByRole('button', { name: '确认' }))

    await waitFor(() => expect(mocks.setPluginInstanceLogLevel).toHaveBeenCalledTimes(1))
    const [pluginId, instanceId, request] = mocks.setPluginInstanceLogLevel.mock.calls[0]
    expect([pluginId, instanceId]).toEqual(['DemoPlugin', 'DemoPlugin'])
    expect(request.level).toBe('INFO')
    expect(request.expires_at).toBe(new Date('2026-09-10T08:30').toISOString())
    expect(mocks.toastSuccess).toHaveBeenCalledWith('日志等级已更新')
    expect(mocks.getPluginInstanceLogLevels).toHaveBeenCalledTimes(2)
  })

  it('未填失效时间时送空值，表示覆盖不过期', async () => {
    await renderDialog()
    await fireEvent.click(await screen.findByTestId('log-level-edit-DemoPlugin'))
    await fireEvent.click(screen.getByRole('button', { name: '确认' }))

    await waitFor(() =>
      expect(mocks.setPluginInstanceLogLevel).toHaveBeenCalledWith('DemoPlugin', 'DemoPlugin', {
        level: 'INFO',
        expires_at: null,
      }),
    )
  })

  it('只给已配置覆盖的实例提供清除入口，清除后回落全局等级', async () => {
    await renderDialog()
    await fireEvent.click(await screen.findByTestId('log-level-edit-DemoPlugin'))

    expect(screen.queryByRole('button', { name: '清除覆盖' })).toBeNull()

    await fireEvent.click(screen.getByTestId('log-level-edit-DemoPluginwork'))
    await fireEvent.click(await screen.findByRole('button', { name: '清除覆盖' }))

    await waitFor(() => expect(mocks.clearPluginInstanceLogLevel).toHaveBeenCalledWith('DemoPlugin', 'DemoPluginwork'))
    expect(mocks.toastSuccess).toHaveBeenCalledWith('已清除日志等级覆盖，回落全局等级')
  })

  it('设置失败时保留编辑器并报出后端原因', async () => {
    mocks.setPluginInstanceLogLevel.mockRejectedValueOnce(new Error('实例不存在'))
    await renderDialog()
    await fireEvent.click(await screen.findByTestId('log-level-edit-DemoPlugin'))
    await fireEvent.click(screen.getByRole('button', { name: '确认' }))

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('设置失败：实例不存在'))
    expect(screen.getByRole('button', { name: '确认' })).toBeInTheDocument()
  })

  it('加载失败时保留重试入口', async () => {
    mocks.getPluginInstanceLogLevels.mockRejectedValueOnce(new Error('network unavailable')).mockResolvedValue(overview)
    await renderDialog()

    expect(await screen.findByText('实例列表加载失败，请稍后重试')).toBeInTheDocument()
    await fireEvent.click(screen.getByRole('button', { name: '重试' }))

    await waitFor(() => expect(mocks.getPluginInstanceLogLevels).toHaveBeenCalledTimes(2))
    expect(await screen.findByText('DemoPluginwork')).toBeInTheDocument()
  })

  it('通过 modelValue 契约关闭', async () => {
    const { emitted } = await renderDialog()

    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
    const closeButton = document.querySelector<HTMLButtonElement>('.absolute.right-3.top-3')
    expect(closeButton).not.toBeNull()
    await fireEvent.click(closeButton!)

    expect(emitted()['update:modelValue']).toContainEqual([false])
    expect(emitted().close).toHaveLength(1)
  })
})
