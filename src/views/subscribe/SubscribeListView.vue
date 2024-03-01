<script lang="ts" setup>
import PullRefresh from 'pull-refresh-vue3'
import api from '@/api'
import type { Subscribe } from '@/api/types'
import NoDataFound from '@/components/NoDataFound.vue'
import SubscribeCard from '@/components/cards/SubscribeCard.vue'
import store from '@/store'

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
    dataList.value = await api.get('subscribe/')
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

// 过滤数据，管理员用户显示全部，非管理员只显示自己的订阅
const filteredDataList = computed(() => {
// 从Vuex Store中获取用户信息
  const superUser = store.state.auth.superUser
  const userName = store.state.auth.userName
  if (superUser)
    return dataList.value.filter(data => data.type === props.type)
  else
    return dataList.value.filter(data => data.type === props.type && data.username === userName)
})
</script>

<template>
  <div
    v-if="!isRefreshed"
    class="mt-12 w-full text-center text-gray-500 text-sm flex flex-col items-center"
  >
    <VProgressCircular
      v-if="!isRefreshed"
      size="48"
      indeterminate
      color="primary"
    />
  </div>
  <PullRefresh
    v-model="loading"
    @refresh="onRefresh"
  >
    <div
      v-if="filteredDataList.length > 0"
      class="grid gap-3 grid-subscribe-card p-1"
    >
      <SubscribeCard
        v-for="data in filteredDataList"
        :key="data.id"
        :media="data"
        @remove="fetchData"
        @save="fetchData"
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
