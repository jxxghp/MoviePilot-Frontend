<script setup lang="ts">
import { debounce } from 'lodash-es'
import { useToast } from 'vue-toastification'
import api, { getApiBusinessErrorMessage, isApiBusinessFailure } from '@/api'
import { listStorageOptions } from '@/api/storage'
import type {
  StorageOption,
  TransferHistory,
  TransferHistoryDeleteResult,
  TransferHistoryDeleteStepStatus,
} from '@/api/types'
import ReorganizeDialog from '@/components/dialog/ReorganizeDialog.vue'
import TransferRecoveryDialog from '@/components/dialog/TransferRecoveryDialog.vue'
import TransferQueueDialog from '@/components/dialog/TransferQueueDialog.vue'
import ProgressDialog from '@/components/dialog/ProgressDialog.vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import { useDisplay } from 'vuetify'
import { formatFileSize } from '@/@core/utils/formatters'
import { useI18n } from 'vue-i18n'
import { usePWA } from '@/composables/usePWA'
import ProgressiveCardGrid from '@/components/misc/ProgressiveCardGrid.vue'
import NoDataFound from '@/components/states/NoDataFound.vue'
import { useDynamicButton, type DynamicButtonMenuItem } from '@/composables/useDynamicButton'
import { useAvailableHeight } from '@/composables/useAvailableHeight'
import { useBackground } from '@/composables/useBackground'
import { useGlobalSettingsStore, useUserStore } from '@/stores'
import { openSharedDialog } from '@/composables/useSharedDialog'
import { buildUserPermissionContext, hasPermission } from '@/utils/permission'
import { getDisplayImageUrl } from '@/utils/imageUtils'
import { formatMusicAudioSpecs } from '@/utils/music'

const TransferHistoryDeleteDialog = defineAsyncComponent(
  () => import('@/components/dialog/TransferHistoryDeleteDialog.vue'),
)

// i18n
const { t, te, locale } = useI18n()

// 全局设置
const globalSettingsStore = useGlobalSettingsStore()

// APP
const display = useDisplay()
const isDesktop = computed(() => display.mdAndUp.value)
const isMobile = computed(() => display.smAndDown.value)
// PWA模式检测
const { appMode } = usePWA()
const { useProgressSSE } = useBackground()

// 按视口和框架留白限定桌面页高度，保证标题与分页留在可视区域。
const { availableHeight, viewportHeight } = useAvailableHeight(135, 300)
const desktopToolbarRef = ref<HTMLElement | null>(null)
const { top: desktopToolbarTop } = useElementBounding(desktopToolbarRef)
// 框架预留 Dock 与页面内边距，真实起点负责兼容工具栏上方的布局高度。
// 桌面页自身不滚动，标题、批量操作与分页占固定空间，剩余高度交给虚拟记录区。
const desktopPageHeight = computed(() =>
  Math.max(0, Math.min(availableHeight.value + 135, viewportHeight.value - desktopToolbarTop.value - 24)),
)

// 按分页栏的实际顶边抬高桌面 FAB，兼容分页换行及窗口尺寸变化。
const desktopPaginationRef = ref<HTMLElement | null>(null)
const { top: desktopPaginationTop } = useElementBounding(desktopPaginationRef)
const desktopFabBottom = computed(() => Math.max(72, viewportHeight.value - desktopPaginationTop.value + 24))

// 提示框
const $toast = useToast()

// 路由
const route = useRoute()
const router = useRouter()
const userStore = useUserStore()
const canManage = computed(() =>
  hasPermission(buildUserPermissionContext(userStore.superUser, userStore.permissions), 'manage'),
)
let syncingRouteQuery = false
let fetchDataRequestSeed = 0
let mobileFetchDataRequestSeed = 0
let componentUnmounted = false
let historyViewActive = true

// 组合式输入法状态
const isComposing = ref(false)

// 当前操作记录
const currentHistory = ref<TransferHistory>()

// AI整理中的记录
const aiRedoIds = ref<number[]>([])

// AI整理进度
const aiRedoProgressActive = ref(false)
const aiRedoProgressText = ref(t('transferHistory.actions.aiRedoPending'))
const aiRedoProgressSSE = ref<ReturnType<typeof useProgressSSE> | null>(null)
const aiRedoProgressHistoryIds = ref<number[]>([])
let aiRedoProgressDialogController: ReturnType<typeof openSharedDialog> | null = null
let progressDialogController: ReturnType<typeof openSharedDialog> | null = null
let deleteDialogController: ReturnType<typeof openSharedDialog> | null = null

// 重新整理IDS
const redoIds = ref<number[]>([])
const redoTargetStorage = ref<string>()

// 已选中的数据
const selected = ref<TransferHistory[]>([])

/** 带分组身份的历史记录展示对象，业务请求仍使用原始字段。 */
interface TransferHistoryDisplayItem extends TransferHistory {
  history_group_album_path: string
  history_group_is_music_album: boolean
  history_group_key: string
  history_group_label: string
  history_group_storage?: string
  history_group_summary?: TransferHistoryGroupSummary
  history_group_track_key: string
  history_group_uses_destination: boolean
}

/** 当前页音乐专辑的摘要，不代表跨分页的专辑总计。 */
interface TransferHistoryGroupSummary {
  albumPath: string
  artist: string
  category: string
  coverItem: TransferHistoryDisplayItem
  date: string
  failedCount: number
  label: string
  mode: string
  size: number
  storage?: string
  successCount: number
  trackCount: number
}

// 当前删除尝试已完成的文件步骤，页面刷新后由后端“已不存在”状态重新确认。
const completedDeleteSteps = new Map<number, { source: boolean; destination: boolean }>()

type TransferHistoryStatusFilter = 'all' | 'success' | 'failed'

/** 状态筛选的稳定协议值与本地化显示信息。 */
interface TransferHistoryStatusFilterItem {
  title: string
  value: TransferHistoryStatusFilter
  icon: string
  color?: string
}

// 独立状态筛选，不再把本地化文案作为 title 的后端协议。
const statusFilter = ref<TransferHistoryStatusFilter>(getRouteStatusFilter(route.query.status))
const mobileStatusFilterMenu = ref(false)

const statusFilterItems = computed<TransferHistoryStatusFilterItem[]>(() => [
  { title: t('transferHistory.statusFilter.all'), value: 'all', icon: 'mdi-filter-multiple-outline' },
  { title: t('transferHistory.status.success'), value: 'success', icon: 'mdi-check-circle', color: 'success' },
  { title: t('transferHistory.status.failed'), value: 'failed', icon: 'mdi-alert-circle', color: 'error' },
])

const currentStatusFilter = computed<TransferHistoryStatusFilterItem>(() => {
  return (
    statusFilterItems.value.find(item => item.value === statusFilter.value) ?? {
      title: t('transferHistory.statusFilter.all'),
      value: 'all',
      icon: 'mdi-filter-multiple-outline',
    }
  )
})

const statusFilterButtonColor = computed(() =>
  statusFilter.value === 'all' ? 'gray' : currentStatusFilter.value.color,
)

// 移动端状态筛选沿用订阅页的外部激活器菜单，确保按钮固定在标题栏右侧。
const mobileStatusFilterActivator = computed(() => '[data-menu-activator="history-status-filter-btn"]')

// 选择移动端状态后立即关闭菜单，状态监听器负责刷新列表并同步地址栏。
function selectStatusFilter(value: TransferHistoryStatusFilter) {
  statusFilter.value = value
  mobileStatusFilterMenu.value = false
}

// 移动端批量选择模式
const mobileBatchMode = ref(false)

// 从季集字符串中提取可排序的数字。
const getNum = (s?: string) => (s ? parseInt(s.replace(/[^0-9]/g, ''), 10) || 0 : 0)

// 按媒体类型、标题和剧集序号排序历史记录。
function sortByTitle(a: TransferHistory, b: TransferHistory) {
  if (a.type !== b.type) {
    return (a.type ?? '').localeCompare(b.type ?? '')
  }
  if (a.title !== b.title) {
    return (a.title ?? '').toLocaleLowerCase().localeCompare((b.title ?? '').toLocaleLowerCase())
  }
  if (a.type === '电视剧') {
    if (a.seasons !== b.seasons) {
      return getNum(a.seasons) - getNum(b.seasons)
    }
    if (a.episodes !== b.episodes) {
      return getNum(a.episodes) - getNum(b.episodes)
    }
  }
  return 0
}

// 按源文件体积排序历史记录。
function sortBySourceSize(a: TransferHistory, b: TransferHistory) {
  return (a.src_fileitem?.size ?? 0) - (b.src_fileitem?.size ?? 0)
}

// 排序字段沿用原表头协议，卡片视图的排序选择器与虚拟列表共享比较器。
const headers = [
  {
    title: t('transferHistory.titleColumn'),
    key: 'title',
    sortable: true,
    sortRaw: sortByTitle,
  },
  {
    title: t('transferHistory.pathColumn'),
    key: 'src',
    sortable: true,
  },
  {
    title: t('transferHistory.modeColumn'),
    key: 'mode',
    sortable: true,
  },
  {
    title: t('transferHistory.sizeColumn'),
    key: 'size',
    sortable: true,
    sortRaw: sortBySourceSize,
  },
  {
    title: t('transferHistory.dateColumn'),
    key: 'date',
    sortable: true,
  },
  {
    title: t('transferHistory.statusColumn'),
    key: 'status',
    sortable: true,
  },
  {
    title: '',
    key: 'actions',
    sortable: false,
  },
]

// 桌面排序仍交给虚拟表格处理，保持当前页和原有自定义比较器的语义。
const desktopSortBy = ref<Array<{ key: string; order: 'asc' | 'desc' }>>([])
const desktopSortOptions = computed(() => [
  { title: t('transferHistory.desktop.defaultOrder'), value: '' },
  ...headers.filter(header => header.sortable).map(header => ({ title: header.title, value: header.key })),
])

/** 更换排序字段时沿用当前方向；清空字段恢复接口返回顺序。 */
function setDesktopSort(value: string) {
  desktopSortBy.value = value ? [{ key: value, order: desktopSortBy.value[0]?.order || 'asc' }] : []
}

/** 只翻转当前排序字段的方向，不重新请求或扩大到其它分页。 */
function toggleDesktopSortOrder() {
  const current = desktopSortBy.value[0]
  if (current) desktopSortBy.value = [{ ...current, order: current.order === 'asc' ? 'desc' : 'asc' }]
}

// 本页选择基于业务 ID，虚拟节点回收和分组折叠不会丢失选中状态。
const desktopSelectedCount = computed(() => dataList.value.filter(item => selectedIdSet.value.has(item.id)).length)
const desktopAllSelected = computed(
  () => dataList.value.length > 0 && desktopSelectedCount.value === dataList.value.length,
)

/** 顶部全选只覆盖后端当前页，避免影响未加载或被过滤的记录。 */
function selectDesktopPage(checked: boolean | null) {
  updateHistorySelection(dataList.value, checked)
}

/** 清除当前选择，同时复用现有批量操作状态。 */
function clearDesktopSelection() {
  selected.value = []
}

/** 明确切换到指定视图，继续使用现有地址栏和本地偏好同步。 */
function setDesktopGrouping(grouped: boolean) {
  if (group.value !== grouped) toggleHistoryGrouping()
}

const pageRange = [
  { title: '25', value: 25 },
  { title: '50', value: 50 },
  { title: '100', value: 100 },
  { title: '500', value: 500 },
  { title: '1000', value: 1000 },
]

const pageRangeValues = pageRange.map(item => item.value)

// 数据列表
const dataList = ref<TransferHistoryDisplayItem[]>([])

// 移动端历史记录列表，独立于桌面分页表格。
const mobileDataList = ref<TransferHistory[]>([])

// 移动端每次触底加载的记录数。
const mobilePageSize = 25

// 移动端触底加载页码。
const mobileCurrentPage = ref(1)

// 移动端是否还有下一页。
const mobileHasMore = ref(true)

// 移动端无限滚动组件重置键。
const mobileInfiniteKey = ref(0)

// 移动端加载状态。
const mobileLoading = ref(false)

// 移动端已展开完整路径的记录 ID。
const mobileExpandedPathIds = ref<number[]>([])

// 搜索
const search = ref(getRouteQueryString(route.query.search))

// 写入搜索值时统一把空字符串归一为 null，避免 VCombobox 把空字符串当作已有值。
function setSearchValue(value: unknown) {
  search.value = typeof value === 'string' && value !== '' ? value : null
}

// 搜索提示词列表
const searchHintList = ref<string[]>([])

// 加载状态
const loading = ref(false)

// 总条数
const totalItems = ref(0)

const HISTORY_GROUPING_KEY = 'transferHistory.grouped'

// 是否要分组；地址栏优先，其次恢复用户上次手动选择。
const group = ref(false)
// 区分默认平铺与用户显式选择平铺，避免搜索/翻页提前关闭后续专辑自动分组。
const groupPreferenceExplicit = ref(false)
restoreHistoryGroupingPreference()

/** 恢复分组偏好，未保存选择时继续允许按音乐专辑自动分组。 */
function restoreHistoryGroupingPreference() {
  const saved = localStorage.getItem(HISTORY_GROUPING_KEY)
  const preference =
    route.query.grouped !== undefined ? route.query.grouped : saved === 'true' || saved === 'false' ? saved : undefined
  group.value = preference === 'true'
  groupPreferenceExplicit.value = preference !== undefined
}

// 分组条件
const groupBy = ref<Array<{ key: string }>>([
  {
    key: 'history_group_key',
  },
])

// 每页条数
const itemsPerPage = ref<number>(ensurePageSize(route.query.itemsPerPage, 50))

// 当前页码
const currentPage = ref<number>(Math.max(1, ensureNumber(route.query.currentPage, 1)))

// 进度条
const progressText = ref(t('transferHistory.progress.pleaseWait'))

// 进度值
const progressValue = ref(0)

// 是否已刷新
const isRefreshed = ref(false)
// 只有成功加载后的空列表显示 404，避免加载或请求失败时闪现空状态。
const desktopEmpty = computed(() => isRefreshed.value && !loading.value && dataList.value.length === 0)

// 是否已完成首次激活
const hasActivatedOnce = ref(false)

// 确认框标题
const confirmTitle = ref('')

// 所有存储
const storages = ref<StorageOption[]>([])

// 查询存储
async function loadStorages() {
  try {
    storages.value = await listStorageOptions()
  } catch (error) {
    console.log(error)
  }
}

// 打开共享进度弹窗，长任务完成后统一关闭。
function openProgressDialog(text = progressText.value, value = progressValue.value) {
  progressDialogController?.close()
  progressDialogController = openSharedDialog(ProgressDialog, { text, value }, {}, { closeOn: false })
}

// 关闭共享进度弹窗。
function closeProgressDialog() {
  progressDialogController?.close()
  progressDialogController = null
}

// 打开整理队列进度弹窗。
function openTransferQueueDialog() {
  openSharedDialog(TransferQueueDialog, {}, {}, { closeOn: ['close'] })
}

// 打开共享删除确认弹窗。
function openDeleteConfirmDialog() {
  deleteDialogController?.close()
  deleteDialogController = openSharedDialog(
    TransferHistoryDeleteDialog,
    {
      title: confirmTitle.value,
    },
    {
      close: () => {
        deleteDialogController = null
      },
      delete: deleteConfirmHandler,
      'update:modelValue': (value: boolean) => {
        if (!value) deleteDialogController = null
      },
    },
    { closeOn: ['close', 'delete', 'update:modelValue'] },
  )
}

// 关闭共享删除确认弹窗。
function closeDeleteConfirmDialog() {
  deleteDialogController?.close()
  deleteDialogController = null
}

// 打开重新整理弹窗，完成后刷新历史列表。
function openRedoDialog() {
  openSharedDialog(
    ReorganizeDialog,
    {
      logids: redoIds.value,
      target_storage: redoTargetStorage.value,
    },
    {
      done: transferDone,
      close: transferDone,
    },
    { closeOn: ['close', 'done'] },
  )
}

// 存储字典
const storageDict = computed(() => {
  return storages.value.reduce(
    (dict, item) => {
      dict[item.type] = item.name
      return dict
    },
    {} as Record<string, string>,
  )
})

// 转移方式字典
const TransferDict: { [key: string]: string } = {
  copy: t('transferHistory.transferMode.copy'),
  move: t('transferHistory.transferMode.move'),
  link: t('transferHistory.transferMode.link'),
  softlink: t('transferHistory.transferMode.softlink'),
  rclone_copy: t('transferHistory.transferMode.rclone_copy'),
  rclone_move: t('transferHistory.transferMode.rclone_move'),
}

// 分页提示
const pageTip = computed(() => {
  const begin = itemsPerPage.value * (currentPage.value - 1) + 1
  const end = Math.min(itemsPerPage.value * currentPage.value, totalItems.value)
  return {
    begin,
    end,
  }
})

// 分页总数
const totalPage = computed(() => {
  const total = Math.ceil(totalItems.value / itemsPerPage.value)
  return Math.max(1, total)
})

// 延迟同步分页参数到地址栏，避免快速翻页时连续触发请求。
const debouncedReloadPage = debounce(() => {
  void reloadPage()
}, 1000)

// 延迟同步搜索参数到地址栏，输入完成后再重置页码并刷新。
const debouncedReloadSearchPage = debounce(() => {
  console.log('search: ' + (search.value ?? ''))
  void reloadPage(true)
}, 1000)

// 延迟同步移动端搜索参数，路由监听会按新查询重置无限列表。
const debouncedReloadMobileSearchPage = debounce(() => {
  void reloadMobileSearchPage()
}, 600)

// 切换页签
watch([() => currentPage.value, () => itemsPerPage.value], () => {
  if (!historyViewActive || syncingRouteQuery || !isDesktop.value) return

  debouncedReloadPage()
})

// 搜索监听
watch([() => search.value, () => isComposing.value], () => {
  if (!historyViewActive || syncingRouteQuery || isComposing.value) return

  if (isMobile.value) {
    debouncedReloadMobileSearchPage()
    return
  }

  debouncedReloadSearchPage()
})

// 状态筛选变化时重置页码，并由地址栏保存可分享的查询条件。
watch(
  () => statusFilter.value,
  () => {
    if (!historyViewActive || syncingRouteQuery) return
    if (isMobile.value) {
      void reloadMobileSearchPage()
      return
    }
    void reloadPage(true)
  },
)

// 分组模式变化时同步到地址栏，方便返回页面时恢复用户选择。
watch(
  () => group.value,
  () => {
    if (!historyViewActive || syncingRouteQuery || !isDesktop.value) return

    void reloadPage()
  },
)

// 路由参数变化时同步页面状态并重新请求列表数据。
watch(
  () => route.query,
  () => {
    if (!historyViewActive || route.path !== '/history') return
    if (isDesktop.value) {
      void refreshDataFromRouteQuery()
    } else {
      syncMobileSearchFromRouteQuery()
      resetMobileHistory()
    }
  },
  { deep: true },
)

// 响应桌面与移动端断点切换，进入对应布局后刷新对应数据源。
watch(isDesktop, desktop => {
  if (!historyViewActive || route.path !== '/history') return
  if (desktop) {
    void refreshDataFromRouteQuery()
  } else {
    resetMobileHistory()
  }
})

// 统一 Windows 与 POSIX 路径后返回父目录；音乐整理后的父目录就是播放器使用的专辑目录。
function normalizeHistoryPath(path?: string) {
  let normalized = (path || '').replaceAll('\\', '/')
  while (normalized.endsWith('/')) normalized = normalized.slice(0, -1)
  return normalized
}

/** 提取有效父目录，缺少目录的记录不参与专辑路径分组。 */
function getHistoryParentPath(path?: string) {
  const normalized = normalizeHistoryPath(path)
  const separator = normalized.lastIndexOf('/')
  return separator > 0 ? normalized.slice(0, separator) : ''
}

// 从完整路径中提取分组标题，保留整理规则生成的专辑名与年份。
function getHistoryPathName(path: string) {
  return path.split('/').filter(Boolean).at(-1) || path
}

// 音乐按目标专辑目录分组，旧记录或失败记录则回退到源目录；其它媒体保持原有的标题分组。
function toHistoryDisplayItem(item: TransferHistory): TransferHistoryDisplayItem {
  if (item.type === '音乐') {
    const candidates = item.status
      ? ([
          [item.dest, item.dest_storage, true],
          [item.src, item.src_storage, false],
        ] as const)
      : item.src
        ? ([[item.src, item.src_storage, false]] as const)
        : ([[item.dest, item.dest_storage, true]] as const)
    for (const [path, storage, usesDestination] of candidates) {
      const normalizedPath = normalizeHistoryPath(path)
      const albumPath = getHistoryParentPath(normalizedPath)
      if (!albumPath) continue
      return {
        ...item,
        history_group_album_path: albumPath,
        history_group_is_music_album: true,
        history_group_key: `music:${JSON.stringify([storage || '', albumPath])}`,
        history_group_label: getHistoryPathName(albumPath),
        history_group_storage: storage,
        history_group_track_key: JSON.stringify([storage || '', normalizedPath]),
        history_group_uses_destination: usesDestination,
      }
    }
  }

  const title = item.title || t('common.unknown')
  return {
    ...item,
    history_group_album_path: '',
    history_group_is_music_album: false,
    history_group_key: `title:${JSON.stringify(item.title ?? null)}`,
    history_group_label: title,
    history_group_track_key: `history:${item.id}`,
    history_group_uses_destination: false,
  }
}

// 为折叠后的音乐专辑补齐可直接浏览的摘要，避免聚合行只剩一个标题。
function addHistoryGroupSummaries(items: TransferHistoryDisplayItem[]) {
  const groups = new Map<string, TransferHistoryDisplayItem[]>()
  for (const item of items) {
    if (!item.history_group_is_music_album) continue
    const groupItems = groups.get(item.history_group_key) || []
    groupItems.push(item)
    groups.set(item.history_group_key, groupItems)
  }

  for (const groupItems of groups.values()) {
    const firstItem = groupItems[0]
    if (!firstItem) continue
    const modes = [...new Set(groupItems.map(item => item.mode).filter((mode): mode is string => Boolean(mode)))]
    const summary: TransferHistoryGroupSummary = {
      albumPath: firstItem.history_group_album_path,
      artist: firstItem.history_group_uses_destination
        ? getHistoryPathName(getHistoryParentPath(firstItem.history_group_album_path))
        : '',
      category: groupItems.find(item => item.category)?.category || '',
      coverItem: groupItems.find(item => item.image) || firstItem,
      date:
        groupItems
          .map(item => item.date || '')
          .sort()
          .at(-1) || '',
      failedCount: groupItems.filter(item => !item.status).length,
      label: firstItem.history_group_label,
      mode: modes.map(mode => TransferDict[mode] || mode).join(' · '),
      size: groupItems.reduce((total, item) => total + (item.src_fileitem?.size || 0), 0),
      storage: firstItem.history_group_storage,
      successCount: groupItems.filter(item => item.status).length,
      trackCount: groupItems.length,
    }
    for (const item of groupItems) item.history_group_summary = summary
  }

  return items
}

// 当前页出现同一专辑的多首音乐时，首次访问自动切换到可展开的分组视图。
function hasMusicAlbumGroup(items: TransferHistoryDisplayItem[]) {
  const tracksByAlbum = new Map<string, Set<string>>()
  for (const item of items) {
    if (!item.history_group_is_music_album) continue
    const tracks = tracksByAlbum.get(item.history_group_key) || new Set<string>()
    tracks.add(item.history_group_track_key)
    if (tracks.size > 1) return true
    tracksByAlbum.set(item.history_group_key, tracks)
  }
  return false
}

// 获取历史记录数据，keep-alive 重新进入时可静默刷新，避免表格出现重新加载感。
/** 加载整理历史当前页并拒绝过期响应，保留选择及音乐自动分组策略。 */
async function fetchData(page = currentPage.value, count = itemsPerPage.value, options: { silent?: boolean } = {}) {
  if (!historyViewActive) return
  const requestSeed = ++fetchDataRequestSeed
  const shouldShowLoading = !options.silent
  if (shouldShowLoading) {
    loading.value = true
  }

  try {
    const result = await api.get<{ list?: TransferHistory[]; total?: number }>('history/transfer', {
      params: {
        page,
        count,
        title: search.value ?? '',
        ...(statusFilter.value === 'all' ? {} : { status: statusFilter.value === 'success' }),
      },
    })
    if (!historyViewActive || requestSeed !== fetchDataRequestSeed) return

    const list = Array.isArray(result.list) ? result.list : []

    isRefreshed.value = true
    const displayList = addHistoryGroupSummaries(list.map(toHistoryDisplayItem))
    dataList.value = displayList
    if (isDesktop.value && selected.value.length > 0) {
      const refreshedItems = new Map(displayList.map(item => [item.id, item]))
      selected.value = selected.value.flatMap(item => {
        const refreshed = refreshedItems.get(item.id)
        return refreshed ? [refreshed] : []
      })
    }
    totalItems.value = ensureNumber(result.total, 0)
    updateSearchHintList(list)

    if (historyViewActive && isDesktop.value && !groupPreferenceExplicit.value && hasMusicAlbumGroup(displayList)) {
      group.value = true
    }

    return {
      list,
      total: totalItems.value,
    }
  } catch (error) {
    console.error(error)
  } finally {
    // 静默刷新可能会接管前一个可见请求，也需要负责清掉遗留的表格加载态。
    if (requestSeed === fetchDataRequestSeed && (shouldShowLoading || loading.value)) {
      loading.value = false
    }
  }
}

const completedDeleteStatuses: TransferHistoryDeleteStepStatus[] = ['deleted', 'already_missing']

/** 删除成功与文件已不存在都视为完成，重试时无需再次操作。 */
function isCompletedDeleteStatus(status: TransferHistoryDeleteStepStatus) {
  return completedDeleteStatuses.includes(status)
}

/** 校验删除响应中的各步骤状态，避免将不完整响应视为成功。 */
function parseDeleteResult(value: unknown): TransferHistoryDeleteResult | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const record = value as Record<string, unknown>
  const parseStep = (step: unknown) => {
    if (!step || typeof step !== 'object' || Array.isArray(step)) return undefined
    const stepRecord = step as Record<string, unknown>
    const statuses: TransferHistoryDeleteStepStatus[] = ['not_requested', 'deleted', 'already_missing', 'failed']
    if (!statuses.includes(stepRecord.status as TransferHistoryDeleteStepStatus)) return undefined
    return {
      status: stepRecord.status as TransferHistoryDeleteStepStatus,
      message: typeof stepRecord.message === 'string' ? stepRecord.message : undefined,
    }
  }
  const source = parseStep(record.source)
  const destination = parseStep(record.destination)
  const history = record.history
  if (!source || !destination || (history !== 'deleted' && history !== 'retained' && history !== 'not_found')) {
    return undefined
  }
  return {
    source,
    destination,
    history,
    message: typeof record.message === 'string' ? record.message : undefined,
  }
}

/** 保留部分删除的完成进度，历史记录移除后释放重试状态。 */
function rememberDeleteResult(item: TransferHistory, result: TransferHistoryDeleteResult) {
  if (result.history === 'deleted' || result.history === 'not_found') {
    completedDeleteSteps.delete(item.id)
    return
  }
  const previous = completedDeleteSteps.get(item.id) ?? { source: false, destination: false }
  completedDeleteSteps.set(item.id, {
    source: previous.source || isCompletedDeleteStatus(result.source.status),
    destination: previous.destination || isCompletedDeleteStatus(result.destination.status),
  })
}

/** 重试只提交用户选择且尚未完成的文件删除步骤。 */
function getDeleteFlags(item: TransferHistory, deleteSrc: boolean, deleteDest: boolean) {
  const completed = completedDeleteSteps.get(item.id)
  return {
    deleteSrc: deleteSrc && !completed?.source,
    deleteDest: deleteDest && !completed?.destination,
  }
}

/** 按完成与失败分类生成删除步骤摘要，略过未请求的步骤。 */
function formatDeleteStepSummary(result: TransferHistoryDeleteResult) {
  const completed: string[] = []
  const failed: string[] = []
  const addStep = (label: string, status: TransferHistoryDeleteStepStatus) => {
    if (status === 'not_requested') return
    if (isCompletedDeleteStatus(status)) completed.push(label)
    if (status === 'failed') failed.push(label)
  }
  addStep(t('transferHistory.deleteStep.source'), result.source.status)
  addStep(t('transferHistory.deleteStep.destination'), result.destination.status)
  if (result.history === 'deleted') completed.push(t('transferHistory.deleteStep.record'))
  if (result.history === 'retained') failed.push(t('transferHistory.deleteStep.record'))
  return { completed: completed.join(', '), failed: failed.join(', ') }
}

/** 从业务失败响应中恢复部分删除结果，用于提示与重试。 */
function getDeleteResultFromError(error: unknown): TransferHistoryDeleteResult | undefined {
  if (!isApiBusinessFailure(error)) return undefined
  const payload = error.payload
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return undefined
  return parseDeleteResult((payload as Record<string, unknown>).data)
}

/** 根据调用方反馈策略展示部分失败及已完成的删除步骤。 */
function notifyDeleteResult(result: TransferHistoryDeleteResult, notifyError: boolean) {
  if (!notifyError) return
  const summary = formatDeleteStepSummary(result)
  if (!summary.failed) return
  const detail = [
    result.message,
    summary.completed ? `${t('transferHistory.deleteStep.completed')}: ${summary.completed}` : '',
    `${t('transferHistory.deleteStep.failed')}: ${summary.failed}`,
  ]
    .filter(Boolean)
    .join('；')
  $toast.error(t('transferHistory.deleteFailed', { message: detail }))
}

// 更新搜索建议，移动端追加加载时会合并已加载记录的标题。
function updateSearchHintList(list: TransferHistory[]) {
  searchHintList.value = [...new Set(list.map((item: TransferHistory) => item.title || ''))].filter(
    (title): title is string => title !== '',
  )
}

interface MobileHistoryResetOptions {
  /** 是否保持批量模式，通常用于失败项重试。 */
  preserveBatchMode?: boolean
  /** 重置分页时仍需保持选中的记录。 */
  selectedItems?: TransferHistory[]
}

// 重置移动端无限列表，让 VInfiniteScroll 从第一页重新触发加载。
function resetMobileHistory(options: MobileHistoryResetOptions = {}) {
  mobileFetchDataRequestSeed++
  mobileDataList.value = []
  mobileCurrentPage.value = 1
  mobileHasMore.value = true
  mobileLoading.value = false
  isRefreshed.value = false
  totalItems.value = 0
  mobileExpandedPathIds.value = []
  selected.value = options.selectedItems ?? []
  mobileBatchMode.value = Boolean(options.preserveBatchMode && selected.value.length > 0)
  mobileInfiniteKey.value++
}

// 移动端不启用桌面分组视图，但保留其显式偏好，避免搜索时从地址栏丢失。
function syncMobileSearchFromRouteQuery() {
  syncingRouteQuery = true
  try {
    search.value = getRouteQueryString(route.query.search)
    statusFilter.value = getRouteStatusFilter(route.query.status)
    restoreHistoryGroupingPreference()
  } finally {
    void nextTick(() => {
      syncingRouteQuery = false
    })
  }
}

/** 移动端触底加载历史记录，并将新页追加到虚拟列表数据源。 */
async function loadMobileHistory({ done }: { done: (status: 'ok' | 'empty' | 'error') => void }) {
  if (mobileLoading.value) {
    done('ok')
    return
  }

  if (!mobileHasMore.value) {
    done('empty')
    return
  }

  const requestSeed = ++mobileFetchDataRequestSeed

  try {
    mobileLoading.value = true
    const result = await api.get<{ list?: TransferHistory[]; total?: number }>('history/transfer', {
      params: {
        page: mobileCurrentPage.value,
        count: mobilePageSize,
        title: search.value ?? '',
        ...(statusFilter.value === 'all' ? {} : { status: statusFilter.value === 'success' }),
      },
    })
    if (requestSeed !== mobileFetchDataRequestSeed) {
      done('ok')
      return
    }

    const list = Array.isArray(result.list) ? result.list : []
    const total = ensureNumber(result.total, 0)

    appendMobileHistory(list, total)
    done(mobileHasMore.value ? 'ok' : 'empty')
  } catch (error) {
    console.error(error)
    done('error')
  } finally {
    if (requestSeed === mobileFetchDataRequestSeed) {
      mobileLoading.value = false
    }
  }
}

// 将移动端新页数据合并到列表，并维护下一页状态。
function appendMobileHistory(list: TransferHistory[], total: number) {
  isRefreshed.value = true
  totalItems.value = total

  if (list.length === 0) {
    mobileHasMore.value = false
    updateSearchHintList(mobileDataList.value)
    return
  }

  const existingIds = new Set(mobileDataList.value.map(item => item.id))
  const newItems = list.filter(item => !existingIds.has(item.id))

  mobileDataList.value = [...mobileDataList.value, ...newItems]
  if (selected.value.length > 0) {
    const refreshedItems = new Map(mobileDataList.value.map(item => [item.id, item]))
    selected.value = selected.value.map(item => refreshedItems.get(item.id) ?? item)
  }
  mobileCurrentPage.value++
  mobileHasMore.value = mobileDataList.value.length < total && list.length >= mobilePageSize
  updateSearchHintList(mobileDataList.value)
}

// 从路由查询参数中取出单值字符串，空搜索统一返回 null 以保持输入框 placeholder 可见。
function getRouteQueryString(value: unknown): string | null {
  if (Array.isArray(value)) {
    return value.find(item => typeof item === 'string' && item !== '') ?? null
  }

  return typeof value === 'string' && value !== '' ? value : null
}

// 仅接受地址栏中的显式 success/failed，未知值回退到全部状态。
function getRouteStatusFilter(value: unknown): TransferHistoryStatusFilter {
  const raw = Array.isArray(value) ? value.find(item => typeof item === 'string') : value
  return raw === 'success' || raw === 'failed' ? raw : 'all'
}

// 将当前路由查询参数同步回页面状态，并避免触发本地监听器反向写入地址栏。
async function syncStateFromRouteQuery() {
  syncingRouteQuery = true
  try {
    search.value = getRouteQueryString(route.query.search)
    statusFilter.value = getRouteStatusFilter(route.query.status)
    itemsPerPage.value = ensurePageSize(route.query.itemsPerPage, 50)
    currentPage.value = Math.max(1, ensureNumber(route.query.currentPage, 1))
    restoreHistoryGroupingPreference()
  } finally {
    await nextTick()
    syncingRouteQuery = false
  }
}

// 根据地址栏中的查询参数刷新历史列表。
async function refreshDataFromRouteQuery(options: { silent?: boolean } = {}) {
  if (!historyViewActive) return
  await syncStateFromRouteQuery()
  if (!historyViewActive) return
  await fetchData(currentPage.value, itemsPerPage.value, options)
}

// 操作完成后刷新列表；如果当前页被删空，则跳回最后一个有效页。
async function refreshDataAfterOperation(mobileSelection: TransferHistory[] = []) {
  if (isMobile.value) {
    resetMobileHistory({
      preserveBatchMode: mobileSelection.length > 0,
      selectedItems: mobileSelection,
    })
    return
  }

  const result = await fetchData()
  if (!result) return

  const lastAvailablePage = Math.max(1, Math.ceil(result.total / itemsPerPage.value))
  if (currentPage.value <= lastAvailablePage) return

  await router.replace(createHistoryUrl(false, lastAvailablePage))
}

// 根据 type 返回不同的图标
function getIcon(type: string) {
  if (type === '电影') return 'mdi-movie'
  else if (type === '电视剧') return 'mdi-television-classic'
  else if (type === '音乐') return 'mdi-album'
  else return 'mdi-help-circle'
}

// 媒体占位图标：电影/电视剧/音乐各自使用对应图标，缺失封面时统一渲染图标 + 底色占位
function getPlaceholderIcon(type: string) {
  if (type === '音乐') return 'mdi-album'
  else if (type === '电视剧') return 'mdi-television-classic'
  else return 'mdi-movie-open-outline'
}

// 计算历史记录海报地址，整理历史的 image 字段由后端写入 Poster 图片。
function getHistoryPosterUrl(item: TransferHistory) {
  const image = item.image
  if (!image) return ''

  if (!/^https?:\/\//i.test(image)) {
    return `${import.meta.env.VITE_API_BASE_URL}system/img/0?imgurl=${encodeURIComponent(image)}`
  }

  return getDisplayImageUrl(image, globalSettingsStore.globalSettings.GLOBAL_IMAGE_CACHE)
}

// 删除历史记录
async function removeHistory(item: TransferHistory) {
  currentHistory.value = item
  confirmTitle.value = t('transferHistory.deleteConfirm', {
    title: item.title,
    seasons: item.seasons || '',
    episodes: item.episodes || '',
  })
  openDeleteConfirmDialog()
}

// 调用API删除记录
async function remove(
  item: TransferHistory,
  deleteSrc: boolean,
  deleteDest: boolean,
  notifyError = true,
): Promise<TransferHistoryDeleteResult | undefined> {
  try {
    const result = await api.delete<TransferHistoryDeleteResult>(
      `history/transfer?deletesrc=${deleteSrc}&deletedest=${deleteDest}`,
      {
        // 删除接口只需要 ID；音乐分组摘要会回指封面记录，整条展示对象无法序列化。
        data: { id: item.id },
        feedback: 'silent',
      },
    )
    const parsed = parseDeleteResult(result)
    if (!parsed) throw new Error('删除响应缺少分项结果')
    rememberDeleteResult(item, parsed)
    notifyDeleteResult(parsed, notifyError)
    return parsed
  } catch (error) {
    const businessResult = getDeleteResultFromError(error)
    if (businessResult) {
      rememberDeleteResult(item, businessResult)
      notifyDeleteResult(businessResult, notifyError)
      return businessResult
    }
    console.error(error)
    if (notifyError) {
      $toast.error(t('transferHistory.deleteRequestFailed'))
    }
    return undefined
  }
}

// 删除单条记录
async function removeSingle(deleteSrc: boolean, deleteDest: boolean) {
  // 关闭弹窗
  closeDeleteConfirmDialog()
  if (!currentHistory.value) return

  // 删除
  const flags = getDeleteFlags(currentHistory.value, deleteSrc, deleteDest)
  await remove(currentHistory.value, flags.deleteSrc, flags.deleteDest)
  // 刷新
  await refreshDataAfterOperation()
}

// 批量删除记录
async function removeBatch(deleteSrc: boolean, deleteDest: boolean) {
  if (hasRunningAiRedo.value) return
  // 关闭弹窗
  closeDeleteConfirmDialog()
  const batchItems = scopeSelectionToVisibleHistory()
  // 总条数
  const total = batchItems.length
  if (total === 0) return

  // 已处理条数
  let handled = 0
  const failedItems: TransferHistory[] = []
  const failedDetails: string[] = []
  // 显示进度条
  openProgressDialog()
  // 循环调用removeHistory
  for (const item of batchItems) {
    // 开始删除
    const seasonEpisode = `${item.seasons || ''}${item.episodes || ''}`
    const name = [item.title, seasonEpisode].filter(Boolean).join(' ')
    progressText.value = t('transferHistory.deleting', { name })
    const flags = getDeleteFlags(item, deleteSrc, deleteDest)
    const result = await remove(item, flags.deleteSrc, flags.deleteDest, false)
    if (!result || result.history !== 'deleted') {
      failedItems.push(item)
      if (result) {
        const summary = formatDeleteStepSummary(result)
        const detail = [summary.completed, summary.failed].filter(Boolean).join(' / ')
        if (detail) failedDetails.push(`${name}: ${detail}`)
      }
    }
    // 删除完成
    handled++
    progressValue.value = (handled / total) * 100
    progressDialogController?.updateProps({ text: progressText.value, value: progressValue.value })
  }
  // 失败项保持选中，方便用户修正条件后重试。
  selected.value = failedItems
  if (isMobile.value && failedItems.length === 0) {
    mobileBatchMode.value = false
  }
  // 隐藏进度条
  closeProgressDialog()
  if (failedItems.length > 0) {
    const summary = t('transferHistory.batchDeleteFailed', { failed: failedItems.length, total })
    $toast.error(
      failedDetails.length > 0
        ? t('transferHistory.batchDeleteFailedDetail', { summary, details: failedDetails.join('；') })
        : summary,
    )
  }
  // 重新获取数据
  await refreshDataAfterOperation(failedItems)
}

// 响应删除操作
async function deleteConfirmHandler(deleteSrc: boolean, deleteDest: boolean) {
  if (currentHistory.value) await removeSingle(deleteSrc, deleteDest)
  else await removeBatch(deleteSrc, deleteDest)
}

// 批量删除历史记录
async function removeHistoryBatch() {
  if (hasRunningAiRedo.value) return
  const batchItems = scopeSelectionToVisibleHistory()
  if (batchItems.length === 0) return

  // 清空当前操作记录
  currentHistory.value = undefined
  confirmTitle.value = t('transferHistory.deleteConfirmBatch', {
    count: batchItems.length,
  })
  // 打开确认弹窗
  openDeleteConfirmDialog()
}
// 批量重新整理
async function retransferBatch() {
  if (hasRunningAiRedo.value) return
  const batchItems = scopeSelectionToVisibleHistory()
  if (batchItems.length === 0) return

  // 清空当前操作记录
  currentHistory.value = undefined
  // 重新整理IDS
  redoIds.value = batchItems.map(item => item.id)
  // 打开识别弹窗
  openRedoDialog()
}

// 整理完成
async function transferDone() {
  // 清空当前操作记录
  currentHistory.value = undefined
  selected.value = []
  if (isMobile.value) {
    mobileBatchMode.value = false
  }
  // 刷新
  await refreshDataAfterOperation()
}

// AI助手是否启用
const aiAgentEnabled = computed(() => Boolean(globalSettingsStore.globalSettings.AI_AGENT_ENABLE))
const hasRunningAiRedo = computed(() => aiRedoIds.value.length > 0)

// AI整理中的记录
function isAiRedoing(historyId: number) {
  return aiRedoIds.value.includes(historyId)
}

// 停止AI整理进度
function stopAiRedoProgress() {
  aiRedoProgressActive.value = false

  if (aiRedoProgressSSE.value) {
    aiRedoProgressSSE.value.stop()
    aiRedoProgressSSE.value = null
  }
}

// AI整理完成
async function finishAiRedo(success: boolean, errorMessage?: string) {
  const historyIds = [...aiRedoProgressHistoryIds.value]
  const historyIdSet = new Set(historyIds)

  stopAiRedoProgress()
  aiRedoProgressDialogController?.close()
  aiRedoProgressDialogController = null
  aiRedoProgressHistoryIds.value = []
  aiRedoIds.value = aiRedoIds.value.filter(id => !historyIdSet.has(id))
  selected.value = selected.value.filter(item => !historyIdSet.has(item.id))

  await refreshDataAfterOperation()

  if (!success && errorMessage) {
    $toast.error(errorMessage)
  }
}

// 处理AI整理进度
async function handleAiRedoProgressMessage(event: MessageEvent) {
  const progress = JSON.parse(event.data)
  if (!progress) return

  aiRedoProgressText.value = progress.text_i18n || progress.text || t('transferHistory.actions.aiRedoPending')
  aiRedoProgressDialogController?.updateProps({ text: aiRedoProgressText.value })

  if (progress.enable === false) {
    await finishAiRedo(progress.data?.success !== false, progress.data?.error_i18n || progress.data?.error)
  }
}

// 开始监听整理进度
function startAiRedoProgress(historyId: number, progressKey: string) {
  startAiRedoProgressBatch([historyId], progressKey)
}

// 开始监听批量整理进度
function startAiRedoProgressBatch(historyIds: number[], progressKey: string) {
  stopAiRedoProgress()

  aiRedoProgressHistoryIds.value = historyIds
  aiRedoProgressActive.value = true
  aiRedoProgressText.value = t('transferHistory.actions.aiRedoPending')
  aiRedoProgressDialogController = openSharedDialog(
    ProgressDialog,
    { text: aiRedoProgressText.value },
    {},
    { closeOn: false },
  )

  const url = `${import.meta.env.VITE_API_BASE_URL}system/progress/${progressKey}`

  aiRedoProgressSSE.value = useProgressSSE(
    url,
    handleAiRedoProgressMessage,
    `transfer-history-ai-redo-${progressKey}`,
    aiRedoProgressActive,
  )

  aiRedoProgressSSE.value.start()
}

// 提交重整被租约、任务状态或人工复核拦截时，优先展示后端给出的可执行原因。
function notifyAiRedoSubmitFailure(error: unknown) {
  $toast.error(getApiBusinessErrorMessage(error) || t('transferHistory.aiRedoFailed'))
}

// 触发AI整理
async function triggerAiRedo(item: TransferHistory) {
  if (!aiAgentEnabled.value) {
    $toast.error(t('transferHistory.aiRedoDisabled'))
    return
  }
  if (hasRunningAiRedo.value) return

  aiRedoIds.value = [...aiRedoIds.value, item.id]
  let progressStarted = false
  try {
    const result = await api.post<{ progress_key?: string }>(`history/transfer/${item.id}/ai-redo`, undefined, {
      feedback: 'silent',
    })
    if (componentUnmounted) return

    const progressKey = result.progress_key

    if (!progressKey) {
      $toast.error(t('transferHistory.aiRedoFailed'))
      return
    }
    startAiRedoProgress(item.id, progressKey)
    progressStarted = true
  } catch (error) {
    console.error(error)
    if (!componentUnmounted) {
      notifyAiRedoSubmitFailure(error)
    }
  } finally {
    if (!progressStarted) {
      aiRedoIds.value = aiRedoIds.value.filter(id => id !== item.id)
    }
  }
}

// 批量触发AI整理
async function triggerBatchAiRedo() {
  if (!aiAgentEnabled.value) {
    $toast.error(t('transferHistory.aiRedoDisabled'))
    return
  }
  if (hasRunningAiRedo.value) return

  const historyIds = [...new Set(scopeSelectionToVisibleHistory().map(item => item.id))]
  if (historyIds.length === 0) return

  aiRedoIds.value = [...new Set([...aiRedoIds.value, ...historyIds])]
  let progressStarted = false
  try {
    const result = await api.post<{ history_ids?: number[]; progress_key?: string }>(
      'history/transfer/ai-redo',
      {
        history_ids: historyIds,
      },
      { feedback: 'silent' },
    )
    if (componentUnmounted) return

    const progressKey = result.progress_key
    const acceptedIds = result.history_ids ?? historyIds

    if (!progressKey) {
      $toast.error(t('transferHistory.aiRedoFailed'))
      return
    }
    startAiRedoProgressBatch(acceptedIds, progressKey)
    selected.value = selected.value.filter(item => !acceptedIds.includes(item.id))
    if (isMobile.value && selected.value.length === 0) {
      mobileBatchMode.value = false
    }
    progressStarted = true
  } catch (error) {
    console.error(error)
    if (!componentUnmounted) {
      notifyAiRedoSubmitFailure(error)
    }
  } finally {
    if (!progressStarted) {
      aiRedoIds.value = aiRedoIds.value.filter(id => !historyIds.includes(id))
    }
  }
}

// 计算下拉菜单
function getDropdownItems(item: TransferHistory) {
  const items = [
    {
      title: isAiRedoing(item.id) ? t('transferHistory.actions.aiRedoPending') : t('transferHistory.actions.aiRedo'),
      value: 0,
      props: {
        prependIcon: 'mdi-robot-outline',
        disabled: !aiAgentEnabled.value || (hasRunningAiRedo.value && !isAiRedoing(item.id)),
        click: () => {
          triggerAiRedo(item)
        },
      },
    },
    {
      title: t('transferHistory.actions.redo'),
      value: 1,
      props: {
        prependIcon: 'mdi-redo-variant',
        click: () => {
          redoIds.value = [item.id]
          redoTargetStorage.value = item.dest_storage
          openRedoDialog()
        },
      },
    },
    {
      title: t('transferHistory.actions.delete'),
      value: 3,
      props: {
        prependIcon: 'mdi-trash-can-outline',
        color: 'error',
        click: () => {
          removeHistory(item)
        },
      },
    },
  ]
  if (item.cleanup_status === 'failed') {
    items.splice(2, 0, {
      title: t('transferHistory.actions.cleanupResolved'),
      value: 2,
      props: {
        prependIcon: 'mdi-check-circle-outline',
        disabled: !canManage.value,
        click: () => {
          openRecoveryDialog(item)
        },
      },
    })
  }
  return items
}

// 生成历史记录页地址，确保刷新入口和分页入口使用一致的查询参数。
function createHistoryUrl(resetPage = false, page = resetPage ? 1 : currentPage.value) {
  const query: Record<string, string> = {}

  if (search.value) {
    query.search = search.value
  }
  if (statusFilter.value !== 'all') {
    query.status = statusFilter.value
  }
  if (itemsPerPage.value) {
    query.itemsPerPage = String(itemsPerPage.value)
  }
  if (page) {
    query.currentPage = String(page)
  }
  if (group.value || groupPreferenceExplicit.value) {
    query.grouped = String(group.value)
  }

  return {
    path: '/history',
    query,
  }
}

// 重载页面，先更新路由，再由路由监听统一拉取列表数据。
async function reloadPage(resetPage = false) {
  if (!historyViewActive || route.path !== '/history') return
  await router.push(createHistoryUrl(resetPage))
}

// 移动端搜索同样以 URL 为持久事实源，刷新和断点切换后可恢复同一查询。
async function reloadMobileSearchPage() {
  if (!historyViewActive || route.path !== '/history') return
  await router.push(createHistoryUrl(true))
}

// 只有工具栏按钮切换才属于显式偏好；数据驱动的自动分组不把默认平铺误记为用户选择。
function toggleHistoryGrouping() {
  groupPreferenceExplicit.value = true
  group.value = !group.value
  localStorage.setItem(HISTORY_GROUPING_KEY, String(group.value))
}

// 确保值为number类型
function ensureNumber(value: unknown, defaultValue: number = 0) {
  const numberValue = Number(value)
  // 如果不是数字
  return Number.isNaN(numberValue) ? defaultValue : numberValue
}

// 校验分页条数，避免地址栏参数超出可选范围。
function ensurePageSize(value: unknown, defaultValue: number = 50) {
  const pageSize = ensureNumber(value, defaultValue)
  return pageRangeValues.includes(pageSize) ? pageSize : defaultValue
}

// 已选历史记录 ID 集合，供移动端卡片和分组选择状态复用。
const selectedIdSet = computed(() => new Set(selected.value.map(item => item.id)))

// 将批量操作限制在当前可见数据源，避免搜索或分页后遗留的隐藏选择项被处理。
function scopeSelectionToVisibleHistory() {
  const visibleItems = isMobile.value ? mobileDataList.value : dataList.value
  const visibleSelected = visibleItems.filter(item => selectedIdSet.value.has(item.id))
  selected.value = visibleSelected
  return visibleSelected
}

// 移动端当前已加载记录数量，用于批量菜单展示选择进度。
const mobileBatchTotalCount = computed(() => mobileDataList.value.length)

// 移动端当前已加载记录中的已选数量。
const mobileBatchSelectedCount = computed(() => {
  return mobileDataList.value.filter(item => selectedIdSet.value.has(item.id)).length
})

// 移动端当前已加载记录是否已全部选中。
const isAllMobileHistorySelected = computed(() => {
  return mobileBatchTotalCount.value > 0 && mobileBatchSelectedCount.value === mobileBatchTotalCount.value
})

// 拼接移动端展示用的季集文本。
function getHistoryEpisodeText(item: TransferHistory) {
  return `${item.seasons || ''}${item.episodes || ''}`
}

// 获取移动端卡片标题，剧集记录会追加季集信息。
function getHistoryDisplayTitle(item: TransferHistory) {
  const title = item.title || t('common.unknown')
  const episodeText = getHistoryEpisodeText(item)

  return item.type === '电视剧' && episodeText ? `${title} ${episodeText}` : title
}

// 获取移动端卡片副标题，优先展示二级分类和年份。
function getHistorySubtitle(item: TransferHistory) {
  return [getHistoryCategory(item), item.year, item.type === '音乐' ? formatMusicAudioSpecs(item) : '']
    .filter(Boolean)
    .join(' / ')
}

// 附加文件不属于媒体分类，按源文件扩展名显示独立类别，避免与电影/剧集分类混淆。
function getHistoryCategory(item: TransferHistory) {
  const rawExtension = item.src_fileitem?.extension || getFileExtension(item.src)
  const extension = rawExtension ? `.${rawExtension.replace(/^\./, '').toLowerCase()}` : ''
  if (subtitleExtensions.has(extension)) return t('transferHistory.category.subtitle')
  if (audioExtensions.has(extension) && item.type !== '音乐') return t('transferHistory.category.audio')
  return item.category
}

/** 从 Windows 或 POSIX 文件路径中提取用于类别识别的扩展名。 */
function getFileExtension(path?: string) {
  const filename = path?.split(/[\\/]/).at(-1) || ''
  const dot = filename.lastIndexOf('.')
  return dot >= 0 ? filename.slice(dot) : ''
}

const subtitleExtensions = new Set(['.srt', '.ass', '.ssa', '.sup'])
const audioExtensions = new Set([
  '.aac',
  '.ac3',
  '.amr',
  '.caf',
  '.cda',
  '.dsf',
  '.dff',
  '.kar',
  '.m4a',
  '.mp1',
  '.mp2',
  '.mp3',
  '.mid',
  '.mod',
  '.mka',
  '.mpc',
  '.nsf',
  '.ogg',
  '.pcm',
  '.rmi',
  '.s3m',
  '.snd',
  '.spx',
  '.tak',
  '.tta',
  '.vqf',
  '.wav',
  '.wma',
  '.aifc',
  '.aiff',
  '.alac',
  '.adif',
  '.adts',
  '.ape',
  '.flac',
  '.midi',
  '.opus',
  '.sfalc',
])

// 获取存储展示名称，配置缺失时回退到原始存储标识。
function getHistoryStorageName(storage?: string) {
  if (!storage) return t('common.unknown')

  const fallbackNames: Record<string, string> = {
    local: '本地',
    downloads: '下载',
    library: '媒体库',
    smb: 'SMB',
  }

  return storageDict.value[storage] || fallbackNames[storage] || storage
}

// 桌面和移动端都通过状态入口查看原因与恢复动作。
function openRecoveryDialog(item: TransferHistory) {
  openSharedDialog(
    TransferRecoveryDialog,
    { history: item, canManage: canManage.value },
    {
      updated: transferDone,
      redo: () => {
        redoIds.value = [item.id]
        redoTargetStorage.value = item.dest_storage
        openRedoDialog()
      },
      queue: openTransferQueueDialog,
    },
    { closeOn: ['close', 'redo', 'queue'] },
  )
}

// 桌面和移动端共用状态颜色，区分暂停、覆盖跳过和下载器清理告警。
function getHistoryStatusColor(item: TransferHistory) {
  if (item.cleanup_status === 'failed' || (!item.status && (item.auto_paused || item.failure_stage === 'overwrite')))
    return 'warning'
  return item.status ? 'success' : 'error'
}

// 桌面和移动端共用状态文本，成功记录只保留独立的下载器清理告警。
function getHistoryStatusText(item: TransferHistory) {
  if (item.cleanup_status === 'failed') return t('transferHistory.status.cleanupFailed')
  if (!item.status && item.failure_stage === 'overwrite') return t('transferRecovery.skipped')
  if (!item.status && item.auto_paused) return t('transferHistory.status.paused')
  return item.status ? t('transferHistory.status.success') : t('transferHistory.status.failed')
}

// 将后端失败阶段转换为当前语言的短标签。
function getFailureStageLabel(stage?: string) {
  if (!stage) return t('transferHistory.failureStages.unknown')
  const key = `transferHistory.failureStages.${stage}`
  return te(key) ? t(key) : stage
}

// 组合历史记录的阶段、原因、动作和暂停状态，供桌面 Tooltip 与移动端正文复用。
function getHistoryFailureHint(item: TransferHistory) {
  if (item.status && item.cleanup_status !== 'failed') return ''

  const lines: string[] = []
  const configuredMaxRetries = Number(globalSettingsStore.globalSettings.TRANSFER_MAX_FAILED_RETRIES)
  const maxRetries = Number.isFinite(configuredMaxRetries) && configuredMaxRetries > 0 ? configuredMaxRetries : 3
  if (item.failure_stage)
    lines.push(t('transferHistory.failureStage', { stage: getFailureStageLabel(item.failure_stage) }))
  if (item.errmsg) lines.push(item.errmsg)
  if (item.recovery_action) lines.push(t('transferHistory.recoveryAction', { action: item.recovery_action }))
  if (item.retry_count && item.retry_count > 0) {
    lines.push(t('transferHistory.retryStatus', { count: item.retry_count, max: maxRetries }))
  }
  if (item.auto_paused) lines.push(t('transferHistory.autoPausedHint'))
  if (item.cleanup_status === 'failed') {
    lines.push(item.cleanup_error || t('transferHistory.cleanupFailedHint'))
  }
  return lines.join('\n')
}

// 一次共享时钟更新所有桌面相对时间，避免为大量记录创建独立计时器。
const desktopTimeNow = useNow({ interval: 60000 })
const desktopRelativeTimeFormatter = computed(() => new Intl.RelativeTimeFormat(locale.value, { numeric: 'auto' }))

/** 桌面时间按最大适用单位显示相对值；缺失或无法解析时保留原文本。 */
function getDesktopRelativeTime(date?: string) {
  if (!date) return ''
  const timestamp = new Date(date.replace(' ', 'T')).getTime()
  if (!Number.isFinite(timestamp)) return date
  const seconds = (timestamp - desktopTimeNow.value.getTime()) / 1000
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ['year', 31536000],
    ['month', 2592000],
    ['day', 86400],
    ['hour', 3600],
    ['minute', 60],
    ['second', 1],
  ]
  const [unit, duration] = units.find(([, length]) => Math.abs(seconds) >= length) || units.at(-1)!
  return desktopRelativeTimeFormatter.value.format(Math.trunc(seconds / duration), unit)
}

// 将历史记录时间压缩成移动端卡片展示文本。
function getHistoryDateText(date?: string) {
  if (!date) return ''

  const match = date.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/)
  if (!match) return date

  const [, year, month, day, hour, minute] = match
  const recordDate = new Date(Number(year), Number(month) - 1, Number(day))
  const today = new Date()
  const todayDate = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const diffDays = Math.round((todayDate.getTime() - recordDate.getTime()) / 86400000)
  const time = `${hour}:${minute}`

  if (diffDays === 0) return `今天 ${time}`
  if (diffDays === 1) return `昨天 ${time}`

  return `${month}-${day} ${time}`
}

// 判断移动端路径是否已展开。
function isMobilePathExpanded(item: TransferHistory) {
  return mobileExpandedPathIds.value.includes(item.id)
}

// 切换移动端路径完整展示状态。
function toggleMobilePathExpanded(item: TransferHistory) {
  if (isMobilePathExpanded(item)) {
    mobileExpandedPathIds.value = mobileExpandedPathIds.value.filter(id => id !== item.id)
    return
  }

  mobileExpandedPathIds.value = [...mobileExpandedPathIds.value, item.id]
}

// 判断指定历史记录是否已被选中。
function isHistorySelected(item: TransferHistory) {
  return selectedIdSet.value.has(item.id)
}

// 获取移动端历史记录卡片的稳定渲染 key。
function getMobileHistoryItemKey(item: TransferHistory) {
  return item.id
}

// 批量设置历史记录选中状态，并按 ID 去重。
function updateHistorySelection(items: readonly TransferHistory[], checked: boolean | null) {
  const itemIds = new Set(items.map(item => item.id))

  if (checked) {
    const selectedIds = new Set(selected.value.map(item => item.id))

    selected.value = [...selected.value, ...items.filter(item => !selectedIds.has(item.id))]
    return
  }

  selected.value = selected.value.filter(item => !itemIds.has(item.id))
}

// 切换单条历史记录的选中状态。
function toggleHistorySelection(item: TransferHistory, checked: boolean | null) {
  updateHistorySelection([item], checked)
}

// 切换移动端批量选择模式，退出时清空移动端选择状态。
function toggleMobileBatchMode() {
  if (mobileBatchMode.value) {
    exitMobileBatchMode()
    return
  }

  selected.value = []
  mobileBatchMode.value = true
}

// 退出移动端批量选择模式并清空选择状态。
function exitMobileBatchMode() {
  mobileBatchMode.value = false
  selected.value = []
}

// 批量模式下点击移动端记录卡片时切换该记录的选择状态。
function handleMobileRecordClick(item: TransferHistory) {
  if (!mobileBatchMode.value) return

  toggleHistorySelection(item, !isHistorySelected(item))
}

// 移动端路径点击在批量模式下转为选择记录，普通模式下展开路径。
function handleMobilePathClick(item: TransferHistory) {
  if (mobileBatchMode.value) {
    handleMobileRecordClick(item)
    return
  }

  toggleMobilePathExpanded(item)
}

// 选中移动端当前已加载的全部历史记录。
function selectAllMobileHistory() {
  updateHistorySelection(mobileDataList.value, true)
}

// 取消移动端历史记录的全部选择。
function deselectAllMobileHistory() {
  updateHistorySelection(mobileDataList.value, false)
}

// 按展示分组统计选中数量，音乐专辑使用目录身份，其它媒体沿用标题身份。
const selectedCountsGroupedByKey = computed(() => {
  return selected.value.reduce(
    (acc, item) => {
      const key = (item as Partial<TransferHistoryDisplayItem>).history_group_key || item.title || ''
      acc[key] = (acc[key] || 0) + 1
      return acc
    },
    {} as Record<string, number>,
  )
})

/** Vuetify 分组内部记录包装，保留原始展示对象。 */
interface TransferHistoryGroupItem {
  value: TransferHistoryDisplayItem
}

// Vuetify 分组项包装了原始记录，标题取第一条记录的展示标签。
function getHistoryGroupLabel(items: readonly TransferHistoryGroupItem[]) {
  return items[0]?.value?.history_group_label || t('common.unknown')
}

// 曲目数量只属于音乐专辑组，非音乐标题组保持原有展示。
function isMusicAlbumGroup(items: readonly TransferHistoryGroupItem[]) {
  return Boolean(items[0]?.value?.history_group_is_music_album)
}

// 同一组的每条记录共享预先计算的摘要，模板始终从首项读取。
function getHistoryGroupSummary(items: readonly TransferHistoryGroupItem[]) {
  return items[0]?.value?.history_group_summary
}

/** 复用专辑摘要选定的封面记录及统一图片代理规则。 */
function getHistoryGroupPosterUrl(items: readonly TransferHistoryGroupItem[]) {
  const coverItem = getHistoryGroupSummary(items)?.coverItem || items.find(item => item.value.image)?.value
  return coverItem ? getHistoryPosterUrl(coverItem) : ''
}

// 控制分组内所有子项的选中状态
const toggleGroupSelection = (checked: boolean | null, items: readonly TransferHistoryGroupItem[]) => {
  const values = items.map(item => item.value)
  updateHistorySelection(values, checked)
}

const historyDynamicIcon = computed(() => 'mdi-timer-sand-paused')
const historyDynamicMenuItems = computed(() => {
  if (!appMode.value) return undefined

  if (mobileBatchMode.value) {
    const hasSelectedHistory = mobileBatchSelectedCount.value > 0

    const items: DynamicButtonMenuItem[] = [
      {
        titleKey: 'transferHistory.selectedCount',
        titleParams: {
          count: mobileBatchSelectedCount.value,
          total: mobileBatchTotalCount.value,
        },
        icon: 'mdi-checkbox-multiple-marked-outline',
        permission: 'manage',
        disabled: true,
        action: () => {},
      },
      {
        titleKey: isAllMobileHistorySelected.value
          ? 'transferHistory.actions.deselectAll'
          : 'transferHistory.actions.selectAll',
        icon: isAllMobileHistorySelected.value ? 'mdi-checkbox-blank-outline' : 'mdi-checkbox-multiple-marked',
        permission: 'manage',
        disabled: mobileBatchTotalCount.value === 0,
        action: () => {
          if (isAllMobileHistorySelected.value) {
            deselectAllMobileHistory()
            return
          }

          selectAllMobileHistory()
        },
      },
    ]

    if (!hasRunningAiRedo.value) {
      items.push(
        {
          titleKey: 'transferHistory.actions.batchAiRedo',
          icon: 'mdi-robot-outline',
          color: 'info',
          permission: 'manage',
          disabled: !hasSelectedHistory,
          action: () => {
            triggerBatchAiRedo()
          },
        },
        {
          titleKey: 'transferHistory.actions.batchRedo',
          icon: 'mdi-redo-variant',
          color: 'success',
          permission: 'manage',
          disabled: !hasSelectedHistory,
          action: () => {
            retransferBatch()
          },
        },
        {
          titleKey: 'transferHistory.actions.batchDelete',
          icon: 'mdi-trash-can-outline',
          color: 'error',
          permission: 'manage',
          disabled: !hasSelectedHistory,
          action: () => {
            removeHistoryBatch()
          },
        },
      )
    }

    items.push({
      titleKey: 'transferHistory.actions.exitBatchMode',
      icon: 'mdi-close',
      permission: 'manage',
      action: exitMobileBatchMode,
    })

    return items
  }

  if (selected.value.length === 0) return undefined

  const items: DynamicButtonMenuItem[] = [
    {
      titleKey: 'dialog.transferQueue.title',
      icon: 'mdi-timer-sand-paused',
      color: 'primary',
      permission: 'manage',
      action: openTransferQueueDialog,
    },
  ]

  if (!hasRunningAiRedo.value) {
    items.push(
      {
        titleKey: 'transferHistory.actions.batchAiRedo',
        icon: 'mdi-robot-outline',
        color: 'info',
        permission: 'manage',
        action: () => {
          triggerBatchAiRedo()
        },
      },
      {
        titleKey: 'transferHistory.actions.batchRedo',
        icon: 'mdi-redo-variant',
        color: 'success',
        permission: 'manage',
        action: () => {
          retransferBatch()
        },
      },
      {
        titleKey: 'transferHistory.actions.batchDelete',
        icon: 'mdi-trash-can-outline',
        color: 'error',
        permission: 'manage',
        action: () => {
          removeHistoryBatch()
        },
      },
    )
  }

  return items
})

useDynamicButton({
  icon: historyDynamicIcon,
  onClick: openTransferQueueDialog,
  menuItems: historyDynamicMenuItems,
  permission: 'manage',
  show: computed(() => appMode.value),
})

// 初始加载数据
onMounted(() => {
  void loadStorages()
  if (isDesktop.value) {
    void refreshDataFromRouteQuery()
  } else {
    syncMobileSearchFromRouteQuery()
    resetMobileHistory()
  }
})

onActivated(() => {
  historyViewActive = true
  if (!hasActivatedOnce.value) {
    hasActivatedOnce.value = true
    return
  }

  if (isDesktop.value && !loading.value) {
    void refreshDataFromRouteQuery({ silent: true })
  } else if (isMobile.value && !mobileLoading.value) {
    resetMobileHistory()
  }
})

// 路由离开先于 KeepAlive 失活；必须在离开守卫阶段关闭回写窗口，避免在途请求抢回历史页。
function deactivateHistoryView() {
  historyViewActive = false
  fetchDataRequestSeed++
  mobileFetchDataRequestSeed++
  debouncedReloadPage.cancel()
  debouncedReloadSearchPage.cancel()
  debouncedReloadMobileSearchPage.cancel()
  loading.value = false
  mobileLoading.value = false
}

// 组件测试和独立复用时可能不在 RouterView 记录内；仅由正式 history 路由注册离开守卫。
if (route.matched.some(record => record.path === '/history')) {
  onBeforeRouteLeave(() => {
    deactivateHistoryView()
  })
}

// 页面由 KeepAlive 缓存时不会卸载；失活钩子负责兜底非路由驱动的缓存切换。
onDeactivated(() => {
  deactivateHistoryView()
})

onUnmounted(() => {
  componentUnmounted = true
  deactivateHistoryView()
  stopAiRedoProgress()
  closeProgressDialog()
  aiRedoProgressDialogController?.close()
})
</script>

<template>
  <section v-if="isDesktop" class="transfer-history-desktop-page" :style="{ blockSize: `${desktopPageHeight}px` }">
    <header ref="desktopToolbarRef" class="transfer-history-desktop-toolbar">
      <VPageContentTitle :title="t('navItems.mediaOrganize')" class="my-0" style="margin-block: 0" />
      <div class="transfer-history-desktop-tools">
        <VCombobox
          key="search_navbar"
          :model-value="search"
          @update:model-value="setSearchValue"
          :items="searchHintList"
          @compositionstart="isComposing = true"
          @compositionend="isComposing = false"
          class="transfer-history-desktop-search"
          density="compact"
          :placeholder="t('transferHistory.searchPlaceholder')"
          :aria-label="t('transferHistory.searchPlaceholder')"
          prepend-inner-icon="mdi-magnify"
          variant="solo"
          flat
          rounded="pill"
          single-line
          hide-details
          clearable
        />
        <VMenu location="bottom end">
          <template #activator="{ props }">
            <IconBtn
              v-bind="props"
              :color="statusFilterButtonColor"
              :variant="statusFilter === 'all' ? 'text' : 'tonal'"
              :aria-label="t('transferHistory.statusFilter.label')"
              :title="t('transferHistory.statusFilter.label')"
            >
              <VIcon :icon="currentStatusFilter.icon" />
            </IconBtn>
          </template>
          <VCard min-width="200"
            ><VList class="px-2">
              <VListSubheader>{{ t('transferHistory.statusFilter.label') }}</VListSubheader>
              <VListItem
                v-for="option in statusFilterItems"
                :key="option.value"
                :active="statusFilter === option.value"
                @click="selectStatusFilter(option.value)"
              >
                <template #prepend><VIcon :icon="option.icon" :color="option.color" /></template>
                <VListItemTitle>{{ option.title }}</VListItemTitle>
                <template #append
                  ><VIcon v-if="statusFilter === option.value" icon="mdi-check" color="primary"
                /></template>
              </VListItem> </VList
          ></VCard>
        </VMenu>
        <VMenu location="bottom end" :close-on-content-click="false">
          <template #activator="{ props }">
            <IconBtn
              v-bind="props"
              :color="desktopSortBy.length ? 'primary' : 'gray'"
              :aria-label="t('transferHistory.desktop.sort')"
              :title="t('transferHistory.desktop.sort')"
              ><VIcon icon="mdi-sort-variant"
            /></IconBtn>
          </template>
          <VCard min-width="220"
            ><VList class="px-2">
              <VListSubheader>{{ t('transferHistory.desktop.sort') }}</VListSubheader>
              <VListItem
                v-for="option in desktopSortOptions"
                :key="option.value"
                :active="(desktopSortBy[0]?.key || '') === option.value"
                @click="setDesktopSort(option.value)"
              >
                <VListItemTitle>{{ option.title }}</VListItemTitle>
                <template #append
                  ><VIcon v-if="(desktopSortBy[0]?.key || '') === option.value" icon="mdi-check" color="primary"
                /></template>
              </VListItem>
              <VDivider />
              <VListItem :disabled="desktopSortBy.length === 0" @click="toggleDesktopSortOrder">
                <template #prepend
                  ><VIcon :icon="desktopSortBy[0]?.order === 'desc' ? 'mdi-sort-descending' : 'mdi-sort-ascending'"
                /></template>
                <VListItemTitle>{{
                  desktopSortBy[0]?.order === 'desc' ? t('common.ascending') : t('common.descending')
                }}</VListItemTitle>
              </VListItem>
            </VList></VCard
          >
        </VMenu>
        <VMenu location="bottom end">
          <template #activator="{ props }">
            <IconBtn
              v-bind="props"
              :color="group ? 'primary' : 'gray'"
              :aria-label="t('transferHistory.groupMode')"
              :title="t('transferHistory.groupMode')"
              ><VIcon :icon="group ? 'mdi-format-list-group' : 'mdi-format-list-bulleted'"
            /></IconBtn>
          </template>
          <VCard min-width="200"
            ><VList class="px-2">
              <VListItem :active="!group" prepend-icon="mdi-format-list-bulleted" @click="setDesktopGrouping(false)"
                ><VListItemTitle>{{ t('transferHistory.listMode') }}</VListItemTitle></VListItem
              >
              <VListItem :active="group" prepend-icon="mdi-format-list-group" @click="setDesktopGrouping(true)"
                ><VListItemTitle>{{ t('transferHistory.groupMode') }}</VListItemTitle></VListItem
              >
            </VList></VCard
          >
        </VMenu>
        <IconBtn :aria-label="t('common.refresh')" :disabled="loading" @click="fetchData()">
          <VIcon icon="mdi-refresh" />
        </IconBtn>
      </div>
    </header>

    <div
      v-if="desktopSelectedCount > 0"
      class="transfer-history-desktop-selection"
      role="group"
      :aria-label="t('transferHistory.actions.batchSelect')"
    >
      <VCheckbox
        :model-value="desktopAllSelected"
        :indeterminate="desktopSelectedCount > 0 && !desktopAllSelected"
        :disabled="dataList.length === 0"
        :label="t('transferHistory.desktop.selectPage')"
        density="compact"
        hide-details
        @update:model-value="selectDesktopPage"
      />
      <span class="transfer-history-desktop-selection__count">
        {{ t('transferHistory.selectedCount', { count: desktopSelectedCount, total: dataList.length }) }}
      </span>
      <template v-if="canManage && desktopSelectedCount > 0">
        <VBtn
          size="small"
          variant="tonal"
          color="primary"
          prepend-icon="mdi-redo-variant"
          :disabled="hasRunningAiRedo"
          @click="retransferBatch"
          >{{ t('transferHistory.actions.batchRedo') }}</VBtn
        >
        <VBtn
          size="small"
          variant="tonal"
          color="info"
          prepend-icon="mdi-robot-outline"
          :disabled="hasRunningAiRedo"
          @click="triggerBatchAiRedo"
          >{{ t('transferHistory.actions.batchAiRedo') }}</VBtn
        >
        <VBtn
          size="small"
          variant="tonal"
          color="error"
          prepend-icon="mdi-trash-can-outline"
          :disabled="hasRunningAiRedo"
          @click="removeHistoryBatch"
          >{{ t('transferHistory.actions.batchDelete') }}</VBtn
        >
      </template>
      <VBtn v-if="desktopSelectedCount > 0" size="small" variant="text" @click="clearDesktopSelection">
        {{ t('transferHistory.actions.deselectAll') }}
      </VBtn>
    </div>

    <div v-else-if="!desktopEmpty" class="transfer-history-desktop-summary">
      {{ t('transferHistory.desktop.summary', { count: totalItems, pages: totalPage }) }}
    </div>

    <!-- 仅替换桌面呈现；保留 Vuetify 的虚拟测高、排序、分组和分页数据契约。 -->
    <VDataTableVirtual
      v-if="!desktopEmpty"
      v-model="selected"
      v-model:sort-by="desktopSortBy"
      :group-by="group ? groupBy : []"
      :headers="headers"
      :items="dataList"
      :loading="loading"
      density="compact"
      return-object
      hide-default-header
      show-select
      :loading-text="t('transferHistory.loading')"
      height="100%"
      :item-height="100"
      class="transfer-history-desktop-virtual"
      :aria-label="t('transferHistory.desktop.title')"
    >
      <template v-slot:group-header="{ item, columns, toggleGroup, isGroupOpen }">
        <tr
          v-if="isMusicAlbumGroup(item.items)"
          class="transfer-history-album-group-row transfer-history-desktop-group-row"
          :class="{ 'transfer-history-album-group-row--open': isGroupOpen(item) }"
        >
          <td :colspan="columns.length" @click="toggleGroup(item)">
            <div class="transfer-history-album-summary">
              <!-- 控制区自行处理展开与多选，阻止整行再次切换。 -->
              <div class="transfer-history-desktop-group-controls" @click.stop>
                <VBtn
                  :aria-label="isGroupOpen(item) ? t('setting.about.collapse') : t('setting.about.expand')"
                  :icon="isGroupOpen(item) ? '$expand' : '$next'"
                  size="small"
                  variant="text"
                  @click="toggleGroup(item)"
                />
                <VCheckbox
                  :aria-label="t('transferHistory.desktop.selectRecord', { title: getHistoryGroupLabel(item.items) })"
                  density="compact"
                  hide-details
                  :model-value="selectedCountsGroupedByKey[item.value] == item.items.length"
                  :indeterminate="
                    selectedCountsGroupedByKey[item.value] > 0 &&
                    selectedCountsGroupedByKey[item.value] < item.items.length
                  "
                  @update:modelValue="checked => toggleGroupSelection(checked, item.items)"
                />
              </div>

              <div class="transfer-history-album-summary__cover">
                <VImg
                  v-if="getHistoryGroupPosterUrl(item.items)"
                  :src="getHistoryGroupPosterUrl(item.items)"
                  :alt="getHistoryGroupLabel(item.items)"
                  cover
                >
                  <template #error>
                    <VIcon icon="mdi-album" size="22" color="medium-emphasis" />
                  </template>
                </VImg>
                <VIcon v-else icon="mdi-album" size="22" color="medium-emphasis" />
              </div>

              <div class="transfer-history-album-summary__identity">
                <div class="transfer-history-album-summary__title-line">
                  <strong>{{ getHistoryGroupSummary(item.items)?.label }}</strong>
                  <VChip size="x-small" variant="tonal" color="primary">
                    {{
                      t('transferHistory.desktop.pageTracks', {
                        count: getHistoryGroupSummary(item.items)?.trackCount || 0,
                      })
                    }}
                  </VChip>
                </div>
                <div class="transfer-history-album-summary__meta">
                  <span v-if="getHistoryGroupSummary(item.items)?.artist">
                    <VIcon icon="mdi-account-music-outline" size="14" />
                    {{ getHistoryGroupSummary(item.items)?.artist }}
                  </span>
                  <span v-if="getHistoryGroupSummary(item.items)?.category">
                    {{ getHistoryGroupSummary(item.items)?.category }}
                  </span>
                </div>
              </div>

              <div class="transfer-history-album-summary__path" :title="getHistoryGroupSummary(item.items)?.albumPath">
                <VIcon icon="mdi-folder-music-outline" size="17" color="medium-emphasis" />
                <VChip size="x-small" variant="tonal" label>
                  {{ getHistoryStorageName(getHistoryGroupSummary(item.items)?.storage) }}
                </VChip>
                <span>{{ getHistoryGroupSummary(item.items)?.albumPath }}</span>
              </div>

              <div class="transfer-history-album-summary__facts">
                <VChip
                  v-if="getHistoryGroupSummary(item.items)?.mode"
                  size="x-small"
                  variant="outlined"
                  color="primary"
                >
                  {{ getHistoryGroupSummary(item.items)?.mode }}
                </VChip>
                <span v-if="getHistoryGroupSummary(item.items)?.size" class="transfer-history-album-summary__fact">
                  <VIcon icon="mdi-database-outline" size="15" />
                  {{ formatFileSize(getHistoryGroupSummary(item.items)?.size || 0) }}
                </span>
                <span
                  v-if="getHistoryGroupSummary(item.items)?.date"
                  :title="getHistoryGroupSummary(item.items)?.date"
                  class="transfer-history-album-summary__fact"
                >
                  <VIcon icon="mdi-clock-outline" size="15" />
                  {{ getDesktopRelativeTime(getHistoryGroupSummary(item.items)?.date) }}
                </span>
                <VChip size="x-small" color="success" variant="tonal">
                  {{ t('transferHistory.status.success') }} {{ getHistoryGroupSummary(item.items)?.successCount || 0 }}
                </VChip>
                <VChip
                  v-if="getHistoryGroupSummary(item.items)?.failedCount"
                  size="x-small"
                  color="error"
                  variant="tonal"
                >
                  {{ t('transferHistory.status.failed') }} {{ getHistoryGroupSummary(item.items)?.failedCount }}
                </VChip>
              </div>
            </div>
          </td>
        </tr>
        <tr v-else class="transfer-history-desktop-group-row">
          <td :colspan="columns.length" @click="toggleGroup(item)">
            <div class="transfer-history-desktop-group-summary">
              <!-- 控制区自行处理展开与多选，阻止整行再次切换。 -->
              <div class="transfer-history-desktop-group-controls" @click.stop>
                <VBtn
                  :aria-label="isGroupOpen(item) ? t('setting.about.collapse') : t('setting.about.expand')"
                  :icon="isGroupOpen(item) ? '$expand' : '$next'"
                  size="small"
                  variant="text"
                  @click="toggleGroup(item)"
                />
                <VCheckbox
                  density="compact"
                  hide-details
                  :aria-label="t('transferHistory.desktop.selectRecord', { title: getHistoryGroupLabel(item.items) })"
                  :model-value="selectedCountsGroupedByKey[item.value] == item.items.length"
                  :indeterminate="
                    selectedCountsGroupedByKey[item.value] > 0 &&
                    selectedCountsGroupedByKey[item.value] < item.items.length
                  "
                  @update:modelValue="checked => toggleGroupSelection(checked, item.items)"
                />
              </div>
              <div class="transfer-history-album-summary__cover">
                <VImg
                  v-if="getHistoryGroupPosterUrl(item.items)"
                  :src="getHistoryGroupPosterUrl(item.items)"
                  :alt="getHistoryGroupLabel(item.items)"
                  cover
                />
                <VIcon v-else :icon="getPlaceholderIcon(item.items[0]?.value?.type || '')" size="22" />
              </div>
              <div class="transfer-history-desktop-group-identity">
                <strong>{{ getHistoryGroupLabel(item.items) }}</strong>
                <small>{{ t('transferHistory.desktop.pageRecords', { count: item.items.length }) }}</small>
              </div>
              <div class="transfer-history-desktop-group-counts">
                <VChip color="success" size="x-small" variant="tonal"
                  >{{ t('transferHistory.status.success') }}
                  {{ item.items.filter(entry => entry.value.status).length }}</VChip
                >
                <VChip v-if="item.items.some(entry => !entry.value.status)" color="error" size="x-small" variant="tonal"
                  >{{ t('transferHistory.status.failed') }}
                  {{ item.items.filter(entry => !entry.value.status).length }}</VChip
                >
              </div>
            </div>
          </td>
        </tr>
      </template>
      <template #item="{ item, columns, itemRef }">
        <tr :ref="itemRef" class="transfer-history-desktop-record-row" :data-history-id="item.id">
          <td :colspan="columns.length">
            <article
              class="transfer-history-desktop-record"
              :class="{
                'transfer-history-desktop-record--child': group,
                'transfer-history-desktop-record--selected': isHistorySelected(item),
                'transfer-history-desktop-record--failed': !item.status,
              }"
            >
              <VCheckbox
                :model-value="isHistorySelected(item)"
                density="compact"
                hide-details
                :aria-label="t('transferHistory.desktop.selectRecord', { title: getHistoryDisplayTitle(item) })"
                @update:model-value="checked => toggleHistorySelection(item, checked)"
              />
              <div class="transfer-history-desktop-media-cell">
                <div class="transfer-history-desktop-poster-frame rounded-md">
                  <VImg
                    v-if="getHistoryPosterUrl(item)"
                    :src="getHistoryPosterUrl(item)"
                    :alt="item.title"
                    cover
                    class="transfer-history-desktop-poster"
                    rounded="md"
                  >
                    <template #error
                      ><div class="transfer-history-desktop-poster-placeholder">
                        <VIcon :icon="getPlaceholderIcon(item.type || '')" size="20" color="medium-emphasis" /></div
                    ></template>
                  </VImg>
                  <div v-else class="transfer-history-desktop-poster-placeholder">
                    <VIcon :icon="getPlaceholderIcon(item.type || '')" size="20" color="medium-emphasis" />
                  </div>
                </div>
                <div class="transfer-history-desktop-record__identity">
                  <strong :title="getHistoryDisplayTitle(item)">{{ getHistoryDisplayTitle(item) }}</strong>
                  <small>{{ getHistorySubtitle(item) || item.type }}</small>
                </div>
              </div>
              <div class="transfer-history-desktop-record__paths">
                <template
                  v-for="path in [
                    { key: 'source', storage: item.src_storage, value: item.src },
                    { key: 'destination', storage: item.dest_storage, value: item.dest },
                  ]"
                  :key="path.key"
                >
                  <div v-if="path.value" class="transfer-history-desktop-record__path" :title="path.value">
                    <VChip variant="tonal" size="x-small" label>{{ getHistoryStorageName(path.storage) }}</VChip>
                    <span class="transfer-history-desktop-record__path-text">{{ path.value }}</span>
                  </div>
                  <div
                    v-if="path.key === 'source' && item.src && item.dest"
                    class="transfer-history-desktop-record__path-arrow"
                    aria-hidden="true"
                  >
                    <VIcon icon="mdi-arrow-down" size="18" />
                  </div>
                </template>
              </div>
              <div class="transfer-history-desktop-record__facts">
                <div class="transfer-history-desktop-record__status">
                  <VTooltip :text="getHistoryFailureHint(item)" :disabled="!getHistoryFailureHint(item)">
                    <template #activator="{ props }">
                      <VChip
                        v-bind="props"
                        tag="button"
                        type="button"
                        :color="getHistoryStatusColor(item)"
                        variant="tonal"
                        size="small"
                        @click.stop="openRecoveryDialog(item)"
                        >{{ getHistoryStatusText(item) }}</VChip
                      >
                    </template>
                  </VTooltip>
                  <IconBtn
                    :aria-label="t('transferHistory.desktop.recordActions', { title: getHistoryDisplayTitle(item) })"
                  >
                    <VIcon icon="mdi-dots-vertical" />
                    <VMenu activator="parent" close-on-content-click>
                      <VList
                        ><VListItem
                          v-for="(menu, i) in getDropdownItems(item)"
                          :key="i"
                          :base-color="menu.props.color"
                          :disabled="menu.props.disabled"
                          @click="menu.props.click()"
                        >
                          <template #prepend><VIcon :icon="menu.props.prependIcon" /></template>
                          <VListItemTitle>{{ menu.title }}</VListItemTitle>
                        </VListItem></VList
                      >
                    </VMenu>
                  </IconBtn>
                </div>
                <div class="transfer-history-desktop-record__metadata">
                  <VChip variant="tonal" size="x-small">{{
                    TransferDict[item.mode ?? ''] || t('common.unknown')
                  }}</VChip>
                  <span>{{ formatFileSize(item.src_fileitem?.size || 0) }}</span>
                  <time :datetime="item.date" :title="item.date">{{ getDesktopRelativeTime(item.date) }}</time>
                </div>
              </div>
            </article>
          </td>
        </tr>
      </template>
      <template #no-data />
    </VDataTableVirtual>
    <NoDataFound v-else class="transfer-history-desktop-empty" :error-title="t('transferHistory.noData')" />
    <footer v-if="!desktopEmpty" ref="desktopPaginationRef" class="transfer-history-desktop-pagination">
      <VSelect
        v-model="itemsPerPage"
        :items="pageRange"
        density="compact"
        variant="solo"
        flat
        rounded="pill"
        hide-details
        class="transfer-history-pagination__size"
        :aria-label="t('transferHistory.pageSize')"
      />
      <span class="transfer-history-pagination__info">{{
        t('transferHistory.pageInfo', { ...pageTip, total: totalItems })
      }}</span>
      <VPagination v-model="currentPage" show-first-last-page :length="totalPage" :total-visible="7" />
    </footer>
  </section>

  <section v-else class="transfer-history-mobile-page">
    <div class="transfer-history-mobile-titlebar">
      <VPageContentTitle
        :title="t('navItems.mediaOrganize')"
        class="transfer-history-mobile-title my-0"
        style="margin-block: 0"
      />
      <div class="transfer-history-mobile-titlebar__actions">
        <IconBtn
          :color="statusFilterButtonColor"
          :aria-label="t('transferHistory.statusFilter.label')"
          :title="t('transferHistory.statusFilter.label')"
          variant="text"
          data-menu-activator="history-status-filter-btn"
          @click="mobileStatusFilterMenu = true"
        >
          <VIcon icon="mdi-filter-multiple-outline" />
        </IconBtn>
        <IconBtn
          v-if="canManage"
          :color="mobileBatchMode ? 'primary' : 'gray'"
          :aria-label="
            mobileBatchMode ? t('transferHistory.actions.exitBatchSelect') : t('transferHistory.actions.batchSelect')
          "
          :title="
            mobileBatchMode ? t('transferHistory.actions.exitBatchSelect') : t('transferHistory.actions.batchSelect')
          "
          variant="text"
          @click="toggleMobileBatchMode"
        >
          <VIcon icon="mdi-checkbox-multiple-marked-outline" />
        </IconBtn>
      </div>
    </div>

    <VCombobox
      key="search_mobile"
      :model-value="search"
      @update:model-value="setSearchValue"
      :items="searchHintList"
      @compositionstart="isComposing = true"
      @compositionend="isComposing = false"
      class="transfer-history-mobile-search"
      density="comfortable"
      :placeholder="t('transferHistory.searchPlaceholder')"
      :aria-label="t('transferHistory.searchPlaceholder')"
      prepend-inner-icon="mdi-magnify"
      variant="outlined"
      single-line
      hide-details
      flat
      rounded="pill"
      clearable
    />

    <Teleport to="body" v-if="mobileStatusFilterMenu">
      <VMenu v-model="mobileStatusFilterMenu" :activator="mobileStatusFilterActivator" location="bottom end">
        <VCard min-width="200">
          <VList density="compact" class="px-2 py-1">
            <VListSubheader>{{ t('transferHistory.statusFilter.label') }}</VListSubheader>
            <VListItem
              v-for="option in statusFilterItems"
              :key="option.value"
              :active="statusFilter === option.value"
              density="compact"
              @click="selectStatusFilter(option.value)"
            >
              <template #prepend>
                <VIcon :icon="option.icon" :color="option.color" size="small" />
              </template>
              <VListItemTitle>{{ option.title }}</VListItemTitle>
              <template #append>
                <VIcon v-if="statusFilter === option.value" icon="mdi-check" color="primary" size="small" />
              </template>
            </VListItem>
          </VList>
        </VCard>
      </VMenu>
    </Teleport>

    <VInfiniteScroll
      :key="mobileInfiniteKey"
      mode="intersect"
      side="end"
      :items="mobileDataList"
      :margin="mobileDataList.length > 0 ? 280 : 0"
      class="transfer-history-mobile-scroll"
      @load="loadMobileHistory"
    >
      <template #loading>
        <div class="transfer-history-mobile-state transfer-history-mobile-state--loading">
          <VProgressCircular indeterminate color="primary" size="26" width="3" />
        </div>
      </template>
      <template #empty>
        <NoDataFound
          v-if="mobileDataList.length === 0"
          class="transfer-history-mobile-empty"
          :error-title="t('transferHistory.noData')"
        />
      </template>
      <template #error="{ props: retryProps }">
        <div class="transfer-history-mobile-state d-flex flex-column ga-2" role="alert">
          <span class="text-body-2 text-medium-emphasis">{{ t('common.serverConnectionFailed') }}</span>
          <VBtn v-bind="retryProps" prepend-icon="mdi-refresh" size="small" variant="tonal">
            {{ t('common.retry') }}
          </VBtn>
        </div>
      </template>

      <ProgressiveCardGrid
        v-if="mobileDataList.length > 0"
        :items="mobileDataList"
        :columns="1"
        :gap="14"
        :estimated-item-height="296"
        :overscan-rows="5"
        :get-item-key="getMobileHistoryItemKey"
      >
        <template #default="{ item }">
          <article
            class="transfer-history-mobile-record"
            :class="{
              'transfer-history-mobile-record--batch': mobileBatchMode,
              'transfer-history-mobile-record--selected': mobileBatchMode && isHistorySelected(item),
              'transfer-history-mobile-record--failed': !item.status,
            }"
            @click="handleMobileRecordClick(item)"
          >
            <header class="transfer-history-mobile-record__header">
              <div class="transfer-history-mobile-record__poster-wrapper rounded-md">
                <VImg
                  v-if="getHistoryPosterUrl(item)"
                  class="transfer-history-mobile-record__poster"
                  :src="getHistoryPosterUrl(item)"
                  :alt="item.title"
                  cover
                  rounded="md"
                >
                  <template #placeholder>
                    <div class="transfer-history-mobile-record__poster-skeleton">
                      <VSkeletonLoader class="h-full" />
                    </div>
                  </template>
                  <template #error>
                    <div class="transfer-history-mobile-record__poster-placeholder">
                      <VIcon :icon="getPlaceholderIcon(item.type || '')" size="28" color="medium-emphasis" />
                    </div>
                  </template>
                </VImg>
                <div v-else class="transfer-history-mobile-record__poster-placeholder">
                  <VIcon :icon="getPlaceholderIcon(item.type || '')" size="28" color="medium-emphasis" />
                </div>
                <VIcon class="transfer-history-mobile-record__poster-type" :icon="getIcon(item.type || '')" size="14" />
              </div>

              <div class="transfer-history-mobile-record__heading">
                <div class="transfer-history-mobile-record__title">
                  {{ getHistoryDisplayTitle(item) }}
                </div>
                <div class="transfer-history-mobile-record__subtitle">
                  {{ getHistorySubtitle(item) || item.type || t('common.unknown') }}
                </div>
              </div>

              <VChip
                class="transfer-history-mobile-record__status"
                tag="button"
                type="button"
                @click.stop="openRecoveryDialog(item)"
                variant="tonal"
                :color="getHistoryStatusColor(item)"
                size="small"
              >
                {{ getHistoryStatusText(item) }}
              </VChip>

              <VCheckbox
                v-if="mobileBatchMode"
                class="transfer-history-mobile-record__checkbox"
                :model-value="isHistorySelected(item)"
                density="compact"
                hide-details
                @click.stop
                @update:model-value="checked => toggleHistorySelection(item, checked)"
              />

              <IconBtn v-else class="transfer-history-mobile-record__menu" size="small">
                <VIcon icon="mdi-dots-vertical" />
                <VMenu activator="parent" close-on-content-click>
                  <VList>
                    <VListItem
                      v-for="(menu, i) in getDropdownItems(item)"
                      :key="i"
                      :base-color="menu.props.color"
                      :disabled="menu.props.disabled"
                      @click="menu.props.click()"
                    >
                      <template #prepend>
                        <VIcon :icon="menu.props.prependIcon" />
                      </template>
                      <VListItemTitle>{{ menu.title }}</VListItemTitle>
                    </VListItem>
                  </VList>
                </VMenu>
              </IconBtn>

              <div class="transfer-history-mobile-record__meta">
                <VChip class="transfer-history-mobile-record__mode" variant="outlined" color="primary" size="small">
                  {{ TransferDict[item?.mode ?? ''] || t('common.unknown') }}
                </VChip>
                <span>{{ formatFileSize(item?.src_fileitem?.size || 0) }}</span>
                <span class="transfer-history-mobile-record__dot">·</span>
                <span v-if="item?.date">{{ getHistoryDateText(item.date) }}</span>
              </div>
            </header>

            <button
              type="button"
              class="transfer-history-mobile-record__paths"
              :class="{ 'transfer-history-mobile-record__paths--expanded': isMobilePathExpanded(item) }"
              @click.stop="handleMobilePathClick(item)"
            >
              <div class="transfer-history-mobile-record__path-row">
                <span class="transfer-history-mobile-record__storage">
                  {{ getHistoryStorageName(item?.src_storage) }}
                </span>
                <p>{{ item?.src || t('common.unknown') }}</p>
              </div>
              <div v-if="item?.dest" class="transfer-history-mobile-record__path-arrow">
                <VIcon icon="mdi-arrow-down" size="18" />
              </div>
              <div v-if="item?.dest" class="transfer-history-mobile-record__path-row">
                <span class="transfer-history-mobile-record__storage">
                  {{ getHistoryStorageName(item?.dest_storage) }}
                </span>
                <p>{{ item.dest }}</p>
              </div>
            </button>

            <div
              v-if="
                (!item?.status || item?.auto_paused || item?.cleanup_status === 'failed') && getHistoryFailureHint(item)
              "
              class="transfer-history-mobile-record__error"
            >
              <VIcon icon="mdi-alert-circle" size="18" />
              {{ getHistoryFailureHint(item) }}
            </div>
          </article>
        </template>
      </ProgressiveCardGrid>
    </VInfiniteScroll>
  </section>

  <!-- 非 app 模式下的 FAB 按钮 -->
  <Teleport to="body" v-if="!appMode && route.path === '/history'">
    <div
      v-if="isRefreshed && canManage"
      class="compact-fab-stack compact-fab-stack--history"
      :class="{ 'compact-fab-stack--history-desktop': isDesktop }"
      :style="isDesktop ? { insetBlockEnd: `${desktopFabBottom}px` } : undefined"
    >
      <VFab
        v-if="isMobile && selected.length > 0 && !hasRunningAiRedo"
        icon="mdi-trash-can-outline"
        color="warning"
        variant="tonal"
        appear
        class="compact-fab compact-fab--secondary"
        @click="removeHistoryBatch"
      />
      <VFab
        v-if="isMobile && selected.length > 0 && !hasRunningAiRedo"
        icon="mdi-redo-variant"
        color="success"
        variant="tonal"
        appear
        class="compact-fab compact-fab--secondary"
        @click="retransferBatch"
      />
      <VFab
        v-if="isMobile && selected.length > 0 && !hasRunningAiRedo"
        icon="mdi-robot-outline"
        color="info"
        variant="tonal"
        appear
        class="compact-fab compact-fab--secondary"
        @click="triggerBatchAiRedo"
      />
      <VFab
        :aria-label="t('transferHistory.transferQueue')"
        icon="mdi-timer-sand-paused"
        color="primary"
        appear
        class="compact-fab compact-fab--primary"
        @click="openTransferQueueDialog"
      />
    </div>
  </Teleport>
</template>

<style lang="scss">
/* stylelint-disable selector-pseudo-class-no-unknown */

.transfer-history-desktop-page {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-inline-size: 0;
  min-block-size: 0;
  overflow: hidden;
}

.transfer-history-desktop-toolbar,
.transfer-history-desktop-tools,
.transfer-history-desktop-selection,
.transfer-history-desktop-sort,
.transfer-history-desktop-pagination {
  display: flex;
  align-items: center;
  gap: 12px;
}

.transfer-history-desktop-toolbar,
.transfer-history-desktop-selection,
.transfer-history-desktop-pagination {
  flex-shrink: 0;
}

.transfer-history-desktop-toolbar {
  flex-wrap: wrap;
  justify-content: space-between;
}
.transfer-history-desktop-tools {
  justify-content: flex-end;
  gap: 4px;
  min-inline-size: 0;
}
.transfer-history-desktop-search {
  inline-size: clamp(12rem, 24vw, 24rem);
  flex: 0 1 auto;
  margin-inline-end: 8px;
}
// 与导航栏全局搜索使用相同的胶囊圆角和轻背景，不呈现描边输入框。
.transfer-history-desktop-search .v-field,
.transfer-history-desktop-pagination .transfer-history-pagination__size .v-field {
  border: 0 !important;
  border-radius: var(--app-vuetify-rounded-pill);
  background: rgba(var(--v-theme-surface-variant), 0.04) !important;
  box-shadow: none !important;
  min-block-size: 42px;
}
.transfer-history-desktop-search .v-field__outline,
.transfer-history-desktop-search .v-field__overlay,
.transfer-history-desktop-pagination .transfer-history-pagination__size .v-field__outline,
.transfer-history-desktop-pagination .transfer-history-pagination__size .v-field__overlay {
  display: none;
}
.transfer-history-desktop-search .v-field__prepend-inner {
  color: rgba(var(--v-theme-on-surface), 0.45);
}
// 自定义桌面卡片复用全局表面与阴影 token；主题只替换材质，不改变布局。
.transfer-history-desktop-page {
  --history-desktop-surface: var(--app-grouped-list-background);
  --history-desktop-border: var(--app-surface-border);
  --history-desktop-backdrop-filter: var(--app-grouped-list-backdrop-filter);
}
.transfer-history-desktop-selection,
.transfer-history-desktop-record,
.transfer-history-desktop-group-summary,
.transfer-history-desktop-page .transfer-history-album-summary {
  border: var(--history-desktop-border);
  border-radius: var(--app-surface-radius);
  background: var(--history-desktop-surface);
  box-shadow: var(--app-card-rest-shadow);
  backdrop-filter: var(--history-desktop-backdrop-filter);
  -webkit-backdrop-filter: var(--history-desktop-backdrop-filter);
}
.transfer-history-desktop-record:hover,
.transfer-history-desktop-group-summary:hover,
.transfer-history-desktop-page .transfer-history-album-summary:hover {
  box-shadow: var(--app-card-hover-shadow);
}
.transfer-history-desktop-selection {
  flex-wrap: wrap;
  padding: 8px 16px;
  min-block-size: 58px;
}
.transfer-history-desktop-selection > .v-input {
  flex: 0 0 auto;
}
// 桌面队列入口离屏幕右侧保留更舒适的边距；移动端沿用框架位置。
.compact-fab-stack.compact-fab-stack--history-desktop {
  inset-inline-end: max(2rem, calc(env(safe-area-inset-right) + 2rem));
}
.transfer-history-desktop-summary {
  flex-shrink: 0;
  padding-inline: 16px;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 0.85rem;
}
.transfer-history-desktop-selection__count {
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 0.85rem;
}

/* 虚拟表格仅提供排序、分组和测高；一行一个跨列卡片，取消表头与表格边框。 */
.transfer-history-desktop-virtual.v-table {
  flex: 1 1 0;
  min-block-size: 0;
  background: transparent;
}
.transfer-history-desktop-virtual > .v-table__wrapper {
  padding-inline: 1px;
}
.transfer-history-desktop-virtual table {
  table-layout: fixed;
}
.transfer-history-desktop-virtual .transfer-history-desktop-record-row > td,
.transfer-history-desktop-virtual .transfer-history-desktop-group-row > td {
  padding: 0 0 8px !important;
  border: 0 !important;
  block-size: auto !important;
}
.transfer-history-desktop-record {
  display: grid;
  grid-template-columns: 36px minmax(12rem, 17rem) minmax(0, 1fr) minmax(16rem, 20rem);
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  transition:
    background-color 160ms ease,
    border-color 160ms ease,
    box-shadow 160ms ease;
}
// 子项卡片缩进一级，保留右侧对齐和虚拟列表原有的测高方式。
.transfer-history-desktop-record--child {
  margin-inline-start: 24px;
}
.transfer-history-desktop-record:hover {
  border-color: rgba(var(--v-theme-primary), 0.35);
}
.transfer-history-desktop-record--selected {
  border: 1px solid rgba(var(--v-theme-primary), 0.55);
  background:
    linear-gradient(var(--app-grouped-list-active-background), var(--app-grouped-list-active-background)),
    var(--history-desktop-surface);
}
// 虚拟表格只承载滚动；玻璃材质由可见卡片采样，避免外层与深色底叠加。
html[data-theme='glass'] .transfer-history-desktop-page {
  --history-desktop-surface: var(--glass-v3-card-background);
  --history-desktop-border: 1px solid var(--glass-border);
  --history-desktop-backdrop-filter: var(--glass-native-surface-backdrop-filter);
  .transfer-history-desktop-virtual.v-table {
    background: transparent !important;
    box-shadow: none !important;
    backdrop-filter: none !important;
    -webkit-backdrop-filter: none !important;
  }

  .transfer-history-desktop-record:hover {
    border-color: var(--glass-border-hover);
  }

  // 保留选择状态的主色提示，同时透出同一套玻璃材料。
  .transfer-history-desktop-record--selected,
  .transfer-history-desktop-record--selected:hover {
    border-color: rgba(var(--v-theme-primary), 0.55);
    background:
      linear-gradient(var(--app-grouped-list-active-background), var(--app-grouped-list-active-background)),
      var(--history-desktop-surface);
  }

  .transfer-history-desktop-virtual > .v-table__wrapper > table > tbody > tr:hover > td {
    background: transparent;
  }
}
.transfer-history-desktop-record .v-selection-control {
  min-block-size: 36px;
}
.transfer-history-desktop-record__identity,
.transfer-history-desktop-media-cell,
.transfer-history-desktop-record__paths,
.transfer-history-desktop-record__facts {
  min-inline-size: 0;
}
.transfer-history-desktop-record__identity {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.transfer-history-desktop-record__identity strong,
.transfer-history-desktop-record__identity small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.transfer-history-desktop-record__identity strong {
  font-size: 1.05rem;
}
.transfer-history-desktop-record__identity small {
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}
.transfer-history-desktop-record__paths {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.transfer-history-desktop-record__path {
  display: grid;
  grid-template-columns: 5rem minmax(0, 1fr);
  align-items: start;
  gap: 8px;
  min-inline-size: 0;
  font-size: 0.9rem;
}
.transfer-history-desktop-record__path .v-chip {
  max-inline-size: 100%;
  justify-self: start;
}
// 完整路径按容器宽度换行；虚拟列表测量实际行高，不截断内容。
.transfer-history-desktop-record__path-text {
  min-inline-size: 0;
  overflow-wrap: anywhere;
  white-space: normal;
  line-height: 1.5;
}
.transfer-history-desktop-record__path-arrow {
  display: flex;
  justify-content: center;
  inline-size: 5rem;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}
.transfer-history-desktop-record__status {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.transfer-history-desktop-record__metadata {
  display: grid;
  grid-template-columns: max-content max-content minmax(0, 1fr);
  align-items: center;
  gap: 8px;
  min-inline-size: 0;
  font-size: 0.8rem;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}
.transfer-history-desktop-record__metadata time {
  min-inline-size: 0;
  overflow: hidden;
  text-align: end;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.transfer-history-desktop-group-row > td {
  cursor: pointer;
}
.transfer-history-desktop-group-summary {
  display: grid;
  grid-template-columns: 80px 46px minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  padding: 12px;
}
.transfer-history-desktop-group-counts {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-inline-start: auto;
}
.transfer-history-desktop-group-identity {
  min-inline-size: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.transfer-history-desktop-group-identity strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.transfer-history-desktop-group-identity small {
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}
.transfer-history-desktop-pagination {
  flex-wrap: wrap;
  padding-block: 0;
}
// 仅移除桌面分页按钮的垂直外边距，保留横向间距和原有点击面积。
.transfer-history-desktop-pagination .v-pagination__item,
.transfer-history-desktop-pagination .v-pagination__first,
.transfer-history-desktop-pagination .v-pagination__prev,
.transfer-history-desktop-pagination .v-pagination__next,
.transfer-history-desktop-pagination .v-pagination__last {
  margin-block: 0;
}
.transfer-history-desktop-pagination .transfer-history-pagination__size {
  flex: 0 0 100px;
}
.transfer-history-desktop-pagination .v-pagination {
  margin-inline-start: auto;
}
.transfer-history-pagination__info {
  font-size: 0.8rem;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}
.transfer-history-desktop-empty {
  flex: 1;
  min-block-size: 0;
  overflow: auto;
  padding-block-start: 0;
}

@media (max-width: 1100px) {
  .transfer-history-desktop-record {
    grid-template-columns: 36px minmax(10rem, 14rem) minmax(0, 1fr) minmax(16rem, 18rem);
    gap: 10px;
  }
}

.transfer-history-album-summary {
  display: grid;
  grid-template-columns: 80px 46px minmax(10rem, 1fr) minmax(10rem, 1fr) auto;
  align-items: center;
  gap: 8px;
  min-block-size: 68px;
  padding: 12px;
  transition: background-color 160ms ease;
}

// 所有桌面分组共享固定控制列，避免专辑与影视分组的左侧位置不同。
.transfer-history-desktop-group-controls {
  display: grid;
  grid-template-columns: 32px 40px;
  align-items: center;
  gap: 8px;
  min-inline-size: 0;
}

.transfer-history-desktop-group-controls .v-selection-control {
  min-block-size: auto;
}

.transfer-history-album-summary__cover {
  display: flex;
  align-items: center;
  justify-content: center;
  inline-size: 46px;
  block-size: 46px;
  overflow: hidden;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.08);
  border-radius: var(--app-control-radius);
  background: rgba(var(--v-theme-on-surface), 0.07);
}

.transfer-history-album-summary__cover .v-img,
.transfer-history-album-summary__cover .v-img__img {
  inline-size: 100%;
  block-size: 100%;
}

.transfer-history-album-summary__identity,
.transfer-history-album-summary__path {
  min-inline-size: 0;
}

.transfer-history-album-summary__title-line,
.transfer-history-album-summary__meta,
.transfer-history-album-summary__path,
.transfer-history-album-summary__facts,
.transfer-history-album-summary__fact {
  display: flex;
  align-items: center;
}

.transfer-history-album-summary__title-line {
  gap: 0.5rem;
  min-inline-size: 0;
}

.transfer-history-album-summary__title-line strong {
  overflow: hidden;
  color: rgba(var(--v-theme-on-surface), var(--v-high-emphasis-opacity));
  font-size: 0.95rem;
  font-weight: 650;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.transfer-history-album-summary__meta {
  gap: 0.65rem;
  margin-block-start: 0.2rem;
  overflow: hidden;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 0.75rem;
  white-space: nowrap;
}

.transfer-history-album-summary__meta span {
  display: inline-flex;
  align-items: center;
  gap: 0.2rem;
  overflow: hidden;
  text-overflow: ellipsis;
}

.transfer-history-album-summary__path {
  gap: 0.4rem;
  overflow: hidden;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 0.75rem;
}

.transfer-history-album-summary__path > span:last-child {
  min-inline-size: 0;
  overflow-wrap: anywhere;
  white-space: normal;
}

.transfer-history-album-summary__facts {
  justify-content: flex-end;
  gap: 0.55rem;
  white-space: nowrap;
}

.transfer-history-album-summary__fact {
  gap: 0.25rem;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 0.75rem;
}

@media (max-width: 1280px) {
  .transfer-history-album-summary {
    grid-template-columns: 80px 46px minmax(12rem, 1fr) auto;
  }

  .transfer-history-album-summary__path {
    display: none;
  }
}

.transfer-history-desktop-media-cell {
  display: flex;
  align-items: center;
  gap: 10px;
  padding-block: 6px;
}

.transfer-history-desktop-poster-frame {
  overflow: hidden;
  flex: 0 0 42px;
  aspect-ratio: 2 / 3;
  background: rgba(var(--v-theme-on-surface), 0.08);
  block-size: 63px;
  inline-size: 42px;
  max-block-size: 63px;
  max-inline-size: 42px;
  min-block-size: 63px;
  min-inline-size: 42px;
}

.transfer-history-desktop-poster,
.transfer-history-desktop-poster-placeholder {
  block-size: 100%;
  inline-size: 100%;
  max-block-size: 100%;
  max-inline-size: 100%;
}

.transfer-history-desktop-poster :deep(.v-img__img) {
  object-fit: cover;
}

.transfer-history-desktop-poster-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
}

.transfer-history-mobile-page {
  --transfer-history-mobile-surface-opacity: 0.92;
  --transfer-history-mobile-search-bg: rgba(var(--v-theme-on-surface), 0.045);
  --transfer-history-mobile-muted-bg: rgba(var(--v-theme-on-surface), 0.06);
  --transfer-history-mobile-border: rgba(var(--v-theme-on-surface), 0.1);
  --transfer-history-mobile-storage-width: 4.85rem;
  --transfer-history-mobile-surface-blur: none;

  display: flex;
  flex-direction: column;
  gap: 1rem;
  min-block-size: 100%;
  padding-block: 0.25rem 1.25rem;
  padding-inline: 0.35rem;
}

.transfer-history-mobile-titlebar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.transfer-history-mobile-title {
  flex: 1;
  min-inline-size: 0;
}

.transfer-history-mobile-titlebar__actions {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
}

.transfer-history-mobile-title :deep(h2) {
  font-size: 1.875rem;
  line-height: 1.15;
}

.transfer-history-mobile-search {
  min-inline-size: 0;
}

.transfer-history-mobile-search :deep(.v-field) {
  background: var(--transfer-history-mobile-search-bg);
  min-block-size: 3.75rem;
}

.transfer-history-mobile-search :deep(.v-field__input) {
  font-size: 1rem;
}

.transfer-history-mobile-scroll {
  overflow: visible !important;
}

.transfer-history-mobile-scroll :deep(.v-infinite-scroll__container),
.transfer-history-mobile-scroll :deep(.progressive-card-grid),
.transfer-history-mobile-scroll :deep(.progressive-card-grid__track) {
  overflow: visible !important;
}

.transfer-history-mobile-scroll :deep(.v-infinite-scroll__side) {
  padding-block: 0.75rem;
}

.transfer-history-mobile-state {
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.transfer-history-mobile-state {
  min-block-size: 4rem;
}

.transfer-history-mobile-empty {
  min-block-size: 18rem;
  padding-block-start: 1.5rem;
}

.transfer-history-mobile-record {
  overflow: hidden;
  border-radius: var(--app-surface-radius);
  backdrop-filter: var(--transfer-history-mobile-surface-blur);
  background: rgba(var(--v-theme-surface), var(--transfer-history-mobile-surface-opacity));
  box-shadow: var(--app-card-rest-shadow);
}

.transfer-history-mobile-record--batch {
  cursor: pointer;
}

.transfer-history-mobile-record--selected {
  outline: 2px solid rgb(var(--v-theme-primary));
  outline-offset: -2px;
}

.transfer-history-mobile-record__header {
  display: grid;
  align-items: start;
  gap: 0.75rem;
  grid-template-columns: 3.5rem minmax(0, 1fr) auto 2rem;
  grid-template-rows: auto auto;
  padding-block: 0.85rem 0.75rem;
  padding-inline: 1rem 0.85rem;
}

.transfer-history-mobile-record__poster-wrapper {
  position: relative;
  overflow: hidden;
  background: var(--transfer-history-mobile-muted-bg);
  block-size: 5.25rem;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 18%);
  grid-row: 1 / span 2;
  inline-size: 3.5rem;
}

.transfer-history-mobile-record__poster {
  block-size: 100%;
  inline-size: 100%;
}

.transfer-history-mobile-record__poster :deep(.v-img__img) {
  transition: opacity 0.2s ease;
}

.transfer-history-mobile-record__poster-skeleton {
  block-size: 100%;
  inline-size: 100%;
}

.transfer-history-mobile-record__poster-skeleton :deep(.v-skeleton-loader) {
  block-size: 100%;
  inline-size: 100%;
}

.transfer-history-mobile-record__poster-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(var(--v-theme-on-surface), 0.08);
  block-size: 100%;
  inline-size: 100%;
}

.transfer-history-mobile-record__poster-type {
  position: absolute;
  padding: 2px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 55%);
  color: rgb(255, 255, 255);
  inset-block-end: 4px;
  inset-inline-start: 4px;
  opacity: 0.92;
}

.transfer-history-mobile-record__heading {
  align-self: center;
  min-inline-size: 0;
}

.transfer-history-mobile-record__title {
  overflow: hidden;
  color: rgba(var(--v-theme-on-surface), var(--v-high-emphasis-opacity));
  font-size: 1.125rem;
  font-weight: 650;
  line-height: 1.25;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.transfer-history-mobile-record__subtitle {
  overflow: hidden;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 0.875rem;
  line-height: 1.45;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.transfer-history-mobile-record__status {
  align-self: start;
  border-radius: 999px !important;
  font-weight: 650;
  padding-inline: 0.65rem !important;
}

.transfer-history-mobile-record__menu {
  place-self: start end;
}

.transfer-history-mobile-record__checkbox {
  margin-block-start: -0.35rem;
  margin-inline-end: -0.35rem;
  place-self: start end;
}

.transfer-history-mobile-record__checkbox :deep(.v-selection-control) {
  min-block-size: 2rem;
}

.transfer-history-mobile-record__meta {
  display: flex;
  overflow: hidden;
  align-items: center;
  justify-content: flex-start;
  gap: 0.65rem;
  grid-column: 2 / -1;
  grid-row: 2;
  margin-block-start: 0;
  min-inline-size: 0;
  white-space: nowrap;
}

.transfer-history-mobile-record__meta > span {
  overflow: hidden;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 0.875rem;
  line-height: 1.4;
  text-overflow: ellipsis;
}

.transfer-history-mobile-record__mode {
  border-color: rgb(var(--v-theme-primary)) !important;
  border-radius: 999px !important;
  color: rgb(var(--v-theme-primary)) !important;
  font-weight: 650;
}

.transfer-history-mobile-record__dot {
  color: rgba(var(--v-theme-on-surface), var(--v-disabled-opacity)) !important;
}

.transfer-history-mobile-record__paths {
  display: grid;
  border: 0;
  background: transparent;
  border-block-start: 1px solid rgba(var(--v-theme-on-surface), 0.08);
  color: inherit;
  cursor: pointer;
  gap: 0.45rem;
  grid-template-columns: 1fr;
  inline-size: 100%;
  padding-block: 0.85rem 0.95rem;
  padding-inline: 1rem;
  text-align: start;
}

.transfer-history-mobile-record__path-row {
  display: grid;
  align-items: center;
  gap: 0.75rem;
  grid-template-columns: var(--transfer-history-mobile-storage-width) minmax(0, 1fr);
}

.transfer-history-mobile-record__path-arrow {
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  inline-size: var(--transfer-history-mobile-storage-width);
  padding-inline-start: 0.5rem;
}

.transfer-history-mobile-record__storage {
  display: inline-flex;
  overflow: hidden;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  background: var(--transfer-history-mobile-muted-bg);
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 0.75rem;
  line-height: 1.4;
  max-inline-size: 100%;
  min-block-size: 1.55rem;
  padding-block: 0.125rem;
  padding-inline: 0.425rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.transfer-history-mobile-record__path-row p {
  overflow: hidden;
  margin: 0;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 0.875rem;
  line-height: 1.45;
  overflow-wrap: anywhere;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.transfer-history-mobile-record__paths--expanded .transfer-history-mobile-record__path-row p {
  white-space: normal;
}

.transfer-history-mobile-record__error {
  display: flex;
  align-items: center;
  border: 1px solid rgba(var(--v-theme-error), 0.2);
  border-radius: 8px;
  background: rgba(var(--v-theme-error), 0.08);
  color: rgb(var(--v-theme-error));
  font-size: 0.875rem;
  font-weight: 650;
  gap: 0.5rem;
  line-height: 1.45;
  margin-block: 0 1rem;
  margin-inline: 1rem;
  overflow-wrap: anywhere;
  padding-block: 0.65rem;
  padding-inline: 0.75rem;
}

html[data-theme='transparent'] .transfer-history-mobile-page,
.v-theme--transparent .transfer-history-mobile-page {
  --transfer-history-mobile-surface-opacity: var(--transparent-opacity-light, 0.2);
  --transfer-history-mobile-search-bg: rgba(var(--v-theme-surface), var(--transparent-opacity-light, 0.2));
  --transfer-history-mobile-muted-bg: rgba(var(--v-theme-surface), var(--transparent-opacity, 0.3));
  --transfer-history-mobile-border: rgba(var(--v-theme-on-surface), 0.14);
  --transfer-history-mobile-surface-blur: blur(var(--transparent-blur, 10px));
}
</style>
