import { fetchPluginReleaseVersions, isOnlinePluginRepoUrl, resolveTrustedReleaseRepoUrl } from '@/api/pluginRelease'
import type { PluginSourceOptions } from '@/api/types'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
}))

vi.mock('@/api', () => ({
  default: createDataApiMock({
    get: (...args: unknown[]) => mocks.apiGet(...args),
  }),
}))

const trustedOptions: PluginSourceOptions = {
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
      source_type: 'local',
      source_key: null,
      repo_url: 'local://DemoPlugin',
      package_generation: 'v3',
      plugin_version: '2.1.0',
    },
    {
      source_type: 'official',
      source_key: 'github:official/plugins',
      repo_url: 'https://github.com/official/plugins',
      package_generation: 'v3',
      plugin_version: '1.9.0',
    },
    {
      source_type: 'third_party',
      source_key: 'github:example/plugins',
      repo_url: 'https://github.com/example/plugins',
      package_generation: 'v3',
      plugin_version: '2.0.0',
    },
  ],
}

describe('plugin release API adapters', () => {
  beforeEach(() => {
    mocks.apiGet.mockReset()
    mocks.apiGet.mockResolvedValue(trustedOptions)
  })

  it('只认在线仓库地址，本地载荷路径不进入网络请求', () => {
    expect(isOnlinePluginRepoUrl('https://github.com/example/plugins')).toBe(true)
    expect(isOnlinePluginRepoUrl('local://DemoPlugin')).toBe(false)
    expect(isOnlinePluginRepoUrl('')).toBe(false)
    expect(isOnlinePluginRepoUrl(null)).toBe(false)
    expect(isOnlinePluginRepoUrl(undefined)).toBe(false)
  })

  it('按已绑定的可信来源解析仓库地址，并把来源选项交回调用方', async () => {
    const { repoUrl, options } = await resolveTrustedReleaseRepoUrl('DemoPlugin')

    expect(mocks.apiGet).toHaveBeenCalledWith('plugin/source/DemoPlugin/options')
    expect(repoUrl).toBe('https://github.com/example/plugins')
    expect(options).toBe(trustedOptions)
  })

  it('身份尚未绑定可信来源时不挑选任何候选仓库', async () => {
    mocks.apiGet.mockResolvedValue({
      ...trustedOptions,
      identity: { ...trustedOptions.identity!, trusted_source_type: 'unknown', trusted_source_key: null },
    })

    const { repoUrl, options } = await resolveTrustedReleaseRepoUrl('DemoPlugin')

    expect(repoUrl).toBeNull()
    expect(options.candidates).toHaveLength(3)
  })

  it('可信来源键只指向本地载荷路径时不回退到别的候选', async () => {
    mocks.apiGet.mockResolvedValue({
      ...trustedOptions,
      candidates: [
        {
          source_type: 'third_party',
          source_key: 'github:example/plugins',
          repo_url: 'local://DemoPlugin',
          package_generation: 'v3',
          plugin_version: '2.0.0',
        },
        trustedOptions.candidates[1],
      ],
    })

    const { repoUrl } = await resolveTrustedReleaseRepoUrl('DemoPlugin')

    expect(repoUrl).toBeNull()
  })

  it('拉取 Release 版本列表时编码插件 ID，并透传仓库地址与强制刷新', async () => {
    mocks.apiGet.mockResolvedValue({ release_supported: true, items: [] })

    await fetchPluginReleaseVersions('Demo Plugin', 'https://github.com/example/plugins', true)
    await fetchPluginReleaseVersions('DemoPlugin', 'https://github.com/example/plugins')

    expect(mocks.apiGet).toHaveBeenNthCalledWith(1, 'plugin/releases/Demo%20Plugin', {
      params: { repo_url: 'https://github.com/example/plugins', force: true },
    })
    expect(mocks.apiGet).toHaveBeenNthCalledWith(2, 'plugin/releases/DemoPlugin', {
      params: { repo_url: 'https://github.com/example/plugins', force: false },
    })
  })
})
