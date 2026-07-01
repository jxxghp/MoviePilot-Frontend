<script setup lang="ts">
import {
  animateGsapFadeSlideEnter,
  animateGsapFadeSlideLeave,
  isPageEnterMotionActive,
  killGsapMotion,
  useGsapMotionDisabled,
} from '@/composables/useGsapMotion'

const props = withDefaults(
  defineProps<{
    appear?: boolean
    duration?: number
    leaveDuration?: number
    mode?: 'out-in' | 'in-out'
    x?: number
    y?: number
  }>(),
  {
    appear: false,
    duration: 0.28,
    leaveDuration: 0.16,
    mode: undefined,
    x: 18,
    y: 0,
  },
)

const motionDisabled = useGsapMotionDisabled()

function handleEnter(element: Element, done: () => void) {
  // 容器级整页入场进行中时，子级直接显示，避免与 page-enter 在同一次导航上叠加动画。
  if (isPageEnterMotionActive()) {
    killGsapMotion(element)
    done()
    return
  }

  animateGsapFadeSlideEnter(element, {
    disabled: motionDisabled,
    duration: props.duration,
    onComplete: done,
    x: props.x,
    y: props.y,
  })
}

function handleLeave(element: Element, done: () => void) {
  animateGsapFadeSlideLeave(element, {
    disabled: motionDisabled,
    duration: props.leaveDuration,
    onComplete: done,
    x: Math.max(8, props.x * 0.65),
    y: props.y,
  })
}
</script>

<template>
  <Transition :appear="appear" :css="false" :mode="mode" @enter="handleEnter" @leave="handleLeave">
    <slot />
  </Transition>
</template>
