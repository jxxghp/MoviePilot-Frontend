import { ref, watch, nextTick, type MaybeRefOrGetter } from 'vue'
import { useIntersectionObserver } from '@vueuse/core'

/**
 * ============================================================
 * useLoadMoreSentinel - 虚拟滚动 Base Layer：触底/触顶加载哨兵
 * ============================================================
 *
 * 规则：
 *   - sentinel 进入视口 + items 自上次 fire 起已变化 → fire
 *   - sentinel 离开视口 → 解锁
 *   - sentinel 持续 intersecting（短列表/大列宽）时，IntersectionObserver
 *     不会再回调，必须靠 items.length watcher 兜底重新评估 tryFire，
 *     否则只能 fire 一次后死锁、首屏填不满。
 *
 * 业务侧的 onFire 仍需自己持有 loading 锁防并发。
 *
 * VirtualList 的反向加载（聊天往上加载）= 再调一次本 composable，
 * 传 enabled 即可。
 *
 * @param itemsLength  返回当前 items 长度的 getter
 * @param onFire       触发加载的回调
 * @param root         容器内 scroll 模式的 IntersectionObserver root；window scroll 传 undefined
 * @param enabled      是否启用（反向加载未开启时返回 false）
 */
export function useLoadMoreSentinel(opts: {
  itemsLength: () => number
  onFire: () => void
  root?: MaybeRefOrGetter<HTMLElement | null>
  enabled?: () => boolean
}) {
  const sentinel = ref<HTMLElement | null>(null)
  let isIntersecting = false
  let lastFireLen = -1

  function tryFire() {
    if (opts.enabled && !opts.enabled()) return
    if (!isIntersecting) return
    if (lastFireLen >= 0 && opts.itemsLength() === lastFireLen) return
    lastFireLen = opts.itemsLength()
    opts.onFire()
  }

  useIntersectionObserver(
    sentinel,
    ([entry]: IntersectionObserverEntry[]) => {
      isIntersecting = entry.isIntersecting
      if (isIntersecting) tryFire()
    },
    { root: opts.root, rootMargin: '200px', threshold: 0 },
  )

  watch(opts.itemsLength, (len: number) => {
    if (len === 0) {
      // 列表清空（如换搜索词）→ 重置锁状态
      lastFireLen = -1
      return
    }
    // 等下一帧，让 DOM 完成布局后再判断 sentinel 位置
    nextTick(tryFire)
  })

  return { sentinel, tryFire }
}
