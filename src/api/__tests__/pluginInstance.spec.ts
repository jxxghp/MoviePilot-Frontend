import { createScopedPluginApi } from '@/api/pluginInstance'
import type { PluginApiClient } from '@/api/client'
import { describe, expect, it, vi } from 'vitest'

/** 创建可调用且带 Axios 风格方法的最小插件客户端。 */
function createClient() {
  const client = Object.assign(vi.fn(), {
    get: vi.fn(),
    post: vi.fn(),
    request: vi.fn(),
  })
  return client as unknown as PluginApiClient
}

describe('createScopedPluginApi', () => {
  it('rewrites only the source plugin dynamic API namespace', () => {
    const client = createClient()
    const scoped = createScopedPluginApi(client, 'DemoPluginwork', 'DemoPlugin')

    void scoped.get('plugin/DemoPlugin/items')
    void scoped.post('/api/v1/plugin/demoplugin/action?sync=1', { value: 1 })
    void scoped.get('system/config')

    expect(client.get).toHaveBeenNthCalledWith(1, 'plugin/DemoPluginwork/items')
    expect(client.post).toHaveBeenCalledWith(
      '/api/v1/plugin/DemoPluginwork/action?sync=1',
      { value: 1 },
    )
    expect(client.get).toHaveBeenNthCalledWith(2, 'system/config')
  })

  it('supports callable and request-config forms without mutating input', () => {
    const client = createClient()
    const scoped = createScopedPluginApi(client, 'DemoPluginhome', 'DemoPlugin')
    const config = { url: '/plugin/DemoPlugin/status', method: 'GET' }

    void scoped(config)
    void scoped.request(config)

    expect(client).toHaveBeenCalledWith({
      url: '/plugin/DemoPluginhome/status',
      method: 'GET',
    })
    expect(client.request).toHaveBeenCalledWith({
      url: '/plugin/DemoPluginhome/status',
      method: 'GET',
    })
    expect(config.url).toBe('/plugin/DemoPlugin/status')
  })

  it('returns the original client for ordinary plugins', () => {
    const client = createClient()

    expect(createScopedPluginApi(client, 'DemoPlugin')).toBe(client)
    expect(createScopedPluginApi(client, 'DemoPlugin', 'DemoPlugin')).toBe(client)
  })
})
