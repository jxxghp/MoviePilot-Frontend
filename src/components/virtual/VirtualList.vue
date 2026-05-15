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
import { computed, ref } from 'vue'
import { useWindowScrollMargin } from '@/composables/virtual/useWindowScrollMargin'
import { useLoadMoreSentinel } from '@/composables/virtual/useLoadMoreSentinel'
import { useVirtualizerBridge } from '@/composables/virtual/useVirtualizerBridge'

const props = withDefaults(
  defineProps<{
    items: T[]
    /** 估算每项高度（px）。不定高时仍需给估算值，库自动用 measureElement 校正 */
    estimateSize?: number
    /** 视口外预渲染项数。调高减少回滚白屏，调低减少内存 */
    overscan?: number
    /** key 字段名，强烈建议传。若同时给了 getItemKey 则后者优先 */
    keyField?: keyof T
    /**
     * 取 key 的函数式入口，优先级高于 keyField。
     * 用途：单字段 keyField 表达不了的场景，如 fallback 链
     * `(m) => getMessageKey(m) || index`、组合 id 等。
     */
    getItemKey?: (item: T, index: number) => string | number
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

// Base Layer：scrollMargin 追踪（window resize + body ResizeObserver 自管理 + 卸载清理）
const { scrollMargin } = useWindowScrollMargin(scrollEl, () => props.useWindowScroll)

// Base Layer：tanstack 桥接（useVirtualizer/useWindowVirtualizer 二选一 + measureRef null 转发）
const { virtualizer, totalSize, virtualItems, measureRef } = useVirtualizerBridge({
  count: () => props.items.length,
  estimateSize: () => props.estimateSize,
  overscan: () => props.overscan,
  scrollMargin: () => scrollMargin.value,
  getScrollElement: () => scrollEl.value,
  useWindowScroll: props.useWindowScroll,
  // 优先级：getItemKey 函数 > keyField 字段 > index 兜底
  getItemKey: (i: number) => {
    const item = props.items[i]
    if (props.getItemKey && item !== undefined) return props.getItemKey(item, i)
    if (props.keyField && item !== undefined) return item[props.keyField] as string | number
    return i
  },
})

// Base Layer：触底加载哨兵。容器内 scroll 模式需把 IntersectionObserver root
// 指向滚动容器（window scroll 模式传 null = 视口）。
const sentinelRoot = computed(() => (props.useWindowScroll ? null : scrollEl.value))

const { sentinel: loadMoreSentinel } = useLoadMoreSentinel({
  itemsLength: () => props.items.length,
  onFire: () => emit('loadMore'),
  root: sentinelRoot,
})

// 反向加载（聊天/消息流往上加载更早内容）：再调一次哨兵，按阈值启用。
const { sentinel: loadMoreReverseSentinel } = useLoadMoreSentinel({
  itemsLength: () => props.items.length,
  onFire: () => emit('loadMoreReverse'),
  root: sentinelRoot,
  enabled: () => props.loadMoreReverseThreshold > 0,
})

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
