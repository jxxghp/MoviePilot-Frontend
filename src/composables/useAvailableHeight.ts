import { computed, ref, watch, onMounted, onUnmounted, nextTick } from 'vue'
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

    // 直接查询 Footer Dock DOM，无论 appMode 状态
    // Dock 通过 Teleport 挂载到 body，存在即测量，不存在即为 0
    const footerEl = document.querySelector('.footer-nav-container') as HTMLElement | null
    footerDockMeasuredHeight.value = footerEl ? footerEl.offsetHeight : 0
  }

  // appMode 异步变化时（PWA 检测完成、屏幕尺寸变化等），Dock 会出现/消失
  // 需要等 DOM 更新后重新测量
  watch(appMode, () => {
    nextTick(updateMeasurements)
  })

  onMounted(() => {
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

    // 底部 Dock 栏遮挡高度（通过 DOM 测量，含 safe-area-inset-bottom）
    const footerDockHeight = footerDockMeasuredHeight.value

    const available = vh - topPadding - bottomPadding - footerDockHeight - componentOffset

    return Math.max(available, minHeight)
  })

  return {
    availableHeight,
    viewportHeight,
  }
}
