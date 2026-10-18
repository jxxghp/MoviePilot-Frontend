import type { CommunityProfile } from '@/composables/useCommunityContribution'

/** 展示快照最多保留七天，让隔日登录也能立即恢复；每次恢复后仍向服务端重新核验。 */
const CACHE_MAX_AGE = 7 * 24 * 60 * 60 * 1000

/** 按 API 地址隔离同源部署的不同实例，版本前缀隔离未来的结构变化。 */
function cachePrefix(): string {
  const endpoint = new URL(import.meta.env.VITE_API_BASE_URL || '/api/v1/', document.baseURI).href
  return `community-profile:v1:${endpoint}:`
}

/** 同一实例按 MoviePilot 用户隔离快照，不保存任何登录凭据或 GitHub Token。 */
export function communityProfileCacheKey(identity: string): string {
  return cachePrefix() + identity
}

/** 读取保留期内的已验证快照；损坏、过期或存储不可用时退回正常请求。 */
export function readCommunityProfileCache(identity: string): CommunityProfile | null {
  if (!identity) return null
  try {
    const raw = localStorage.getItem(communityProfileCacheKey(identity))
    if (!raw) return null
    const entry = JSON.parse(raw)
    const profile = entry?.profile
    const verifiedAt = Math.min(entry?.savedAt, profile?.checked_at * 1000)
    const age = Date.now() - verifiedAt
    if (
      !Number.isFinite(age) ||
      age < 0 ||
      age >= CACHE_MAX_AGE ||
      profile?.state !== 'ready' ||
      typeof profile.login !== 'string' ||
      !Number.isSafeInteger(profile.user_id) ||
      profile.user_id <= 0 ||
      !Array.isArray(profile.medals)
    ) {
      localStorage.removeItem(communityProfileCacheKey(identity))
      return null
    }
    return { ...profile, stale: true }
  } catch {
    return null
  }
}

/** 只保存成功核验的数据；服务端的过期结果不能续期本地快照。 */
export function writeCommunityProfileCache(identity: string, profile: CommunityProfile): void {
  if (!identity || profile.state !== 'ready' || profile.stale) return
  try {
    localStorage.setItem(communityProfileCacheKey(identity), JSON.stringify({ savedAt: Date.now(), profile }))
  } catch {
    // 禁用存储或空间不足不影响当前页面正常展示。
  }
}

/** 撤销单个用户快照；GitHub 授权属于实例配置，变更时清除本实例全部用户的旧身份。 */
export function clearCommunityProfileCache(identity?: string): void {
  try {
    if (identity !== undefined) {
      localStorage.removeItem(communityProfileCacheKey(identity))
      return
    }
    const prefix = cachePrefix()
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith(prefix)) localStorage.removeItem(key)
    }
  } catch {
    // 存储不可用时仍由调用方清理当前内存状态。
  }
}
