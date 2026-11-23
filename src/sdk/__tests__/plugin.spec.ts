import { describe, expect, it, vi } from 'vitest'
import { createPluginHostSDK, isPluginHostSDK, PLUGIN_SUBSCRIPTION_ACTIONS, type PluginAPI } from '../plugin'

/** 无网络的完整请求接口，方便检验实例切换是否仍使用旧客户端。 */
function api(): PluginAPI {
  return { get: vi.fn(), delete: vi.fn(), head: vi.fn(), options: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn() }
}

describe('联邦插件 SDK 契约', () => {
  it('只声明实际实现的能力，不根据主程序版本猜测订阅管理能力', () => {
    const sdk = createPluginHostSDK({ hostVersion: '99.0.0', context: () => ({ pluginId: 'a', surface: 'app' }), api })
    expect(isPluginHostSDK(sdk)).toBe(true)
    expect(sdk.supports('api')).toBe(true)
    expect(sdk.supports('subscription.manage')).toBe(false)
    expect(sdk.supports('subscription.manage.edit')).toBe(false)
    expect(sdk.supports('future.unknown')).toBe(false)
    expect(sdk.ui).toBeUndefined()
    for (const capability of ['environment', 'preferences', 'events', 'media.select', 'workflows', 'shell.tabs'])
      expect(sdk.supports(capability)).toBe(false)
  })

  it('SDK 对象保持稳定，身份与实例 API 随宿主切换', () => {
    let pluginId = 'clone-a'
    let client = api()
    const original = client
    const sdk = createPluginHostSDK({
      hostVersion: '3.2.4',
      context: () => ({ pluginId, sourcePluginId: 'source', surface: 'page' }),
      api: () => client,
    })
    const context = sdk.context
    pluginId = 'clone-b'
    client = api()
    expect(context.pluginId).toBe('clone-a')
    expect(sdk.context.pluginId).toBe('clone-b')
    expect(sdk.api).toBe(client)
    expect(sdk.api).not.toBe(original)
    expect(Object.isFrozen(sdk.context)).toBe(true)
    expect(Reflect.set(sdk, 'apiVersion', 2)).toBe(false)
    expect(Object.isFrozen(sdk.capabilities)).toBe(true)
  })

  it('新增和现有订阅管理是独立能力，并逐项公开支持的动作', () => {
    const manage = vi.fn()
    const create = vi.fn()
    const sdk = createPluginHostSDK({
      hostVersion: '3.2.4',
      context: () => ({ pluginId: 'demo', surface: 'app' }),
      api,
      subscriptions: { create, manage },
    })
    expect(sdk.supports('subscription.create')).toBe(true)
    for (const action of PLUGIN_SUBSCRIPTION_ACTIONS) expect(sdk.supports(`subscription.manage.${action}`)).toBe(true)
    expect(sdk.subscriptions?.manage).toBe(manage)
    expect(sdk.subscriptions?.create).toBe(create)
  })

  it('旧宿主、未知 SDK 主版本和缺少必要字段的对象不能当作 v1 使用', () => {
    for (const value of [null, undefined, {}, { apiVersion: 2 }, { apiVersion: 1, supports: () => true }]) {
      expect(isPluginHostSDK(value)).toBe(false)
    }
  })
})
