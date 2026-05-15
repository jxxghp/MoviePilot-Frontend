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
import { computed, ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { useDisplay } from 'vuetify'
import { useVirtualizer, useWindowVirtualizer } from '@tanstack/vue-virtual'
import { useIntersectionObserver } from '@vueuse/core'

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
const scrollMargin = ref(0)
let resizeObserver: ResizeObserver | null = null

function updateScrollMargin() {
  if (!props.useWindowScroll || !scrollEl.value || typeof window === 'undefined') {
    scrollMargin.value = 0
    return
  }
  scrollMargin.value = scrollEl.value.getBoundingClientRect().top + window.scrollY
}

onMounted(() => {
  updateScrollMargin()
  if (props.useWindowScroll && typeof window !== 'undefined') {
    window.addEventListener('resize', updateScrollMargin, { passive: true })
    resizeObserver = new ResizeObserver(updateScrollMargin)
    if (document.body) resizeObserver.observe(document.body)
  }
})

onBeforeUnmount(() => {
  if (typeof window !== 'undefined') {
    window.removeEventListener('resize', updateScrollMargin)
  }
  resizeObserver?.disconnect()
  resizeObserver = null
})

// 必须根据 useWindowScroll 选择不同 virtualizer：
//   - useVirtualizer: 监听传入 element 的 scroll 事件
//   - useWindowVirtualizer: 监听 window 的 scroll 事件
// 早期版本用 useVirtualizer + getScrollElement: document.scrollingElement 是错的——
// scroll 事件不冒泡到 <html> 元素，virtualizer 永远以为 scrollOffset=0，
// 于是渲染整个列表（virtualization 完全失效）。
const virtualizer = (props.useWindowScroll
  ? useWindowVirtualizer({
      get count() {
        return rows.value.length
      },
      estimateSize: () => props.rowEstimateSize,
      get overscan() {
        return props.overscan
      },
      get scrollMargin() {
        return scrollMargin.value
      },
    })
  : useVirtualizer({
      get count() {
        return rows.value.length
      },
      getScrollElement: () => scrollEl.value,
      estimateSize: () => props.rowEstimateSize,
      get overscan() {
        return props.overscan
      },
      get scrollMargin() {
        return scrollMargin.value
      },
    })) as unknown as ReturnType<typeof useVirtualizer<Element, Element>>

const totalSize = computed(() => virtualizer.value.getTotalSize())
const virtualRows = computed(() => virtualizer.value.getVirtualItems())

// loadMore 触发：底部 sentinel + IntersectionObserver
// 原 watch(virtualRows) 在小数据/大列宽时死锁（所有 rows 都在 overscan 内时
// virtualRows 数组永不变化）。改用 DOM sentinel 视口可见性，规则：
//   - sentinel 在视口内 + items 自上次 fire 以来已增长 → fire
//   - sentinel 离开视口 → 解锁
//   - sentinel 在视口内 + items 未变化（fetch 在途或 hasMore=false）→ 跳过
// 关键点：IntersectionObserver 只在 isIntersecting 边沿变化时回调，
// 所以"items 已增长但 sentinel 还没离开视口"的情况要靠 items.length watcher 兜底，
// 它会调用 tryFire 让短页继续把首屏填满。
const loadMoreSentinel = ref<HTMLElement | null>(null)
let isSentinelIntersecting = false
let lastFireItemsLen = -1

function tryFireLoadMore() {
  if (!isSentinelIntersecting) return
  if (lastFireItemsLen >= 0 && props.items.length === lastFireItemsLen) return
  lastFireItemsLen = props.items.length
  emit('loadMore')
}

useIntersectionObserver(
  loadMoreSentinel,
  ([entry]: IntersectionObserverEntry[]) => {
    isSentinelIntersecting = entry.isIntersecting
    if (isSentinelIntersecting) tryFireLoadMore()
  },
  { rootMargin: '200px', threshold: 0 },
)

// items.length 变化时也尝试触发——覆盖"短页且 sentinel 一直在视口"的情况：
//   sentinel 持续 intersecting 不会再触发 IntersectionObserver 回调，
//   只有 watch(items.length) 能让 tryFire 重新评估。
watch(
  () => props.items.length,
  (len: number) => {
    if (len === 0) {
      // 列表清空（如换搜索词）→ 重置全部锁状态
      lastFireItemsLen = -1
      return
    }
    // 等下一帧，让 DOM 完成布局后再判断 sentinel 位置
    nextTick(() => tryFireLoadMore())
  },
)

function measureRef(el: any) {
  if (el instanceof HTMLElement) {
    virtualizer.value.measureElement(el)
  } else {
    // 行卸载时 Vue 用 null 调用本回调。必须把 null 转发给 measureElement，
    // 否则 @tanstack/virtual-core 永远不会执行 elementsCache 的清理分支
    // （它只在 measureElement(null) 时遍历并 unobserve 掉 !isConnected 的元素）。
    // 不转发的话 ResizeObserver 会强引用每一个曾渲染过的行元素，
    // detached DOM 无法 GC → 钉住其下所有 Vue 组件实例（内存泄漏根因）。
    virtualizer.value.measureElement(null)
  }
}

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
