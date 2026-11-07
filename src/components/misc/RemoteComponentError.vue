<!-- 联邦远程组件加载失败时使用预编译错误态，兼容生产环境的 Vue runtime-only 构建。 -->
<script setup lang="ts">
defineProps<{ retry?: () => void }>()
</script>

<template>
  <div class="pa-4">
    <VAlert type="error" title="组件加载错误">
      无法加载组件，请稍后再试
      <VBtn v-if="retry" class="ms-3" variant="tonal" @click="retry">重新加载</VBtn>
    </VAlert>
  </div>
</template>
