<script setup lang="ts">
import NoDataFound from '@/components/NoDataFound.vue'
</script>

<template>
  <NoDataFound
    error-code="404"
    error-title="页面不存在 ⚠️"
    error-description="您想要访问的页面不存在，请检查地址是否正确。"
  >
    <template #button>
      <VBtn
        to="/"
        class="mt-10"
      >
        返回
      </VBtn>
    </template>
  </NoDataFound>
</template>
