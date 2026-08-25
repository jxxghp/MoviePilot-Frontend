import DialogCloseBtn from '@/@core/components/DialogCloseBtn.vue'
import type { Plugin, PluginReleaseVersionsResponse, PluginSourceOptions } from '@/api/types'
import PluginVersionHistoryDialog from '@/components/dialog/PluginVersionHistoryDialog.vue'
import { renderWithProviders } from '@tests/support/render'
import { fireEvent, screen, waitFor } from '@testing-library/vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
}))

vi.mock('@/api', () => ({
  default: { get: mocks.apiGet },
}))

const installedPlugin: Plugin = {
  id: 'DemoPlugin',
  plugin_name: '演示插件',
  plugin_version: '1.0.0',
  repo_url: 'https://github.com/example/plugins',
  installed: true,
  release: true,
}

const releases: PluginReleaseVersionsResponse = {
  release_supported: true,
  latest_version: '2.0.0',
  current_version: '1.0.0',
  items: [
    {
      version: '2.0.0',
      tag_name: 'v2.0.0',
      body: '最新说明',
      published_at: '2026-08-01T00:00:00Z',
      is_latest: true,
      is_current: false,
    },
    {
      version: '1.0.0',
      tag_name: 'v1.0.0',
      body: '当前说明',
      is_latest: false,
      is_current: true,
    },
    {
      version: '0.9.0',
      tag_name: 'v0.9.0',
      body: '旧版说明',
      published_at: 'invalid-date',
      is_latest: false,
      is_current: false,
    },
  ],
}

const sourceOptions: PluginSourceOptions = {
  plugin_id: 'DemoPlugin',
  inventory_complete: true,
  selection_status: 'selected',
  selection_reason: '按已绑定来源选择在线载荷',
  identity: {
    plugin_id: 'DemoPlugin',
    trusted_source_type: 'third_party',
    trusted_source_key: 'github:example/plugins',
    binding_basis: 'tofu',
    payload_source_type: 'third_party',
    payload_source_key: 'github:example/plugins',
    revision: 3,
  },
  candidates: [
    {
      source_type: 'third_party',
      source_key: 'github:example/plugins',
      repo_url: 'https://github.com/example/plugins',
      package_generation: 'v3',
      plugin_version: '2.0.0',
    },
  ],
}

async function renderDialog(props: Record<string, unknown>) {
  return renderWithProviders(PluginVersionHistoryDialog, {
    props,
    global: { components: { VDialogCloseBtn: DialogCloseBtn } },
  })
}

describe('PluginVersionHistoryDialog', () => {
  beforeEach(() => {
    mocks.apiGet.mockReset().mockImplementation((url: string) => {
      if (url === 'plugin/history/DemoPlugin') {
        return Promise.resolve({ ...installedPlugin, history: { 'v1.0.0': '当前更新说明' } })
      }
      if (url === 'plugin/source/DemoPlugin/options') return Promise.resolve(sourceOptions)
      if (url === 'plugin/releases/DemoPlugin') return Promise.resolve(releases)
      throw new Error(`Unexpected request: ${url}`)
    })
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  it('loads installed history and releases, marks versions, and emits exact update arguments', async () => {
    const { emitted } = await renderDialog({
      modelValue: true,
      plugin: installedPlugin,
      showUpdateAction: true,
      actionMode: 'update',
    })

    expect(await screen.findByText('v2.0.0')).toBeInTheDocument()
    expect(screen.getByText('最新')).toBeInTheDocument()
    expect(screen.getByText('当前')).toBeInTheDocument()
    expect(screen.getByText('invalid-date')).toBeInTheDocument()
    expect(mocks.apiGet).toHaveBeenNthCalledWith(1, 'plugin/history/DemoPlugin', {
      params: { force: true },
    })
    expect(mocks.apiGet).toHaveBeenNthCalledWith(2, 'plugin/source/DemoPlugin/options', {
      feedback: 'silent',
    })
    expect(mocks.apiGet).toHaveBeenNthCalledWith(3, 'plugin/releases/DemoPlugin', {
      params: {
        force: true,
        repo_url: 'https://github.com/example/plugins',
      },
    })

    await fireEvent.click(screen.getByRole('button', { name: '安装' }))
    expect(emitted().update).toEqual([['0.9.0', 'https://github.com/example/plugins']])

    await fireEvent.click(screen.getByRole('button', { name: '更新到最新版本' }))
    expect(emitted().update).toEqual([
      ['0.9.0', 'https://github.com/example/plugins'],
      [undefined, 'https://github.com/example/plugins'],
    ])
  })

  it('uses market metadata directly and emits latest installation without a release version', async () => {
    const marketPlugin = { ...installedPlugin, installed: false, history: {} }
    const { emitted } = await renderDialog({
      modelValue: true,
      plugin: marketPlugin,
      actionMode: 'install',
    })

    expect(await screen.findByText('v2.0.0')).toBeInTheDocument()
    expect(mocks.apiGet).not.toHaveBeenCalledWith('plugin/history/DemoPlugin', expect.anything())
    expect(mocks.apiGet).toHaveBeenCalledWith('plugin/releases/DemoPlugin', {
      params: {
        force: false,
        repo_url: 'https://github.com/example/plugins',
      },
    })

    const installButtons = screen.getAllByRole('button', { name: '安装' })
    await fireEvent.click(installButtons[0])
    expect(emitted().update).toEqual([[undefined, 'https://github.com/example/plugins']])
  })

  it('uses the bound online source without sending a local repository path', async () => {
    const localRepoUrl = 'local://DemoPlugin?path=%2FUsers%2Fdemo%2Fplugins'
    mocks.apiGet.mockImplementation((url: string) => {
      if (url === 'plugin/history/DemoPlugin') {
        return Promise.resolve({ ...installedPlugin, repo_url: localRepoUrl, history: {} })
      }
      if (url === 'plugin/source/DemoPlugin/options') {
        return Promise.resolve({
          ...sourceOptions,
          identity: {
            ...sourceOptions.identity!,
            payload_source_type: 'local',
            payload_source_key: null,
          },
        } satisfies PluginSourceOptions)
      }
      if (url === 'plugin/releases/DemoPlugin') return Promise.resolve(releases)
      throw new Error(`Unexpected request: ${url}`)
    })

    await renderDialog({
      modelValue: true,
      plugin: { ...installedPlugin, repo_url: localRepoUrl },
      actionMode: 'update',
    })

    expect(await screen.findByText('v2.0.0')).toBeInTheDocument()
    expect(mocks.apiGet).toHaveBeenCalledWith('plugin/releases/DemoPlugin', {
      params: {
        force: true,
        repo_url: 'https://github.com/example/plugins',
      },
    })
    expect(mocks.apiGet.mock.calls.some(([, options]) => JSON.stringify(options).includes(localRepoUrl))).toBe(false)
  })

  it('distinguishes a Release request failure from an empty history', async () => {
    mocks.apiGet.mockRejectedValue(new Error('release unavailable'))
    await renderDialog({
      modelValue: true,
      plugin: { ...installedPlugin, installed: false, history: {} },
      actionMode: 'install',
    })

    expect(await screen.findByText('Release 版本加载失败')).toBeInTheDocument()
    expect(screen.queryByText('暂未获取到更新说明')).not.toBeInTheDocument()
  })

  it('shows history request failures and true empty history as different states', async () => {
    mocks.apiGet.mockRejectedValueOnce(new Error('history unavailable'))
    const failed = await renderDialog({
      modelValue: true,
      plugin: installedPlugin,
    })
    expect(await screen.findByText('读取更新说明失败，请稍后重试')).toBeInTheDocument()
    failed.unmount()

    mocks.apiGet.mockReset().mockResolvedValue({ ...installedPlugin, release: false, history: {} })
    await renderDialog({
      modelValue: true,
      plugin: installedPlugin,
    })
    expect(await screen.findByText('暂未获取到更新说明')).toBeInTheDocument()
  })

  it('closes through the model contract', async () => {
    const { emitted } = await renderDialog({
      modelValue: true,
      plugin: installedPlugin,
    })

    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
    const closeButton = document.querySelector<HTMLButtonElement>('.absolute.right-3.top-3')
    expect(closeButton).not.toBeNull()
    await fireEvent.click(closeButton!)

    expect(emitted()['update:modelValue']).toContainEqual([false])
    expect(emitted().close).toHaveLength(1)
  })
})
