import api from './index'
import type {
  PluginInstanceLogLevelOverview,
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
