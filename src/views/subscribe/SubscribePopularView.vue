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

// 是否加载中
const loading = ref(false)

// 是否加载完成
const isRefreshed = ref(false)

// 数据列表
const dataList = ref<MediaInfo[]>([])
const currData = ref<MediaInfo[]>([])

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
  dataList.value = []
  page.value = 1
  isRefreshed.value = false
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

// 获取列表数据
async function fetchData({ done }: { done: any }) {
  try {
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
        currData.value = await api.get(apipath, {
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
        // 合并数据
        dataList.value = [...dataList.value, ...currData.value]
        // 页码+1
        page.value++
        // 返回加载成功
        done('ok')
        await nextTick()
      }
    } else {
      // 设置加载中
      loading.value = true
      // 请求API
      currData.value = await api.get(apipath, {
        params: getParams(),
      })
      loading.value = false
      // 标计为已请求完成
      isRefreshed.value = true
      if (currData.value.length === 0) {
        // 如果没有数据，跳出
        done('empty')
      } else {
        // 合并数据
        dataList.value = [...dataList.value, ...currData.value]
        // 页码+1
        page.value++
        // 返回加载成功
        done('ok')
      }
    }
  } catch (error) {
    console.error(error)
    // 返回加载失败
    done('error')
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
        <VChip
          :color="filterParams.genre_id == '' ? 'primary' : ''"
          filter
          tile
          value=""
        >
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
    class="overflow-visible px-2"
    @load="fetchData"
    :key="currentKey"
  >
    <template #loading />
    <template #empty />
    <ProgressiveCardGrid
      v-if="dataList.length > 0"
      :items="dataList"
      :get-item-key="item => item.tmdb_id || item.douban_id || item.bangumi_id || item.media_id || item.title"
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
      v-if="dataList.length === 0 && isRefreshed"
      error-code="404"
      :error-title="t('common.noData')"
      :error-description="t('subscribe.noPopularData')"
    />
  </VInfiniteScroll>
</template>
