<script lang="ts" setup>
import { PropType } from 'vue';

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
        <VListItemSubtitle>{{ value }}</VListItemSubtitle>
      </VListItem>
    </VList>
  </VCardItem>
</template>
