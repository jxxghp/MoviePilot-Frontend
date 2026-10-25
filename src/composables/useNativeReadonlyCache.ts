import { onScopeDispose, watch, type Ref } from 'vue'
import { useAuthStore, useUserStore } from '@/stores'
import { getCurrentLocale } from '@/plugins/i18n'
import { getMediaSourceCatalog } from '@/utils/mediaId'
import { getModuleCatalog } from '@/composables/useModuleCatalog'
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
    [negotiated, available],
    // NativeSession 已合并接管、身份和系统前台状态；点原生导航不必令 WKWebView 获得 DOM 焦点。
    () => cache.setEnabled(negotiated.value && available.value),
    { immediate: true, flush: 'sync' },
  )
  onScopeDispose(() => {
    cache.setEnabled(false)
    cache.setScope(undefined)
  })
}
