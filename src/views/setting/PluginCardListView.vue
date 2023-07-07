<script lang="ts" setup>
import api from "@/api";
import { Plugin } from "@/api/types";
import PluginCard from "@/components/cards/PluginCard.vue";
import NoDataFound from "@/components/NoDataFound.vue";

// 数据列表
const dataList = ref<Plugin[]>([]);

// 是否刷新过
const isRefreshed = ref(false);

// 获取订阅列表数据
const fetchData = async () => {
  try {
    dataList.value = await api.get("plugin");
    isRefreshed.value = true;
  } catch (error) {
    console.error(error);
  }
};

// 加载时获取数据
onBeforeMount(fetchData);
</script>

<template>
  <VProgressCircular
    class="centered"
    v-if="!isRefreshed"
    indeterminate
    color="primary"
  ></VProgressCircular>
  <div class="grid gap-3 grid-plugin-card" v-if="dataList.length > 0">
    <PluginCard v-for="data in dataList" :key="data.id" :plugin="data" />
  </div>
  <NoDataFound
    v-if="dataList.length === 0 && isRefreshed"
    error-code="404"
    error-title="没有站点"
    error-description="已加载的插件功能将会在这里展示。"
  >
  </NoDataFound>
</template>

<style type="scss">
.grid-plugin-card {
  grid-template-columns: repeat(auto-fill, minmax(20rem, 1fr));
  padding-block-end: 1rem;
}
</style>
