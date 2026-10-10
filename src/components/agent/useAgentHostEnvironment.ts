import { computed, onMounted, onScopeDispose, watch, type MaybeRefOrGetter, toValue } from 'vue'
import type { AgentHostState } from '@/types/agentHost'
import type { AgentHostCore } from '@/utils/agentHost'

/** 与入口组件的移动端断点保持一致。 */
const AGENT_HOST_MOBILE_VIEWPORT_WIDTH = 600

interface AgentHostEnvironmentOptions {
  host: AgentHostCore
  /** 页面活动生命周期是否允许装饰动效。 */
  allowsDecorativeMotion: MaybeRefOrGetter<boolean>
  /** 当前主题是否为暗色。 */
  dark: MaybeRefOrGetter<boolean>
}

/** 读取 CSS 安全区内边距；通过隐藏探针元素解析 env()，不支持时为 0。 */
function createSafeAreaProbe() {
  if (typeof document === 'undefined') return null
  const probe = document.createElement('div')
  probe.setAttribute('aria-hidden', 'true')
  probe.style.cssText = [
    'position:fixed',
    'inset:0',
    'visibility:hidden',
    'pointer-events:none',
    'padding-top:env(safe-area-inset-top,0px)',
    'padding-right:env(safe-area-inset-right,0px)',
    'padding-bottom:env(safe-area-inset-bottom,0px)',
    'padding-left:env(safe-area-inset-left,0px)',
  ].join(';')
  document.body.append(probe)
  return probe
}

/**
 * 把页面可见性、减少动态效果、主题和视口信息同步到 Agent 宿主快照。
 * 只在 AgentAssistantWidget 挂载期间运行，卸载时移除全部监听和探针元素。
 */
export function useAgentHostEnvironment(options: AgentHostEnvironmentOptions) {
  const reducedMotionQuery =
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)')
      : null
  let safeAreaProbe: HTMLElement | null = null
  let reducedMotion = Boolean(reducedMotionQuery?.matches)

  const motionAllowed = computed(() => toValue(options.allowsDecorativeMotion))

  function readSafeArea(): AgentHostState['viewport']['safeArea'] {
    if (!safeAreaProbe) return { top: 0, right: 0, bottom: 0, left: 0 }
    const style = window.getComputedStyle(safeAreaProbe)
    const read = (value: string) => Number.parseFloat(value) || 0
    return {
      top: read(style.paddingTop),
      right: read(style.paddingRight),
      bottom: read(style.paddingBottom),
      left: read(style.paddingLeft),
    }
  }

  function syncViewport() {
    const width = window.innerWidth || document.documentElement.clientWidth || 0
    const height = window.innerHeight || document.documentElement.clientHeight || 0
    const visual = window.visualViewport
    // 软键盘弹出时可视视口缩短，布局视口不变，两者之差就是被遮挡的底部高度。
    const keyboardInset = visual ? Math.max(0, Math.round(height - visual.height - visual.offsetTop)) : 0
    options.host.setState({
      isMobile: width <= AGENT_HOST_MOBILE_VIEWPORT_WIDTH,
      viewport: { width, height, keyboardInset, safeArea: readSafeArea() },
    })
  }

  function syncMotion() {
    options.host.setState({
      reducedMotion,
      motionAllowed: motionAllowed.value && !reducedMotion,
    })
  }

  function syncVisibility() {
    options.host.setState({ pageVisible: document.visibilityState !== 'hidden' })
  }

  function handleReducedMotionChange(event: MediaQueryListEvent) {
    reducedMotion = event.matches
    syncMotion()
  }

  watch(motionAllowed, syncMotion, { immediate: true })
  watch(
    () => toValue(options.dark),
    dark => options.host.setState({ theme: dark ? 'dark' : 'light' }),
    { immediate: true },
  )

  onMounted(() => {
    safeAreaProbe = createSafeAreaProbe()
    syncViewport()
    syncVisibility()
    window.addEventListener('resize', syncViewport)
    window.visualViewport?.addEventListener('resize', syncViewport)
    window.visualViewport?.addEventListener('scroll', syncViewport)
    document.addEventListener('visibilitychange', syncVisibility)
    reducedMotionQuery?.addEventListener?.('change', handleReducedMotionChange)
  })

  onScopeDispose(() => {
    window.removeEventListener('resize', syncViewport)
    window.visualViewport?.removeEventListener('resize', syncViewport)
    window.visualViewport?.removeEventListener('scroll', syncViewport)
    document.removeEventListener('visibilitychange', syncVisibility)
    reducedMotionQuery?.removeEventListener?.('change', handleReducedMotionChange)
    safeAreaProbe?.remove()
    safeAreaProbe = null
  })

  return { syncViewport }
}
