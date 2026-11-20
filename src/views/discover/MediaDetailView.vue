<script setup lang="ts">
import { getSharedConfiguration } from '@/api/configuration'
import { getMediaStatus, getMediaSubscribedSeasons } from '@/api/mediaStatus'
import { getSharedData, invalidateSharedData, invalidateSharedDataKey } from '@/utils/sharedDataCache'
import { useToast } from 'vue-toastification'
import { nativeChromeActive } from '@/native/layout'
import { useNativePageHeader } from '@/native/page'
import PersonCardSlideView from './PersonCardSlideView.vue'
import MediaCardSlideView from './MediaCardSlideView.vue'
import MediaCommentView from './MediaCommentView.vue'
import api from '@/api'
import MediaEpisodePickerDialog from '@/components/dialog/MediaEpisodePickerDialog.vue'
import type { PlayableEpisode } from '@/types/playback'
import { ApiRequestError, getApiBusinessErrorMessage, isApiRequestCancellation } from '@/api/client'
import type {
  MediaDataSource,
  MediaInfo,
  MediaMapping,
  MediaRelease,
  MediaSeason,
  NotExistMediaInfo,
  Site,
  TmdbEpisode,
} from '@/api/types'
import NoDataFound from '@/components/states/NoDataFound.vue'
import { formatSeasonLabel } from '@/@core/utils/season'
import { formatSeasonEpisode } from '@/@core/utils/formatters'
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
  getMediaSubscribeIdentity,
  useMediaSubscribe,
  type MediaSubscribeIdentity,
  type SeasonSubscribeModes,
} from '@/composables/useMediaSubscribe'

const SearchSiteDialog = defineAsyncComponent(() => import('@/components/dialog/SearchSiteDialog.vue'))

// 国际化
const { t } = useI18n()

const $toast = useToast()

// 输入参数
const mediaProps = defineProps<{
  mediaSource?: MediaDataSource
  mediaId?: string
  title?: string
  year?: string | number
  type?: string
}>()

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

// 共享关系只补充外链，避免辅助 TMDB ID 改变原来源的季集、订阅和搜索行为。
const sharedTmdbMapping = ref<MediaMapping | null>(null)
let mappingRequestId = 0

/**
 * 按需查找 TMDB 链接的按钮状态。
 *
 * null 表示共享查询尚未完成或不适用；unsupported 表示旧后端没有查找接口，按钮隐藏。
 */
type TmdbLookupState = 'idle' | 'searching' | 'not-found' | 'failed' | 'timeout' | 'unsupported'
const tmdbLookupState = ref<TmdbLookupState | null>(null)

// 后端按需查找可能需要多次 TMDB 请求，超时后后台仍会继续查找，重试会合并到同一次查找。
const TMDB_LOOKUP_TIMEOUT = 60_000

/** 共享关系查询与按需查找使用同一组参数，保证两者命中同一条共享关系。 */
interface SharedTmdbMappingQuery {
  identity: MediaSubscribeIdentity
  params: { media_source: MediaDataSource; media_id: string; type: 'movie' | 'tv'; season?: number }
}

/** 仅为非 TMDB 来源的电影和电视剧构造共享关系查询参数。 */
function getSharedTmdbMappingQuery(): SharedTmdbMappingQuery | null {
  const identity = getMediaSubscribeIdentity(mediaDetail.value)
  if (!identity || identity.source === 'themoviedb' || !['电影', '电视剧'].includes(mediaDetail.value.type ?? ''))
    return null
  return {
    identity,
    params: {
      media_source: identity.source,
      media_id: identity.mediaId,
      type: mediaDetail.value.type === '电影' ? 'movie' : 'tv',
      season: mediaDetail.value.type === '电视剧' ? (mediaDetail.value.season ?? undefined) : undefined,
    },
  }
}

/** 共享关系快照按查询参数分条缓存，按需查找成功后只失效对应条目。 */
function getSharedTmdbMappingKey(params: SharedTmdbMappingQuery['params']) {
  return `media-mapping:${JSON.stringify(params)}`
}

/** 判断错误是否来自尚未提供该接口的旧后端。 */
function isMissingEndpoint(error: unknown) {
  return error instanceof ApiRequestError && (error.status === 404 || error.status === 405)
}

/**
 * 独立查询已有关系；中心不可用或旧后端没有接口时继续显示原详情。
 *
 * @param retried 是否为读取被共享快照失效作废后的重读
 */
async function querySharedTmdbMapping(retried = false) {
  const requestId = ++mappingRequestId
  const query = getSharedTmdbMappingQuery()
  if (!query) return
  const { identity, params } = query
  try {
    const mapping = await getSharedData<MediaMapping | null>(getSharedTmdbMappingKey(params), () =>
      api.get('media/mapping', { params, timeout: 1500, feedback: 'silent', skipConnectionTracking: true }),
    )
    if (requestId !== mappingRequestId) return
    if (mapping?.media_source === identity.source && mapping.media_id === identity.mediaId)
      sharedTmdbMapping.value = mapping
    else tmdbLookupState.value = 'idle'
  } catch (error) {
    // 此入口仅补充可选外链；查询失败（超时、网络或 5xx）时仍提供按需查找，后端会先查共享关系，
    // 不自动触发名称匹配或打断详情页。只有 404/405 表示旧后端，不显示按钮。
    if (requestId !== mappingRequestId) return
    if (isApiRequestCancellation(error)) {
      // 本页仍在等待时读取被作废（例如同一条目的迟到查找结果刚写回关系），重读一次取得新结论；
      // 再次作废时直接提供查找，后端会先查共享关系，避免本页既无链接也无按钮。
      if (retried) tmdbLookupState.value = 'idle'
      else void querySharedTmdbMapping(true)
      return
    }
    tmdbLookupState.value = isMissingEndpoint(error) ? 'unsupported' : 'idle'
  }
}

// 共享查询未命中且详情本身没有 TMDB ID 时，在 TheMovieDb 链接的位置提供按需查找。
const showTmdbLookup = computed(
  () =>
    !mediaDetail.value.tmdb_id &&
    !sharedTmdbMapping.value &&
    tmdbLookupState.value !== null &&
    tmdbLookupState.value !== 'unsupported',
)
const canLookupTmdb = computed(() => ['idle', 'failed', 'timeout'].includes(tmdbLookupState.value ?? ''))
const tmdbLookupLabel = computed(() => {
  switch (tmdbLookupState.value) {
    case 'searching':
      return t('media.tmdbLookup.searching')
    case 'not-found':
      return t('media.tmdbLookup.notFound')
    case 'failed':
      return t('media.tmdbLookup.failed')
    case 'timeout':
      return t('media.tmdbLookup.timeout')
    default:
      return t('media.tmdbLookup.find')
  }
})
const tmdbLookupIcon = computed(() => {
  if (tmdbLookupState.value === 'not-found') return 'mdi-link-off'
  if (tmdbLookupState.value === 'failed' || tmdbLookupState.value === 'timeout') return 'mdi-refresh'
  return 'mdi-magnify'
})

/** 把查找失败归类为可重试失败、超时或旧后端不支持。 */
function resolveTmdbLookupFailure(error: unknown): TmdbLookupState {
  if (isApiRequestCancellation(error)) return 'idle'
  if (isMissingEndpoint(error)) return 'unsupported'
  if (error instanceof ApiRequestError && (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT'))
    return 'timeout'
  return 'failed'
}

/**
 * 用户点击后让后端按订阅规则查找 TMDB 关系，结果由后端尽力写回共享表。
 *
 * 请求不参与全局连接探测：可选功能的超时或 503 不应把整个应用标记为离线。
 */
async function lookupTmdbMapping() {
  const query = getSharedTmdbMappingQuery()
  if (!query || !canLookupTmdb.value) return
  const requestId = mappingRequestId
  tmdbLookupState.value = 'searching'
  try {
    const mapping = await api.post<MediaMapping | null>('media/mapping/match', query.params, {
      timeout: TMDB_LOOKUP_TIMEOUT,
      feedback: 'silent',
      skipConnectionTracking: true,
    })
    // 关系已写回共享表，即使用户已离开本页也要让该条目旧的未命中快照失效；其他条目的读取不受影响。
    if (mapping) invalidateSharedDataKey(getSharedTmdbMappingKey(query.params))
    if (requestId !== mappingRequestId) return
    if (!mapping) {
      tmdbLookupState.value = 'not-found'
    } else if (mapping.media_source === query.identity.source && mapping.media_id === query.identity.mediaId) {
      sharedTmdbMapping.value = mapping
      tmdbLookupState.value = 'idle'
    } else {
      tmdbLookupState.value = 'failed'
    }
  } catch (error) {
    if (requestId !== mappingRequestId) return
    tmdbLookupState.value = resolveTmdbLookupFailure(error)
  }
}

// 本地是否存在，存在则包括Item信息
const existsItemId = ref('')
const existsServer = ref('')

// 详情与媒体库状态是异步加载的，按当前可用操作数固定辅助按钮列数，避免初始化视口变化导致换行。
const hasSubscribeAction = computed(
  () => canSubscribe.value && (mediaDetail.value.type === '电影' || hasMediaIdentity()),
)
const hasSearchActions = computed(() => hasMediaIdentity() && canSearch.value)
const secondaryActionCount = computed(() => (hasSearchActions.value ? 2 : 0) + (existsItemId.value ? 1 : 0))

// 是否已订阅
const isSubscribed = ref(false)

// 是否已加载完成
const isRefreshed = ref(false)

// 主详情请求失败时与合法空媒体分开展示，并允许用户重试。
const detailLoadFailed = ref(false)

// 存储每一季的集信息
const seasonEpisodesInfo = ref({} as { [key: number]: TmdbEpisode[] })

// 存储存在的季集
const existsEpisodes = ref({} as { [key: number]: number[] })

// 电视剧播放选择状态
const playEpisodeDialog = ref(false)
const playEpisodeSeason = ref<number | null>(null)
const playEpisodeIds = ref<Record<number, Record<number, string>>>({})
const playEpisodeIdsLoading = ref(false)
const playEpisodeIdsFailed = ref(false)
let playEpisodeIdsRequestId = 0

// 各季缺失状态：0-已入库 1-部分缺失 2-全部缺失，没有数据也是已入库
const seasonsNotExisted = ref<{ [key: number]: number }>({})

// 各季缺失明细，供状态标签悬停提示说明缺了哪些集
const seasonsMissingInfo = ref<{ [key: number]: NotExistMediaInfo }>({})

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
let seasonEpisodesRequestGeneration = 0

// 计算主题是否为玻璃
const isGlassTheme = computed(() => {
  return theme.name.value === 'glass'
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

// 查询与当前媒体类型兼容的站点
async function querySites() {
  try {
    const mediaType = mediaDetail.value.type === '电视剧' ? 'tv' : 'movie'
    const data: Site[] = await getSharedConfiguration(`site/media/${mediaType}`)

    // 过滤站点，只有启用的站点才显示
    allSites.value = data.filter(item => item.is_active)
  } catch (error) {
    console.log(error)
  }
}

// 查询用户选中的站点
async function querySelectedSites() {
  try {
    const result = await getSharedConfiguration<{ value?: number[] }>('system/setting/public/IndexerSites')
    selectedSites.value = result.value ?? []
  } catch (error) {
    console.log(error)
  }
}

// 获取当前详情的统一媒体身份缓存键
function getMediaId() {
  return getMediaSubscribeId(mediaDetail.value)
}

// 判断详情是否包含可用于后续操作的稳定媒体身份。
function hasMediaIdentity() {
  return Boolean(getMediaId())
}

// 生成当前媒体指定季的订阅状态缓存键
function getSubscribeStatusKey(season: number | null = mediaDetail.value?.season ?? null) {
  return `${getMediaId()}::${season ?? 'all'}`
}

// 调用API查询详情
async function getMediaDetail() {
  mappingRequestId++
  sharedTmdbMapping.value = null
  tmdbLookupState.value = null
  if (!mediaProps.mediaSource || !mediaProps.mediaId || !mediaProps.type) {
    mediaDetail.value = {} as MediaInfo
    detailLoadFailed.value = false
    isRefreshed.value = true
    return
  }

  detailLoadFailed.value = false
  isRefreshed.value = false
  try {
    mediaDetail.value = await api.get(`media/${encodeURIComponent(mediaProps.mediaId)}`, {
      params: {
        media_source: mediaProps.mediaSource,
        type_name: mediaProps.type,
      },
    })
    if (!hasMediaIdentity()) return
    void querySharedTmdbMapping()

    const supportsEpisodeGroups = getMediaSubscribeIdentity(mediaDetail.value)?.source === 'themoviedb'
    selectedEpisodeGroup.value = supportsEpisodeGroups ? mediaDetail.value.episode_group || '' : ''
    if (!supportsEpisodeGroups) {
      episodeGroups.value = []
      episodeGroupSeasons.value = []
    }
    if (mediaDetail.value.type === '电视剧' && supportsEpisodeGroups && mediaDetail.value.tmdb_id) {
      getEpisodeGroups()
      if (selectedEpisodeGroup.value) loadEpisodeGroupSeasons(selectedEpisodeGroup.value)
    }

    // 检查存在状态
    checkExists()
    if (mediaDetail.value.type === '电视剧') checkSeasonsNotExists()
    // 检查订阅状态
    if (mediaDetail.value.type === '电影') checkMovieSubscribed()
    else checkSeasonsSubscribed()
  } catch (error) {
    console.error(error)
    detailLoadFailed.value = true
  } finally {
    isRefreshed.value = true
  }
}

// 调用API加载季集信息（TMDB）
async function loadSeasonEpisodes(season: number) {
  // 加载季集存在信息
  loadEpisodeExists()
  // 加载季集信息
  if (seasonEpisodesInfo.value[season]) return
  const requestGeneration = seasonEpisodesRequestGeneration
  try {
    const params = selectedEpisodeGroup.value ? { episode_group: selectedEpisodeGroup.value } : undefined
    const result: TmdbEpisode[] = await api.get(
      `tmdb/${mediaDetail.value.tmdb_id}/${season}`,
      params ? { params } : undefined,
    )
    if (requestGeneration === seasonEpisodesRequestGeneration) seasonEpisodesInfo.value[season] = result || []
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
    const result = await getMediaStatus(mediaDetail.value)
    if (result.legacyFailures?.exists) throw new Error(result.legacyFailures.exists)
    existsItemId.value = result.item_id || ''
    existsServer.value = result.server || ''
  } catch (error) {
    console.error(error)
  }
}

// 检查所有季的缺失状态
async function checkSeasonsNotExists() {
  if (mediaDetail.value.type !== '电视剧') return
  const requestId = ++seasonNotExistsRequestId
  seasonsNotExisted.value = {}
  seasonsMissingInfo.value = {}
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
        seasonsMissingInfo.value[item.season] = item
      })
    }
  } catch (error) {
    console.error(error)
  }
}

// 检查电影订阅状态
async function checkMovieSubscribed() {
  if (mediaDetail.value.type !== '电影') return
  try {
    const result = await getMediaStatus(mediaDetail.value)
    if (result.legacyFailures?.subscribe) throw new Error(result.legacyFailures.subscribe)
    isSubscribed.value = result.subscribed
  } catch (error) {
    console.error(error)
  }
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
  () =>
    episodeGroupOptions.value.find(group => group.id === selectedEpisodeGroup.value) ?? episodeGroupOptions.value[0]!,
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

// 播放选择器只列出媒体服务器报告可播放单集的季。
const playEpisodeSeasonOptions = computed(() => {
  return Object.entries(playEpisodeIds.value)
    .filter(([, episodes]) => Object.keys(episodes).length > 0)
    .map(([key]) => Number(key))
    .sort((left, right) => (left === 0 ? 1 : right === 0 ? -1 : left - right))
    .map(season => ({
      value: season,
      title:
        mediaDetail.value?.season_info?.find(item => item.season_number === season)?.name ||
        (season === 0 ? t('media.specials') : t('media.seasonNumber', { number: season })),
    }))
})

// 按媒体服务器原生集号排序，并保留后端返回的实际单集条目标识。
const playEpisodeOptions = computed<PlayableEpisode[]>(() => {
  const season = playEpisodeSeason.value
  if (season === null) return []
  return Object.entries(playEpisodeIds.value[season] || {})
    .map(([episode, itemId]) => ({ episode: Number(episode), itemId }))
    .filter(item => Boolean(item.itemId))
    .sort((left, right) => left.episode - right.episode)
    .map(item => ({
      ...item,
      ...(() => {
        const metadata = selectedEpisodeGroup.value
          ? undefined
          : seasonEpisodesInfo.value[season]?.find(episode => episode.episode_number === item.episode)
        return {
          name: metadata?.name,
          stillPath: metadata?.still_path,
          overview: metadata?.overview,
          airDate: metadata?.air_date,
          runtime: metadata?.runtime,
        }
      })(),
    }))
})

// 查询当前媒体可用的剧集组
async function getEpisodeGroups() {
  if (getMediaSubscribeIdentity(mediaDetail.value)?.source !== 'themoviedb' || !mediaDetail.value.tmdb_id) return

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
  if (getMediaSubscribeIdentity(mediaDetail.value)?.source !== 'themoviedb' || !groupId) {
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
  seasonEpisodesRequestGeneration += 1

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
    const modes = await getMediaSubscribedSeasons(mediaDetail.value)
    const nextSubscribed: { [key: number]: boolean } = {}

    mediaDetail.value?.season_info?.forEach(item => {
      const season = item.season_number ?? 0
      nextSubscribed[season] = false
    })

    Object.keys(modes).forEach(key => {
      const season = Number(key)
      nextSubscribed[season] = true
    })

    seasonsSubscribed.value = nextSubscribed
    subscribedSeasonModes.value = modes
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

// 默认季结构中的季号集合
const defaultSubscribeSeasonNumbers = computed(() =>
  (mediaDetail.value?.season_info ?? []).map(season => season.season_number ?? 0),
)

// 当前媒体是否已订阅默认季结构中的全部季
const isAllSeasonsSubscribed = computed(
  () =>
    mediaDetail.value.type === '电视剧' &&
    defaultSubscribeSeasonNumbers.value.length > 0 &&
    defaultSubscribeSeasonNumbers.value.every(season => seasonsSubscribed.value[season]),
)

// 订阅按钮响应；单季入口同时传递详情页当前选择的剧集组。
function handleSubscribe(season: number | null = null, episodeGroup = '') {
  subscribeActions.handleSubscribe(season, episodeGroup)
}

// 从genres中获取name，使用、分隔
function getGenresName(genres: Array<string | { name: string }>) {
  return genres.map(genre => (typeof genre === 'string' ? genre : genre.name)).join('、')
}

/** 拼装原详情或共享关系的 TheMovieDb 链接，保留共享的第零季等精确季号。 */
function getTheMovieDbLink() {
  if (sharedTmdbMapping.value) {
    const mapping = sharedTmdbMapping.value
    const season = mapping.tmdb_type === 'tv' && mapping.tmdb_season !== null ? `/season/${mapping.tmdb_season}` : ''
    return `https://www.themoviedb.org/${mapping.tmdb_type}/${mapping.tmdb_id}${season}`
  }
  const mtype = mediaProps.type === '电影' ? 'movie' : 'tv'
  return `https://www.themoviedb.org/${mtype}/${mediaDetail.value.tmdb_id}`
}

// 处理豆瓣链接点击
async function handleDoubanClick() {
  if (mediaDetail.value.douban_id) {
    await openDoubanApp(
      mediaDetail.value.douban_id,
      mediaDetail.value.type,
      mediaDetail.value.title,
      mediaDetail.value.year?.toString(),
    )
  }
}

// 拼装IMDB地址
function getImdbLink() {
  return `https://www.imdb.com/title/${mediaDetail.value.imdb_id}`
}

// 拼装TVDB地址（优先使用 slug，TVDB 已弃用数字 ID 直达 URL）
function getTvdbLink() {
  const slug = mediaDetail.value.tvdb_slug
  const id = mediaDetail.value.tvdb_id
  if (slug) {
    return `https://www.thetvdb.com/series/${slug}`
  }
  return `https://www.thetvdb.com/series/${id}`
}

// 拼装Bangumi地址
function getBangumiLink() {
  return `https://bgm.tv/subject/${mediaDetail.value.bangumi_id}`
}

// 拼装 AniList 地址
function getAniListLink() {
  return `https://anilist.co/anime/${mediaDetail.value.anilist_id}`
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
  if (!filteredDates || filteredDates.length === 0) return null

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

// 计算存在状态的悬停提示，说明判断依据和缺失的集
function getExistHint(season: number) {
  const state = seasonsNotExisted.value[season]
  const info = seasonsMissingInfo.value[season]
  if (!state || !info) return t('media.status.inLibraryHint')
  if (state === 2) return t('media.status.missingHint', { count: info.total_episode })
  return t('media.status.partiallyMissingHint', {
    episodes: formatSeasonEpisode(null, info.episodes),
    count: info.episodes.length,
  })
}

// 判断指定季集是否已存在于媒体服务器
function isEpisodeExists(season: number, episode: number) {
  return existsEpisodes.value[season]?.includes(episode) ?? false
}

// 计算订阅图标
const getSubscribeIcon = computed(() => {
  if (mediaDetail.value.type === '电视剧')
    return subscribedSeasonNumbers.value.length > 0 ? 'mdi-heart' : 'mdi-heart-outline'
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
  const identity = getMediaSubscribeIdentity(mediaDetail.value)
  if (!identity) return
  const season = options.season ?? mediaDetail.value.season
  const episode = options.episode ?? null
  router.push({
    path: '/resource',
    query: {
      media_source: identity.source,
      media_id: identity.mediaId,
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

// 将已解析的媒体服务器条目交给原生 App，网页继续使用兼容的媒体服务器入口。
function requestNativePlayback(itemId: string, title: string, season?: number, episode?: number, server?: string) {
  const transport = window.MoviePilotNative
  if (!nativeChromeActive.value || transport?.playbackVersion !== 1) return false
  window.dispatchEvent(
    new CustomEvent('moviepilot:playback-open', {
      detail: {
        itemId,
        title,
        ...(server ? { server } : {}),
        ...(season !== undefined ? { season } : {}),
        ...(episode !== undefined ? { episode } : {}),
      },
    }),
  )
  return true
}

// 打开电影或单集；只有普通网页回退到媒体服务器自身的播放页面。
async function playMediaServerItem(itemId: string, title: string, season?: number, episode?: number, server?: string) {
  if (requestNativePlayback(itemId, title, season, episode, server)) return
  try {
    const result = await api.get<{ item_id: string; server_id: string; server_type: string; url: string }>(
      `mediaserver/play/${encodeURIComponent(itemId)}`,
      { feedback: 'silent' },
    )
    // 使用深度链接工具，优先跳转到APP，失败后跳转到网页
    await openMediaServerItem({
      link: result.url,
      item_id: result.item_id,
      server_id: result.server_id,
      server_type: result.server_type,
    })
  } catch (error) {
    console.error(error)
    const message = getApiBusinessErrorMessage(error)
    $toast.error(message ? `获取播放链接失败：${message}！` : '获取播放链接失败！')
  }
}

// 打开电视剧单集选择器，并加载媒体服务器实际可播放的季集条目。
async function openPlayEpisodePicker() {
  playEpisodeDialog.value = true
  if (isNullOrEmptyObject(playEpisodeIds.value)) await loadPlayableEpisodeIds()
  const seasons = Object.entries(playEpisodeIds.value)
    .filter(([, episodes]) => Object.keys(episodes).length > 0)
    .map(([season]) => Number(season))
    .sort((left, right) => (left === 0 ? 1 : right === 0 ? -1 : left - right))
  if (!seasons.length) {
    playEpisodeIdsFailed.value = true
    return
  }
  const preferredSeason = mediaDetail.value.season
  const season = preferredSeason !== undefined && seasons.includes(preferredSeason) ? preferredSeason : seasons[0]
  playEpisodeSeason.value = season
  if (!selectedEpisodeGroup.value) void loadSeasonEpisodes(season)
}

// 一次读取媒体服务器原生季集号和对应单集 ID，避免剧集组排序造成错配。
async function loadPlayableEpisodeIds() {
  if (!existsItemId.value) return
  const requestId = ++playEpisodeIdsRequestId
  playEpisodeIdsLoading.value = true
  playEpisodeIdsFailed.value = false
  try {
    const result: Record<number, Record<number, string>> = await api.get('mediaserver/episodes', {
      feedback: 'silent',
      params: { itemid: existsItemId.value, ...(existsServer.value ? { server: existsServer.value } : {}) },
    })
    if (requestId === playEpisodeIdsRequestId) {
      playEpisodeIds.value = result || {}
      playEpisodeIdsFailed.value = !Object.keys(result || {}).length
    }
  } catch (error) {
    console.error(error)
    if (requestId === playEpisodeIdsRequestId) playEpisodeIdsFailed.value = true
  } finally {
    if (requestId === playEpisodeIdsRequestId) playEpisodeIdsLoading.value = false
  }
}

// 更换选择季时加载该季的 TMDB 集名（仅默认排序能与媒体服务器季号对应）。
function changePlayEpisodeSeason(season: number | null) {
  playEpisodeSeason.value = season
  if (season === null || selectedEpisodeGroup.value) return
  void loadSeasonEpisodes(season)
}

// 按所选条目标识开始播放，电视剧播放器标题带上季号和集号。
async function playSelectedEpisode(item: PlayableEpisode) {
  const season = playEpisodeSeason.value
  if (season === null) return
  playEpisodeDialog.value = false
  const label = `S${String(season).padStart(2, '0')}E${String(item.episode).padStart(2, '0')}`
  await playMediaServerItem(
    item.itemId,
    `${mediaDetail.value.title} · ${label}${item.name ? ` · ${item.name}` : ''}`,
    season,
    item.episode,
    existsServer.value,
  )
}

// 电影直接播放；电视剧必须先明确选择已入库的单集。
async function handlePlay() {
  if (mediaDetail.value.type === '电视剧') {
    await openPlayEpisodePicker()
    return
  }
  await playMediaServerItem(
    existsItemId.value,
    mediaDetail.value.title || mediaProps.title || '',
    undefined,
    undefined,
    existsServer.value,
  )
}

// 删除订阅处理
function onSubscribeEditRemove() {
  invalidateSharedData('media-status')
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
async function clickSearch(
  type: string,
  resultType: 'torrent' | 'subtitle' = 'torrent',
  options: MediaSearchOptions = {},
) {
  searchType.value = type
  pendingSearchResultType.value = resultType
  pendingSearchOptions.value = options
  await Promise.all([querySites(), querySelectedSites()])
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
  mappingRequestId++
  window.removeEventListener('resize', updateEpisodeGroupScrollState)
})
useNativePageHeader({
  title: () => mediaDetail.value.title || mediaProps.title,
})
</script>

<template>
  <LoadingBanner v-if="!isRefreshed" class="mt-12" />
  <div
    v-if="hasMediaIdentity()"
    class="media-detail-root max-w-8xl mx-auto px-4"
    :class="{
      'media-detail-glass': isGlassTheme,
    }"
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
          <h1
            class="d-flex flex-column flex-lg-row align-baseline justify-center justify-lg-start"
            data-native-page-title
          >
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
        <div v-if="hasSubscribeAction || secondaryActionCount > 0" class="media-actions">
          <VBtn
            v-if="hasSubscribeAction"
            class="media-action-button media-action-button--primary"
            :color="getSubscribeColor"
            variant="flat"
            rounded="pill"
            @click="handleSubscribe()"
          >
            <template #prepend>
              <VIcon :icon="getSubscribeIcon" />
            </template>
            {{ getSubscribeText }}
          </VBtn>
          <div
            v-if="secondaryActionCount > 0"
            class="media-action-secondary"
            :class="`media-action-secondary--${secondaryActionCount}`"
          >
            <VBtn v-if="hasSearchActions" variant="tonal" color="primary" class="media-action-button" rounded="pill">
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
              v-if="hasSearchActions"
              variant="tonal"
              color="info"
              class="media-action-button"
              rounded="pill"
              @click="handleSubtitleSearch"
            >
              <template #prepend>
                <VIcon icon="mdi-subtitles-outline" />
              </template>
              {{ t('media.actions.searchSubtitle') }}
            </VBtn>
            <VBtn
              v-if="existsItemId"
              class="media-action-button"
              variant="tonal"
              color="success"
              rounded="pill"
              @click="handlePlay()"
            >
              <template #prepend>
                <VIcon icon="mdi-play" />
              </template>
              {{ t('media.actions.playOnline') }}
            </VBtn>
          </div>
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
              <RouterLink :to="`/person?source=themoviedb&personid=${director.id}`" class="crew-name" target="_blank">
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
              v-if="mediaDetail.tmdb_id || sharedTmdbMapping"
              class="mb-2 mr-2 inline-flex last:mr-0"
              :href="getTheMovieDbLink()"
              target="_blank"
              rel="noopener noreferrer"
            >
              <div
                class="media-source-link-chip inline-flex cursor-pointer items-center rounded-full border border-[var(--mp-border)] bg-[var(--mp-muted)] px-2.5 py-1 text-sm text-[var(--mp-fg)] transition hover:border-[var(--mp-input)] hover:bg-[var(--mp-list-row-hover)]"
              >
                <VIcon icon="mdi-link" size="16" />
                <span class="ms-1">TheMovieDb</span>
              </div>
            </a>
            <button
              v-else-if="showTmdbLookup"
              type="button"
              class="mb-2 mr-2 inline-flex last:mr-0"
              :disabled="!canLookupTmdb"
              :aria-busy="tmdbLookupState === 'searching'"
              @click="lookupTmdbMapping"
            >
              <div
                class="media-source-link-chip inline-flex items-center rounded-full border border-[var(--mp-border)] bg-[var(--mp-muted)] px-2.5 py-1 text-sm text-[var(--mp-fg)] transition"
                :class="
                  canLookupTmdb
                    ? 'cursor-pointer hover:border-[var(--mp-input)] hover:bg-[var(--mp-list-row-hover)]'
                    : 'cursor-default opacity-70'
                "
              >
                <VProgressCircular v-if="tmdbLookupState === 'searching'" indeterminate size="14" width="2" />
                <VIcon v-else :icon="tmdbLookupIcon" size="16" />
                <span class="ms-1">{{ tmdbLookupLabel }}</span>
              </div>
            </button>
            <div v-if="mediaDetail.douban_id" class="mb-2 mr-2 inline-flex last:mr-0" @click="handleDoubanClick">
              <div
                class="media-source-link-chip inline-flex cursor-pointer items-center rounded-full border border-[var(--mp-border)] bg-[var(--mp-muted)] px-2.5 py-1 text-sm text-[var(--mp-fg)] transition hover:border-[var(--mp-input)] hover:bg-[var(--mp-list-row-hover)]"
              >
                <VIcon icon="mdi-link" size="16" />
                <span class="ms-1">豆瓣</span>
              </div>
            </div>
            <a v-if="mediaDetail.imdb_id" class="mb-2 mr-2 inline-flex last:mr-0" :href="getImdbLink()" target="_blank">
              <div
                class="media-source-link-chip inline-flex cursor-pointer items-center rounded-full border border-[var(--mp-border)] bg-[var(--mp-muted)] px-2.5 py-1 text-sm text-[var(--mp-fg)] transition hover:border-[var(--mp-input)] hover:bg-[var(--mp-list-row-hover)]"
              >
                <VIcon icon="mdi-link" size="16" />
                <span class="ms-1">IMDb</span>
              </div>
            </a>
            <a v-if="mediaDetail.tvdb_id" class="mb-2 mr-2 inline-flex last:mr-0" :href="getTvdbLink()" target="_blank">
              <div
                class="media-source-link-chip inline-flex cursor-pointer items-center rounded-full border border-[var(--mp-border)] bg-[var(--mp-muted)] px-2.5 py-1 text-sm text-[var(--mp-fg)] transition hover:border-[var(--mp-input)] hover:bg-[var(--mp-list-row-hover)]"
              >
                <VIcon icon="mdi-link" size="16" />
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
                class="media-source-link-chip inline-flex cursor-pointer items-center rounded-full border border-[var(--mp-border)] bg-[var(--mp-muted)] px-2.5 py-1 text-sm text-[var(--mp-fg)] transition hover:border-[var(--mp-input)] hover:bg-[var(--mp-list-row-hover)]"
              >
                <VIcon icon="mdi-link" size="16" />
                <span class="ms-1">Bangumi</span>
              </div>
            </a>
            <a
              v-if="mediaDetail.anilist_id"
              class="mb-2 mr-2 inline-flex last:mr-0"
              :href="getAniListLink()"
              target="_blank"
            >
              <div
                class="media-source-link-chip inline-flex cursor-pointer items-center rounded-full border border-[var(--mp-border)] bg-[var(--mp-muted)] px-2.5 py-1 text-sm text-[var(--mp-fg)] transition hover:border-[var(--mp-input)] hover:bg-[var(--mp-list-row-hover)]"
              >
                <VIcon icon="mdi-link" size="16" />
                <span class="ms-1">AniList</span>
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
                  <div
                    ref="episodeGroupRail"
                    class="episode-group-rail"
                    @scroll.passive="updateEpisodeGroupScrollState"
                  >
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
                        <VChip
                          v-if="seasonsNotExisted && (season.episode_count ?? 0) > 0"
                          :color="getExistColor(season.season_number || 0)"
                          flat
                        >
                          {{ getExistText(season.season_number || 0) }}
                          <VTooltip activator="parent" location="top">
                            {{ getExistHint(season.season_number || 0) }}
                          </VTooltip>
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
                    <div class="media-episode-list flex flex-col justify-center">
                      <div
                        v-for="episode in seasonEpisodesInfo[season.season_number || 0]"
                        :key="episode.episode_number"
                        class="media-episode-row flex flex-col space-y-4 py-4 xl:flex-row xl:space-y-4 xl:space-x-4"
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
                            <div v-if="episode.air_date" class="flex items-center space-x-2">
                              <span
                                class="media-episode-date px-2 inline-flex text-xs leading-5 font-semibold rounded-full whitespace-nowrap cursor-default"
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
                  <span
                    class="inline-flex items-center justify-center h-4 w-4 text-[0.6rem] font-bold text-current border border-current leading-none"
                  >
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
                  <span
                    class="inline-flex items-center justify-center h-4 w-4 text-[0.6rem] font-bold text-current border border-current leading-none"
                  >
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
        <div v-else-if="mediaDetail.bangumi_id || mediaDetail.anilist_id" class="media-overview-right">
          <div class="media-facts">
            <div v-if="mediaDetail.vote_average" class="media-ratings">
              <VRating v-model="mediaDetail.vote_average" density="compact" length="10" class="ma-2" readonly />
            </div>
            <div v-if="mediaDetail.bangumi_id" class="media-fact">
              <span>ID</span>
              <span class="media-fact-value">{{ mediaDetail.bangumi_id }}</span>
            </div>
            <div v-if="mediaDetail.anilist_id" class="media-fact">
              <span>ID</span>
              <span class="media-fact-value">{{ mediaDetail.anilist_id }}</span>
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
      <div v-else-if="mediaDetail.anilist_id">
        <PersonCardSlideView
          :apipath="`anilist/credits/${mediaDetail.anilist_id}`"
          :linkurl="`/credits/anilist/credits/${mediaDetail.anilist_id}?title=${t('media.castAndCrew')}&type=anilist`"
          :title="t('media.castAndCrew')"
          type="anilist"
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
      <div v-else-if="mediaDetail.anilist_id">
        <MediaCardSlideView
          :apipath="`anilist/recommend/${mediaDetail.anilist_id}`"
          :linkurl="`/browse/anilist/recommend/${mediaDetail.anilist_id}?title=${t('media.recommendations')}`"
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
      <div v-if="mediaDetail.douban_id">
        <MediaCommentView :doubanid="mediaDetail.douban_id" :type="mediaProps.type" />
      </div>
    </div>
  </div>
  <NoDataFound
    v-if="detailLoadFailed"
    error-code="500"
    :error-title="t('media.error.title')"
    :error-description="t('error.networkError')"
  >
    <template #button>
      <VBtn prepend-icon="mdi-refresh" variant="tonal" @click="getMediaDetail">{{ t('common.retry') }}</VBtn>
    </template>
  </NoDataFound>
  <NoDataFound
    v-else-if="!hasMediaIdentity() && isRefreshed"
    error-code="500"
    :error-title="t('media.error.title')"
    :error-description="t('media.error.noMediaInfo')"
  />
  <MediaEpisodePickerDialog
    v-model="playEpisodeDialog"
    :season="playEpisodeSeason"
    :seasons="playEpisodeSeasonOptions"
    :episodes="playEpisodeOptions"
    :loading="playEpisodeIdsLoading"
    :failed="playEpisodeIdsFailed"
    :image-source="getEpisodeImage"
    @update:season="changePlayEpisodeSeason"
    @play="playSelectedEpisode"
  />
</template>

<style lang="scss" scoped>
:global(.page-content-container > .main-content-wrapper:has(.media-detail-root)) {
  inline-size: 100% !important;
  min-inline-size: 0;
}

.vue-media-back {
  --media-backdrop-edge-opacity: 1;

  z-index: 0;
  pointer-events: none;
  background-image:
    linear-gradient(
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

.media-detail-glass .vue-media-back-overlay {
  display: none;
}

.media-detail-glass .vue-media-back-image {
  mask-image:
    linear-gradient(to bottom, transparent 0%, #000 16%, #000 58%, transparent 100%),
    linear-gradient(to right, transparent 0%, #000 10%, #000 90%, transparent 100%);
  mask-composite: intersect;
  -webkit-mask-image:
    linear-gradient(to bottom, transparent 0%, #000 16%, #000 58%, transparent 100%),
    linear-gradient(to right, transparent 0%, #000 10%, #000 90%, transparent 100%);
  -webkit-mask-composite: source-in;
}

.media-detail-glass .vue-media-back-image {
  opacity: 0.88;
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
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) minmax(0, 24rem);
    align-items: flex-end;
    column-gap: 1rem;
  }

  .media-poster {
    margin-inline-end: 0;
  }

  .media-title {
    flex: initial;
    min-inline-size: 0;
    margin-inline-end: 0;
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

.media-detail-glass .media-source-link-chip {
  border: 1px solid var(--glass-border);
  -webkit-backdrop-filter: var(--glass-chip-backdrop-filter);
  backdrop-filter: var(--glass-chip-backdrop-filter);
  background-color: var(--glass-button-surface);
  background-image: var(--glass-chip-sheen);
  box-shadow: var(--glass-control-shadow);
  color: rgb(var(--v-theme-on-surface));
}

.media-detail-glass .media-source-link-chip:hover {
  border-color: var(--glass-border-hover);
  background-color: var(--glass-button-surface-hover);
  box-shadow: var(--glass-control-shadow-hover);
}

.media-episode-row + .media-episode-row {
  border-block-start: 1px solid var(--mp-list-row-divider);
}

.media-episode-date {
  border: 1px solid var(--mp-border);
  background-color: var(--mp-muted);
  color: var(--mp-muted-fg);
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
  --media-action-gap: 0.5rem;

  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--media-action-gap);
  inline-size: min(100%, 24rem);
  margin-block-start: 1rem;
}

.media-action-button {
  inline-size: 100%;
  min-inline-size: 0;
}

.media-action-secondary {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--media-action-gap);
}

.media-action-secondary--1 {
  grid-template-columns: minmax(0, 1fr);
}

.media-action-secondary--2 {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

@media (width >= 1280px) {
  .media-actions {
    margin-block-start: 0;
    inline-size: 100%;
    max-inline-size: 24rem;
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
  backdrop-filter: var(--app-grouped-list-backdrop-filter, blur(6px));
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
  backdrop-filter: var(--app-grouped-list-backdrop-filter, blur(6px));
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

.media-detail-glass .episode-group-option {
  -webkit-backdrop-filter: var(--glass-surface-backdrop-filter);
  backdrop-filter: var(--glass-surface-backdrop-filter);
  border-color: var(--glass-border);
  background-color: var(--glass-surface);
  background-image: var(--glass-sheen);
  box-shadow: var(--glass-control-shadow);
}

.media-detail-glass .episode-group-option:hover {
  border-color: var(--glass-border-hover);
  background-color: var(--glass-surface-soft);
  box-shadow: var(--glass-control-shadow-hover);
}

.media-detail-glass .episode-group-option--active {
  border-color: rgba(var(--v-theme-primary), 0.7);
  background-color: rgba(var(--v-theme-primary), 0.22);
}

.media-detail-glass .episode-group-option--active:hover {
  background-color: rgba(var(--v-theme-primary), 0.28);
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
  border: 1px solid var(--mp-border);
  border-radius: var(--app-surface-radius);
  background-color: var(--mp-surface);
  font-size: 0.875rem;
  font-weight: 700;
  line-height: 1.25rem;
}

.media-detail-glass .media-facts {
  border-color: var(--glass-border);
  -webkit-backdrop-filter: var(--glass-surface-backdrop-filter);
  backdrop-filter: var(--glass-surface-backdrop-filter);
  background-color: var(--glass-surface);
  background-image: var(--glass-sheen);
  box-shadow: var(--glass-shadow);
}

.media-ratings {
  display: flex;
  align-items: center;
  justify-content: center;
  border-block-end: 1px solid var(--mp-border);
  font-weight: 500;
  padding-block: 0.5rem;
  padding-inline: 1rem;
}

.media-fact {
  display: flex;
  justify-content: space-between;
  border-block-end: 1px solid var(--mp-border);
  padding-block: 0.5rem;
  padding-inline: 1rem;
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
