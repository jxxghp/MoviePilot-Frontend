import { onMounted, onUnmounted, ref } from 'vue'

/**
 * 读取当前可视视口高度，供需要「贴着屏幕可见区域」布局的浮层使用。
 *
 * 按 CSSOM View，`visualViewport.height` 已经是应用页面缩放后的 CSS 像素，不应再乘 `scale`。
 * VueUse 的 `useWindowSize({ type: 'visual' })` 返回的是 `height * scale`，也就是 layout 视口尺寸，
 * 页面缩放不是 100% 时会把内容压成实际可见高度的一小部分。
 */
export function useVisualViewportHeight() {
  const height = ref(measure())

  /** 优先取可视视口高度，环境不支持 `visualViewport` 时回退到 `innerHeight`。 */
  function measure() {
    const viewport = window.visualViewport
    return viewport?.height || window.innerHeight || 0
  }

  /** 视口或窗口尺寸变化时同步重测。 */
  function sync() {
    height.value = measure()
  }

  onMounted(() => {
    sync()
    window.addEventListener('resize', sync)
    window.visualViewport?.addEventListener('resize', sync)
    window.visualViewport?.addEventListener('scroll', sync)
  })

  onUnmounted(() => {
    window.removeEventListener('resize', sync)
    window.visualViewport?.removeEventListener('resize', sync)
    window.visualViewport?.removeEventListener('scroll', sync)
  })

  return { height, sync }
}
