/**
 * 按页面文档基址解析插件联邦入口，使其与相对 API 请求遵循相同的部署路径规则。
 * 相对 API 基址保留反向代理子路径，根路径或完整 URL 配置则按其显式语义解析。
 */
export function resolveFederationRemoteUrl(remotePath: string, apiBaseUrl: string, documentBaseUri: string): string {
  const normalizedApiBase = apiBaseUrl.endsWith('/') ? apiBaseUrl : `${apiBaseUrl}/`
  const apiUrl = new URL(normalizedApiBase, documentBaseUri)
  const normalizedRemotePath = remotePath.replace(/^\/+/, '')

  return new URL(normalizedRemotePath, apiUrl).href
}
