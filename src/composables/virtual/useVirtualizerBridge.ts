import { computed } from 'vue'
import { useVirtualizer, useWindowVirtualizer } from '@tanstack/vue-virtual'

/**
 * ============================================================
 * useVirtualizerBridge - 虚拟滚动 Base Layer：tanstack 桥接
 * ============================================================
 *
 * 封装 useVirtualizer / useWindowVirtualizer 的二选一 + measureRef null 转发。
 * 供 VirtualGrid / VirtualList 复用（VirtualMasonry 不走 tanstack，无 row 概念）。
 *
 * 为什么必须二选一：scroll 事件不冒泡到 <html>，
 * useVirtualizer + document.scrollingElement 会让 virtualizer 永远以为
 * scrollOffset=0 → 虚拟化失效。window scroll 必须用 useWindowVirtualizer。
 *
 * measureRef 的 null 转发是内存泄漏修复的【唯一真源】——
 * 行/项卸载时 Vue 用 null 调用 ref 回调，必须把 null 转发给 measureElement，
 * 否则 @tanstack/virtual-core 不会执行 elementsCache 的清理分支
 * （它只在 measureElement(null) 时遍历并 unobserve 掉 !isConnected 的元素）。
 * 不转发的话 ResizeObserver 会强引用每个曾渲染过的元素，
 * detached DOM 无法 GC → 钉住其下所有 Vue 组件实例（内存泄漏根因）。
 */
export function useVirtualizerBridge(opts: {
  count: () => number
  estimateSize: () => number
  overscan: () => number
  scrollMargin: () => number
  getScrollElement: () => HTMLElement | null
  useWindowScroll: boolean
  /** 可选：把 index 映射为稳定 key（VirtualList 用，VirtualGrid 自行做 row chunking 不传） */
  getItemKey?: (index: number) => string | number
}) {
  const virtualizer = (opts.useWindowScroll
    ? useWindowVirtualizer({
        get count() {
          return opts.count()
        },
        estimateSize: () => opts.estimateSize(),
        get overscan() {
          return opts.overscan()
        },
        get scrollMargin() {
          return opts.scrollMargin()
        },
        ...(opts.getItemKey ? { getItemKey: opts.getItemKey } : {}),
      })
    : useVirtualizer({
        get count() {
          return opts.count()
        },
        getScrollElement: () => opts.getScrollElement(),
        estimateSize: () => opts.estimateSize(),
        get overscan() {
          return opts.overscan()
        },
        get scrollMargin() {
          return opts.scrollMargin()
        },
        ...(opts.getItemKey ? { getItemKey: opts.getItemKey } : {}),
      })) as unknown as ReturnType<typeof useVirtualizer<Element, Element>>

  const totalSize = computed(() => virtualizer.value.getTotalSize())
  const virtualItems = computed(() => virtualizer.value.getVirtualItems())

  function measureRef(el: any) {
    if (el instanceof HTMLElement) {
      virtualizer.value.measureElement(el)
    } else {
      // 见文件头注释：null 必须转发，否则 ResizeObserver 泄漏 detached DOM。
      virtualizer.value.measureElement(null)
    }
  }

  return { virtualizer, totalSize, virtualItems, measureRef }
}
