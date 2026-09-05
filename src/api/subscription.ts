import api from '@/api'
import type { SubscriptionSearchSubmission } from '@/api/types'

/** 立即搜索一条现有订阅。 */
export function searchSubscription(subscriptionId: number): Promise<SubscriptionSearchSubmission> {
  return api.post<SubscriptionSearchSubmission>(`subscribe/search/${subscriptionId}`, undefined, { feedback: 'silent' })
}

/** 重置一条现有订阅，使其重新进入处理状态。 */
export function resetSubscription(subscriptionId: number): Promise<null> {
  return api.post<null>(`subscribe/reset/${subscriptionId}`, undefined, { feedback: 'silent' })
}

/** 立即搜索当前用户可访问的全部订阅。 */
export function searchAllSubscriptions(): Promise<SubscriptionSearchSubmission> {
  return api.post<SubscriptionSearchSubmission>('subscribe/search', undefined, { feedback: 'silent' })
}

/** 启动全局订阅刷新任务。 */
export function refreshSubscriptions(): Promise<null> {
  return api.post<null>('subscribe/refresh', undefined, { feedback: 'silent' })
}

/** 启动全局订阅元数据更新任务。 */
export function refreshSubscriptionMetadata(): Promise<null> {
  return api.post<null>('subscribe/check', undefined, { feedback: 'silent' })
}

/** 查询当前用户已关注的订阅分享用户。 */
export function listFollowedSubscribers(): Promise<string[]> {
  return api.get<string[]>('subscribe/follow', { feedback: 'silent' })
}

/** 关注一个订阅分享用户。 */
export function followSubscriber(shareUid: string): Promise<null> {
  return api.post<null>('subscribe/follow', undefined, {
    feedback: 'silent',
    params: { share_uid: shareUid },
  })
}

/** 取消关注一个订阅分享用户。 */
export function unfollowSubscriber(shareUid: string): Promise<null> {
  return api.delete<null>('subscribe/follow', {
    feedback: 'silent',
    params: { share_uid: shareUid },
  })
}
