import api from './index'
import type { PluginInstanceLogLevelOverview, PluginInstanceLogLevelUpdateRequest } from './types'

/**
 * 查询插件全部实例（含本体）当前的日志等级设置。
 *
 * 只认源插件 ID：后端对分身自身的实例 ID 会直接拒绝，调用方须先把分身卡片
 * 重定向到它的源插件。
 */
export function getPluginInstanceLogLevels(pluginId: string): Promise<PluginInstanceLogLevelOverview> {
  return api.get<PluginInstanceLogLevelOverview>(`plugin/loglevel/${encodeURIComponent(pluginId)}`, {
    feedback: 'silent',
  })
}

/**
 * 设置指定插件实例的日志等级覆盖，运行期立即生效。
 *
 * 失效时间必须是带时区的 ISO 字符串：后端把不带时区的时间按 UTC 解读，送裸本地
 * 时间会让覆盖提前或推迟若干小时失效。
 */
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
