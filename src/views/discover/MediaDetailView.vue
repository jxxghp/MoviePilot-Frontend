<script setup lang="ts">
import { useToast } from 'vue-toast-notification'
import PersonCardSlideView from './PersonCardSlideView.vue'
import MediaCardSlideView from './MediaCardSlideView.vue'
import api from '@/api'
import type { MediaInfo, NotExistMediaInfo, Subscribe, TmdbEpisode } from '@/api/types'
import NoDataFound from '@/components/NoDataFound.vue'
import { doneNProgress, startNProgress } from '@/api/nprogress'
import { formatSeason } from '@/@core/utils/formatters'
import router from '@/router'
import SubscribeEditDialog from '@/components/dialog/SubscribeEditDialog.vue'
import { isNullOrEmptyObject } from '@/@core/utils'

// 输入参数
const mediaProps = defineProps({
  mediaid: String,
  type: String,
})

const store = useStore()

// 提示框
const $toast = useToast()

// 媒体详情
const mediaDetail = ref<MediaInfo>({} as MediaInfo)

// 订阅编辑弹窗
const subscribeEditDialog = ref(false)

// 本地是否存在，存在则包括Item信息
const existsItemId = ref('')

// 是否已订阅
const isSubscribed = ref(false)

// 是否已加载完成
const isRefreshed = ref(false)

// 存储每一季的集信息
const seasonEpisodesInfo = ref({} as { [key: number]: TmdbEpisode[] })

// 存储存在的季集
const existsEpisodes = ref({} as { [key: number]: number[] })

// 各季缺失状态：0-已入库 1-部分缺失 2-全部缺失，没有数据也是已入库
const seasonsNotExisted = ref<{ [key: number]: number }>({})

// 各季的订阅状态
const seasonsSubscribed = ref<{ [key: number]: boolean }>({})

// 订阅编号
const subscribeId = ref<number>()

// 获得mediaid
function getMediaId() {
  return mediaDetail.value?.tmdb_id
    ? `tmdb:${mediaDetail.value?.tmdb_id}`
    : mediaDetail.value?.douban_id
    ? `douban:${mediaDetail.value?.douban_id}`
    : `bangumi:${mediaDetail.value?.bangumi_id}`
}

// 调用API查询详情
async function getMediaDetail() {
  if (mediaProps.mediaid && mediaProps.type) {
    mediaDetail.value = await api.get(`media/${mediaProps.mediaid}`, {
      params: {
        type_name: mediaProps.type,
      },
    })
    isRefreshed.value = true
    if (!mediaDetail.value.tmdb_id && !mediaDetail.value.douban_id && !mediaDetail.value.bangumi_id) return

    // 检查存在状态
    checkExists()
    if (mediaDetail.value.type === '电视剧') checkSeasonsNotExists()
    // 检查订阅状态
    if (mediaDetail.value.type === '电影') checkMovieSubscribed()
    else checkSeasonsSubscribed()
  }
}

// 调用API加载季集信息（TMDB）
async function loadSeasonEpisodes(season: number) {
  // 加载季集存在信息
  loadEpisodeExists()
  // 加载季集信息
  if (seasonEpisodesInfo.value[season]) return
  try {
    const result: TmdbEpisode[] = await api.get(`tmdb/${mediaDetail.value.tmdb_id}/${season}`)
    seasonEpisodesInfo.value[season] = result || []
  } catch (error) {
    console.error(error)
  }
}

// 调用API加载季集存在信息（媒体服务器）
async function loadEpisodeExists() {
  // 查询季集存在状态
  if (!isNullOrEmptyObject(existsEpisodes.value)) return
  try {
    const result: { [key: number]: number[] } = await api.post(`mediaserver/exists_remote`, mediaDetail.value)
    existsEpisodes.value = result || {}
  } catch (error) {
    console.error(error)
  }
}

// 查询当前媒体是否已入库（数据库）
async function checkExists() {
  try {
    const result: { [key: string]: any } = await api.get('mediaserver/exists', {
      params: {
        tmdbid: mediaDetail.value.tmdb_id,
        title: mediaDetail.value.title,
        year: mediaDetail.value.year,
        season: mediaDetail.value.season,
        mtype: mediaDetail.value.type,
      },
    })

    if (result.success) existsItemId.value = result.data.item.id
  } catch (error) {
    console.error(error)
  }
}

// 查询当前媒体是否已订阅
async function checkSubscribe(season = 0) {
  try {
    const mediaid = getMediaId()

    const result: Subscribe = await api.get(`subscribe/media/${mediaid}`, {
      params: {
        season,
        title: mediaDetail.value.title,
      },
    })

    if (result.id) return true
  } catch (error) {
    console.error(error)
  }

  return false
}

// 检查所有季的缺失状态
async function checkSeasonsNotExists() {
  if (mediaDetail.value.type !== '电视剧') return
  try {
    const result: NotExistMediaInfo[] = await api.post('mediaserver/notexists', mediaDetail.value)
    if (result) {
      result.forEach(item => {
        // 0-已入库 1-部分缺失 2-全部缺失
        let state = 0
        if (item.episodes.length === 0) state = 2
        else if (item.episodes.length < item.total_episode) state = 1
        seasonsNotExisted.value[item.season] = state
      })
    }
  } catch (error) {
    console.error(error)
  }
}

// 检查电影订阅状态
async function checkMovieSubscribed() {
  if (mediaDetail.value.type !== '电影') return
  isSubscribed.value = await checkSubscribe()
}

// 过滤掉第0季
const getMediaSeasons = computed(() => {
  return mediaDetail.value?.season_info?.filter(season => season.season_number !== 0)
})

// 检查所有季的订阅状态
async function checkSeasonsSubscribed() {
  if (mediaDetail.value.type !== '电视剧') return
  try {
    mediaDetail.value?.season_info?.forEach(async item => {
      seasonsSubscribed.value[item.season_number ?? 0] = await checkSubscribe(item.season_number)
    })
  } catch (error) {
    console.error(error)
  }
}

// 调用API添加订阅，电视剧的话需要指定季
async function addSubscribe(season = 0) {
  // 开始处理
  startNProgress()
  try {
    // 是否洗版
    let best_version = existsItemId.value ? 1 : 0
    if (season)
      // 全部存在时洗版
      best_version = !seasonsNotExisted.value[season] ? 1 : 0
    // 请求API
    const result: { [key: string]: any } = await api.post('subscribe/', {
      name: mediaDetail.value?.title,
      type: mediaDetail.value?.type,
      year: mediaDetail.value?.year,
      tmdbid: mediaDetail.value?.tmdb_id,
      doubanid: mediaDetail.value?.douban_id,
      bangumiid: mediaDetail.value?.bangumi_id,
      season,
      best_version,
    })

    // 订阅状态
    if (result.success) {
      // 订阅成功
      isSubscribed.value = true
      if (season) seasonsSubscribed.value[season] = true
    }

    // 提示
    showSubscribeAddToast(result.success, mediaDetail.value?.title ?? '', season, result.message, best_version)

    // 显示编辑弹窗
    if (result.success) {
      const show_edit_dialog = await queryDefaultSubscribeConfig()
      if (show_edit_dialog) {
        subscribeId.value = result.data.id
        subscribeEditDialog.value = true
      }
    }
  } catch (error) {
    console.error(error)
  }
  doneNProgress()
}

// 弹出添加订阅提示
function showSubscribeAddToast(result: boolean, title: string, season: number, message: string, best_version: number) {
  if (season) title = `${title} ${formatSeason(season.toString())}`

  let subname = '订阅'
  if (best_version > 0) subname = '洗版订阅'

  if (!result) $toast.error(`${title} 添加${subname}失败：${message}！`)
}

// 调用API取消订阅
async function removeSubscribe(season: number) {
  // 开始处理
  startNProgress()
  try {
    const mediaid = getMediaId()

    const result: { [key: string]: any } = await api.delete(`subscribe/media/${mediaid}`, {
      params: {
        season,
      },
    })

    if (result.success) {
      isSubscribed.value = false
      if (season) seasonsSubscribed.value[season] = false
      $toast.success(`${mediaDetail.value?.title} 已取消订阅！`)
    } else {
      $toast.error(`${mediaDetail.value?.title} 取消订阅失败：${result.message}！`)
    }
  } catch (error) {
    console.error(error)
  }
  doneNProgress()
}

// 订阅按钮响应
function handleSubscribe(season = 0) {
  if (isSubscribed.value) removeSubscribe(season)
  else addSubscribe(season)
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

// 拼装Bangumi地址
function getBangumiLink() {
  return `https://bgm.tv/subject/${mediaDetail.value.bangumi_id}`
}

// 拼装集图片地址
function getEpisodeImage(stillPath: string) {
  if (!stillPath) return ''
  return `https://image.tmdb.org/t/p/w500${stillPath}`
}

// TMDB图片转换为w500大小
function getW500Image(url = '') {
  if (!url) return ''
  return url.replace('original', 'w500')
}

// 获取发行国家名称
const getProductionCountries = computed(() => {
  return mediaDetail.value.production_countries?.map(country => country.name)
})

// 获取发行公司名称
const getProductionCompanies = computed(() => {
  return mediaDetail.value.production_companies?.map(company => company.name)
})

// 计算存在状态的颜色
function getExistColor(season: number) {
  const state = seasonsNotExisted.value[season]
  if (!state) return 'success'

  if (state === 1) return 'warning'
  else if (state === 2) return 'error'
  else return 'success'
}

// 计算存在状态的文本
function getExistText(season: number) {
  const state = seasonsNotExisted.value[season]
  if (!state) return '已入库'

  if (state === 1) return '部分缺失'
  else if (state === 2) return '缺失'
  else return '已入库'
}

// 计算订阅图标
const getSubscribeIcon = computed(() => {
  if (isSubscribed.value) return 'mdi-heart'
  else return 'mdi-heart-outline'
})

// 计算订阅按钮颜色
const getSubscribeColor = computed(() => {
  if (isSubscribed.value) return 'error'
  else return 'warning'
})

// 使用、拼装数组为字符串
function joinArray(arr: string[]) {
  return arr.join('、')
}

// 开始搜索
function handleSearch(area: string) {
  const keyword = getMediaId()
  router.push({
    path: '/resource',
    query: {
      keyword,
      type: mediaDetail.value.type,
      area,
      season: mediaDetail.value.season,
    },
  })
}

// 跳转播放页面
async function handlePlay() {
  // 获取播放链接地址
  try {
    const result: { [key: string]: any } = await api.get(`mediaserver/play/${existsItemId.value}`)
    if (result?.success) {
      // 打开链接地址
      setTimeout(() => {
        window.open(result.data.url, '_blank')
      }, 100)
    } else {
      $toast.error(`获取播放链接失败：${result.message}！`)
    }
  } catch (error) {
    console.error(error)
  }
}

async function queryDefaultSubscribeConfig() {
  // 非管理员不显示
  if (!store.state.auth.superUser) return false
  try {
    let subscribe_config_url = ''
    if (mediaProps.type === '电影') subscribe_config_url = 'system/setting/DefaultMovieSubscribeConfig'
    else subscribe_config_url = 'system/setting/DefaultTvSubscribeConfig'

    const result: { [key: string]: any } = await api.get(subscribe_config_url)

    if (result.data?.value) return result.data.value.show_edit_dialog
  } catch (error) {
    console.log(error)
  }
  return false
}

onBeforeMount(() => {
  getMediaDetail()
})
</script>

<template>
  <LoadingBanner v-if="!isRefreshed" class="mt-12" />
  <div v-if="mediaDetail.tmdb_id || mediaDetail.douban_id || mediaDetail.bangumi_id" class="max-w-8xl mx-auto px-4">
    <template v-if="mediaDetail.backdrop_path || mediaDetail.poster_path">
      <div class="vue-media-back absolute left-0 top-0 w-full h-96">
        <VImg class="h-96" position="top" :src="mediaDetail.backdrop_path || mediaDetail.poster_path" cover />
      </div>
      <div class="vue-media-back absolute left-0 top-0 w-full h-96" />
    </template>
    <div class="media-page">
      <div class="media-header">
        <div class="media-poster">
          <VImg
            :src="getW500Image(mediaDetail.poster_path)"
            cover
            class="object-cover aspect-w-2 aspect-h-3 ring-1 ring-gray-500"
          >
            <template #placeholder>
              <div class="w-full h-full">
                <VSkeletonLoader class="object-cover aspect-w-2 aspect-h-3" />
              </div>
            </template>
          </VImg>
        </div>
        <div class="media-title">
          <div v-if="existsItemId" class="media-status">
            <span
              class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full whitespace-nowrap transition !no-underline bg-green-500 bg-opacity-80 border border-green-500 !text-green-100 hover:bg-green-500 hover:bg-opacity-100 false overflow-hidden"
            >
              <div class="relative z-20 flex items-center false"><span>已入库</span></div>
            </span>
          </div>
          <h1 class="d-flex flex-column flex-lg-row align-baseline justify-center justify-lg-start">
            <div class="align-self-center align-self-lg-end">
              {{ mediaDetail.title }}
            </div>
            <div v-if="mediaDetail.year" class="text-lg align-self-center align-self-lg-end">
              （{{ mediaDetail.year }}）
            </div>
          </h1>
          <span class="media-attributes">
            <span v-if="mediaDetail.runtime || mediaDetail.episode_run_time[0]"
              >{{ mediaDetail.runtime || mediaDetail.episode_run_time[0] }} 分钟</span
            >
            <span v-if="(mediaDetail.runtime || mediaDetail.episode_run_time[0]) && mediaDetail.genres" class="mx-1">
              |
            </span>
            <span v-if="mediaDetail.genres">{{ getGenresName(mediaDetail.genres || []) }}</span>
          </span>
        </div>
        <div class="media-actions">
          <VBtn
            v-if="(mediaDetail.tmdb_id || mediaDetail.douban_id || mediaDetail.bangumi_id) && mediaDetail.imdb_id"
            variant="tonal"
            color="info"
            class="mb-2"
          >
            <template #prepend>
              <VIcon icon="mdi-magnify" />
            </template>
            搜索资源
            <VMenu activator="parent" close-on-content-click>
              <VList>
                <VListItem variant="plain" @click="handleSearch('title')">
                  <VListItemTitle>标题</VListItemTitle>
                </VListItem>
                <VListItem v-show="mediaDetail.imdb_id" variant="plain" @click="handleSearch('imdbid')">
                  <VListItemTitle>IMDB链接</VListItemTitle>
                </VListItem>
              </VList>
            </VMenu>
          </VBtn>
          <VBtn
            v-if="(mediaDetail.tmdb_id || mediaDetail.douban_id || mediaDetail.bangumi_id) && !mediaDetail.imdb_id"
            variant="tonal"
            color="info"
            class="mb-2"
            @click="handleSearch('title')"
          >
            <template #prepend>
              <VIcon icon="mdi-magnify" />
            </template>
            搜索资源
          </VBtn>
          <VBtn
            v-if="mediaDetail.type === '电影' || mediaDetail.douban_id || mediaDetail.bangumi_id"
            class="ms-2 mb-2"
            :color="getSubscribeColor"
            variant="tonal"
            @click="handleSubscribe(0)"
          >
            <template #prepend>
              <VIcon :icon="getSubscribeIcon" />
            </template>
            {{ isSubscribed ? '已订阅' : '订阅' }}
          </VBtn>
          <VBtn v-if="existsItemId" class="ms-2 mb-2" variant="tonal" @click="handlePlay()">
            <template #prepend>
              <VIcon icon="mdi-play" />
            </template>
            在线播放
          </VBtn>
        </div>
      </div>
      <div class="media-overview">
        <div class="media-overview-left">
          <div v-if="mediaDetail.tagline" class="tagline">
            {{ mediaDetail.tagline }}
          </div>
          <h2 v-if="mediaDetail.overview">简介</h2>
          <p>{{ mediaDetail.overview }}</p>
          <ul v-if="mediaDetail.tmdb_id" class="media-crew">
            <li v-for="director in mediaDetail.directors" :key="director.id">
              <span>{{ director.job }}</span>
              <RouterLink :to="`/person?personid=${director.id}`" class="crew-name" target="_blank">
                {{ director.name }}
              </RouterLink>
            </li>
          </ul>
          <ul v-if="!mediaDetail.tmdb_id && mediaDetail.douban_id" class="media-crew">
            <li v-for="director in mediaDetail.directors" :key="director.id">
              <span>{{ joinArray(director.roles) }}</span>
              <a class="crew-name" :href="`${director.url}`" target="_blank">{{ director.name }}</a>
            </li>
          </ul>
          <div class="mt-6">
            <a
              v-if="mediaDetail.tmdb_id"
              class="mb-2 mr-2 inline-flex last:mr-0"
              :href="getTheMovieDbLink()"
              target="_blank"
            >
              <div
                class="inline-flex cursor-pointer items-center rounded-full bg-gray-600 px-2 py-1 text-sm text-gray-200 ring-1 ring-gray-500 transition hover:bg-gray-700"
              >
                <VIcon icon="mdi-link" />
                <span class="ms-1">TheMovieDb</span>
              </div>
            </a>
            <a
              v-if="mediaDetail.douban_id"
              class="mb-2 mr-2 inline-flex last:mr-0"
              :href="getDoubanLink()"
              target="_blank"
            >
              <div
                class="inline-flex cursor-pointer items-center rounded-full bg-gray-600 px-2 py-1 text-sm text-gray-200 ring-1 ring-gray-500 transition hover:bg-gray-700"
              >
                <VIcon icon="mdi-link" />
                <span class="ms-1">豆瓣</span>
              </div>
            </a>
            <a v-if="mediaDetail.imdb_id" class="mb-2 mr-2 inline-flex last:mr-0" :href="getImdbLink()" target="_blank">
              <div
                class="inline-flex cursor-pointer items-center rounded-full bg-gray-600 px-2 py-1 text-sm text-gray-200 ring-1 ring-gray-500 transition hover:bg-gray-700"
              >
                <VIcon icon="mdi-link" />
                <span class="ms-1">IMDb</span>
              </div>
            </a>
            <a v-if="mediaDetail.tvdb_id" class="mb-2 mr-2 inline-flex last:mr-0" :href="getTvdbLink()" target="_blank">
              <div
                class="inline-flex cursor-pointer items-center rounded-full bg-gray-600 px-2 py-1 text-sm text-gray-200 ring-1 ring-gray-500 transition hover:bg-gray-700"
              >
                <VIcon icon="mdi-link" />
                <span class="ms-1">TheTvDb</span>
              </div>
            </a>
            <a
              v-if="mediaDetail.bangumi_id"
              class="mb-2 mr-2 inline-flex last:mr-0"
              :href="getBangumiLink()"
              target="_blank"
            >
              <div
                class="inline-flex cursor-pointer items-center rounded-full bg-gray-600 px-2 py-1 text-sm text-gray-200 ring-1 ring-gray-500 transition hover:bg-gray-700"
              >
                <VIcon icon="mdi-link" />
                <span class="ms-1">Bangumi</span>
              </div>
            </a>
          </div>
          <h2 v-if="mediaDetail.type === '电视剧' && mediaDetail.tmdb_id" class="py-4">季</h2>
          <div v-if="mediaDetail.type === '电视剧' && mediaDetail.tmdb_id" class="flex w-full flex-col space-y-2">
            <VExpansionPanels>
              <VExpansionPanel
                v-for="season in getMediaSeasons"
                :key="season.season_number"
                @group:selected="loadSeasonEpisodes(season.season_number || 0)"
              >
                <VExpansionPanelTitle>
                  <template #default>
                    <div class="flex flex-row items-center justify-between">
                      <span class="font-weight-bold">第 {{ season.season_number }} 季</span>
                      <VChip size="small" class="ms-1"> {{ season.episode_count }}集 </VChip>
                      <div class="absolute right-12">
                        <VChip v-if="seasonsNotExisted" :color="getExistColor(season.season_number || 0)" flat>
                          {{ getExistText(season.season_number || 0) }}
                        </VChip>
                        <IconBtn
                          class="ms-1"
                          :color="seasonsSubscribed[season.season_number || 0] ? 'error' : 'warning'"
                          variant="text"
                          @click.stop="handleSubscribe(season.season_number)"
                        >
                          <VIcon
                            :icon="seasonsSubscribed[season.season_number || 0] ? 'mdi-heart' : 'mdi-heart-outline'"
                          />
                        </IconBtn>
                      </div>
                    </div>
                  </template>
                </VExpansionPanelTitle>
                <VExpansionPanelText>
                  <template #default>
                    <LoadingBanner v-if="!seasonEpisodesInfo[season.season_number || 0]" class="mt-3" />
                    <div class="flex flex-col justify-center divide-y divide-gray-700">
                      <div
                        v-for="episode in seasonEpisodesInfo[season.season_number || 0]"
                        :key="episode.episode_number"
                        class="flex flex-col space-y-4 py-4 xl:flex-row xl:space-y-4 xl:space-x-4"
                      >
                        <div class="flex-1">
                          <div class="flex flex-col space-y-2 lg:flex-row lg:items-center lg:space-y-0 lg:space-x-2">
                            <h3 class="text-lg">{{ episode.episode_number }} - {{ episode.name }}</h3>
                            <div class="flex items-center space-x-2">
                              <span
                                class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full whitespace-nowrap cursor-default bg-gray-700 !text-gray-300"
                              >
                                {{ episode.air_date }}
                              </span>
                            </div>
                            <VIcon
                              v-if="
                                existsEpisodes[season.season_number || 0] &&
                                existsEpisodes[season.season_number || 0].includes(episode.episode_number || 0)
                              "
                              color="success"
                              icon="mdi-check-circle"
                              class="ms-2"
                              size="small"
                            />
                          </div>
                          <p>{{ episode.overview }}</p>
                        </div>
                        <VImg
                          cover
                          class="rounded-lg"
                          max-width="15rem"
                          :src="getEpisodeImage(episode.still_path || '')"
                          alt=""
                        />
                      </div>
                    </div>
                  </template>
                </VExpansionPanelText>
              </VExpansionPanel>
            </VExpansionPanels>
          </div>
        </div>
        <div v-if="mediaDetail.tmdb_id" class="media-overview-right">
          <div class="media-facts">
            <div v-if="mediaDetail.vote_average" class="media-ratings">
              <VRating v-model="mediaDetail.vote_average" density="compact" length="10" class="ma-2" readonly />
            </div>
            <div v-if="mediaDetail.tmdb_id" class="media-fact">
              <span>ID</span>
              <span class="media-fact-value">{{ mediaDetail.tmdb_id }}</span>
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
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke-width="1.5"
                    stroke="currentColor"
                    aria-hidden="true"
                    class="h-4 w-4"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      d="M2.25 15a4.5 4.5 0 004.5 4.5H18a3.75 3.75 0 001.332-7.257 3 3 0 00-3.758-3.848 5.25 5.25 0 00-10.233 2.33A4.502 4.502 0 002.25 15z"
                    />
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
                <span
                  v-for="country in getProductionCountries"
                  :key="country"
                  class="flex items-center justify-end text-end"
                >
                  {{ country }}
                </span>
              </span>
            </div>
            <div class="media-fact border-b-0">
              <span>制作公司</span>
              <span class="media-fact-value text-end">
                <span v-for="company in getProductionCompanies" :key="company" class="block">{{ company }}</span>
              </span>
            </div>
          </div>
        </div>
        <div v-else-if="mediaDetail.douban_id" class="media-overview-right">
          <div class="media-facts">
            <div v-if="mediaDetail.vote_average" class="media-ratings">
              <VRating v-model="mediaDetail.vote_average" density="compact" length="10" class="ma-2" readonly />
            </div>
            <div v-if="mediaDetail.douban_id" class="media-fact">
              <span>豆瓣ID</span>
              <span class="media-fact-value">{{ mediaDetail.douban_id }}</span>
            </div>
            <div v-if="mediaDetail.original_title" class="media-fact">
              <span>原始标题</span>
              <span class="media-fact-value">{{ mediaDetail.original_title }}</span>
            </div>
            <div v-if="mediaDetail.release_date" class="media-fact">
              <span>上映日期</span>
              <span class="media-fact-value">
                {{ mediaDetail.release_date }}
              </span>
            </div>
            <div v-if="mediaDetail.production_countries" class="media-fact border-b-0">
              <span>出品国家</span>
              <span class="media-fact-value">
                <span
                  v-for="country in getProductionCountries"
                  :key="country"
                  class="flex items-center justify-end text-end"
                >
                  {{ country }}
                </span>
              </span>
            </div>
          </div>
        </div>
        <div v-else-if="mediaDetail.bangumi_id" class="media-overview-right">
          <div class="media-facts">
            <div v-if="mediaDetail.vote_average" class="media-ratings">
              <VRating v-model="mediaDetail.vote_average" density="compact" length="10" class="ma-2" readonly />
            </div>
            <div v-if="mediaDetail.bangumi_id" class="media-fact">
              <span>ID</span>
              <span class="media-fact-value">{{ mediaDetail.bangumi_id }}</span>
            </div>
            <div v-if="mediaDetail.original_title" class="media-fact">
              <span>原始标题</span>
              <span class="media-fact-value">{{ mediaDetail.original_title }}</span>
            </div>
            <div v-if="mediaDetail.release_date" class="media-fact border-b-0">
              <span>上映日期</span>
              <span class="media-fact-value">
                {{ mediaDetail.release_date }}
              </span>
            </div>
          </div>
        </div>
      </div>
      <div v-if="mediaDetail.tmdb_id">
        <PersonCardSlideView
          :apipath="`tmdb/credits/${mediaDetail.tmdb_id}/${mediaProps.type}`"
          :linkurl="`/credits/tmdb/credits/${mediaDetail.tmdb_id}/${mediaProps.type}?title=演员阵容&type=tmdb`"
          title="演员阵容"
          type="tmdb"
        />
      </div>
      <div v-else-if="mediaDetail.douban_id">
        <PersonCardSlideView
          :apipath="`douban/credits/${mediaDetail.douban_id}/${mediaProps.type}`"
          :linkurl="`/credits/douban/credits/${mediaDetail.douban_id}/${mediaProps.type}?title=演员阵容&type=douban`"
          title="演员阵容"
          type="douban"
        />
      </div>
      <div v-else-if="mediaDetail.bangumi_id">
        <PersonCardSlideView
          :apipath="`bangumi/credits/${mediaDetail.bangumi_id}`"
          :linkurl="`/credits/bangumi/credits/${mediaDetail.bangumi_id}?title=演员阵容&type=bangumi`"
          title="演员阵容"
          type="bangumi"
        />
      </div>
      <div v-if="mediaDetail.tmdb_id">
        <MediaCardSlideView
          :apipath="`tmdb/recommend/${mediaDetail.tmdb_id}/${mediaProps.type}`"
          :linkurl="`/browse/tmdb/recommend/${mediaDetail.tmdb_id}/${mediaProps.type}?title=推荐`"
          title="推荐"
        />
      </div>
      <div v-else-if="mediaDetail.douban_id">
        <MediaCardSlideView
          :apipath="`douban/recommend/${mediaDetail.douban_id}/${mediaProps.type}`"
          :linkurl="`/browse/douban/recommend/${mediaDetail.douban_id}/${mediaProps.type}?title=推荐`"
          title="推荐"
        />
      </div>
      <div v-else-if="mediaDetail.bangumi_id">
        <MediaCardSlideView
          :apipath="`bangumi/recommend/${mediaDetail.bangumi_id}`"
          :linkurl="`/browse/bangumi/recommend/${mediaDetail.bangumi_id}?title=推荐`"
          title="推荐"
        />
      </div>
      <div v-if="mediaDetail.tmdb_id">
        <MediaCardSlideView
          :apipath="`tmdb/similar/${mediaDetail.tmdb_id}/${mediaProps.type}`"
          :linkurl="`/browse/tmdb/similar/${mediaDetail.tmdb_id}/${mediaProps.type}?title=类似`"
          title="类似"
        />
      </div>
    </div>
  </div>
  <NoDataFound
    v-if="!mediaDetail.tmdb_id && !mediaDetail.douban_id && !mediaDetail.bangumi_id && isRefreshed"
    error-code="500"
    error-title="出错啦！"
    error-description="未识别到媒体信息。"
  />
  <!-- 订阅编辑弹窗 -->
  <SubscribeEditDialog
    v-if="subscribeEditDialog"
    v-model="subscribeEditDialog"
    :subid="subscribeId"
    @close="subscribeEditDialog = false"
    @save="subscribeEditDialog = false"
    @remove="
      () => {
        subscribeEditDialog = false
        if (mediaDetail.type === '电影') checkMovieSubscribed()
        else checkSeasonsSubscribed()
      }
    "
  />
</template>

<style lang="scss">
.vue-media-back {
  background-image: linear-gradient(
      180deg,
      rgba(var(--v-theme-background), 0) 50%,
      rgba(var(--v-theme-background), 1) 100%
    ),
    linear-gradient(90deg, rgba(var(--v-theme-background), 0) 50%, rgba(var(--v-theme-background), 1) 100%),
    linear-gradient(270deg, rgba(var(--v-theme-background), 0) 50%, rgba(var(--v-theme-background), 1) 100%);
  box-shadow: 0 0 0 2px rgb(var(--v-theme-background));
  margin-block-start: calc(-70px - env(safe-area-inset-top));
}

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

@media (width >= 1280px) {
  .media-header {
    flex-direction: row;
    align-items: flex-end;
  }
}

.media-overview {
  display: flex;
  flex-direction: column;
  padding-block: 2rem 1rem;
}

@media (width >= 1024px) {
  .media-overview {
    flex-direction: row;
  }
}

.media-poster {
  overflow: hidden;
  border-radius: 0.25rem;
  box-shadow: var(--tw-ring-offset-shadow, 0 0 #0000), var(--tw-ring-shadow, 0 0 #0000), var(--tw-shadow);
  inline-size: 8rem;

  --tw-shadow: 0 1px 3px 0 rgba(0, 0, 0, 10%), 0 1px 2px -1px rgba(0, 0, 0, 10%);
  --tw-shadow-colored: 0 1px 3px 0 var(--tw-shadow-color), 0 1px 2px -1px var(--tw-shadow-color);
}

@media (width >= 1280px) {
  .media-poster {
    inline-size: 13rem;
    margin-inline-end: 1rem;
  }
}

@media (width >= 768px) {
  .media-poster {
    border-radius: 0.5rem;
    box-shadow: var(--tw-ring-offset-shadow, 0 0 #0000), var(--tw-ring-shadow, 0 0 #0000), var(--tw-shadow);
    inline-size: 11rem;

    --tw-shadow: 0 25px 50px -12px rgba(0, 0, 0, 25%);
    --tw-shadow-colored: 0 25px 50px -12px var(--tw-shadow-color);
  }
}

.media-title {
  display: flex;
  flex: 1 1 0%;
  flex-direction: column;
  margin-block-start: 1rem;
  text-align: center;
}

@media (width >= 1280px) {
  .media-title {
    margin-block-start: 0;
    margin-inline-end: 1rem;
    text-align: start;
  }
}

.media-title > h1 {
  font-size: 1.5rem;
  font-weight: 700;
  line-height: 2rem;
}

@media (width >= 1280px) {
  .media-title > h1 {
    font-size: 2.25rem;
    line-height: 2.5rem;
  }
}

ul.media-crew {
  display: grid;
  gap: 1.5rem;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  margin-block-start: 1.5rem;
}

@media (width >= 640px) {
  ul.media-crew {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

ul.media-crew > li {
  display: flex;
  flex-direction: column;
  font-weight: 700;
  grid-column: span 1 / span 1;
}

a.crew-name {
  font-weight: 400;
}

.media-status {
  margin-block-end: 0.5rem;
}

.media-attributes {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  margin-block-start: 0.25rem;
}

@media (width >= 1280px) {
  .media-attributes {
    justify-content: flex-start;
    font-size: 1rem;
    line-height: 1.5rem;
    margin-block-start: 0;
  }
}

@media (width >= 640px) {
  .media-attributes {
    font-size: 0.875rem;
    line-height: 1.25rem;
  }
}

.media-actions {
  position: relative;
  display: flex;
  flex-shrink: 0;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  margin-block-start: 1rem;
}

@media (width >= 1280px) {
  .media-actions {
    margin-block-start: 0;
  }
}

@media (width >= 640px) {
  .media-actions {
    flex-wrap: nowrap;
    justify-content: flex-end;
  }
}

.media-overview-left {
  flex: 1 1 0%;
}

@media (width >= 1024px) {
  .media-overview-left {
    margin-inline-end: 2rem;
  }
}

.media-overview-right {
  inline-size: 100%;
  margin-block-start: 2rem;
}

@media (width >= 1024px) {
  .media-overview-right {
    inline-size: 20rem;
    margin-block-start: 0;
  }
}

.media-facts {
  border-width: 1px;
  border-color: rgb(55 65 81 / var(--tw-border-opacity));
  border-radius: 0.5rem;
  font-size: 0.875rem;
  font-weight: 700;
  line-height: 1.25rem;

  --tw-border-opacity: 1;
  --tw-bg-opacity: 1;
  --tw-text-opacity: 1;
}

.media-ratings {
  display: flex;
  align-items: center;
  justify-content: center;
  border-color: rgb(55 65 81 / var(--tw-border-opacity));
  border-block-end-width: 1px;
  font-weight: 500;
  padding-block: 0.5rem;
  padding-inline: 1rem;

  --tw-border-opacity: 1;
}

.media-fact {
  display: flex;
  justify-content: space-between;
  border-color: rgb(55 65 81 / var(--tw-border-opacity));
  border-block-end-width: 1px;
  padding-block: 0.5rem;
  padding-inline: 1rem;

  --tw-border-opacity: 1;
}

.media-overview h2 {
  font-size: 1.25rem;
  font-weight: 700;
  line-height: 1.75rem;
}

@media (width >= 640px) {
  .media-overview h2 {
    font-size: 1.5rem;
    line-height: 2rem;
  }
}

.tagline {
  font-size: 1.25rem;
  font-style: italic;
  line-height: 1.75rem;
  margin-block-end: 1rem;
}

@media (width >= 1024px) {
  .tagline {
    font-size: 1.5rem;
    line-height: 2rem;
  }
}
</style>
