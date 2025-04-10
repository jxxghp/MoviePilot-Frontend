<script setup lang="ts">
import { SystemNavMenus } from '@/router/menu'
import { useDisplay } from 'vuetify'
import { VMenu } from 'vuetify/lib/components/index.mjs'

const display = useDisplay()
const appMode = inject('pwaMode') && display.mdAndDown.value

const route = useRoute()

const moreMenuDialog = ref(false)

const moreMemus = computed(() => SystemNavMenus.filter(menu => !menu.footer))

const activeState = computed(() => {
  return {
    home: route.path === '/dashboard',
    recommend: route.path === '/recommend',
    subscribe: route.path.startsWith('/subscribe') || route.path === '/calendar',
  }
})

const moreActiveState = computed(() => {
  return !Object.values(activeState.value).some(v => v)
})

const currentPath = computed(() => route.path)
</script>

<template>
  <div v-if="appMode" class="w-100">
    <VBottomNavigation
      grow
      horizontal
      color="primary"
      class="footer-nav border-t"
      style="block-size: calc(3.5rem + env(safe-area-inset-bottom))"
      :z-index="9998"
    >
      <VBtn to="/dashboard" :ripple="false">
        <VIcon v-if="activeState.home" size="28">mdi-home</VIcon>
        <VIcon v-else size="28">mdi-home-outline</VIcon>
      </VBtn>
      <VBtn to="/recommend" :ripple="false">
        <VIcon v-if="activeState.recommend" size="28">mdi-star</VIcon>
        <VIcon v-else size="28">mdi-star-outline</VIcon>
      </VBtn>
      <VBtn to="/subscribe/movie" :ripple="false">
        <VIcon v-if="activeState.subscribe" size="28">mdi-rss</VIcon>
        <VIcon v-else size="28">mdi-rss-box</VIcon>
      </VBtn>
      <VBtn :ripple="false">
        <VIcon
          size="28"
          :icon="moreMenuDialog ? 'mdi-close' : 'mdi-dots-horizontal'"
          :color="moreActiveState ? 'primary' : ''"
        />
        <VMenu v-model="moreMenuDialog" close-on-content-click activator="parent">
          <VList class="font-bold" lines="one" elevation="1">
            <VListSubheader class="bg-transparent"> 更多 </VListSubheader>
            <VListItem
              class="pe-20 ps-5"
              v-for="(menu, index) in moreMemus"
              :key="index"
              :prepend-icon="menu.icon"
              nav
              :to="menu.to"
              :base-color="currentPath === menu.to ? 'primary' : undefined"
            >
              <VListItemTitle>
                <span class="text-lg">{{ menu.title }}</span>
              </VListItemTitle>
            </VListItem>
          </VList>
        </VMenu>
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
