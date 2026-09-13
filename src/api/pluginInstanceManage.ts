import api from './index'
import type { Plugin, PluginInstanceEnabledRequest } from './types'

/**
 * 设置指定插件实例为默认调用目标，后端在同一事务里清除同插件的旧默认。
 *
 * 只认源插件 ID：后端对分身自身的实例 ID 直接拒绝。同一插件至多一个默认调用目标由
 * 条件唯一索引在库层强制，两个实例被并发置为默认时后到的那次以 409 收场。
 */
export function setPluginInstanceDefaultTarget(pluginId: string, instanceId: string): Promise<null> {
  return api.put<null>(
    `plugin/instances/${encodeURIComponent(pluginId)}/${encodeURIComponent(instanceId)}/default_target`,
    undefined,
    { feedback: 'silent' },
  )
}

/** 清除指定插件实例的默认调用目标置位；当前置位的不是该实例时为空操作。 */
export function clearPluginInstanceDefaultTarget(pluginId: string, instanceId: string): Promise<null> {
  return api.delete<null>(
    `plugin/instances/${encodeURIComponent(pluginId)}/${encodeURIComponent(instanceId)}/default_target`,
    { feedback: 'silent' },
  )
}

/**
 * 启用或停用一个插件实例，本体与分身共用这一个入口。
 *
 * 停用只把启用位置假：配置与展示信息原样留在那一行，再次启用即恢复，因而它与删除
 * 是两件事——只有删行才会真的清掉这些设置。
 */
export function setPluginInstanceEnabled(instanceId: string, enabled: boolean): Promise<null> {
  const request: PluginInstanceEnabledRequest = { enabled }
  return api.post<null>(`plugin/instance/${encodeURIComponent(instanceId)}/enabled`, request, {
    feedback: 'silent',
  })
}

/**
 * 读取全部已安装插件，本体与在册分身各占一条。
 *
 * 实例设置接口的回执只带实例 ID，实例的展示名与默认调用目标置位都只在这份清单上。
 */
export function getInstalledPlugins(): Promise<Plugin[]> {
  return api.get<Plugin[]>('plugin/', { params: { state: 'installed' }, feedback: 'silent' })
}
