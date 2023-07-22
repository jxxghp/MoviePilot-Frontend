<script lang="ts" setup>
import api from '@/api'
import type { Site } from '@/api/types'
import SiteCard from '@/components/cards/SiteCard.vue'
import NoDataFound from '@/components/NoDataFound.vue'

// 数据列表
const dataList = ref<Site[]>([])

// 是否刷新过
const isRefreshed = ref(false)

// 获取站点列表数据
async function fetchData() {
  try {
    dataList.value = await api.get('site')
    isRefreshed.value = true
  }
  catch (error) {
    console.error(error)
  }
}

// 加载时获取数据
onBeforeMount(fetchData)
</script>

<template>
  <VProgressCircular
    v-if="!isRefreshed"
    size="48"
    class="centered"
    indeterminate
    color="primary"
  />
  <div
    v-if="dataList.length > 0"
    class="grid gap-3 grid-site-card"
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
  />
</template>

<style lang="scss">
.grid-site-card {
  grid-template-columns: repeat(auto-fill, minmax(20rem, 1fr));
  padding-block-end: 1rem;
}
</style>
