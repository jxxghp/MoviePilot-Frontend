<script lang="ts" setup>
import {
  animateGsapStaggerReveal,
  killGsapMotion,
  prepareGsapRevealElement,
  useGsapMotionDisabled,
} from '@/composables/useGsapMotion'

// 定义输入参数
const props = defineProps({
  text: String,
})

const loadingRootRef = ref<HTMLElement | null>(null)
const motionDisabled = useGsapMotionDisabled()

function getLoadingMotionElements() {
  const root = loadingRootRef.value
  if (!root) return []

  return Array.from(root.querySelectorAll<HTMLElement>('.wave-loader, .initial-loading-text'))
}

onMounted(async () => {
  await nextTick()

  const elements = getLoadingMotionElements()
  elements.forEach(element => prepareGsapRevealElement(element, { disabled: motionDisabled, y: 10, scale: 0.99 }))
  animateGsapStaggerReveal(elements, { disabled: motionDisabled, duration: 0.28, stagger: 0.04, y: 10, scale: 0.99 })
})

onUnmounted(() => {
  const elements = getLoadingMotionElements()
  if (elements.length) killGsapMotion(elements)
})
</script>

<template>
  <div ref="loadingRootRef" class="w-full text-center text-gray-500 text-sm flex flex-col items-center my-5">
    <div class="initial-loading-container">
      <div class="initial-loading-content">
        <div class="wave-loader">
          <div class="wave-dot"></div>
          <div class="wave-dot"></div>
          <div class="wave-dot"></div>
          <div class="wave-dot"></div>
        </div>
        <div class="initial-loading-text" v-if="props.text">{{ props.text }}</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 初始的加载状态 */
.initial-loading-container {
  display: flex;
  align-items: center;
  justify-content: center;
  min-block-size: 20vh;
}

.initial-loading-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
}

.wave-loader {
  display: flex;
  align-items: center;
  block-size: 40px;
  gap: 6px;
}

.wave-dot {
  border-radius: 50%;
  animation: wave 1.5s ease-in-out infinite;
  background-color: rgb(var(--v-theme-primary));
  block-size: 8px;
  inline-size: 8px;
}

.wave-dot:nth-child(1) {
  animation-delay: 0s;
}

.wave-dot:nth-child(2) {
  animation-delay: 0.2s;
}

.wave-dot:nth-child(3) {
  animation-delay: 0.4s;
}

.wave-dot:nth-child(4) {
  animation-delay: 0.6s;
}

@keyframes wave {
  0%,
  100% {
    transform: translateY(0);
  }

  50% {
    transform: translateY(-15px);
  }
}

.initial-loading-text {
  color: rgb(var(--v-theme-primary));
  font-size: 0.9rem;
  font-weight: 500;
  letter-spacing: 1px;
}
</style>
