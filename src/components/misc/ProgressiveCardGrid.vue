<script setup lang="ts">
import { useIntersectionObserver } from '@vueuse/core'

const props = withDefaults(
  defineProps<{
    items: any[]
    minItemWidth?: number
    itemAspectRatio?: number
    estimatedItemHeight?: number
    scrollToIndex?: number
    gap?: number
    initialCount?: number
    batchSize?: number
    overscanRows?: number
    getItemKey?: (item: any, index: number) => string | number
  }>(),
  {
    minItemWidth: 144,
    itemAspectRatio: 1.5,
    estimatedItemHeight: undefined,
    scrollToIndex: undefined,
    gap: 16,
    initialCount: 24,
    batchSize: 24,
    overscanRows: 4,
    getItemKey: undefined,
  },
)

const containerRef = ref<HTMLElement | null>(null)
const sentinelRef = ref<HTMLElement | null>(null)
const renderedCount = ref(0)

let animationFrameId: number | null = null

const safeInitialCount = computed(() => Math.max(1, props.initialCount))
const safeBatchSize = computed(() => Math.max(1, props.batchSize))
const hasMoreItems = computed(() => renderedCount.value < props.items.length)
const visibleItems = computed(() => props.items.slice(0, renderedCount.value))

const gridStyle = computed(() => ({
  columnGap: `${props.gap}px`,
  gridTemplateColumns: `repeat(auto-fill, minmax(${props.minItemWidth}px, 1fr))`,
  rowGap: `${props.gap}px`,
}))

function getComparableKey(item: any, index: number) {
  if (props.getItemKey) {
    return props.getItemKey(item, index)
  }

  return index
}

function resolveItemKey(item: any, index: number) {
  return getComparableKey(item, index)
}

function appendNextBatch() {
  renderedCount.value = Math.min(props.items.length, renderedCount.value + safeBatchSize.value)
}

function hasPageScroll() {
  if (typeof window === 'undefined') {
    return true
  }

  const scrollHeight = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight)

  return scrollHeight - (window.innerHeight || document.documentElement.clientHeight) > 2
}

async function fillViewport() {
  if (typeof window === 'undefined') {
    return
  }

  const maxIterations = Math.ceil(props.items.length / safeBatchSize.value)
  let iterations = 0

  while (!hasPageScroll() && hasMoreItems.value && iterations < maxIterations) {
    appendNextBatch()
    iterations += 1
    await nextTick()
  }
}

function queueFillViewport() {
  if (typeof window === 'undefined' || animationFrameId !== null) {
    return
  }

  animationFrameId = window.requestAnimationFrame(() => {
    animationFrameId = null
    void fillViewport()
  })
}

async function revealItem(index: number) {
  if (typeof window === 'undefined' || index < 0 || index >= props.items.length) {
    return
  }

  const minRenderedCount = Math.ceil((index + 1) / safeBatchSize.value) * safeBatchSize.value
  renderedCount.value = Math.min(props.items.length, Math.max(renderedCount.value, minRenderedCount))

  await nextTick()

  const target = containerRef.value?.querySelector(`[data-progressive-grid-index="${index}"]`)
  if (target instanceof HTMLElement) {
    target.scrollIntoView({
      behavior: 'auto',
      block: 'start',
      inline: 'nearest',
    })
  }
}

function resetVisibleItems() {
  renderedCount.value = Math.min(props.items.length, safeInitialCount.value)

  nextTick(() => {
    if (props.scrollToIndex !== undefined && props.scrollToIndex >= 0) {
      void revealItem(props.scrollToIndex)
      return
    }

    queueFillViewport()
  })
}

function didItemsAppend(nextItems: any[], previousItems: any[]) {
  if (!previousItems.length || nextItems.length < previousItems.length) {
    return false
  }

  return previousItems.every((item, index) => getComparableKey(item, index) === getComparableKey(nextItems[index], index))
}

function syncVisibleItems(nextItems: any[], previousItems: any[] = []) {
  if (didItemsAppend(nextItems, previousItems)) {
    renderedCount.value = Math.min(nextItems.length, Math.max(renderedCount.value, previousItems.length))

    nextTick(() => {
      if (props.scrollToIndex !== undefined && props.scrollToIndex >= 0) {
        void revealItem(props.scrollToIndex)
        return
      }

      queueFillViewport()
    })

    return
  }

  resetVisibleItems()
}

const { stop } = useIntersectionObserver(
  sentinelRef,
  ([entry]) => {
    if (!entry?.isIntersecting || !hasMoreItems.value) {
      return
    }

    appendNextBatch()
    queueFillViewport()
  },
  {
    rootMargin: '1200px 0px',
  },
)

onMounted(() => {
  window.addEventListener('resize', queueFillViewport, { passive: true })
})

onUnmounted(() => {
  stop()
  window.removeEventListener('resize', queueFillViewport)

  if (animationFrameId !== null) {
    window.cancelAnimationFrame(animationFrameId)
    animationFrameId = null
  }
})

watch(
  [
    () => props.minItemWidth,
    () => props.initialCount,
    () => props.batchSize,
  ],
  () => {
    queueFillViewport()
  },
  { immediate: true },
)

watch(
  () => props.items,
  (nextItems, previousItems) => {
    syncVisibleItems(nextItems, previousItems)
  },
  { immediate: true },
)

watch(
  [() => props.scrollToIndex, () => props.items.length],
  ([scrollToIndex]) => {
    if (scrollToIndex === undefined || scrollToIndex < 0) {
      return
    }

    nextTick(() => {
      void revealItem(scrollToIndex)
    })
  },
  { immediate: true },
)
</script>

<template>
  <div ref="containerRef" class="progressive-card-grid">
    <div class="grid" :style="gridStyle">
      <div
        v-for="(item, index) in visibleItems"
        :key="resolveItemKey(item, index)"
        class="progressive-card-grid__item"
        :data-progressive-grid-index="index"
      >
        <slot :item="item" :index="index" />
      </div>
    </div>
    <div v-if="hasMoreItems" ref="sentinelRef" class="progressive-card-grid__sentinel" aria-hidden="true" />
  </div>
</template>

<style scoped>
.progressive-card-grid {
  inline-size: 100%;
}

.progressive-card-grid__item {
  min-inline-size: 0;
}

.progressive-card-grid__sentinel {
  block-size: 1px;
  inline-size: 100%;
}
</style>
