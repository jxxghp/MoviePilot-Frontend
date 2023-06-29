<script lang="ts" setup>
import { MediaInfo } from "@/api/types";

// 输入参数
const props = defineProps({
  media: Object as PropType<MediaInfo>
});

</script>

<template>
  <VResponsive aspect-ratio="1/2">
    <VCard>
      <VImg
        :src="props.media?.poster_path"
        cover
      />
    </VCard>
  </VResponsive>
</template>
