/**
 * useScrollRestore - 长列表滚动位置 + 数据持久化恢复
 * ============================================================
 *
 * 用途：解决「Scroll-back Blank / 回滚白屏」问题
 *
 * 工作机制：
 *   1. 在 onBeforeRouteLeave / onDeactivated 时保存 scrollTop + items + meta
 *   2. 在 onMounted 时检查 sessionStorage，若有缓存则恢复 items 与滚动位置
 *   3. 数据未缓存时调用业务 loader 拉初始页
 *
 * 配套要求：
 *   - 业务组件持有 items ref<any[]>
 *   - 业务组件持有 VirtualList / VirtualGrid 的 ref（用于调 scrollToOffset）
 *   - keep-alive 命中时本 composable 不重复触发恢复（onActivated 不接管）
 *
 * 典型用法：
 *   const listRef = ref<InstanceType<typeof VirtualList> | null>(null)
 *   const items = ref<Item[]>([])
 *   const pageNum = ref(1)
 *
 *   useScrollRestore({
 *     listRef,
 *     items,
 *     getMeta: () => ({ pageNum: pageNum.value }),
 *     applyMeta: (meta) => { pageNum.value = meta.pageNum ?? 1 },
 *     loader: () => fetchInitial(),
 *   })
 */

import type { Ref } from 'vue'
import { nextTick, onMounted, onBeforeUnmount } from 'vue'
import { onBeforeRouteLeave, useRoute } from 'vue-router'
import { useScrollPositionStore } from '@/stores/scrollPosition'

interface ListRefLike {
  getScrollElement: () => HTMLElement | null
  scrollToOffset: (px: number) => void
}

interface ScrollRestoreOptions<T> {
  /** VirtualList / VirtualGrid 的 ref（暴露了 getScrollElement / scrollToOffset） */
  listRef: Ref<ListRefLike | null>
  /** 业务侧持有的数据数组 ref */
  items: Ref<T[]>
  /** 自定义缓存 key（默认用当前路由 fullPath） */
  cacheKey?: () => string
  /** 抽取需要持久化的业务元数据（如 pageNum、查询参数） */
  getMeta?: () => Record<string, any>
  /** 恢复时回写业务元数据 */
  applyMeta?: (meta: Record<string, any>) => void
  /** 无缓存时的初始加载函数 */
  loader?: () => void | Promise<void>
}

export function useScrollRestore<T>(opts: ScrollRestoreOptions<T>) {
  const route = useRoute()
  const store = useScrollPositionStore()

  const resolveKey = () => opts.cacheKey?.() ?? `scroll:${route.fullPath}`

  // 单次锁：onBeforeRouteLeave + onBeforeUnmount 双钩子防漏，去重避免写两次 store
  let savedThisCycle = false

  function save() {
    if (savedThisCycle) return
    const el = opts.listRef.value?.getScrollElement()
    if (!el) return
    store.save<T>(resolveKey(), {
      scrollTop: el.scrollTop,
      items: opts.items.value,
      meta: opts.getMeta?.(),
    })
    savedThisCycle = true
  }

  async function restoreOrLoad() {
    savedThisCycle = false // 新一轮挂载，允许下次再保存
    const snap = store.restore<T>(resolveKey())
    if (snap && snap.items.length > 0) {
      // 恢复数据 + 元数据 + 滚动位置
      opts.items.value = snap.items as T[]
      if (snap.meta) opts.applyMeta?.(snap.meta)
      await nextTick()
      // 双 rAF 等 virtualizer 把 totalSize 算稳定（首帧可能为 0）
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          opts.listRef.value?.scrollToOffset(snap.scrollTop)
        })
      })
    } else {
      await opts.loader?.()
    }
  }

  onMounted(() => {
    void restoreOrLoad()
  })

  onBeforeRouteLeave(() => {
    save()
  })

  onBeforeUnmount(() => {
    // 兜底：被 keep-alive 踢出 / 组件销毁时也要保存（savedThisCycle 防双写）
    save()
  })

  return { save, restoreOrLoad }
}
