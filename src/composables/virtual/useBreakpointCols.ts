import { computed, type ComputedRef } from 'vue'
import { useDisplay } from 'vuetify'

/**
 * ============================================================
 * useBreakpointCols - 视口断点驱动的列数
 * ============================================================
 *
 * 把 Vuetify 的视口断点(`useDisplay()`)映射成一个 cols 数值,
 * 喂给 VirtualGrid / VirtualMasonry 的 `:columns` prop。
 *
 * 适用：全宽路由级网格 —— 列数由窗口宽度决定。
 *
 * 容器自适应(嵌在窄/可变宽容器里)请改用 `useResponsiveCols`
 * 或 `<AutoSizer>` 包一层。
 *
 * 典型用法：
 *   <script setup>
 *   const cols = useBreakpointCols({ xs: 1, sm: 2, md: 3, lg: 4, xl: 5, xxl: 5 })
 *   </script>
 *   <template>
 *     <VirtualGrid :columns="cols" ...> ... </VirtualGrid>
 *   </template>
 */
export interface Breakpoints {
  xs?: number
  sm?: number
  md?: number
  lg?: number
  xl?: number
  xxl?: number
}

export function useBreakpointCols(breakpoints: Breakpoints): ComputedRef<number> {
  const display = useDisplay()
  return computed(() => {
    if (display.xs.value) return breakpoints.xs ?? 2
    if (display.sm.value) return breakpoints.sm ?? 3
    if (display.md.value) return breakpoints.md ?? 4
    if (display.lg.value) return breakpoints.lg ?? 5
    if (display.xl.value) return breakpoints.xl ?? 6
    return breakpoints.xxl ?? 6
  })
}
