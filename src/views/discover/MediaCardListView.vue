<script lang="ts" setup>
import api from '@/api'
import type { MediaInfo } from '@/api/types'
import MediaCard from '@/components/cards/MediaCard.vue'
import ProgressiveCardGrid from '@/components/misc/ProgressiveCardGrid.vue'
import NoDataFound from '@/components/states/NoDataFound.vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const props = defineProps({
  apipath: {
    type: String,
    required: true,
  },
  params: Object as PropType<Record<string, unknown>>,
})

// 判断是否有滚动条
function hasScroll() {
  return document.body.scrollHeight - (window.innerHeight || document.documentElement.clientHeight) > 2
}

// 当前页码
const page = ref(1)

// 是否加载中
const loading = ref(false)

// 首次成功响应前，请求失败只展示错误和重试入口。
const loadFailed = ref(false)

// 是否加载完成
const isRefreshed = ref(false)

// 使用 shallowRef 避免长列表中的深层代理开销
const dataList = shallowRef<MediaInfo[]>([])

// 用于保存已处理过的 key
const seenKeys = new Set<string>()

// 保存本次列表生命周期内已经处理过的原始页签名。
const seenPageSignatures = new Set<string>()

// 拼装参数
function getParams() {
  return {
    ...props.params,
    page: page.value,
  }
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
  'anilist_id',
  'mediaid_prefix',
  'media_id',
] as const

// 去重、分页终止和渲染必须共用同一媒体身份，避免状态与 DOM key 分叉。
function getMediaIdentity(item: MediaInfo) {
  return JSON.stringify(dedupFields.map(field => item[field] ?? null))
}

function deduplicate(items: MediaInfo[]): MediaInfo[] {
  return items.filter(item => {
    const key = getMediaIdentity(item)
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
  const rawData: MediaInfo[] = await api.get(props.apipath, {
    params: getParams(),
  })
  const pageSignature = [...new Set(rawData.map(getMediaIdentity))].sort().join('\n')
  const isTerminal = rawData.length === 0 || seenPageSignatures.has(pageSignature)

  if (!isTerminal) seenPageSignatures.add(pageSignature)

  return {
    isTerminal,
    uniqueData: isTerminal ? [] : deduplicate(rawData),
  }
}

// 获取列表数据
async function fetchData({ done }: { done: (status: 'empty' | 'error' | 'loading' | 'ok') => void }) {
  if (loading.value) {
    done('ok')
    return
  }

  loading.value = true
  loadFailed.value = false
  try {
    // 未形成滚动区域时连续填页；已有滚动区域时每次只消费一页。
    if (!hasScroll()) {
      while (!hasScroll()) {
        const { isTerminal, uniqueData } = await loadPageData()
        isRefreshed.value = true
        if (isTerminal) {
          done('empty')
          return
        }
        appendData(uniqueData)
        page.value++
        await nextTick()
      }
    } else {
      const { isTerminal, uniqueData } = await loadPageData()
      isRefreshed.value = true
      if (isTerminal) {
        done('empty')
        return
      } else {
        appendData(uniqueData)
        page.value++
      }
    }
    done('ok')
  } catch (error) {
    console.error(error)
    loadFailed.value = true
    done('error')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <LoadingBanner v-if="!isRefreshed && !loadFailed" class="mt-12" />
  <VInfiniteScroll
    mode="intersect"
    side="end"
    :items="dataList"
    :margin="dataList.length > 0 ? 600 : 0"
    class="overflow-visible pt-3 px-2"
    @load="fetchData"
  >
    <template #loading />
    <template #empty />
    <template #error="{ props: retryProps }">
      <div class="d-flex flex-column align-center ga-2 py-4">
        <span class="text-body-2 text-medium-emphasis">{{ t('error.networkError') }}</span>
        <VBtn v-bind="retryProps" prepend-icon="mdi-refresh" size="small" variant="tonal">
          {{ t('common.retry') }}
        </VBtn>
      </div>
    </template>
    <ProgressiveCardGrid
      v-if="dataList.length > 0"
      :items="dataList"
      :item-aspect-ratio="1.5"
      :get-item-key="getMediaIdentity"
      tabindex="0"
    >
      <template #default="{ item }">
        <MediaCard :media="item" />
      </template>
    </ProgressiveCardGrid>
    <NoDataFound v-if="dataList.length === 0 && isRefreshed" error-code="404" :error-title="t('common.noData')" />
  </VInfiniteScroll>
</template>
