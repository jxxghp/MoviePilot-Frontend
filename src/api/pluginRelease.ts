import api from './index'
import { getPluginSourceOptions } from './pluginSource'
import type { PluginReleaseVersionsResponse, PluginSourceOptions } from './types'

/** 判断仓库地址是否为可发起网络请求的在线来源。 */
export function isOnlinePluginRepoUrl(repoUrl?: string | null): repoUrl is string {
  return Boolean(repoUrl && !repoUrl.startsWith('local://'))
}

/**
 * 解析已安装插件读取 Release 时应使用的可信在线仓库地址。
 *
 * 只认插件身份已绑定的可信来源：Release 列表决定用户能装什么版本，从任意候选
 * 仓库读取等于绕开来源绑定。本地载荷路径不进入网络请求。
 */
export async function resolveTrustedReleaseRepoUrl(pluginId: string): Promise<{
  repoUrl: string | null
  options: PluginSourceOptions
}> {
  const options = await getPluginSourceOptions(pluginId)
  const trustedSourceKey = options.identity?.trusted_source_key
  if (!trustedSourceKey) return { repoUrl: null, options }

  const candidate = options.candidates.find(
    item =>
      item.source_type !== 'local' && item.source_key === trustedSourceKey && isOnlinePluginRepoUrl(item.repo_url),
  )
  return { repoUrl: candidate?.repo_url || null, options }
}

/** 读取指定插件在给定仓库下的可安装 Release 版本列表。 */
export function fetchPluginReleaseVersions(
  pluginId: string,
  repoUrl: string,
  force = false,
): Promise<PluginReleaseVersionsResponse> {
  return api.get<PluginReleaseVersionsResponse>(`plugin/releases/${encodeURIComponent(pluginId)}`, {
    params: { repo_url: repoUrl, force },
  })
}
