<script lang="ts" setup>
import DefaultLayout from './components/DefaultLayout.vue'

const route = useRoute()
</script>

<template>
  <DefaultLayout>
    <router-view v-slot="{ Component }">
      <keep-alive>
        <component :is="Component" v-if="route.meta.keepAlive" :key="route.fullPath" />
      </keep-alive>
      <component :is="Component" v-if="!route.meta.keepAlive" :key="route.fullPath" />
    </router-view>
  </DefaultLayout>
</template>

<style lang="scss">
// As we are using `layouts` plugin we need its styles to be imported
@use '@layouts/styles/default-layout';
</style>
