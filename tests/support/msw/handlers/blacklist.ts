import type { BlacklistAddResult, BlacklistEntry, BlacklistPage, BlacklistRule } from '@/api/blacklist'
import { http } from 'msw'
import { apiJson } from '../response'

export const blacklistUrl = 'http://localhost/api/v1/torrent/blacklist'

/** 构造只有安全字段的黑名单规则夹具。 */
export function blacklistEntry(keyword = 'bad', id = 'a'.repeat(32)): BlacklistEntry {
  return { id, created_at: '2026-11-03T10:00:00Z', kind: 'manual', rule: { keyword } }
}

/** 分页接口保留实际查询参数，允许测试延迟响应。 */
export function blacklistListHandler(response: BlacklistPage | ((url: URL) => BlacklistPage | Promise<BlacklistPage>)) {
  return http.get(blacklistUrl, async ({ request }) =>
    apiJson(typeof response === 'function' ? await response(new URL(request.url)) : response),
  )
}

/** 新增手动规则接口只接受规则条件，并返回明确的创建状态。 */
export function blacklistAddHandler(
  response: BlacklistAddResult,
  receive: (body: BlacklistRule) => void | Promise<void> = () => {},
) {
  return http.post(blacklistUrl, async ({ request }) => {
    await receive((await request.json()) as BlacklistRule)
    return apiJson(response)
  })
}
