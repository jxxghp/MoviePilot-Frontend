import { onScopeDispose, readonly, ref } from 'vue'

export const ROUTE_ENTER_MOTION_DURATION_MS = 180
export const ROUTE_ENTER_MOTION_EASING = 'cubic-bezier(0.2, 0.8, 0.2, 1)'

export type RouteEnterMotionPhase = 'idle' | 'armed' | 'running'

export interface RouteEnterMotionOptions {
  /** 重页面离场时多保留一个绘制边界，确保目标页起始态已交给 compositor。 */
  stagedHandoff?: boolean
}

function shouldSkipRouteEnterMotion() {
  const launchScreenActive =
    document.documentElement.dataset.launchLoading === 'true' && Boolean(document.getElementById('loading-bg'))

  return (
    launchScreenActive || document.hidden || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
  )
}

/**
 * 管理普通页面的入场动画时钟。动画在起始态暂停，经过所需绘制边界后才开始计时，
 * 避免主线程长帧让浏览器跳过动画前段。
 */
export function useRouteEnterMotion() {
  const phase = ref<RouteEnterMotionPhase>('idle')
  let activeAnimation: Animation | null = null
  let animationFrame: number | null = null
  let epoch = 0

  function cancel() {
    epoch += 1
    if (animationFrame !== null) window.cancelAnimationFrame(animationFrame)
    animationFrame = null
    activeAnimation?.cancel()
    activeAnimation = null
    phase.value = 'idle'
  }

  function playAfterPaints(animation: Animation, remainingPaints: number, motionEpoch: number) {
    if (motionEpoch !== epoch || animation !== activeAnimation) return

    if (remainingPaints <= 0) {
      phase.value = 'running'
      animation.play()
      return
    }

    animationFrame = window.requestAnimationFrame(() => {
      animationFrame = null
      playAfterPaints(animation, remainingPaints - 1, motionEpoch)
    })
  }

  function start(root: HTMLElement | null | undefined, options: RouteEnterMotionOptions = {}) {
    cancel()
    if (!root || shouldSkipRouteEnterMotion() || typeof root.animate !== 'function') return false

    epoch += 1
    const motionEpoch = epoch
    const animation = root.animate(
      [
        {
          opacity: 0,
          transform: 'translate3d(0, 0.5rem, 0) scale(0.992)',
        },
        {
          opacity: 1,
          transform: 'translate3d(0, 0, 0) scale(1)',
        },
      ],
      {
        duration: ROUTE_ENTER_MOTION_DURATION_MS,
        easing: ROUTE_ENTER_MOTION_EASING,
        fill: 'both',
      },
    )

    activeAnimation = animation
    animation.pause()
    animation.currentTime = 0
    phase.value = 'armed'

    void animation.finished
      .then(() => {
        if (motionEpoch !== epoch || animation !== activeAnimation) return
        activeAnimation = null
        phase.value = 'idle'
        animation.cancel()
      })
      .catch(() => {
        // cancel() 会拒绝 finished；epoch 已负责丢弃过期事务。
      })

    playAfterPaints(animation, options.stagedHandoff ? 2 : 1, motionEpoch)
    return true
  }

  function handleVisibilityChange() {
    if (document.hidden) cancel()
  }

  document.addEventListener('visibilitychange', handleVisibilityChange)
  onScopeDispose(() => {
    document.removeEventListener('visibilitychange', handleVisibilityChange)
    cancel()
  })

  return {
    cancel,
    phase: readonly(phase),
    start,
  }
}
