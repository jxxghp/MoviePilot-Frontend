<script lang="ts" setup>
import api from '@/api'
import { nativeReadonlyCache } from '@/native/cache'
import type { MediaInfo } from '@/api/types'
import MediaCard from '@/components/cards/MediaCard.vue'
import ProgressiveCardGrid from '@/components/misc/ProgressiveCardGrid.vue'
import NoDataFound from '@/components/states/NoDataFound.vue'
import GlassMediaBackdrop from '@/components/theme/GlassMediaBackdrop.vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const props = defineProps({
  /** 发现源的分页接口路径。 */
  apipath: {
    type: String,
    required: true,
  },
  /** 发现筛选参数；当前页码由列表生命周期补充。 */
  params: Object as PropType<Record<string, unknown>>,
})

/** 未填满视口时继续取页，不能因缓存返回更快而改变原分页终止条件。 */
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

/** 每次读取都保留当前筛选，只由列表维护页码。 */
function getParams(): Record<string, unknown> {
  return {
    ...props.params,
    page: page.value,
  }
}

/** 去重、分页终止和渲染共用同一媒体身份，避免状态与 DOM key 分叉。 */
function getMediaIdentity(item: MediaInfo) {
  if (item.media_source && item.media_id !== undefined && item.media_id !== null && String(item.media_id).trim()) {
    return JSON.stringify(['media', item.media_source, String(item.media_id), item.type ?? null, item.season ?? null])
  }

  // 数据源偶发返回无 ID 条目时仍按可见元数据区分，不能把整页折叠成一条。
  return JSON.stringify([
    'metadata',
    item.type ?? null,
    item.season ?? null,
    item.title ?? null,
    item.original_title ?? null,
    item.year ?? null,
    item.release_date ?? null,
  ])
}

/** 只过滤本次列表生命周期已呈现的条目，不改写共享榜单数据。 */
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

/** 以新数组追加当前页，保持 shallowRef 与渐进网格的更新约定。 */
function appendData(items: MediaInfo[]) {
  dataList.value = dataList.value.concat(items)
}

/** 页面、筛选和去重逻辑保持在列表层；只读快照只复用当前这次分页 GET。 */
async function loadPageData() {
  const params = getParams()
  const rawData = await nativeReadonlyCache.get<MediaInfo[]>(api, props.apipath, {
    params,
    ...(Array.isArray(params.media_source) ? { paramsSerializer: { indexes: null } } : {}),
  })
  const pageSignature = [...new Set(rawData.map(getMediaIdentity))].sort().join('\n')
  const isTerminal = rawData.length === 0 || seenPageSignatures.has(pageSignature)

  if (!isTerminal) seenPageSignatures.add(pageSignature)

  return {
    isTerminal,
    uniqueData: isTerminal ? [] : deduplicate(rawData),
  }
}

/** 网络失败仍进入原重试状态，空页或重复页终止本轮无限滚动。 */
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
    <GlassMediaBackdrop v-if="dataList.length > 0">
      <ProgressiveCardGrid :items="dataList" :item-aspect-ratio="1.5" :get-item-key="getMediaIdentity" tabindex="0">
        <template #default="{ item }">
          <MediaCard :media="item" />
        </template>
      </ProgressiveCardGrid>
    </GlassMediaBackdrop>
    <NoDataFound v-if="dataList.length === 0 && isRefreshed" error-code="404" :error-title="t('common.noData')" />
  </VInfiniteScroll>
</template>
