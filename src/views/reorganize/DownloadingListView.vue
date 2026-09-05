<script lang="ts" setup>
import api from '@/api'
import type { DownloadingInfo } from '@/api/types'
import NoDataFound from '@/components/states/NoDataFound.vue'
import DownloadingCard from '@/components/cards/DownloadingCard.vue'
import ProgressiveCardGrid from '@/components/misc/ProgressiveCardGrid.vue'
import { useUserStore } from '@/stores'
import { useI18n } from 'vue-i18n'
import { useBackground } from '@/composables/useBackground'
import { useKeepAliveRefresh } from '@/composables/useKeepAliveRefresh'

// 国际化
const { t } = useI18n()
const { useConditionalDataRefresh } = useBackground()

// 定义输入参数
const props = defineProps<{
  name: string
  type?: string
  active?: boolean
}>()

// 用户 Store
const userStore = useUserStore()

// 数据列表
const dataList = ref<DownloadingInfo[]>([])

// 是否刷新过
const isRefreshed = ref(false)

// 获取当前下载器的任务快照
async function fetchData() {
  try {
    dataList.value = await api.get('download/', { params: { name: props.name } })
    isRefreshed.value = true
  } catch (error) {
    console.error(error)
  }
}

// 管理员显示全部下载任务，普通用户仅显示本人任务
const filteredDataList = computed(() => {
  // 从 Store 中获取用户信息
  const superUser = userStore.superUser
  const userName = userStore.userName
  if (superUser) return dataList.value
  else return dataList.value.filter(data => data.userid === userName || data.username === userName)
})

// 每个下载器独立持有刷新身份，非活动标签不占用轮询资源。
useConditionalDataRefresh(
  `downloading-list-${props.name}`,
  fetchData,
  computed(() => props.active !== false),
  3000, // 3秒间隔
  false, // 初始加载交给 keep-alive 页面自身，避免同时发起两次请求
)

onMounted(fetchData)

useKeepAliveRefresh(fetchData, {
  active: computed(() => props.active !== false),
})
</script>

<template>
  <LoadingBanner v-if="!isRefreshed" class="mt-12" />
  <ProgressiveCardGrid
    v-if="filteredDataList.length > 0"
    :items="filteredDataList"
    :get-item-key="item => item.hash || item.name"
    :min-item-width="320"
    :estimated-item-height="230"
  >
    <template #default="{ item }">
      <DownloadingCard :info="item" :downloader-name="props.name" :downloader-type="props.type" @updated="fetchData" />
    </template>
  </ProgressiveCardGrid>
  <NoDataFound
    v-if="filteredDataList.length === 0 && isRefreshed"
    error-code="404"
    :error-title="t('downloading.noTask')"
    :error-description="t('downloading.noTaskDescription')"
  />
</template>
