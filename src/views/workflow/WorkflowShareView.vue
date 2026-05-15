<script lang="ts" setup>
import api from '@/api'
import type { WorkflowShare } from '@/api/types'
import NoDataFound from '@/components/NoDataFound.vue'
import WorkflowShareCard from '@/components/cards/WorkflowShareCard.vue'
import ProgressiveCardGrid from '@/components/misc/ProgressiveCardGrid.vue'
import { loadPaginatedInfiniteScroll, type InfiniteScrollDone } from '@/composables/usePaginatedInfiniteScroll'
import { useI18n } from 'vue-i18n'

// 国际化
const { t } = useI18n()

// 定义输入参数
const props = defineProps({
  // 过滤关键字
  keyword: String,
})

// 定义事件
const emit = defineEmits(['update'])

// API
const apipath = 'workflow/shares'

// 当前页码
const page = ref(1)

// 搜索关键字
const keyword = ref(props.keyword)
const currentKey = ref(0)

// 是否加载中
const loading = ref(false)

// 是否加载完成
const isRefreshed = ref(false)

// 使用 shallowRef 避免长列表中的深层代理开销
const dataList = shallowRef<WorkflowShare[]>([])

// 事件类型列表
const eventTypes = ref<Array<{ title: string; value: string }>>([])

// 加载事件类型列表
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
    page.value = 1
    dataList.value = []
    isRefreshed.value = false
    currentKey.value++
  },
)

// 拼装参数
function getParams() {
  let params = {
    page: page.value,
    count: 30,
    name: keyword.value,
  }
  return params
}

function appendData(items: WorkflowShare[]) {
  dataList.value.push(...items)
  triggerRef(dataList)
}

async function loadPageData() {
  return api.get(apipath, {
    params: getParams(),
  }) as Promise<WorkflowShare[]>
}

// 获取列表数据
async function fetchData({ done }: { done: InfiniteScrollDone }) {
  await loadPaginatedInfiniteScroll({
    advancePage: () => {
      page.value++
    },
    appendItems: appendData,
    done,
    loadPage: loadPageData,
    loading,
    markLoaded: () => {
      isRefreshed.value = true
    },
  })
}

// 将数据从列表中移除
function removeData(id: string) {
  dataList.value = dataList.value.filter(item => item.id !== id)
}

onActivated(() => {
  loadEventTypes()
  fetchData({ done: () => {} })
})
</script>

<template>
  <VPageContentTitle v-if="keyword" :title="`${t('common.search')}：${keyword}`" />
  <LoadingBanner v-if="!isRefreshed" class="mt-12" />
  <VInfiniteScroll mode="intersect" side="end" :items="dataList" class="overflow-visible px-2" @load="fetchData" :key="currentKey">
    <template #loading />
    <template #empty />
    <ProgressiveCardGrid
      v-if="dataList.length > 0"
      :items="dataList"
      :get-item-key="item => item.id"
      :min-item-width="288"
      :estimated-item-height="220"
      tabindex="0"
    >
      <template #default="{ item }">
        <WorkflowShareCard
          :workflow="item"
          :event-types="eventTypes"
          @delete="removeData(item.id || '')"
          @update="emit('update')"
        />
      </template>
    </ProgressiveCardGrid>
    <NoDataFound
      v-if="dataList.length === 0 && isRefreshed"
      error-code="404"
      :error-title="t('common.noData')"
      :error-description="keyword ? t('common.noContent') : t('workflow.noShareData')"
    />
  </VInfiniteScroll>
</template>
