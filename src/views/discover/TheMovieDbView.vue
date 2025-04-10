<script setup lang="ts">
import MediaCardListView from '@/views/discover/MediaCardListView.vue'

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
  'popularity.desc': '热度降序',
  'popularity.asc': '热度升序',
  'release_date.desc': '上映日期降序',
  'release_date.asc': '上映日期升序',
  'vote_average.desc': '评分降序',
  'vote_average.asc': '评分升序',
}

// TMDB 电视剧排序字典
const tmdbTvSortDict: Record<string, string> = {
  'popularity.desc': '热度降序',
  'popularity.asc': '热度升序',
  'first_air_date.desc': '首播日期降序',
  'first_air_date.asc': '首播日期升序',
  'vote_average.desc': '评分降序',
  'vote_average.asc': '评分升序',
}

// TMDB电影风格字典
const tmdbMovieGenreDict: Record<string, string> = {
  '28': '动作',
  '12': '冒险',
  '16': '动画',
  '35': '喜剧',
  '80': '犯罪',
  '99': '纪录片',
  '18': '剧情',
  '10751': '家庭',
  '14': '奇幻',
  '36': '历史',
  '27': '恐怖',
  '10402': '音乐',
  '9648': '悬疑',
  '10749': '爱情',
  '878': '科幻',
  '10770': '电视电影',
  '53': '惊悚',
  '10752': '战争',
  '37': '西部',
}

// TMDB电视剧风格字典
const tmdbTvGenreDict: Record<string, string> = {
  '10759': '动作冒险',
  '16': '动画',
  '35': '喜剧',
  '80': '犯罪',
  '99': '纪录片',
  '18': '剧情',
  '10751': '家庭',
  '10762': '儿童',
  '9648': '悬疑',
  '10763': '新闻',
  '10764': '真人秀',
  '10765': '科幻奇幻',
  '10766': '肥皂剧',
  '10767': '戏剧',
  '10768': '战争政治',
  '37': '西部',
}

// TMDB原始语言字典（主要语言）
const tmdbLanguageDict = {
  'zh': '中文',
  'en': '英语',
  'ja': '日语',
  'ko': '韩语',
  'fr': '法语',
  'de': '德语',
  'es': '西班牙语',
  'it': '意大利语',
  'ru': '俄语',
  'pt': '葡萄牙语',
  'ar': '阿拉伯语',
  'hi': '印地语',
  'th': '泰语',
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
  <div class="filter-container">
    <div class="filter-row">
      <div class="filter-label">
        <VIcon icon="mdi-shape-outline" size="x-small" class="mr-1" />
        类型
      </div>
      <div class="chip-wrapper">
        <div 
          class="custom-chip"
          :class="{ 'active-chip': type === 'movies' }"
          @click="type = 'movies'"
        >
          电影
        </div>
        <div 
          class="custom-chip"
          :class="{ 'active-chip': type === 'tvs' }"
          @click="type = 'tvs'"
        >
          电视剧
        </div>
      </div>
    </div>
    
    <div class="filter-row">
      <div class="filter-label">
        <VIcon icon="mdi-sort-variant" size="x-small" class="mr-1" />
        排序
      </div>
      <div class="chip-wrapper">
        <div 
          v-for="(value, key) in type == 'movies' ? tmdbSortDict : tmdbTvSortDict"
          :key="key"
          class="custom-chip"
          :class="{ 'active-chip': filterParams.sort_by === key }"
          @click="filterParams.sort_by = key"
        >
          {{ value }}
        </div>
      </div>
    </div>
    
    <div class="filter-row">
      <div class="filter-label">
        <VIcon icon="mdi-tag-multiple-outline" size="x-small" class="mr-1" />
        风格
      </div>
      <div class="chip-wrapper">
        <div 
          v-for="(value, key) in type == 'movies' ? tmdbMovieGenreDict : tmdbTvGenreDict"
          :key="key"
          class="custom-chip"
          :class="{ 'active-chip': filterParams.with_genres === key }"
          @click="filterParams.with_genres = filterParams.with_genres === key ? '' : key"
        >
          {{ value }}
        </div>
      </div>
    </div>
    
    <div class="filter-row">
      <div class="filter-label">
        <VIcon icon="mdi-translate" size="x-small" class="mr-1" />
        语言
      </div>
      <div class="chip-wrapper">
        <div 
          v-for="(value, key) in tmdbLanguageDict"
          :key="key"
          class="custom-chip"
          :class="{ 'active-chip': filterParams.with_original_language === key }"
          @click="filterParams.with_original_language = filterParams.with_original_language === key ? '' : key"
        >
          {{ value }}
        </div>
      </div>
    </div>
    
    <div class="filter-row rating-row">
      <div class="rating-header">
        <div class="filter-label">
          <VIcon icon="mdi-star-outline" size="x-small" class="mr-1" />
          评分不低于 {{ filterParams.vote_average }}
        </div>
      </div>
      <div class="slider-container">
        <div class="min-value">0</div>
        <VSlider 
          v-model="filterParams.vote_average" 
          :step="0.5" 
          max="10" 
          min="0" 
          class="rating-slider" 
          hide-details
          track-color="grey-lighten-3"
          thumb-label="always"
        />
        <div class="max-value">10</div>
      </div>
    </div>
  </div>

  <div>
    <MediaCardListView :key="currentKey" :apipath="`discover/tmdb_${type}`" :params="filterParams" />
  </div>
</template>

<style lang="scss" scoped>
.filter-container {
  padding: 0 16px 16px;
}

.filter-row {
  display: flex;
  margin-bottom: 16px;
  align-items: flex-start;
  
  @media (max-width: 768px) {
    margin-bottom: 12px;
  }
}

.filter-label {
  display: flex;
  align-items: center;
  font-size: 0.9rem;
  font-weight: 500;
  min-width: 60px;
  margin-right: 16px;
  margin-top: 8px;
  white-space: nowrap;
}

.chip-wrapper {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 4px;
  
  @media (max-width: 768px) {
    overflow-x: auto;
    flex-wrap: nowrap;
    padding-bottom: 8px;
    margin-bottom: 4px;
    width: 100%;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: none;
    
    &::-webkit-scrollbar {
      display: none;
    }
  }
}

.custom-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 32px;
  padding: 0 12px;
  background-color: rgba(var(--v-theme-surface), 0.8);
  border-radius: 4px;
  font-size: 0.85rem;
  cursor: pointer;
  transition: all 0.2s ease;
  user-select: none;
  white-space: nowrap;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.08);
  
  &:hover {
    background-color: rgba(var(--v-theme-surface), 1);
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
  }
  
  &.active-chip {
    background-color: rgba(var(--v-theme-primary), 0.12);
    color: rgb(var(--v-theme-primary));
    font-weight: 500;
    border-color: rgba(var(--v-theme-primary), 0.5);
  }
  
  @media (max-width: 768px) {
    flex-shrink: 0;
  }
}

.rating-row {
  flex-direction: column;
}

.rating-header {
  margin-bottom: 8px;
}

.slider-container {
  display: flex;
  align-items: center;
  flex-grow: 1;
  width: 100%;
  
  .min-value, .max-value {
    font-size: 0.8rem;
    color: rgba(var(--v-theme-on-surface), 0.6);
    flex-shrink: 0;
    width: 20px;
    text-align: center;
  }
  
  .rating-slider {
    flex-grow: 1;
    margin: 0 8px;
  }
}
</style>
