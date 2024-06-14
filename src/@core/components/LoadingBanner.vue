<script lang="ts" setup>
// 定义输入参数
const props = defineProps({
  progress: Number,
  text: String,
})
</script>

<template>
  <div class="w-full text-center text-gray-500 text-sm flex flex-col items-center">
    <VProgressCircular v-if="!props.text || !props.progress" class="mb-3" size="64" indeterminate color="primary" />
    <VProgressCircular v-if="props.progress" class="mb-3" color="primary" :model-value="props.progress" size="64" />
    <span>{{ props.text }}</span>
  </div>
</template>
