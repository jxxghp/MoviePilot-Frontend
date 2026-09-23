<script lang="ts" setup>
const route = useRoute()

// 空白布局用于登录、服务状态、初始化与 404，路由切换直接呈现内容。
const routeTransitionKey = computed(() => route.fullPath)
</script>

<template>
  <div class="layout-wrapper layout-blank">
    <RouterView v-slot="{ Component }">
      <div :key="routeTransitionKey" class="mp-page-route">
        <component :is="Component" />
      </div>
    </RouterView>
  </div>
</template>

<style>
.layout-wrapper.layout-blank {
  flex-direction: column;
}
</style>
