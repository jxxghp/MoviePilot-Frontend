<!--
  ============================================================
  VirtualMasonry - 不等高瀑布流 + 窗口虚拟化
  ============================================================

  与 VirtualGrid 的区别：
    - VirtualGrid 假定每张卡等高（适合海报这种 2:3 等比卡）
    - VirtualMasonry 支持每项独立高度（Pinterest 风、混排）

  布局算法：
    - 把 items[] 按到 N 列；每来一项放进当前最矮的那一列
    - 总高度 = max(列高)；可视范围按 scrollY+overscan 过滤位置

  虚拟化策略：
    - 不依赖 @tanstack/vue-virtual：masonry 没有"行"的概念
    - 监听 window.scroll 计算可视 Y 区间，只渲染 top..top+vh+overscan 范围的项
    - 用 requestAnimationFrame 节流，滚动帧率不丢

  高度来源（优先级从高到低）：
    1. 用户传入 getItemHeight(item) 回调（如根据 aspect ratio 计算）
    2. estimateItemHeight 兜底
    （v1 不做 mount 后实测回填——masonry 实测会引发已布局项位移）

  列数由调用方决定（与 VirtualGrid 一致，组件本身不感知容器）：
    用 useBreakpointCols / useResponsiveCols / 显式数值喂给 :columns。

  典型用法：
    <script setup>
    const cols = useBreakpointCols({ xs: 2, sm: 3, md: 4, lg: 5 })
    </script>
    <template>
      <VirtualMasonry
        :items="people"
        :columns="cols"
        :estimate-item-height="280"
        :get-item-height="p => p.height ?? 280"
        key-field="id"
        @load-more="fetchMore">
        <template #item="{ item }"> <PersonCard :person="item" /> </template>
      </VirtualMasonry>
    </template>
-->

<script setup lang="ts" generic="T extends Record<string, any>">
import { computed, ref, onMounted, onBeforeUnmount } from 'vue'
import { useWindowScrollMargin } from '@/composables/virtual/useWindowScrollMargin'
import { useLoadMoreSentinel } from '@/composables/virtual/useLoadMoreSentinel'

const props = withDefaults(
  defineProps<{
    items: T[]
    /** 列数（必填）。调用方用 useBreakpointCols / useResponsiveCols / 显式数值喂进来 */
    columns: number
    /** 估算项高度（px），未提供 getItemHeight 时用这个 */
    estimateItemHeight?: number
    /** 从 item 计算实际高度（如已知图片宽高比） */
    getItemHeight?: (item: T) => number | undefined
    /** key 字段名（去重 + 复用 DOM） */
    keyField?: keyof T
    /** 列间距（px） */
    gap?: number
    /** 视口外预渲染像素（上下各 overscan px）*/
    overscan?: number
  }>(),
  {
    estimateItemHeight: 300,
    gap: 12,
    overscan: 600,
  },
)

const emit = defineEmits<{ loadMore: [] }>()

// 列数兜底为 1，避免外部传 0/负数时除零
const cols = computed(() => Math.max(1, Math.floor(props.columns) || 1))

interface LayoutItem {
  item: T
  key: string | number
  top: number
  leftPct: number
  widthPct: number
  height: number
  col: number
  index: number
}

const layout = computed<{ positions: LayoutItem[]; totalHeight: number }>(() => {
  const n = cols.value
  const colHeights = new Array<number>(n).fill(0)
  const positions: LayoutItem[] = []
  const widthPct = 100 / n
  const gap = props.gap

  for (let i = 0; i < props.items.length; i++) {
    const item = props.items[i]
    // 找最矮列
    let c = 0
    let minH = colHeights[0]
    for (let j = 1; j < n; j++) {
      if (colHeights[j] < minH) {
        minH = colHeights[j]
        c = j
      }
    }
    const top = colHeights[c]
    const h = props.getItemHeight?.(item) ?? props.estimateItemHeight
    const key = props.keyField
      ? ((item as Record<string, any>)[props.keyField as string] ?? i)
      : i
    positions.push({
      item,
      key,
      top,
      leftPct: c * widthPct,
      widthPct,
      height: h,
      col: c,
      index: i,
    })
    colHeights[c] = top + h + gap
  }

  const totalHeight = colHeights.reduce((m, v) => (v > m ? v : m), 0)
  return { positions, totalHeight }
})

const scrollEl = ref<HTMLElement | null>(null)
const scrollY = ref(0)
const viewportH = ref(typeof window !== 'undefined' ? window.innerHeight : 800)
let rafId: number | null = null

// Base Layer：scrollMargin 追踪。Masonry 永远是 window scroll，enabled 恒为 true。
// （window resize + body ResizeObserver 由 composable 自管理 + 卸载清理）
const { scrollMargin } = useWindowScrollMargin(scrollEl, () => true)

function onScroll() {
  if (rafId !== null) return
  rafId = requestAnimationFrame(() => {
    scrollY.value = window.scrollY
    rafId = null
  })
}

function onResize() {
  viewportH.value = window.innerHeight
}

onMounted(() => {
  if (typeof window === 'undefined') return
  scrollY.value = window.scrollY
  window.addEventListener('scroll', onScroll, { passive: true })
  window.addEventListener('resize', onResize, { passive: true })
})

onBeforeUnmount(() => {
  if (typeof window !== 'undefined') {
    window.removeEventListener('scroll', onScroll)
    window.removeEventListener('resize', onResize)
  }
  if (rafId !== null) {
    cancelAnimationFrame(rafId)
    rafId = null
  }
})

// 可视范围内的项（含 overscan）：
// 本组件 Y 坐标系从 0（容器顶）开始；窗口里看到的容器顶 Y =
// scrollY - scrollMargin（scrollMargin 是容器在文档里的偏移）。
// 所以可视区间 [vTop, vBottom] 是容器内坐标。
const visibleItems = computed(() => {
  const vTop = scrollY.value - scrollMargin.value - props.overscan
  const vBottom = scrollY.value - scrollMargin.value + viewportH.value + props.overscan
  return layout.value.positions.filter(p => p.top + p.height >= vTop && p.top <= vBottom)
})

// Base Layer：触底加载哨兵（sentinel + IntersectionObserver + items.length 兜底）
const { sentinel: loadMoreSentinel } = useLoadMoreSentinel({
  itemsLength: () => props.items.length,
  onFire: () => emit('loadMore'),
})

defineExpose({
  getScrollElement: () => scrollEl.value,
  getLayout: () => layout.value,
  cols,
})

const gapStr = computed(() => `${props.gap}px`)
</script>

<template>
  <div ref="scrollEl" style="position: relative; width: 100%">
    <slot v-if="!items.length" name="empty" />

    <!-- 撑出总高度，让滚动条反映真实长度 -->
    <div :style="{ position: 'relative', height: `${layout.totalHeight}px`, width: '100%' }">
      <div
        v-for="p in visibleItems"
        :key="String(p.key)"
        :data-index="p.index"
        :style="{
          position: 'absolute',
          top: `${p.top}px`,
          left: `${p.leftPct}%`,
          width: `${p.widthPct}%`,
          height: `${p.height}px`,
          paddingRight: p.col < cols - 1 ? gapStr : '0',
          paddingBottom: gapStr,
          boxSizing: 'border-box',
          contain: 'layout style',
        }"
      >
        <slot name="item" :item="p.item" :index="p.index" />
      </div>
    </div>

    <div
      v-if="items.length"
      ref="loadMoreSentinel"
      aria-hidden="true"
      style="height: 1px; width: 100%"
    />

    <slot name="loading" />
  </div>
</template>
