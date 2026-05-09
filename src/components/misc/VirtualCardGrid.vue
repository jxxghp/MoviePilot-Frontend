<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    items: any[]
    minItemWidth?: number
    itemAspectRatio?: number
    estimatedItemHeight?: number
    scrollToIndex?: number
    gap?: number
    overscanRows?: number
    getItemKey?: (item: any, index: number) => string | number
  }>(),
  {
    minItemWidth: 144,
    itemAspectRatio: 1.5,
    estimatedItemHeight: undefined,
    scrollToIndex: undefined,
    gap: 16,
    overscanRows: 4,
    getItemKey: undefined,
  },
)

const containerRef = ref<HTMLElement | null>(null)
const columnCount = ref(1)
const itemWidth = ref(props.minItemWidth)
const itemHeight = ref(props.minItemWidth * props.itemAspectRatio)
const startIndex = ref(0)
const endIndex = ref(0)

let resizeObserver: ResizeObserver | null = null
let animationFrameId: number | null = null

const effectiveItemHeight = computed(() => props.estimatedItemHeight ?? itemHeight.value)
const rowStep = computed(() => effectiveItemHeight.value + props.gap)
const totalRows = computed(() => Math.ceil(props.items.length / columnCount.value))

const visibleItems = computed(() => props.items.slice(startIndex.value, endIndex.value))

const renderedRowCount = computed(() => {
  if (!visibleItems.value.length) {
    return 0
  }

  return Math.ceil(visibleItems.value.length / columnCount.value)
})

const totalContentHeight = computed(() => {
  if (!totalRows.value) {
    return 0
  }

  return totalRows.value * rowStep.value - props.gap
})

const topPadding = computed(() => {
  if (!startIndex.value) {
    return 0
  }

  return Math.floor(startIndex.value / columnCount.value) * rowStep.value
})

const renderedHeight = computed(() => {
  if (!renderedRowCount.value) {
    return 0
  }

  return renderedRowCount.value * rowStep.value - props.gap
})

const bottomPadding = computed(() => {
  return Math.max(totalContentHeight.value - topPadding.value - renderedHeight.value, 0)
})

const gridStyle = computed(() => ({
  columnGap: `${props.gap}px`,
  gridTemplateColumns: `repeat(${columnCount.value}, minmax(0, 1fr))`,
  paddingBottom: `${bottomPadding.value}px`,
  paddingTop: `${topPadding.value}px`,
  rowGap: `${props.gap}px`,
}))

function resolveItemKey(item: any, index: number) {
  if (props.getItemKey) {
    return props.getItemKey(item, startIndex.value + index)
  }

  return startIndex.value + index
}

function syncVisibleRange() {
  if (typeof window === 'undefined') {
    return
  }

  const container = containerRef.value
  if (!container || props.items.length === 0) {
    startIndex.value = 0
    endIndex.value = 0
    return
  }

  const containerWidth = container.clientWidth
  if (!containerWidth) {
    return
  }

  const columns = Math.max(1, Math.floor((containerWidth + props.gap) / (props.minItemWidth + props.gap)))
  columnCount.value = columns
  itemWidth.value = (containerWidth - props.gap * (columns - 1)) / columns
  itemHeight.value = props.estimatedItemHeight ?? itemWidth.value * props.itemAspectRatio

  const rowHeight = rowStep.value || 1
  const containerTop = window.scrollY + container.getBoundingClientRect().top
  const viewportTop = window.scrollY - containerTop
  const viewportBottom = viewportTop + window.innerHeight
  const startRow = Math.max(0, Math.floor(viewportTop / rowHeight) - props.overscanRows)
  const endRow = Math.min(totalRows.value, Math.ceil(viewportBottom / rowHeight) + props.overscanRows)
  const endRowExclusive = Math.max(startRow + 1, endRow)

  startIndex.value = Math.min(props.items.length, startRow * columns)
  endIndex.value = Math.min(props.items.length, endRowExclusive * columns)
}

function queueSyncVisibleRange() {
  if (typeof window === 'undefined' || animationFrameId !== null) {
    return
  }

  animationFrameId = window.requestAnimationFrame(() => {
    animationFrameId = null
    syncVisibleRange()
  })
}

function scrollToItemIndex(index: number) {
  if (typeof window === 'undefined') {
    return
  }

  const container = containerRef.value
  if (!container || props.items.length === 0 || index < 0) {
    return
  }

  syncVisibleRange()

  const safeIndex = Math.min(index, props.items.length - 1)
  const targetRow = Math.floor(safeIndex / columnCount.value)
  const targetTop = window.scrollY + container.getBoundingClientRect().top + targetRow * rowStep.value

  window.scrollTo({
    top: Math.max(targetTop - props.gap, 0),
    behavior: 'auto',
  })

  queueSyncVisibleRange()
}

onMounted(() => {
  queueSyncVisibleRange()
  window.addEventListener('scroll', queueSyncVisibleRange, { passive: true })

  resizeObserver = new ResizeObserver(() => {
    queueSyncVisibleRange()
  })

  if (containerRef.value) {
    resizeObserver.observe(containerRef.value)
  }
})

onUnmounted(() => {
  if (typeof window !== 'undefined') {
    window.removeEventListener('scroll', queueSyncVisibleRange)

    if (animationFrameId !== null) {
      window.cancelAnimationFrame(animationFrameId)
      animationFrameId = null
    }
  }

  resizeObserver?.disconnect()
  resizeObserver = null
})

watch(
  [
    () => props.items.length,
    () => props.minItemWidth,
    () => props.itemAspectRatio,
    () => props.estimatedItemHeight,
    () => props.gap,
  ],
  () => {
    nextTick(() => {
      queueSyncVisibleRange()
    })
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
      scrollToItemIndex(scrollToIndex)
    })
  },
  { immediate: true },
)
</script>

<template>
  <div ref="containerRef" class="virtual-card-grid">
    <div class="grid" :style="gridStyle">
      <template v-for="(item, index) in visibleItems" :key="resolveItemKey(item, index)">
        <slot :item="item" :index="startIndex + index" />
      </template>
    </div>
  </div>
</template>

<style scoped>
.virtual-card-grid {
  inline-size: 100%;
}
</style>
