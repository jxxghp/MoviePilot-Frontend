import api from '@/api'
import { computed, ref, shallowRef, watch, type Ref } from 'vue'
import { knownMedals, type CommunityMedalRecord } from '@/utils/communityMedals'

/**
 * 实例接口 GET /api/v1/github/community 的响应，只对超级管理员开放。
 * 身份只来自实例 GitHub Token 对应的数字 ID，勋章记录原样取自 Wiki 名单中该 ID 的条目。
 */
export interface CommunityProfile {
  /**
   * disabled 实例关闭了社区勋章（COMMUNITY_MEDALS_ENABLED）；unconfigured 未配置 Token；ready 已核验；
   * unavailable 名单与旧结果都不可用。只有 ready 会展示勋章。
   */
  state: 'disabled' | 'unconfigured' | 'ready' | 'unavailable'
  /** Token 对应的 GitHub 登录名 */
  login: string | null
  /** Token 对应的 GitHub 数字 ID，看过的勋章按它分开记录 */
  user_id: number | null
  /** 该账号的勋章记录，可能包含当前版本不认识的勋章，展示前用 knownMedals 过滤 */
  medals: CommunityMedalRecord[]
  /** Wiki 名单的生成时间（ISO 8601） */
  generated_at: string | null
  /** 实例最近一次核对名单的时间（Unix 秒） */
  checked_at: number | null
  /** 名单拉取失败、正在展示同一 Token 上次结果时为 true */
  stale: boolean
}

export const COMMUNITY_AUTH_CHANGED_EVENT = 'moviepilot:github-auth-changed'

/**
 * 管理勋章入口及账号隔离，丢弃注销、切换用户或换 Token 前发出的旧请求。
 * enabled 为假时不发请求、不展示；调用方据超级管理员身份与实例开关 COMMUNITY_MEDALS_ENABLED 决定。
 */
export function useCommunityContribution(enabled: Ref<boolean>, identity: Ref<string>) {
  const profile = shallowRef<CommunityProfile | null>(null)
  const loading = ref(false)
  const failed = ref(false)
  let revision = 0
  let lastAttempt = 0
  let pending: Promise<void> | null = null
  /** 当前版本认识的勋章，按目录顺序。 */
  const medals = computed(() => (profile.value?.state === 'ready' ? knownMedals(profile.value.medals) : []))
  /** 实例开启了勋章但还没配置 GitHub Token：入口照常显示，勋章墙引导配置。 */
  const unconfigured = computed(() => profile.value?.state === 'unconfigured')
  /**
   * 入口在功能开启时显示：已核验（ready，持有零枚时展台介绍七枚勋章）或尚未配置 Token（unconfigured）。
   * disabled 与 unavailable 一律隐藏。没有勋章时未读点与头像旁佩戴自然不出现。
   */
  const eligible = computed(() => enabled.value && (profile.value?.state === 'ready' || unconfigured.value))

  /** 静默探测可见性；显式刷新失败时保留同账号已验证的勋章并给出错误反馈。 */
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

  return { profile, medals, unconfigured, eligible, loading, failed, refresh, reset, authChanged }
}
