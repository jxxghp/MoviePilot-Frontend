<script lang="ts" setup>
import api from "@/api";
import { Site } from "@/api/types";
import SiteCard from "@/components/cards/SiteCard.vue";

// 数据列表
const dataList = ref<Site[]>([]);

// 获取订阅列表数据
const fetchData = async () => {
  try {
    dataList.value = await api.get("site");
  } catch (error) {
    console.error(error);
  }
};

// 加载时获取数据
onMounted(fetchData);
</script>

<template>
  <div class="grid gap-3 grid-site-card">
    <SiteCard v-for="data in dataList" :key="data.id" :site="data" />
  </div>
</template>

<style type="scss">
.grid-site-card {
  grid-template-columns: repeat(auto-fill, minmax(20rem, 1fr));
}
</style>
