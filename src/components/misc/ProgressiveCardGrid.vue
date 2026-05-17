<script setup lang="ts">
import type { ComponentPublicInstance } from 'vue'

type ItemKey = string | number
type ScrollTarget = Window | HTMLElement

const props = withDefaults(
  defineProps<{
    items: any[]
    minItemWidth?: number
    itemAspectRatio?: number
    estimatedItemHeight?: number
    scrollToIndex?: number
    gap?: number
    columns?: number
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
    columns: undefined,
    initialCount: 24,
    batchSize: 24,
    overscanRows: 4,
    getItemKey: undefined,
  },
)

interface VirtualCell {
  item: any
  index: number
  key: ItemKey
}

interface VirtualRange {
  endIndex: number
  endRow: number
  startIndex: number
  startRow: number
}

const containerRef = ref<HTMLElement | null>(null)
const trackRef = ref<HTMLElement | null>(null)

const layoutWidth = ref(0)
const viewportTop = ref(0)
const viewportBottom = ref(0)
const heightVersion = ref(0)
const frozenVisibleRange = ref<VirtualRange | null>(null)
const isOverlayGrid = ref(false)

const itemHeights = new Map<ItemKey, number>()
const observedElements = new Map<HTMLElement, ItemKey>()
const keyElements = new Map<ItemKey, HTMLElement>()
const itemRefCallbacks = new Map<ItemKey, (element: Element | ComponentPublicInstance | null) => void>()

let resizeObserver: ResizeObserver | null = null
let itemResizeObserver: ResizeObserver | null = null
let overlayLockObserver: MutationObserver | null = null
let scrollTarget: ScrollTarget | null = null
let layoutFrameId: number | null = null
let scrollFrameId: number | null = null
let mounted = false
let pendingRevealIndex: number | null = null
let lastMeasuredColumnCount = 0
let lastMeasuredColumnWidth = 0

const safeGap = computed(() => Math.max(0, props.gap))
const safeMinItemWidth = computed(() => Math.max(1, props.minItemWidth))
const safeOverscanRows = computed(() => Math.max(1, props.overscanRows))

const columnCount = computed(() => {
  if (props.columns && props.columns > 0) {
    return Math.max(1, Math.floor(props.columns))
  }

  if (!layoutWidth.value) {
    return 1
  }

  return Math.max(1, Math.floor((layoutWidth.value + safeGap.value) / (safeMinItemWidth.value + safeGap.value)))
})

const columnWidth = computed(() => {
  const columns = columnCount.value
  const width = layoutWidth.value || safeMinItemWidth.value

  return Math.max(1, (width - safeGap.value * (columns - 1)) / columns)
})

const estimatedHeight = computed(() => {
  if (props.estimatedItemHeight && props.estimatedItemHeight > 0) {
    return props.estimatedItemHeight
  }

  return Math.max(1, columnWidth.value * props.itemAspectRatio)
})

const itemKeys = computed(() => props.items.map((item, index) => getComparableKey(item, index)))

const keyIndexMap = computed(() => {
  const map = new Map<ItemKey, number>()

  itemKeys.value.forEach((key, index) => {
    map.set(key, index)
  })

  return map
})

const rowMetrics = computed(() => {
  heightVersion.value

  const rows = Math.ceil(props.items.length / columnCount.value)
  const heights: number[] = []
  const measuredRows: boolean[] = []
  const offsets: number[] = [0]

  for (let row = 0; row < rows; row += 1) {
    const startIndex = row * columnCount.value
    const endIndex = Math.min(startIndex + columnCount.value, props.items.length)
    let rowHeight = 0
    let hasUnmeasuredItem = false

    for (let index = startIndex; index < endIndex; index += 1) {
      const height = itemHeights.get(itemKeys.value[index])
      if (height && height > 0) {
        rowHeight = Math.max(rowHeight, height)
      } else {
        hasUnmeasuredItem = true
      }
    }

    if (hasUnmeasuredItem) {
      rowHeight = Math.max(rowHeight, estimatedHeight.value)
    } else {
      rowHeight = Math.max(rowHeight, 1)
    }

    heights.push(rowHeight)
    measuredRows.push(!hasUnmeasuredItem)
    offsets.push(offsets[row] + rowHeight + (row < rows - 1 ? safeGap.value : 0))
  }

  return {
    heights,
    measuredRows,
    offsets,
    rowCount: rows,
    totalHeight: offsets[rows] ?? 0,
  }
})

const totalHeight = computed(() => rowMetrics.value.totalHeight)

const calculatedVisibleRange = computed<VirtualRange>(() => {
  if (isOverlayGrid.value) {
    const rowCount = Math.max(1, Math.ceil(props.items.length / columnCount.value))

    return {
      endIndex: props.items.length,
      endRow: rowCount - 1,
      startIndex: 0,
      startRow: 0,
    }
  }

  const { heights, offsets, rowCount } = rowMetrics.value

  if (!props.items.length || rowCount === 0) {
    return {
      endIndex: 0,
      endRow: 0,
      startIndex: 0,
      startRow: 0,
    }
  }

  const top = Math.max(0, Math.min(viewportTop.value, totalHeight.value))
  const bottom = Math.max(top, Math.min(viewportBottom.value, totalHeight.value))
  const firstVisibleRow = findFirstRowAtOrAfterOffset(offsets, heights, top)
  const lastVisibleRow = findLastRowAtOrBeforeOffset(offsets, rowCount, bottom)
  const startRow = clamp(firstVisibleRow - safeOverscanRows.value, 0, rowCount - 1)
  const endRow = clamp(lastVisibleRow + safeOverscanRows.value, startRow, rowCount - 1)

  return {
    endIndex: Math.min(props.items.length, (endRow + 1) * columnCount.value),
    endRow,
    startIndex: startRow * columnCount.value,
    startRow,
  }
})

const visibleRange = computed(() => frozenVisibleRange.value ?? calculatedVisibleRange.value)

const visibleCells = computed<VirtualCell[]>(() => {
  const cells: VirtualCell[] = []

  for (let index = visibleRange.value.startIndex; index < visibleRange.value.endIndex; index += 1) {
    cells.push({
      item: props.items[index],
      index,
      key: itemKeys.value[index],
    })
  }

  return cells
})

const topSpacerHeight = computed(() => {
  if (isOverlayGrid.value) {
    return 0
  }

  return rowMetrics.value.offsets[visibleRange.value.startRow] ?? 0
})

const visibleBlockHeight = computed(() => {
  if (!props.items.length || visibleRange.value.endIndex <= visibleRange.value.startIndex) {
    return 0
  }

  return Math.max(
    (rowMetrics.value.offsets[visibleRange.value.endRow] ?? 0) +
      (rowMetrics.value.heights[visibleRange.value.endRow] ?? 0) -
      (rowMetrics.value.offsets[visibleRange.value.startRow] ?? 0),
    0,
  )
})

const bottomSpacerHeight = computed(() => {
  if (isOverlayGrid.value) {
    return 0
  }

  return Math.max(totalHeight.value - topSpacerHeight.value - visibleBlockHeight.value, 0)
})

const gridStyle = computed(() => ({
  columnGap: `${safeGap.value}px`,
  gridTemplateColumns: `repeat(${columnCount.value}, minmax(0, 1fr))`,
  rowGap: `${safeGap.value}px`,
}))

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function getComparableKey(item: any, index: number): ItemKey {
  if (props.getItemKey) {
    return props.getItemKey(item, index)
  }

  return index
}

function getFallbackLayoutWidth() {
  if (typeof window === 'undefined') {
    return safeMinItemWidth.value
  }

  // keep-alive 激活首帧可能还拿不到网格宽度，先用视口宽度兜底，避免只渲染一小列。
  return Math.max(document.documentElement.clientWidth || window.innerWidth || 0, safeMinItemWidth.value)
}

function findFirstRowAtOrAfterOffset(offsets: number[], heights: number[], offset: number) {
  let low = 0
  let high = heights.length - 1
  let answer = 0

  while (low <= high) {
    const mid = Math.floor((low + high) / 2)
    const rowEnd = offsets[mid] + heights[mid]

    if (rowEnd >= offset) {
      answer = mid
      high = mid - 1
    } else {
      low = mid + 1
    }
  }

  return answer
}

function findLastRowAtOrBeforeOffset(offsets: number[], rowCount: number, offset: number) {
  let low = 0
  let high = rowCount - 1
  let answer = 0

  while (low <= high) {
    const mid = Math.floor((low + high) / 2)

    if (offsets[mid] <= offset) {
      answer = mid
      low = mid + 1
    } else {
      high = mid - 1
    }
  }

  return answer
}

function isDocumentOverlayLocked() {
  return typeof document !== 'undefined' && document.documentElement.classList.contains('v-overlay-scroll-blocked')
}

function isGridInsideOverlay() {
  return Boolean(containerRef.value?.closest('.v-overlay, .v-overlay__content'))
}

function syncOverlayGridState() {
  isOverlayGrid.value = isGridInsideOverlay()
}

function shouldPauseVirtualSync() {
  return isDocumentOverlayLocked() && !isOverlayGrid.value
}

function freezeVisibleRange() {
  if (frozenVisibleRange.value) {
    return
  }

  // 弹窗打开期间固定当前渲染窗口，防止 body 锁滚动造成坐标跳变并卸载触发弹窗的卡片。
  frozenVisibleRange.value = { ...calculatedVisibleRange.value }
}

function releaseVisibleRange() {
  frozenVisibleRange.value = null
}

function handleOverlayLockChange() {
  if (shouldPauseVirtualSync()) {
    freezeVisibleRange()
    return
  }

  releaseVisibleRange()
  queueLayoutSync()
}

function getElementFromRef(element: Element | ComponentPublicInstance | null): HTMLElement | null {
  if (!element || typeof HTMLElement === 'undefined') {
    return null
  }

  if (element instanceof HTMLElement) {
    return element
  }

  if (!('$el' in element)) {
    return null
  }

  const componentElement = element.$el

  return componentElement instanceof HTMLElement ? componentElement : null
}

function getRowHeight(row: number) {
  const startIndex = row * columnCount.value
  const endIndex = Math.min(startIndex + columnCount.value, props.items.length)
  let rowHeight = 0
  let hasUnmeasuredItem = false

  for (let index = startIndex; index < endIndex; index += 1) {
    const height = itemHeights.get(itemKeys.value[index])
    if (height && height > 0) {
      rowHeight = Math.max(rowHeight, height)
    } else {
      hasUnmeasuredItem = true
    }
  }

  if (hasUnmeasuredItem) {
    return Math.max(rowHeight, estimatedHeight.value)
  }

  return Math.max(rowHeight, 1)
}

function ensureItemResizeObserver() {
  if (itemResizeObserver || typeof ResizeObserver === 'undefined') {
    return
  }

  itemResizeObserver = new ResizeObserver(entries => {
    if (shouldPauseVirtualSync()) {
      freezeVisibleRange()
      return
    }

    let shouldUpdate = false
    let scrollAdjustment = 0
    const currentViewportTop = viewportTop.value
    const currentOffsets = rowMetrics.value.offsets

    entries.forEach(entry => {
      const element = entry.target
      if (!(element instanceof HTMLElement)) {
        return
      }

      const key = observedElements.get(element)
      const index = key === undefined ? undefined : keyIndexMap.value.get(key)

      if (key === undefined || index === undefined) {
        return
      }

      const nextHeight = getResizeEntryHeight(entry)
      const previousHeight = itemHeights.get(key)

      if (!nextHeight || Math.abs((previousHeight ?? 0) - nextHeight) < 0.5) {
        return
      }

      const row = Math.floor(index / columnCount.value)
      const rowWasFullyMeasured = rowMetrics.value.measuredRows[row]
      const previousRowHeight = getRowHeight(row)
      const previousRowBottom = (currentOffsets[row] ?? 0) + previousRowHeight

      if (
        rowWasFullyMeasured &&
        previousHeight !== undefined &&
        previousHeight < previousRowHeight - 0.5 &&
        nextHeight <= previousRowHeight + 0.5
      ) {
        return
      }

      itemHeights.set(key, nextHeight)

      const nextRowHeight = getRowHeight(row)
      const delta = nextRowHeight - previousRowHeight

      if (Math.abs(delta) >= 0.5 && previousRowBottom < currentViewportTop) {
        scrollAdjustment += delta
      }

      shouldUpdate = true
    })

    if (!shouldUpdate) {
      return
    }

    heightVersion.value += 1

    if (Math.abs(scrollAdjustment) >= 0.5) {
      adjustScrollTop(scrollAdjustment)
    }

    queueViewportSync()
  })
}

function getResizeEntryHeight(entry: ResizeObserverEntry) {
  const borderSize = Array.isArray(entry.borderBoxSize) ? entry.borderBoxSize[0] : entry.borderBoxSize

  return borderSize?.blockSize || entry.contentRect.height
}

function setItemRef(element: Element | ComponentPublicInstance | null, key: ItemKey) {
  const htmlElement = getElementFromRef(element)
  const previousElement = keyElements.get(key)

  if (!htmlElement) {
    if (previousElement) {
      itemResizeObserver?.unobserve(previousElement)
      observedElements.delete(previousElement)
      keyElements.delete(key)
    }

    return
  }

  if (previousElement === htmlElement) {
    return
  }

  ensureItemResizeObserver()

  if (previousElement) {
    itemResizeObserver?.unobserve(previousElement)
    observedElements.delete(previousElement)
  }

  observedElements.set(htmlElement, key)
  keyElements.set(key, htmlElement)
  itemResizeObserver?.observe(htmlElement)
}

function getItemRef(key: ItemKey) {
  const existingCallback = itemRefCallbacks.get(key)

  if (existingCallback) {
    return existingCallback
  }

  const callback = (element: Element | ComponentPublicInstance | null) => setItemRef(element, key)
  itemRefCallbacks.set(key, callback)

  return callback
}

function findScrollTarget(): ScrollTarget {
  let parent = containerRef.value?.parentElement ?? null

  while (parent && parent !== document.body && parent !== document.documentElement) {
    const overflowY = window.getComputedStyle(parent).overflowY

    if (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay') {
      return parent
    }

    parent = parent.parentElement
  }

  return window
}

function addScrollListener(target: ScrollTarget) {
  target.addEventListener('scroll', queueViewportSync, { passive: true })
}

function removeScrollListener(target: ScrollTarget | null) {
  target?.removeEventListener('scroll', queueViewportSync)
}

function refreshScrollTarget() {
  if (!mounted) {
    return
  }

  const nextTarget = findScrollTarget()

  if (scrollTarget === nextTarget) {
    return
  }

  removeScrollListener(scrollTarget)
  scrollTarget = nextTarget
  addScrollListener(scrollTarget)
}

function syncLayoutWidth() {
  const element = trackRef.value

  if (!element) {
    if (layoutWidth.value <= 0) {
      layoutWidth.value = getFallbackLayoutWidth()
    }
    return
  }

  const nextWidth = element.clientWidth
  if (nextWidth > 0) {
    layoutWidth.value = nextWidth
    return
  }

  if (layoutWidth.value <= 0) {
    layoutWidth.value = getFallbackLayoutWidth()
  }
}

function syncViewport() {
  const element = trackRef.value

  if (!element) {
    if (viewportBottom.value <= viewportTop.value) {
      viewportTop.value = 0
      viewportBottom.value = typeof window === 'undefined' ? 0 : window.innerHeight
    }
    return
  }

  const trackRect = element.getBoundingClientRect()
  const viewportRect =
    scrollTarget && scrollTarget !== window
      ? (scrollTarget as HTMLElement).getBoundingClientRect()
      : {
          bottom: window.innerHeight,
          top: 0,
        }

  const nextViewportTop = viewportRect.top - trackRect.top
  const nextViewportBottom = viewportRect.bottom - trackRect.top

  if (nextViewportBottom > nextViewportTop) {
    viewportTop.value = nextViewportTop
    viewportBottom.value = nextViewportBottom
  }
}

function queueLayoutSync() {
  if (typeof window === 'undefined' || layoutFrameId !== null) {
    return
  }

  layoutFrameId = window.requestAnimationFrame(() => {
    layoutFrameId = null

    if (shouldPauseVirtualSync()) {
      freezeVisibleRange()
      return
    }

    // 弹窗内容已经由 overlay 限定生命周期，直接完整渲染可避免弹窗内交互被虚拟回收打断。
    syncOverlayGridState()
    releaseVisibleRange()
    syncLayoutWidth()
    refreshScrollTarget()
    syncViewport()
    flushPendingReveal()
  })
}

function queueViewportSync() {
  if (typeof window === 'undefined' || scrollFrameId !== null) {
    return
  }

  scrollFrameId = window.requestAnimationFrame(() => {
    scrollFrameId = null

    if (shouldPauseVirtualSync()) {
      freezeVisibleRange()
      return
    }

    releaseVisibleRange()
    syncViewport()
  })
}

function getTrackScrollTop() {
  const element = trackRef.value

  if (!element || !scrollTarget || scrollTarget === window) {
    return (element?.getBoundingClientRect().top ?? 0) + window.scrollY
  }

  const scrollElement = scrollTarget as HTMLElement
  const trackRect = element.getBoundingClientRect()
  const scrollRect = scrollElement.getBoundingClientRect()

  return trackRect.top - scrollRect.top + scrollElement.scrollTop
}

function adjustScrollTop(delta: number) {
  if (!scrollTarget || Math.abs(delta) < 0.5) {
    return
  }

  if (scrollTarget === window) {
    window.scrollBy({
      behavior: 'auto',
      top: delta,
    })
  } else {
    const scrollElement = scrollTarget as HTMLElement
    scrollElement.scrollTop += delta
  }
}

function scrollToRelativeTop(top: number) {
  if (!scrollTarget) {
    return
  }

  const targetTop = getTrackScrollTop() + top

  if (scrollTarget === window) {
    window.scrollTo({
      behavior: 'auto',
      top: targetTop,
    })
  } else {
    ;(scrollTarget as HTMLElement).scrollTo({
      behavior: 'auto',
      top: targetTop,
    })
  }

  queueViewportSync()
}

async function revealItem(index: number) {
  if (typeof window === 'undefined' || index < 0 || index >= props.items.length) {
    return
  }

  await nextTick()

  const row = Math.floor(index / columnCount.value)
  const top = rowMetrics.value.offsets[row] ?? 0

  scrollToRelativeTop(top)
}

function requestRevealItem(index: number) {
  pendingRevealIndex = index

  if (!mounted) {
    return
  }

  queueLayoutSync()
}

function flushPendingReveal() {
  if (pendingRevealIndex === null || !mounted || !scrollTarget || layoutWidth.value <= 0) {
    return
  }

  const index = pendingRevealIndex
  pendingRevealIndex = null

  void revealItem(index)
}

function pruneMeasurements() {
  const keys = new Set(itemKeys.value)
  let changed = false

  Array.from(itemHeights.keys()).forEach(key => {
    if (!keys.has(key)) {
      itemHeights.delete(key)
      changed = true
    }
  })

  Array.from(keyElements.entries()).forEach(([key, element]) => {
    if (!keys.has(key)) {
      itemResizeObserver?.unobserve(element)
      observedElements.delete(element)
      keyElements.delete(key)
    }
  })

  Array.from(itemRefCallbacks.keys()).forEach(key => {
    if (!keys.has(key)) {
      itemRefCallbacks.delete(key)
    }
  })

  if (changed) {
    heightVersion.value += 1
  }
}

function didKeysAppend(nextKeys: ItemKey[], previousKeys: ItemKey[] = []) {
  if (!previousKeys.length || nextKeys.length < previousKeys.length) {
    return false
  }

  return previousKeys.every((key, index) => key === nextKeys[index])
}

function syncMeasurementsForItems(nextKeys: ItemKey[], previousKeys: ItemKey[] = []) {
  if (!didKeysAppend(nextKeys, previousKeys) && itemHeights.size) {
    itemHeights.clear()
    heightVersion.value += 1
  }

  pruneMeasurements()
}

function invalidateMeasurementsForLayoutChange() {
  const nextColumnCount = columnCount.value
  const nextColumnWidth = columnWidth.value

  if (
    lastMeasuredColumnCount === nextColumnCount &&
    Math.abs(lastMeasuredColumnWidth - nextColumnWidth) < 1
  ) {
    return
  }

  lastMeasuredColumnCount = nextColumnCount
  lastMeasuredColumnWidth = nextColumnWidth

  if (!itemHeights.size) {
    return
  }

  itemHeights.clear()
  heightVersion.value += 1
}

onMounted(() => {
  mounted = true
  syncOverlayGridState()
  scrollTarget = findScrollTarget()
  addScrollListener(scrollTarget)

  resizeObserver = new ResizeObserver(queueLayoutSync)
  if (trackRef.value) {
    resizeObserver.observe(trackRef.value)
  }

  if (typeof MutationObserver !== 'undefined') {
    overlayLockObserver = new MutationObserver(handleOverlayLockChange)
    overlayLockObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    })
  }

  window.addEventListener('resize', queueLayoutSync, { passive: true })

  queueLayoutSync()
})

onActivated(() => {
  mounted = true
  refreshScrollTarget()
  queueLayoutSync()
  requestAnimationFrame(queueLayoutSync)
})

onDeactivated(() => {
  mounted = false
  removeScrollListener(scrollTarget)
  scrollTarget = null
})

onUnmounted(() => {
  mounted = false
  removeScrollListener(scrollTarget)
  scrollTarget = null

  window.removeEventListener('resize', queueLayoutSync)
  resizeObserver?.disconnect()
  resizeObserver = null
  itemResizeObserver?.disconnect()
  itemResizeObserver = null
  overlayLockObserver?.disconnect()
  overlayLockObserver = null

  if (layoutFrameId !== null) {
    window.cancelAnimationFrame(layoutFrameId)
    layoutFrameId = null
  }

  if (scrollFrameId !== null) {
    window.cancelAnimationFrame(scrollFrameId)
    scrollFrameId = null
  }
})

watch(
  itemKeys,
  (nextKeys, previousKeys) => {
    syncMeasurementsForItems(nextKeys, previousKeys)
    queueLayoutSync()
  },
  { immediate: true },
)

watch(
  [
    () => props.minItemWidth,
    () => props.gap,
    () => props.estimatedItemHeight,
    () => props.itemAspectRatio,
    () => props.columns,
  ],
  () => {
    queueLayoutSync()
  },
)

watch(
  [columnCount, columnWidth],
  () => {
    invalidateMeasurementsForLayoutChange()
    queueViewportSync()
  },
)

watch(
  [() => props.scrollToIndex, () => props.items.length, columnCount],
  ([scrollToIndex]) => {
    if (scrollToIndex === undefined || scrollToIndex < 0 || scrollToIndex >= props.items.length) {
      return
    }

    requestRevealItem(scrollToIndex)
  },
  { immediate: true },
)
</script>

<template>
  <div ref="containerRef" class="progressive-card-grid">
    <div ref="trackRef" class="progressive-card-grid__track">
      <div
        v-if="topSpacerHeight > 0"
        class="progressive-card-grid__spacer"
        :style="{ blockSize: `${topSpacerHeight}px` }"
        aria-hidden="true"
      />
      <div v-if="visibleCells.length > 0" class="progressive-card-grid__grid" :style="gridStyle">
        <div
          v-for="cell in visibleCells"
          :key="cell.key"
          :ref="getItemRef(cell.key)"
          class="progressive-card-grid__item"
          :data-progressive-grid-index="cell.index"
        >
          <slot :item="cell.item" :index="cell.index" />
        </div>
      </div>
      <div
        v-if="bottomSpacerHeight > 0"
        class="progressive-card-grid__spacer"
        :style="{ blockSize: `${bottomSpacerHeight}px` }"
        aria-hidden="true"
      />
    </div>
  </div>
</template>

<style scoped>
.progressive-card-grid {
  inline-size: 100%;
}

.progressive-card-grid__track {
  inline-size: 100%;
  min-block-size: 1px;
  overflow-anchor: none;
}

.progressive-card-grid__grid {
  display: grid;
}

.progressive-card-grid__item {
  inline-size: 100%;
  min-inline-size: 0;
}

.progressive-card-grid__item > :deep(*) {
  block-size: 100%;
  inline-size: 100%;
}
</style>
