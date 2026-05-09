<script lang="ts" setup>
import { VPullToRefresh } from 'vuetify/labs/VPullToRefresh'
import api from '@/api'
import type { DownloadingInfo } from '@/api/types'
import NoDataFound from '@/components/NoDataFound.vue'
import DownloadingCard from '@/components/cards/DownloadingCard.vue'
import VirtualCardGrid from '@/components/misc/VirtualCardGrid.vue'
import { useUserStore } from '@/stores'
import { useI18n } from 'vue-i18n'
import { useBackgroundOptimization } from '@/composables/useBackgroundOptimization'

// 国际化
const { t } = useI18n()
const { useDataRefresh } = useBackgroundOptimization()

// 定义输入参数
const props = defineProps<{
  name: string
}>()

// 用户 Store
const userStore = useUserStore()

// 数据列表
const dataList = ref<DownloadingInfo[]>([])

// 是否刷新过
const isRefreshed = ref(false)

// 获取订阅列表数据
async function fetchData() {
  try {
    dataList.value = await api.get('download/', { params: { name: props.name } })
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
  // 从 Store 中获取用户信息
  const superUser = userStore.superUser
  const userName = userStore.userName
  if (superUser) return dataList.value
  else return dataList.value.filter(data => data.userid === userName || data.username === userName)
})

// 使用优化的数据刷新定时器
const { loading: dataLoading } = useDataRefresh(
  'downloading-list',
  fetchData,
  3000, // 3秒间隔
  true // 立即执行
)
</script>

<template>
  <LoadingBanner v-if="!isRefreshed" class="mt-12" />
  <VPullToRefresh v-model="loading" @load="onRefresh" :pull-down-threshold="64">
    <VirtualCardGrid
      v-if="filteredDataList.length > 0"
      :items="filteredDataList"
      :get-item-key="item => item.hash || item.name"
      :min-item-width="320"
      :estimated-item-height="230"
    >
      <template #default="{ item }">
        <DownloadingCard :info="item" :downloader-name="props.name" />
      </template>
    </VirtualCardGrid>
    <NoDataFound
      v-if="filteredDataList.length === 0 && isRefreshed"
      error-code="404"
      :error-title="t('downloading.noTask')"
      :error-description="t('downloading.noTaskDescription')"
    />
  </VPullToRefresh>
</template>
