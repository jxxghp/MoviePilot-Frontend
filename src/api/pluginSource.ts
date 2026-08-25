import api from './index'
import type { PluginSourceChangeRequest, PluginSourceInstallRequest, PluginSourceOptions } from './types'

/** 查询插件来源候选、当前绑定身份和来源准入状态。 */
export function getPluginSourceOptions(pluginId: string, force = false): Promise<PluginSourceOptions> {
  return api.get(`plugin/source/${encodeURIComponent(pluginId)}/options`, {
    ...(force ? { params: { force: true } } : {}),
    feedback: 'silent',
  })
}

/** 按管理员明确选择的在线来源安装未绑定插件。 */
export function installPluginFromSource(pluginId: string, request: PluginSourceInstallRequest): Promise<void> {
  return api.post(`plugin/source/${encodeURIComponent(pluginId)}/install`, request, {
    feedback: 'silent',
  })
}

/** 按当前身份 revision 进行 CAS 保护的在线来源切换。 */
export function changePluginSource(pluginId: string, request: PluginSourceChangeRequest): Promise<void> {
  return api.post(`plugin/source/${encodeURIComponent(pluginId)}`, request, {
    feedback: 'silent',
  })
}
