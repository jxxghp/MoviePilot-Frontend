import { computed, type Ref, type ComputedRef } from 'vue'
import { useElementSize } from '@vueuse/core'

/**
 * ============================================================
 * useResponsiveCols - 容器宽度驱动的列数
 * ============================================================
 *
 * 用 `@vueuse/core` 的 `useElementSize` 观察容器宽度,
 * 按 `minItemWidth` 算出能塞下几列。
 *
 * 适用：嵌在窄/可变宽容器里的网格 —— dashboard 卡片、对话框等
 * 「视口断点表达不了」的场景。
 *
 * 典型用法(配合 AutoSizer)：
 *   <AutoSizer #default="{ width }">
 *     <VirtualGrid
 *       :columns="useResponsiveCols(autoSizerRef, { minItemWidth: 240 })"
 *       :container-height="'10rem'" ...
 *     />
 *   </AutoSizer>
 *
 * 或直接传一个外层容器 ref：
 *   const wrapperRef = ref<HTMLElement | null>(null)
 *   const cols = useResponsiveCols(wrapperRef, { minItemWidth: 240 })
 */
export function useResponsiveCols(
  containerRef: Ref<HTMLElement | null>,
  opts: {
    /** 单项最小宽度（含 gap 估算更稳，但不强求） */
    minItemWidth: number
    /** 最少列数（默认 1，避免 width=0 时返回 0） */
    min?: number
    /** 最多列数（可选上限） */
    max?: number
  },
): ComputedRef<number> {
  const { width } = useElementSize(containerRef)
  return computed(() => {
    const w = width.value
    const minCols = opts.min ?? 1
    if (!w || opts.minItemWidth <= 0) return minCols
    const raw = Math.floor(w / opts.minItemWidth)
    let n = Math.max(minCols, raw)
    if (opts.max !== undefined) n = Math.min(opts.max, n)
    return n
  })
}
