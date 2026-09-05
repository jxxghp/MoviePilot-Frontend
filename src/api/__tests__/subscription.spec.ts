import {
  followSubscriber,
  listFollowedSubscribers,
  refreshSubscriptionMetadata,
  refreshSubscriptions,
  resetSubscription,
  searchAllSubscriptions,
  searchSubscription,
  unfollowSubscriber,
} from '@/api/subscription'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  apiDelete: vi.fn(),
  apiGet: vi.fn(),
  apiPost: vi.fn(),
}))

vi.mock('@/api', () => ({
  default: createDataApiMock({
    delete: mocks.apiDelete,
    get: mocks.apiGet,
    post: mocks.apiPost,
  }),
}))

describe('subscription API', () => {
  beforeEach(() => {
    mocks.apiDelete.mockReset().mockResolvedValue({ success: true })
    mocks.apiGet.mockReset().mockResolvedValue({ data: ['followed-user'], success: true })
    mocks.apiPost.mockReset().mockResolvedValue({ success: true })
  })

  it('uses POST for subscription commands', async () => {
    await searchSubscription(7)
    await resetSubscription(8)
    await searchAllSubscriptions()
    await refreshSubscriptions()
    await refreshSubscriptionMetadata()

    expect(mocks.apiPost).toHaveBeenNthCalledWith(1, 'subscribe/search/7')
    expect(mocks.apiPost).toHaveBeenNthCalledWith(2, 'subscribe/reset/8')
    expect(mocks.apiPost).toHaveBeenNthCalledWith(3, 'subscribe/search')
    expect(mocks.apiPost).toHaveBeenNthCalledWith(4, 'subscribe/refresh')
    expect(mocks.apiPost).toHaveBeenNthCalledWith(5, 'subscribe/check')
  })

  it('uses the structured follow endpoint for reads and mutations', async () => {
    await expect(listFollowedSubscribers()).resolves.toEqual(['followed-user'])
    await followSubscriber('new-user')
    await unfollowSubscriber('old-user')

    expect(mocks.apiGet).toHaveBeenCalledWith('subscribe/follow')
    expect(mocks.apiPost).toHaveBeenCalledWith('subscribe/follow', undefined, { params: { share_uid: 'new-user' } })
    expect(mocks.apiDelete).toHaveBeenCalledWith('subscribe/follow', { params: { share_uid: 'old-user' } })
  })
})
