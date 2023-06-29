<script lang="ts" setup>
import { MediaInfo } from "@/api/types";

// 输入参数
const props = defineProps({
  media: Object as PropType<MediaInfo>
});

const getChipColor = (type: string) => {
  if (type === "电影") {
    return "border-blue-500 bg-blue-600";
  } else if (type === "电视剧") {
    return " bg-indigo-500 border-indigo-600";
  } else {
    return "border-purple-600 bg-purple-600";
  }
};

</script>

<template>
  <VHover v-bind="props">
  <template #default="hover" >
    <VCard
      v-bind="hover.props"
      class="outline-none ring-1 transition duration-300 shadow ring-gray-500"
      :class="hover.isHovering ? 'scale-105 shadow-lg' : ''"
    >
      <VImg
        aspect-ratio="2/1"
        :src="props.media?.poster_path"
        class="h-full w-full object-cover"
        :class="hover.isHovering ? 'on-hover' : ''"
        cover
      >
        <!-- 类型角标 -->
        <VChip
          variant="elevated" 
          size="small" 
          :class="getChipColor(props.media?.type||'')"
          class="absolute left-2 top-2 bg-opacity-80 shadow-md text-white font-bold">
            {{ props.media?.type }}
        </VChip>
        <!-- 评分角标 -->
        <VChip
          variant="elevated" 
          size="small"
          v-if="props.media?.vote_average"
          :class="getChipColor('')"
          class="absolute right-2 top-2 bg-opacity-80 shadow-md text-white font-bold">
            {{ props.media?.vote_average }}
        </VChip>
        <!-- 详情 -->
        <VCardText
          class="flex flex-col flex-wrap justify-end align-left text-white absolute bottom-0 cursor-pointer pa-2"
          v-show="hover.isHovering"
        >
          <span class="font-bold">{{ props.media?.year }}</span>
          <h1 class="mb-1 text-white font-extrabold text-xl line-clamp-2 overflow-hidden text-ellipsis ...">
            {{ props.media?.title }}
          </h1>
          <p class="leading-4 line-clamp-4 overflow-hidden text-ellipsis ...">
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
.on-hover img {
  @apply brightness-50;
}
</style>
