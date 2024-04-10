<script lang="ts" setup>
import type { PropType } from 'vue'

// 输入参数
const props = defineProps({
  history: Object as PropType<{ [key: string]: string }>,
})
</script>

<template>
  <VCardItem>
    <VList>
      <VListItem
        v-for="(value, key) in props.history"
        :key="key"
      >
        <VListItemTitle>{{ key }}</VListItemTitle>
        <div class="text-gray-500">
          {{ value }}
        </div>
      </VListItem>
    </VList>
  </VCardItem>
</template>
