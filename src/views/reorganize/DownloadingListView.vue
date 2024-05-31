<script lang="ts" setup>
import { VPullToRefresh } from 'vuetify/labs/VPullToRefresh'
import api from '@/api'
import type { DownloadingInfo } from '@/api/types'
import NoDataFound from '@/components/NoDataFound.vue'
import DownloadingCard from '@/components/cards/DownloadingCard.vue'
import store from '@/store'

// 定时器
let refreshTimer: NodeJS.Timeout | null = null

// 数据列表
const dataList = ref<DownloadingInfo[]>([])

// 是否刷新过
const isRefreshed = ref(false)

// 获取订阅列表数据
async function fetchData() {
  try {
    dataList.value = await api.get('download/')
    isRefreshed.value = true
  } catch (error) {
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
  // 从Vuex Store中获取用户信息
  const superUser = store.state.auth.superUser
  const userName = store.state.auth.userName
  if (superUser) return dataList.value
  else return dataList.value.filter(data => data.userid === userName || data.username === userName)
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
  <LoadingBanner v-if="!isRefreshed" class="mt-12" />
  <VPullToRefresh v-model="loading" @load="onRefresh" :pull-down-threshold="64">
    <div v-if="filteredDataList.length > 0" class="grid gap-3 grid-downloading-card">
      <DownloadingCard v-for="data in filteredDataList" :key="data.hash" :info="data" />
    </div>
    <NoDataFound
      v-if="filteredDataList.length === 0 && isRefreshed"
      error-code="404"
      error-title="没有任务"
      error-description="正在下载的任务将会显示在这里。"
    />
  </VPullToRefresh>
</template>
