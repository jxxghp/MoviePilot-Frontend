<script lang="ts" setup>
const route = useRoute()
</script>

<template>
  <VApp>
    <RouterView :key="route.fullPath" />
  </VApp>
</template>
