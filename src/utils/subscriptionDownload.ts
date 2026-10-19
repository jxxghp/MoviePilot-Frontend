import type { SubscriptionDownloadSource } from '@/api/types'

/** 只翻译已记录的提交类型，旧后端与旧活动保留“未记录”。 */
export function subscriptionDownloadKey(source?: SubscriptionDownloadSource | null): string {
  if (source?.submission_type === 'initial') return 'initial'
  if (source?.submission_type === 'upgrade') return source.best_version_full ? 'fullUpgrade' : 'upgrade'
  return 'unknown'
}
