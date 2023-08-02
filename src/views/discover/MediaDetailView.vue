<script setup lang="ts">
import PersonCardSlideView from './PersonCardSlideView.vue'
import MediaCardSlideView from './MediaCardSlideView.vue'
import api from '@/api'
import type { MediaInfo, Subscribe } from '@/api/types'
import NoDataFound from '@/components/NoDataFound.vue'

// 输入参数
const mediaProps = defineProps({
  mediaid: String,
  type: String,
})

// 媒体详情
const mediaDetail = ref<MediaInfo>({} as MediaInfo)

// 本地是否存在
const isExists = ref(false)

// 是否已订阅
const isSubscribed = ref(false)

// 是否已加载完成
const isRefreshed = ref(false)

// 调用API查询详情
async function getMediaDetail() {
  if (mediaProps.mediaid && mediaProps.type) {
    mediaDetail.value = await api.get(`tmdb/${mediaProps.mediaid}`, {
      params: {
        type_name: mediaProps.type,
      },
    })
    isRefreshed.value = true
    // 检查存在状态
    checkExists()
    // 检查订阅状态
    checkSubscribe()
  }
}

// 查询当前媒体是否已存在
async function checkExists() {
  try {
    const result: { [key: string]: any } = await api.get('media/exists', {
      params: {
        tmdbid: mediaDetail.value.tmdb_id,
        title: mediaDetail.value.title,
        year: mediaDetail.value.year,
        season: mediaDetail.value.season,
        mtype: mediaDetail.value.type,
      },
    })

    if (result.success)
      isExists.value = true
  }
  catch (error) {
    console.error(error)
  }
}

// 查询当前媒体是否已订阅
async function checkSubscribe(season = 0) {
  try {
    const mediaid = `tmdb:${mediaDetail.value.tmdb_id}`

    const result: Subscribe = await api.get(`subscribe/media/${mediaid}`, {
      params: {
        season,
      },
    })

    if (result.id)
      isSubscribed.value = true
  }
  catch (error) {
    console.error(error)
  }

  return null
}

// 从genres中获取name，使用、分隔
function getGenresName(genres: any[]) {
  return genres.map(genre => genre.name).join('、')
}

// 拼装TheMovieDb地址
function getTheMovieDbLink() {
  const mtype = mediaProps.type === '电影' ? 'movie' : 'tv'
  return `https://www.themoviedb.org/${mtype}/${mediaDetail.value.tmdb_id}`
}

// 拼装豆瓣地址
function getDoubanLink() {
  return `https://movie.douban.com/subject/${mediaDetail.value.douban_id}`
}

// 拼装IMDB地址
function getImdbLink() {
  return `https://www.imdb.com/title/${mediaDetail.value.imdb_id}`
}

// 拼装TVDB地址
function getTvdbLink() {
  return `https://www.thetvdb.com/series/${mediaDetail.value.tvdb_id}`
}

// 获取发行国家名称
const getProductionCountries = computed(() => {
  return mediaDetail.value.production_companies?.map(country => country.name)
})

// 获取发行公司名称
const getProductionCompanies = computed(() => {
  return mediaDetail.value.production_companies?.map(company => company.name)
})

onBeforeMount(() => {
  getMediaDetail()
})
</script>

<template>
  <div
    v-if="!isRefreshed"
    class="mt-12 w-full text-center text-gray-500 text-sm flex flex-col items-center"
  >
    <VProgressCircular
      size="48"
      indeterminate
      color="primary"
    />
  </div>
  <div v-if="mediaDetail.tmdb_id" class="max-w-8xl mx-auto px-4">
    <div class="media-page">
      <div class="media-header">
        <div class="media-poster">
          <VImg :src="mediaDetail.poster_path" cover />
        </div>
        <div class="media-title">
          <div v-if="isExists" class="media-status">
            <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full whitespace-nowrap transition !no-underline bg-green-500 bg-opacity-80 border border-green-500 !text-green-100 hover:bg-green-500 hover:bg-opacity-100 false overflow-hidden">
              <div class="relative z-20 flex items-center false"><span>已入库</span></div>
            </span>
          </div>
          <h1 class="flex flex-row items-baseline justify-start lg:justify-center">
            <span>{{ mediaDetail.title }}</span>
            <span v-if="mediaDetail.year" class="text-lg">（{{ mediaDetail.year }}）</span>
          </h1>
          <span class="media-attributes">
            <span v-if="mediaDetail.runtime">{{ mediaDetail.runtime }} 分钟</span>
            <span v-if="mediaDetail.runtime && mediaDetail.genres" class="mx-1"> | </span>
            <span v-if="mediaDetail.genres">{{ getGenresName(mediaDetail.genres || []) }}</span>
          </span>
        </div>
        <div class="media-actions">
          <VBtn v-if="isExists" class="ms-2" color="success" variant="tonal">
            <VIcon icon="mdi-play" />播放
          </VBtn>
          <VBtn v-if="mediaDetail.type === '电影'" class="ms-2" color="warning" variant="tonal">
            <VIcon icon="mdi-plus" />订阅
          </VBtn>
        </div>
      </div>
      <div class="media-overview">
        <div class="media-overview-left">
          <div v-if="mediaDetail.tagline" class="tagline">
            {{ mediaDetail.tagline }}
          </div>
          <h2 v-if="mediaDetail.overview">
            简介
          </h2>
          <p>{{ mediaDetail.overview }}</p>
          <ul class="media-crew">
            <li v-for="director in mediaDetail.directors" :key="director.id">
              <span>{{ director.job }}</span>
              <a class="crew-name" :href="`person?personid=${director.id}`" target="_blank">{{ director.name }}</a>
            </li>
          </ul>
          <div class="mt-6">
            <a v-if="mediaDetail.tmdb_id" class="mb-2 mr-2 inline-flex last:mr-0" :href="getTheMovieDbLink()" target="_blank">
              <div class="inline-flex cursor-pointer items-center rounded-full bg-gray-600 px-2 py-1 text-sm text-gray-200 ring-1 ring-gray-500 transition hover:bg-gray-700">
                <VIcon icon="mdi-link" />
                <span class="ms-1">TheMovieDb</span>
              </div>
            </a>
            <a v-if="mediaDetail.douban_id" class="mb-2 mr-2 inline-flex last:mr-0" :href="getDoubanLink()" target="_blank">
              <div class="inline-flex cursor-pointer items-center rounded-full bg-gray-600 px-2 py-1 text-sm text-gray-200 ring-1 ring-gray-500 transition hover:bg-gray-700">
                <VIcon icon="mdi-link" />
                <span class="ms-1">豆瓣</span>
              </div>
            </a>
            <a v-if="mediaDetail.imdb_id" class="mb-2 mr-2 inline-flex last:mr-0" :href="getImdbLink()" target="_blank">
              <div class="inline-flex cursor-pointer items-center rounded-full bg-gray-600 px-2 py-1 text-sm text-gray-200 ring-1 ring-gray-500 transition hover:bg-gray-700">
                <VIcon icon="mdi-link" />
                <span class="ms-1">IMDb</span>
              </div>
            </a>
            <a v-if="mediaDetail.tvdb_id" class="mb-2 mr-2 inline-flex last:mr-0" :href="getTvdbLink()" target="_blank">
              <div class="inline-flex cursor-pointer items-center rounded-full bg-gray-600 px-2 py-1 text-sm text-gray-200 ring-1 ring-gray-500 transition hover:bg-gray-700">
                <VIcon icon="mdi-link" />
                <span class="ms-1">TheTvDb</span>
              </div>
            </a>
          </div>
        </div>
        <div class="media-overview-right">
          <div class="media-facts">
            <div v-if="mediaDetail.vote_average" class="media-ratings">
              <VRating
                v-model="mediaDetail.vote_average"
                density="compact"
                length="10"
                class="ma-2"
                readonly
              />
            </div>
            <div v-if="mediaDetail.original_title || mediaDetail.original_name" class="media-fact">
              <span>原始标题</span>
              <span class="media-fact-value">{{ mediaDetail.original_title || mediaDetail.original_name }}</span>
            </div>
            <div v-if="mediaDetail.status" class="media-fact">
              <span>状态</span>
              <span class="media-fact-value">{{ mediaDetail.status }}</span>
            </div>
            <div v-if="mediaDetail.release_date || mediaDetail.first_air_date" class="media-fact">
              <span>上映日期</span>
              <span class="media-fact-value">
                <span class="flex items-center justify-end">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" aria-hidden="true" class="h-4 w-4"><path stroke-linecap="round" stroke-linejoin="round" d="M2.25 15a4.5 4.5 0 004.5 4.5H18a3.75 3.75 0 001.332-7.257 3 3 0 00-3.758-3.848 5.25 5.25 0 00-10.233 2.33A4.502 4.502 0 002.25 15z" />
                  </svg>
                  <span class="ml-1.5">{{ mediaDetail.release_date || mediaDetail.first_air_date }}</span>
                </span>
              </span>
            </div>
            <div v-if="mediaDetail.original_language" class="media-fact">
              <span>原始语言</span>
              <span class="media-fact-value">{{ mediaDetail.original_language }}</span>
            </div>
            <div v-if="mediaDetail.production_countries" class="media-fact">
              <span>出品国家</span>
              <span class="media-fact-value">
                <span v-for="country in getProductionCountries" :key="country" class="flex items-center justify-end text-end">
                  {{ country }}
                </span>
              </span>
            </div>
            <div v-if="mediaDetail.production_companies?.length" class="media-fact">
              <span>制作公司</span>
              <span class="media-fact-value text-end">
                <span v-for="company in getProductionCompanies" :key="company" class="block">{{ company }}</span>
              </span>
            </div>
          </div>
        </div>
      </div>
      <div v-if="mediaDetail.tmdb_id">
        <PersonCardSlideView :apipath="`tmdb/credits/${mediaDetail.tmdb_id}/${mediaProps.type}`">
          <template #title="{ loaded }">
            <div v-if="loaded" class="slider-header">
              <RouterLink :to="`/credits/tmdb/credits/${mediaDetail.tmdb_id}/${mediaProps.type}?title=演员阵容`" class="slider-title">
                <span>演员阵容</span>
                <VIcon icon="mdi-arrow-right-circle-outline" class="ms-1" />
              </RouterLink>
            </div>
          </template>
        </PersonCardSlideView>
      </div>
      <div v-if="mediaDetail.tmdb_id">
        <MediaCardSlideView :apipath="`tmdb/recommend/${mediaDetail.tmdb_id}/${mediaProps.type}`">
          <template #title="{ loaded }">
            <div v-if="loaded" class="slider-header">
              <RouterLink :to="`/browse/tmdb/recommend/${mediaDetail.tmdb_id}/${mediaProps.type}?title=推荐`" class="slider-title">
                <span>推荐</span>
                <VIcon icon="mdi-arrow-right-circle-outline" class="ms-1" />
              </RouterLink>
            </div>
          </template>
        </MediaCardSlideView>
      </div>
      <div v-if="mediaDetail.tmdb_id">
        <MediaCardSlideView :apipath="`tmdb/similar/${mediaDetail.tmdb_id}/${mediaProps.type}`">
          <template #title="{ loaded }">
            <div v-if="loaded" class="slider-header">
              <RouterLink :to="`/browse/tmdb/similar/${mediaDetail.tmdb_id}/${mediaProps.type}?title=类似`" class="slider-title">
                <span>类似</span>
                <VIcon icon="mdi-arrow-right-circle-outline" class="ms-1" />
              </RouterLink>
            </div>
          </template>
        </MediaCardSlideView>
      </div>
    </div>
  </div>
  <NoDataFound
    v-if="!mediaDetail.tmdb_id && isRefreshed"
    error-code="500"
    error-title="出错啦！"
    error-description="无法获取到媒体信息，请检查网络连接。"
  />
</template>

<style lang="scss">
.media-page {
  position: relative;
  background-position: 50%;
  background-size: cover;
  margin-block-start: calc(-4rem - env(safe-area-inset-top));
  margin-inline: -1rem;
  padding-block-start: calc(4rem + env(safe-area-inset-top));
  padding-inline: 1rem;
}

.media-header {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding-block-start: 1rem;
}

@media (min-width: 1280px) {
  .media-header {
    flex-direction: row;
    align-items: flex-end;
  }
}

.media-overview {
  display: flex;
  flex-direction: column;
  padding-top: 2rem;
  padding-bottom: 1rem;
}

@media (min-width: 1024px) {
  .media-overview {
    flex-direction: row;
  }
}

.media-poster {
  width: 8rem;
  overflow: hidden;
  border-radius: .25rem;
  --tw-shadow: 0 1px 3px 0 rgba(0, 0, 0, .1), 0 1px 2px -1px rgba(0, 0, 0, .1);
  --tw-shadow-colored: 0 1px 3px 0 var(--tw-shadow-color), 0 1px 2px -1px var(--tw-shadow-color);
  box-shadow: var(--tw-ring-offset-shadow, 0 0 #0000), var(--tw-ring-shadow, 0 0 #0000), var(--tw-shadow);
}

@media (min-width: 1280px) {
  .media-poster {
    margin-right: 1rem;
    width: 13rem;
  }
}

@media (min-width: 768px) {
  .media-poster {
    width: 11rem;
    border-radius: .5rem;
    --tw-shadow: 0 25px 50px -12px rgba(0, 0, 0, .25);
    --tw-shadow-colored: 0 25px 50px -12px var(--tw-shadow-color);
    box-shadow: var(--tw-ring-offset-shadow, 0 0 #0000), var(--tw-ring-shadow, 0 0 #0000), var(--tw-shadow);
  }
}

.media-title {
  margin-top: 1rem;
  display: flex;
  flex: 1 1 0%;
  flex-direction: column;
  text-align: center;
}

@media (min-width: 1280px) {
  .media-title {
    margin-right: 1rem;
    margin-top: 0;
    text-align: left;
  }
}

.media-title>h1 {
    font-size: 1.5rem;
    line-height: 2rem;
    font-weight: 700;
}

@media (min-width: 1280px) {
  .media-title>h1 {
      font-size: 2.25rem;
      line-height: 2.5rem;
  }
}

ul.media-crew {
    margin-top: 1.5rem;
    display: grid;
    grid-template-columns: repeat(2,minmax(0,1fr));
    gap: 1.5rem;
}

@media (min-width: 640px) {
  ul.media-crew {
      grid-template-columns: repeat(3,minmax(0,1fr));
  }
}

ul.media-crew>li {
    grid-column: span 1/span 1;
    display: flex;
    flex-direction: column;
    font-weight: 700;
}

a.crew-name {
    font-weight: 400;
}

.media-status {
  margin-bottom: .5rem;
}

.media-attributes {
  margin-top: .25rem;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
}

@media (min-width: 1280px) {
  .media-attributes {
    margin-top: 0;
    justify-content: flex-start;
    font-size: 1rem;
    line-height: 1.5rem;
  }
}

@media (min-width: 640px) {
  .media-attributes {
    font-size: .875rem;
    line-height: 1.25rem;
  }
}

.media-actions {
  position: relative;
  margin-top: 1rem;
  display: flex;
  flex-shrink: 0;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
}

@media (min-width: 1280px) {
  .media-actions {
    margin-top: 0;
  }
}

@media (min-width: 640px) {
  .media-actions {
    flex-wrap: nowrap;
    justify-content: flex-end;
  }
}

.media-overview-left {
  flex: 1 1 0%;
}

@media (min-width: 1024px) {
  .media-overview-left {
    margin-right: 2rem;
  }
}

.media-overview-right {
  margin-top: 2rem;
  width: 100%;
}

@media (min-width: 1024px) {
  .media-overview-right {
    margin-top: 0;
    width: 20rem;
  }
}

.media-facts {
    border-radius: 0.5rem;
    border-width: 1px;
    --tw-border-opacity: 1;
    border-color: rgb(55 65 81/var(--tw-border-opacity));
    --tw-bg-opacity: 1;
    font-size: .875rem;
    line-height: 1.25rem;
    font-weight: 700;
    --tw-text-opacity: 1;
}

.media-ratings {
    border-bottom-width: 1px;
    --tw-border-opacity: 1;
    border-color: rgb(55 65 81/var(--tw-border-opacity));
    padding: 0.5rem 1rem;
    font-weight: 500;
}

.media-ratings {
    display: flex;
    align-items: center;
    justify-content: center;
}

.media-fact {
    display: flex;
    justify-content: space-between;
    border-bottom-width: 1px;
    --tw-border-opacity: 1;
    border-color: rgb(55 65 81/var(--tw-border-opacity));
    padding: 0.5rem 1rem;
}

.media-overview h2 {
    font-size: 1.25rem;
    line-height: 1.75rem;
    font-weight: 700;
}

@media (min-width: 640px) {
  .media-overview h2 {
      font-size: 1.5rem;
      line-height: 2rem;
  }
}

.tagline {
    margin-bottom: 1rem;
    font-size: 1.25rem;
    line-height: 1.75rem;
    font-style: italic;
}

@media (min-width: 1024px) {
  .tagline {
      font-size: 1.5rem;
      line-height: 2rem;
  }
}
</style>
