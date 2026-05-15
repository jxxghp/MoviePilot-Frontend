<script lang="ts" setup>
import { VPullToRefresh } from 'vuetify/labs/VPullToRefresh'
import api from '@/api'
import type { DownloadingInfo } from '@/api/types'
import NoDataFound from '@/components/NoDataFound.vue'
import DownloadingCard from '@/components/cards/DownloadingCard.vue'
import VirtualGrid from '@/components/virtual/VirtualGrid.vue'
import { useUserStore } from '@/stores'
import { useI18n } from 'vue-i18n'
import { useBackgroundOptimization } from '@/composables/useBackgroundOptimization'

const { t } = useI18n()
const { useDataRefresh } = useBackgroundOptimization()

const props = defineProps<{
  name: string
}>()

const userStore = useUserStore()

const dataList = ref<DownloadingInfo[]>([])
const isRefreshed = ref(false)

async function fetchData() {
  try {
    dataList.value = await api.get('download/', { params: { name: props.name } })
    isRefreshed.value = true
  } catch (error) {
    console.error(error)
  }
}

const loading = ref(false)

function onRefresh() {
  loading.value = true
  fetchData()
  loading.value = false
}

const filteredDataList = computed(() => {
  const superUser = userStore.superUser
  const userName = userStore.userName
  if (superUser) return dataList.value
  else return dataList.value.filter(data => data.userid === userName || data.username === userName)
})

// 使用优化的数据刷新定时器
const { loading: dataLoading } = useDataRefresh(
  'downloading-list',
  fetchData,
  3000,
  true,
)
</script>

<template>
  <LoadingBanner v-if="!isRefreshed" class="mt-12" />
  <VPullToRefresh v-model="loading" @load="onRefresh" :pull-down-threshold="64">
    <VirtualGrid
      v-if="filteredDataList.length > 0"
      :items="filteredDataList"
      :breakpoints="{ xs: 1, sm: 2, md: 2, lg: 3, xl: 3, xxl: 3 }"
      :row-estimate-size="230"
      :gap="12"
      :overscan="3"
      use-window-scroll
    >
      <template #item="{ item }">
        <DownloadingCard :info="item" :downloader-name="props.name" />
      </template>
    </VirtualGrid>
    <NoDataFound
      v-if="filteredDataList.length === 0 && isRefreshed"
      error-code="404"
      :error-title="t('downloading.noTask')"
      :error-description="t('downloading.noTaskDescription')"
    />
  </VPullToRefresh>
</template>
