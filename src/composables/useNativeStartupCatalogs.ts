import { computed, onScopeDispose, watch, type Ref } from 'vue'
import { useAppActivityLifecycle } from '@/composables/useAppActivityLifecycle'
import { loadMediaSources } from '@/composables/useMediaSources'
import { isModuleCatalogLoaded, loadModuleCatalog } from '@/composables/useModuleCatalog'
import { isMediaSourceCatalogLoaded } from '@/utils/mediaId'

const MAX_ATTEMPTS = 4
const RETRY_DELAY_MS = 1500

/** 原生启动只重试尚未就绪的只读目录，成功前保留原有导航与权限屏障。 */
export function useNativeStartupCatalogs(available: Readonly<Ref<boolean>>) {
  const { isSuspended } = useAppActivityLifecycle()
  const ready = computed(() => isMediaSourceCatalogLoaded().value && isModuleCatalogLoaded().value)
  let generation = 0
  let timer: ReturnType<typeof setTimeout> | undefined

  /** 退出登录、进入后台或卸载后撤销后续重试，不取消其他页面共享的在途请求。 */
  function cancelRetry() {
    generation += 1
    clearTimeout(timer)
    timer = undefined
  }

  watch(
    () => available.value && !isSuspended.value && !ready.value,
    enabled => {
      cancelRetry()
      if (!enabled) return
      const current = generation
      let attempts = 0

      /** 每轮复用现有目录请求；失败最多重试三次，避免恢复页背后持续轮询。 */
      async function load() {
        attempts += 1
        await Promise.all([
          ...(isMediaSourceCatalogLoaded().value ? [] : [loadMediaSources()]),
          ...(isModuleCatalogLoaded().value ? [] : [loadModuleCatalog()]),
        ])
        if (current !== generation || ready.value || attempts >= MAX_ATTEMPTS) return
        timer = setTimeout(() => void load(), RETRY_DELAY_MS)
      }

      void load()
    },
    { immediate: true, flush: 'sync' },
  )
  onScopeDispose(cancelRetry)
  return ready
}
