<script setup lang="ts">
import { useToast } from 'vue-toastification'
import PersonCardSlideView from './PersonCardSlideView.vue'
import MediaCardSlideView from './MediaCardSlideView.vue'
import api from '@/api'
import type { MediaInfo, MediaRelease, MediaSeason, NotExistMediaInfo, Site, Subscribe, TmdbEpisode } from '@/api/types'
import NoDataFound from '@/components/states/NoDataFound.vue'
import { formatSeasonLabel } from '@/@core/utils/season'
import router from '@/router'
import { isNullOrEmptyObject } from '@/@core/utils'
import { useUserStore } from '@/stores'
import { useTheme } from 'vuetify'
import { useI18n } from 'vue-i18n'
import { buildUserPermissionContext, hasPermission } from '@/utils/permission'
import { useGlobalSettingsStore } from '@/stores'
import { openMediaServerItem, openDoubanApp } from '@/utils/appDeepLink'
import { openSharedDialog } from '@/composables/useSharedDialog'
import { getDisplayImageUrl } from '@/utils/imageUtils'
import {
  getMediaSubscribeId,
  getSubscribeMode,
  useMediaSubscribe,
  type SeasonSubscribeModes,
} from '@/composables/useMediaSubscribe'

const SearchSiteDialog = defineAsyncComponent(() => import('@/components/dialog/SearchSiteDialog.vue'))

// 国际化
const { t } = useI18n()

const $toast = useToast()

// 输入参数
const mediaProps = defineProps({
  mediaid: String,
  title: String,
  year: String,
  type: String,
})

// 从 provide 中获取全局设置
// 全局设置
const globalSettingsStore = useGlobalSettingsStore()
const globalSettings = globalSettingsStore.globalSettings

// 用户 Store
const userStore = useUserStore()
const userPermissions = computed(() => buildUserPermissionContext(userStore.superUser, userStore.permissions))
const canSearch = computed(() => hasPermission(userPermissions.value, 'search'))
const canSubscribe = computed(() => hasPermission(userPermissions.value, 'subscribe'))

// 获取主题信息
const theme = useTheme()

// 媒体详情
const mediaDetail = ref<MediaInfo>({} as MediaInfo)

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

// 各季的订阅模式
const subscribedSeasonModes = ref<SeasonSubscribeModes>({})

// 所有站点
const allSites = ref<Site[]>([])

// 选中的站点
const selectedSites = ref<number[]>([])

// 搜索方式 title/imdbid
const searchType = ref('title')

interface MediaSearchOptions {
  season?: number | null
  episode?: number | null
}

interface EpisodeGroupInfo {
  id: string
  name: string
  group_count: number
  episode_count: number
}

interface EpisodeGroupOption extends EpisodeGroupInfo {
  icon: string
}

// 站点选择后待执行的搜索类型
const pendingSearchResultType = ref<'torrent' | 'subtitle'>('torrent')

// 站点选择后待执行的季集参数
const pendingSearchOptions = ref<MediaSearchOptions>({})

// 可用剧集组
const episodeGroups = ref<EpisodeGroupInfo[]>([])

// 当前选中的剧集组，空字符串表示 TMDB 默认排序
const selectedEpisodeGroup = ref('')

// 当前自定义剧集组的季信息
const episodeGroupSeasons = ref<MediaSeason[]>([])

// 剧集组列表加载状态
const episodeGroupsLoading = ref(false)

// 自定义剧集组季信息加载状态
const episodeGroupSeasonsLoading = ref(false)

// 剧集组横向轨道
const episodeGroupRail = ref<HTMLElement | null>(null)

// 剧集组轨道左右滚动状态
const canScrollEpisodeGroupsBackward = ref(false)
const canScrollEpisodeGroupsForward = ref(false)

// 防止快速切换剧集组时旧请求覆盖新结果
let episodeGroupSeasonRequestId = 0
let seasonNotExistsRequestId = 0
let episodeExistsRequestId = 0

// 计算主题是否为透明
const isTransparentTheme = computed(() => {
  return theme.name.value === 'transparent'
})

// 打开站点选择弹窗，并把站点选择结果交回详情页执行搜索。
function openSearchSiteDialog() {
  openSharedDialog(
    SearchSiteDialog,
    {
      sites: allSites.value,
      selected: selectedSites.value,
    },
    {
      search: searchSites,
    },
    { closeOn: ['close', 'search'] },
  )
}

// 查询所有站点
async function querySites() {
  try {
    const data: Site[] = await api.get('site/')

    // 过滤站点，只有启用的站点才显示
    allSites.value = data.filter(item => item.is_active)
  } catch (error) {
    console.log(error)
  }
}

// 查询用户选中的站点
async function querySelectedSites() {
  try {
    const result: { [key: string]: any } = await api.get('system/setting/public/IndexerSites')

    selectedSites.value = result.data?.value ?? []
  } catch (error) {
    console.log(error)
  }
}

// 获得mediaid
function getMediaId() {
  return getMediaSubscribeId(mediaDetail.value)
}

// 生成当前媒体指定季的订阅状态缓存键
function getSubscribeStatusKey(season: number | null = mediaDetail.value?.season ?? null) {
  return `${getMediaId()}::${season ?? 'all'}`
}

// 调用API查询详情
async function getMediaDetail() {
  if (mediaProps.mediaid && mediaProps.type) {
    mediaDetail.value = await api.get(`media/${mediaProps.mediaid}`, {
      params: {
        title: mediaProps.title,
        year: mediaProps.year,
        type_name: mediaProps.type,
      },
    })
    isRefreshed.value = true
    if (!mediaDetail.value.tmdb_id && !mediaDetail.value.douban_id && !mediaDetail.value.bangumi_id) return

    selectedEpisodeGroup.value = mediaDetail.value.episode_group || ''
    if (mediaDetail.value.type === '电视剧' && mediaDetail.value.tmdb_id) {
      getEpisodeGroups()
      if (selectedEpisodeGroup.value) loadEpisodeGroupSeasons(selectedEpisodeGroup.value)
    }

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
    const params = selectedEpisodeGroup.value ? { episode_group: selectedEpisodeGroup.value } : undefined
    const result: TmdbEpisode[] = await api.get(`tmdb/${mediaDetail.value.tmdb_id}/${season}`, params ? { params } : undefined)
    seasonEpisodesInfo.value[season] = result || []
  } catch (error) {
    console.error(error)
  }
}

// 调用API加载季集存在信息（媒体服务器）
async function loadEpisodeExists() {
  // 查询季集存在状态
  if (!isNullOrEmptyObject(existsEpisodes.value)) return
  const requestId = ++episodeExistsRequestId
  try {
    const media = {
      ...mediaDetail.value,
      episode_group: selectedEpisodeGroup.value || '',
    }
    const result: { [key: number]: number[] } = await api.post(`mediaserver/exists_remote`, media)
    if (requestId === episodeExistsRequestId) existsEpisodes.value = result || {}
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
async function checkSubscribe(season: number | null = null) {
  try {
    return await subscribeActions.checkSubscribe(season)
  } catch (error) {
    console.error(error)
  }

  return false
}

// 判断订阅记录是否属于当前媒体
function isSameSubscribeMedia(subscribe: Subscribe) {
  if (mediaDetail.value?.tmdb_id && subscribe.tmdbid) return mediaDetail.value.tmdb_id === subscribe.tmdbid
  if (mediaDetail.value?.douban_id && subscribe.doubanid) return mediaDetail.value.douban_id === subscribe.doubanid
  if (mediaDetail.value?.bangumi_id && subscribe.bangumiid) return mediaDetail.value.bangumi_id === subscribe.bangumiid

  const mediaId = mediaDetail.value?.media_id
    ? `${mediaDetail.value.mediaid_prefix}:${mediaDetail.value.media_id}`
    : ''
  return Boolean(mediaId && subscribe.mediaid === mediaId)
}

// 检查所有季的缺失状态
async function checkSeasonsNotExists() {
  if (mediaDetail.value.type !== '电视剧') return
  const requestId = ++seasonNotExistsRequestId
  seasonsNotExisted.value = {}
  try {
    const media = {
      ...mediaDetail.value,
      episode_group: selectedEpisodeGroup.value || '',
    }
    const result: NotExistMediaInfo[] = await api.post('mediaserver/notexists', media)
    if (requestId === seasonNotExistsRequestId && result) {
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

// 默认排序的总集数
const defaultEpisodeCount = computed(() =>
  (mediaDetail.value?.season_info ?? []).reduce((total, season) => total + (season.episode_count ?? 0), 0),
)

// 剧集组选项，首项固定为 TMDB 默认排序
const episodeGroupOptions = computed<EpisodeGroupOption[]>(() => [
  {
    id: '',
    name: t('media.episodeGroups.default'),
    group_count: mediaDetail.value?.season_info?.length ?? 0,
    episode_count: defaultEpisodeCount.value,
    icon: 'mdi-layers-outline',
  },
  ...episodeGroups.value.map(group => ({
    ...group,
    icon: 'mdi-folder-play-outline',
  })),
])

// 当前选中的剧集组选项
const selectedEpisodeGroupOption = computed(
  () => episodeGroupOptions.value.find(group => group.id === selectedEpisodeGroup.value) ?? episodeGroupOptions.value[0]!,
)

// 季列表，第0季排在最后
const getMediaSeasons = computed(() => {
  const seasons = selectedEpisodeGroup.value ? episodeGroupSeasons.value : mediaDetail.value?.season_info
  if (!seasons) return []
  return [...seasons].sort((a, b) => {
    if (a.season_number === 0) return 1
    if (b.season_number === 0) return -1
    return (a.season_number || 0) - (b.season_number || 0)
  })
})

// 查询当前媒体可用的剧集组
async function getEpisodeGroups() {
  if (!mediaDetail.value.tmdb_id) return

  episodeGroupsLoading.value = true
  try {
    const result: EpisodeGroupInfo[] = await api.get(`media/groups/${mediaDetail.value.tmdb_id}`)
    episodeGroups.value = result || []
  } catch (error) {
    console.error(error)
    episodeGroups.value = []
  } finally {
    episodeGroupsLoading.value = false
    nextTick(updateEpisodeGroupScrollState)
  }
}

// 查询指定剧集组的季信息，并忽略过期响应
async function loadEpisodeGroupSeasons(groupId: string) {
  if (!groupId) {
    episodeGroupSeasons.value = []
    episodeGroupSeasonsLoading.value = false
    return
  }

  const requestId = ++episodeGroupSeasonRequestId
  episodeGroupSeasonsLoading.value = true
  try {
    const result: MediaSeason[] = await api.get(`media/group/seasons/${groupId}`)
    if (requestId === episodeGroupSeasonRequestId) episodeGroupSeasons.value = result || []
  } catch (error) {
    console.error(error)
    if (requestId === episodeGroupSeasonRequestId) episodeGroupSeasons.value = []
  } finally {
    if (requestId === episodeGroupSeasonRequestId) episodeGroupSeasonsLoading.value = false
  }
}

// 切换详情页当前浏览的剧集组
async function setEpisodeGroup(groupId: string) {
  if (selectedEpisodeGroup.value === groupId) return

  selectedEpisodeGroup.value = groupId
  seasonEpisodesInfo.value = {}
  existsEpisodes.value = {}
  episodeGroupSeasons.value = []
  episodeGroupSeasonRequestId += 1
  episodeExistsRequestId += 1

  await Promise.all([loadEpisodeGroupSeasons(groupId), checkSeasonsNotExists()])
}

// 刷新剧集组横向轨道的左右滚动按钮状态
function updateEpisodeGroupScrollState() {
  const rail = episodeGroupRail.value
  if (!rail) {
    canScrollEpisodeGroupsBackward.value = false
    canScrollEpisodeGroupsForward.value = false
    return
  }

  const maxScrollLeft = Math.max(rail.scrollWidth - rail.clientWidth, 0)
  canScrollEpisodeGroupsBackward.value = rail.scrollLeft > 4
  canScrollEpisodeGroupsForward.value = rail.scrollLeft < maxScrollLeft - 4
}

// 按一屏内可辨识的距离横向滚动剧集组轨道
function scrollEpisodeGroups(direction: 'backward' | 'forward') {
  const rail = episodeGroupRail.value
  if (!rail) return

  rail.scrollBy({
    behavior: 'smooth',
    left: direction === 'backward' ? -Math.max(rail.clientWidth * 0.72, 240) : Math.max(rail.clientWidth * 0.72, 240),
  })
}

// 检查所有季的订阅状态
async function checkSeasonsSubscribed() {
  if (mediaDetail.value.type !== '电视剧') return
  try {
    const subscribes: Subscribe[] = await api.get('subscribe/')
    const mediaSubscribes = subscribes.filter(
      item => item.type === '电视剧' && item.season !== undefined && isSameSubscribeMedia(item),
    )
    const nextSubscribed: { [key: number]: boolean } = {}
    const nextModes: SeasonSubscribeModes = {}

    mediaDetail.value?.season_info?.forEach(item => {
      const season = item.season_number ?? 0
      nextSubscribed[season] = false
    })

    mediaSubscribes.forEach(item => {
      const season = item.season as number
      nextSubscribed[season] = true
      nextModes[season] = getSubscribeMode(item)
    })

    seasonsSubscribed.value = nextSubscribed
    subscribedSeasonModes.value = nextModes
  } catch (error) {
    console.error(error)
  }
}

// 已订阅季号列表
const subscribedSeasonNumbers = computed(() =>
  Object.entries(seasonsSubscribed.value)
    .filter(([, subscribed]) => subscribed)
    .map(([season]) => Number(season))
    .sort((a, b) => a - b),
)

// 默认季结构中的可订阅季总数
const subscribeSeasonTotal = computed(() => mediaDetail.value?.season_info?.length ?? 0)

// 当前媒体是否已订阅默认季结构中的全部季
const isAllSeasonsSubscribed = computed(
  () =>
    mediaDetail.value.type === '电视剧' &&
    subscribeSeasonTotal.value > 0 &&
    subscribedSeasonNumbers.value.length >= subscribeSeasonTotal.value,
)

// 订阅按钮响应；单季入口同时传递详情页当前选择的剧集组。
function handleSubscribe(season: number | null = null, episodeGroup = '') {
  subscribeActions.handleSubscribe(season, episodeGroup)
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

// 处理豆瓣链接点击
async function handleDoubanClick() {
  if (mediaDetail.value.douban_id) {
    await openDoubanApp(
      mediaDetail.value.douban_id,
      mediaDetail.value.type,
      mediaDetail.value.title,
      mediaDetail.value.year,
    )
  }
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
  return `https://${globalSettings.TMDB_IMAGE_DOMAIN}/t/p/w500${stillPath}`
}

// TMDB图片转换为w500大小
function getW500Image(url = '') {
  if (!url) return ''
  url = url.replace('original', 'w500')
  return getDisplayImageUrl(url, globalSettings.GLOBAL_IMAGE_CACHE)
}

// 计算Poster地址
const getPosterUrl: Ref<string> = computed(() => {
  const url = mediaDetail.value.poster_path ?? ''
  return getDisplayImageUrl(url, globalSettings.GLOBAL_IMAGE_CACHE)
})

// 计算backdrop地址
const getBackdropUrl: Ref<string> = computed(() => {
  const url = mediaDetail.value.backdrop_path ?? ''
  return getDisplayImageUrl(url, globalSettings.GLOBAL_IMAGE_CACHE)
})

// 获取发行国家名称
const getProductionCountries = computed(() => {
  return mediaDetail.value.production_countries?.map(country => country.name)
})

// 获取发行公司名称
const getProductionCompanies = computed(() => {
  return mediaDetail.value.production_companies?.map(company => company.name)
})

// 获取指定类型的最早发行日期
function getEarliestReleaseDateByType(type: number): MediaRelease | null {
  const filteredDates = mediaDetail.value.release_dates?.filter(date => date.type === type)
  if (!filteredDates || filteredDates.length === 0)
    return null

  return filteredDates.reduce((earliest, current) =>
    new Date(current.date) < new Date(earliest.date) ? current : earliest,
  )
}

// 获取最早数字发行日期
const getEarliestDigitalReleaseDate = computed(() => getEarliestReleaseDateByType(4))

// 获取最早实体发行日期
const getEarliestPhysicalReleaseDate = computed(() => getEarliestReleaseDateByType(5))

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
  if (!state) return t('media.status.inLibrary')

  if (state === 1) return t('media.status.partiallyMissing')
  else if (state === 2) return t('media.status.missing')
  else return t('media.status.inLibrary')
}

// 判断指定季集是否已存在于媒体服务器
function isEpisodeExists(season: number, episode: number) {
  return existsEpisodes.value[season]?.includes(episode) ?? false
}

// 计算订阅图标
const getSubscribeIcon = computed(() => {
  if (mediaDetail.value.type === '电视剧') return subscribedSeasonNumbers.value.length > 0 ? 'mdi-heart' : 'mdi-heart-outline'
  if (isSubscribed.value) return 'mdi-heart'
  else return 'mdi-heart-outline'
})

// 计算订阅按钮颜色
const getSubscribeColor = computed(() => {
  if (mediaDetail.value.type === '电视剧') {
    if (isAllSeasonsSubscribed.value) return 'error'
    if (subscribedSeasonNumbers.value.length > 0) return 'warning'
    return 'warning'
  }
  if (isSubscribed.value) return 'error'
  else return 'warning'
})

// 计算订阅按钮文案
const getSubscribeText = computed(() => {
  if (mediaDetail.value.type === '电视剧') {
    if (isAllSeasonsSubscribed.value) return t('media.status.allSeasonsSubscribed')
    if (subscribedSeasonNumbers.value.length > 0) {
      return t('media.status.seasonsSubscribed', { count: subscribedSeasonNumbers.value.length })
    }
    return t('media.actions.subscribe')
  }
  return isSubscribed.value ? t('media.status.subscribed') : t('media.actions.subscribe')
})

// 使用、拼装数组为字符串
function joinArray(arr: string[]) {
  return arr.join('、')
}

// 开始搜索
function handleSearch(resultType: 'torrent' | 'subtitle' = 'torrent', options: MediaSearchOptions = {}) {
  const keyword = getMediaId()
  const season = options.season ?? mediaDetail.value.season
  const episode = options.episode ?? null
  router.push({
    path: '/resource',
    query: {
      keyword,
      type: mediaDetail.value.type,
      area: searchType.value,
      title: mediaDetail.value.title,
      year: mediaDetail.value.year,
      season,
      episode,
      sites: selectedSites.value.join(','),
      result_type: resultType,
    },
  })
}

// 跳转播放页面
async function handlePlay() {
  // 获取播放链接地址
  try {
    const result: { [key: string]: any } = await api.get(`mediaserver/play/${existsItemId.value}`)
    if (result?.success) {
      // 使用深度链接工具，优先跳转到APP，失败后跳转到网页
      await openMediaServerItem({
        link: result.data.url,
        item_id: result.data.item_id,
        server_id: result.data.server_id,
        server_type: result.data.server_type,
      })
    } else {
      $toast.error(`获取播放链接失败：${result.message}！`)
    }
  } catch (error) {
    console.error(error)
  }
}

// 删除订阅处理
function onSubscribeEditRemove() {
  if (mediaDetail.value.type === '电影') checkMovieSubscribed()
  else checkSeasonsSubscribed()
}

const subscribeActions = useMediaSubscribe({
  media: () => mediaDetail.value,
  canSubscribe: () => canSubscribe.value,
  isSubscribed,
  isExists: () => Boolean(existsItemId.value),
  seasonsSubscribed,
  subscribedSeasons: subscribedSeasonNumbers,
  subscribedSeasonModes,
  primarySeason: () => mediaDetail.value?.season ?? null,
  getSubscribeStatusKey,
  onEditRemove: onSubscribeEditRemove,
})

// 搜索前弹出站点选择框，确认后执行资源或字幕搜索。
async function clickSearch(type: string, resultType: 'torrent' | 'subtitle' = 'torrent', options: MediaSearchOptions = {}) {
  searchType.value = type
  pendingSearchResultType.value = resultType
  pendingSearchOptions.value = options
  if (allSites.value?.length == 0) {
    await querySites()
    await querySelectedSites()
  }
  if (allSites.value?.length > 0) {
    openSearchSiteDialog()
  } else {
    handleSearch(pendingSearchResultType.value, pendingSearchOptions.value)
  }
}

// 搜索多站点
function searchSites(sites: number[]) {
  selectedSites.value = sites
  handleSearch(pendingSearchResultType.value, pendingSearchOptions.value)
}

// 搜索字幕
async function handleSubtitleSearch() {
  await clickSearch('title', 'subtitle')
}

onBeforeMount(() => {
  getMediaDetail()
})

onMounted(() => {
  window.addEventListener('resize', updateEpisodeGroupScrollState)
})

onUnmounted(() => {
  window.removeEventListener('resize', updateEpisodeGroupScrollState)
})
</script>

<template>
  <LoadingBanner v-if="!isRefreshed" class="mt-12" />
  <div
    v-if="mediaDetail.tmdb_id || mediaDetail.douban_id || mediaDetail.bangumi_id"
    class="max-w-8xl mx-auto px-4"
    :class="{ 'media-detail-transparent': isTransparentTheme }"
  >
    <template v-if="getBackdropUrl || getPosterUrl">
      <div class="vue-media-back vue-media-back-image absolute left-0 top-0 w-full h-96">
        <VImg class="h-96" position="top" :src="getBackdropUrl || getPosterUrl" cover />
      </div>
      <div class="vue-media-back vue-media-back-overlay absolute left-0 top-0 w-full h-96" />
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
              <div class="relative z-20 flex items-center false">
                <span>{{ t('media.status.inLibrary') }}</span>
              </div>
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
              >{{ mediaDetail.runtime || mediaDetail.episode_run_time[0] }} {{ t('media.minutes') }}</span
            >
            <span v-if="(mediaDetail.runtime || mediaDetail.episode_run_time[0]) && mediaDetail.genres" class="mx-1">
              |
            </span>
            <span v-if="mediaDetail.genres">{{ getGenresName(mediaDetail.genres || []) }}</span>
          </span>
        </div>
        <div class="media-actions">
          <VBtn
            v-if="
              (mediaDetail.tmdb_id || mediaDetail.douban_id || mediaDetail.bangumi_id) &&
              canSearch
            "
            variant="tonal"
            color="primary"
            class="media-action-button"
          >
            <template #prepend>
              <VIcon icon="mdi-magnify" />
            </template>
            {{ t('media.actions.searchResource') }}
            <VMenu activator="parent" close-on-content-click>
              <VList>
                <VListItem @click="clickSearch('title')">
                  <VListItemTitle>{{ t('media.search.byTitle') }}</VListItemTitle>
                </VListItem>
                <VListItem @click="clickSearch('imdbid')">
                  <VListItemTitle>{{ t('media.search.byImdb') }}</VListItemTitle>
                </VListItem>
              </VList>
            </VMenu>
          </VBtn>
          <VBtn
            v-if="
              (mediaDetail.tmdb_id || mediaDetail.douban_id || mediaDetail.bangumi_id) &&
              canSearch
            "
            variant="tonal"
            color="info"
            class="media-action-button"
            @click="handleSubtitleSearch"
          >
            <template #prepend>
              <VIcon icon="mdi-subtitles-outline" />
            </template>
            {{ t('media.actions.searchSubtitle') }}
          </VBtn>
          <VBtn
            v-if="canSubscribe && (mediaDetail.type === '电影' || mediaDetail.tmdb_id || mediaDetail.douban_id || mediaDetail.bangumi_id)"
            class="media-action-button"
            :color="getSubscribeColor"
            variant="tonal"
            @click="handleSubscribe()"
          >
            <template #prepend>
              <VIcon :icon="getSubscribeIcon" />
            </template>
            {{ getSubscribeText }}
          </VBtn>
          <VBtn v-if="existsItemId" class="media-action-button" variant="tonal" @click="handlePlay()" color="success">
            <template #prepend>
              <VIcon icon="mdi-play" />
            </template>
            {{ t('media.actions.playOnline') }}
          </VBtn>
        </div>
      </div>
      <div class="media-overview">
        <div class="media-overview-left">
          <div v-if="mediaDetail.tagline" class="tagline">
            {{ mediaDetail.tagline }}
          </div>
          <h2 v-if="mediaDetail.overview">{{ t('media.overview') }}</h2>
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
            <div v-if="mediaDetail.douban_id" class="mb-2 mr-2 inline-flex last:mr-0" @click="handleDoubanClick">
              <div
                class="inline-flex cursor-pointer items-center rounded-full bg-gray-600 px-2 py-1 text-sm text-gray-200 ring-1 ring-gray-500 transition hover:bg-gray-700"
              >
                <VIcon icon="mdi-link" />
                <span class="ms-1">豆瓣</span>
              </div>
            </div>
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
          <h2 v-if="mediaDetail.type === '电视剧' && mediaDetail.tmdb_id" class="py-4">{{ t('media.seasons') }}</h2>
          <div v-if="mediaDetail.type === '电视剧' && mediaDetail.tmdb_id" class="flex w-full flex-col space-y-2">
            <div v-if="episodeGroupsLoading || episodeGroupOptions.length > 1" class="episode-group-selector">
              <div class="episode-group-label">{{ t('media.episodeGroups.select') }}</div>
              <VProgressLinear v-if="episodeGroupsLoading" color="primary" indeterminate rounded />
              <template v-else>
                <div class="episode-group-rail-shell">
                  <button
                    v-if="canScrollEpisodeGroupsBackward"
                    type="button"
                    class="episode-group-nav episode-group-nav--backward"
                    :aria-label="t('media.episodeGroups.previous')"
                    @click="scrollEpisodeGroups('backward')"
                  >
                    <VIcon icon="mdi-chevron-left" />
                  </button>
                  <div ref="episodeGroupRail" class="episode-group-rail" @scroll.passive="updateEpisodeGroupScrollState">
                    <button
                      v-for="group in episodeGroupOptions"
                      :key="group.id || 'default'"
                      type="button"
                      class="episode-group-option"
                      :class="{ 'episode-group-option--active': selectedEpisodeGroup === group.id }"
                      :aria-pressed="selectedEpisodeGroup === group.id"
                      @click="setEpisodeGroup(group.id)"
                    >
                      <VIcon :icon="group.icon" size="small" class="episode-group-option__icon" />
                      <span class="episode-group-option__text">
                        <span class="episode-group-option__title">{{ group.name }}</span>
                        <span class="episode-group-option__meta">
                          {{
                            t('media.episodeGroups.summary', {
                              seasons: group.group_count,
                              episodes: group.episode_count,
                            })
                          }}
                        </span>
                      </span>
                    </button>
                  </div>
                  <button
                    v-if="canScrollEpisodeGroupsForward"
                    type="button"
                    class="episode-group-nav episode-group-nav--forward"
                    :aria-label="t('media.episodeGroups.next')"
                    @click="scrollEpisodeGroups('forward')"
                  >
                    <VIcon icon="mdi-chevron-right" />
                  </button>
                </div>
                <div class="episode-group-current">
                  {{
                    t('media.episodeGroups.current', {
                      name: selectedEpisodeGroupOption.name,
                      seasons: selectedEpisodeGroupOption.group_count,
                      episodes: selectedEpisodeGroupOption.episode_count,
                    })
                  }}
                </div>
              </template>
            </div>
            <LoadingBanner v-if="episodeGroupSeasonsLoading" class="mt-3" />
            <VExpansionPanels v-else :key="selectedEpisodeGroup || 'default'">
              <VExpansionPanel
                v-for="season in getMediaSeasons"
                :key="season.season_number"
                @group:selected="loadSeasonEpisodes(season.season_number || 0)"
              >
                <VExpansionPanelTitle>
                  <template #default>
                    <div class="flex flex-row items-center justify-between">
                      <span class="font-weight-bold">{{
                        season.season_number === 0
                          ? season.name || formatSeasonLabel(0, t('media.specials'))
                          : t('media.seasonNumber', { number: season.season_number })
                        }}</span>
                      <VChip size="small" class="ms-1">
                        {{ t('media.episodeCount', { count: season.episode_count }) }}
                      </VChip>
                      <div class="absolute right-12">
                        <VChip v-if="seasonsNotExisted" :color="getExistColor(season.season_number || 0)" flat>
                          {{ getExistText(season.season_number || 0) }}
                        </VChip>
                        <IconBtn
                          v-if="canSubscribe"
                          class="ms-1"
                          :color="seasonsSubscribed[season.season_number || 0] ? 'error' : 'warning'"
                          variant="text"
                          @click.stop="handleSubscribe(season.season_number ?? null, selectedEpisodeGroup)"
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
                        <div class="episode-info flex-1">
                          <VIcon
                            v-if="isEpisodeExists(season.season_number || 0, episode.episode_number || 0)"
                            color="success"
                            icon="mdi-check-circle"
                            class="episode-exists-badge"
                            size="small"
                          />
                          <div class="flex flex-col space-y-2 lg:flex-row lg:items-center lg:space-y-0 lg:space-x-2">
                            <h3 class="text-lg">{{ episode.episode_number }} - {{ episode.name }}</h3>
                            <div class="flex items-center space-x-2">
                              <span
                                class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full whitespace-nowrap cursor-default bg-gray-700 !text-gray-300"
                              >
                                {{ episode.air_date }}
                              </span>
                            </div>
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
              <span>{{ t('media.info.originalTitle') }}</span>
              <span class="media-fact-value">{{ mediaDetail.original_title || mediaDetail.original_name }}</span>
            </div>
            <div v-if="mediaDetail.status" class="media-fact">
              <span>{{ t('media.info.status') }}</span>
              <span class="media-fact-value">{{ mediaDetail.status }}</span>
            </div>
            <div v-if="mediaDetail.release_date || mediaDetail.first_air_date" class="media-fact">
              <span>{{ t('media.info.releaseDate') }}</span>
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
            <div v-if="mediaDetail.type === '电影' && getEarliestDigitalReleaseDate" class="media-fact">
              <span>{{ t('media.info.digitalRelease') }}</span>
              <span class="media-fact-value">
                <span class="flex items-center justify-end">
                  <span class="inline-flex items-center justify-center h-4 w-4 text-[0.6rem] font-bold text-current border border-current leading-none">
                    {{ getEarliestDigitalReleaseDate.iso_code }}
                  </span>
                  <span class="ml-1.5">{{ getEarliestDigitalReleaseDate.date.slice(0, 10) }}</span>
                </span>
              </span>
            </div>
            <div v-if="mediaDetail.type === '电影' && getEarliestPhysicalReleaseDate" class="media-fact">
              <span>{{ t('media.info.physicalRelease') }}</span>
              <span class="media-fact-value">
                <span class="flex items-center justify-end">
                  <span class="inline-flex items-center justify-center h-4 w-4 text-[0.6rem] font-bold text-current border border-current leading-none">
                    {{ getEarliestPhysicalReleaseDate.iso_code }}
                  </span>
                  <span class="ml-1.5">{{ getEarliestPhysicalReleaseDate.date.slice(0, 10) }}</span>
                </span>
              </span>
            </div>
            <div v-if="mediaDetail.original_language" class="media-fact">
              <span>{{ t('media.info.originalLanguage') }}</span>
              <span class="media-fact-value">{{ mediaDetail.original_language }}</span>
            </div>
            <div v-if="mediaDetail.production_countries" class="media-fact">
              <span>{{ t('media.info.productionCountries') }}</span>
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
              <span>{{ t('media.info.productionCompanies') }}</span>
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
              <span>{{ t('media.info.doubanId') }}</span>
              <span class="media-fact-value">{{ mediaDetail.douban_id }}</span>
            </div>
            <div v-if="mediaDetail.original_title" class="media-fact">
              <span>{{ t('media.info.originalTitle') }}</span>
              <span class="media-fact-value">{{ mediaDetail.original_title }}</span>
            </div>
            <div v-if="mediaDetail.release_date" class="media-fact">
              <span>{{ t('media.info.releaseDate') }}</span>
              <span class="media-fact-value">
                {{ mediaDetail.release_date }}
              </span>
            </div>
            <div v-if="mediaDetail.production_countries" class="media-fact border-b-0">
              <span>{{ t('media.info.productionCountries') }}</span>
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
              <span>{{ t('media.info.originalTitle') }}</span>
              <span class="media-fact-value">{{ mediaDetail.original_title }}</span>
            </div>
            <div v-if="mediaDetail.release_date" class="media-fact border-b-0">
              <span>{{ t('media.info.releaseDate') }}</span>
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
          :linkurl="`/credits/tmdb/credits/${mediaDetail.tmdb_id}/${mediaProps.type}?title=${t(
            'media.castAndCrew',
          )}&type=tmdb`"
          :title="t('media.castAndCrew')"
          type="tmdb"
        />
      </div>
      <div v-else-if="mediaDetail.douban_id">
        <PersonCardSlideView
          :apipath="`douban/credits/${mediaDetail.douban_id}/${mediaProps.type}`"
          :linkurl="`/credits/douban/credits/${mediaDetail.douban_id}/${mediaProps.type}?title=${t(
            'media.castAndCrew',
          )}&type=douban`"
          :title="t('media.castAndCrew')"
          type="douban"
        />
      </div>
      <div v-else-if="mediaDetail.bangumi_id">
        <PersonCardSlideView
          :apipath="`bangumi/credits/${mediaDetail.bangumi_id}`"
          :linkurl="`/credits/bangumi/credits/${mediaDetail.bangumi_id}?title=${t('media.castAndCrew')}&type=bangumi`"
          :title="t('media.castAndCrew')"
          type="bangumi"
        />
      </div>
      <div v-if="mediaDetail.tmdb_id">
        <MediaCardSlideView
          :apipath="`tmdb/recommend/${mediaDetail.tmdb_id}/${mediaProps.type}`"
          :linkurl="`/browse/tmdb/recommend/${mediaDetail.tmdb_id}/${mediaProps.type}?title=${t(
            'media.recommendations',
          )}`"
          :title="t('media.recommendations')"
        />
      </div>
      <div v-else-if="mediaDetail.douban_id">
        <MediaCardSlideView
          :apipath="`douban/recommend/${mediaDetail.douban_id}/${mediaProps.type}`"
          :linkurl="`/browse/douban/recommend/${mediaDetail.douban_id}/${mediaProps.type}?title=${t(
            'media.recommendations',
          )}`"
          :title="t('media.recommendations')"
        />
      </div>
      <div v-else-if="mediaDetail.bangumi_id">
        <MediaCardSlideView
          :apipath="`bangumi/recommend/${mediaDetail.bangumi_id}`"
          :linkurl="`/browse/bangumi/recommend/${mediaDetail.bangumi_id}?title=${t('media.recommendations')}`"
          :title="t('media.recommendations')"
        />
      </div>
      <div v-if="mediaDetail.tmdb_id">
        <MediaCardSlideView
          :apipath="`tmdb/similar/${mediaDetail.tmdb_id}/${mediaProps.type}`"
          :linkurl="`/browse/tmdb/similar/${mediaDetail.tmdb_id}/${mediaProps.type}?title=${t('media.similar')}`"
          :title="t('media.similar')"
        />
      </div>
    </div>
  </div>
  <NoDataFound
    v-if="!mediaDetail.tmdb_id && !mediaDetail.douban_id && !mediaDetail.bangumi_id && isRefreshed"
    error-code="500"
    :error-title="t('media.error.title')"
    :error-description="t('media.error.noMediaInfo')"
  />
</template>

<style lang="scss" scoped>
.vue-media-back {
  --media-backdrop-edge-opacity: 1;

  z-index: 0;
  pointer-events: none;
  background-image: linear-gradient(
      180deg,
      rgba(var(--v-theme-background), 0) 50%,
      rgba(var(--v-theme-background), var(--media-backdrop-edge-opacity)) 100%
    ),
    linear-gradient(
      0deg,
      rgba(var(--v-theme-background), 0) 80%,
      rgba(var(--v-theme-background), var(--media-backdrop-edge-opacity)) 100%
    ),
    linear-gradient(
      90deg,
      rgba(var(--v-theme-background), 0) 50%,
      rgba(var(--v-theme-background), var(--media-backdrop-edge-opacity)) 100%
    ),
    linear-gradient(
      270deg,
      rgba(var(--v-theme-background), 0) 50%,
      rgba(var(--v-theme-background), var(--media-backdrop-edge-opacity)) 100%
    );
  margin-block-start: calc(-70px - env(safe-area-inset-top));
}

.vue-media-back-image {
  background-image: none;
}

.media-detail-transparent .vue-media-back-overlay {
  display: none;
}

.media-detail-transparent .vue-media-back-image {
  opacity: 0.78;
  mask-image: linear-gradient(to bottom, transparent 0%, #000 16%, #000 58%, transparent 100%),
    linear-gradient(to right, transparent 0%, #000 10%, #000 90%, transparent 100%);
  mask-composite: intersect;
  -webkit-mask-image: linear-gradient(to bottom, transparent 0%, #000 16%, #000 58%, transparent 100%),
    linear-gradient(to right, transparent 0%, #000 10%, #000 90%, transparent 100%);
  -webkit-mask-composite: source-in;
}

.media-page {
  position: relative;
  z-index: 1;
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
  border-radius: var(--app-surface-radius);
  box-shadow: var(--tw-ring-offset-shadow, 0 0 #0000), var(--tw-ring-shadow, 0 0 #0000), var(--tw-shadow);
  inline-size: 8rem;
  transition: border-radius 0.2s ease;

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
  --media-action-gap: 0.75rem;

  position: relative;
  display: grid;
  flex-shrink: 0;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--media-action-gap);
  inline-size: min(100%, 22rem);
  justify-content: center;
  margin-block-start: 1rem;
}

.media-action-button {
  inline-size: 100%;
  min-inline-size: 0;
}

.media-actions > .media-action-button:only-child,
.media-actions > .media-action-button:last-child:nth-child(odd):not(:first-child) {
  grid-column: 1 / -1;
  inline-size: calc((100% - var(--media-action-gap)) / 2);
  justify-self: center;
}

@media (width >= 1280px) {
  .media-actions {
    margin-block-start: 0;
  }
}

@media (width >= 640px) {
  .media-actions {
    display: flex;
    gap: 0.5rem;
    inline-size: auto;
    justify-content: flex-end;
  }

  .media-action-button,
  .media-actions > .media-action-button:only-child,
  .media-actions > .media-action-button:last-child:nth-child(odd):not(:first-child) {
    inline-size: auto;
  }
}

.media-overview-left {
  flex: 1 1 0%;
  min-inline-size: 0;
}

@media (width >= 1024px) {
  .media-overview-left {
    margin-inline-end: 2rem;
  }
}

.episode-group-selector {
  display: grid;
  gap: 0.5rem;
  margin-block-end: 0.5rem;
  min-inline-size: 0;
}

.episode-info {
  position: relative;
  min-inline-size: 0;
  padding-inline-end: 2rem;
}

.episode-exists-badge {
  position: absolute;
  inset-block-start: 0.125rem;
  inset-inline-end: 0;
}

.episode-group-label {
  color: rgba(var(--v-theme-on-surface), 0.72);
  font-size: 0.75rem;
  line-height: 1rem;
}

.episode-group-rail-shell {
  position: relative;
  min-inline-size: 0;
}

.episode-group-rail {
  display: flex;
  gap: 0.5rem;
  overflow-x: auto;
  padding-block: 0.125rem 0.375rem;
  scroll-behavior: smooth;
  scroll-snap-type: inline proximity;
  scrollbar-width: none;
}

.episode-group-rail::-webkit-scrollbar {
  display: none;
}

.episode-group-option {
  display: inline-flex;
  flex: 0 0 12rem;
  align-items: center;
  backdrop-filter: var(--app-grouped-list-backdrop-filter, blur(var(--transparent-blur-light, 6px)));
  border: 1px solid rgba(var(--v-theme-on-surface), 0.12);
  border-radius: var(--app-control-radius);
  background: rgba(var(--v-theme-surface), 0.82);
  color: rgb(var(--v-theme-on-surface));
  gap: 0.625rem;
  min-inline-size: 0;
  padding-block: 0.625rem;
  padding-inline: 0.75rem;
  scroll-snap-align: start;
  text-align: start;
  transition:
    border-color 0.16s ease,
    background-color 0.16s ease,
    color 0.16s ease;
}

.episode-group-option:hover {
  border-color: rgba(var(--v-theme-primary), 0.5);
  background: rgba(var(--v-theme-surface), 0.9);
  box-shadow: 0 6px 18px rgba(var(--v-theme-on-surface), 0.08);
}

.episode-group-option--active {
  border-color: rgb(var(--v-theme-primary));
  background: rgba(var(--v-theme-primary), 0.18);
  color: rgb(var(--v-theme-primary));
}

.episode-group-option--active:hover {
  background: rgba(var(--v-theme-primary), 0.24);
}

.episode-group-option:focus-visible,
.episode-group-nav:focus-visible {
  outline: 2px solid rgba(var(--v-theme-primary), 0.45);
  outline-offset: 2px;
}

.episode-group-option__icon {
  flex: 0 0 auto;
}

.episode-group-option__text {
  display: grid;
  min-inline-size: 0;
}

.episode-group-option__title,
.episode-group-option__meta {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.episode-group-option__title {
  font-size: 0.875rem;
  font-weight: 600;
  line-height: 1.125rem;
}

.episode-group-option__meta {
  color: rgba(var(--v-theme-on-surface), 0.62);
  font-size: 0.75rem;
  line-height: 1rem;
}

.episode-group-option--active .episode-group-option__meta {
  color: rgba(var(--v-theme-primary), 0.82);
}

.episode-group-nav {
  position: absolute;
  z-index: 2;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  backdrop-filter: var(--app-grouped-list-backdrop-filter, blur(var(--transparent-blur-light, 6px)));
  border: 1px solid rgba(var(--v-theme-on-surface), 0.12);
  border-radius: 9999px;
  background: rgba(var(--v-theme-surface), 0.96);
  block-size: 2.5rem;
  color: rgb(var(--v-theme-on-surface));
  inline-size: 2.5rem;
  inset-block-start: 50%;
  transform: translateY(-55%);
  transition:
    border-color 0.16s ease,
    background-color 0.16s ease,
    color 0.16s ease;
}

.episode-group-nav:hover {
  border-color: rgba(var(--v-theme-primary), 0.45);
  background: rgba(var(--v-theme-surface), 0.96);
  box-shadow: 0 6px 18px rgba(var(--v-theme-on-surface), 0.12);
  color: rgb(var(--v-theme-primary));
}

.episode-group-nav--backward {
  inset-inline-start: -0.5rem;
}

.episode-group-nav--forward {
  inset-inline-end: -0.5rem;
}

.episode-group-current {
  color: rgba(var(--v-theme-on-surface), 0.66);
  font-size: 0.8125rem;
  line-height: 1.25rem;
}

.media-detail-transparent .episode-group-option {
  backdrop-filter: blur(var(--transparent-blur, 10px));
  background: rgba(var(--v-theme-surface), var(--transparent-opacity, 0.3));
}

.media-detail-transparent .episode-group-option:hover {
  background: rgba(var(--v-theme-surface), var(--transparent-opacity-heavy, 0.5));
}

.media-detail-transparent .episode-group-option--active {
  background: rgba(var(--v-theme-primary), 0.22);
}

.media-detail-transparent .episode-group-option--active:hover {
  background: rgba(var(--v-theme-primary), 0.28);
}

.media-detail-transparent .episode-group-nav {
  backdrop-filter: blur(var(--transparent-blur, 10px));
  background: rgba(var(--v-theme-surface), var(--transparent-opacity-heavy, 0.5));
}

@media (width <= 640px) {
  .episode-group-option {
    flex-basis: 9.75rem;
    padding-block: 0.5625rem;
    padding-inline: 0.625rem;
  }

  .episode-group-nav {
    display: none;
  }

  .episode-group-current {
    font-size: 0.75rem;
  }
}

@media (prefers-reduced-motion: reduce) {
  .episode-group-rail {
    scroll-behavior: auto;
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
