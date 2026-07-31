<script lang="ts" setup>
import DefaultLayout from './default/components/DefaultLayout.vue'
import { usePagePresentationMotion } from '@/composables/usePagePresentationMotion'
import { useRouteEnterMotion } from '@/composables/useRouteEnterMotion'

const route = useRoute()
const pagePresentationMotion = usePagePresentationMotion()
const routeEnterMotion = useRouteEnterMotion()

// keep-alive 缓存按页面身份命中，避免 query 变化导致同一页面反复新建实例。
const routeCacheKey = computed(() => {
  if (route.meta.keepAliveKey) return route.meta.keepAliveKey.toString()

  // 部分列表页的 query 会参与接口参数，缓存 key 需要保留完整路由避免串用旧数据。
  if (route.meta.keepAliveByFullPath) return route.fullPath

  return route.path
})

// 页面过渡按实际页面身份触发；keep-alive 页面避免 query 变化时反复入场。
const routeTransitionKey = computed(() => (route.meta.keepAlive ? routeCacheKey.value : route.fullPath))
const pageRouteRef = ref<HTMLElement | null>(null)

// 默认布局只编排路由事务；普通页面与玻璃材质分别由各自 driver 执行动画。
function playPageEnterMotion() {
  routeEnterMotion.cancel()
  if (pagePresentationMotion.start(routeTransitionKey.value, pageRouteRef.value)) return

  routeEnterMotion.start(pageRouteRef.value)
}

watch(routeTransitionKey, playPageEnterMotion, { flush: 'post' })

onMounted(playPageEnterMotion)

onBeforeUnmount(() => {
  routeEnterMotion.cancel()
  pagePresentationMotion.cancel()
})
</script>

<template>
  <DefaultLayout>
    <router-view v-slot="{ Component }">
      <div ref="pageRouteRef" class="mp-page-route">
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
