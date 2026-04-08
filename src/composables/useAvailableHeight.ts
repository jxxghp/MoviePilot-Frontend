import { computed, ref, onMounted, onUnmounted } from 'vue'
import { usePWA } from '@/composables/usePWA'

/**
 * 计算页面内容的可用高度，自动适配 iOS 安全区域和底部 Dock 栏。
 *
 * 通过 DOM 测量获取布局的实际 padding（含 safe-area-inset-top/bottom），
 * 以及 Footer Dock 的实际高度，确保在任何设备上都不会被 Dock 遮挡。
 *
 * 计算公式: viewport - layoutPaddingTop - layoutPaddingBottom - footerDock - componentOffset
 *
 * @param componentOffset - 组件内部额外占用的空间（工具栏、分页栏等，默认 64）
 * @param minHeight - 最小高度（默认 300）
 */
export function useAvailableHeight(
  componentOffset: number = 64,
  minHeight: number = 300,
) {
  const { appMode } = usePWA()

  // 响应式测量值
  const viewportHeight = ref(window.innerHeight || document.documentElement.clientHeight)
  const layoutPaddingTop = ref(72)
  const layoutPaddingBottom = ref(24)
  const footerDockMeasuredHeight = ref(0)

  function updateMeasurements() {
    viewportHeight.value = window.innerHeight || document.documentElement.clientHeight

    // 测量 .layout-page-content 的实际 padding（含 env(safe-area-inset-top) 等）
    const layoutEl = document.querySelector('.layout-page-content') as HTMLElement | null
    if (layoutEl) {
      const style = getComputedStyle(layoutEl)
      layoutPaddingTop.value = parseFloat(style.paddingTop) || 72
      layoutPaddingBottom.value = parseFloat(style.paddingBottom) || 24
    }

    // 测量 Footer Dock 的实际高度
    // .footer-nav-container 是 position:fixed, padding-block-end 含 env(safe-area-inset-bottom)
    // offsetHeight 是元素自身的渲染高度（含 padding），即 Dock 遮挡的区域大小
    if (appMode.value) {
      const footerEl = document.querySelector('.footer-nav-container') as HTMLElement | null
      footerDockMeasuredHeight.value = footerEl ? footerEl.offsetHeight : 70
    } else {
      footerDockMeasuredHeight.value = 0
    }
  }

  onMounted(() => {
    // 初始测量（nextTick 确保 DOM 已渲染）
    nextTick(updateMeasurements)

    window.addEventListener('resize', updateMeasurements)
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', updateMeasurements)
    }
  })

  onUnmounted(() => {
    window.removeEventListener('resize', updateMeasurements)
    if (window.visualViewport) {
      window.visualViewport.removeEventListener('resize', updateMeasurements)
    }
  })

  const availableHeight = computed(() => {
    const vh = viewportHeight.value

    // 布局顶部 padding（含 safe-area-inset-top + navbar 高度）
    const topPadding = layoutPaddingTop.value

    // 布局底部 padding
    const bottomPadding = layoutPaddingBottom.value

    // 底部 Dock 栏遮挡高度（appMode 下通过 DOM 测量，含 safe-area-inset-bottom）
    const footerDockHeight = footerDockMeasuredHeight.value

    const available = vh - topPadding - bottomPadding - footerDockHeight - componentOffset

    return Math.max(available, minHeight)
  })

  return {
    availableHeight,
    viewportHeight,
  }
}
