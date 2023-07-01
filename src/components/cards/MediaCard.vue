<script lang="ts" setup>
import api from "@/api";
import { MediaInfo, Subscribe } from "@/api/types";

// 输入参数
const props = defineProps({
  media: Object as PropType<MediaInfo>,
  width: String,
  height: String,
});

// 图片加载状态
const isImageLoaded = ref(false);

// 订阅状态
const isSubscribed = ref(false);

// 角标颜色
const getChipColor = (type: string) => {
  if (type === "电影") {
    return "border-blue-500 bg-blue-600";
  } else if (type === "电视剧") {
    return " bg-indigo-500 border-indigo-600";
  } else {
    return "border-purple-600 bg-purple-600";
  }
};

// 添加订阅
const addSubscribe = async () => {
  try {
    const result: { [key: string]: any } = await api.post("subscribe", {
      name: props.media?.title,
      type: props.media?.type,
      year: props.media?.year,
      tmdbid: props.media?.tmdb_id,
      doubanid: props.media?.douban_id,
      season: props.media?.season,
    });
    isSubscribed.value = result.success || false;
  } catch (error) {
    console.error(error);
  }
};

// 取消订阅
const removeSubscribe = async () => {
  try {
    let mediaid = props.media?.tmdb_id
      ? `tmdb:${props.media?.tmdb_id}`
      : `douban:${props.media?.douban_id}`;
    const result: { [key: string]: any } = await api.delete(`subscribe/${mediaid}`, {
      params: {
        season: props.media?.season,
      },
    });
    isSubscribed.value = !(result.success || false);
  } catch (error) {
    console.error(error);
  }
};

// 查询是否已订阅
const checkSubscribe = async () => {
  try {
    let mediaid = props.media?.tmdb_id
      ? `tmdb:${props.media?.tmdb_id}`
      : `douban:${props.media?.douban_id}`;
    const result: Subscribe = await api.get(`subscribe/${mediaid}`, {
      params: {
        season: props.media?.season,
      },
    });
    isSubscribed.value = !!result.id;
  } catch (error) {
    console.error(error);
  }
};

// 订阅按钮响应
const handleSubscribe = () => {
  if (isSubscribed.value) {
    removeSubscribe();
  } else {
    addSubscribe();
  }
};

// 装载时检查是否已订阅
onMounted(checkSubscribe);
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
          'transition transform-cpu duration-300 scale-105 shadow-lg': hover.isHovering,
          'ring-1': isImageLoaded,
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
              <IconBtn
                icon="mdi-heart"
                :color="isSubscribed ? 'error' : 'white'"
                @click="handleSubscribe"
              />
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
