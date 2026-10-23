import { computed, onMounted, onScopeDispose, shallowRef, watch, type Ref } from 'vue'
import type { AgentHostDock, AgentHostRect } from '@/types/agentHost'

/**
 * 会让 Dock 整体 `visibility: hidden` 的根元素属性（见 Footer.vue 样式），
 * 属性变化不改变尺寸，ResizeObserver 收不到，需要单独观察。
 */
const DOCK_HIDING_ROOT_ATTRIBUTES = ['data-theme-customizer-open', 'data-agent-assistant-open']

const geometry = shallowRef<AgentHostDock | null>(null)

/** 底部导航 Dock 当前可见区域的只读视图，由 Footer 发布，Agent 宿主转给形象插件。 */
export const footerDockGeometry = computed(() => geometry.value)

function toRect(rect: DOMRect): AgentHostRect {
  return { x: rect.left, y: rect.top, width: rect.width, height: rect.height }
}

/** 读取 Dock 可见卡片的矩形；容器未渲染、被 v-show 隐藏、visibility 隐藏或没有可见卡片时为 null。 */
export function measureFooterDock(container: HTMLElement | null, group: HTMLElement | null): AgentHostDock | null {
  if (!container?.isConnected || !group || container.getClientRects().length === 0) return null
  if (window.getComputedStyle(container).visibility === 'hidden') return null

  const items = Array.from(group.querySelectorAll<HTMLElement>('[data-footer-nav-role]'))
    .map(card => card.getBoundingClientRect())
    // 收起的附属卡片宽度为 0，不算可见区域。
    .filter(rect => rect.width > 0 && rect.height > 0)
    .sort((left, right) => left.left - right.left)
  if (!items.length) return null

  const left = Math.min(...items.map(rect => rect.left))
  const top = Math.min(...items.map(rect => rect.top))
  const right = Math.max(...items.map(rect => rect.right))
  const bottom = Math.max(...items.map(rect => rect.bottom))

  return {
    bounds: { x: left, y: top, width: right - left, height: bottom - top },
    items: items.map(toRect),
  }
}

/**
 * 由 Footer 调用，持续发布 Dock 几何。卡片尺寸变化、附属卡片伸缩动画、窗口缩放、
 * 显隐切换和全屏面板遮挡时重新测量，同一帧内的多次触发合并为一次。
 */
export function usePublishFooterDockGeometry(container: Ref<HTMLElement | null>, group: Ref<HTMLElement | null>) {
  let frame = 0
  let resizeObserver: ResizeObserver | null = null
  let rootObserver: MutationObserver | null = null
  let observedGroup: HTMLElement | null = null

  function publish() {
    frame = 0
    geometry.value = measureFooterDock(container.value, group.value)
  }

  function schedule() {
    if (frame) return
    frame = window.requestAnimationFrame(publish)
  }

  function observe() {
    resizeObserver?.disconnect()
    observedGroup?.removeEventListener('transitionend', schedule)
    observedGroup = group.value
    observedGroup?.addEventListener('transitionend', schedule)
    if (resizeObserver) {
      ;[container.value, group.value, ...(group.value?.querySelectorAll<HTMLElement>('[data-footer-nav-role]') ?? [])]
        .filter((element): element is HTMLElement => Boolean(element))
        .forEach(element => resizeObserver?.observe(element))
    }
    schedule()
  }

  onMounted(() => {
    if (typeof ResizeObserver !== 'undefined') resizeObserver = new ResizeObserver(schedule)
    if (typeof MutationObserver !== 'undefined') {
      rootObserver = new MutationObserver(schedule)
      rootObserver.observe(document.documentElement, {
        attributes: true,
        attributeFilter: DOCK_HIDING_ROOT_ATTRIBUTES,
      })
    }
    window.addEventListener('resize', schedule)
    window.visualViewport?.addEventListener('resize', schedule)
    observe()
  })

  // Teleport 按 App 模式挂载或移除 Dock，节点变化时重新绑定观察。
  watch([container, group], observe, { flush: 'post' })

  onScopeDispose(() => {
    if (frame) window.cancelAnimationFrame(frame)
    frame = 0
    resizeObserver?.disconnect()
    rootObserver?.disconnect()
    observedGroup?.removeEventListener('transitionend', schedule)
    window.removeEventListener('resize', schedule)
    window.visualViewport?.removeEventListener('resize', schedule)
    geometry.value = null
  })
}
