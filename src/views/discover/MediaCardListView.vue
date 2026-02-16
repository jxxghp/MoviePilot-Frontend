<script lang="ts" setup>
import api from '@/api'
import type { MediaInfo } from '@/api/types'
import MediaCard from '@/components/cards/MediaCard.vue'
import NoDataFound from '@/components/NoDataFound.vue'
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

// 数据列表
const dataList = ref<MediaInfo[]>([])
const currData = ref<MediaInfo[]>([])

// 用于保存已处理过的 key
const seenKeys = ref<Set<string>>(new Set<string>())

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
  "source",
  "type",
  "season",
  "tmdb_id",
  "imdb_id",
  "tvdb_id",
  "douban_id",
  "bangumi_id",
  "mediaid_prefix",
  "media_id",
] as const;

function deduplicate(items: MediaInfo[]): MediaInfo[] {
  return items.filter(item => {
    const key = dedupFields.map(field => String(item[field])).join('~');
    if (seenKeys.value.has(key)) {
      return false;
    }
    seenKeys.value.add(key);
    return true;
  });
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
        currData.value = await api.get(props.apipath, {
          params: getParams(),
        })
        // 取消加载中
        loading.value = false
        // 标计为已请求完成
        isRefreshed.value = true
        if (currData.value.length === 0) {
          // 如果没有数据，跳出
          done('empty')
          return
        }
        // 去重
        currData.value = deduplicate(currData.value)
        // 合并数据
        dataList.value.push(...currData.value)
        // 页码+1
        page.value++
        // 返回加载成功
        done('ok')
      }
    } else {
      // 加载一次
      // 设置加载中
      loading.value = true
      // 请求API
      currData.value = await api.get(props.apipath, {
        params: getParams(),
      })
      // 标计为已请求完成
      isRefreshed.value = true
      if (currData.value.length === 0) {
        // 如果没有数据，跳出
        done('empty')
      } else {
        // 去重
        currData.value = deduplicate(currData.value)
        // 合并数据
        dataList.value.push(...currData.value)
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
    <div v-if="dataList.length > 0" class="grid gap-4 grid-media-card" tabindex="0">
      <MediaCard v-for="data in dataList" :key="data.tmdb_id || data.douban_id" :media="data" />
    </div>
    <NoDataFound
      v-if="dataList.length === 0 && isRefreshed"
      error-code="404"
      :error-title="t('common.noData')"
      :error-description="t('error.networkError')"
    />
  </VInfiniteScroll>
</template>
