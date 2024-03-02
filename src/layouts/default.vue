<script lang="ts" setup>
import DefaultLayoutWithVerticalNav from './components/DefaultLayoutWithVerticalNav.vue'
import api from '@/api'

const router = useRouter()
const route = useRoute()
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    api.get('user/current')
      .catch(() => {
        router.replace('/login')
      })
  }
})
</script>

<template>
  <DefaultLayoutWithVerticalNav>
    <router-view v-slot="{ Component }">
      <keep-alive>
        <component :is="Component" v-if="route.meta.keepAlive" :key="route.fullPath" />
      </keep-alive>
      <component :is="Component" v-if="!route.meta.keepAlive" :key="route.fullPath" />
    </router-view>
  </DefaultLayoutWithVerticalNav>
</template>

<style lang="scss">
// As we are using `layouts` plugin we need its styles to be imported
@use "@layouts/styles/default-layout";
</style>
