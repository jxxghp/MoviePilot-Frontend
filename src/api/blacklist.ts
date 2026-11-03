import api from '@/api'

/** 永久手动规则，同条非空条件同时满足时匹配。 */
export interface BlacklistRule {
  keyword?: string | null
  site_id?: number | null
  uploader?: string | null
}

/** 只包含脱敏摘要和合法内容哈希的资源身份。 */
export interface BlacklistIdentity {
  version: 1
  digests: string[]
  hashes: string[]
  site_id?: number | null
  uploader?: string | null
}

/** 服务器生成身份和时间的永久黑名单条目。 */
export interface BlacklistEntry {
  id: string
  created_at: string
  kind: 'manual' | 'resource'
  rule?: BlacklistRule | null
  identity?: BlacklistIdentity | null
}

/** 单次快照产生的分页结果。 */
export interface BlacklistPage {
  items: BlacklistEntry[]
  total: number
  page: number
  count: number
}

/** 幂等新增结果，重复条目保留原 ID 和时间。 */
export interface BlacklistAddResult {
  entry: BlacklistEntry
  created: boolean
}

/** 管理员按有界窗口查询条目。 */
export function listBlacklist(page = 1, count = 20): Promise<BlacklistPage> {
  return api.get<BlacklistPage>('torrent/blacklist', { params: { page, count }, feedback: 'silent' })
}

/** 管理员添加手动规则，由服务器归一化去重。 */
export function addBlacklistRule(rule: BlacklistRule): Promise<BlacklistAddResult> {
  return api.post<BlacklistAddResult>('torrent/blacklist', rule, { feedback: 'silent' })
}

/** 只提交历史 ID，由服务器读取安全资源身份。 */
export function blacklistHistory(historyId: number): Promise<BlacklistAddResult> {
  return api.post<BlacklistAddResult>(`torrent/blacklist/history/${historyId}`, undefined, { feedback: 'silent' })
}

/** 幂等移除条目，不修改任务、文件或历史。 */
export function removeBlacklistEntry(entryId: string): Promise<{ removed: boolean }> {
  return api.delete<{ removed: boolean }>(`torrent/blacklist/${encodeURIComponent(entryId)}`, { feedback: 'silent' })
}
