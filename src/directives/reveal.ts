import type { Directive, DirectiveBinding } from 'vue'
import {
  animateGsapStaggerReveal,
  killGsapMotion,
  prefersReducedMotion,
  prepareGsapRevealElement,
} from '@/composables/useGsapMotion'

// v-reveal 指令：对宿主元素内匹配 selector 的子元素做一次性 stagger 进场动画，
// 封装原先各页面手写的 prepare + stagger + kill 生命周期样板。
//
// 用法：
//   v-reveal="'.item'"                          // 字符串简写，等价于 { selector: '.item' }
//   v-reveal="{ selector: '.item', y: 8 }"      // 完整配置
//   v-reveal="{ selector: '.item', trigger: key, enabled: ready, limit: 28 }"
//     - trigger 变化时重新播放（用于数据异步到达 / keep-alive 激活等场景）
//     - enabled 为 false 时跳过动画并保证内容可见
//     - limit 限制参与动画的元素数量，避免长列表一次性动画过多

export interface RevealDirectiveOptions {
  selector: string
  y?: number
  scale?: number
  duration?: number
  stagger?: number
  limit?: number
  enabled?: boolean
  // 任意可比较值，变化即触发重新播放。
  trigger?: unknown
}

type RevealBindingValue = string | RevealDirectiveOptions

interface RevealElementState {
  frameId: number | null
}

const STATE_KEY = '__vReveal__'

type RevealHostElement = HTMLElement & { [STATE_KEY]?: RevealElementState }

function normalizeOptions(value: RevealBindingValue | null | undefined): RevealDirectiveOptions | null {
  if (!value) return null

  if (typeof value === 'string') return { selector: value }

  if (!value.selector) return null

  return value
}

function collectTargets(el: HTMLElement, options: RevealDirectiveOptions): HTMLElement[] {
  const elements = Array.from(el.querySelectorAll<HTMLElement>(options.selector)).filter(
    element => element.isConnected,
  )

  if (options.limit && options.limit > 0) return elements.slice(0, options.limit)

  return elements
}

function cancelPendingFrame(state: RevealElementState | undefined) {
  if (state?.frameId != null && typeof window !== 'undefined') {
    window.cancelAnimationFrame(state.frameId)
    state.frameId = null
  }
}

function play(el: RevealHostElement, options: RevealDirectiveOptions) {
  const state = el[STATE_KEY]
  cancelPendingFrame(state)

  const run = () => {
    if (state) state.frameId = null

    const targets = collectTargets(el, options)
    if (!targets.length) return

    // reduce-motion 或显式禁用时，直接保证可见，不播放动画。
    if (options.enabled === false || prefersReducedMotion()) {
      killGsapMotion(targets)
      return
    }

    targets.forEach(element =>
      prepareGsapRevealElement(element, { scale: options.scale, y: options.y }),
    )
    animateGsapStaggerReveal(targets, {
      duration: options.duration,
      scale: options.scale,
      stagger: options.stagger,
      y: options.y,
    })
  }

  // 等待一帧让子内容完成布局，避免首帧测量为空。
  if (typeof window === 'undefined') {
    run()
    return
  }

  if (state) state.frameId = window.requestAnimationFrame(run)
}

function cleanup(el: RevealHostElement, options: RevealDirectiveOptions | null) {
  cancelPendingFrame(el[STATE_KEY])

  if (!options) return

  const targets = collectTargets(el, options)
  if (targets.length) killGsapMotion(targets)
}

export const vReveal: Directive<RevealHostElement, RevealBindingValue> = {
  mounted(el, binding) {
    el[STATE_KEY] = { frameId: null }

    const options = normalizeOptions(binding.value)
    if (options) play(el, options)
  },

  updated(el, binding: DirectiveBinding<RevealBindingValue>) {
    const options = normalizeOptions(binding.value)
    if (!options) return

    const previous = normalizeOptions(binding.oldValue)
    const triggerChanged = previous ? previous.trigger !== options.trigger : true
    const enabledTurnedOn = previous?.enabled === false && options.enabled !== false

    if (triggerChanged || enabledTurnedOn) play(el, options)
  },

  unmounted(el, binding) {
    cleanup(el, normalizeOptions(binding.value))
    delete el[STATE_KEY]
  },
}

export default vReveal
