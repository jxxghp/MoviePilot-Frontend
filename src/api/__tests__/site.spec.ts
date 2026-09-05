import { requestCookieCloudSync, resetSiteData } from '@/api/site'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  apiPost: vi.fn(),
}))

vi.mock('@/api', () => ({
  default: createDataApiMock({ post: mocks.apiPost }),
}))

describe('site API', () => {
  beforeEach(() => {
    mocks.apiPost.mockReset().mockResolvedValue({ success: true })
  })

  it('uses POST for CookieCloud sync and site reset commands', async () => {
    await requestCookieCloudSync()
    await resetSiteData()

    expect(mocks.apiPost).toHaveBeenNthCalledWith(1, 'site/cookiecloud')
    expect(mocks.apiPost).toHaveBeenNthCalledWith(2, 'site/reset')
  })
})
