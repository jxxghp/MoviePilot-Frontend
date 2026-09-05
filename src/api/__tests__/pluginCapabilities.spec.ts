import { getPluginRuntimeCapabilities } from '@/api/pluginCapabilities'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ apiGet: vi.fn(), apiPost: vi.fn() }))

vi.mock('@/api', () => ({
  default: createDataApiMock({
    get: (...args: unknown[]) => mocks.apiGet(...args),
    post: (...args: unknown[]) => mocks.apiPost(...args),
  }),
}))

describe('plugin runtime capability API adapter', () => {
  beforeEach(() => {
    mocks.apiGet.mockReset()
    mocks.apiPost.mockReset()
  })

  it('queries one plugin and keeps only safe display fields', async () => {
    mocks.apiGet.mockResolvedValueOnce({
      actions: [
        {
          plugin_id: ' DemoPlugin ',
          plugin_name: ' 演示插件 ',
          actions: [{ id: ' refresh ', name: ' 刷新 ', kwargs: { token: 'secret' } }],
          private: 'ignored',
        },
      ],
      commands: [{ cmd: ' /demo ', desc: ' 演示命令 ', data: { token: 'secret' } }],
      services: [{ id: ' daily ', name: ' 每日任务 ', trigger: ' cron ', kwargs: { token: 'secret' } }],
    })

    await expect(getPluginRuntimeCapabilities('DemoPlugin')).resolves.toEqual({
      actions: [
        {
          plugin_id: 'DemoPlugin',
          plugin_name: '演示插件',
          actions: [{ id: 'refresh', name: '刷新' }],
        },
      ],
      commands: [{ cmd: '/demo', desc: '演示命令' }],
      services: [{ id: 'daily', name: '每日任务', trigger: 'cron' }],
    })
    expect(mocks.apiGet).toHaveBeenCalledWith('plugin/runtime/capabilities', {
      params: { plugin_id: 'DemoPlugin' },
    })
  })

  it('drops malformed entries and empty action groups', async () => {
    mocks.apiGet.mockResolvedValueOnce({
      actions: [{ actions: [{ name: 'missing id' }] }, null],
      commands: [{ desc: 'missing cmd' }, null],
      services: [{ name: 'missing id' }, null],
    })

    await expect(getPluginRuntimeCapabilities('DemoPlugin')).resolves.toEqual({
      actions: [],
      commands: [],
      services: [],
    })
  })

  it('normalizes non-object responses to an empty snapshot', async () => {
    mocks.apiGet.mockResolvedValueOnce(null)

    await expect(getPluginRuntimeCapabilities('DemoPlugin')).resolves.toEqual({
      actions: [],
      commands: [],
      services: [],
    })
  })

  it('reloads a plugin through POST without a request body', async () => {
    const { reloadPluginRuntime } = await import('@/api/pluginCapabilities')
    mocks.apiPost.mockResolvedValueOnce(undefined)

    await reloadPluginRuntime('Demo Plugin')

    expect(mocks.apiPost).toHaveBeenCalledWith('plugin/reload/Demo%20Plugin')
  })
})
