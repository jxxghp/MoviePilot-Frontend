<!--
  ============================================================
  VirtualList - @tanstack/vue-virtual 一维虚拟列表兼容层
  ============================================================

  设计目标：
    - 把 headless 的 useVirtualizer 封装成 slot 式 SFC
    - 业务侧只关心「一项 item 长什么样」
    - 支持两种滚动模式：容器内 scroll（默认）+ 页面 window scroll（useWindowScroll=true）
    - 内置触底加载（@load-more）
    - 内置 Layout Jump 防护（measureElement + scroll anchoring）
    - 内置 Scroll-back Blank 防护（overscroll-behavior + 暴露 scrollTo* 命令式 API）

  典型用法（容器内 scroll，对话框/弹窗）：
    <VirtualList :items="list" :estimate-size="104" key-field="id"
                 container-height="60vh" @load-more="loadMore">
      <template #item="{ item }"> ... </template>
    </VirtualList>

  典型用法（页面级 window scroll，路由主页）：
    <VirtualList :items="list" :estimate-size="120" key-field="id"
                 use-window-scroll @load-more="loadMore">
      <template #item="{ item }"> ... </template>
    </VirtualList>
-->

<script setup lang="ts" generic="T extends Record<string, any>">
import { computed, ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { useVirtualizer, useWindowVirtualizer, type VirtualItem } from '@tanstack/vue-virtual'
import { useIntersectionObserver } from '@vueuse/core'

const props = withDefaults(
  defineProps<{
    items: T[]
    /** 估算每项高度（px）。不定高时仍需给估算值，库自动用 measureElement 校正 */
    estimateSize?: number
    /** 视口外预渲染项数。调高减少回滚白屏，调低减少内存 */
    overscan?: number
    /** key 字段名，强烈建议传 */
    keyField?: keyof T
    /** 容器内 scroll 模式下的容器高度（useWindowScroll=false 时生效） */
    containerHeight?: string | number
    /** 末尾还剩多少项时触发 load-more */
    loadMoreThreshold?: number
    /**
     * 反向加载阈值：当首项 index 小于等于该值时触发 load-more-reverse。
     * 用途：聊天/消息流场景，滚动到顶端加载更早的内容（如 MessageView）。
     * 0 = 禁用反向加载（默认）。
     */
    loadMoreReverseThreshold?: number
    /**
     * 使用页面 window scroll（路由主页推荐）。
     * - true: 不在内部生成滚动条，跟随页面滚动，自动用 scrollMargin 校正
     * - false（默认）: 在内部生成固定高度滚动容器（适合对话框/抽屉）
     */
    useWindowScroll?: boolean
  }>(),
  {
    estimateSize: 100,
    overscan: 5,
    containerHeight: '100%',
    loadMoreThreshold: 5,
    loadMoreReverseThreshold: 0,
    useWindowScroll: false,
  },
)

const emit = defineEmits<{
  loadMore: []
  loadMoreReverse: []
  scroll: [event: Event]
}>()

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

// 必须根据 useWindowScroll 切换：scroll 事件不冒泡到 <html>，
// useVirtualizer + document.scrollingElement 会让 virtualizer 永远以为
// scrollOffset=0 → 虚拟化失效。
const virtualizer = (props.useWindowScroll
  ? useWindowVirtualizer({
      get count() {
        return props.items.length
      },
      estimateSize: () => props.estimateSize,
      get overscan() {
        return props.overscan
      },
      get scrollMargin() {
        return scrollMargin.value
      },
      getItemKey: (i: number) =>
        props.keyField ? (props.items[i]?.[props.keyField] as string | number) : i,
    })
  : useVirtualizer({
      get count() {
        return props.items.length
      },
      getScrollElement: () => scrollEl.value,
      estimateSize: () => props.estimateSize,
      get overscan() {
        return props.overscan
      },
      get scrollMargin() {
        return scrollMargin.value
      },
      getItemKey: (i: number) =>
        props.keyField ? (props.items[i]?.[props.keyField] as string | number) : i,
    })) as unknown as ReturnType<typeof useVirtualizer<Element, Element>>

const totalSize = computed(() => virtualizer.value.getTotalSize())
const virtualItems = computed<VirtualItem[]>(() => virtualizer.value.getVirtualItems())

/**
 * 触底 / 触顶加载哨兵：
 * sentinel 在视口内 + items 自上次 fire 起已变化 → fire；
 * sentinel 离开视口 → 解锁；
 * 关键：IntersectionObserver 只在 isIntersecting 边沿变化时回调，
 * 短列表里 sentinel 可能持续 intersecting，需要 items.length watcher 兜底
 * 让 tryFire 重新评估，否则只能 fire 一次后死锁。
 * 业务侧的 loadMore / loadMoreReverse 仍需自己持有 loading 锁防并发。
 */
const loadMoreSentinel = ref<HTMLElement | null>(null)
const loadMoreReverseSentinel = ref<HTMLElement | null>(null)
let isSentinelIntersecting = false
let isReverseSentinelIntersecting = false
let lastFireItemsLen = -1
let lastReverseFireItemsLen = -1

const sentinelRoot = computed(() => (props.useWindowScroll ? null : scrollEl.value))

function tryFireLoadMore() {
  if (!isSentinelIntersecting) return
  if (lastFireItemsLen >= 0 && props.items.length === lastFireItemsLen) return
  lastFireItemsLen = props.items.length
  emit('loadMore')
}

function tryFireLoadMoreReverse() {
  if (props.loadMoreReverseThreshold <= 0) return
  if (!isReverseSentinelIntersecting) return
  if (lastReverseFireItemsLen >= 0 && props.items.length === lastReverseFireItemsLen) return
  lastReverseFireItemsLen = props.items.length
  emit('loadMoreReverse')
}

useIntersectionObserver(
  loadMoreSentinel,
  ([entry]: IntersectionObserverEntry[]) => {
    isSentinelIntersecting = entry.isIntersecting
    if (isSentinelIntersecting) tryFireLoadMore()
  },
  { root: sentinelRoot, rootMargin: '200px', threshold: 0 },
)

useIntersectionObserver(
  loadMoreReverseSentinel,
  ([entry]: IntersectionObserverEntry[]) => {
    isReverseSentinelIntersecting = entry.isIntersecting
    if (isReverseSentinelIntersecting) tryFireLoadMoreReverse()
  },
  { root: sentinelRoot, rootMargin: '200px', threshold: 0 },
)

watch(
  () => props.items.length,
  (len: number) => {
    if (len === 0) {
      lastFireItemsLen = -1
      lastReverseFireItemsLen = -1
      return
    }
    nextTick(() => {
      tryFireLoadMore()
      tryFireLoadMoreReverse()
    })
  },
)

function measureRef(el: any) {
  if (el instanceof HTMLElement) {
    virtualizer.value.measureElement(el)
  } else {
    // 项卸载时 Vue 用 null 调用本回调。必须把 null 转发给 measureElement，
    // 否则 @tanstack/virtual-core 永远不会执行 elementsCache 的清理分支
    // （它只在 measureElement(null) 时遍历并 unobserve 掉 !isConnected 的元素）。
    // 不转发的话 ResizeObserver 会强引用每一个曾渲染过的项元素，
    // detached DOM 无法 GC → 钉住其下所有 Vue 组件实例（内存泄漏根因）。
    virtualizer.value.measureElement(null)
  }
}

defineExpose({
  scrollToIndex: (idx: number, opts?: { align?: 'start' | 'center' | 'end' | 'auto' }) =>
    virtualizer.value.scrollToIndex(idx, opts),
  scrollToOffset: (px: number) => virtualizer.value.scrollToOffset(px),
  getScrollElement: () => scrollEl.value,
  getVirtualizer: () => virtualizer.value,
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

    <!-- 顶部 sentinel：反向加载（聊天往上加载）-->
    <div
      v-if="items.length && loadMoreReverseThreshold > 0"
      ref="loadMoreReverseSentinel"
      aria-hidden="true"
      style="height: 1px; width: 100%"
    />

    <div :style="{ height: `${totalSize}px`, position: 'relative', width: '100%' }">
      <div
        v-for="v in virtualItems"
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
        <slot name="item" :item="items[v.index]" :index="v.index" :virtual="v" />
      </div>
    </div>

    <!-- 底部 sentinel：触底加载 -->
    <div
      v-if="items.length"
      ref="loadMoreSentinel"
      aria-hidden="true"
      style="height: 1px; width: 100%"
    />

    <slot name="loading" />
  </div>
</template>
