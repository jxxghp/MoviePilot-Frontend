import api from './index'
import type {
  Plugin,
  PluginInstanceEnabledRequest,
  PluginInstanceLogLevelOverview,
  PluginInstancePurgeOutcome,
  PluginInstancePurgeRequest,
  PluginRestorableInstance,
  PluginInstanceLogLevelUpdateRequest,
  PluginInstanceVersionUpdateRequest,
  PluginVersionOverview,
  PluginVersionRecycleOutcome,
} from './types'

/** 查询插件已装版本列表与各实例的版本绑定情况。 */
export function getPluginVersionOverview(pluginId: string): Promise<PluginVersionOverview> {
  return api.get<PluginVersionOverview>(`plugin/versions/${encodeURIComponent(pluginId)}`, { feedback: 'silent' })
}

/** 设置指定插件实例的版本绑定，切换会触发该实例停止再启动。 */
export function setPluginInstanceVersion(
  pluginId: string,
  instanceId: string,
  request: PluginInstanceVersionUpdateRequest,
): Promise<null> {
  return api.put<null>(`plugin/versions/${encodeURIComponent(pluginId)}/${encodeURIComponent(instanceId)}`, request, {
    feedback: 'silent',
  })
}

/** 手动触发回收插件不再被引用、也不在最近版本窗口内的已装版本目录。 */
export function recyclePluginVersions(pluginId: string): Promise<PluginVersionRecycleOutcome> {
  return api.post<PluginVersionRecycleOutcome>(`plugin/versions/${encodeURIComponent(pluginId)}/recycle`, undefined, {
    feedback: 'silent',
  })
}

/** 查询插件全部实例（含本体）当前的日志等级设置。 */
export function getPluginInstanceLogLevels(pluginId: string): Promise<PluginInstanceLogLevelOverview> {
  return api.get<PluginInstanceLogLevelOverview>(`plugin/loglevel/${encodeURIComponent(pluginId)}`, {
    feedback: 'silent',
  })
}

/** 设置指定插件实例的日志等级覆盖，运行期立即生效。 */
export function setPluginInstanceLogLevel(
  pluginId: string,
  instanceId: string,
  request: PluginInstanceLogLevelUpdateRequest,
): Promise<null> {
  return api.put<null>(`plugin/loglevel/${encodeURIComponent(pluginId)}/${encodeURIComponent(instanceId)}`, request, {
    feedback: 'silent',
  })
}

/** 清除指定插件实例的日志等级覆盖，立即回落全局等级。 */
export function clearPluginInstanceLogLevel(pluginId: string, instanceId: string): Promise<null> {
  return api.delete<null>(`plugin/loglevel/${encodeURIComponent(pluginId)}/${encodeURIComponent(instanceId)}`, {
    feedback: 'silent',
  })
}

/** 设置指定插件实例为默认调用目标，自动清除同插件的旧默认。 */
export function setPluginInstanceDefaultTarget(pluginId: string, instanceId: string): Promise<null> {
  return api.put<null>(
    `plugin/instances/${encodeURIComponent(pluginId)}/${encodeURIComponent(instanceId)}/default_target`,
    undefined,
    { feedback: 'silent' },
  )
}

/** 清除指定插件实例的默认调用目标置位。 */
export function clearPluginInstanceDefaultTarget(pluginId: string, instanceId: string): Promise<null> {
  return api.delete<null>(
    `plugin/instances/${encodeURIComponent(pluginId)}/${encodeURIComponent(instanceId)}/default_target`,
    { feedback: 'silent' },
  )
}

/**
 * 卸载单个插件实例。
 *
 * 卸载源插件本体时必须显式开启 cascade：后端默认拒绝卸载仍有分身的本体，
 * 以免留下指向不存在源码的孤儿分身。
 */
export function uninstallPluginInstance(instanceId: string, cascade = false): Promise<null> {
  return api.delete<null>(`plugin/${encodeURIComponent(instanceId)}`, {
    ...(cascade ? { params: { cascade: true } } : {}),
    feedback: 'silent',
  })
}

/** 重置单个插件实例的配置与业务数据，本体与分身各管各的。 */
export function resetPluginInstance(instanceId: string): Promise<null> {
  return api.get<null>(`plugin/reset/${encodeURIComponent(instanceId)}`, { feedback: 'silent' })
}

/**
 * 读取全部已安装插件，分身与本体都在其中，各占一条。
 *
 * 「版本与实例」只拿得到实例 ID 与版本绑定，要打开某个实例的配置、或以源插件为
 * 模板创建分身，都需要它对应的完整插件对象。
 */
export function getInstalledPlugins(): Promise<Plugin[]> {
  return api.get<Plugin[]>('plugin/', { params: { state: 'installed' }, feedback: 'silent' })
}

/**
 * 启用或停用一个实例，本体与分身共用这一个入口。
 *
 * 停用只把启用位置假：配置、展示信息与锚定版本原样留着，再次启用即恢复，
 * 因而它与卸载是两件事——卸载会清掉锚定版本，彻底清理才删数据。
 */
export function setPluginInstanceEnabled(instanceId: string, enabled: boolean): Promise<null> {
  const request: PluginInstanceEnabledRequest = { enabled }
  return api.post<null>(`plugin/instance/${encodeURIComponent(instanceId)}/enabled`, request, {
    feedback: 'silent',
  })
}

/**
 * 按用户逐项勾选的范围彻底清理一个实例的配置与数据。
 *
 * 不可逆：停用只是把启用位置假、设置原样留着，这里才真正删除用户数据。
 */
export function purgePluginInstance(
  instanceId: string,
  request: PluginInstancePurgeRequest,
): Promise<PluginInstancePurgeOutcome> {
  return api.post<PluginInstancePurgeOutcome>(`plugin/instance/${encodeURIComponent(instanceId)}/purge`, request, {
    feedback: 'silent',
  })
}

/**
 * 列出该插件名下已卸载、设置仍留存可被恢复的分身。
 *
 * 在册的分身不在此列：它们的配置正被使用，摆进恢复选择器只会让人误以为能把活着
 * 的实例再建一遍。
 */
export function getPluginRestorableInstances(pluginId: string): Promise<PluginRestorableInstance[]> {
  return api.get<PluginRestorableInstance[]>(`plugin/clone/${encodeURIComponent(pluginId)}/restorable`, {
    feedback: 'silent',
  })
}
