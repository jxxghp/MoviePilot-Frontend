import { onBeforeUnmount, onMounted, ref, toValue, watch, type MaybeRefOrGetter } from 'vue'

export type ShellScrollDirection = 'idle' | 'up' | 'down'
export type ShellScrollState = 'expanded' | 'compact' | 'revealed'

export interface UseShellScrollStateOptions {
  /** 弹窗锁滚动期间冻结壳层，避免 body 定位变化误判为回顶。 */
  scrollLocked?: MaybeRefOrGetter<boolean>
  compactEnterAt?: number
  compactExitBelow?: number
  directionThreshold?: number
}

const DEFAULT_COMPACT_ENTER_AT = 64
const DEFAULT_COMPACT_EXIT_BELOW = 24
const DEFAULT_DIRECTION_THRESHOLD = 4

function readScrollY() {
  return Math.max(0, window.scrollY || 0)
}

/**
 * 统一 application shell 的滚动状态，避免不同布局各自监听并产生反相动画。
 */
export function useShellScrollState(options: UseShellScrollStateOptions) {
  const compactEnterAt = options.compactEnterAt ?? DEFAULT_COMPACT_ENTER_AT
  const compactExitBelow = options.compactExitBelow ?? DEFAULT_COMPACT_EXIT_BELOW
  const directionThreshold = options.directionThreshold ?? DEFAULT_DIRECTION_THRESHOLD

  const initialScrollY = typeof window === 'undefined' ? 0 : readScrollY()
  const scrollY = ref(initialScrollY)
  const state = ref<ShellScrollState>(initialScrollY > compactEnterAt ? 'compact' : 'expanded')
  const direction = ref<ShellScrollDirection>('idle')

  let frameId: number | null = null
  let lastScrollY = initialScrollY
  let directionAnchorY = initialScrollY

  const updateFromViewport = () => {
    frameId = null

    if (toValue(options.scrollLocked ?? false)) return

    const nextScrollY = readScrollY()

    scrollY.value = nextScrollY

    if (direction.value === 'idle') {
      const pendingDelta = nextScrollY - directionAnchorY

      if (Math.abs(pendingDelta) >= directionThreshold) {
        direction.value = pendingDelta > 0 ? 'down' : 'up'
        directionAnchorY = nextScrollY
      }
    } else if (direction.value === 'down') {
      if (nextScrollY > directionAnchorY) directionAnchorY = nextScrollY
      else if (directionAnchorY - nextScrollY >= directionThreshold) {
        direction.value = 'up'
        directionAnchorY = nextScrollY
      }
    } else if (nextScrollY < directionAnchorY) directionAnchorY = nextScrollY
    else if (nextScrollY - directionAnchorY >= directionThreshold) {
      direction.value = 'down'
      directionAnchorY = nextScrollY
    }

    if (nextScrollY < compactExitBelow) {
      state.value = 'expanded'
    } else if (state.value === 'expanded' && nextScrollY > compactEnterAt) {
      state.value = 'compact'
    } else if (state.value !== 'expanded') {
      if (direction.value === 'down') state.value = 'compact'
      else if (direction.value === 'up') state.value = 'revealed'
    }

    lastScrollY = nextScrollY
  }

  const scheduleViewportUpdate = () => {
    if (frameId !== null || toValue(options.scrollLocked ?? false)) return

    frameId = window.requestAnimationFrame(updateFromViewport)
  }

  onMounted(() => {
    window.addEventListener('scroll', scheduleViewportUpdate, { passive: true })
  })

  watch(
    () => toValue(options.scrollLocked ?? false),
    locked => {
      if (locked) {
        if (frameId !== null) window.cancelAnimationFrame(frameId)
        frameId = null
        return
      }

      lastScrollY = readScrollY()
      directionAnchorY = lastScrollY
      direction.value = 'idle'
      scrollY.value = lastScrollY
    },
  )

  onBeforeUnmount(() => {
    window.removeEventListener('scroll', scheduleViewportUpdate)

    if (frameId !== null) window.cancelAnimationFrame(frameId)
    frameId = null
  })

  return {
    direction,
    scrollY,
    state,
  }
}
