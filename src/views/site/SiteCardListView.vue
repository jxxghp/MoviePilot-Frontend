<script lang="ts" setup>
import api from '@/api';
import { Site } from '@/api/types';
import SiteCard from '@/components/cards/SiteCard.vue';

// 数据列表
const dataList = ref<Site[]>([])

// 是否刷新过
const isRefreshed = ref(false)

// 获取订阅列表数据
const fetchData = async () => {
  try {
    dataList.value = await api.get('site')
    isRefreshed.value = true
  } catch (error) {
    console.error(error)
  }
}

// 加载时获取数据
onBeforeMount(fetchData)
</script>

<template>
  <div
    class="grid gap-3 grid-site-card"
    v-if="dataList.length > 0"
  >
    <SiteCard
      v-for="data in dataList"
      :key="data.id"
      :site="data"
    />
  </div>
  <NoDataFound
    v-if="dataList.length === 0 && isRefreshed"
    error-code="404"
    error-title="没有站点"
    error-description="已添加并支持的站点将会在这里显示。"
  >
  </NoDataFound>
</template>

<style type="scss">
.grid-site-card {
  grid-template-columns: repeat(auto-fill, minmax(20rem, 1fr));
  padding-block-end: 1rem;
}
</style>
