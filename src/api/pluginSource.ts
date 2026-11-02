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
  if (options.selection_status === 'incomplete') {
    const trustedSourceIsAvailable = Boolean(
      identity?.trusted_source_key &&
      onlineCandidates.some(candidate => candidate.source_key === identity.trusted_source_key),
    )
    // 历史绑定仓库失效时，仍需让管理员从当前可用候选中重新选择来源。
    if (!hasTrustedOnlineSource || !trustedSourceIsAvailable) return true
  }

  return (
    options.selection_status === 'selected' &&
    onlineCandidates.length === 1 &&
    onlineCandidates[0].source_type === 'third_party'
  )
}

/** 按明确来源安装插件，切换页面后继续等待安装结果。 */
export function installPluginFromSource(
  pluginId: string,
  request: PluginSourceInstallRequest,
): Promise<PluginInstallOutcome | null> {
  return api.post<PluginInstallOutcome | null>(`plugin/source/${encodeURIComponent(pluginId)}/install`, request, {
    feedback: 'silent',
    skipNavigationCancellation: true,
  })
}

/** 按当前身份 revision 换源安装，切换页面后继续等待事务结果。 */
export function changePluginSource(
  pluginId: string,
  request: PluginSourceChangeRequest,
): Promise<PluginInstallOutcome | null> {
  return api.post<PluginInstallOutcome | null>(`plugin/source/${encodeURIComponent(pluginId)}`, request, {
    feedback: 'silent',
    skipNavigationCancellation: true,
  })
}
