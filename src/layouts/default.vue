<script lang="ts" setup>
import DefaultLayout from './components/DefaultLayout.vue'

const route = useRoute()

// keep-alive 缓存按页面身份命中，避免 query 变化导致同一页面反复新建实例。
const routeCacheKey = computed(() => route.meta.keepAliveKey?.toString() || route.path)
</script>

<template>
  <DefaultLayout>
    <router-view v-slot="{ Component }">
      <keep-alive :max="24">
        <component :is="Component" v-if="route.meta.keepAlive" :key="routeCacheKey" />
      </keep-alive>
      <component :is="Component" v-if="!route.meta.keepAlive" :key="route.fullPath" />
    </router-view>
  </DefaultLayout>
</template>

<style lang="scss">
// As we are using `layouts` plugin we need its styles to be imported
@use '@layouts/styles/default-layout';
</style>
