<script lang="ts" setup>
import api from "@/api";
import { MediaInfo } from "@/api/types";
import MediaCard from "@/components/cards/MediaCard.vue";

// 输入参数
const props = defineProps({
  apipath: String,
});

// 数据列表
const dataList = ref<MediaInfo[]>([]);

// 获取订阅列表数据
const fetchData = async () => {
  try {
    if (!props.apipath) {
      return;
    }
    dataList.value = await api.get(props.apipath);
  } catch (error) {
    console.error(error);
  }
};

// 加载时获取数据
onMounted(fetchData);
</script>

<template>
  <VSlideGroup show-arrows="false">
    <template #prev>
      <VBtn class="rounded-circle shadow-none" icon="mdi-chevron-left" color="grey" />
    </template>
    <VSlideGroupItem v-for="data in dataList" :key="data.tmdb_id">
      <MediaCard :media="data" height="15rem" width="10rem" />
    </VSlideGroupItem>
    <template #next>
      <VBtn class="rounded-circle shadow-none" icon="mdi-chevron-right" color="grey" />
    </template>
  </VSlideGroup>
</template>

<style type="scss">
.v-slide-group .v-card {
  @apply m-2;
}

.v-slide-group__prev {
  @apply absolute right-11;

  z-index: 3;
  margin-block-start: -40px;
}

.v-slide-group__next {
  @apply absolute right-1;

  z-index: 3;
  margin-block-start: -40px;
}
</style>
