<script lang="ts" setup>
import {
  animateGsapPageEnter,
  killGsapMotion,
  markPageEnterMotionWindow,
  useGsapMotionDisabled,
} from '@/composables/useGsapMotion'
import DefaultLayout from './default/components/DefaultLayout.vue'

const route = useRoute()
const routeContainerRef = ref<HTMLElement | null>(null)
const motionDisabled = useGsapMotionDisabled()

// keep-alive 缓存按页面身份命中，避免 query 变化导致同一页面反复新建实例。
const routeCacheKey = computed(() => {
  if (route.meta.keepAliveKey) return route.meta.keepAliveKey.toString()

  // 部分列表页的 query 会参与接口参数，缓存 key 需要保留完整路由避免串用旧数据。
  if (route.meta.keepAliveByFullPath) return route.fullPath

  return route.path
})

// 页面过渡按实际页面身份触发；keep-alive 页面避免 query 变化时反复入场。
const routeTransitionKey = computed(() => (route.meta.keepAlive ? routeCacheKey.value : route.fullPath))
let pageMotionFrame: number | null = null

// 使用稳定容器触发轻量入场动画，避免重建 keep-alive 导致页面缓存失效。
function playPageEnterMotion() {
  if (pageMotionFrame) {
    window.cancelAnimationFrame(pageMotionFrame)
    pageMotionFrame = null
  }

  pageMotionFrame = window.requestAnimationFrame(() => {
    pageMotionFrame = null

    if (routeContainerRef.value) {
      // 标记入场窗口，使页面内子级 appear 在整页入场期间跳过自身动画，避免叠加。
      if (!motionDisabled.value) markPageEnterMotionWindow()
      animateGsapPageEnter(routeContainerRef.value, {
        disabled: motionDisabled,
      })
    }
  })
}

watch(routeTransitionKey, playPageEnterMotion, { flush: 'post' })

onMounted(playPageEnterMotion)

onBeforeUnmount(() => {
  if (pageMotionFrame) window.cancelAnimationFrame(pageMotionFrame)
  if (routeContainerRef.value) killGsapMotion(routeContainerRef.value)
})
</script>

<template>
  <DefaultLayout>
    <router-view v-slot="{ Component }">
      <div ref="routeContainerRef" class="mp-page-route">
        <keep-alive :max="24">
          <component :is="Component" v-if="route.meta.keepAlive" :key="routeCacheKey" />
        </keep-alive>
        <component :is="Component" v-if="!route.meta.keepAlive" :key="route.fullPath" />
      </div>
    </router-view>
  </DefaultLayout>
</template>

<style lang="scss">
// As we are using `layouts` plugin we need its styles to be imported
@use '@layouts/styles/default-layout';
</style>
