import { usePreferredReducedMotion } from '@vueuse/core'
import { computed, toValue, type MaybeRefOrGetter } from 'vue'
import { gsap } from 'gsap'

const motionClearProps = 'opacity,visibility,transform,filter,willChange'

export { gsap }

export interface GsapMotionOptions {
  disabled?: MaybeRefOrGetter<boolean>
  duration?: number
  onComplete?: () => void
}

function isMotionDisabled(disabled?: MaybeRefOrGetter<boolean>) {
  return Boolean(disabled === undefined ? false : toValue(disabled))
}

function showWithoutMotion(target: Element | Element[], onComplete?: () => void) {
  gsap.killTweensOf(target)
  gsap.set(target, {
    autoAlpha: 1,
    clearProps: motionClearProps,
    x: 0,
    y: 0,
    scale: 1,
  })
  onComplete?.()
}

function hideWithoutMotion(target: Element | Element[], onComplete?: () => void) {
  gsap.killTweensOf(target)
  gsap.set(target, {
    autoAlpha: 0,
    x: 0,
    y: 0,
    scale: 1,
  })
  onComplete?.()
}

export function useGsapMotionDisabled() {
  const preferredMotion = usePreferredReducedMotion()

  return computed(() => preferredMotion.value === 'reduce')
}

export function killGsapMotion(target: Element | Element[]) {
  gsap.killTweensOf(target)
}

export function animateGsapPageEnter(element: Element, options: GsapMotionOptions = {}) {
  if (isMotionDisabled(options.disabled)) {
    showWithoutMotion(element, options.onComplete)
    return
  }

  gsap.killTweensOf(element)

  return gsap.fromTo(
    element,
    {
      autoAlpha: 0,
      filter: 'blur(1px)',
      scale: 0.992,
      y: 8,
    },
    {
      autoAlpha: 1,
      clearProps: motionClearProps,
      duration: options.duration ?? 0.22,
      ease: 'power2.out',
      filter: 'blur(0px)',
      onComplete: options.onComplete,
      overwrite: true,
      scale: 1,
      y: 0,
    },
  )
}

export function animateGsapFadeSlideEnter(
  element: Element,
  options: GsapMotionOptions & { x?: number; y?: number } = {},
) {
  if (isMotionDisabled(options.disabled)) {
    showWithoutMotion(element, options.onComplete)
    return
  }

  gsap.killTweensOf(element)

  return gsap.fromTo(
    element,
    {
      autoAlpha: 0,
      x: options.x ?? 18,
      y: options.y ?? 0,
    },
    {
      autoAlpha: 1,
      clearProps: motionClearProps,
      duration: options.duration ?? 0.28,
      ease: 'power3.out',
      onComplete: options.onComplete,
      overwrite: true,
      x: 0,
      y: 0,
    },
  )
}

export function animateGsapFadeSlideLeave(
  element: Element,
  options: GsapMotionOptions & { x?: number; y?: number } = {},
) {
  if (isMotionDisabled(options.disabled)) {
    hideWithoutMotion(element, options.onComplete)
    return
  }

  gsap.killTweensOf(element)

  return gsap.to(element, {
    autoAlpha: 0,
    duration: options.duration ?? 0.16,
    ease: 'power1.in',
    onComplete: options.onComplete,
    overwrite: true,
    x: options.x ?? 12,
    y: options.y ?? 0,
  })
}

export function prepareGsapRevealElement(
  element: Element,
  options: { disabled?: MaybeRefOrGetter<boolean>; scale?: number; y?: number } = {},
) {
  if (isMotionDisabled(options.disabled)) return

  gsap.set(element, {
    autoAlpha: 0,
    scale: options.scale ?? 0.985,
    y: options.y ?? 14,
    willChange: 'opacity, transform',
  })
}

export function animateGsapStaggerReveal(
  elements: Element[],
  options: GsapMotionOptions & { scale?: number; stagger?: number; y?: number } = {},
) {
  const targets = elements.filter(element => element.isConnected)
  if (!targets.length) return

  if (isMotionDisabled(options.disabled)) {
    showWithoutMotion(targets, options.onComplete)
    return
  }

  gsap.killTweensOf(targets)

  return gsap.to(targets, {
    autoAlpha: 1,
    clearProps: motionClearProps,
    duration: options.duration ?? 0.36,
    ease: 'power3.out',
    onComplete: options.onComplete,
    overwrite: 'auto',
    scale: 1,
    stagger: {
      amount: Math.min((targets.length - 1) * (options.stagger ?? 0.025), 0.18),
      from: 'start',
    },
    y: 0,
  })
}
