<script setup lang="ts">
import MediaCardListView from '@/views/discover/MediaCardListView.vue';

// 输入参数
const props = defineProps({
  type: Array as PropType<string[]>,
});

console.log(props.type);

</script>

<template>
  <div>
    <MediaCardListView :apipath="props.type?.join('/')"/>
  </div>
</template>
