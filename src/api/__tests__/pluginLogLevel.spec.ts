import { ApiRequestError } from '@/api/client'
import {
  clearPluginInstanceLogLevel,
  getPluginInstanceLogLevels,
  setPluginInstanceLogLevel,
} from '@/api/pluginLogLevel'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  apiDelete: vi.fn(),
  apiGet: vi.fn(),
  apiPut: vi.fn(),
}))

vi.mock('@/api', () => ({
  default: createDataApiMock({
    delete: (...args: unknown[]) => mocks.apiDelete(...args),
    get: (...args: unknown[]) => mocks.apiGet(...args),
    put: (...args: unknown[]) => mocks.apiPut(...args),
  }),
}))

describe('plugin instance log level API adapters', () => {
  beforeEach(() => {
    mocks.apiDelete.mockReset().mockResolvedValue(undefined)
    mocks.apiGet.mockReset()
    mocks.apiPut.mockReset().mockResolvedValue(undefined)
  })

  it('查询日志等级总览时编码插件 ID 并原样返回实例条目', async () => {
    mocks.apiGet.mockResolvedValue({
      plugin_id: 'Demo Plugin',
      instances: [{ instance_id: 'Demo Plugin', configured_level: null, expires_at: null, effective_level: 'INFO' }],
    })

    const overview = await getPluginInstanceLogLevels('Demo Plugin')

    expect(mocks.apiGet).toHaveBeenCalledWith('plugin/loglevel/Demo%20Plugin')
    expect(overview.instances).toHaveLength(1)
    expect(overview.instances[0].effective_level).toBe('INFO')
  })

  it('设置覆盖时按插件与实例 ID 拼接路径并透传请求体', async () => {
    await setPluginInstanceLogLevel('DemoPlugin', 'DemoPluginwork', {
      level: 'DEBUG',
      expires_at: '2026-09-10T00:00:00.000Z',
    })

    expect(mocks.apiPut).toHaveBeenCalledWith('plugin/loglevel/DemoPlugin/DemoPluginwork', {
      level: 'DEBUG',
      expires_at: '2026-09-10T00:00:00.000Z',
    })
  })

  it('实例 ID 里的特殊字符不会改变请求路径的层级', async () => {
    await clearPluginInstanceLogLevel('DemoPlugin', 'Demo/work')

    expect(mocks.apiDelete).toHaveBeenCalledWith('plugin/loglevel/DemoPlugin/Demo%2Fwork')
  })

  it('不吞掉后端业务失败，调用方仍可捕获 ApiRequestError', async () => {
    mocks.apiPut.mockResolvedValueOnce({ success: false, message: '实例不存在', data: null })

    const error = await setPluginInstanceLogLevel('DemoPlugin', 'Missing', { level: 'DEBUG' }).catch(reason => reason)

    expect(error).toBeInstanceOf(ApiRequestError)
    expect(error).toMatchObject({ message: '实例不存在', businessFailure: true })
  })
})
