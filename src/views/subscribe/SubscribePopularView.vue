<script lang="ts" setup>
import api from '@/api'
import type { MediaInfo } from '@/api/types'
import MediaCard from '@/components/cards/MediaCard.vue'
import NoDataFound from '@/components/states/NoDataFound.vue'
import ProgressiveCardGrid from '@/components/misc/ProgressiveCardGrid.vue'
import { useI18n } from 'vue-i18n'

// 国际化
const { t } = useI18n()

// 输入参数
const props = defineProps({
  type: String,
})

// 判断是否有滚动条
function hasScroll() {
  return document.body.scrollHeight - (window.innerHeight || document.documentElement.clientHeight) > 2
}

// API
const apipath = 'subscribe/popular'

// 当前页码
const page = ref(1)

// 是否加载完成
const isRefreshed = ref(false)

// 当前列表请求是否失败；合法空数组仍使用空数据状态。
const loadError = ref(false)

// 使用 shallowRef 避免长列表中的深层代理开销
const dataList = shallowRef<MediaInfo[]>([])

// 用于保存已处理过的 key（去重）
const seenKeys = new Set<string>()

// 保存本次列表生命周期内已经处理过的原始页签名（检测分页循环）
const seenPageSignatures = new Set<string>()

// 筛选重置允许新旧请求短暂并行，只接纳当前代次的响应。
let requestGeneration = 0
const loadingGenerations = new Set<number>()

// 筛选参数
const filterParams = reactive({
  genre_id: '', // 空字符串表示选中"全部"
  min_rating: 0,
  max_rating: 10,
  min_sub: 1,
  sort_type: 'count', // 默认按热度排序
})

// 当前Key（用于重新加载数据）
const currentKey = ref(0)

function resetData() {
  requestGeneration++
  dataList.value = []
  seenKeys.clear()
  seenPageSignatures.clear()
  page.value = 1
  isRefreshed.value = false
  loadError.value = false
  currentKey.value++
}

// TMDB电影风格字典
const tmdbMovieGenreDict: Record<string, string> = {
  '28': t('tmdb.genreType.action'),
  '12': t('tmdb.genreType.adventure'),
  '16': t('tmdb.genreType.animation'),
  '35': t('tmdb.genreType.comedy'),
  '80': t('tmdb.genreType.crime'),
  '99': t('tmdb.genreType.documentary'),
  '18': t('tmdb.genreType.drama'),
  '10751': t('tmdb.genreType.family'),
  '14': t('tmdb.genreType.fantasy'),
  '36': t('tmdb.genreType.history'),
  '27': t('tmdb.genreType.horror'),
  '10402': t('tmdb.genreType.music'),
  '9648': t('tmdb.genreType.mystery'),
  '10749': t('tmdb.genreType.romance'),
  '878': t('tmdb.genreType.scienceFiction'),
  '10770': t('tmdb.genreType.tvMovie'),
  '53': t('tmdb.genreType.thriller'),
  '10752': t('tmdb.genreType.war'),
  '37': t('tmdb.genreType.western'),
}

// TMDB电视剧风格字典
const tmdbTvGenreDict: Record<string, string> = {
  '10759': t('tmdb.genreType.actionAdventure'),
  '16': t('tmdb.genreType.animation'),
  '35': t('tmdb.genreType.comedy'),
  '80': t('tmdb.genreType.crime'),
  '99': t('tmdb.genreType.documentary'),
  '18': t('tmdb.genreType.drama'),
  '10751': t('tmdb.genreType.family'),
  '10762': t('tmdb.genreType.kids'),
  '9648': t('tmdb.genreType.mystery'),
  '10763': t('tmdb.genreType.news'),
  '10764': t('tmdb.genreType.reality'),
  '10765': t('tmdb.genreType.sciFiFantasy'),
  '10766': t('tmdb.genreType.soap'),
  '10767': t('tmdb.genreType.talk'),
  '10768': t('tmdb.genreType.warPolitics'),
  '37': t('tmdb.genreType.western'),
}

// 获取当前类型对应的风格字典
const currentGenreDict = computed(() => {
  return props.type === '电影' ? tmdbMovieGenreDict : tmdbTvGenreDict
})

// 监听筛选参数变化
watch(
  filterParams,
  () => {
    resetData()
  },
  { deep: true },
)

// 拼装参数
function getParams() {
  let params: { [key: string]: any } = {
    stype: props.type,
    page: page.value,
    count: 30,
  }

  // 添加筛选参数
  if (filterParams.genre_id) {
    params.genre_id = parseInt(filterParams.genre_id)
  }
  if (filterParams.min_rating > 0) {
    params.min_rating = filterParams.min_rating
  }
  if (filterParams.max_rating < 10) {
    params.max_rating = filterParams.max_rating
  }
  if (filterParams.min_sub > 1) {
    params.min_sub = filterParams.min_sub
  }
  if (filterParams.sort_type) {
    params.sort_type = filterParams.sort_type
  }

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
  const rawData: MediaInfo[] = await api.get(apipath, {
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
async function fetchData({ done }: { done: (status: 'empty' | 'error' | 'ok') => void }) {
  const generation = requestGeneration

  // 同一筛选条件只允许一个分页请求在途。
  if (loadingGenerations.has(generation)) {
    return
  }

  loadingGenerations.add(generation)
  loadError.value = false

  try {
    while (generation === requestGeneration) {
      const { isTerminal, uniqueData } = await loadPageData()

      if (generation !== requestGeneration) return

      isRefreshed.value = true
      if (isTerminal) {
        done('empty')
        return
      }

      appendData(uniqueData)
      page.value++
      done('ok')
      await nextTick()

      if (hasScroll()) return
    }
  } catch (error) {
    if (generation !== requestGeneration) return

    console.error(error)
    isRefreshed.value = true
    loadError.value = true
    done('error')
  } finally {
    loadingGenerations.delete(generation)
  }
}
</script>

<template>
  <!-- 筛选器 -->
  <div class="px-3 mb-4">
    <div class="flex justify-start align-center mb-3">
      <div class="mr-5">
        <VLabel>{{ t('tmdb.sort') }}</VLabel>
      </div>
      <VChipGroup v-model="filterParams.sort_type">
        <VChip :color="filterParams.sort_type == 'time' ? 'primary' : ''" filter tile value="time">
          {{ t('tmdb.sortType.time') }}
        </VChip>
        <VChip :color="filterParams.sort_type == 'count' ? 'primary' : ''" filter tile value="count">
          {{ t('tmdb.sortType.count') }}
        </VChip>
        <VChip :color="filterParams.sort_type == 'rating' ? 'primary' : ''" filter tile value="rating">
          {{ t('tmdb.sortType.rating') }}
        </VChip>
      </VChipGroup>
    </div>

    <div class="flex justify-start align-center mb-3">
      <div class="mr-5">
        <VLabel>{{ t('tmdb.genre') }}</VLabel>
      </div>
      <VChipGroup v-model="filterParams.genre_id">
        <VChip :color="filterParams.genre_id == '' ? 'primary' : ''" filter tile value="">
          {{ t('common.all') }}
        </VChip>
        <VChip
          :color="filterParams.genre_id == key ? 'primary' : ''"
          filter
          tile
          :value="key"
          v-for="(value, key) in currentGenreDict"
          :key="key"
        >
          {{ value }}
        </VChip>
      </VChipGroup>
    </div>

    <div class="flex justify-start align-center mb-3">
      <div class="mr-5">
        <VLabel>{{ t('tmdb.rating') }}</VLabel>
      </div>
      <VSlider
        v-model="filterParams.min_rating"
        thumb-label
        max="10"
        min="0"
        :step="1"
        class="align-center"
        hide-details
      >
      </VSlider>
    </div>
  </div>

  <LoadingBanner v-if="!isRefreshed" class="mt-12" />
  <VInfiniteScroll
    mode="intersect"
    side="end"
    :items="dataList"
    :margin="dataList.length > 0 ? 480 : 0"
    class="overflow-visible px-2"
    @load="fetchData"
    :key="currentKey"
  >
    <template #loading />
    <template #error="{ props: retryProps }">
      <div class="d-flex flex-column align-center ga-2 py-4" role="alert">
        <span class="text-medium-emphasis">{{ t('subscribe.requestFailed') }}</span>
        <VBtn v-bind="retryProps" prepend-icon="mdi-refresh" size="small" variant="tonal">
          {{ t('common.retry') }}
        </VBtn>
      </div>
    </template>
    <template #empty />
    <ProgressiveCardGrid
      v-if="dataList.length > 0"
      :items="dataList"
      :get-item-key="getMediaIdentity"
      :min-item-width="144"
      :estimated-item-height="320"
      tabindex="0"
    >
      <template #default="{ item }">
        <div>
          <MediaCard :media="item" />
          <div v-if="item.popularity" class="mt-2 flex flex-row justify-center align-center text-subtitle-2">
            <VIcon icon="mdi-fire" color="error" />
            <span> {{ item.popularity.toLocaleString() }}</span>
          </div>
        </div>
      </template>
    </ProgressiveCardGrid>
    <NoDataFound
      v-if="dataList.length === 0 && isRefreshed && !loadError"
      error-code="404"
      :error-title="t('common.noData')"
      :error-description="t('subscribe.noPopularData')"
    />
  </VInfiniteScroll>
</template>
