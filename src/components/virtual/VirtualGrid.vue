<!--
  ============================================================
  VirtualGrid - @tanstack/vue-virtual 二维虚拟网格兼容层
  ============================================================

  设计目标：
    - 内部把扁平 items[] 按外部传入的 `columns` 数值打包成 rows[][]
    - 对业务屏蔽 row chunking 细节，业务只写「一项卡片」
    - 网格只在垂直方向虚拟化（行），水平方向用 CSS Grid 等分
    - 支持两种滚动模式：容器内 scroll（默认）+ 页面 window scroll（useWindowScroll=true）
    - 不感知容器：组件本身不读视口、不测自身宽度。
      cols 由调用方算好喂进来（useBreakpointCols / useResponsiveCols / 显式数值）。
      容器自适应需求请用 <AutoSizer> 或 useResponsiveCols。

  典型用法（路由主页，window scroll，视口断点决定列数）：
    <script setup>
    const cols = useBreakpointCols({ xs: 2, sm: 3, md: 4, lg: 5, xl: 6 })
    </script>
    <template>
      <VirtualGrid :items="dataList" :columns="cols"
                   :row-estimate-size="320" key-field="id"
                   use-window-scroll @load-more="fetchData">
        <template #item="{ item }"> <MediaCard :media="item" /> </template>
      </VirtualGrid>
    </template>

  典型用法（dashboard 卡片，容器宽度决定列数）：
    <AutoSizer #default="{ width }">
      <VirtualGrid :columns="Math.max(1, Math.floor(width / 240))"
                   :items="data" :container-height="'10rem'" ... />
    </AutoSizer>
-->

<script setup lang="ts" generic="T extends Record<string, any>">
import { computed, ref } from 'vue'
import { useWindowScrollMargin } from '@/composables/virtual/useWindowScrollMargin'
import { useLoadMoreSentinel } from '@/composables/virtual/useLoadMoreSentinel'
import { useVirtualizerBridge } from '@/composables/virtual/useVirtualizerBridge'

const props = withDefaults(
  defineProps<{
    items: T[]
    /** 列数（必填）。调用方用 useBreakpointCols / useResponsiveCols / 显式数值喂进来 */
    columns: number
    /** 行高估算（px） */
    rowEstimateSize?: number
    /** 卡片间距 + 容器内边距 */
    gap?: number | string
    /** 视口外预渲染的行数 */
    overscan?: number
    /** key 字段名。若同时给了 getItemKey 则后者优先 */
    keyField?: keyof T
    /**
     * 取 key 的函数式入口，优先级高于 keyField。
     * 用于 fallback 链场景，如 `(item) => item.id || item.link || item.title`。
     * `index` 是 item 在扁平 items[] 中的 0 起始下标。
     */
    getItemKey?: (item: T, index: number) => string | number
    /** 容器内 scroll 模式下的容器高度（useWindowScroll=false 时生效） */
    containerHeight?: string | number
    /** 使用页面 window scroll（路由主页推荐） */
    useWindowScroll?: boolean
  }>(),
  {
    rowEstimateSize: 320,
    gap: 12,
    overscan: 3,
    containerHeight: '100%',
    useWindowScroll: false,
  },
)

const emit = defineEmits<{ loadMore: []; scroll: [event: Event] }>()

// 列数兜底为 1，避免外部传 0/负数时切片死循环
const cols = computed(() => Math.max(1, Math.floor(props.columns) || 1))

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
  // 优先级：getItemKey 函数 > keyField 字段 > 位置 fallback
  if (props.getItemKey) {
    const k = props.getItemKey(item, rowIdx * cols.value + colIdx)
    if (typeof k === 'string' || typeof k === 'number') return k
  }
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
