import { nextTick, onActivated, onMounted, toValue, watch, type MaybeRefOrGetter } from 'vue'

export interface KeepAliveRefreshContext {
  /** 重新进入页面时已有旧内容可用，刷新应尽量避免切换主 loading 或清空列表。 */
  silent?: boolean
  source?: 'activated' | 'tab' | 'manual'
}

type RefreshHandler = (context?: KeepAliveRefreshContext) => void | Promise<void>

interface KeepAliveRefreshOptions {
  /**
   * 当前内容是否处于可见状态。
   * keep-alive 会激活整棵缓存树，tab 内组件需要用它避免后台标签页也刷新。
   */
  active?: MaybeRefOrGetter<boolean>
  /** 是否在 keep-alive 页面重新进入时刷新。 */
  refreshOnActivated?: boolean
  /** 是否在 tab 从隐藏切回可见时刷新。 */
  refreshOnTabActivated?: boolean
}

/**
 * keep-alive 页面复用实例时不会重新 mounted，这里统一补上重新进入和重新选中 tab 的刷新。
 */
export function useKeepAliveRefresh(refresh: RefreshHandler, options: KeepAliveRefreshOptions = {}) {
  let mounted = false
  let activatedCount = 0
  let refreshing = false
  let pendingRefresh = false
  let refreshScheduled = false

  const isActive = () => options.active === undefined || Boolean(toValue(options.active))

  async function runRefresh(context: KeepAliveRefreshContext = { silent: true, source: 'manual' }) {
    if (!isActive()) return

    // 避免路由激活和 tab 激活在同一轮里叠加出并发请求。
    if (refreshing) {
      pendingRefresh = true
      return
    }

    refreshing = true
    try {
      await refresh(context)
    } finally {
      refreshing = false

      if (pendingRefresh) {
        pendingRefresh = false
        await runRefresh(context)
      }
    }
  }

  function requestRefresh(source: KeepAliveRefreshContext['source']) {
    // 同一轮激活里可能同时触发路由激活和 tab 激活，合并成一次静默刷新。
    if (refreshScheduled) return

    refreshScheduled = true
    void nextTick(async () => {
      refreshScheduled = false
      await runRefresh({ silent: true, source })
    })
  }

  onMounted(() => {
    mounted = true
  })

  if (options.refreshOnActivated !== false) {
    onActivated(() => {
      activatedCount += 1

      // KeepAlive 首次挂载也会触发 activated，初始加载交给页面自己的 mounted 逻辑。
      if (activatedCount === 1) return

      requestRefresh('activated')
    })
  }

  if (options.active !== undefined && options.refreshOnTabActivated !== false) {
    watch(
      () => Boolean(toValue(options.active)),
      (active, oldActive) => {
        if (!mounted || !active || oldActive !== false) return

        requestRefresh('tab')
      },
      { flush: 'post' },
    )
  }

  return {
    refresh: runRefresh,
  }
}
