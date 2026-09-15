import {
  changePluginSource,
  getPluginSourceOptions,
  installPluginFromSource,
  requiresExplicitPluginSourceInstall,
} from '@/api/pluginSource'
import { ApiRequestError } from '@/api/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
}))

vi.mock('@/api', () => ({
  default: createDataApiMock({
    get: (...args: unknown[]) => mocks.apiGet(...args),
    post: (...args: unknown[]) => mocks.apiPost(...args),
  }),
}))

describe('plugin source selection rules', () => {
  const candidate = {
    source_type: 'third_party' as const,
    source_key: 'github:example/plugins',
    repo_url: 'https://github.com/example/plugins',
    package_generation: 'v3' as const,
    plugin_version: '2.0.0',
  }

  it('allows choosing another online source when the historical binding is no longer available', () => {
    expect(
      requiresExplicitPluginSourceInstall(
        {
          plugin_id: 'DemoPlugin',
          inventory_complete: true,
          selection_status: 'incomplete',
          selection_reason: '已绑定仓库不可用',
          identity: {
            plugin_id: 'DemoPlugin',
            trusted_source_type: 'third_party',
            trusted_source_key: 'github:removed/plugins',
            binding_basis: 'explicit_install',
            payload_source_type: 'third_party',
            payload_source_key: 'github:removed/plugins',
            revision: 3,
          },
          candidates: [candidate],
        },
        false,
      ),
    ).toBe(true)
  })

  it('does not force source selection when the bound online source remains available', () => {
    expect(
      requiresExplicitPluginSourceInstall(
        {
          plugin_id: 'DemoPlugin',
          inventory_complete: true,
          selection_status: 'incomplete',
          selection_reason: '来源目录仍在刷新',
          identity: {
            plugin_id: 'DemoPlugin',
            trusted_source_type: 'third_party',
            trusted_source_key: candidate.source_key,
            binding_basis: 'explicit_install',
            payload_source_type: 'third_party',
            payload_source_key: candidate.source_key,
            revision: 3,
          },
          candidates: [candidate],
        },
        false,
      ),
    ).toBe(false)
  })
})

describe('plugin source API adapters', () => {
  beforeEach(() => {
    mocks.apiGet.mockReset()
    mocks.apiPost.mockReset()
    mocks.apiGet.mockResolvedValue({
      plugin_id: 'DemoPlugin',
      inventory_complete: true,
      selection_status: 'selected',
      selection_reason: '',
      identity: null,
      candidates: [],
    })
    mocks.apiPost.mockResolvedValue(undefined)
  })

  it('查询来源候选时编码插件 ID，并按需传递强制刷新参数', async () => {
    await getPluginSourceOptions('Demo Plugin', true)

    expect(mocks.apiGet).toHaveBeenCalledWith('plugin/source/Demo%20Plugin/options', { params: { force: true } })
  })

  it('默认查询不伪造 force 参数', async () => {
    await getPluginSourceOptions('DemoPlugin')

    expect(mocks.apiGet).toHaveBeenCalledWith('plugin/source/DemoPlugin/options')
  })

  it('按明确来源安装和 CAS 换源分别发送对应请求体', async () => {
    const installRequest = {
      repo_url: 'https://github.com/example/plugins',
      release_version: '1.2.3',
      force: true,
    }
    const changeRequest = {
      repo_url: 'https://github.com/other/plugins',
      expected_revision: 7,
      release_version: null,
    }

    await installPluginFromSource('DemoPlugin', installRequest)
    await changePluginSource('DemoPlugin', changeRequest)

    expect(mocks.apiPost).toHaveBeenNthCalledWith(1, 'plugin/source/DemoPlugin/install', installRequest)
    expect(mocks.apiPost).toHaveBeenNthCalledWith(2, 'plugin/source/DemoPlugin', changeRequest)
  })

  it('不吞掉后端业务失败，调用方仍可捕获 ApiRequestError', async () => {
    mocks.apiPost.mockResolvedValueOnce({
      success: false,
      message: '来源 revision 已变化，请重新确认',
      data: null,
    })

    const error = await installPluginFromSource('DemoPlugin', {
      repo_url: 'https://github.com/example/plugins',
    }).catch(reason => reason)

    expect(error).toBeInstanceOf(ApiRequestError)
    expect(error).toMatchObject({
      message: '来源 revision 已变化，请重新确认',
      businessFailure: true,
    })
  })
})
