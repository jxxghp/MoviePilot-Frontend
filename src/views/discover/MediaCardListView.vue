<script lang="ts" setup>
import api from "@/api";
import { MediaInfo } from "@/api/types";
import MediaCard from "@/components/cards/MediaCard.vue";

// 输入参数
const props = defineProps({
  apipath: String,
});

// 当前页码
const page = ref(1);
// 是否加载中
const loading = ref(false);

// 数据列表
const dataList = ref<MediaInfo[]>([]);
const currData = ref<MediaInfo[]>([]);

// 获取订阅列表数据
const fetchData = async ({ done }) => {
  try {
    if (!props.apipath) {
      return;
    }
    // 如果正在加载中，直接返回
    if (loading.value) {
      return;
    }
    // 设置加载中
    loading.value = true;
    currData.value = await api.get(props.apipath, {
      params: {
        page: page.value,
      },
    });
    // 合并数据
    dataList.value = [...dataList.value, ...currData.value];
    // 页码+1
    page.value++;
  } catch (error) {
    console.error(error);
  } finally {
    // 取消加载中
    loading.value = false;
    done("ok");
  }
};
</script>

<template>
  <VInfiniteScroll
    mode="intersect"
    side="end"
    :onLoad="fetchData"
    class="overflow-hidden"
  >
    <template #loading />
    <div class="grid gap-4 grid-media-card mx-3">
      <MediaCard v-for="data in dataList" :key="data.tmdb_id" :media="data"> </MediaCard>
    </div>
  </VInfiniteScroll>
</template>

<style type="scss">
.grid-media-card {
  grid-template-columns: repeat(auto-fill, minmax(9.375rem, 1fr));
}
</style>
