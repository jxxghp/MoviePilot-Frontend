import { ApiRequestError } from '@/api/client'
import {
  clearPluginInstanceDefaultTarget,
  getInstalledPlugins,
  setPluginInstanceDefaultTarget,
  setPluginInstanceEnabled,
} from '@/api/pluginInstanceManage'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  apiDelete: vi.fn(),
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiPut: vi.fn(),
}))

vi.mock('@/api', () => ({
  default: createDataApiMock({
    delete: (...args: unknown[]) => mocks.apiDelete(...args),
    get: (...args: unknown[]) => mocks.apiGet(...args),
    post: (...args: unknown[]) => mocks.apiPost(...args),
    put: (...args: unknown[]) => mocks.apiPut(...args),
  }),
}))

describe('plugin instance management API adapters', () => {
  beforeEach(() => {
    mocks.apiDelete.mockReset().mockResolvedValue(undefined)
    mocks.apiGet.mockReset()
    mocks.apiPost.mockReset().mockResolvedValue(undefined)
    mocks.apiPut.mockReset().mockResolvedValue(undefined)
  })

  it('设置与清除默认调用目标时按插件与实例 ID 请求 default_target 端点', async () => {
    await setPluginInstanceDefaultTarget('DemoPlugin', 'DemoPluginwork')
    await clearPluginInstanceDefaultTarget('DemoPlugin', 'DemoPluginwork')

    expect(mocks.apiPut).toHaveBeenCalledWith('plugin/instances/DemoPlugin/DemoPluginwork/default_target')
    expect(mocks.apiDelete).toHaveBeenCalledWith('plugin/instances/DemoPlugin/DemoPluginwork/default_target')
  })

  it('实例 ID 里的特殊字符不会改变默认调用目标的请求路径层级', async () => {
    await setPluginInstanceDefaultTarget('Demo Plugin', 'Demo/work')

    expect(mocks.apiPut).toHaveBeenCalledWith('plugin/instances/Demo%20Plugin/Demo%2Fwork/default_target')
  })

  it('启停实例时把目标状态放进请求体，本体与分身共用同一个入口', async () => {
    await setPluginInstanceEnabled('DemoPluginwork', false)
    await setPluginInstanceEnabled('DemoPluginwork', true)

    expect(mocks.apiPost).toHaveBeenNthCalledWith(1, 'plugin/instance/DemoPluginwork/enabled', { enabled: false })
    expect(mocks.apiPost).toHaveBeenNthCalledWith(2, 'plugin/instance/DemoPluginwork/enabled', { enabled: true })
  })

  it('读取已安装插件清单时按已安装状态过滤', async () => {
    mocks.apiGet.mockResolvedValue([{ id: 'DemoPlugin', plugin_name: '演示插件', is_default_target: true }])

    const plugins = await getInstalledPlugins()

    expect(mocks.apiGet).toHaveBeenCalledWith('plugin/', { params: { state: 'installed' } })
    expect(plugins[0].is_default_target).toBe(true)
  })

  it('不吞掉后端业务失败，调用方仍可捕获 ApiRequestError', async () => {
    mocks.apiPost.mockResolvedValueOnce({ success: false, message: '实例不存在或已处于停用状态', data: null })

    const error = await setPluginInstanceEnabled('Missing', false).catch(reason => reason)

    expect(error).toBeInstanceOf(ApiRequestError)
    expect(error).toMatchObject({ message: '实例不存在或已处于停用状态', businessFailure: true })
  })
})
