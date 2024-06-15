<script setup lang="ts">
import { useDisplay } from 'vuetify'

const display = useDisplay()
const appMode = computed(() => {
  return localStorage.getItem('MP_APPMODE') != '0' && display.mdAndDown.value
})

const route = useRoute()

// 各按钮活动状态
const activeState = computed(() => {
  return {
    home: route.path === '/dashboard',
    ranking: route.path === '/ranking',
    movie: route.path === '/subscribe/movie',
    tv: route.path === '/subscribe/tv',
    apps: route.path === '/apps',
  }
})
</script>

<template>
  <div v-if="appMode" class="w-100" style="block-size: calc(3.5rem + env(safe-area-inset-bottom))">
    <VBottomNavigation
      grow
      horizontal
      color="primary"
      class="footer-nav border-t"
      style="block-size: calc(3.5rem + env(safe-area-inset-bottom))"
    >
      <VBtn to="/dashboard" :ripple="false">
        <VIcon v-if="activeState.home" size="28">mdi-home</VIcon>
        <VIcon v-else size="28">mdi-home-outline</VIcon>
      </VBtn>
      <VBtn to="/ranking" :ripple="false">
        <VIcon v-if="activeState.ranking" size="28">mdi-star</VIcon>
        <VIcon v-else size="28">mdi-star-outline</VIcon>
      </VBtn>
      <VBtn to="/subscribe/movie" :ripple="false">
        <VIcon v-if="activeState.movie" size="28">mdi-movie-open</VIcon>
        <VIcon v-else size="28">mdi-movie-open-outline</VIcon>
      </VBtn>
      <VBtn to="/subscribe/tv" :ripple="false">
        <VIcon v-if="activeState.tv" size="28">mdi-television-play</VIcon>
        <VIcon v-else size="28">mdi-television</VIcon>
      </VBtn>
      <VBtn to="/apps" :ripple="false">
        <VIcon v-if="activeState.apps" size="28">mdi-dots-horizontal-circle</VIcon>
        <VIcon v-else size="28">mdi-dots-horizontal</VIcon>
      </VBtn>
    </VBottomNavigation>
  </div>
</template>

<style lang="scss">
.footer-nav {
  /* stylelint-disable-next-line property-no-vendor-prefix */
  -webkit-backdrop-filter: blur(6px);
  backdrop-filter: blur(6px);
  background-color: rgb(var(--v-theme-surface), 0.8);
  padding-block-end: env(safe-area-inset-bottom);
}

.footer-nav .v-btn--variant-text .v-btn__overlay {
  background-color: transparent !important;
}
</style>
}
