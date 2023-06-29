<script lang="ts" setup>
import api from "@/api";
import type { Subscribe } from "@/api/types";
import { formatSeason } from "@core/utils/formatters";

// 输入参数
const props = defineProps({
  type: String,
});

// 数据列表
const dataList = ref<Subscribe[]>([]);

// 获取订阅列表数据
const fetchData = async () => {
  try {
    dataList.value = await api.get("/subscribe");
  } catch (error) {
    console.error(error);
  }
};

// 加载时获取数据
onMounted(fetchData);

// 过滤数据
const filteredDataList = computed(() => {
  return dataList.value.filter((data) => data.type === props.type);
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
  <div class="grid gap-3 grid-subscribe-card">
    <VCard v-for="data in filteredDataList" 
      :key="data.id" 
      :image="data.backdrop || data.poster" 
      class="card-with-overlay">
      <VCardItem>
        <template #prepend>
          <VIcon
            size="1.9rem"
            color="white"
            :icon="getIcon(data.type)"
            class="overlay-text"
          />
        </template>
        <VCardTitle class="text-white overlay-text">
          {{ data.name }} {{ formatSeason(data.season ? data.season.toString() : "") }}
        </VCardTitle>
        <template #append>
          <div class="me-n3">
            <MoreBtn color="white" class="overlay-text"/>
          </div>
        </template>
      </VCardItem>

      <VCardText class="overlay-text">
        <p class="clamp-text text-white mb-0">
          {{ data.description }}
        </p>
      </VCardText>

      <VCardText
        class="d-flex justify-space-between align-center flex-wrap overlay-text"
      >
        <div class="d-flex align-center">
          <IconBtn icon="mdi-star" color="white" class="me-1" />
          <span class="text-subtitle-2 text-white me-4">{{ data.vote }}</span>

          <IconBtn
            icon="mdi-progress-clock"
            color="white"
            class="me-1"
            v-if="data.total_episode"
          />
          <span class="text-subtitle-2 text-white" v-if="data.season"
            >{{ (data.total_episode || 0) - (data.lack_episode || 0) }} /
            {{ data.total_episode }}</span
          >
        </div>
      </VCardText>

      <VProgressLinear
        v-if="data.total_episode || 0 > 0"
        :model-value="getPercentage(data.total_episode || 0, data.lack_episode || 0)"
        bg-color="success"
        color="success"
      />
    </VCard>
  </div>
</template>

<style lang="scss">
.card-with-overlay {
  position: relative;
}

.card-with-overlay::before {
  position: absolute;
  z-index: 1;
  background-color: rgba(0, 0, 0, 40%); /* 背景遮罩的颜色和透明度 */
  block-size: 100%;
  content: "";
  inline-size: 100%;
  inset-block-start: 0;
  inset-inline-start: 0;
}

.overlay-text {
  position: relative;
  z-index: 2;
}
</style>
