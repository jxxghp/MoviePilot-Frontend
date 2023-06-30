<script lang="ts" setup>
import { Subscribe } from "@/api/types";
import { formatSeason } from "@core/utils/formatters";

// 输入参数
const props = defineProps({
  media: Object as PropType<Subscribe>,
});

// 根据 type 返回不同的图标
const getIcon = (type: string) => {
  if (type === "电影") {
    return "mdi-movie";
  } else if (type === "电视剧") {
    return "mdi-television-classic";
  } else {
    return "mdi-help-circle";
  }
};

// 计算百分比
const getPercentage = (total: number, lack: number) => {
  if (total === 0) {
    return 0;
  }
  return Math.round(((total - lack) / total) * 100);
};
</script>

<template>
  <VCard
    :key="props.media?.id"
    :image="props.media?.backdrop || props.media?.poster"
    class="card-with-overlay"
  >
    <VCardItem>
      <template #prepend>
        <VIcon size="1.9rem" color="white" :icon="getIcon(props.media?.type || '')" />
      </template>
      <VCardTitle class="text-white">
        {{ props.media?.name }}
        {{ formatSeason(props.media?.season ? props.media?.season.toString() : "") }}
      </VCardTitle>
      <template #append>
        <div class="me-n3">
          <MoreBtn color="white" />
        </div>
      </template>
    </VCardItem>

    <VCardText>
      <p class="clamp-text text-white mb-0">
        {{ props.media?.description }}
      </p>
    </VCardText>

    <VCardText class="d-flex justify-space-between align-center flex-wrap">
      <div class="d-flex align-center">
        <IconBtn icon="mdi-star" color="white" class="me-1" />
        <span class="text-subtitle-2 text-white me-4">{{ props.media?.vote }}</span>

        <IconBtn
          icon="mdi-progress-clock"
          color="white"
          class="me-1"
          v-if="props.media?.total_episode"
        />
        <span class="text-subtitle-2 text-white" v-if="props.media?.season"
          >{{ (props.media?.total_episode || 0) - (props.media?.lack_episode || 0) }} /
          {{ props.media?.total_episode }}</span
        >
      </div>
    </VCardText>

    <VProgressLinear
      v-if="props.media?.total_episode || 0 > 0"
      :model-value="
        getPercentage(props.media?.total_episode || 0, props.media?.lack_episode || 0)
      "
      bg-color="success"
      color="success"
    />
  </VCard>
</template>

<style lang="scss">
.card-with-overlay img {
  @apply brightness-50;
}
</style>
