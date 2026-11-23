<script setup lang="ts">
import MediaCardListView from '@/views/discover/MediaCardListView.vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

// 电影或者电视剧 movies/tvs
const type = ref('movies')

// 过滤参数
const filterParams = reactive({
  sort_by: 'popularity.desc',
  with_genres: '',
  with_original_language: '',
  with_keywords: '',
  with_watch_providers: '',
  vote_average: 0,
  vote_count: 10,
  release_date: '',
})

// TMDB 电影排序字典
const tmdbSortDict: Record<string, string> = {
  'popularity.desc': t('tmdb.sortType.popularityDesc'),
  'popularity.asc': t('tmdb.sortType.popularityAsc'),
  'release_date.desc': t('tmdb.sortType.releaseDateDesc'),
  'release_date.asc': t('tmdb.sortType.releaseDateAsc'),
  'vote_average.desc': t('tmdb.sortType.voteAverageDesc'),
  'vote_average.asc': t('tmdb.sortType.voteAverageAsc'),
}

// TMDB 电视剧排序字典
const tmdbTvSortDict: Record<string, string> = {
  'popularity.desc': t('tmdb.sortType.popularityDesc'),
  'popularity.asc': t('tmdb.sortType.popularityAsc'),
  'first_air_date.desc': t('tmdb.sortType.firstAirDateDesc'),
  'first_air_date.asc': t('tmdb.sortType.firstAirDateAsc'),
  'vote_average.desc': t('tmdb.sortType.voteAverageDesc'),
  'vote_average.asc': t('tmdb.sortType.voteAverageAsc'),
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

// TMDB原始语言字典（主要语言）
const tmdbLanguageDict = {
  'zh': t('tmdb.languageType.zh'),
  'en': t('tmdb.languageType.en'),
  'ja': t('tmdb.languageType.ja'),
  'ko': t('tmdb.languageType.ko'),
  'fr': t('tmdb.languageType.fr'),
  'de': t('tmdb.languageType.de'),
  'es': t('tmdb.languageType.es'),
  'it': t('tmdb.languageType.it'),
  'ru': t('tmdb.languageType.ru'),
  'pt': t('tmdb.languageType.pt'),
  'ar': t('tmdb.languageType.ar'),
  'hi': t('tmdb.languageType.hi'),
  'th': t('tmdb.languageType.th'),
}

// 当前Key
const currentKey = ref(0)

// 类型变化
watch(type, () => {
  if (!type.value) {
    type.value = 'movies'
  }
  if (type.value === 'movies') {
    if (!tmdbSortDict[filterParams.sort_by]) {
      filterParams.sort_by = 'popularity.desc'
    }
    if (!tmdbMovieGenreDict[filterParams.with_genres]) {
      filterParams.with_genres = ''
    }
  }
  if (type.value === 'tvs') {
    if (!tmdbTvSortDict[filterParams.sort_by]) {
      filterParams.sort_by = 'popularity.desc'
    }
    if (!tmdbTvGenreDict[filterParams.with_genres]) {
      filterParams.with_genres = ''
    }
  }
  currentKey.value++
})

// 过滤参数变化
watch(filterParams, () => {
  if (!filterParams.sort_by) {
    filterParams.sort_by = 'popularity.desc'
  }
  currentKey.value++
})
</script>

<template>
  <div class="app-filter-bar">
    <div class="app-filter-row">
      <VLabel class="app-filter-label">{{ t('tmdb.type') }}</VLabel>
      <VChipGroup v-model="type" class="app-filter-chips">
        <VChip :color="type == 'movies' ? 'primary' : ''" filter tile value="movies">{{ t('mediaType.movie') }}</VChip>
        <VChip :color="type == 'tvs' ? 'primary' : ''" filter tile value="tvs">{{ t('mediaType.tv') }}</VChip>
      </VChipGroup>
    </div>
    <div class="app-filter-row">
      <VLabel class="app-filter-label">{{ t('tmdb.sort') }}</VLabel>
      <VChipGroup v-model="filterParams.sort_by" class="app-filter-chips">
        <VChip
          :color="filterParams.sort_by == key ? 'primary' : ''"
          filter
          tile
          :value="key"
          v-for="(value, key) in type == 'movies' ? tmdbSortDict : tmdbTvSortDict"
          :key="key"
        >
          {{ value }}
        </VChip>
      </VChipGroup>
    </div>
    <div class="app-filter-row">
      <VLabel class="app-filter-label">{{ t('tmdb.genre') }}</VLabel>
      <VChipGroup v-model="filterParams.with_genres" class="app-filter-chips">
        <VChip
          :color="filterParams.with_genres == key ? 'primary' : ''"
          filter
          tile
          :value="key"
          v-for="(value, key) in type == 'movies' ? tmdbMovieGenreDict : tmdbTvGenreDict"
          :key="key"
        >
          {{ value }}
        </VChip>
      </VChipGroup>
    </div>
    <div class="app-filter-row">
      <VLabel class="app-filter-label">{{ t('tmdb.language') }}</VLabel>
      <VChipGroup v-model="filterParams.with_original_language" class="app-filter-chips">
        <VChip
          :color="filterParams.with_original_language == key ? 'primary' : ''"
          filter
          tile
          :value="key"
          v-for="(value, key) in tmdbLanguageDict"
          :key="key"
        >
          {{ value }}
        </VChip>
      </VChipGroup>
    </div>
    <div class="app-filter-row">
      <VLabel class="app-filter-label">{{ t('tmdb.rating') }}</VLabel>
      <VSlider
        v-model="filterParams.vote_average"
        thumb-label
        max="10"
        min="0"
        :step="1"
        class="app-filter-slider align-center"
        hide-details
      >
        <template v-slot:append>
          <VTextField
            variant="outlined"
            width="5rem"
            v-model="filterParams.vote_count"
            class="num"
            density="compact"
            type="number"
            hide-details
            single-line
          />
        </template>
      </VSlider>
    </div>
  </div>

  <div>
    <MediaCardListView :key="currentKey" :apipath="`discover/tmdb_${type}`" :params="filterParams" />
  </div>
</template>
