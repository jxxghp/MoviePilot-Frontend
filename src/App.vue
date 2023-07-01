<script lang="ts" setup>
const route = useRoute();

const onRefresh = () => {
  location.reload();
};
</script>

<template>
  <VApp>
    <PullRefresh @refresh="onRefresh">
      <RouterView :key="route.fullPath" />
    </PullRefresh>
  </VApp>
</template>
