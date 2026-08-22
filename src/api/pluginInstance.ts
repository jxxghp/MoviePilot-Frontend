import type { AxiosRequestConfig } from 'axios'
import type { PluginApiClient } from './client'

const URL_METHODS = new Set([
  'delete',
  'get',
  'head',
  'options',
  'patch',
  'patchForm',
  'post',
  'postForm',
  'put',
  'putForm',
])

/** 转义插件 ID，避免其进入正则表达式后改变路径匹配语义。 */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** 把源插件动态 API 路径映射到当前虚拟实例的服务端命名空间。 */
function rewritePluginUrl(url: string, instanceId: string, sourcePluginId: string): string {
  if (!instanceId || !sourcePluginId || instanceId === sourcePluginId) return url
  const sourcePattern = new RegExp(
    `(^|/)plugin/${escapeRegExp(sourcePluginId)}(?=/|[?#]|$)`,
    'i',
  )
  return url.replace(sourcePattern, `$1plugin/${instanceId}`)
}

/** 复制请求配置并改写其中的 URL，避免修改远程插件持有的原对象。 */
function rewriteRequestConfig(
  config: AxiosRequestConfig,
  instanceId: string,
  sourcePluginId: string,
): AxiosRequestConfig {
  if (typeof config.url !== 'string') return config
  return {
    ...config,
    url: rewritePluginUrl(config.url, instanceId, sourcePluginId),
  }
}

/**
 * 创建实例作用域 API。
 *
 * 仅改写插件自己的动态 API 前缀，其余系统 API 和 Axios 能力保持原合同，
 * 因而无需要求存量联邦插件改造路径拼接方式。
 */
export function createScopedPluginApi(
  client: PluginApiClient,
  instanceId: string,
  sourcePluginId?: string,
): PluginApiClient {
  if (!sourcePluginId || instanceId === sourcePluginId) return client

  return new Proxy(client, {
    apply(target, thisArg, argumentList: unknown[]) {
      const [request, ...rest] = argumentList
      const rewritten =
        typeof request === 'string'
          ? rewritePluginUrl(request, instanceId, sourcePluginId)
          : request && typeof request === 'object'
            ? rewriteRequestConfig(request as AxiosRequestConfig, instanceId, sourcePluginId)
            : request
      return Reflect.apply(target, thisArg, [rewritten, ...rest])
    },
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver)
      if (typeof property !== 'string' || typeof value !== 'function') return value
      if (property === 'request') {
        return (config: AxiosRequestConfig) =>
          value.call(target, rewriteRequestConfig(config, instanceId, sourcePluginId))
      }
      if (URL_METHODS.has(property)) {
        return (url: string, ...args: unknown[]) =>
          value.call(target, rewritePluginUrl(url, instanceId, sourcePluginId), ...args)
      }
      return value.bind(target)
    },
  }) as PluginApiClient
}
