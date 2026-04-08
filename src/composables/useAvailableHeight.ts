import { computed, ref, onMounted, onUnmounted } from 'vue'
import { usePWA } from '@/composables/usePWA'

/**
 * 计算页面内容的可用高度，自动适配 iOS 安全区域和底部 Dock 栏。
 *
 * 在 appMode（PWA 小屏）下，底部 Dock（Footer）通过 Teleport 挂载到 body，
 * 始终可见并悬浮在底部。本 composable 会测量 Dock 的实际 DOM 高度（已包含
 * safe-area-inset-bottom），从而自适应不同 iOS 设备的安全区域。
 *
 * 计算公式: viewport - navbarHeight - layoutPadding - footerDock - componentOffset
 * 其中 componentOffset 是调用方指定的组件内部额外占用空间（如工具栏、分页栏等）
 *
 * @param componentOffset - 组件内部额外占用的空间（工具栏、分页栏等，默认 64）
 * @param minHeight - 最小高度（默认 300）
 */
export function useAvailableHeight(
  componentOffset: number = 64,
  minHeight: number = 300,
) {
  const { appMode } = usePWA()

  // 响应式的视口高度，监听 resize 事件
  const viewportHeight = ref(window.innerHeight || document.documentElement.clientHeight)

  // Footer Dock 测量高度（响应式）
  const footerDockMeasuredHeight = ref(0)

  function updateMeasurements() {
    viewportHeight.value = window.innerHeight || document.documentElement.clientHeight

    // 测量 Footer Dock 的实际高度
    // footer-nav-container 的 CSS 中已包含 env(safe-area-inset-bottom)，
    // 所以 offsetHeight 是包含安全区域的完整高度
    if (appMode.value) {
      const footerEl = document.querySelector('.footer-nav-container') as HTMLElement | null
      footerDockMeasuredHeight.value = footerEl ? footerEl.offsetHeight : 70
    } else {
      footerDockMeasuredHeight.value = 0
    }
  }

  onMounted(() => {
    // 初始测量
    updateMeasurements()

    window.addEventListener('resize', updateMeasurements)
    // iOS 虚拟键盘弹出/收起时 visualViewport 会变化
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

    // navbar 固定高度（对应 layout-page-content 的 padding-block-start: 4.5rem）
    const navbarHeight = 72

    // layout-page-content 的 padding-block-end (1.5rem = 24px)
    const layoutBottomPadding = 24

    // 底部 Dock 栏高度（appMode 下通过 DOM 测量，已含 safe-area-inset-bottom）
    const footerDockHeight = footerDockMeasuredHeight.value

    const available = vh - navbarHeight - layoutBottomPadding - footerDockHeight - componentOffset

    return Math.max(available, minHeight)
  })

  return {
    availableHeight,
    viewportHeight,
  }
}
