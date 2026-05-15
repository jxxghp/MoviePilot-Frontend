<script lang="ts" setup>
import api from '@/api'
import type { MediaInfo } from '@/api/types'
import MediaCard from '@/components/cards/MediaCard.vue'
import ProgressiveCardGrid from '@/components/misc/ProgressiveCardGrid.vue'
import NoDataFound from '@/components/NoDataFound.vue'
import { loadPaginatedInfiniteScroll, type InfiniteScrollDone } from '@/composables/usePaginatedInfiniteScroll'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

// 输入参数
const props = defineProps({
  apipath: String,
  params: Object as PropType<{ [key: string]: any }>,
})

// 当前页码
const page = ref(1)

// 是否加载中
const loading = ref(false)

// 是否加载完成
const isRefreshed = ref(false)

// 使用 shallowRef 避免长列表中的深层代理开销
const dataList = shallowRef<MediaInfo[]>([])

// 用于保存已处理过的 key
const seenKeys = new Set<string>()

// 拼装参数
function getParams() {
  let params = {
    page: page.value,
  }
  if (props.params) params = { ...params, ...props.params }

  return params
}

// MediaInfo 去重的字段
const dedupFields = [
  'source',
  'type',
  'season',
  'tmdb_id',
  'imdb_id',
  'tvdb_id',
  'douban_id',
  'bangumi_id',
  'mediaid_prefix',
  'media_id',
] as const

function deduplicate(items: MediaInfo[]): MediaInfo[] {
  return items.filter(item => {
    const key = getMediaDedupKey(item)
    if (seenKeys.has(key)) {
      return false
    }
    seenKeys.add(key)
    return true
  })
}

function appendData(items: MediaInfo[]) {
  dataList.value.push(...items)
  triggerRef(dataList)
}

function getMediaDedupKey(item: MediaInfo) {
  return dedupFields.map(field => String(item[field] ?? '')).join('~')
}

function getMediaItemKey(item: MediaInfo) {
  return [getMediaDedupKey(item), item.title ?? ''].join('~')
}

async function loadPageData() {
  const rawData: MediaInfo[] = await api.get(props.apipath!, {
    params: getParams(),
  })

  return {
    isLastPage: rawData.length === 0,
    items: deduplicate(rawData),
  }
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
  <VInfiniteScroll mode="intersect" side="end" :items="dataList" class="overflow-visible pt-3 px-2" @load="fetchData">
    <template #loading />
    <template #empty />
    <ProgressiveCardGrid
      v-if="dataList.length > 0"
      :items="dataList"
      :item-aspect-ratio="1.5"
      :get-item-key="getMediaItemKey"
      tabindex="0"
    >
      <template #default="{ item }">
        <MediaCard :media="item" />
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
