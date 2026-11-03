import { addBlacklistRule, blacklistHistory, listBlacklist, removeBlacklistEntry } from '@/api/blacklist'
import {
  blacklistAddHandler,
  blacklistEntry,
  blacklistListHandler,
  blacklistUrl,
} from '@tests/support/msw/handlers/blacklist'
import { apiFailureJson, apiJson } from '@tests/support/msw/response'
import { server } from '@tests/support/msw/server'
import { http } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

describe('永久种子黑名单 API', () => {
  beforeEach(() => setActivePinia(createPinia()))
  it('按 typed envelope 查询分页并保留幂等新增和删除结果', async () => {
    const entry = blacklistEntry()
    const receive = vi.fn()
    server.use(
      blacklistListHandler(url => {
        expect(url.searchParams.get('page')).toBe('2')
        expect(url.searchParams.get('count')).toBe('20')
        return { items: [entry], total: 21, page: 2, count: 20 }
      }),
      blacklistAddHandler({ entry, created: false }, receive),
      http.delete(`${blacklistUrl}/${entry.id}`, () => apiJson({ removed: false })),
    )
    expect((await listBlacklist(2, 20)).total).toBe(21)
    expect((await addBlacklistRule({ keyword: 'bad' })).created).toBe(false)
    expect(receive).toHaveBeenCalledWith({ keyword: 'bad' })
    expect(await removeBlacklistEntry(entry.id)).toEqual({ removed: false })
  })

  it('历史一键屏蔽只提交历史 ID，业务失败不会当作成功', async () => {
    server.use(
      http.post(`${blacklistUrl}/history/7`, async ({ request }) => {
        expect(await request.text()).toBe('')
        return apiFailureJson('历史记录缺少安全资源身份，请添加手动黑名单规则', null)
      }),
    )
    await expect(blacklistHistory(7)).rejects.toThrow('手动')
  })
})
