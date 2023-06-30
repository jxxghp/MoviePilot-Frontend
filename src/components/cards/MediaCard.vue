<script lang="ts" setup>
import { MediaInfo } from "@/api/types";

// 输入参数
const props = defineProps({
  media: Object as PropType<MediaInfo>,
  width: String,
  height: String,
});

// 图片加载状态
const isImageLoaded = ref(false);

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
    <template #default="hover">
      <VCard
        v-bind="hover.props"
        :height="props.height"
        :width="props.width"
        class="outline-none shadow ring-gray-500"
        :class="{
          'scale-105 shadow-lg': hover.isHovering,
          'ring-1 transition duration-300 ': isImageLoaded,
        }"
      >
        <VImg
          aspect-ratio="2/3"
          :src="props.media?.poster_path"
          class="object-cover aspect-w-2 aspect-h-3"
          :class="hover.isHovering ? 'on-hover' : ''"
          @load="isImageLoaded = true"
          cover
        >
          <template #placeholder>
            <div class="relative animate-pulse bg-gray-300 w-full">
              <div class="w-full h-full"></div>
            </div>
          </template>
          <!-- 类型角标 -->
          <VChip
            variant="elevated"
            size="small"
            :class="getChipColor(props.media?.type || '')"
            class="absolute left-2 top-2 bg-opacity-80 shadow-md text-white font-bold"
          >
            {{ props.media?.type }}
          </VChip>
          <!-- 评分角标 -->
          <VChip
            variant="elevated"
            size="small"
            v-if="props.media?.vote_average"
            :class="getChipColor('')"
            class="absolute right-2 top-2 bg-opacity-80 shadow-md text-white font-bold"
          >
            {{ props.media?.vote_average }}
          </VChip>
          <!-- 详情 -->
          <VCardText
            class="flex flex-col flex-wrap justify-end align-left text-white absolute bottom-0 cursor-pointer pa-2"
            v-show="hover.isHovering"
          >
            <span class="font-bold">{{ props.media?.year }}</span>
            <h1
              class="mb-1 text-white font-extrabold text-xl line-clamp-2 overflow-hidden text-ellipsis ..."
            >
              {{ props.media?.title }}
            </h1>
            <p class="leading-4 line-clamp-4 overflow-hidden text-ellipsis ...">
              {{ props.media?.overview }}
            </p>
            <div class="flex align-center justify-between">
              <IconBtn icon="mdi-magnify" color="white" />
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

.media-slide-card {
  position: relative;
  flex: 0 0 auto;
  max-inline-size: 11rem;
}
</style>
