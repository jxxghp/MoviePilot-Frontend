<script setup lang="ts">
import { useNativePageHeader } from '@/native/page'

const props = defineProps({
  // 标题
  title: String,
})

useNativePageHeader({ title: () => props.title })
</script>
<template>
  <div v-if="title" class="my-3 mx-3 md:flex md:items-center md:justify-between" data-native-page-title>
    <div class="min-w-0 flex-1 mx-0">
      <h2
        class="ms-1 truncate text-2xl font-bold leading-7 text-gray-100 sm:overflow-visible sm:text-3xl sm:leading-9 md:mb-0"
        data-testid="page-header"
      >
        <span class="text-moviepilot">{{ title }}</span>
      </h2>
    </div>
  </div>
</template>
