<script lang="ts" setup>
import { MediaInfo } from "@/api/types";

// 输入参数
const props = defineProps({
  media: Object as PropType<MediaInfo>
});

</script>

<template>
  <VHover>
  <template v-slot="{ isHovering }">
    <VCard
      class="card-img-overlay"
      :class="isHovering ? 'bg-opacity-50' : ''"
    >
      <VImg
        aspect-ratio="2/1"
        :src="props.media?.poster_path"
        cover
      >
        <VChip
          color="success"
          variant="elevated" 
          size="small" 
          class="absolute left-2 top-2">
            {{ props.media?.type }}
        </VChip>
        <VChip
          color="primary"
          variant="elevated" 
          size="small" 
          class="absolute right-2 top-2">
            {{ props.media?.vote_average }}
        </VChip>
        <VCardText
          class="flex flex-col flex-wrap justify-end align-left text-white absolute bottom-0 cursor-pointer"
        >
          <span class="text-white font-bold">{{ props.media?.year }}</span>
          <h1 class="text-white font-bold text-lg line-clamp-2 overflow-hidden text-ellipsis ...">
            {{ props.media?.title }}
          </h1>
          <p class="text-white line-clamp-3 overflow-hidden text-ellipsis ...">
            {{ props.media?.overview }}
          </p>
          <div class="flex align-center justify-between">
            <IconBtn icon="mdi-magnify" color="white"
            />
            <IconBtn icon="mdi-heart" color="white" />
          </div>
        </VCardText>
      </VImg>
    </VCard>
  </template>
  </VHover>
</template>

<style type="scss">
.card-img-overlay {
  box-shadow: 0 0 0 1px #ddd;
}
</style>
