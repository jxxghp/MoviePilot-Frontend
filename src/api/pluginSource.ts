import api from './index'
import type {
  PluginInstallOutcome,
  PluginSourceChangeRequest,
  PluginSourceInstallRequest,
  PluginSourceOptions,
} from './types'

/** 查询插件来源候选、当前绑定身份和来源准入状态。 */
export function getPluginSourceOptions(pluginId: string, force = false): Promise<PluginSourceOptions> {
  return api.get(`plugin/source/${encodeURIComponent(pluginId)}/options`, {
    ...(force ? { params: { force: true } } : {}),
    feedback: 'silent',
  })
}

/** 判断未安装插件是否必须由管理员明确选择在线仓库后安装。 */
export function requiresExplicitPluginSourceInstall(options: PluginSourceOptions, installed: boolean): boolean {
  if (installed) return false

  const onlineCandidates = options.candidates.filter(
    candidate => candidate.source_type !== 'local' && Boolean(candidate.source_key && candidate.repo_url),
  )
  if (onlineCandidates.length === 0) return false
  if (options.selection_status === 'conflict') return true

  const identity = options.identity
  const hasTrustedOnlineSource = Boolean(
    identity && identity.trusted_source_type !== 'unknown' && identity.trusted_source_key,
  )
  if (options.selection_status === 'incomplete' && !hasTrustedOnlineSource) return true

  return (
    options.selection_status === 'selected' &&
    onlineCandidates.length === 1 &&
    onlineCandidates[0].source_type === 'third_party'
  )
}

/** 按管理员明确选择的在线来源安装未绑定插件。 */
export function installPluginFromSource(
  pluginId: string,
  request: PluginSourceInstallRequest,
): Promise<PluginInstallOutcome | null> {
  return api.post<PluginInstallOutcome | null>(`plugin/source/${encodeURIComponent(pluginId)}/install`, request, {
    feedback: 'silent',
  })
}

/** 按当前身份 revision 进行 CAS 保护的在线来源切换。 */
export function changePluginSource(
  pluginId: string,
  request: PluginSourceChangeRequest,
): Promise<PluginInstallOutcome | null> {
  return api.post<PluginInstallOutcome | null>(`plugin/source/${encodeURIComponent(pluginId)}`, request, {
    feedback: 'silent',
  })
}
