import {
  clearPluginInstanceDefaultTarget,
  clearPluginInstanceLogLevel,
  getPluginInstanceLogLevels,
  getPluginVersionOverview,
  recyclePluginVersions,
  setPluginInstanceDefaultTarget,
  setPluginInstanceLogLevel,
  setPluginInstanceVersion,
} from '@/api/pluginVersion'
import { ApiRequestError } from '@/api/client'
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

describe('plugin version API adapters', () => {
  beforeEach(() => {
    mocks.apiDelete.mockReset().mockResolvedValue(undefined)
    mocks.apiGet.mockReset()
    mocks.apiPost.mockReset().mockResolvedValue(undefined)
    mocks.apiPut.mockReset().mockResolvedValue(undefined)
  })

  it('查询版本总览时编码插件 ID 并静默反馈', async () => {
    mocks.apiGet.mockResolvedValue({
      plugin_id: 'Demo Plugin',
      current_version: '1.0.0',
      installed_versions: [],
      instances: [],
    })

    await getPluginVersionOverview('Demo Plugin')

    expect(mocks.apiGet).toHaveBeenCalledWith('plugin/versions/Demo%20Plugin')
  })

  it('设置实例版本绑定时按插件与实例 ID 拼接路径并透传请求体', async () => {
    await setPluginInstanceVersion('DemoPlugin', 'DemoPluginwork', {
      follow_current_version: false,
      plugin_version: '1.2.0',
    })

    expect(mocks.apiPut).toHaveBeenCalledWith('plugin/versions/DemoPlugin/DemoPluginwork', {
      follow_current_version: false,
      plugin_version: '1.2.0',
    })
  })

  it('触发版本回收时请求 recycle 端点', async () => {
    mocks.apiPost.mockResolvedValue({ removed: ['0.9.0'], kept: { '1.0.0': '仍被实例引用' } })

    const outcome = await recyclePluginVersions('DemoPlugin')

    expect(mocks.apiPost).toHaveBeenCalledWith('plugin/versions/DemoPlugin/recycle')
    expect(outcome).toEqual({ removed: ['0.9.0'], kept: { '1.0.0': '仍被实例引用' } })
  })

  it('查询与设置日志等级时正确拼接实例路径', async () => {
    mocks.apiGet.mockResolvedValue({ plugin_id: 'DemoPlugin', instances: [] })

    await getPluginInstanceLogLevels('DemoPlugin')
    await setPluginInstanceLogLevel('DemoPlugin', 'DemoPluginwork', {
      level: 'DEBUG',
      expires_at: '2026-09-10T00:00:00.000Z',
    })
    await clearPluginInstanceLogLevel('DemoPlugin', 'DemoPluginwork')

    expect(mocks.apiGet).toHaveBeenCalledWith('plugin/loglevel/DemoPlugin')
    expect(mocks.apiPut).toHaveBeenCalledWith('plugin/loglevel/DemoPlugin/DemoPluginwork', {
      level: 'DEBUG',
      expires_at: '2026-09-10T00:00:00.000Z',
    })
    expect(mocks.apiDelete).toHaveBeenCalledWith('plugin/loglevel/DemoPlugin/DemoPluginwork')
  })

  it('设置与清除默认调用目标时请求 default_target 端点', async () => {
    await setPluginInstanceDefaultTarget('DemoPlugin', 'DemoPluginwork')
    await clearPluginInstanceDefaultTarget('DemoPlugin', 'DemoPluginwork')

    expect(mocks.apiPut).toHaveBeenCalledWith('plugin/instances/DemoPlugin/DemoPluginwork/default_target')
    expect(mocks.apiDelete).toHaveBeenCalledWith('plugin/instances/DemoPlugin/DemoPluginwork/default_target')
  })

  it('不吞掉后端业务失败，调用方仍可捕获 ApiRequestError', async () => {
    mocks.apiPut.mockResolvedValueOnce({
      success: false,
      message: '实例不存在',
      data: null,
    })

    const error = await setPluginInstanceVersion('DemoPlugin', 'Missing', {
      follow_current_version: true,
      plugin_version: null,
    }).catch(reason => reason)

    expect(error).toBeInstanceOf(ApiRequestError)
    expect(error).toMatchObject({ message: '实例不存在', businessFailure: true })
  })
})
