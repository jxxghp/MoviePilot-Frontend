<script lang="ts" setup>
import api from '@/api'
import type { WorkflowShare } from '@/api/types'
import NoDataFound from '@/components/NoDataFound.vue'
import WorkflowShareCard from '@/components/cards/WorkflowShareCard.vue'
import VirtualGrid from '@/components/virtual/VirtualGrid.vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const props = defineProps({
  keyword: String,
})

const emit = defineEmits(['update'])

const apipath = 'workflow/shares'

const page = ref(1)
const keyword = ref(props.keyword)
const loading = ref(false)
const isRefreshed = ref(false)
const hasMore = ref(true)
const currentKey = ref(0)

const dataList = ref<WorkflowShare[]>([])
const eventTypes = ref<Array<{ title: string; value: string }>>([])

async function loadEventTypes() {
  try {
    eventTypes.value = await api.get('workflow/event_types')
  } catch (error) {
    console.error('Failed to load event types:', error)
  }
}

watch(
  () => props.keyword,
  newKeyword => {
    keyword.value = newKeyword || ''
    dataList.value = []
    page.value = 1
    hasMore.value = true
    isRefreshed.value = false
    currentKey.value++
    void fetchData()
  },
)

function getParams() {
  return {
    page: page.value,
    count: 30,
    name: keyword.value,
  }
}

async function fetchData() {
  if (loading.value || !hasMore.value) return
  loading.value = true
  try {
    const data: WorkflowShare[] = await api.get(apipath, { params: getParams() })
    isRefreshed.value = true
    if (!data || data.length === 0) {
      hasMore.value = false
      return
    }
    dataList.value = [...dataList.value, ...data]
    page.value++
    if (data.length < 30) hasMore.value = false
  } catch (error) {
    console.error(error)
  } finally {
    loading.value = false
  }
}

function removeData(id: string) {
  dataList.value = dataList.value.filter(item => item.id !== id)
}

// 路由激活：刷新事件类型 + 数据（保留原行为）
onActivated(() => {
  loadEventTypes()
  // 仅在尚未加载过时拉首屏，避免每次切回都全量重拉造成白屏
  if (!isRefreshed.value || dataList.value.length === 0) {
    void fetchData()
  }
})

onMounted(() => {
  loadEventTypes()
  void fetchData()
})
</script>

<template>
  <VPageContentTitle v-if="keyword" :title="`${t('common.search')}：${keyword}`" />
  <LoadingBanner v-if="!isRefreshed" class="mt-12" />
  <VirtualGrid
    v-if="isRefreshed && dataList.length > 0"
    :key="currentKey"
    :items="dataList"
    :breakpoints="{ xs: 1, sm: 2, md: 2, lg: 3, xl: 4, xxl: 4 }"
    :row-estimate-size="220"
    :gap="12"
    :overscan="3"
    key-field="id"
    use-window-scroll
    class="pt-2"
    @load-more="fetchData"
  >
    <template #item="{ item }">
      <WorkflowShareCard
        :workflow="item"
        :event-types="eventTypes"
        @delete="removeData(item.id || '')"
        @update="emit('update')"
      />
    </template>
  </VirtualGrid>
  <NoDataFound
    v-if="dataList.length === 0 && isRefreshed"
    error-code="404"
    :error-title="t('common.noData')"
    :error-description="keyword ? t('common.noContent') : t('workflow.noShareData')"
  />
</template>
