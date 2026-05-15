<script lang="ts" setup>
import api from '@/api'
import type { MediaInfo } from '@/api/types'
import MediaCard from '@/components/cards/MediaCard.vue'
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
})

// 当前页码
const page = ref(1)

// 是否加载中（同时作为触底加载的锁）
const loading = ref(false)

// 是否加载完成
const isRefreshed = ref(false)

// 是否还有更多
const hasMore = ref(true)

// 使用 shallowRef 避免长列表中的深层代理开销
const dataList = shallowRef<MediaInfo[]>([])

// 用于保存已处理过的 key（去重）
const seenKeys = new Set<string>()

// 拼装参数
function getParams() {
  let params = { page: page.value }
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
    const key = dedupFields.map(field => String(item[field])).join('~')
    if (seenKeys.has(key)) return false
    seenKeys.add(key)
    return true
  })
}

// 获取列表数据（VirtualGrid @load-more 触发）
async function fetchData() {
  if (!props.apipath) return
  if (loading.value || !hasMore.value) return
  loading.value = true
  try {
    const rawData: MediaInfo[] = await api.get(props.apipath, {
      params: getParams(),
    })
    isRefreshed.value = true
    if (!rawData || rawData.length === 0) {
      hasMore.value = false
      return
    }
    const uniqueData = deduplicate(rawData)
    dataList.value = dataList.value.concat(uniqueData)
    page.value++
  } catch (error) {
    console.error(error)
  } finally {
    loading.value = false
  }
}

// 初始加载
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
    :row-estimate-size="280"
    :gap="16"
    :overscan="3"
    use-window-scroll
    class="pt-3 px-3"
    @load-more="fetchData"
  >
    <template #item="{ item }">
      <MediaCard :media="item" />
    </template>
  </VirtualGrid>
  <NoDataFound
    v-if="dataList.length === 0 && isRefreshed"
    error-code="404"
    :error-title="t('common.noData')"
    :error-description="t('error.networkError')"
  />
</template>
