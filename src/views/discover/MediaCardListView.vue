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

// 获取订阅列表数据
const fetchData = async () => {
  try {
    if (!props.apipath){
      return
    }
    // 如果正在加载中，直接返回
    if (loading.value) {
      return;
    }
    // 设置加载中
    loading.value = true;
    const data = await api.get(props.apipath, {
      params: {
        page: page.value,
      },
    });
    // 合并数据
    dataList.value = [...dataList.value, ...data];
    // 页码+1
    page.value++;
    // 取消加载中
    loading.value = false;
  } catch (error) {
    console.error(error);
  }
};

</script>

<template>
  <VInfiniteScroll
    mode="intersect"
    :onLoad="fetchData"
  >
    <div class="grid gap-4 grid-media-card mx-3">
      <MediaCard v-for="data in dataList" 
        :key="data.tmdb_id" 
        :media="data">
      </MediaCard>
    </div>
  </VInfiniteScroll>
</template>
