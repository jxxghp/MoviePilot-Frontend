import api from '@/api'
import { computed, ref, shallowRef, watch, type Ref } from 'vue'

/** GitHub 社区贡献等级，与服务端认定口径保持一致。 */
export type CommunityTier = 'bronze' | 'silver' | 'gold' | 'core'
/** 社区仓库归属的贡献领域。 */
export type CommunityArea =
  'backend' | 'frontend' | 'plugins' | 'performance' | 'resources' | 'services' | 'website' | 'docs'
/** 单个仓库的两类证据，不能把作者提交数与合并 PR 相加。 */
export interface CommunityRepository {
  repository: string
  area: CommunityArea
  commits: number
  merged_prs: number
}
/** 仅包含已验证身份和公开贡献事实的服务端快照。 */
export interface CommunityProfile {
  state: 'unconfigured' | 'ready' | 'unavailable'
  login: string | null
  user_id: number | null
  tier: CommunityTier | null
  specialty: CommunityArea | 'ecosystem' | null
  total: number
  repositories: CommunityRepository[]
  checked_at: number | null
  stale: boolean
}

export const COMMUNITY_AUTH_CHANGED_EVENT = 'moviepilot:github-auth-changed'

/** 管理贡献入口及账号隔离，丢弃注销、切换用户或换 Token 前发出的旧请求。 */
export function useCommunityContribution(enabled: Ref<boolean>, identity: Ref<string>) {
  const profile = shallowRef<CommunityProfile | null>(null)
  const loading = ref(false)
  const failed = ref(false)
  let revision = 0
  let lastAttempt = 0
  let pending: Promise<void> | null = null
  const eligible = computed(
    () => enabled.value && profile.value?.state === 'ready' && !!profile.value.tier && profile.value.total > 0,
  )

  /** 静默探测可见性；显式刷新失败时保留同账号已验证的荣誉并给出错误反馈。 */
  async function refresh(force = false): Promise<void> {
    if (!enabled.value) return
    if (pending) return pending
    if (!force && Date.now() - lastAttempt < 60_000) return
    lastAttempt = Date.now()
    const current = revision
    loading.value = true
    failed.value = false
    pending = (async () => {
      try {
        const result = await api.get<CommunityProfile>('github/community', {
          params: { refresh: force },
          timeout: 50_000,
          feedback: 'silent',
        })
        if (current !== revision) return
        profile.value = result
        failed.value = result.state === 'unavailable'
      } catch {
        if (current === revision) failed.value = true
      } finally {
        if (current === revision) {
          loading.value = false
          pending = null
        }
      }
    })()
    return pending
  }

  /** 权限或身份变化时清理全部旧快照，再对当前管理员重新验证。 */
  function reset() {
    revision++
    profile.value = null
    failed.value = false
    loading.value = false
    lastAttempt = 0
    pending = null
  }

  watch(
    [enabled, identity],
    () => {
      reset()
      void refresh()
    },
    { immediate: true },
  )

  /** Token 变更立即撤下旧账号入口，只有新验证结果才可恢复。 */
  function authChanged() {
    reset()
    void refresh(true)
  }

  return { profile, eligible, loading, failed, refresh, reset, authChanged }
}
