<script setup lang="ts">
import type { LocationQuery } from 'vue-router'
import NoDataFound from '@/components/states/NoDataFound.vue'
import api from '@/api'
import type { Context, MediaDataSource, SubtitleInfo } from '@/api/types'
import TorrentCard from '@/components/cards/TorrentCard.vue'
import TorrentItem from '@/components/cards/TorrentItem.vue'
import SubtitleCard from '@/components/cards/SubtitleCard.vue'
import SubtitleItem from '@/components/cards/SubtitleItem.vue'
import ProgressiveCardGrid from '@/components/misc/ProgressiveCardGrid.vue'
import TorrentFilterBar from '@/components/filter/TorrentFilterBar.vue'
import { useI18n } from 'vue-i18n'
import { useGlobalSettingsStore } from '@/stores/global'
import { useTorrentFilter, type FilterState } from '@/composables/useTorrentFilter'
import { useDynamicButton } from '@/composables/useDynamicButton'
import { usePWA } from '@/composables/usePWA'
import { useToast } from 'vue-toastification'
import { useKeepAliveRefresh } from '@/composables/useKeepAliveRefresh'
import { useUserStore } from '@/stores'
import { buildUserPermissionContext, hasPermission } from '@/utils/permission'
import { SearchReplaceBatchCollector, isSearchReplaceBatchEvent } from '@/utils/searchStream'
import { getCurrentLocale } from '@/plugins/i18n'
import { isMediaDataSource, isValidMediaSourceId } from '@/utils/mediaId'

// 国际化
const { t } = useI18n()

const { appMode } = usePWA()
const userStore = useUserStore()
const canSearch = computed(() =>
  hasPermission(buildUserPermissionContext(userStore.superUser, userStore.permissions), 'search'),
)

// 提示框
const toast = useToast()

// 全局设置 Store
const globalSettingsStore = useGlobalSettingsStore()

// 使用筛选 composable
const torrentFilter = useTorrentFilter()

// 路由参数
const route = useRoute()
const router = useRouter()

interface SearchParams {
  keyword: string
  media_source: MediaDataSource | ''
  media_id: string
  type: string
  area: string
  title: string
  year: string
  season: string
  episode: string
  sites: string
  music_type: string
  result_type: string
}

interface LastSearchContextResponse {
  params?: Partial<SearchParams>
  results?: Array<Context | SubtitleInfo>
}

interface AiRecommendStatusData {
  status?: string
  results?: number[]
  error_i18n?: string
  error?: string
  message_i18n?: string
  message?: string
}

const resourceSearchParamsStorageKey = 'MP_ResourceSearchParams'
type TorrentViewType = 'card' | 'row'
// 只有最新搜索可以提交结果和可重放参数，避免旧请求覆盖新查询。
let activeSearchRequestId = 0

/** 接受内置或插件扩展来源，并拒绝格式非法的来源标识。 */
function normalizeMediaSource(value: unknown): MediaDataSource | '' {
  const normalized = value?.toString().trim().toLowerCase()
  return isMediaDataSource(normalized) ? normalized : ''
}

function createSearchParams(query: LocationQuery): SearchParams {
  return {
    keyword: query?.keyword?.toString() ?? '',
    media_source: normalizeMediaSource(query?.media_source),
    media_id: query?.media_id?.toString() ?? '',
    type: query?.type?.toString() ?? '',
    area: query?.area?.toString() ?? '',
    title: query?.title?.toString() ?? '',
    year: query?.year?.toString() ?? '',
    season: query?.season?.toString() ?? '',
    episode: query?.episode?.toString() ?? '',
    sites: query?.sites?.toString() ?? '',
    music_type: query?.music_type?.toString() ?? '',
    result_type: query?.result_type?.toString() === 'subtitle' ? 'subtitle' : 'torrent',
  }
}

function normalizeSearchParams(params?: Partial<SearchParams> | null): SearchParams {
  return {
    keyword: params?.keyword?.toString() ?? '',
    media_source: normalizeMediaSource(params?.media_source),
    media_id: params?.media_id?.toString() ?? '',
    type: params?.type?.toString() ?? '',
    area: params?.area?.toString() ?? '',
    title: params?.title?.toString() ?? '',
    year: params?.year?.toString() ?? '',
    season: params?.season?.toString() ?? '',
    episode: params?.episode?.toString() ?? '',
    sites: params?.sites?.toString() ?? '',
    music_type: params?.music_type?.toString() ?? '',
    result_type: params?.result_type?.toString() === 'subtitle' ? 'subtitle' : 'torrent',
  }
}

/** 判断搜索参数是否包含一组有效的枚举来源与原生媒体 ID。 */
function hasValidMediaIdentity(params: SearchParams): boolean {
  const mediaId = params.media_id.trim()
  return Boolean(params.media_source && mediaId && isValidMediaSourceId(mediaId, params.media_source))
}

function hasSearchKeyword(params: SearchParams): boolean {
  return params.keyword.trim().length > 0 || hasValidMediaIdentity(params)
}

/** 只在本地历史状态读取边界迁移旧版 `source:id` 复合关键词。 */
function migrateLegacyStoredSearchParams(params: Partial<SearchParams>): Partial<SearchParams> {
  if (params.media_source || params.media_id || typeof params.keyword !== 'string') return params
  const match = params.keyword.match(/^([a-zA-Z_]+):(.+)$/)
  if (!match) return params
  const aliases: Record<string, MediaDataSource> = {
    tmdb: 'themoviedb',
    themoviedb: 'themoviedb',
    douban: 'douban',
    bangumi: 'bangumi',
    anilist: 'anilist',
    imdb: 'imdb',
    tvdb: 'tvdb',
    musicbrainz: 'musicbrainz',
    theaudiodb: 'theaudiodb',
    doubanmusic: 'doubanmusic',
    bilibili: 'bilibili',
    mangguodiscover: 'mangguodiscover',
    migu: 'migu',
    tencentvideodiscover: 'tencentvideodiscover',
  }
  const mediaSource = aliases[match[1].toLowerCase()]
  const mediaId = match[2].trim()
  return mediaSource && mediaId && isValidMediaSourceId(mediaId, mediaSource)
    ? { ...params, keyword: '', media_source: mediaSource, media_id: mediaId }
    : params
}

function createSearchRequestToken(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function normalizeTorrentViewType(value: string | null): TorrentViewType {
  return value === 'row' ? 'row' : 'card'
}

function loadStoredSearchParams(): SearchParams | null {
  try {
    const rawParams = localStorage.getItem(resourceSearchParamsStorageKey)
    if (!rawParams) return null

    const storedParams = JSON.parse(rawParams) as Partial<SearchParams>
    const params = normalizeSearchParams(migrateLegacyStoredSearchParams(storedParams))
    return hasSearchKeyword(params) ? params : null
  } catch (error) {
    console.warn('读取资源搜索参数失败:', error)
    localStorage.removeItem(resourceSearchParamsStorageKey)
    return null
  }
}

function saveStoredSearchParams(params: SearchParams) {
  if (!hasSearchKeyword(params)) return
  localStorage.setItem(resourceSearchParamsStorageKey, JSON.stringify(params))
}

const initialSearchParams = createSearchParams(route.query)
const activeSearchParams = ref<SearchParams>(initialSearchParams)
const lastSearchParams = ref<SearchParams | null>(
  hasSearchKeyword(initialSearchParams) ? { ...initialSearchParams } : loadStoredSearchParams(),
)

function rememberSearchParams(params: SearchParams) {
  if (!hasSearchKeyword(params)) return

  const nextParams = { ...params }
  lastSearchParams.value = nextParams
  saveStoredSearchParams(nextParams)
}

function applyRememberedSearchParams(params?: Partial<SearchParams> | null, syncActive: boolean = false) {
  const nextParams = normalizeSearchParams(params)
  if (!hasSearchKeyword(nextParams)) return null

  rememberSearchParams(nextParams)
  if (syncActive || !hasSearchKeyword(activeSearchParams.value)) {
    activeSearchParams.value = { ...nextParams }
  }
  return nextParams
}

if (hasSearchKeyword(initialSearchParams)) {
  rememberSearchParams(initialSearchParams)
}

async function fetchLastSearchContext() {
  const requestId = activeSearchRequestId
  try {
    const result = (await api.get('search/last/context')) as LastSearchContextResponse
    if (requestId === activeSearchRequestId) {
      applyRememberedSearchParams(result?.params, true)
    }
    return Array.isArray(result?.results) ? result.results : []
  } catch (error) {
    console.warn('读取上次搜索上下文失败，回退到仅加载结果:', error)
    const results = await api.get('search/last')
    return (results as unknown as Context[]) || []
  }
}

async function resolveRefreshSearchParams() {
  if (hasSearchKeyword(activeSearchParams.value)) {
    return { ...activeSearchParams.value }
  }
  if (lastSearchParams.value && hasSearchKeyword(lastSearchParams.value)) {
    return { ...lastSearchParams.value }
  }

  const storedParams = loadStoredSearchParams()
  if (storedParams) {
    applyRememberedSearchParams(storedParams, true)
    return { ...storedParams }
  }

  await fetchLastSearchContext()
  if (lastSearchParams.value && hasSearchKeyword(lastSearchParams.value)) {
    return { ...lastSearchParams.value }
  }

  return null
}

// 查询TMDBID或标题
const keyword = computed(() => activeSearchParams.value.keyword)

// 精确媒体身份对用户无意义，进度卡片中仅展示标题即可。
const isMediaIdKeyword = computed(() => hasValidMediaIdentity(activeSearchParams.value))

// 查询类型
const type = computed(() => activeSearchParams.value.type)

// 搜索字段
const area = computed(() => activeSearchParams.value.area)

// 搜索标题
const title = computed(() => activeSearchParams.value.title)

// 搜索年份
const year = computed(() => activeSearchParams.value.year)

// 搜索季
const season = computed(() => activeSearchParams.value.season)

// 搜索站点，以,分离多个
const sites = computed(() => activeSearchParams.value.sites)

// 搜索结果类型
const resultType = computed(() => (activeSearchParams.value.result_type === 'subtitle' ? 'subtitle' : 'torrent'))

// 是否为字幕搜索
const isSubtitleSearch = computed(() => resultType.value === 'subtitle')

// 视图类型，从localStorage中读取
const viewType = ref<TorrentViewType>(normalizeTorrentViewType(localStorage.getItem('MPTorrentsViewType')))

// 智能推荐相关
// 从全局设置中获取 AI_RECOMMEND_ENABLED 状态
const aiRecommendEnabled = computed(() => {
  return globalSettingsStore.get('AI_RECOMMEND_ENABLED') === true
})
const isRecommending = ref(false)
const isReRecommending = ref(false) // 是否正在重新推荐
const aiRecommended = ref(false) // 是否已执行过智能推荐
const showingAiResults = ref(false) // 是否正在显示智能推荐结果
const originalDataList = ref<Array<Context>>([]) // 原始搜索结果
const aiRecommendedList = ref<Array<Context>>([]) // 智能推荐结果
const savedFilterState = ref<FilterState | null>(null) // 保存的筛选状态
const aiStatusChecked = ref(false) // 是否已完成首次AI状态检查
let aiStatusCheckInterval: ReturnType<typeof setInterval> | null = null // AI状态检查定时器

// 是否有搜索标签
const hasSearchTags = computed(() => {
  return !!(keyword.value || title.value || year.value || season.value)
})

// 是否启用筛选栏动画
const enableFilterAnimation = ref(true)

// 原始数据列表（未筛选）
const rawDataList = ref<Array<Context>>([])

// 原始字幕数据列表
const rawSubtitleDataList = ref<Array<SubtitleInfo>>([])

// 筛选后的数据列表（用于行视图）
const filteredRowDataList = ref<Array<Context>>([])

// 筛选后的数据列表（用于卡片视图）
interface SearchTorrent extends Context {
  more?: Array<Context>
}
const filteredCardDataList = ref<Array<SearchTorrent>>([])

// 是否刷新过
const isRefreshed = ref(false)

const viewToggleIcon = computed(() => (viewType.value === 'card' ? 'mdi-view-list-outline' : 'mdi-view-grid-outline'))

// 搜索结果视图切换收纳到页面动态按钮中，和仪表盘的设置按钮保持一致。
function toggleViewType() {
  changeViewType(viewType.value === 'card' ? 'row' : 'card')
}

useDynamicButton({
  icon: viewToggleIcon,
  onClick: toggleViewType,
  permission: 'search',
  show: computed(() => appMode.value && isRefreshed.value),
})

// 是否正在重新搜索
const isRefreshing = ref(false)

// 加载进度文本
const progressText = ref(t('common.pleaseWait'))

// 加载进度
const progressValue = ref(0)

// 进度是否有效
const progressEnabled = ref(false)

// 进度是否激活
const progressActive = ref(false)

let progressResetTimer: ReturnType<typeof setTimeout> | null = null

// 是否显示搜索进度
const isSearchProgressVisible = computed(
  () => progressActive.value || (!isRefreshed.value && (progressEnabled.value || progressValue.value > 0)),
)

// 归一化搜索进度，避免 SSE 异常值影响显示
const searchProgressPercent = computed(() => Math.min(100, Math.max(0, Math.ceil(Number(progressValue.value) || 0))))

// 搜索进度文案
const searchProgressLabel = computed(() =>
  progressEnabled.value || progressValue.value > 0 ? `${searchProgressPercent.value}%` : '...',
)

// 进度未返回前使用不确定态
const searchProgressIndeterminate = computed(() => !progressEnabled.value && searchProgressPercent.value <= 0)

// 错误标题
const errorTitle = ref(t('resource.noData'))

// 错误描述
const errorDescription = ref(t('resource.noResourceFound'))

let searchEventSource: EventSource | null = null
let searchStreamIdleTimer: ReturnType<typeof setTimeout> | null = null
let cancelActiveSearchStream: (() => void) | null = null

const streamPreviewLimit = 24
const streamUiFlushDelay = 1000
const streamPreviewBufferLimit = streamPreviewLimit * 4
// 兼容尚未提供心跳的旧后端，同时保留异常半开连接的最终兜底。
const searchStreamIdleTimeout = 5 * 60_000
const searchStreamDoneCloseDelay = 1500

const streamTotalCount = ref(0)
const streamPreviewDataList = ref<Array<Context>>([])
const streamPreviewSubtitleDataList = ref<Array<SubtitleInfo>>([])

// 搜索过程中还没有任何可展示结果时，显示骨架卡片，等搜索结束后再切换为空态。
const isSearchLoading = computed(() => {
  if (!isSearchProgressVisible.value) return false

  return isSubtitleSearch.value
    ? rawSubtitleDataList.value.length === 0 && streamPreviewSubtitleDataList.value.length === 0
    : rawDataList.value.length === 0 && streamPreviewDataList.value.length === 0
})

const displayResourceCount = computed(() =>
  progressActive.value
    ? streamTotalCount.value
    : isSubtitleSearch.value
      ? rawSubtitleDataList.value.length
      : torrentFilter.totalFilteredCount.value,
)

// 搜索中只显示进度区域，避免结果抬头和进度条同时占用顶部空间。
const showResultHeader = computed(() => isRefreshed.value && !progressActive.value)

// 记录过滤前的候选资源数，用于过滤后无结果时给出友好提示
let streamCandidateCount = 0

let pendingStreamItems: Array<Context> = []
let pendingSubtitleStreamItems: Array<SubtitleInfo> = []
const streamReplaceBatchCollector = new SearchReplaceBatchCollector<Context>()
const subtitleReplaceBatchCollector = new SearchReplaceBatchCollector<SubtitleInfo>()
let streamFlushTimer: ReturnType<typeof setTimeout> | null = null
let streamFinalResultApplied = false
let pendingProgressText: string | null = null
let pendingProgressValue: number | null = null
let pendingStreamTotalCount: number | null = null

// 监听筛选条件变化，重新筛选数据
watch(
  [() => torrentFilter.filterForm, () => torrentFilter.sortField.value, () => torrentFilter.sortType.value],
  () => {
    applyFilter()
  },
  { deep: true },
)

// 应用筛选
function applyFilter() {
  if (isSubtitleSearch.value) return

  if (viewType.value === 'row') {
    filteredRowDataList.value = torrentFilter.filterRowData(rawDataList.value)
  } else {
    filteredCardDataList.value = torrentFilter.filterCardData(rawDataList.value)
  }
}

// 处理筛选表单更新
function handleFilterFormUpdate(key: string, values: string[]) {
  torrentFilter.filterForm[key] = values
}

// 处理全选
function handleSelectAll(key: string) {
  torrentFilter.selectAll(key)
}

// 处理清除筛选
function handleClearFilter(key: string) {
  torrentFilter.clearFilter(key)
}

// 处理清除所有筛选
function handleClearAllFilters() {
  torrentFilter.clearAllFilters()
}

// 处理移除单个筛选
function handleRemoveFilter(key: string, value: string) {
  torrentFilter.removeFilter(key, value)
}

// 使用SSE监听加载进度
function startLoadingProgress() {
  clearProgressResetTimer()
  progressText.value = t('resource.searching')
  progressValue.value = 0
  progressEnabled.value = true
  progressActive.value = true
}

// 停止监听加载进度
function stopLoadingProgress() {
  progressActive.value = false

  // 确保进度显示100%，然后再渐进清零
  progressValue.value = 100
  clearProgressResetTimer()
  progressResetTimer = setTimeout(() => {
    progressResetTimer = null
    progressValue.value = 0
    progressEnabled.value = false
  }, 1500)
}

// 清除延迟归零任务，避免新搜索继承上一轮的进度重置。
function clearProgressResetTimer() {
  if (progressResetTimer) {
    clearTimeout(progressResetTimer)
    progressResetTimer = null
  }
}

// 关闭SSE连接
function closeSearchEventSource(source?: EventSource) {
  if (source && searchEventSource !== source) {
    source.close()
    return
  }

  if (searchEventSource) {
    searchEventSource.close()
    searchEventSource = null
  }

  clearSearchStreamIdleTimer()
}

// 清除搜索流空闲计时器。
function clearSearchStreamIdleTimer() {
  if (searchStreamIdleTimer) {
    clearTimeout(searchStreamIdleTimer)
    searchStreamIdleTimer = null
  }
}

// 渐进式搜索期间只保留有限预览数据，避免每个批次都触发完整筛选和分组计算。
function clearStreamFlushTimer() {
  if (streamFlushTimer) {
    clearTimeout(streamFlushTimer)
    streamFlushTimer = null
  }
}

function clearStreamPreviewState(resetFinalState: boolean = false) {
  clearStreamFlushTimer()
  pendingStreamItems = []
  pendingSubtitleStreamItems = []
  pendingProgressText = null
  pendingProgressValue = null
  pendingStreamTotalCount = null
  streamReplaceBatchCollector.reset()
  subtitleReplaceBatchCollector.reset()
  streamPreviewDataList.value = []
  streamPreviewSubtitleDataList.value = []
  if (resetFinalState) {
    streamFinalResultApplied = false
  }
}

// 将进度和预览列表放到同一个节奏刷新，避免 SSE 到来时多处 UI 各自抖动。
function flushBufferedStreamState() {
  clearStreamFlushTimer()

  if (pendingProgressText !== null) {
    progressText.value = pendingProgressText
  }
  if (pendingProgressValue !== null) {
    progressValue.value = pendingProgressValue
  }
  if (pendingStreamTotalCount !== null) {
    streamTotalCount.value = pendingStreamTotalCount
  }

  pendingProgressText = null
  pendingProgressValue = null
  pendingStreamTotalCount = null

  if (pendingSubtitleStreamItems.length) {
    streamPreviewSubtitleDataList.value = [...pendingSubtitleStreamItems, ...streamPreviewSubtitleDataList.value].slice(
      0,
      streamPreviewLimit,
    )
    pendingSubtitleStreamItems = []
    isRefreshed.value = true
  }

  if (!pendingStreamItems.length) return

  streamPreviewDataList.value = [...pendingStreamItems, ...streamPreviewDataList.value].slice(0, streamPreviewLimit)
  pendingStreamItems = []
  isRefreshed.value = true
}

// 合并短时间内到达的预览和进度更新。
function scheduleStreamFlush() {
  if (streamFlushTimer) return
  streamFlushTimer = setTimeout(() => {
    flushBufferedStreamState()
  }, streamUiFlushDelay)
}

// 获取API URL
function getApiUrl(path: string) {
  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL
  const normalizedBaseUrl = apiBaseUrl.startsWith('http')
    ? apiBaseUrl
    : `${window.location.origin}${apiBaseUrl.startsWith('/') ? apiBaseUrl : `/${apiBaseUrl}`}`

  return new URL(path, normalizedBaseUrl.endsWith('/') ? normalizedBaseUrl : `${normalizedBaseUrl}/`)
}

// 设置搜索参数
function setSearchParam(params: URLSearchParams, key: string, value: unknown) {
  if (value !== undefined && value !== null && value !== '') {
    params.set(key, String(value))
  }
}

// 构建搜索流URL
function buildSearchStreamUrl(params: SearchParams, requestToken?: string) {
  const isMediaSearch = hasValidMediaIdentity(params)
  const url = getApiUrl(
    params.result_type === 'subtitle'
      ? isMediaSearch
        ? `search/subtitle/media/${encodeURIComponent(params.media_id)}/stream`
        : 'search/subtitle/title/stream'
      : isMediaSearch
        ? `search/media/${encodeURIComponent(params.media_id)}/stream`
        : 'search/title/stream',
  )

  if (params.result_type === 'subtitle' && isMediaSearch) {
    setSearchParam(url.searchParams, 'media_source', params.media_source)
    setSearchParam(url.searchParams, 'mtype', params.type)
    setSearchParam(url.searchParams, 'title', params.title)
    setSearchParam(url.searchParams, 'year', params.year)
    setSearchParam(url.searchParams, 'season', params.season)
    setSearchParam(url.searchParams, 'episode', params.episode)
    setSearchParam(url.searchParams, 'sites', params.sites)
  } else if (params.result_type === 'subtitle') {
    setSearchParam(url.searchParams, 'keyword', params.keyword)
    setSearchParam(url.searchParams, 'sites', params.sites)
  } else if (isMediaSearch) {
    setSearchParam(url.searchParams, 'media_source', params.media_source)
    setSearchParam(url.searchParams, 'mtype', params.type)
    setSearchParam(url.searchParams, 'area', params.area)
    setSearchParam(url.searchParams, 'title', params.title)
    setSearchParam(url.searchParams, 'year', params.year)
    setSearchParam(url.searchParams, 'season', params.season)
    setSearchParam(url.searchParams, 'sites', params.sites)
    setSearchParam(url.searchParams, 'music_type', params.music_type)
  } else {
    setSearchParam(url.searchParams, 'keyword', params.keyword)
    setSearchParam(url.searchParams, 'mtype', params.type)
    setSearchParam(url.searchParams, 'sites', params.sites)
  }

  if (requestToken) {
    setSearchParam(url.searchParams, '_ts', requestToken)
  }
  setSearchParam(url.searchParams, 'locale', getCurrentLocale())

  return url.toString()
}

// 重置搜索结果
function resetSearchResults() {
  clearStreamPreviewState(true)
  // 新搜索开始时先回到未完成态，避免上一轮空态在 SSE 返回前抢先显示。
  isRefreshed.value = false
  errorDescription.value = t('resource.noResourceFound')
  streamCandidateCount = 0
  rawDataList.value = []
  rawSubtitleDataList.value = []
  originalDataList.value = []
  streamTotalCount.value = 0
  aiRecommended.value = false
  showingAiResults.value = false
  aiRecommendedList.value = []
  savedFilterState.value = null
  aiStatusChecked.value = false
  torrentFilter.clearAllFilters()
  applyFilter()
}

// 判断当前页面是否已经完成过一次带关键词的空结果搜索，避免 keep-alive 返回时自动重搜。
function hasLoadedEmptySearchResult() {
  const dataLength = isSubtitleSearch.value ? rawSubtitleDataList.value.length : rawDataList.value.length
  return isRefreshed.value && !progressActive.value && dataLength === 0 && hasSearchKeyword(activeSearchParams.value)
}

// 更新搜索进度
function updateSearchProgress(eventData: { [key: string]: any }, flushNow: boolean = false) {
  const text = eventData.text_i18n || eventData.text
  if (text) {
    pendingProgressText = text
  }
  if (typeof eventData.value === 'number') {
    pendingProgressValue = eventData.value
  }
  if (typeof eventData.total_items === 'number') {
    pendingStreamTotalCount = eventData.total_items
  }
  progressEnabled.value = true

  if (flushNow) {
    flushBufferedStreamState()
  } else {
    scheduleStreamFlush()
  }
}

// 设置流式搜索结果
function setStreamResults(items: Context[]) {
  clearStreamPreviewState()
  rawDataList.value = items
  rawSubtitleDataList.value = []
  originalDataList.value = items
  if (!progressActive.value) {
    streamTotalCount.value = items.length
  }
  isRefreshed.value = true
  applyFilter()
}

// 设置字幕搜索结果
function setSubtitleStreamResults(items: SubtitleInfo[]) {
  clearStreamPreviewState()
  rawSubtitleDataList.value = items
  rawDataList.value = []
  originalDataList.value = []
  if (!progressActive.value) {
    streamTotalCount.value = items.length
  }
  isRefreshed.value = true
}

// 追加流式搜索预览结果
function appendStreamResults(items: Context[]) {
  if (!items.length) return

  pendingStreamItems.unshift(...items)
  if (pendingStreamItems.length > streamPreviewBufferLimit) {
    pendingStreamItems = pendingStreamItems.slice(0, streamPreviewBufferLimit)
  }
  scheduleStreamFlush()
}

// 追加流式字幕搜索预览结果
function appendSubtitleStreamResults(items: SubtitleInfo[]) {
  if (!items.length) return

  pendingSubtitleStreamItems.unshift(...items)
  if (pendingSubtitleStreamItems.length > streamPreviewBufferLimit) {
    pendingSubtitleStreamItems = pendingSubtitleStreamItems.slice(0, streamPreviewBufferLimit)
  }
  scheduleStreamFlush()
}

// 更新候选资源数：优先使用后端显式给出的 candidate_items，否则取搜索阶段事件的 total_items
function updateStreamCandidateCount(eventData: { candidate_items?: unknown; stage?: unknown; total_items?: unknown }) {
  if (typeof eventData.candidate_items === 'number') {
    streamCandidateCount = Math.max(streamCandidateCount, eventData.candidate_items)
  } else if (eventData.stage === 'searching' && typeof eventData.total_items === 'number') {
    streamCandidateCount = Math.max(streamCandidateCount, eventData.total_items)
  }
}

// 过滤后无结果但存在候选资源时，用友好提示替代默认的“未搜索到任何资源”
function applyFilteredEmptyResultMessage(resultCount: number) {
  if (resultCount === 0 && streamCandidateCount > 0) {
    errorDescription.value = t('resource.filteredNoResults', { count: streamCandidateCount })
  }
}

// 完整最终结果到达后原子替换资源列表。
function applyFinalStreamResults(items: Context[]) {
  streamFinalResultApplied = true
  flushBufferedStreamState()
  setStreamResults(items)
  // 候选全部被过滤规则淘汰时给出友好提示
  applyFilteredEmptyResultMessage(items.length)
}

// 应用最终字幕搜索结果
function applyFinalSubtitleStreamResults(items: SubtitleInfo[]) {
  streamFinalResultApplied = true
  flushBufferedStreamState()
  setSubtitleStreamResults(items)
}

// 获取磁力链接的key
function getTorrentItemKey(item: Context, index: number) {
  return (
    item.torrent_info?.page_url ||
    item.torrent_info?.enclosure ||
    `${item.torrent_info?.site_name || ''}-${item.torrent_info?.title || ''}-${item.torrent_info?.description || ''}` ||
    `torrent-${index}`
  )
}

// 获取字幕结果的key
function getSubtitleItemKey(item: SubtitleInfo, index: number) {
  return (
    item.enclosure ||
    item.page_url ||
    `${item.site_name || ''}-${item.subtitle_id || ''}-${item.title || ''}` ||
    `subtitle-${index}`
  )
}

// 处理搜索流消息
function handleSearchStreamMessage(eventData: { [key: string]: any }) {
  if (eventData.type === 'heartbeat') return

  if (eventData.type === 'error') {
    updateSearchProgress(eventData, true)
    errorDescription.value = eventData.message_i18n || eventData.message || t('resource.noResourceFound')
    return
  }

  if (isSearchReplaceBatchEvent<Context | SubtitleInfo>(eventData)) {
    if (isSubtitleSearch.value) {
      const completedItems = subtitleReplaceBatchCollector.append(eventData)
      updateSearchProgress(eventData, completedItems !== null)
      if (completedItems) applyFinalSubtitleStreamResults(completedItems)
    } else {
      updateStreamCandidateCount(eventData)
      const completedItems = streamReplaceBatchCollector.append(eventData)
      updateSearchProgress(eventData, completedItems !== null)
      if (completedItems) applyFinalStreamResults(completedItems)
    }
    return
  }

  if (isSubtitleSearch.value) {
    const subtitleItems = Array.isArray(eventData.items) ? (eventData.items as SubtitleInfo[]) : []
    if (eventData.type === 'append') {
      updateSearchProgress(eventData)
      appendSubtitleStreamResults(subtitleItems)
    } else if (eventData.type === 'replace') {
      updateSearchProgress(eventData, true)
      applyFinalSubtitleStreamResults(subtitleItems)
    } else if (eventData.type === 'done' && subtitleItems.length > 0 && !streamFinalResultApplied) {
      updateSearchProgress(eventData, true)
      applyFinalSubtitleStreamResults(subtitleItems)
    } else {
      updateSearchProgress(eventData)
    }
    return
  }

  const items = Array.isArray(eventData.items) ? (eventData.items as Context[]) : []
  updateStreamCandidateCount(eventData)
  if (eventData.type === 'append') {
    updateSearchProgress(eventData)
    appendStreamResults(items)
  } else if (eventData.type === 'replace') {
    updateSearchProgress(eventData, true)
    applyFinalStreamResults(items)
  } else if (eventData.type === 'done' && items.length > 0 && !streamFinalResultApplied) {
    updateSearchProgress(eventData, true)
    applyFinalStreamResults(items)
  } else {
    updateSearchProgress(eventData)
    // 标题搜索没有 replace 事件，最终结果为空时在此给出友好提示
    if (eventData.type === 'done' && !streamFinalResultApplied) {
      applyFilteredEmptyResultMessage(items.length)
    }
  }
}

// 按请求搜索
async function searchByRequest(params: SearchParams, requestToken: string | undefined, requestId: number) {
  const items = await requestSearchResults(params, requestToken)
  if (requestId !== activeSearchRequestId) return false

  errorDescription.value = t('resource.noResourceFound')
  streamTotalCount.value = items.length
  if (params.result_type === 'subtitle') {
    setSubtitleStreamResults(items as SubtitleInfo[])
  } else {
    setStreamResults(items as Context[])
  }
  return true
}

// 静默刷新使用普通请求，保留当前结果直到新数据完整返回，避免返回页面时露出搜索进度态。
async function requestSearchResults(params: SearchParams, requestToken?: string) {
  let result: Array<Context | SubtitleInfo>
  const isMediaSearch = hasValidMediaIdentity(params)
  if (params.result_type === 'subtitle' && isMediaSearch) {
    result = await api.get(`search/subtitle/media/${encodeURIComponent(params.media_id)}`, {
      params: {
        media_source: params.media_source,
        mtype: params.type,
        title: params.title,
        year: params.year,
        season: params.season,
        episode: params.episode,
        sites: params.sites,
        _ts: requestToken,
      },
    })
  } else if (params.result_type === 'subtitle') {
    result = await api.get('search/subtitle/title', {
      params: {
        keyword: params.keyword,
        sites: params.sites,
        _ts: requestToken,
      },
    })
  } else if (isMediaSearch) {
    result = await api.get(`search/media/${encodeURIComponent(params.media_id)}`, {
      params: {
        media_source: params.media_source,
        mtype: params.type,
        area: params.area,
        title: params.title,
        year: params.year,
        ...(params.season ? { season: params.season } : {}),
        ...(params.sites ? { sites: params.sites } : {}),
        ...(params.music_type ? { music_type: params.music_type } : {}),
        _ts: requestToken,
      },
    })
  } else {
    // 按标题模糊查询
    result = await api.get(`search/title`, {
      params: {
        keyword: params.keyword,
        ...(params.type ? { mtype: params.type } : {}),
        sites: params.sites,
        _ts: requestToken,
      },
    })
  }

  return result || []
}

// 按流搜索
function searchByStream(params: SearchParams, requestToken?: string) {
  // 新搜索必须显式结束上一轮 Promise；EventSource.close() 本身不会触发 error。
  cancelActiveSearchStream?.()

  return new Promise<void>((resolve, reject) => {
    let settled = false
    let receivedDone = false
    const source = new EventSource(buildSearchStreamUrl(params, requestToken))
    searchEventSource = source

    const settleSearchStream = (callback: () => void) => {
      if (settled) return

      settled = true
      if (cancelActiveSearchStream === cancelThisSearch) {
        cancelActiveSearchStream = null
      }
      closeSearchEventSource(source)
      callback()
    }
    const cancelThisSearch = () => settleSearchStream(resolve)
    cancelActiveSearchStream = cancelThisSearch

    const resetIdleTimeout = () => {
      clearSearchStreamIdleTimer()
      searchStreamIdleTimer = setTimeout(() => {
        errorDescription.value = t('resource.searchStreamTimeout')
        settleSearchStream(() => reject(new Error(errorDescription.value)))
      }, searchStreamIdleTimeout)
    }

    resetIdleTimeout()

    source.onmessage = event => {
      if (source !== searchEventSource || settled) return

      try {
        resetIdleTimeout()
        const eventData = JSON.parse(event.data)
        handleSearchStreamMessage(eventData)

        if (eventData.type === 'error') {
          settleSearchStream(resolve)
          return
        }

        if (eventData.type === 'done') {
          // 收到 done 后给后端留出收尾时间，避免过早关闭连接中断搜索结果缓存写入
          receivedDone = true
          clearSearchStreamIdleTimer()
          searchStreamIdleTimer = setTimeout(() => {
            settleSearchStream(resolve)
          }, searchStreamDoneCloseDelay)
        }
      } catch (error) {
        settleSearchStream(() => reject(error))
      }
    }

    source.onerror = () => {
      if (source !== searchEventSource || settled) return

      if (receivedDone) {
        settleSearchStream(resolve)
        return
      }

      errorDescription.value = t('resource.searchStreamDisconnected')
      settleSearchStream(() => reject(new Error(errorDescription.value)))
    }
  })
}

// 设置视图类型
function changeViewType(newType: TorrentViewType) {
  if (viewType.value !== newType) {
    // 立即更新视图类型
    viewType.value = newType
    localStorage.setItem('MPTorrentsViewType', newType)

    // 切换视图时重新应用筛选
    applyFilter()
  }
}

// 获取搜索列表数据
async function fetchData(options: { force?: boolean; params?: SearchParams; silent?: boolean } = {}) {
  const requestId = ++activeSearchRequestId
  const currentSearchParams = { ...(options.params ?? activeSearchParams.value) }
  if (hasSearchKeyword(currentSearchParams)) {
    activeSearchParams.value = { ...currentSearchParams }
    rememberSearchParams(currentSearchParams)
  }
  const requestToken = options.force || hasSearchKeyword(currentSearchParams) ? createSearchRequestToken() : undefined
  const hasCurrentResults = isSubtitleSearch.value ? rawSubtitleDataList.value.length > 0 : rawDataList.value.length > 0
  const silentRefresh = Boolean(options.silent && isRefreshed.value && hasCurrentResults)

  try {
    enableFilterAnimation.value = true
    if (!hasSearchKeyword(currentSearchParams)) {
      // 查询上次搜索结果，并同步可重放的搜索参数
      const results = await fetchLastSearchContext()
      if (requestId !== activeSearchRequestId) return
      if (activeSearchParams.value.result_type === 'subtitle') {
        setSubtitleStreamResults((results || []) as SubtitleInfo[])
      } else {
        setStreamResults((results || []) as Context[])
      }
    } else if (silentRefresh) {
      // keep-alive 重新进入时后台刷新，旧结果继续显示，等新结果完整返回后一次性替换。
      let results: Array<Context | SubtitleInfo>
      try {
        results = await requestSearchResults(currentSearchParams, requestToken)
      } catch (error) {
        if (requestId !== activeSearchRequestId) return
        errorDescription.value = error instanceof Error ? error.message : t('resource.noResourceFound')
        throw error
      }
      if (requestId !== activeSearchRequestId) return
      errorDescription.value = t('resource.noResourceFound')
      streamTotalCount.value = results.length
      if (currentSearchParams.result_type === 'subtitle') {
        setSubtitleStreamResults(results as SubtitleInfo[])
      } else {
        setStreamResults(results as Context[])
      }
    } else {
      resetSearchResults()
      startLoadingProgress()
      // 记录发起搜索时的页面路径，搜索完成后只清理本页地址栏参数，
      // 避免用户搜索期间跳转其他页面（如媒体详情）时误删其 query 参数
      const searchPath = route.path
      try {
        await searchByStream(currentSearchParams, requestToken)
      } catch (error) {
        const streamErrorMessage = error instanceof Error ? error.message : t('resource.searchStreamDisconnected')
        console.warn('渐进式搜索连接失败，回退到普通搜索:', error)
        try {
          const applied = await searchByRequest(currentSearchParams, requestToken, requestId)
          if (!applied) return
        } catch (fallbackError) {
          if (requestId !== activeSearchRequestId) return
          errorDescription.value = streamErrorMessage
          throw fallbackError
        }
      }
      if (requestId !== activeSearchRequestId) return
      stopLoadingProgress()
      // 搜索完成后移除地址栏参数，避免分享/刷新残留搜索条件
      if (route.path === searchPath && Object.keys(route.query).length > 0) {
        await router.replace({ path: route.path, query: {} })
      }
    }
    if (requestId !== activeSearchRequestId) return
    // 标记已刷新
    isRefreshed.value = true
  } catch (error) {
    if (requestId !== activeSearchRequestId) return
    console.error(error)
    closeSearchEventSource()
    stopLoadingProgress()
    isRefreshed.value = true
    return Promise.reject(error)
  }
}

// 重新搜索（使用相同参数重新触发搜索）
async function refreshSearch() {
  if (isRefreshing.value || progressActive.value) return
  isRefreshing.value = true
  try {
    // 重新搜索时退出 AI 视图，其余状态由 fetchData 内部重置
    showingAiResults.value = false
    const refreshParams = await resolveRefreshSearchParams()
    if (!refreshParams) {
      console.warn('未找到可用于重新搜索的搜索参数')
      return
    }
    await fetchData({ force: true, params: refreshParams })
  } catch (error) {
    console.error('重新搜索失败:', error)
  } finally {
    isRefreshing.value = false
  }
}

// 切换到智能推荐结果（自动保存筛选条件）
async function switchToAiResults() {
  if (showingAiResults.value) {
    console.log('已经在显示AI结果')
    return
  }

  // 保存当前筛选状态
  savedFilterState.value = torrentFilter.getFilterState()

  // 切换数据
  rawDataList.value = [...aiRecommendedList.value]
  showingAiResults.value = true
  console.log('已切换到智能推荐结果')

  // 清空智能推荐筛选条件
  torrentFilter.clearAllFilters()

  // 重新应用筛选
  applyFilter()
}

// 切换回原始结果（自动还原筛选条件）
async function switchToOriginalResults() {
  if (!showingAiResults.value) {
    console.log('已经在显示原始结果')
    return
  }

  // 切换数据
  rawDataList.value = [...originalDataList.value]
  showingAiResults.value = false
  console.log('已切换到原始结果')

  // 恢复原始筛选条件
  if (savedFilterState.value) {
    torrentFilter.setFilterState(savedFilterState.value)
  }

  // 重新应用筛选
  applyFilter()
}

// 智能推荐/切换结果
async function toggleAiRecommend() {
  // 如果当前显示AI结果，则切换回原始结果
  if (showingAiResults.value) {
    await switchToOriginalResults()
    return
  }

  // 如果已经有智能推荐结果，直接切换
  if (aiRecommended.value && aiRecommendedList.value.length > 0) {
    await switchToAiResults()
    return
  }

  // 否则启动智能推荐
  // 保存当前筛选状态，以便切换回原始结果时恢复
  savedFilterState.value = torrentFilter.getFilterState()
  console.log('首次智能推荐，已保存筛选状态:', savedFilterState.value)

  startAiRecommend()
}

// 启动智能推荐（开始轮询）
async function startAiRecommend(force: boolean = false) {
  isRecommending.value = true
  console.log('启动智能推荐', force ? '(强制)' : '')

  // 首次或强制时，先发送一个启动任务的请求
  await sendInitialRequest(force)

  // 然后开始 check_only 轮询
  startAiRecommendPolling()
}

// 发送初始请求以启动智能推荐任务
async function sendInitialRequest(force: boolean = false) {
  try {
    const requestBody: any = {}

    // 检查是否有筛选条件
    const hasFilters = torrentFilter.hasActiveFilters()
    if (hasFilters) {
      const indices = torrentFilter.getFilteredIndices()
      if (indices && indices.length > 0) {
        requestBody.filtered_indices = indices
      }
    }

    // 如果是强制模式，添加 force 标志
    if (force) {
      requestBody.force = true
    }

    console.log('发送初始请求以启动任务', force ? '(force)' : '')
    await api.post<AiRecommendStatusData>('search/recommend', requestBody, { feedback: 'silent' })
  } catch (error) {
    console.error('发送初始请求失败:', error)
    isRecommending.value = false
  }
}

// 开始轮询智能推荐（使用 check_only 模式）
function startAiRecommendPolling() {
  // 停止可能存在的轮询
  stopAiRecommendPolling()

  // 立即发送一次 check_only 请求
  pollAiRecommend()

  // 然后每2秒轮询一次（check_only）
  aiStatusCheckInterval = setInterval(() => {
    pollAiRecommend()
  }, 2000)
}

// 轮询智能推荐状态（始终使用 check_only 模式）
async function pollAiRecommend() {
  try {
    const data = await api.post<AiRecommendStatusData>('search/recommend', { check_only: true }, { feedback: 'silent' })
    const status = data.status

    // 正在运行，继续轮询
    if (status === 'running') {
      console.log('AI推理中...')
      return
    }

    // 其他所有状态均停止轮询
    stopAiRecommendPolling()
    isRecommending.value = false

    if (status === 'completed') {
      // 推荐完成
      const results = data.results ?? []
      if (results.length > 0) {
        // 加载智能推荐结果
        loadAiRecommendedResults(results)

        // 自动切换到智能推荐结果（会自动保存筛选条件）
        await switchToAiResults()
      }
    } else if (status === 'disabled') {
      // 功能停用
      console.error('AI功能未启用')
    } else {
      // 成功数据中的业务错误兼容旧字段；顶层失败由 catch 读取统一错误 message。
      const errMsg = data?.error_i18n || data?.error || data?.message_i18n || data?.message || 'Unknown error'
      console.error('智能推荐错误:', errMsg)
      toast.error(`${t('resource.aiRecommendError')}: ${errMsg}`)
    }
  } catch (error) {
    console.error('智能推荐轮询失败:', error)
    stopAiRecommendPolling()
    isRecommending.value = false
    toast.error(`${t('resource.aiRecommendError')}: ${error instanceof Error ? error.message : t('common.error')}`)
  }
}

// 停止轮询智能推荐
function stopAiRecommendPolling() {
  if (aiStatusCheckInterval) {
    clearInterval(aiStatusCheckInterval)
    aiStatusCheckInterval = null
    console.log('停止智能推荐轮询')
  }
}

// 加载智能推荐结果（从索引数组提取数据）
function loadAiRecommendedResults(indices: number[]) {
  if (!indices || indices.length === 0) {
    return
  }

  // 从原始数据中根据索引提取结果
  aiRecommendedList.value = indices.map((index: number) => originalDataList.value[index]).filter(Boolean)
  aiRecommended.value = true
  console.log(`加载智能推荐结果: ${aiRecommendedList.value.length} 条`)
}

// 重新推荐
async function reRecommend() {
  try {
    isReRecommending.value = true
    console.log('重新推荐：重置状态')

    // 重置状态
    aiRecommended.value = false
    aiRecommendedList.value = []

    // 切换回原始结果（会自动还原筛选条件）
    await switchToOriginalResults()

    // 等待筛选数据还原完成（nextTick确保DOM更新完成）
    await nextTick()

    // 再等待一个微任务，确保筛选逻辑完全执行
    await new Promise(resolve => setTimeout(resolve, 0))

    // 重新启动智能推荐（带 force 标志）
    startAiRecommend(true)
  } catch (error) {
    console.error('重新推荐失败:', error)
  } finally {
    isReRecommending.value = false
  }
}

// 检查智能推荐状态（页面初始化时调用一次）
async function checkAiRecommendStatus() {
  try {
    // 首次检查时使用 check_only 模式
    const data = await api.post<AiRecommendStatusData>('search/recommend', { check_only: true }, { feedback: 'silent' })
    const status = data.status

    // 状态检查只是初始化已有推荐结果，非禁用状态下即使后端暂无历史状态也不应锁住按钮
    if (status !== 'disabled') {
      aiStatusChecked.value = true
    }

    if (data) {
      const { results } = data

      // 如果有完成的结果，加载它
      if (status === 'completed' && results && results.length > 0) {
        loadAiRecommendedResults(results)
      }

      // 如果正在运行，启动轮询
      if (status === 'running') {
        isRecommending.value = true
        startAiRecommendPolling()
      }
    }
  } catch (error) {
    console.error('检查AI状态失败:', error)
    // 检查失败不影响用户手动发起智能推荐，避免按钮永久不可用
    aiStatusChecked.value = true
  }
}

// 计算当前显示的数据是否有数据
const hasData = computed(() => {
  if (isSubtitleSearch.value) {
    if (progressActive.value) {
      return streamPreviewSubtitleDataList.value.length > 0 || rawSubtitleDataList.value.length > 0
    }
    return rawSubtitleDataList.value.length > 0
  }

  if (progressActive.value) {
    return streamPreviewDataList.value.length > 0 || rawDataList.value.length > 0
  }

  if (viewType.value === 'row') {
    return filteredRowDataList.value.length > 0 || rawDataList.value.length > 0
  } else {
    return filteredCardDataList.value.length > 0 || rawDataList.value.length > 0
  }
})

// 监听 AI_RECOMMEND_ENABLED 状态和数据加载状态
// 使用 watchEffect 确保计算属性变化时立即响应
watchEffect(() => {
  // 需要满足：AI 功能启用、数据已加载、尚未检查
  if (
    aiRecommendEnabled.value &&
    !isSubtitleSearch.value &&
    originalDataList.value.length > 0 &&
    !progressActive.value &&
    !aiStatusChecked.value
  ) {
    void checkAiRecommendStatus()
  }
})

watch(
  () => route.query,
  query => {
    // 页面被 keep-alive 缓存后仍会响应全局路由变化；只有本页处于前台时才消费查询参数，
    // 否则详情页等路由携带的媒体身份参数会触发后台资源搜索
    if (route.path !== '/resource') return
    if (Object.keys(query).length === 0) return

    const nextSearchParams = createSearchParams(query)
    if (!hasSearchKeyword(nextSearchParams)) return

    activeSearchParams.value = nextSearchParams
    void fetchData()
  },
  { deep: true },
)

// 加载数据
onMounted(async () => {
  void fetchData()
})

useKeepAliveRefresh(async () => {
  if (progressActive.value || isRefreshing.value || isRecommending.value || showingAiResults.value) return
  if (hasLoadedEmptySearchResult()) return

  const refreshParams = await resolveRefreshSearchParams()
  if (!refreshParams) return

  await fetchData({ force: true, params: refreshParams, silent: true })
})

// 卸载时先让所有在途请求失效，并结束 EventSource.close() 不会主动完成的搜索 Promise。
onUnmounted(() => {
  activeSearchRequestId += 1
  cancelActiveSearchStream?.()
  closeSearchEventSource()
  stopLoadingProgress()
  clearProgressResetTimer()
  stopAiRecommendPolling()
  clearStreamPreviewState()
})
</script>

<template>
  <div data-glass-optical-mode="static-material">
    <!-- 搜索加载状态 -->
    <VFadeTransition>
      <div
        v-if="isSearchProgressVisible"
        class="search-loading-state mb-3"
        :class="{ 'is-empty-loading': isSearchLoading }"
      >
        <VCard elevation="0" class="search-progress-card">
          <div class="progress-header">
            <div class="progress-icon-wrap">
              <VProgressCircular
                color="primary"
                :indeterminate="searchProgressIndeterminate"
                :model-value="searchProgressPercent"
                :size="56"
                :width="5"
              >
                <VIcon icon="mdi-movie-search" color="primary" size="24" />
              </VProgressCircular>
            </div>
            <div class="progress-copy">
              <span class="progress-title">{{ progressText }}</span>
              <div v-if="hasSearchTags" class="progress-tags d-flex flex-wrap">
                <VChip
                  v-if="keyword && !isMediaIdKeyword"
                  class="search-tag progress-tag"
                  color="primary"
                  size="small"
                  variant="tonal"
                >
                  {{ t('resource.keyword') }}: {{ keyword }}
                </VChip>
                <VChip v-if="title" class="search-tag progress-tag" color="primary" size="small" variant="tonal">
                  {{ t('resource.title') }}: {{ title }}
                </VChip>
                <VChip v-if="year" class="search-tag progress-tag" color="primary" size="small" variant="tonal">
                  {{ t('resource.year') }}: {{ year }}
                </VChip>
                <VChip v-if="season" class="search-tag progress-tag" color="primary" size="small" variant="tonal">
                  {{ t('resource.season') }}: {{ season }}
                </VChip>
              </div>
            </div>
            <div class="progress-percentage">{{ searchProgressLabel }}</div>
          </div>
          <div class="progress-bar-container">
            <VProgressLinear
              color="primary"
              rounded
              :indeterminate="searchProgressIndeterminate"
              :model-value="searchProgressPercent"
            />
          </div>
        </VCard>

        <div v-if="isSearchLoading && viewType === 'card'" class="search-skeleton-grid">
          <VCard v-for="item in 6" :key="`search-card-skeleton-${item}`" class="search-skeleton-card" elevation="0">
            <VSkeletonLoader type="image, article" />
          </VCard>
        </div>

        <VCard v-else-if="isSearchLoading" class="search-skeleton-list" elevation="0">
          <div v-for="item in 6" :key="`search-row-skeleton-${item}`" class="search-skeleton-row">
            <VSkeletonLoader type="list-item-avatar-two-line" />
          </div>
        </VCard>
      </div>
    </VFadeTransition>

    <!-- 结果抬头：保持和站点管理一致的页面标题结构，筛选控制交给下方工具条。 -->
    <div v-if="showResultHeader" class="resource-page-header d-flex justify-space-between align-center mb-3">
      <div class="resource-page-header__copy">
        <VPageContentTitle
          :title="isSubtitleSearch ? t('resource.subtitleSearchResults') : t('resource.searchResults')"
          class="resource-page-header__title my-0"
          style="margin-block: 0"
        />
      </div>

      <div class="resource-page-header__actions d-flex align-center gap-1">
        <!-- 重新搜索按钮 -->
        <IconBtn
          variant="text"
          color="gray"
          :loading="isRefreshing"
          :disabled="isRefreshing || progressActive"
          @click="refreshSearch"
        >
          <VIcon icon="mdi-refresh" />
          <VTooltip activator="parent" location="top">
            {{ t('resource.refreshSearch') }}
          </VTooltip>
        </IconBtn>

        <!-- AI操作按钮组 -->
        <div
          v-if="!isSubtitleSearch && aiRecommendEnabled && originalDataList.length > 0"
          class="ai-action-group"
          :class="{ 'ai-action-group--active': showingAiResults }"
        >
          <VBtn
            :variant="showingAiResults ? 'tonal' : 'text'"
            :color="showingAiResults ? 'primary' : 'gray'"
            :disabled="isRecommending || !aiStatusChecked"
            size="small"
            height="40"
            class="ai-action-group__primary"
            @click="toggleAiRecommend"
          >
            <template #prepend>
              <VIcon icon="lucide:sparkles" size="18" />
            </template>
            <span class="ai-action-group__label">{{ t('resource.aiRecommend') }}</span>
            <VTooltip activator="parent" location="top">
              {{ t('resource.aiRecommend') }}
            </VTooltip>
          </VBtn>

          <VExpandXTransition>
            <div v-if="aiRecommended || isRecommending" class="ai-action-group__more">
              <IconBtn variant="text" color="gray" :disabled="isRecommending || !aiStatusChecked" @click="reRecommend">
                <VIcon :icon="isRecommending ? 'line-md:loading-twotone-loop' : 'mdi-auto-fix'" />
                <VTooltip activator="parent" location="top">
                  {{ t('resource.reRecommend') }}
                </VTooltip>
              </IconBtn>
            </div>
          </VExpandXTransition>
        </div>
      </div>
    </div>

    <!-- 搜索结果 -->
    <div v-if="isRefreshed && hasData" class="search-results-container">
      <!-- 筛选栏 -->
      <TorrentFilterBar
        v-if="!progressActive && !isSubtitleSearch"
        :filter-form="torrentFilter.filterForm"
        :filter-options="torrentFilter.filterOptions"
        :sort-field="torrentFilter.sortField.value"
        :sort-type="torrentFilter.sortType.value"
        :total-filtered-count="displayResourceCount"
        :filter-titles="torrentFilter.filterTitles"
        :sort-titles="torrentFilter.sortTitles"
        :enable-animation="enableFilterAnimation"
        @update:sort-field="val => (torrentFilter.sortField.value = val)"
        @update:sort-type="val => (torrentFilter.sortType.value = val)"
        @update:filter-form="handleFilterFormUpdate"
        @select-all="handleSelectAll"
        @clear-filter="handleClearFilter"
        @clear-all-filters="handleClearAllFilters"
        @remove-filter="handleRemoveFilter"
      />

      <!-- 视图切换区域 -->
      <VFadeTransition mode="out-in">
        <!-- 卡片视图模式 -->
        <div v-if="viewType === 'card'" key="card">
          <div
            v-if="isSubtitleSearch && progressActive && streamPreviewSubtitleDataList.length > 0"
            class="grid gap-4 grid-torrent-card items-start"
          >
            <SubtitleCard
              v-for="(item, index) in streamPreviewSubtitleDataList"
              :key="getSubtitleItemKey(item, index)"
              :subtitle="item"
              :media-source="activeSearchParams.media_source || undefined"
              :media-id="activeSearchParams.media_id || undefined"
              class="stream-result-item"
            />
          </div>
          <ProgressiveCardGrid
            v-else-if="isSubtitleSearch && rawSubtitleDataList.length > 0"
            :items="rawSubtitleDataList"
            :get-item-key="getSubtitleItemKey"
            :min-item-width="300"
            :estimated-item-height="320"
          >
            <template #default="{ item }">
              <SubtitleCard
                :subtitle="item"
                :media-source="activeSearchParams.media_source || undefined"
                :media-id="activeSearchParams.media_id || undefined"
              />
            </template>
          </ProgressiveCardGrid>
          <div
            v-else-if="!isSubtitleSearch && progressActive && streamPreviewDataList.length > 0"
            class="grid gap-4 grid-torrent-card items-start"
          >
            <TorrentCard
              v-for="(item, index) in streamPreviewDataList"
              :key="getTorrentItemKey(item, index)"
              :torrent="item"
              class="stream-result-item"
            />
          </div>
          <ProgressiveCardGrid
            v-else-if="filteredCardDataList.length > 0"
            :items="filteredCardDataList"
            :get-item-key="getTorrentItemKey"
            :min-item-width="300"
            :estimated-item-height="400"
          >
            <template #default="{ item }">
              <TorrentCard :torrent="item" :more="item.more" />
            </template>
          </ProgressiveCardGrid>
          <!-- 无结果时显示 -->
          <div
            v-if="
              !progressActive &&
              ((isSubtitleSearch && rawSubtitleDataList.length === 0) ||
                (!isSubtitleSearch && filteredCardDataList.length === 0))
            "
            class="no-results"
          >
            <VIcon icon="mdi-file-search-outline" size="64" color="grey-lighten-1" />
            <div class="text-h6 text-grey mt-4">{{ t('torrent.noResults') }}</div>
          </div>
        </div>

        <!-- 列表视图模式 -->
        <div v-else-if="viewType === 'row'" key="row">
          <VCard class="resource-list-container">
            <!-- 无结果时显示 -->
            <div
              v-if="
                !progressActive &&
                ((isSubtitleSearch && rawSubtitleDataList.length === 0) ||
                  (!isSubtitleSearch && filteredRowDataList.length === 0))
              "
              class="no-results"
            >
              <VIcon icon="mdi-file-search-outline" size="64" color="grey-lighten-1" />
              <div class="text-h6 text-grey mt-4">{{ t('torrent.noResults') }}</div>
            </div>
            <div
              v-else-if="isSubtitleSearch && progressActive && streamPreviewSubtitleDataList.length > 0"
              class="resource-list overflow-visible"
            >
              <div
                v-for="(item, index) in streamPreviewSubtitleDataList"
                :key="getSubtitleItemKey(item, index)"
                class="stream-result-item"
              >
                <SubtitleItem
                  :subtitle="item"
                  :media-source="activeSearchParams.media_source || undefined"
                  :media-id="activeSearchParams.media_id || undefined"
                />
                <VDivider v-if="index < streamPreviewSubtitleDataList.length - 1" class="my-2" />
              </div>
            </div>
            <div v-else-if="isSubtitleSearch && rawSubtitleDataList.length > 0" class="resource-list">
              <ProgressiveCardGrid
                :items="rawSubtitleDataList"
                :columns="1"
                :gap="8"
                :estimated-item-height="190"
                :overscan-rows="6"
                :get-item-key="getSubtitleItemKey"
              >
                <template #default="{ item, index }">
                  <SubtitleItem
                    :subtitle="item"
                    :media-source="activeSearchParams.media_source || undefined"
                    :media-id="activeSearchParams.media_id || undefined"
                  />
                  <VDivider v-if="index < rawSubtitleDataList.length - 1" class="my-2" />
                </template>
              </ProgressiveCardGrid>
            </div>
            <div
              v-else-if="!isSubtitleSearch && progressActive && streamPreviewDataList.length > 0"
              class="resource-list overflow-visible"
            >
              <div
                v-for="(item, index) in streamPreviewDataList"
                :key="getTorrentItemKey(item, index)"
                class="stream-result-item"
              >
                <TorrentItem :torrent="item" />
                <VDivider v-if="index < streamPreviewDataList.length - 1" class="my-2" />
              </div>
            </div>
            <div v-else-if="!isSubtitleSearch && filteredRowDataList.length > 0" class="resource-list">
              <ProgressiveCardGrid
                :items="filteredRowDataList"
                :columns="1"
                :gap="8"
                :estimated-item-height="240"
                :overscan-rows="6"
                :get-item-key="getTorrentItemKey"
              >
                <template #default="{ item, index }">
                  <TorrentItem :torrent="item" />
                  <VDivider v-if="index < filteredRowDataList.length - 1" class="my-2" />
                </template>
              </ProgressiveCardGrid>
            </div>
          </VCard>
        </div>
      </VFadeTransition>
    </div>

    <!-- 无数据显示 -->
    <div v-else-if="isRefreshed && !progressActive" class="d-flex flex-column align-center justify-center py-8">
      <NoDataFound :errorTitle="errorTitle" :errorDescription="errorDescription" />
      <VBtn rounded="pill" class="mt-4" color="primary" prepend-icon="mdi-home" to="/">
        {{ t('resource.backToHome') }}
      </VBtn>
    </div>

    <!-- 初始加载状态 -->
    <LoadingBanner v-else-if="!isRefreshed && !isSearchLoading" />

    <Teleport to="body" v-if="route.path === '/resource'">
      <div v-if="isRefreshed && !appMode && canSearch" class="compact-fab-stack">
        <VFab
          :icon="viewToggleIcon"
          color="primary"
          appear
          class="compact-fab compact-fab--primary"
          @click="toggleViewType"
        />
      </div>
    </Teleport>

    <!-- 滚动到顶部按钮 -->
    <Teleport to="body" v-if="route.path === '/resource'">
      <VScrollToTopBtn :offset-fab="isRefreshed && !appMode" />
    </Teleport>
  </div>
</template>

<style scoped>
.search-loading-state {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.search-loading-state.is-empty-loading {
  min-block-size: 50vh;
}

.search-progress-card {
  padding: 16px;
  border: var(--app-grouped-list-border);
  backdrop-filter: var(--app-grouped-list-backdrop-filter);
  background:
    linear-gradient(135deg, rgba(var(--v-theme-primary), 0.08), transparent 42%), var(--app-grouped-list-background);
  inline-size: 100%;
}

.progress-header {
  display: flex;
  align-items: center;
  gap: 12px;
}

.progress-icon-wrap {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
}

.progress-copy {
  flex: 1 1 auto;
  min-inline-size: 0;
}

.progress-title {
  display: block;
  overflow: hidden;
  color: rgb(var(--v-theme-on-surface));
  font-size: 1rem;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.progress-tags {
  gap: 6px;
  margin-block-start: 8px;
}

.progress-tag {
  max-inline-size: 100%;
}

.progress-bar-container {
  display: flex;
  align-items: center;
  margin-block-start: 14px;
}

.progress-percentage {
  flex: 0 0 auto;
  color: rgb(var(--v-theme-primary));
  font-size: 0.95rem;
  font-weight: 700;
  min-inline-size: 44px;
  text-align: end;
}

.search-skeleton-grid {
  display: grid;
  gap: 16px;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
}

.search-skeleton-card,
.search-skeleton-list {
  overflow: hidden;
  background: rgb(var(--v-theme-surface));
}

.search-skeleton-row + .search-skeleton-row {
  border-block-start: 1px solid rgba(var(--v-theme-on-surface), 0.08);
}

.stream-result-item {
  animation: stream-result-in 0.28s ease-out both;
}

@keyframes stream-result-in {
  from {
    opacity: 0;
    transform: translateY(8px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.resource-page-header {
  gap: 12px;
}

.resource-page-header__copy {
  flex: 1 1 auto;
  min-inline-size: 0;
}

.resource-page-header__title {
  max-inline-size: 100%;
}

.resource-page-header__actions {
  flex: 0 0 auto;
  align-self: center;
}

.search-tag {
  max-inline-size: min(100%, 220px);
  font-size: 0.75rem;
}

.ai-action-group {
  display: flex;
  overflow: hidden;
  align-items: center;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.12);
  border-radius: 8px;
}

.ai-action-group--active {
  border-color: rgba(var(--v-theme-primary), 0.24);
  background-color: rgba(var(--v-theme-primary), 0.08);
}

.ai-action-group__primary {
  border-radius: 8px 0 0 8px !important;
  padding-inline: 14px 12px !important;
}

.ai-action-group__label {
  font-size: 0.875rem;
  font-weight: 600;
}

.ai-action-group__more {
  display: flex;
  align-items: center;
  border-inline-start: 1px solid rgba(var(--v-theme-on-surface), 0.12);
}

.search-results-container {
  position: relative;
  min-block-size: 50vh;
}

/* 卡片网格布局 */
.grid-torrent-card {
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
}

/* 列表视图样式 */
.resource-list-container {
  padding: 8px;
}

.resource-list {
  display: block;
}

/* 无结果提示 */
.no-results {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-block-size: 300px;
}

@media (width <= 600px) {
  .resource-page-header {
    gap: 8px;
  }

  .search-loading-state {
    gap: 12px;
  }

  .search-progress-card {
    padding: 12px;
  }

  .progress-header {
    align-items: flex-start;
  }

  .progress-icon-wrap {
    padding-block-start: 2px;
  }

  .progress-title {
    white-space: normal;
  }

  .progress-percentage {
    font-size: 0.85rem;
    min-inline-size: 36px;
  }

  .progress-tags {
    flex-wrap: nowrap;
    overflow-x: auto;
    scrollbar-width: none;
  }

  .progress-tags::-webkit-scrollbar {
    display: none;
  }

  .search-skeleton-grid {
    grid-template-columns: 1fr;
  }
}
</style>
