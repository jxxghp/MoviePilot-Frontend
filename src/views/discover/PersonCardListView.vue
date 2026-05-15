<script lang="ts" setup>
import api from '@/api'
import type { Person } from '@/api/types'
import PersonCard from '@/components/cards/PersonCard.vue'
import ProgressiveCardGrid from '@/components/misc/ProgressiveCardGrid.vue'
import NoDataFound from '@/components/NoDataFound.vue'
import { loadPaginatedInfiniteScroll, type InfiniteScrollDone } from '@/composables/usePaginatedInfiniteScroll'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

// 输入参数
const props = defineProps({
  apipath: String,
  params: Object as PropType<{ [key: string]: any }>,
  type: String,
})

// 当前页码
const page = ref(1)

// 是否加载中
const loading = ref(false)

// 是否加载完成
const isRefreshed = ref(false)

// 使用 shallowRef 避免长列表中的深层代理开销
const dataList = shallowRef<Person[]>([])

function appendData(items: Person[]) {
  dataList.value.push(...items)
  triggerRef(dataList)
}

async function loadPageData() {
  return api.get(props.apipath!, {
    params: getParams(),
  }) as Promise<Person[]>
}

// 拼装参数
function getParams() {
  let params = {
    page: page.value,
  }
  if (props.params) params = { ...params, ...props.params }

  return params
}

// 获取列表数据
async function fetchData({ done }: { done: InfiniteScrollDone }) {
  if (!props.apipath) {
    done('empty')
    return
  }

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
</script>

<template>
  <LoadingBanner v-if="!isRefreshed" class="mt-12" />
  <VInfiniteScroll mode="intersect" side="end" :items="dataList" class="overflow-visible px-3" @load="fetchData">
    <template #loading />
    <template #empty />
    <ProgressiveCardGrid
      v-if="dataList.length > 0"
      :items="dataList"
      :item-aspect-ratio="1.5"
      :get-item-key="item => item.id"
      tabindex="0"
    >
      <template #default="{ item }">
        <PersonCard :person="item" />
      </template>
    </ProgressiveCardGrid>
    <NoDataFound
      v-if="dataList.length === 0 && isRefreshed"
      error-code="404"
      :error-title="t('common.noData')"
      :error-description="t('error.networkError')"
    />
  </VInfiniteScroll>
</template>
