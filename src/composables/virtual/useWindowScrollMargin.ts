import { ref, onMounted, onBeforeUnmount, type Ref } from 'vue'

/**
 * ============================================================
 * useWindowScrollMargin - 虚拟滚动 Base Layer：scrollMargin 追踪
 * ============================================================
 *
 * window scroll 模式下，virtualizer 需要知道滚动容器顶部相对文档的 Y 偏移
 * （scrollMargin = getBoundingClientRect().top + scrollY），才能把"窗口滚动量"
 * 换算成"容器内坐标"。
 *
 * 何时会变陈旧 —— 列表【上方】的内容高度变化（折叠面板展开、异步内容撑高等），
 * 会把列表整体往下推，scrollMargin 必须随之更新，否则虚拟项渲染位置整体偏移
 * （出现空隙或重叠）。三道防线覆盖：
 *   1. window resize          —— 视口尺寸变化
 *   2. body ResizeObserver    —— body 盒子自身变化（内容驱动高度的布局下，
 *                                上方内容撑高会让 body 长高 → 触发）
 *   3. window scroll（rAF 节流）—— 自愈兜底：当布局是 `html,body{height:100%}`、
 *      滚动发生在 <html> 上时，上方内容撑高【不会】改变 body 盒子 → RO 不触发，
 *      此时靠下一次 scroll 重算自愈。正常滚动时 rect.top+scrollY 恒定（写回同值
 *      不触发响应式），只有真发生上方位移才会写入新值，故几乎零成本、无抖动。
 *
 * 残留边角：上方面板展开且用户【不滚动】、同时布局又非内容驱动高度 —— 此时
 * 需要消费方在已知的 toggle 时机主动调用返回的 updateScrollMargin() 即可消除。
 *
 * @param scrollEl  绑定到滚动容器根元素的模板 ref
 * @param enabled   是否启用（容器内 scroll 模式返回 false，window scroll 返回 true）
 */
export function useWindowScrollMargin(scrollEl: Ref<HTMLElement | null>, enabled: () => boolean) {
  const scrollMargin = ref(0)
  let resizeObserver: ResizeObserver | null = null
  let rafId: number | null = null

  function updateScrollMargin() {
    if (!enabled() || !scrollEl.value || typeof window === 'undefined') {
      scrollMargin.value = 0
      return
    }
    scrollMargin.value = scrollEl.value.getBoundingClientRect().top + window.scrollY
  }

  // scroll 自愈：rAF 节流，避免占用滚动热路径。
  function onScroll() {
    if (rafId !== null) return
    rafId = requestAnimationFrame(() => {
      rafId = null
      updateScrollMargin()
    })
  }

  onMounted(() => {
    updateScrollMargin()
    if (enabled() && typeof window !== 'undefined') {
      window.addEventListener('resize', updateScrollMargin, { passive: true })
      window.addEventListener('scroll', onScroll, { passive: true })
      resizeObserver = new ResizeObserver(updateScrollMargin)
      if (document.body) resizeObserver.observe(document.body)
    }
  })

  onBeforeUnmount(() => {
    if (typeof window !== 'undefined') {
      window.removeEventListener('resize', updateScrollMargin)
      window.removeEventListener('scroll', onScroll)
    }
    if (rafId !== null) {
      cancelAnimationFrame(rafId)
      rafId = null
    }
    resizeObserver?.disconnect()
    resizeObserver = null
  })

  return { scrollMargin, updateScrollMargin }
}
