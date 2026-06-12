<script lang="ts" setup>
const route = useRoute()

// 空白布局用于登录、初始化与 404，复用全局页面动效保持切换手感一致。
const routeTransitionKey = computed(() => route.fullPath)
</script>

<template>
  <div class="layout-wrapper layout-blank">
    <RouterView v-slot="{ Component }">
      <transition name="mp-page" mode="out-in" appear>
        <div :key="routeTransitionKey" class="mp-page-route">
          <component :is="Component" />
        </div>
      </transition>
    </RouterView>
  </div>
</template>

<style>
.layout-wrapper.layout-blank {
  flex-direction: column;
}
</style>
