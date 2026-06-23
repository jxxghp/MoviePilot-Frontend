<script lang="ts" setup>
import api from '@/api'
import type { MediaInfo } from '@/api/types'
import MediaCard from '@/components/cards/MediaCard.vue'
import ProgressiveCardGrid from '@/components/misc/ProgressiveCardGrid.vue'
import NoDataFound from '@/components/states/NoDataFound.vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

// 输入参数
const props = defineProps({
  apipath: String,
  params: Object as PropType<{ [key: string]: any }>,
})

// 判断是否有滚动条
function hasScroll() {
  return document.body.scrollHeight - (window.innerHeight || document.documentElement.clientHeight) > 2
}

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
    const key = dedupFields.map(field => String(item[field])).join('~')
    if (seenKeys.has(key)) {
      return false
    }
    seenKeys.add(key)
    return true
  })
}

function appendData(items: MediaInfo[]) {
  dataList.value = dataList.value.concat(items)
}

async function loadPageData() {
  const rawData: MediaInfo[] = await api.get(props.apipath!, {
    params: getParams(),
  })

  return {
    rawCount: rawData.length,
    uniqueData: deduplicate(rawData),
  }
}

// 获取列表数据
async function fetchData({ done }: { done: any }) {
  try {
    if (!props.apipath) return

    // 如果正在加载中，直接返回
    if (loading.value) {
      done('ok')
      return
    }

    // 加载到满屏或者加载出错
    if (!hasScroll()) {
      // 加载多次
      while (!hasScroll()) {
        // 设置加载中
        loading.value = true
        // 请求API
        const { rawCount, uniqueData } = await loadPageData()
        // 取消加载中
        loading.value = false
        // 标计为已请求完成
        isRefreshed.value = true
        if (rawCount === 0) {
          // 如果没有数据，跳出
          done('empty')
          return
        }
        // 合并数据
        appendData(uniqueData)
        // 页码+1
        page.value++
        // 返回加载成功
        done('ok')
        await nextTick()
      }
    } else {
      // 加载一次
      // 设置加载中
      loading.value = true
      // 请求API
      const { rawCount, uniqueData } = await loadPageData()
      // 标计为已请求完成
      isRefreshed.value = true
      if (rawCount === 0) {
        // 如果没有数据，跳出
        done('empty')
      } else {
        // 合并数据
        appendData(uniqueData)
        // 页码+1
        page.value++
        // 返回加载成功
        done('ok')
      }
    }
    // 取消加载中
    loading.value = false
  } catch (error) {
    console.error(error)
    // 返回加载失败
    done('error')
  }
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
      :get-item-key="item => item.tmdb_id || item.douban_id || item.bangumi_id || item.media_id || item.title"
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
