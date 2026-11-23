<script lang="ts" setup>
import api from '@/api'
import type { SubscribeShare } from '@/api/types'
import AppFilterBar from '@/components/filter/AppFilterBar.vue'
import NoDataFound from '@/components/states/NoDataFound.vue'
import SubscribeShareCard from '@/components/cards/SubscribeShareCard.vue'
import ProgressiveCardGrid from '@/components/misc/ProgressiveCardGrid.vue'
import { useI18n } from 'vue-i18n'

// 国际化
const { t } = useI18n()

// 定义输入参数
const props = defineProps({
  // 过滤关键字
  keyword: String,
})

// 判断是否有滚动条
function hasScroll() {
  return document.body.scrollHeight - (window.innerHeight || document.documentElement.clientHeight) > 2
}

// API
const apipath = 'subscribe/shares'

// 当前页码
const page = ref(1)

// 搜索关键字
const keyword = ref(props.keyword)

// 筛选参数
const filterParams = reactive({
  genre_id: '', // 空字符串表示选中"全部"
  min_rating: 0,
  max_rating: 10,
  sort_type: 'time', // 默认按时间排序
})

// 当前Key（用于重新加载数据）
const currentKey = ref(0)

function resetData() {
  requestGeneration++
  dataList.value = []
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

// 获取当前类型对应的风格字典（订阅分享包含电影和电视剧，所以显示所有风格）
const currentGenreDict = computed(() => {
  // 合并电影和电视剧风格字典
  return { ...tmdbMovieGenreDict, ...tmdbTvGenreDict }
})

// 监听 props.keyword 变化
watch(
  () => props.keyword,
  newKeyword => {
    keyword.value = newKeyword || ''
    resetData()
  },
)

// 监听筛选参数变化
watch(
  filterParams,
  () => {
    resetData()
  },
  { deep: true },
)

// 是否加载完成
const isRefreshed = ref(false)

// 当前列表请求是否失败；合法空数组仍使用空数据状态。
const loadError = ref(false)

// 数据列表
const dataList = ref<SubscribeShare[]>([])

// 搜索或筛选重置允许新旧请求短暂并行，只接纳当前代次的响应。
let requestGeneration = 0
const loadingGenerations = new Set<number>()

// 拼装参数
function getParams() {
  const params: Record<string, string | number | undefined> = {
    page: page.value,
    count: 30,
    name: keyword.value,
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
  if (filterParams.sort_type) {
    params.sort_type = filterParams.sort_type
  }

  return params
}

// 获取列表数据
async function fetchData({ done }: { done: (status: 'empty' | 'error' | 'ok') => void }) {
  const generation = requestGeneration

  // 同一搜索条件只允许一个分页请求在途。
  if (loadingGenerations.has(generation)) {
    return
  }

  loadingGenerations.add(generation)
  loadError.value = false

  try {
    while (generation === requestGeneration) {
      const currentData: SubscribeShare[] = await api.get(apipath, {
        params: getParams(),
      })

      if (generation !== requestGeneration) return

      isRefreshed.value = true
      if (currentData.length === 0) {
        done('empty')
        return
      }

      dataList.value = [...dataList.value, ...currentData]
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

// 将数据从列表中移除
function removeData(id: number) {
  dataList.value = dataList.value.filter(item => item.id !== id)
}
const secondaryFilterCount = computed(() => {
  let count = 0
  if (filterParams.genre_id) count += 1
  if (filterParams.min_rating > 0) count += 1
  return count
})
</script>

<template>
  <!-- 筛选器 -->
  <AppFilterBar :active-count="secondaryFilterCount">
    <template #primary>
      <div class="app-filter-row">
        <VLabel class="app-filter-label">{{ t('tmdb.sort') }}</VLabel>
        <VChipGroup v-model="filterParams.sort_type" class="app-filter-chips">
          <VChip value="time">
            {{ t('tmdb.sortType.time') }}
          </VChip>
          <VChip value="count">
            {{ t('tmdb.sortType.count') }}
          </VChip>
          <VChip value="rating">
            {{ t('tmdb.sortType.rating') }}
          </VChip>
        </VChipGroup>
      </div>
    </template>

    <div class="app-filter-row">
      <VLabel class="app-filter-label">{{ t('tmdb.genre') }}</VLabel>
      <VChipGroup v-model="filterParams.genre_id" class="app-filter-chips">
        <VChip value="">
          {{ t('common.all') }}
        </VChip>
        <VChip v-for="(value, key) in currentGenreDict" :key="key" :value="key">
          {{ value }}
        </VChip>
      </VChipGroup>
    </div>

    <div class="app-filter-row">
      <VLabel class="app-filter-label">{{ t('tmdb.rating') }}</VLabel>
      <div class="app-filter-range-capsule app-filter-range-capsule--compact">
        <span class="app-filter-range-readout num" :class="{ 'is-active': filterParams.min_rating > 0 }">
          <span class="app-filter-range-readout__star" aria-hidden="true">★</span>
          <span>{{ filterParams.min_rating > 0 ? `≥ ${filterParams.min_rating}` : t('common.all') }}</span>
        </span>
        <VSlider
          v-model="filterParams.min_rating"
          max="10"
          min="0"
          :step="1"
          density="compact"
          class="app-filter-slider align-center"
          hide-details
        />
      </div>
    </div>
  </AppFilterBar>

  <VPageContentTitle v-if="keyword" :title="`${t('common.search')}：${keyword}`" />
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
      :get-item-key="
        item => item.id || `${item.media_source || 'unknown'}:${item.media_id || item.name}-${item.share_user}`
      "
      :min-item-width="240"
      :estimated-item-height="260"
      tabindex="0"
    >
      <template #default="{ item }">
        <SubscribeShareCard :media="item" @delete="removeData(item.id || 0)" />
      </template>
    </ProgressiveCardGrid>
    <NoDataFound
      v-if="dataList.length === 0 && isRefreshed && !loadError"
      error-code="404"
      :error-title="t('common.noData')"
      :error-description="keyword ? t('common.noContent') : t('subscribe.noShareData')"
    />
  </VInfiniteScroll>
</template>
