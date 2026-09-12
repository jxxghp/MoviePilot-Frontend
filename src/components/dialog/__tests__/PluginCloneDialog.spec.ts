import DialogCloseBtn from '@/@core/components/DialogCloseBtn.vue'
import type { Plugin, PluginVersionOverview } from '@/api/types'
import PluginCloneDialog from '@/components/dialog/PluginCloneDialog.vue'
import { renderWithProviders } from '@tests/support/render'
import { fireEvent, screen, waitFor } from '@testing-library/vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getPluginVersionOverview: vi.fn(),
  getPluginRestorableInstances: vi.fn(),
  resolveTrustedReleaseRepoUrl: vi.fn(),
  fetchPluginReleaseVersions: vi.fn(),
}))

vi.mock('@/api/pluginVersion', () => ({
  getPluginVersionOverview: mocks.getPluginVersionOverview,
  getPluginRestorableInstances: mocks.getPluginRestorableInstances,
}))

vi.mock('@/api/pluginRelease', () => ({
  resolveTrustedReleaseRepoUrl: mocks.resolveTrustedReleaseRepoUrl,
  fetchPluginReleaseVersions: mocks.fetchPluginReleaseVersions,
}))

vi.mock('@/api', () => ({
  getApiErrorMessage: (error: unknown) => (error instanceof Error ? error.message : undefined),
}))

const plugin: Plugin = {
  id: 'DemoPlugin',
  plugin_name: '演示插件',
  plugin_desc: '用于测试分身创建',
  plugin_version: '1.1.0',
  installed: true,
}

const overview: PluginVersionOverview = {
  plugin_id: 'DemoPlugin',
  current_version: '1.1.0',
  installed_versions: [
    { version: '1.1.0', directory: 'v1.1.0', installed_at: null, source: 'market', is_current: true },
  ],
  instances: [],
}

async function renderDialog() {
  return renderWithProviders(PluginCloneDialog, {
    props: { modelValue: true, plugin },
    global: { components: { VDialogCloseBtn: DialogCloseBtn } },
  })
}

/** 选择「锚定版本」策略：data-testid 落在 VRadio 根节点上，要点其内部 input 才会改动模型。 */
async function chooseAnchorStrategy() {
  const radio = screen.getByTestId('clone-version-anchor').querySelector<HTMLInputElement>('input')
  await fireEvent.click(radio!)
}

describe('PluginCloneDialog version strategy', () => {
  beforeEach(() => {
    mocks.getPluginVersionOverview.mockReset().mockResolvedValue(overview)
    mocks.resolveTrustedReleaseRepoUrl.mockReset().mockResolvedValue({ repoUrl: null, options: null })
    mocks.fetchPluginReleaseVersions.mockReset().mockResolvedValue({ release_supported: false, items: [] })
    mocks.getPluginRestorableInstances.mockReset().mockResolvedValue([])
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  it('defaults to following the plugin version so existing behaviour is unchanged', async () => {
    const { emitted } = await renderDialog()
    await waitFor(() => expect(mocks.getPluginVersionOverview).toHaveBeenCalledWith('DemoPlugin'))

    await fireEvent.click(screen.getByTestId('clone-submit'))

    await waitFor(() => expect(emitted().clone).toBeTruthy())
    expect((emitted().clone[0] as unknown[])[0]).toMatchObject({
      suffix: null,
      pinned_version: null,
      install: null,
    })
  })

  it('pins an installed version without asking for an extra install', async () => {
    const { emitted } = await renderDialog()
    await waitFor(() => expect(mocks.getPluginVersionOverview).toHaveBeenCalled())

    await chooseAnchorStrategy()
    await fireEvent.click(await screen.findByTestId('clone-version-1.1.0'))
    await fireEvent.click(screen.getByTestId('clone-submit'))

    await waitFor(() => expect(emitted().clone).toBeTruthy())
    expect((emitted().clone[0] as unknown[])[0]).toMatchObject({
      pinned_version: '1.1.0',
      install: null,
    })
  })

  it('carries the install request for a release version that is not on disk yet', async () => {
    // 版本目录不在磁盘上就建分身，只会建出启动必失败的实例
    mocks.resolveTrustedReleaseRepoUrl.mockResolvedValue({
      repoUrl: 'https://github.com/demo/repo',
      options: null,
    })
    mocks.fetchPluginReleaseVersions.mockResolvedValue({
      release_supported: true,
      items: [
        { version: '1.1.0', tag_name: 'v1.1.0', is_latest: true },
        { version: '1.0.0', tag_name: 'v1.0.0' },
      ],
    })

    const { emitted } = await renderDialog()
    await waitFor(() => expect(mocks.fetchPluginReleaseVersions).toHaveBeenCalled())

    await chooseAnchorStrategy()
    await fireEvent.click(await screen.findByTestId('clone-version-1.0.0'))
    await fireEvent.click(screen.getByTestId('clone-submit'))

    await waitFor(() => expect(emitted().clone).toBeTruthy())
    expect((emitted().clone[0] as unknown[])[0]).toMatchObject({
      pinned_version: '1.0.0',
      install: { repo_url: 'https://github.com/demo/repo', release_version: '1.0.0' },
    })
  })

  it('keeps installed versions selectable when the release history is unavailable', async () => {
    // Release 历史依赖可信来源与网络，它的失败不能挡住已装版本的锚定
    mocks.resolveTrustedReleaseRepoUrl.mockRejectedValue(new Error('仓库不可达'))

    await renderDialog()
    await waitFor(() => expect(mocks.getPluginVersionOverview).toHaveBeenCalled())

    await chooseAnchorStrategy()

    expect(await screen.findByTestId('clone-version-1.1.0')).toBeInTheDocument()
  })

  it('lists an uninstalled clone so it can be restored by id', async () => {
    // 卸载只把启用位置假、那一行留着；按 ID 挑回来比按后缀去猜有没有残留可靠得多
    mocks.getPluginRestorableInstances.mockResolvedValue([
      {
        instance_id: 'DemoPluginwork',
        suffix: 'work',
        plugin_name: '工作实例',
        pinned_version: '1.0.0',
        has_config: true,
        has_data: false,
      },
    ])

    const { emitted } = await renderDialog()
    await waitFor(() => expect(mocks.getPluginRestorableInstances).toHaveBeenCalledWith('DemoPlugin'))

    await fireEvent.click(await screen.findByTestId('clone-mode-restore'))
    await fireEvent.click(await screen.findByTestId('clone-restorable-DemoPluginwork'))
    await fireEvent.click(screen.getByTestId('clone-submit'))

    await waitFor(() => expect(emitted().clone).toBeTruthy())
    // 恢复时展示信息与锚定版本一律留空，交给服务端沿用那一行上留存的设置
    expect((emitted().clone[0] as unknown[])[0]).toMatchObject({
      suffix: 'work',
      name: '',
      pinned_version: null,
      restore_previous: true,
    })
  })

  it('hides the restore mode when no clone is waiting to come back', async () => {
    // 没有可恢复的分身时摆一个空模式出来，只会让人以为功能坏了
    await renderDialog()
    await waitFor(() => expect(mocks.getPluginRestorableInstances).toHaveBeenCalled())

    expect(screen.queryByTestId('clone-mode-restore')).not.toBeInTheDocument()
  })

  it('does not inherit leftovers when creating a brand new clone', async () => {
    // 全新创建撞上同 ID 的残留数据时不该静默沿用，那不是用户要的「新建」
    const { emitted } = await renderDialog()
    await waitFor(() => expect(mocks.getPluginVersionOverview).toHaveBeenCalled())

    await fireEvent.click(screen.getByTestId('clone-submit'))

    await waitFor(() => expect(emitted().clone).toBeTruthy())
    expect((emitted().clone[0] as unknown[])[0]).toMatchObject({ restore_previous: false })
  })
})
