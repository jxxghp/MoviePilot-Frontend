<!--
  ============================================================
  VirtualGrid - @tanstack/vue-virtual 二维虚拟网格兼容层
  ============================================================

  设计目标：
    - 内部把扁平 items[] 按 Vuetify 响应式断点打包成 rows[][]
    - 对业务屏蔽 row chunking 细节，业务只写「一项卡片」
    - 网格只在垂直方向虚拟化（行），水平方向用 CSS Grid 等分
    - 支持两种滚动模式：容器内 scroll（默认）+ 页面 window scroll（useWindowScroll=true）

  典型用法（路由主页，window scroll）：
    <VirtualGrid :items="dataList"
                 :breakpoints="{ xs: 2, sm: 3, md: 4, lg: 5, xl: 6 }"
                 :row-estimate-size="320" key-field="id"
                 use-window-scroll @load-more="fetchData">
      <template #item="{ item }"> <MediaCard :media="item" /> </template>
    </VirtualGrid>
-->

<script setup lang="ts" generic="T extends Record<string, any>">
import { computed, ref } from 'vue'
import { useDisplay } from 'vuetify'
import { useWindowScrollMargin } from '@/composables/virtual/useWindowScrollMargin'
import { useLoadMoreSentinel } from '@/composables/virtual/useLoadMoreSentinel'
import { useVirtualizerBridge } from '@/composables/virtual/useVirtualizerBridge'

interface Breakpoints {
  xs?: number
  sm?: number
  md?: number
  lg?: number
  xl?: number
  xxl?: number
}

const props = withDefaults(
  defineProps<{
    items: T[]
    /** Vuetify 断点对应列数 */
    breakpoints?: Breakpoints
    /** 行高估算（px） */
    rowEstimateSize?: number
    /** 卡片间距 + 容器内边距 */
    gap?: number | string
    /** 视口外预渲染的行数 */
    overscan?: number
    /** key 字段名 */
    keyField?: keyof T
    /** 容器内 scroll 模式下的容器高度（useWindowScroll=false 时生效） */
    containerHeight?: string | number
    /** 末尾还剩多少行时触发 load-more */
    loadMoreThreshold?: number
    /** 使用页面 window scroll（路由主页推荐） */
    useWindowScroll?: boolean
  }>(),
  {
    breakpoints: () => ({ xs: 2, sm: 3, md: 4, lg: 5, xl: 6, xxl: 6 }),
    rowEstimateSize: 320,
    gap: 12,
    overscan: 3,
    containerHeight: '100%',
    loadMoreThreshold: 3,
    useWindowScroll: false,
  },
)

const emit = defineEmits<{ loadMore: []; scroll: [event: Event] }>()

const display = useDisplay()

const cols = computed(() => {
  const bp = props.breakpoints
  if (display.xs.value) return bp.xs ?? 2
  if (display.sm.value) return bp.sm ?? 3
  if (display.md.value) return bp.md ?? 4
  if (display.lg.value) return bp.lg ?? 5
  if (display.xl.value) return bp.xl ?? 6
  return bp.xxl ?? 6
})

const rows = computed<T[][]>(() => {
  const n = cols.value
  const list = props.items
  const out: T[][] = []
  for (let i = 0; i < list.length; i += n) {
    out.push(list.slice(i, i + n))
  }
  return out
})

const scrollEl = ref<HTMLElement | null>(null)

// Base Layer：scrollMargin 追踪（window resize + body ResizeObserver 自管理 + 卸载清理）
const { scrollMargin } = useWindowScrollMargin(scrollEl, () => props.useWindowScroll)

// Base Layer：tanstack 桥接（useVirtualizer/useWindowVirtualizer 二选一 + measureRef null 转发）
// 网格只在垂直方向虚拟化「行」，不传 getItemKey（key 由 rowItemKey 打在内层卡片上）。
const { virtualizer, totalSize, virtualItems: virtualRows, measureRef } = useVirtualizerBridge({
  count: () => rows.value.length,
  estimateSize: () => props.rowEstimateSize,
  overscan: () => props.overscan,
  scrollMargin: () => scrollMargin.value,
  getScrollElement: () => scrollEl.value,
  useWindowScroll: props.useWindowScroll,
})

// Base Layer：触底加载哨兵（sentinel + IntersectionObserver + items.length 兜底）
const { sentinel: loadMoreSentinel } = useLoadMoreSentinel({
  itemsLength: () => props.items.length,
  onFire: () => emit('loadMore'),
})

function rowItemKey(item: T, rowIdx: number, colIdx: number): string | number {
  if (props.keyField) {
    const k = (item as Record<string, any>)[props.keyField as string]
    if (typeof k === 'string' || typeof k === 'number') return k
  }
  return `${rowIdx}-${colIdx}`
}

const gapStr = computed(() => (typeof props.gap === 'number' ? `${props.gap}px` : props.gap))

defineExpose({
  scrollToRow: (idx: number) => virtualizer.value.scrollToIndex(idx),
  scrollToIndex: (idx: number) => virtualizer.value.scrollToIndex(idx),
  scrollToOffset: (px: number) => virtualizer.value.scrollToOffset(px),
  getScrollElement: () => scrollEl.value,
  cols,
})

const containerStyle = computed(() => {
  if (props.useWindowScroll) {
    return {
      position: 'relative' as const,
      width: '100%' as const,
    }
  }
  return {
    height:
      typeof props.containerHeight === 'number'
        ? `${props.containerHeight}px`
        : props.containerHeight,
    overflow: 'auto' as const,
    overscrollBehavior: 'contain' as const,
    willChange: 'transform' as const,
  }
})
</script>

<template>
  <div ref="scrollEl" :style="containerStyle" @scroll="emit('scroll', $event)">
    <slot v-if="!items.length" name="empty" />

    <div :style="{ height: `${totalSize}px`, position: 'relative', width: '100%' }">
      <div
        v-for="v in virtualRows"
        :key="String(v.key)"
        :data-index="v.index"
        :ref="measureRef"
        :style="{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          transform: `translateY(${v.start - scrollMargin}px)`,
          contain: 'layout style',
        }"
      >
        <div
          :style="{
            display: 'grid',
            gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
            gap: gapStr,
            paddingBottom: gapStr,
          }"
        >
          <template
            v-for="(item, i) in rows[v.index]"
            :key="rowItemKey(item, v.index, i)"
          >
            <slot name="item" :item="item" :row-index="v.index" :col-index="i" />
          </template>
        </div>
      </div>
    </div>

    <!-- 底部 sentinel：进入视口触发 loadMore，比 watch(virtualRows) 更可靠 -->
    <div
      v-if="items.length"
      ref="loadMoreSentinel"
      aria-hidden="true"
      style="height: 1px; width: 100%"
    />

    <slot name="loading" />
  </div>
</template>
