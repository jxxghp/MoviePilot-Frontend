import { onScopeDispose, ref, watch, type Ref } from 'vue'
import { useAuthStore, useUserStore } from '@/stores'
import { getCurrentLocale } from '@/plugins/i18n'
import { getMediaSourceCatalog } from '@/utils/mediaId'
import { getModuleCatalog } from '@/composables/useModuleCatalog'
import { appActivityLifecycle } from '@/utils/appActivityLifecycle'
import { nativeReadonlyCache, type NativeReadonlyCache } from '@/native/cache'

/** 宿主协商与现有认证目录共同决定缓存范围；普通网页不安装此适配器。 */
export function useNativeReadonlyCache(
  negotiated: Ref<boolean>,
  available: Ref<boolean>,
  apiBase: string,
  cache: NativeReadonlyCache = nativeReadonlyCache,
) {
  const auth = useAuthStore()
  const user = useUserStore()
  const foreground = ref(false)
  const releaseActivity = appActivityLifecycle.acquire()
  const unsubscribe = appActivityLifecycle.subscribe(state => {
    foreground.value = state === 'active' || state === 'idle'
  })
  watch(
    [
      () => auth.token,
      () => user.userID,
      () => user.superUser,
      () => JSON.stringify(user.permissions),
      () => JSON.stringify(getMediaSourceCatalog().value),
      () => JSON.stringify(getModuleCatalog().value),
      getCurrentLocale,
      available,
    ],
    () => {
      // 同步撤销待交付结果；令牌只作为变化信号，永远不传入键、快照或日志。
      cache.setScope(
        available.value && auth.token ? { apiBase, userId: user.userID, locale: getCurrentLocale() } : undefined,
      )
    },
    { immediate: true, flush: 'sync' },
  )
  watch(
    [negotiated, available, foreground],
    () => cache.setEnabled(negotiated.value && available.value && foreground.value),
    { immediate: true, flush: 'sync' },
  )
  onScopeDispose(() => {
    unsubscribe()
    releaseActivity()
    cache.setEnabled(false)
    cache.setScope(undefined)
  })
}
