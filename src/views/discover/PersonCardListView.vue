<script lang="ts" setup>
import api from '@/api'
import type { Person } from '@/api/types'
import PersonCard from '@/components/cards/PersonCard.vue'
import VirtualGrid from '@/components/virtual/VirtualGrid.vue'
import NoDataFound from '@/components/NoDataFound.vue'
import { useBreakpointCols } from '@/composables/virtual/useBreakpointCols'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

// 列数：按视口断点（路由级全宽页）
const cols = useBreakpointCols({ xs: 3, sm: 4, md: 6, lg: 8, xl: 10, xxl: 12 })

// 输入参数
const props = defineProps({
  apipath: String,
  params: Object as PropType<{ [key: string]: any }>,
  type: String,
})

const page = ref(1)
const loading = ref(false)
const isRefreshed = ref(false)
const hasMore = ref(true)
const dataList = shallowRef<Person[]>([])

function getParams() {
  let params = { page: page.value }
  if (props.params) params = { ...params, ...props.params }
  return params
}

async function fetchData() {
  if (!props.apipath) return
  if (loading.value || !hasMore.value) return
  loading.value = true
  try {
    const currentData = (await api.get(props.apipath, {
      params: getParams(),
    })) as Person[]
    isRefreshed.value = true
    if (!currentData || currentData.length === 0) {
      hasMore.value = false
      return
    }
    dataList.value = dataList.value.concat(currentData)
    page.value++
  } catch (error) {
    console.error(error)
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  void fetchData()
})
</script>

<template>
  <LoadingBanner v-if="!isRefreshed" class="mt-12" />
  <VirtualGrid
    v-if="isRefreshed && dataList.length > 0"
    :items="dataList"
    :columns="cols"
    :row-estimate-size="260"
    :gap="16"
    :overscan="3"
    key-field="id"
    use-window-scroll
    class="pt-3 px-3"
    @load-more="fetchData"
  >
    <template #item="{ item }">
      <PersonCard :person="item" />
    </template>
  </VirtualGrid>
  <NoDataFound
    v-if="dataList.length === 0 && isRefreshed"
    error-code="404"
    :error-title="t('common.noData')"
    :error-description="t('error.networkError')"
  />
</template>
