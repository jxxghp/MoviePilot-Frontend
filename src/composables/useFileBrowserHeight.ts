import { nextTick, onActivated, onMounted, onUnmounted, ref, watch, type Ref } from 'vue'
import { usePWA } from '@/composables/usePWA'

/** 按工作区真实顶边与导航顶边限定高度，安全区由 Shell 负责，避免重复扣除 Dock。 */
export function useFileBrowserHeight(target: Ref<HTMLElement | null>) {
  const height = ref<number>()
  const { appMode } = usePWA()
  let resizeObserver: ResizeObserver | undefined
  let mutationObserver: MutationObserver | undefined
  let frame = 0

  /** 使用实际可视视口和固定导航位置，短屏与软键盘场景不强制撑高列表。 */
  function measure() {
    const element = target.value
    if (!element || !element.getClientRects().length) return
    const viewport = window.visualViewport
    const viewportBottom = viewport ? viewport.offsetTop + viewport.height : window.innerHeight
    const layout = element.closest('.layout-page-content')
    const padding = layout ? parseFloat(getComputedStyle(layout).paddingBottom) || 0 : 16
    const dock = document.querySelector<HTMLElement>('.footer-nav-container')
    const dockRect = dock?.getClientRects().length ? dock.getBoundingClientRect() : undefined
    // Shell 的 padding 已含 Dock 高度；只保留其中的页面间距，实际遮挡用导航顶边判断。
    const reservedDock = layout
      ? parseFloat(getComputedStyle(layout).getPropertyValue('--layout-footer-dock-height')) || 0
      : 0
    const gap = dockRect ? Math.max(0, padding - (reservedDock || dockRect.height)) : padding
    const bottom = Math.min(viewportBottom, dockRect?.top ?? viewportBottom)
    const surface = element.closest('.file-browser-view')
    const surfaceStyle = surface ? getComputedStyle(surface) : undefined
    const bottomEdge = surfaceStyle
      ? (parseFloat(surfaceStyle.borderBottomWidth) || 0) + (parseFloat(surfaceStyle.paddingBottom) || 0)
      : 0
    // 边框属于外层主题表面；使用文档顶边防止微小页面滚动反过来撑高工作区。
    height.value = Math.max(0, bottom - element.getBoundingClientRect().top - window.scrollY - gap - bottomEdge)
    if (dock) resizeObserver?.observe(dock)
  }

  /** 将布局、导航和视口更新合并到下一帧，避免 ResizeObserver 同步回写循环。 */
  function scheduleMeasure() {
    cancelAnimationFrame(frame)
    frame = requestAnimationFrame(measure)
  }

  onMounted(() => {
    resizeObserver = new ResizeObserver(scheduleMeasure)
    if (target.value) resizeObserver.observe(target.value)
    const layout = target.value?.closest('.layout-page-content')
    if (layout) resizeObserver.observe(layout)
    mutationObserver = new MutationObserver(scheduleMeasure)
    mutationObserver.observe(document.body, { childList: true })
    window.addEventListener('resize', scheduleMeasure)
    window.visualViewport?.addEventListener('resize', scheduleMeasure)
    window.visualViewport?.addEventListener('scroll', scheduleMeasure)
    scheduleMeasure()
  })
  watch(appMode, () => nextTick(scheduleMeasure))
  onActivated(() => nextTick(scheduleMeasure))
  onUnmounted(() => {
    cancelAnimationFrame(frame)
    resizeObserver?.disconnect()
    mutationObserver?.disconnect()
    window.removeEventListener('resize', scheduleMeasure)
    window.visualViewport?.removeEventListener('resize', scheduleMeasure)
    window.visualViewport?.removeEventListener('scroll', scheduleMeasure)
  })
  return { height }
}
