<script setup lang="ts">
const props = defineProps({
  value: Number,
  text: String,
})
</script>
<template>
  <!-- 手动整理进度框 -->
  <VDialog :scrim="false" width="25rem">
    <VCard color="primary">
      <VCardText class="text-center">
        {{ props.text }}
        <VProgressLinear color="white" class="mb-0 mt-1" :model-value="props.value" indeterminate />
      </VCardText>
    </VCard>
  </VDialog>
</template>
