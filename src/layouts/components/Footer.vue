<script setup lang="ts">
import { useDisplay } from 'vuetify'

const display = useDisplay()
const appMode = computed(() => {
  return localStorage.getItem('MP_APPMODE') == '1' && display.mdAndDown.value
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
        <VIcon size="28">mdi-home-outline</VIcon>
        <span>首页</span>
      </VBtn>
      <VBtn to="/ranking" :ripple="false">
        <VIcon size="28">mdi-star-check-outline</VIcon>
        <span>推荐</span>
      </VBtn>
      <VBtn to="/subscribe-movie?tab=mysub" :ripple="false">
        <VIcon size="28">mdi-movie-roll</VIcon>
        <span><span></span>电影</span>
      </VBtn>
      <VBtn to="/subscribe-tv?tab=mysub" :ripple="false">
        <VIcon size="28">mdi-television-classic</VIcon>
        <span>电视剧</span>
      </VBtn>
      <VBtn to="/apps" :ripple="false">
        <VIcon size="28">mdi-dots-horizontal</VIcon>
        <span>更多</span>
      </VBtn>
    </VBottomNavigation>
  </div>
</template>
<
<style lang="scss">
.footer-nav {
  padding-block-end: env(safe-area-inset-bottom);
}

.footer-nav .v-btn--variant-text .v-btn__overlay {
  background-color: transparent !important;
}
</style>
}
