import {
  computed,
  nextTick,
  onActivated,
  onMounted,
  onUnmounted,
  ref,
  toValue,
  watch,
  type ComputedRef,
  type MaybeRefOrGetter,
  type Ref,
} from 'vue'

interface DashboardMediaGridCapacityOptions {
  contentSelector?: string
  gap?: number
  horizontalPadding?: number
  maxCount?: number
  minItemWidth: number
  rows?: MaybeRefOrGetter<number>
}

interface DashboardMediaGridCapacityState {
  columnCount: ComputedRef<number>
  containerRef: Ref<HTMLElement | null>
  itemCount: ComputedRef<number>
  refreshCapacity: () => void
}

const DEFAULT_DASHBOARD_MEDIA_GRID_GAP = 16
const DEFAULT_DASHBOARD_MEDIA_GRID_ROWS = 2

/**
 * 根据仪表盘媒体卡片容器宽度和响应式行数计算请求数量。
 *
 * @param options 网格尺寸参数，需要与实际 ProgressiveCardGrid 参数保持一致
 * @returns 容器引用、列数、请求数量和手动刷新方法
 */
export function useDashboardMediaGridCapacity(options: DashboardMediaGridCapacityOptions): DashboardMediaGridCapacityState {
  const containerRef = ref<HTMLElement | null>(null)
  const measuredWidth = ref(0)

  let resizeObserver: ResizeObserver | null = null
  let frameId: number | null = null

  const safeGap = computed(() => Math.max(0, options.gap ?? DEFAULT_DASHBOARD_MEDIA_GRID_GAP))
  const safeHorizontalPadding = computed(() => Math.max(0, options.horizontalPadding ?? 0))
  const safeMaxCount = computed(() => Math.max(0, Math.floor(options.maxCount ?? Number.POSITIVE_INFINITY)))
  const safeMinItemWidth = computed(() => Math.max(1, options.minItemWidth))
  const safeRows = computed(() => {
    const rows = options.rows === undefined ? DEFAULT_DASHBOARD_MEDIA_GRID_ROWS : toValue(options.rows)

    return Math.max(1, Math.floor(rows))
  })

  const columnCount = computed(() => {
    if (measuredWidth.value <= 0) return 0

    return Math.max(1, Math.floor((measuredWidth.value + safeGap.value) / (safeMinItemWidth.value + safeGap.value)))
  })

  const itemCount = computed(() => {
    if (columnCount.value <= 0) return 0

    const count = columnCount.value * safeRows.value

    return safeMaxCount.value > 0 ? Math.min(count, safeMaxCount.value) : count
  })

  /**
   * 读取元素扣除内边距后的内容宽度。
   *
   * @param element 需要测量的元素
   */
  function measureContentBoxWidth(element: HTMLElement) {
    const style = window.getComputedStyle(element)
    const paddingLeft = Number.parseFloat(style.paddingLeft) || 0
    const paddingRight = Number.parseFloat(style.paddingRight) || 0

    return Math.max(0, element.clientWidth - paddingLeft - paddingRight)
  }

  /**
   * 读取容器可用于网格布局的实际宽度。
   */
  function measureContainerWidth() {
    const element = containerRef.value

    if (!element) return 0

    const contentElement = options.contentSelector
      ? element.querySelector<HTMLElement>(options.contentSelector)
      : null
    if (contentElement) {
      return measureContentBoxWidth(contentElement)
    }

    const elementWidth = element.getBoundingClientRect().width || element.clientWidth

    return Math.max(0, elementWidth - safeHorizontalPadding.value)
  }

  /**
   * 同步当前容器宽度到响应式状态。
   */
  function refreshCapacity() {
    measuredWidth.value = measureContainerWidth()
  }

  /**
   * 合并同一帧内的尺寸变更，避免拖拽调整仪表盘时重复计算。
   */
  function queueRefreshCapacity() {
    if (typeof window === 'undefined' || frameId !== null) return

    frameId = window.requestAnimationFrame(() => {
      frameId = null
      refreshCapacity()
    })
  }

  /**
   * 重新绑定当前容器的 ResizeObserver。
   */
  function observeContainer() {
    resizeObserver?.disconnect()
    resizeObserver = null

    if (typeof ResizeObserver !== 'undefined' && containerRef.value) {
      resizeObserver = new ResizeObserver(queueRefreshCapacity)
      resizeObserver.observe(containerRef.value)
    }

    queueRefreshCapacity()
  }

  watch(containerRef, observeContainer, { flush: 'post' })

  onMounted(() => {
    observeContainer()
    window.addEventListener('resize', queueRefreshCapacity, { passive: true })
    void nextTick(refreshCapacity)
  })

  onActivated(() => {
    void nextTick(refreshCapacity)
  })

  onUnmounted(() => {
    window.removeEventListener('resize', queueRefreshCapacity)
    resizeObserver?.disconnect()
    resizeObserver = null

    if (frameId !== null) {
      window.cancelAnimationFrame(frameId)
      frameId = null
    }
  })

  return {
    columnCount,
    containerRef,
    itemCount,
    refreshCapacity,
  }
}
