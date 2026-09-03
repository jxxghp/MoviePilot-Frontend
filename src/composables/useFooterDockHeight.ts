import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'

/**
 * 观察通过 Teleport 挂载到 body 的 App 底部 Footer，并返回其实际占用高度。
 *
 * Footer 高度包含底部安全区；调用方可以直接将该值作为 fixed 浮层的底部避让距离，
 * 在 Footer 尚未挂载或当前不可见时则回退为 null，由 CSS 使用设备安全区兜底。
 */
export function useFooterDockHeight() {
  const footerDockHeight = ref<number | null>(null)
  let resizeObserver: ResizeObserver | null = null
  let mutationObserver: MutationObserver | null = null
  let observedFooter: HTMLElement | null = null

  /** 更新 ResizeObserver 当前绑定的 Footer 节点。 */
  function observeFooter(footerElement: HTMLElement | null) {
    if (!resizeObserver || observedFooter === footerElement) return

    if (observedFooter) resizeObserver.unobserve(observedFooter)

    observedFooter = footerElement
    if (footerElement) resizeObserver.observe(footerElement)
  }

  /** 读取 Footer 的布局高度，并在 Footer 生命周期变化时同步到响应式状态。 */
  function measureFooter() {
    const footerElement = document.querySelector('.footer-nav-container') as HTMLElement | null
    observeFooter(footerElement)

    const measuredHeight = footerElement?.offsetHeight || 0
    footerDockHeight.value = measuredHeight > 0 ? measuredHeight : null
  }

  /** 将首次测量放到 Teleport 完成后的下一轮 DOM 更新中。 */
  function scheduleMeasure() {
    void nextTick(measureFooter)
  }

  onMounted(() => {
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(measureFooter)
    }

    if (typeof MutationObserver !== 'undefined' && document.body) {
      mutationObserver = new MutationObserver(measureFooter)
      mutationObserver.observe(document.body, { childList: true })
    }

    scheduleMeasure()
  })

  onBeforeUnmount(() => {
    resizeObserver?.disconnect()
    mutationObserver?.disconnect()
    resizeObserver = null
    mutationObserver = null
    observedFooter = null
  })

  return { footerDockHeight }
}
