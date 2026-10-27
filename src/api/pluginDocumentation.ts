import api from '@/api'

/** 只接受无凭据的绝对 HTTP(S) 文档外链。 */
export function normalizePluginDocumentationUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const url = value.trim()
  if (!url || url.length > 2048 || /\s/.test(url)) return undefined
  try {
    const parsed = new URL(url)
    if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname || parsed.username || parsed.password)
      return undefined
    return url
  } catch {
    return undefined
  }
}

/** 按详情中选择的仓库查询说明入口，旧后端或缺失文档由调用方静默处理。 */
export async function getPluginDocumentationUrl(pluginId: string, repoUrl: string): Promise<string | undefined> {
  const result = await api.get<{ url?: unknown }>(`plugin/readme/${encodeURIComponent(pluginId)}`, {
    params: { repo_url: repoUrl },
    feedback: 'silent',
  })
  return normalizePluginDocumentationUrl(result?.url)
}
