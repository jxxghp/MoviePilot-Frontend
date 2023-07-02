<script lang="ts" setup>
import api from "@/api";
import type { DownloadingInfo } from "@/api/types";
import DownloadingCard from "@/components/cards/DownloadingCard.vue";
import PullRefresh from "pull-refresh-vue3";

// 数据列表
const dataList = ref<DownloadingInfo[]>([]);

// 获取订阅列表数据
const fetchData = async () => {
  try {
    dataList.value = await api.get("download");
  } catch (error) {
    console.error(error);
  }
};

// 加载时获取数据
onMounted(fetchData);

// 刷新状态
const loading = ref(false);

// 下拉刷新
const onRefresh = () => {
  loading.value = true;
  fetchData();
  loading.value = false;
};
</script>

<template>
  <PullRefresh v-model="loading" @refresh="onRefresh">
    <div class="grid gap-3 grid-downloading-card">
      <DownloadingCard v-for="data in dataList" :key="data.hash" :info="data" />
    </div>
  </PullRefresh>
</template>

<style type="scss">
.grid-downloading-card {
  grid-template-columns: repeat(auto-fill, minmax(20rem, 1fr));
  padding-block-end: 1rem;
}
</style>
