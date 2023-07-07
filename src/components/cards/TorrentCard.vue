<script lang="ts" setup>
import { Context } from "@/api/types";

// 输入参数
const props = defineProps({
  torrent: Object as PropType<Context>,
  width: String,
  height: String,
});
</script>
<template>
  <VCard :width="props.width" :height="props.height">
    <VCardItem>
      <VCardTitle>{{ props.torrent?.torrent_info.title }}</VCardTitle>
    </VCardItem>

    <VCardText>
      {{ props.torrent?.torrent_info.description }}
    </VCardText>
  </VCard>
</template>
