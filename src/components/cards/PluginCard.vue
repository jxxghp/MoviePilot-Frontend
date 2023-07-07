<script lang="ts" setup>
import { Plugin } from "@/api/types";

// 输入参数
const props = defineProps({
  plugin: Object as PropType<Plugin>,
  width: String,
  height: String,
});
</script>
<template>
  <VCard :width="props.width" :height="props.height">
    <VImg :src="props.plugin?.plugin_icon" aspect-ratio="4/3" cover />

    <VCardItem>
      <VCardTitle>{{ props.plugin?.plugin_name }}</VCardTitle>
    </VCardItem>

    <VCardText>
      {{ props.plugin?.plugin_desc }}
    </VCardText>
  </VCard>
</template>
