<script lang="ts" setup>
import PullRefresh from 'pull-refresh-vue3'
import api from '@/api'
import type { Subscribe } from '@/api/types'
import NoDataFound from '@/components/NoDataFound.vue'
import SubscribeCard from '@/components/cards/SubscribeCard.vue'

// 输入参数
const props = defineProps({
  type: String,
})

// 是否刷新过
const isRefreshed = ref(false)

// 数据列表
const dataList = ref<Subscribe[]>([])

// 获取订阅列表数据
async function fetchData() {
  try {
    dataList.value = await api.get('subscribe')
    isRefreshed.value = true
  }
  catch (error) {
    console.error(error)
  }
}

// 加载时获取数据
onBeforeMount(fetchData)

// 刷新状态
const loading = ref(false)

// 下拉刷新
function onRefresh() {
  loading.value = true
  fetchData()
  loading.value = false
}

// 过滤数据
const filteredDataList = computed(() => {
  return dataList.value.filter(data => data.type === props.type)
})
</script>

<template>
  <VProgressCircular
    v-if="!isRefreshed"
    size="48"
    class="centered"
    indeterminate
    color="primary"
  />
  <PullRefresh
    v-model="loading"
    @refresh="onRefresh"
  >
    <div
      v-if="filteredDataList.length > 0"
      class="grid gap-3 grid-subscribe-card"
    >
      <SubscribeCard
        v-for="data in filteredDataList"
        :key="data.id"
        :media="data"
      />
    </div>
    <NoDataFound
      v-if="filteredDataList.length === 0 && isRefreshed"
      error-code="404"
      error-title="没有订阅"
      error-description="请通过搜索添加电影、电视剧订阅。"
    />
  </PullRefresh>
</template>

<style lang="scss">
.grid-subscribe-card {
  grid-template-columns: repeat(auto-fill, minmax(20rem, 1fr));
  padding-block-end: 1rem;
}
</style>
