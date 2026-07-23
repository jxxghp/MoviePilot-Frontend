export type ScrollTarget = Window | HTMLElement

let targetCache = new WeakMap<HTMLElement, ScrollTarget>()

/**
 * 清除祖先滚动容器缓存。响应式布局或 overlay 状态改变后必须重新解析。
 */
export function invalidateScrollTargetCache() {
  targetCache = new WeakMap<HTMLElement, ScrollTarget>()
}

function isScrollableOverflow(overflowY: string) {
  return overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay'
}

/**
 * 解析元素最近的纵向滚动容器，并让同一祖先链上的网格复用样式查询结果。
 */
export function findNearestScrollTarget(element: HTMLElement | null): ScrollTarget {
  if (!element) return window

  let parent = element.parentElement
  const visited: HTMLElement[] = []
  let target: ScrollTarget = window

  while (parent && parent !== document.body && parent !== document.documentElement) {
    const cachedTarget = targetCache.get(parent)
    if (cachedTarget) {
      target = cachedTarget
      break
    }

    visited.push(parent)

    if (isScrollableOverflow(window.getComputedStyle(parent).overflowY)) {
      target = parent
      break
    }

    parent = parent.parentElement
  }

  visited.forEach(ancestor => targetCache.set(ancestor, target))

  return target
}
