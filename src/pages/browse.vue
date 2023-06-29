<script setup lang="ts">
import MediaCardListView from '@/views/discover/MediaCardListView.vue';

// 输入参数
const props = defineProps({
  type: String,
});

</script>

<template>
  <div>
    <MediaCardListView :apipath="props.type"/>
  </div>
</template>
