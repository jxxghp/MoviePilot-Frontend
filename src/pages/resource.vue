<script setup lang="ts">
import { debounce } from 'lodash-es'
import NoDataFound from '@/components/NoDataFound.vue'
import api from '@/api'
import type { Context } from '@/api/types'
import TorrentCard from '@/components/cards/TorrentCard.vue'
import TorrentItem from '@/components/cards/TorrentItem.vue'
import TorrentFilterBar from '@/components/filter/TorrentFilterBar.vue'
import { useI18n } from 'vue-i18n'
import { useGlobalSettingsStore } from '@/stores/global'
import { useTorrentFilter, type FilterState } from '@/composables/useTorrentFilter'
import { useInfiniteScroll } from '@/composables/useInfiniteScroll'
import { useToast } from 'vue-toastification'

// 国际化
const { t } = useI18n()

// 提示框
const toast = useToast()

// 全局设置 Store
const globalSettingsStore = useGlobalSettingsStore()

// 使用筛选 composable
const torrentFilter = useTorrentFilter()

// 路由参数
const route = useRoute()

// 查询TMDBID或标题
const keyword = route.query?.keyword?.toString() ?? ''

// 查询类型
const type = route.query?.type?.toString() ?? ''

// 搜索字段
const area = route.query?.area?.toString() ?? ''

// 搜索标题
const title = route.query?.title?.toString() ?? ''

// 搜索年份
const year = route.query?.year

// 搜索季
const season = route.query?.season?.toString() ?? ''

// 搜索站点，以,分离多个
const sites = route.query?.sites?.toString() ?? ''

// 视图类型，从localStorage中读取
const viewType = ref<string>(localStorage.getItem('MPTorrentsViewType') ?? 'card')

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
  return !!(keyword || title || year || season)
})

// 是否启用筛选栏动画
const enableFilterAnimation = ref(true)

// 原始数据列表（未筛选）
const rawDataList = ref<Array<Context>>([])

// 筛选后的数据列表（用于行视图）
const filteredRowDataList = ref<Array<Context>>([])

// 筛选后的数据列表（用于卡片视图）
interface SearchTorrent extends Context {
  more?: Array<Context>
}
const filteredCardDataList = ref<Array<SearchTorrent>>([])

// 使用无限滚动 composable（行视图）
const rowScroll = useInfiniteScroll(filteredRowDataList)

// 使用无限滚动 composable（卡片视图）
const cardScroll = useInfiniteScroll(filteredCardDataList)

// 是否刷新过
const isRefreshed = ref(false)

// 加载进度文本
const progressText = ref(t('common.pleaseWait'))

// 加载进度
const progressValue = ref(0)

// 进度是否有效
const progressEnabled = ref(false)

// 进度是否激活
const progressActive = ref(false)

// 是否显示搜索进度
const isSearchProgressVisible = computed(
  () => progressActive.value || (!isRefreshed.value && (progressEnabled.value || progressValue.value > 0)),
)

// 是否显示搜索中的页面态
const isSearchLoading = computed(
  () => !isRefreshed.value && isSearchProgressVisible.value && rawDataList.value.length === 0,
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

const streamPreviewLimit = 24

const streamTotalCount = ref(0)

const displayResourceCount = computed(() =>
  progressActive.value ? streamTotalCount.value : torrentFilter.totalFilteredCount.value,
)

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

// 添加安全超时，确保进度条不会永远卡住
const watchProgressValue = watch(
  progressValue,
  debounce(async () => {
    if (progressActive.value && progressValue.value < 100) {
      console.warn('卡进度超时 关闭进度条')
      stopLoadingProgress()
    }
  }, 60_000),
)

// 使用SSE监听加载进度
function startLoadingProgress() {
  watchProgressValue.resume()
  progressText.value = t('resource.searching')
  progressValue.value = 0
  progressEnabled.value = true
  progressActive.value = true
}

// 停止监听加载进度
function stopLoadingProgress() {
  watchProgressValue.pause()
  progressActive.value = false

  // 确保进度显示100%，然后再渐进清零
  progressValue.value = 100
  setTimeout(() => {
    progressValue.value = 0
    progressEnabled.value = false
  }, 1500)
}

// 关闭SSE连接
function closeSearchEventSource() {
  if (searchEventSource) {
    searchEventSource.close()
    searchEventSource = null
  }
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
function buildSearchStreamUrl() {
  const isMediaSearch = /^[a-zA-Z]+:/.test(keyword)
  const url = getApiUrl(isMediaSearch ? `search/media/${encodeURIComponent(keyword)}/stream` : 'search/title/stream')

  if (isMediaSearch) {
    setSearchParam(url.searchParams, 'mtype', type)
    setSearchParam(url.searchParams, 'area', area)
    setSearchParam(url.searchParams, 'title', title)
    setSearchParam(url.searchParams, 'year', year)
    setSearchParam(url.searchParams, 'season', season)
    setSearchParam(url.searchParams, 'sites', sites)
  } else {
    setSearchParam(url.searchParams, 'keyword', keyword)
    setSearchParam(url.searchParams, 'sites', sites)
  }

  return url.toString()
}

// 重置搜索结果
function resetSearchResults() {
  rawDataList.value = []
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

// 更新搜索进度
function updateSearchProgress(eventData: { [key: string]: any }) {
  if (eventData.text) {
    progressText.value = eventData.text
  }
  if (typeof eventData.value === 'number') {
    progressValue.value = eventData.value
  }
  if (typeof eventData.total_items === 'number') {
    streamTotalCount.value = eventData.total_items
  }
  progressEnabled.value = true
}

// 设置流式搜索结果
function setStreamResults(items: Context[]) {
  rawDataList.value = items
  originalDataList.value = items
  if (!progressActive.value) {
    streamTotalCount.value = items.length
  }
  isRefreshed.value = true
  applyFilter()
}

// 追加流式搜索结果
function appendStreamResults(items: Context[]) {
  if (!items.length) return

  const nextItems = [...items, ...rawDataList.value]
  setStreamResults(progressActive.value ? nextItems.slice(0, streamPreviewLimit) : nextItems)
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

// 处理搜索流消息
function handleSearchStreamMessage(eventData: { [key: string]: any }) {
  updateSearchProgress(eventData)

  if (eventData.type === 'error') {
    errorDescription.value = eventData.message || t('resource.noResourceFound')
    return
  }

  const items = Array.isArray(eventData.items) ? (eventData.items as Context[]) : []
  if (eventData.type === 'append') {
    appendStreamResults(items)
  } else if (eventData.type === 'replace' || eventData.type === 'done') {
    setStreamResults(items)
  }
}

// 按请求搜索
async function searchByRequest() {
  let result: { [key: string]: any }
  // 如果keyword的格式是 xxxx:xxxxx 且:前面的xxxx为字符，则按照媒体ID格式搜索
  if (/^[a-zA-Z]+:/.test(keyword)) {
    result = await api.get(`search/media/${keyword}`, {
      params: {
        mtype: type,
        area,
        title,
        year,
        season,
        sites,
      },
    })
  } else {
    // 按标题模糊查询
    result = await api.get(`search/title`, {
      params: {
        keyword,
        sites,
      },
    })
  }

  if (result && result.success) {
    streamTotalCount.value = result.data?.length || 0
    setStreamResults(result.data || [])
  } else {
    errorDescription.value = result?.message || t('resource.noResourceFound')
    streamTotalCount.value = 0
    setStreamResults([])
  }
}

// 按流搜索
function searchByStream() {
  return new Promise<void>((resolve, reject) => {
    closeSearchEventSource()

    let settled = false
    const source = new EventSource(buildSearchStreamUrl())
    searchEventSource = source

    source.onmessage = event => {
      try {
        const eventData = JSON.parse(event.data)
        handleSearchStreamMessage(eventData)

        if (eventData.type === 'error') {
          settled = true
          closeSearchEventSource()
          resolve()
          return
        }

        if (eventData.type === 'done') {
          settled = true
          closeSearchEventSource()
          resolve()
        }
      } catch (error) {
        settled = true
        closeSearchEventSource()
        reject(error)
      }
    }

    source.onerror = () => {
      if (settled) return

      settled = true
      closeSearchEventSource()
      reject(new Error(t('resource.noResourceFound')))
    }
  })
}

// 设置视图类型
function changeViewType(newType: string) {
  if (viewType.value !== newType) {
    // 立即更新视图类型
    viewType.value = newType
    localStorage.setItem('MPTorrentsViewType', newType)

    // 切换视图时重新应用筛选
    applyFilter()
  }
}

// 获取搜索列表数据
async function fetchData() {
  try {
    enableFilterAnimation.value = true
    if (!keyword) {
      // 查询上次搜索结果
      const results = await api.get('search/last')
      rawDataList.value = (results as unknown as Context[]) || []
      originalDataList.value = (results as unknown as Context[]) || []
    } else {
      resetSearchResults()
      startLoadingProgress()
      try {
        await searchByStream()
      } catch (error) {
        console.warn('渐进式搜索连接失败，回退到普通搜索:', error)
        await searchByRequest()
      }
      stopLoadingProgress()
      // 从浏览器历史中删除当前搜索
      window.history.replaceState(null, '', window.location.pathname)
    }
    // 应用筛选
    applyFilter()
    // 标记已刷新
    isRefreshed.value = true
  } catch (error) {
    console.error(error)
    closeSearchEventSource()
    stopLoadingProgress()
    isRefreshed.value = true
    return Promise.reject(error)
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
    await api.post('search/recommend', requestBody)
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
    const result: { [key: string]: any } = await api.post('search/recommend', {
      check_only: true,
    })

    const { success, data } = result
    const status = data?.status

    // 正在运行，继续轮询
    if (success && status === 'running') {
      console.log('AI推理中...')
      return
    }

    // 其他所有状态均停止轮询
    stopAiRecommendPolling()
    isRecommending.value = false

    if (success && status === 'completed') {
      // 推荐完成
      if (data.results?.length > 0) {
        // 加载智能推荐结果
        loadAiRecommendedResults(data.results)

        // 自动切换到智能推荐结果（会自动保存筛选条件）
        await switchToAiResults()
      }
    } else if (success && status === 'disabled') {
      // 功能停用
      console.error('AI功能未启用')
    } else {
      // 错误情况（status === 'error' 或 success 为 false）
      const errMsg = result.message || data?.error || data?.message || 'Unknown error'
      console.error('智能推荐错误:', errMsg)
      toast.error(`${t('resource.aiRecommendError')}: ${errMsg}`)
    }
  } catch (error) {
    console.error('智能推荐轮询失败:', error)
    stopAiRecommendPolling()
    isRecommending.value = false
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
    const result: { [key: string]: any } = await api.post('search/recommend', {
      check_only: true,
    })

    const { success, data } = result
    const status = data?.status

    // 只要有数据且状态不是disabled，就标记已检查（允许重试）
    if (data && status !== 'disabled') {
      aiStatusChecked.value = true
    }

    if (success && data) {
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
  }
}

// 计算当前显示的数据是否有数据
const hasData = computed(() => {
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
    originalDataList.value.length > 0 &&
    !progressActive.value &&
    !aiStatusChecked.value
  ) {
    checkAiRecommendStatus()
  }
})

// 加载数据
onMounted(async () => {
  fetchData()
})

// 卸载时停止轮询
onUnmounted(() => {
  closeSearchEventSource()
  stopLoadingProgress()
  stopAiRecommendPolling()
})
</script>

<template>
  <div>
    <!-- 搜索加载状态 -->
    <VFadeTransition>
      <div v-if="isSearchProgressVisible" class="search-loading-state mb-3" :class="{ 'is-empty-loading': isSearchLoading }">
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
                <VChip v-if="keyword" class="search-tag progress-tag" color="primary" size="small" variant="tonal">
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

    <!-- 精简标题栏 -->
    <VCard v-if="isRefreshed && !progressActive" class="search-header d-flex align-center mb-3">
      <div class="search-info-container">
        <div class="search-title text-moviepilot">
          <span class="d-none d-sm-inline">{{ t('resource.searchResults') }}</span>
          <span class="d-inline d-sm-none">{{ t('navItems.searchResult') }}</span>
        </div>
        <div v-if="hasSearchTags" class="search-tags d-flex flex-wrap mt-1">
          <VChip v-if="keyword" class="search-tag" color="primary" size="small" variant="flat">
            {{ t('resource.keyword') }}: {{ keyword }}
          </VChip>
          <VChip v-if="title" class="search-tag" color="primary" size="small" variant="flat">
            {{ t('resource.title') }}: {{ title }}
          </VChip>
          <VChip v-if="year" class="search-tag" color="primary" size="small" variant="flat">
            {{ t('resource.year') }}: {{ year }}
          </VChip>
          <VChip v-if="season" class="search-tag" color="primary" size="small" variant="flat">
            {{ t('resource.season') }}: {{ season }}
          </VChip>
        </div>
      </div>

      <VSpacer />

      <!-- AI操作按钮组 -->
      <div v-if="aiRecommendEnabled && originalDataList.length > 0" class="ai-toggle-container me-2">
        <div class="ai-toggle-buttons">
          <VBtn
            variant="text"
            size="small"
            rounded="0"
            @click="toggleAiRecommend"
            :disabled="isRecommending || !aiStatusChecked"
            height="44"
            class="ps-4 pe-3 ai-recommend-btn"
            :class="{ 'ai-active': showingAiResults }"
          >
            <template #prepend>
              <VIcon icon="lucide:sparkles" size="18" class="ai-icon" :class="{ 'ai-icon-active': showingAiResults }" />
            </template>
            <span class="ai-text" :class="{ 'ai-text-active': showingAiResults }">
              {{ t('resource.aiRecommend') }}
            </span>
          </VBtn>

          <VExpandXTransition>
            <div v-if="aiRecommended || isRecommending" class="d-flex align-center">
              <div class="ai-divider" :style="{ opacity: showingAiResults ? 0 : 1 }"></div>
              <VBtn
                variant="text"
                size="small"
                rounded="0"
                :disabled="isRecommending || !aiStatusChecked"
                @click="reRecommend"
                height="44"
                min-width="38"
                class="px-0"
              >
                <VIcon
                  :icon="isRecommending ? 'line-md:loading-twotone-loop' : 'mdi-refresh'"
                  size="18"
                  class="ai-refresh-icon"
                />
                <VTooltip activator="parent" location="top">
                  {{ t('resource.reRecommend') }}
                </VTooltip>
              </VBtn>
            </div>
          </VExpandXTransition>
        </div>
      </div>

      <!-- 重新设计的视图切换按钮 -->
      <div class="view-toggle-container">
        <div class="view-toggle-buttons">
          <div class="active-indicator" :class="viewType"></div>
          <button class="view-toggle-btn" :class="{ active: viewType === 'card' }" @click="changeViewType('card')">
            <VIcon icon="mdi-view-grid-outline" :color="viewType === 'card' ? 'primary' : undefined" />
          </button>
          <button class="view-toggle-btn" :class="{ active: viewType === 'row' }" @click="changeViewType('row')">
            <VIcon icon="mdi-view-list-outline" :color="viewType === 'row' ? 'primary' : undefined" />
          </button>
        </div>
      </div>
    </VCard>

    <!-- 搜索结果 -->
    <div v-if="isRefreshed && hasData" class="search-results-container">
      <!-- 筛选栏 -->
      <TorrentFilterBar
        v-if="!progressActive"
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
          <!-- 资源列表 -->
          <VInfiniteScroll
            mode="intersect"
            side="end"
            :items="cardScroll.displayDataList.value"
            class="overflow-visible"
            @load="cardScroll.loadMore"
          >
            <template #loading />
            <template #empty />
            <div class="grid gap-4 grid-torrent-card items-start">
              <TorrentCard
                v-for="(item, index) in cardScroll.displayDataList.value"
                :key="getTorrentItemKey(item, index)"
                :torrent="item"
                :more="item.more"
                class="stream-result-item"
              />
            </div>
          </VInfiniteScroll>
          <!-- 无结果时显示 -->
          <div v-if="cardScroll.displayDataList.value.length === 0" class="no-results">
            <VIcon icon="mdi-file-search-outline" size="64" color="grey-lighten-1" />
            <div class="text-h6 text-grey mt-4">{{ t('torrent.noResults') }}</div>
          </div>
        </div>

        <!-- 列表视图模式 -->
        <div v-else-if="viewType === 'row'" key="row">
          <VCard class="resource-list-container">
            <!-- 无结果时显示 -->
            <div v-if="rowScroll.displayDataList.value.length === 0" class="no-results">
              <VIcon icon="mdi-file-search-outline" size="64" color="grey-lighten-1" />
              <div class="text-h6 text-grey mt-4">{{ t('torrent.noResults') }}</div>
            </div>
            <!-- 资源列表 -->
            <VInfiniteScroll
              v-else
              mode="intersect"
              side="end"
              :items="rowScroll.displayDataList.value"
              class="resource-list overflow-visible"
              @load="rowScroll.loadMore"
            >
              <template #loading />
              <template #empty />
              <div
                v-for="(item, index) in rowScroll.displayDataList.value"
                :key="getTorrentItemKey(item, index)"
                class="stream-result-item"
              >
                <TorrentItem :torrent="item" />
                <VDivider v-if="index < rowScroll.displayDataList.value.length - 1" class="my-2" />
              </div>
            </VInfiniteScroll>
          </VCard>
        </div>
      </VFadeTransition>
    </div>

    <!-- 无数据显示 -->
    <div v-else-if="isRefreshed" class="d-flex flex-column align-center justify-center py-8">
      <NoDataFound :errorTitle="errorTitle" :errorDescription="errorDescription" />
      <VBtn rounded="pill" class="mt-4" color="primary" prepend-icon="mdi-home" to="/">
        {{ t('resource.backToHome') }}
      </VBtn>
    </div>

    <!-- 初始加载状态 -->
    <LoadingBanner v-else-if="!isRefreshed && !isSearchLoading" />
    <!-- 滚动到顶部按钮 -->
    <Teleport to="body" v-if="route.path === '/resource'">
      <VScrollToTopBtn />
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
  border: 1px solid rgba(var(--v-theme-primary), 0.18);
  border-radius: 8px;
  backdrop-filter: blur(10px);
  background: linear-gradient(135deg, rgba(var(--v-theme-primary), 0.08), transparent 42%), rgb(var(--v-theme-surface));
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
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
}

.search-skeleton-card,
.search-skeleton-list {
  overflow: hidden;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.08);
  border-radius: 8px;
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

/* 精简标题栏样式 */
.search-header {
  border: 1px solid rgba(var(--v-theme-on-surface), 0.08);
  padding-block: 8px;
  padding-inline: 12px;
}

.search-info-container {
  gap: 12px;
}

.search-title {
  font-size: 1.2rem;
  font-weight: 600;
}

.search-tags {
  gap: 8px;
}

.search-tag {
  font-size: 0.75rem;
}

/* 重新设计的视图切换按钮 */
.view-toggle-container {
  position: relative;
}

.view-toggle-buttons {
  position: relative;
  display: flex;
  padding: 4px;
  border-radius: 8px;
  background-color: rgba(var(--v-theme-surface-variant), 0.1);
  isolation: isolate; /* Create new stacking context */
}

.active-indicator {
  position: absolute;
  z-index: 1;
  border-radius: 6px;
  background-color: rgb(var(--v-theme-surface));
  block-size: 36px;
  box-shadow:
    0 1px 3px rgba(0, 0, 0, 12%),
    0 1px 2px rgba(0, 0, 0, 24%);
  inline-size: 40px;
  inset-block-start: 4px;
  inset-inline-start: 4px;
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.active-indicator.row {
  transform: translateX(40px);
}

.view-toggle-btn {
  position: relative;
  z-index: 2; /* Sit on top of indicator */
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  block-size: 36px;
  cursor: pointer;
  inline-size: 40px;
  transition: all 0.2s ease;
}

.view-toggle-btn:hover:not(.active) {
  border-radius: 6px;
  background-color: rgba(var(--v-theme-primary), 0.05);
}

/* AI按钮组样式 */
.ai-toggle-container {
  position: relative;
}

.ai-toggle-buttons {
  display: flex;
  overflow: hidden;
  align-items: center;
  padding: 0;
  border-radius: 8px;
  background-color: rgba(var(--v-theme-surface-variant), 0.1);
  block-size: 44px; /* 36px(btn) + 4px*2(padding) to match right side exactly */
}

.ai-recommend-btn {
  margin: 0;
  block-size: 100% !important;
  transition: all 0.3s ease;
}

/* 仅为激活的按钮添加背景 */
.ai-recommend-btn.ai-active {
  z-index: 1;
  background-color: rgba(var(--v-theme-primary), 0.15);
}

/* 图标基础样式 */
.ai-icon {
  color: rgba(var(--v-theme-on-surface), 0.6);
  transform: translateZ(0);
  transition: all 0.5s cubic-bezier(0.4, 0, 0.2, 1);
}

/* 激活状态图标：变色 + 辉光 */
.ai-icon-active {
  color: rgb(var(--v-theme-primary));
  filter: drop-shadow(0 0 4px rgba(var(--v-theme-primary), 0.5));
}

/* 文字基础样式 */
.ai-text {
  color: rgba(var(--v-theme-on-surface), 0.6);
  font-size: 0.85rem;
  font-weight: 600; /* 保持一致的字重防止位移 */
  transform: translateZ(0);
  transition: color 0.3s ease;
}

/* 激活状态文字 */
.ai-text-active {
  color: rgb(var(--v-theme-primary));
}

/* 刷新图标样式 */
.ai-refresh-icon {
  color: rgba(var(--v-theme-on-surface), 0.6);
  transition: color 0.3s ease;
}

.ai-divider {
  z-index: 0;
  flex-shrink: 0;
  block-size: 20px;
  border-inline-start: 1px solid rgba(var(--v-theme-on-surface), 0.12); /* 使用边框显示线条 */
  inline-size: 0; /* 宽度设为0，不占用空间 */
  transition: opacity 0.3s ease;
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
  border: 1px solid rgba(var(--v-theme-on-surface), 0.08);
  border-radius: 12px;
}

.resource-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
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
  .search-header {
    padding-block: 6px;
    padding-inline: 12px;
  }

  .search-title {
    font-size: 1.1rem;
    white-space: nowrap;
  }

  .search-info-container {
    gap: 8px;
    min-inline-size: 0;
  }

  .search-tags {
    flex-wrap: nowrap;
    margin-inline-end: 4px;
    overflow-x: auto;
    scrollbar-width: none;
  }

  .search-tags::-webkit-scrollbar {
    display: none;
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

  .view-toggle-container {
    flex-shrink: 0;
  }

  .view-toggle-buttons {
    padding: 2px;
  }

  .active-indicator {
    block-size: 32px;
    inline-size: 36px;
    inset-block-start: 2px;
    inset-inline-start: 2px;
  }

  .active-indicator.row {
    transform: translateX(36px);
  }

  .view-toggle-btn {
    block-size: 32px;
    inline-size: 36px;
  }

  .ai-toggle-buttons {
    block-size: 36px;
  }

  .ai-text {
    font-size: 0.8rem;
  }

  .ai-recommend-btn,
  .ai-toggle-buttons .v-btn {
    block-size: 36px !important;
    min-inline-size: unset !important;
  }

  .ai-recommend-btn {
    padding-inline: 12px 8px !important;
  }

  .ai-toggle-buttons .v-btn:last-child {
    min-inline-size: 32px !important;
  }
}
</style>
