<script lang="ts" setup>
import api from '@/api'
import type { MediaInfo } from '@/api/types'
import MediaCard from '@/components/cards/MediaCard.vue'
import NoDataFound from '@/components/NoDataFound.vue'
import VirtualGrid from '@/components/virtual/VirtualGrid.vue'
import { useBreakpointCols } from '@/composables/virtual/useBreakpointCols'
import { useI18n } from 'vue-i18n'

// 国际化
const { t } = useI18n()

// 列数：按视口断点（路由级全宽页）
const cols = useBreakpointCols({ xs: 3, sm: 4, md: 6, lg: 8, xl: 10, xxl: 12 })

// 输入参数
const props = defineProps({
  type: String,
})

// API
const apipath = 'subscribe/popular'

const page = ref(1)
const loading = ref(false)
const isRefreshed = ref(false)
const hasMore = ref(true)

const dataList = ref<MediaInfo[]>([])

// 筛选参数
const filterParams = reactive({
  genre_id: '',
  min_rating: 0,
  max_rating: 10,
  min_sub: 1,
  sort_type: 'count',
})

// 当前 Key（用于在筛选条件变化时重置 VirtualGrid 内部状态）
const currentKey = ref(0)

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

const currentGenreDict = computed(() => {
  return props.type === '电影' ? tmdbMovieGenreDict : tmdbTvGenreDict
})

// 筛选变化 → 重置列表
watch(
  filterParams,
  () => {
    dataList.value = []
    page.value = 1
    hasMore.value = true
    isRefreshed.value = false
    currentKey.value++
    void fetchData()
  },
  { deep: true },
)

// 拼装参数
function getParams() {
  const params: { [key: string]: any } = {
    stype: props.type,
    page: page.value,
    count: 30,
  }
  if (filterParams.genre_id) params.genre_id = parseInt(filterParams.genre_id)
  if (filterParams.min_rating > 0) params.min_rating = filterParams.min_rating
  if (filterParams.max_rating < 10) params.max_rating = filterParams.max_rating
  if (filterParams.min_sub > 1) params.min_sub = filterParams.min_sub
  if (filterParams.sort_type) params.sort_type = filterParams.sort_type
  return params
}

async function fetchData() {
  if (loading.value || !hasMore.value) return
  loading.value = true
  try {
    const data: MediaInfo[] = await api.get(apipath, { params: getParams() })
    isRefreshed.value = true
    if (!data || data.length === 0) {
      hasMore.value = false
      return
    }
    dataList.value = [...dataList.value, ...data]
    page.value++
    if (data.length < 30) hasMore.value = false
  } catch (error) {
    console.error(error)
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  void fetchData()
})
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
          v-for="(value, key) in currentGenreDict"
          :key="key"
          :color="filterParams.genre_id == key ? 'primary' : ''"
          filter
          tile
          :value="key"
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
      />
    </div>
  </div>

  <LoadingBanner v-if="!isRefreshed" class="mt-12" />
  <VirtualGrid
    v-if="isRefreshed && dataList.length > 0"
    :key="currentKey"
    :items="dataList"
    :columns="cols"
    :row-estimate-size="320"
    :gap="16"
    :overscan="3"
    use-window-scroll
    class="pt-2 px-3"
    @load-more="fetchData"
  >
    <template #item="{ item }">
      <div>
        <MediaCard :media="item" />
        <div v-if="item.popularity" class="mt-2 flex flex-row justify-center align-center text-subtitle-2">
          <VIcon icon="mdi-fire" color="error" />
          <span> {{ item.popularity.toLocaleString() }}</span>
        </div>
      </div>
    </template>
  </VirtualGrid>
  <NoDataFound
    v-if="dataList.length === 0 && isRefreshed"
    error-code="404"
    :error-title="t('common.noData')"
    :error-description="t('subscribe.noPopularData')"
  />
</template>
