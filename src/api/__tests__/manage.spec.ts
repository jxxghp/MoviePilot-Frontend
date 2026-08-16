import { manageLlmProvider, manageNotificationChannel, manageStorage } from '@/api/manage'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  apiPost: vi.fn(),
}))

vi.mock('@/api', () => ({
  default: createDataApiMock({
    post: (...args: unknown[]) => mocks.apiPost(...args),
  }),
}))

describe('manage API adapters', () => {
  beforeEach(() => {
    mocks.apiPost.mockReset()
    mocks.apiPost.mockResolvedValue({ ok: true })
  })

  it('透传通知渠道的目标、动作、参数和请求配置', async () => {
    const config = { timeout: 1200 }

    await expect(manageNotificationChannel('telegram', 'refresh', { force: true }, config)).resolves.toEqual({
      ok: true,
    })

    expect(mocks.apiPost).toHaveBeenCalledWith(
      'notification/manage',
      { target: 'telegram', action: 'refresh', params: { force: true } },
      config,
    )
  })

  it('为网盘存储动作补充空参数对象', async () => {
    await manageStorage('alist', 'disconnect')

    expect(mocks.apiPost).toHaveBeenCalledWith(
      'storage/manage',
      { target: 'alist', action: 'disconnect', params: {} },
      undefined,
    )
  })

  it('透传 LLM Provider 管理动作并返回已解包业务数据', async () => {
    mocks.apiPost.mockResolvedValueOnce([{ id: 'openai' }])

    await expect(manageLlmProvider('', 'list_providers')).resolves.toEqual([{ id: 'openai' }])

    expect(mocks.apiPost).toHaveBeenCalledWith(
      'llm/manage',
      { target: '', action: 'list_providers', params: {} },
      undefined,
    )
  })
})
