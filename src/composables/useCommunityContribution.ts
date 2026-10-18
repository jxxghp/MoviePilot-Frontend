import api from '@/api'
import { computed, onScopeDispose, ref, shallowRef, watch, type Ref } from 'vue'
import { knownMedals, type CommunityMedalRecord } from '@/utils/communityMedals'
import {
  clearCommunityProfileCache,
  communityProfileCacheKey,
  readCommunityProfileCache,
  writeCommunityProfileCache,
} from '@/utils/communityProfileCache'
import { isAxiosError } from 'axios'

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
  /** 后端正在主动预热或刷新；前端短暂查询进度，不触发新的远端核验。 */
  refreshing?: boolean
}

export const COMMUNITY_AUTH_CHANGED_EVENT = 'moviepilot:github-auth-changed'

/** 授权成功、手动换 Token 或解绑时先撤销持久快照，再通知当前页面重新核验。 */
export function notifyCommunityAuthChanged(): void {
  clearCommunityProfileCache()
  window.dispatchEvent(new Event(COMMUNITY_AUTH_CHANGED_EVENT))
}

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
  let pollTimer: ReturnType<typeof setTimeout> | null = null
  let pollStartedAt = 0
  /** 当前版本认识的勋章，按目录顺序。 */
  const medals = computed(() => (profile.value?.state === 'ready' ? knownMedals(profile.value.medals) : []))
  /** 实例开启了勋章但还没配置 GitHub Token：入口照常显示，勋章墙引导配置。 */
  const unconfigured = computed(() => profile.value?.state === 'unconfigured')
  /**
   * 入口在功能开启时显示：已核验（ready，持有零枚时展台介绍七枚勋章）或尚未配置 Token（unconfigured）。
   * disabled 与 unavailable 一律隐藏。没有勋章时未读点与头像旁佩戴自然不出现。
   */
  const eligible = computed(() => enabled.value && (profile.value?.state === 'ready' || unconfigured.value))
  /** 首次无快照时保留与入口等大的位置；后台复核已有勋章时保持原样。 */
  const initialLoading = computed(
    () => enabled.value && loading.value && (!profile.value || profile.value.state === 'unavailable'),
  )

  /** 静默探测可见性；显式刷新失败时保留同账号已验证的勋章并给出错误反馈。 */
  async function refresh(force = false, followUp = false): Promise<void> {
    if (!enabled.value) return
    if (pending) return pending
    if (!force && !followUp && Date.now() - lastAttempt < 60_000) return
    if (pollTimer !== null) clearTimeout(pollTimer)
    pollTimer = null
    if (!followUp) pollStartedAt = Date.now()
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
          // 勋章入口属于布局，切换页面不应中断其快照读取或后台进度查询。
          skipNavigationCancellation: true,
        })
        if (current !== revision) return
        // 后端冷启动尚未核验完成时继续展示同用户快照；明确撤销或核验失败才清除。
        if (!(result.state === 'unavailable' && result.refreshing && profile.value?.state === 'ready')) {
          profile.value = result
        }
        failed.value = result.state === 'unavailable' && !result.refreshing
        if (result.state === 'ready' && !result.refreshing) writeCommunityProfileCache(identity.value, result)
        else if (!result.refreshing) clearCommunityProfileCache(identity.value)
        if (result.refreshing && Date.now() - pollStartedAt < 50_000) {
          pollTimer = setTimeout(() => {
            pollTimer = null
            void refresh(false, true)
          }, 1500)
        }
      } catch (error) {
        if (current !== revision) return
        failed.value = true
        if (isAxiosError(error) && [401, 403].includes(error.response?.status ?? 0)) {
          profile.value = null
          clearCommunityProfileCache(identity.value)
        } else if (profile.value) {
          profile.value = { ...profile.value, stale: true }
        }
      } finally {
        if (current === revision) {
          loading.value = pollTimer !== null
          pending = null
        }
      }
    })()
    return pending
  }

  /** 撤销当前内存状态及在途请求；保留按用户隔离的快照，供同账号重新登录恢复。 */
  function reset() {
    revision++
    if (pollTimer !== null) clearTimeout(pollTimer)
    pollTimer = null
    profile.value = null
    failed.value = false
    loading.value = false
    lastAttempt = 0
    pending = null
  }

  watch(
    [enabled, identity],
    ([active, user]) => {
      reset()
      if (active) profile.value = readCommunityProfileCache(user)
      void refresh()
    },
    { immediate: true, flush: 'sync' },
  )

  /** Token 变更立即撤下旧账号入口，只有新验证结果才可恢复。 */
  function authChanged() {
    clearCommunityProfileCache()
    reset()
    void refresh(true)
  }

  /** 其他标签页解绑或更换授权时同步撤销旧显示，只监听删除以免复核写入引发循环。 */
  function storageChanged(event: StorageEvent) {
    if (event.storageArea !== localStorage || event.newValue !== null) return
    if (event.key === null || event.key === communityProfileCacheKey(identity.value)) {
      reset()
      void refresh(true)
    }
  }

  window.addEventListener('storage', storageChanged)
  onScopeDispose(() => {
    window.removeEventListener('storage', storageChanged)
    reset()
  })

  return { profile, medals, unconfigured, eligible, initialLoading, loading, failed, refresh, reset, authChanged }
}
