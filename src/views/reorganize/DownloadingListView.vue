<script lang="ts" setup>
import PullRefresh from 'pull-refresh-vue3'
import api from '@/api'
import type { DownloadingInfo } from '@/api/types'
import NoDataFound from '@/components/NoDataFound.vue'
import DownloadingCard from '@/components/cards/DownloadingCard.vue'
import store from '@/store'

// 从Vuex Store中获取用户信息
const superUser = store.state.auth.superUser
const userName = store.state.auth.userName

// 定时器
let refreshTimer: NodeJS.Timer | null = null

// 数据列表
const dataList = ref<DownloadingInfo[]>([])

// 是否刷新过
const isRefreshed = ref(false)

// 获取订阅列表数据
async function fetchData() {
  try {
    dataList.value = await api.get('download/')
    isRefreshed.value = true
  }
  catch (error) {
    console.error(error)
  }
}

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
  if (superUser)
    return dataList.value
  else
    return dataList.value.filter(data => data.userid === userName)
})

// 加载时获取数据
onBeforeMount(() => {
  fetchData()

  // 启动定时器
  refreshTimer = setInterval(() => {
    fetchData()
  }, 3000)
})

// 组件卸载时停止定时器
onUnmounted(() => {
  if (refreshTimer) {
    clearInterval(refreshTimer)
    refreshTimer = null
  }
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
      class="grid gap-3 grid-downloading-card"
    >
      <DownloadingCard
        v-for="data in filteredDataList"
        :key="data.hash"
        :info="data"
      />
    </div>
    <NoDataFound
      v-if="filteredDataList.length === 0 && isRefreshed"
      error-code="404"
      error-title="没有任务"
      error-description="正在下载的任务将会显示在这里。"
    />
  </PullRefresh>
</template>

<style lang="scss">
.grid-downloading-card {
  grid-template-columns: repeat(auto-fill, minmax(20rem, 1fr));
  padding-block-end: 1rem;
}
</style>
