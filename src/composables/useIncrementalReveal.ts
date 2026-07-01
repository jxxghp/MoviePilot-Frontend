import { onScopeDispose, toValue, type MaybeRefOrGetter } from 'vue'
import {
  animateGsapStaggerReveal,
  gsap,
  killGsapMotion,
  prepareGsapRevealElement,
} from '@/composables/useGsapMotion'

// 增量进场动画 composable：封装虚拟/分批列表共用的有状态逻辑——
// 首次见到的元素入队、requestAnimationFrame 批处理、对本批做 stagger 进场、按需清理。
//
// 各页面（ProgressiveCardGrid / TransferHistoryView / dashboard）原先各自重复实现这套流程，
// 这里抽取共性，特定守卫（overlay 冻结、isMobile、gs-id 去重）仍保留在调用方。

type RevealKey = string | number

export interface IncrementalRevealOptions {
  // reduce-motion 或业务条件禁用时，不播放动画但保证内容可见。
  disabled?: MaybeRefOrGetter<boolean>
  duration?: number
  stagger?: number
  y?: number
  scale?: number
  // 进场前 prepare 元素时使用的清理属性，默认与 stagger 一致。
  clearProps?: string
}

const DEFAULT_REVEAL_CLEAR_PROPS = 'opacity,visibility,transform,willChange'

export function useIncrementalReveal(options: IncrementalRevealOptions = {}) {
  const revealedKeys = new Set<RevealKey>()
  const pendingElements = new Map<RevealKey, HTMLElement>()
  // 跟踪所有交给本实例的元素，便于 cleanup 时统一 kill。
  const trackedElements = new Map<RevealKey, HTMLElement>()

  let frameId: number | null = null

  const clearProps = options.clearProps ?? DEFAULT_REVEAL_CLEAR_PROPS

  function isDisabled() {
    return Boolean(options.disabled !== undefined && toValue(options.disabled))
  }

  function resetElement(element: HTMLElement) {
    killGsapMotion(element)
    gsap.set(element, {
      autoAlpha: 1,
      clearProps,
      scale: 1,
      y: 0,
    })
  }

  function cancelFrame() {
    if (frameId !== null && typeof window !== 'undefined') {
      window.cancelAnimationFrame(frameId)
      frameId = null
    }
  }

  function flush() {
    frameId = null

    const entries = Array.from(pendingElements.entries()).filter(([, element]) => element.isConnected)
    pendingElements.clear()

    entries.forEach(([key]) => revealedKeys.add(key))

    const elements = entries.map(([, element]) => element)
    if (!elements.length) return

    animateGsapStaggerReveal(elements, {
      disabled: options.disabled,
      duration: options.duration,
      scale: options.scale,
      stagger: options.stagger,
      y: options.y,
    })
  }

  // 入队一个元素：首次出现即 prepare 并安排批处理；已揭示或重复的跳过。
  function queue(key: RevealKey, element: HTMLElement) {
    trackedElements.set(key, element)

    if (isDisabled() || revealedKeys.has(key) || typeof window === 'undefined') return

    if (pendingElements.get(key) === element) return

    const previous = pendingElements.get(key)
    if (previous && previous !== element) resetElement(previous)

    pendingElements.set(key, element)
    prepareGsapRevealElement(element, {
      disabled: options.disabled,
      scale: options.scale,
      y: options.y,
    })

    if (frameId !== null) return

    frameId = window.requestAnimationFrame(flush)
  }

  // 解除对某个 key 的跟踪（元素被回收时调用），并恢复其可见状态。
  function release(key: RevealKey) {
    const pending = pendingElements.get(key)
    if (pending) {
      resetElement(pending)
      pendingElements.delete(key)
    }

    const tracked = trackedElements.get(key)
    if (tracked) {
      killGsapMotion(tracked)
      trackedElements.delete(key)
    }

    revealedKeys.delete(key)
  }

  // 取消待处理动画并恢复所有已跟踪元素的可见状态。
  function cleanup(opts: { clearRevealed?: boolean } = {}) {
    cancelFrame()

    pendingElements.forEach((element, key) => {
      revealedKeys.delete(key)
      resetElement(element)
    })
    pendingElements.clear()

    trackedElements.forEach(element => killGsapMotion(element))

    if (opts.clearRevealed) {
      revealedKeys.clear()
      trackedElements.clear()
    }
  }

  // 清空"已揭示"记录，使后续元素重新参与进场（用于列表整体刷新）。
  function reset() {
    cancelFrame()
    pendingElements.forEach(element => resetElement(element))
    pendingElements.clear()
    revealedKeys.clear()
  }

  onScopeDispose(() => cancelFrame())

  return {
    queue,
    release,
    cleanup,
    reset,
    isRevealed: (key: RevealKey) => revealedKeys.has(key),
    hasTracked: (key: RevealKey) => trackedElements.has(key),
  }
}
