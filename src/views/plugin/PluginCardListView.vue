<script lang="ts" setup>
import { useToast } from 'vue-toastification'
import api from '@/api'
import { getApiBusinessErrorMessage } from '@/api/client'
import { getPluginSourceOptions, installPluginFromSource } from '@/api/pluginSource'
import type { Plugin, PluginRating } from '@/api/types'
import NoDataFound from '@/components/states/NoDataFound.vue'
import { getPluginTabs } from '@/router/i18n-menu'
import { useDynamicButton, type DynamicButtonMenuItem } from '@/composables/useDynamicButton'
import { useI18n } from 'vue-i18n'
import PluginMixedSortCard from '@/components/cards/PluginMixedSortCard.vue'
import ProgressiveCardGrid from '@/components/misc/ProgressiveCardGrid.vue'
import { usePWA } from '@/composables/usePWA'
import { useDynamicHeaderTab } from '@/composables/useDynamicHeaderTab'
import { useKeepAliveRefresh, type KeepAliveRefreshContext } from '@/composables/useKeepAliveRefresh'
import { openSharedDialog } from '@/composables/useSharedDialog'
import { usePluginRuntimeStore, usePluginSidebarNavStore, useUserStore } from '@/stores'
import { buildUserPermissionContext, hasPermission } from '@/utils/permission'

// 国际化
const { t } = useI18n()

const route = useRoute()
const userStore = useUserStore()
const pluginRuntimeStore = usePluginRuntimeStore()
const pluginSidebarNavStore = usePluginSidebarNavStore()

/** 用户保存的插件与文件夹混合顺序。 */
interface PluginOrderItem {
  id: string
  type: 'folder' | 'plugin'
  order: number
}

/** 插件文件夹的成员和展示配置。 */
interface PluginFolderConfig {
  plugins: string[]
  order: number
  background: string
  icon: string
  color: string
  gradient: string
  showIcon: boolean
}

type PluginFolderEntry = PluginFolderConfig | string[]
type PluginFolderMap = Record<string, PluginFolderEntry>
type PluginSortKey = 'count' | 'average_rating' | 'plugin_name' | 'plugin_author' | 'repo_url' | 'add_time'

// 市场卡片、拖拽排序和市场设置只在对应标签/操作中需要，延迟到真正使用时加载。
const Draggable = defineAsyncComponent(() => import('vuedraggable').then(module => module.default))
const PluginAppCard = defineAsyncComponent(() => import('@/components/cards/PluginAppCard.vue'))
const PluginFolderCreateDialog = defineAsyncComponent(() => import('@/components/dialog/PluginFolderCreateDialog.vue'))
const PluginMarketSettingDialog = defineAsyncComponent(
  () => import('@/components/dialog/PluginMarketSettingDialog.vue'),
)
const PluginMarketDetailDialog = defineAsyncComponent(() => import('@/components/dialog/PluginMarketDetailDialog.vue'))
const PluginSearchDialog = defineAsyncComponent(() => import('@/components/dialog/PluginSearchDialog.vue'))

// APP
// PWA模式检测
const { appMode } = usePWA()

// 当前标签
const activeTab = ref('installed')
const sortMode = ref(false)

// 获取插件标签页
const pluginTabs = computed(() => getPluginTabs(t))

// 本地插件来源显示名称
const localRepoLabel = computed(() => t('plugin.local'))

// 使用动态标签页
const { registerHeaderTab } = useDynamicHeaderTab()

// 注册动态标签页（在setup顶层立即执行）
registerHeaderTab({
  items: pluginTabs,
  modelValue: activeTab,
  appendButtons: [
    {
      icon: 'mdi-filter-multiple-outline',
      variant: 'text',
      color: computed(() =>
        installedFilter.value || hasUpdateFilter.value || enabledFilter.value ? 'primary' : 'gray',
      ),
      class: 'settings-icon-button',
      dataAttr: 'installed-filter-btn',
      permission: 'admin',
      action: () => {
        filterInstalledPluginDialog.value = true
      },
      show: computed(() => activeTab.value === 'installed'),
    },
    {
      icon: 'mdi-sort-variant',
      variant: 'text',
      color: computed(() => (sortMode.value ? 'warning' : 'gray')),
      class: 'settings-icon-button',
      permission: 'admin',
      action: () => {
        sortMode.value = !sortMode.value
      },
      show: computed(() => activeTab.value === 'installed'),
    },
    {
      icon: 'mdi-filter-multiple-outline',
      variant: 'text',
      color: computed(() => (isFilterFormEmpty.value ? 'gray' : 'primary')),
      class: 'settings-icon-button',
      dataAttr: 'market-filter-btn',
      permission: 'admin',
      action: () => {
        filterMarketPluginDialog.value = true
      },
      show: computed(() => activeTab.value === 'market'),
    },
    {
      icon: 'mdi-refresh',
      variant: 'text',
      color: 'gray',
      class: 'settings-icon-button',
      loading: computed(() => isMarketRefreshing.value),
      permission: 'admin',
      action: () => {
        refreshMarket()
      },
      show: computed(() => activeTab.value === 'market'),
    },
    {
      icon: 'mdi-arrow-left',
      variant: 'text',
      color: 'gray',
      class: 'settings-icon-button',
      permission: 'admin',
      action: () => {
        backToMain()
      },
      show: computed(() => activeTab.value === 'installed' && !!currentFolder.value),
    },
  ],
})

// 插件ID参数
const pluginId = ref(route.query.id)
const installScrollPluginId = ref<string | null>(null)

// 当前排序字段
const activeSort = ref<PluginSortKey | null>(null)

// 插件顺序配置
const orderConfig = ref<PluginOrderItem[]>([])

// 排序选项
const sortOptions = computed<{ title: string; value: PluginSortKey }[]>(() => [
  { title: t('plugin.sort.popular'), value: 'count' },
  { title: t('plugin.sort.rating'), value: 'average_rating' },
  { title: t('plugin.sort.name'), value: 'plugin_name' },
  { title: t('plugin.sort.author'), value: 'plugin_author' },
  { title: t('plugin.sort.repository'), value: 'repo_url' },
  { title: t('plugin.sort.latest'), value: 'add_time' },
])

// 已安装插件列表
const dataList = ref<Plugin[]>([])

// 计算已安装插件的名称列表
const installedPluginNames = computed(() => {
  return dataList.value.map(item => item.plugin_name)
})

// 过滤后的已安装插件列表
const filteredDataList = ref<Plugin[]>([])

// 未安装插件列表
const uninstalledList = ref<Plugin[]>([])

// 插件市场插件列表
const marketList = ref<Plugin[]>([])

// 排序后的未安装插件列表
const sortedUninstalledList = ref<Plugin[]>([])

// 显示的未安装插件列表
const marketPageSize = 20
const marketVisibleCount = ref(marketPageSize)
const displayUninstalledList = computed(() => sortedUninstalledList.value.slice(0, marketVisibleCount.value))

// 两个标签共用页面滚动条，切换时分别保存和恢复各自的位置。
const tabScrollPositions: Record<'installed' | 'market', number> = {
  installed: 0,
  market: 0,
}
let tabScrollRestoreGeneration = 0

// 是否刷新过
const isRefreshed = ref(false)

// 首次列表失败与真实空数组必须保持为不同状态，便于用户原地重试。
const installedLoadError = ref(false)

// APP市场是否加载完成
const isAppMarketLoaded = ref(false)

const marketLoadError = ref(false)

// APP市场窗口
const PluginAppDialog = ref(false)

// 插件安装统计
const PluginStatistics = ref<{ [key: string]: number }>({})

// 插件评分
const PluginRatings = ref<{ [key: string]: PluginRating }>({})

// 插件市场刷新状态
const isMarketRefreshing = ref(false)

const pluginRuntimeSummary = computed(() => pluginRuntimeStore.summary)
const installingPluginIds = ref(new Set<string>())
const isPluginPageActive = ref(false)
const appliedRuntimeReconciliation = ref(0)

// 每类远程快照独立管理 writer 代际，旧请求只能完成自身 Promise，不能覆盖新状态。
let installedWriterGeneration = 0
let marketWriterGeneration = 0
let ratingWriterGeneration = 0
let statisticWriterGeneration = 0
// 搜索关键字
const keyword = ref('')

// 每一个插件的动作标识
const pluginActions: Ref<{ [key: string]: boolean }> = ref({})

// 提示框
const $toast = useToast()

let folderCreateDialogController: ReturnType<typeof openSharedDialog> | null = null
let searchDialogController: ReturnType<typeof openSharedDialog> | null = null

// 过滤表单
const filterForm = reactive({
  // 名称
  name: '' as string,
  // 作者
  author: [] as string[],
  // 标签
  label: [] as string[],
  // 插件库
  repo: [] as string[],
})

// 默认背景
const defaultGradient =
  'linear-gradient(rgba(0, 0, 0, 0.6) 0%, rgba(0, 0, 0, 0.4) 100%), linear-gradient(135deg, rgba(33, 150, 243, 0.7) 0%, rgba(33, 150, 243, 0.8) 100%)'
// 默认文件夹图标
const defaultIcon = 'mdi-folder'
// 默认文件夹颜色
const defaultColor = '#2196F3'

// 计算过滤表单是否全部为空
const isFilterFormEmpty = computed(() => {
  return (
    !filterForm.name && filterForm.author.length === 0 && filterForm.label.length === 0 && filterForm.repo.length === 0
  )
})

// 关闭插件市场过滤菜单。
function closeMarketFilterMenu() {
  filterMarketPluginDialog.value = false
}

// 选择插件市场排序项并关闭过滤菜单。
function selectMarketSort(value: PluginSortKey) {
  activeSort.value = value
  closeMarketFilterMenu()
}

// 提交插件市场关键字过滤并关闭过滤菜单。
function submitMarketNameFilter(event: KeyboardEvent) {
  if (event.isComposing) return
  closeMarketFilterMenu()
}

// 插件过滤条件
const installedFilter = ref(null)

// 有新版本过滤条件
const hasUpdateFilter = ref(false)

// 已启用过滤条件
const enabledFilter = ref(false)

// 已安装插件过滤窗口
const filterInstalledPluginDialog = ref(false)

// 插件市场过滤窗口
const filterMarketPluginDialog = ref(false)

// 关闭已安装插件过滤菜单。
function closeInstalledFilterMenu() {
  filterInstalledPluginDialog.value = false
}

// 切换已启用插件过滤条件并关闭过滤菜单。
function toggleEnabledInstalledFilter() {
  enabledFilter.value = !enabledFilter.value
  closeInstalledFilterMenu()
}

// 切换有新版本插件过滤条件并关闭过滤菜单。
function toggleHasUpdateInstalledFilter() {
  hasUpdateFilter.value = !hasUpdateFilter.value
  closeInstalledFilterMenu()
}

// 提交已安装插件关键字过滤并关闭过滤菜单。
function submitInstalledNameFilter(event: KeyboardEvent) {
  if (event.isComposing) return
  closeInstalledFilterMenu()
}

// 作者过滤项
const authorFilterOptions = ref<string[]>([])
// 标签过滤项
const labelFilterOptions = ref<string[]>([])
// 插件库过滤项
const repoFilterOptions = ref<string[]>([])

// 插件文件夹配置
const pluginFolders = ref<PluginFolderMap>({})

// 文件夹排序
const folderOrder = ref<string[]>([])

// 当前查看的文件夹
const currentFolder = ref('')

// 新建文件夹对话框
// 新文件夹名称
const newFolderName = ref('')

const pluginByIdMap = computed(() => new Map(dataList.value.map(plugin => [plugin.id, plugin])))
const orderValueMap = computed(() => {
  const map = new Map<string, number>()

  orderConfig.value.forEach((item, index) => {
    map.set(`${item.type || 'plugin'}:${item.id}`, item.order ?? index)
  })

  return map
})

const folderedPluginIds = computed(() => {
  const pluginIds = new Set<string>()

  Object.values(pluginFolders.value).forEach(folderData => {
    const plugins = Array.isArray(folderData) ? folderData : folderData.plugins || []
    plugins.forEach((pluginId: string) => pluginIds.add(pluginId))
  })

  return pluginIds
})

const canDragSort = computed(() => sortMode.value && activeTab.value === 'installed')
const shouldVirtualizeInstalledMainList = computed(() => !sortMode.value && !currentFolder.value)
const shouldVirtualizeInstalledFolderList = computed(() => !sortMode.value && !!currentFolder.value)
const installedScrollToIndex = computed(() => {
  if (sortMode.value || currentFolder.value) {
    return undefined
  }

  const targetPluginId = installScrollPluginId.value || pluginId.value
  if (!targetPluginId) return undefined

  const targetIndex = mixedSortList.value.findIndex(item => item.type === 'plugin' && item.id === targetPluginId)

  return targetIndex >= 0 ? targetIndex : undefined
})

// 获取文件夹内筛选后的插件
const getFilteredFolderPlugins = (folderName: string) => {
  const folderData = pluginFolders.value[folderName]
  const folderPluginIds = Array.isArray(folderData) ? folderData : folderData?.plugins || []

  // 获取文件夹内的插件并应用筛选条件
  const folderPlugins: Plugin[] = []
  folderPluginIds.forEach((pluginId: string) => {
    const plugin = pluginByIdMap.value.get(pluginId)
    if (plugin) {
      folderPlugins.push(plugin)
    }
  })

  // 应用筛选条件
  return folderPlugins.filter(plugin => {
    if (!installedFilter.value && !hasUpdateFilter.value && !enabledFilter.value) return true
    if (hasUpdateFilter.value && enabledFilter.value) {
      return plugin.has_update && plugin.state
    }
    if (hasUpdateFilter.value) return plugin.has_update
    if (enabledFilter.value) return plugin.state
    if (installedFilter.value) {
      return plugin.plugin_name?.toLowerCase().includes((installedFilter.value as string).toLowerCase())
    }
    if (installedFilter.value) {
      return plugin.plugin_name?.toLowerCase().includes((installedFilter.value as string).toLowerCase())
    }
    if (installedFilter.value) {
      return plugin.plugin_name?.toLowerCase().includes((installedFilter.value as string).toLowerCase())
    }
    return true
  })
}

// 显示的插件列表（考虑文件夹筛选）
const displayedPlugins = computed(() => {
  if (!currentFolder.value) {
    // 主列表：显示未归类的插件
    return filteredDataList.value.filter(plugin => !folderedPluginIds.value.has(plugin.id))
  } else {
    // 文件夹内：返回筛选后的插件
    return getFilteredFolderPlugins(currentFolder.value)
  }
})

// 混合排序项目类型
interface MixedSortItem {
  type: 'folder' | 'plugin'
  id: string
  data: Plugin | { name: string; pluginCount: number; config: Partial<PluginFolderConfig> }
  order: number
}

// 混合排序列表（包含文件夹和插件）
const mixedSortList = ref<MixedSortItem[]>([])

// 可拖拽的插件列表（文件夹内用）
const draggableFolderPlugins = ref<Plugin[]>([])

// 是否正在拖拽排序中
const isDraggingSortMode = ref(false)

// 显示的文件夹列表（按排序显示）
const displayedFolders = computed(() => {
  if (currentFolder.value) return [] // 在文件夹内不显示其他文件夹

  const folderNames = Object.keys(pluginFolders.value)

  // 按排序显示文件夹
  const sortedFolderNames = [...folderOrder.value].filter(name => folderNames.includes(name))
  // 添加不在排序中的新文件夹
  const unsortedFolders = folderNames.filter(name => !folderOrder.value.includes(name))
  sortedFolderNames.push(...unsortedFolders)

  return sortedFolderNames
    .map(folderName => {
      const folderData = pluginFolders.value[folderName]
      const config = Array.isArray(folderData) ? {} : folderData

      // 获取筛选后的插件数量
      const filteredPlugins = getFilteredFolderPlugins(folderName)

      return {
        name: folderName,
        pluginCount: filteredPlugins.length,
        config: config,
      }
    })
    .filter(folder => {
      // 当有筛选条件时，只显示包含筛选后插件的文件夹
      if (installedFilter.value || hasUpdateFilter.value || enabledFilter.value) {
        return folder.pluginCount > 0
      }
      return true
    })
})

// 更新混合排序列表
function updateMixedSortList() {
  if (isDraggingSortMode.value) return // 拖拽排序时跳过更新

  if (!currentFolder.value) {
    // 主列表：创建混合列表
    const items: MixedSortItem[] = []

    // 始终使用全局排序配置来创建混合列表
    const allItems: MixedSortItem[] = []

    // 添加文件夹项目
    displayedFolders.value.forEach(folder => {
      allItems.push({
        type: 'folder',
        id: folder.name,
        data: folder,
        order: orderValueMap.value.get(`folder:${folder.name}`) ?? 999,
      })
    })

    // 添加插件项目
    displayedPlugins.value.forEach(plugin => {
      allItems.push({
        type: 'plugin',
        id: plugin.id || '',
        data: plugin,
        order: orderValueMap.value.get(`plugin:${plugin.id}`) ?? 999,
      })
    })

    // 按order排序
    allItems.sort((a, b) => a.order - b.order)

    // 转换为MixedSortItem格式
    allItems.forEach((item, index) => {
      items.push({
        type: item.type,
        id: item.id,
        data: item.data,
        order: index,
      })
    })

    // 按order排序
    items.sort((a, b) => a.order - b.order)
    mixedSortList.value = items
  } else {
    // 文件夹内：只更新插件列表
    draggableFolderPlugins.value = [...displayedPlugins.value]
  }
}

// 监听相关数据变化，更新混合排序列表
watch(
  [displayedPlugins, displayedFolders, orderConfig, folderOrder, installedFilter, hasUpdateFilter, enabledFilter],
  () => {
    // 只有在非拖拽状态下才更新
    if (!isDraggingSortMode.value) {
      updateMixedSortList()
    }
  },
  {
    immediate: true,
    deep: true,
  },
)

// 监听文件夹切换，更新列表
watch(currentFolder, () => {
  // 只有在非拖拽状态下才更新
  if (!isDraggingSortMode.value) {
    updateMixedSortList()
  }
})

// 加载插件顺序
async function loadPluginOrderConfig() {
  try {
    const response = await api.get<{ value?: Array<string | Partial<PluginOrderItem>> }>('/user/config/PluginOrder')
    if (response?.value) {
      const serverData = response.value as Array<string | Partial<PluginOrderItem>>
      // 兼容服务端的旧格式和新格式
      if (serverData.length > 0 && typeof serverData[0] === 'object' && serverData[0] && 'type' in serverData[0]) {
        orderConfig.value = serverData.map((item, index) => {
          const orderItem = item as Partial<PluginOrderItem>
          return {
            id: orderItem.id || '',
            type: orderItem.type === 'folder' ? 'folder' : 'plugin',
            order: orderItem.order ?? index,
          }
        })
      } else {
        // 旧格式，转换为新格式
        orderConfig.value = serverData.map((item, index) => ({
          id: typeof item === 'string' ? item : item.id || '',
          type: 'plugin',
          order: index,
        }))
      }
    }
  } catch (error) {
    console.error('Failed to load plugin order config:', error)
    orderConfig.value = []
  }
}

/** 保存插件混合顺序，业务失败与 HTTP 失败使用同一回滚路径。 */
async function savePluginOrderConfig(items: PluginOrderItem[]) {
  await api.post('/user/config/PluginOrder', items, { feedback: 'silent' })
}

function clonePluginFolders(source: PluginFolderMap = pluginFolders.value): PluginFolderMap {
  return Object.fromEntries(
    Object.entries(source).map(([name, folder]) => [
      name,
      Array.isArray(folder) ? [...folder] : { ...folder, plugins: [...folder.plugins] },
    ]),
  )
}

interface FolderStateSnapshot {
  currentFolder: string
  folderOrder: string[]
  folders: PluginFolderMap
}

/** 捕获一次文件夹写操作开始前的完整本地快照。 */
function captureFolderState(): FolderStateSnapshot {
  return {
    currentFolder: currentFolder.value,
    folderOrder: [...folderOrder.value],
    folders: clonePluginFolders(),
  }
}

function restoreFolderState(snapshot: FolderStateSnapshot) {
  pluginFolders.value = clonePluginFolders(snapshot.folders)
  folderOrder.value = [...snapshot.folderOrder]
  currentFolder.value = snapshot.currentFolder
}

/** 双写发生部分提交时，按服务端已持久化的两个事实源重建排序状态。 */
async function reloadPersistedOrderingState() {
  await loadPluginOrderConfig()
  await loadPluginFolders()
  sortPluginOrder()
}

// 按order的顺序对插件进行排序
function sortPluginOrder() {
  if (!orderConfig.value) {
    return
  }
  if (dataList.value.length === 0) {
    return
  }
  // PluginOrder 是用户级展示顺序，未配置的插件保留后端持久化安装清单顺序。
  dataList.value.sort((a, b) => {
    const aIndex = orderValueMap.value.get(`plugin:${a.id}`) ?? Number.MAX_SAFE_INTEGER
    const bIndex = orderValueMap.value.get(`plugin:${b.id}`) ?? Number.MAX_SAFE_INTEGER

    return aIndex - bIndex
  })
}

// 保存混合排序
async function saveMixedSortOrder() {
  const folderSnapshot = captureFolderState()
  const previousOrder = orderConfig.value.map(item => ({ ...item }))
  const previousFilteredData = [...filteredDataList.value]
  let orderPersisted = false

  try {
    // 分离文件夹和插件，并记录它们的全局排序位置
    const newFolderOrder: string[] = []
    const newPluginOrder: Plugin[] = []
    const globalOrder: { type: 'folder' | 'plugin'; id: string; order: number }[] = []

    mixedSortList.value.forEach((item, index) => {
      globalOrder.push({
        type: item.type,
        id: item.id,
        order: index,
      })

      if (item.type === 'folder') {
        newFolderOrder.push(item.id)
      } else if (item.type === 'plugin') {
        newPluginOrder.push(item.data as Plugin)
      }
    })

    // 更新文件夹排序并设置order属性
    folderOrder.value = newFolderOrder
    newFolderOrder.forEach((folderName, index) => {
      if (pluginFolders.value[folderName]) {
        // 找到该文件夹在全局排序中的位置
        const globalOrderItem = globalOrder.find(item => item.type === 'folder' && item.id === folderName)
        const folderData = pluginFolders.value[folderName]
        if (!Array.isArray(folderData)) {
          folderData.order = globalOrderItem ? globalOrderItem.order : index
        }
      }
    })

    // 添加文件夹中的插件到插件列表末尾
    Object.values(pluginFolders.value).forEach(folderData => {
      const plugins = Array.isArray(folderData) ? folderData : folderData.plugins || []
      plugins.forEach((id: string) => {
        const folderPlugin = pluginByIdMap.value.get(id)
        if (folderPlugin && !newPluginOrder.find(p => p.id === id)) {
          newPluginOrder.push(folderPlugin)
        }
      })
    })

    // 更新插件列表
    filteredDataList.value = newPluginOrder

    // 保存插件排序配置（包含全局排序信息）
    const orderObj = globalOrder.map(item => ({
      id: item.id,
      type: item.type,
      order: item.order,
    }))
    orderConfig.value = orderObj

    // 保存到服务端
    await savePluginOrderConfig(orderObj)
    orderPersisted = true

    // 保存文件夹排序
    await savePluginFolders()
  } catch (error) {
    console.error(error)
    if (orderPersisted) {
      await reloadPersistedOrderingState()
    } else {
      restoreFolderState(folderSnapshot)
      orderConfig.value = previousOrder
      filteredDataList.value = previousFilteredData
    }
    $toast.error(t('plugin.operationFailed'))
  } finally {
    // 清除拖拽标志
    isDraggingSortMode.value = false

    // 在清除拖拽标志后更新混合排序列表显示
    updateMixedSortList()
  }
}

// 保存文件夹内插件顺序
async function saveFolderPluginOrder() {
  if (!currentFolder.value) return

  const folderSnapshot = captureFolderState()
  const previousOrder = orderConfig.value.map(item => ({ ...item }))
  let orderPersisted = false

  try {
    // 更新文件夹内插件顺序
    const folderData = pluginFolders.value[currentFolder.value]
    if (folderData) {
      const newPluginIds = draggableFolderPlugins.value.map(plugin => plugin.id)

      if (Array.isArray(folderData)) {
        // 旧格式，直接替换数组
        pluginFolders.value[currentFolder.value] = newPluginIds
      } else {
        // 新格式，更新plugins字段
        folderData.plugins = newPluginIds
      }

      // 更新全局排序配置中文件夹内插件的顺序
      const folderOrderItem = orderConfig.value.find(item => item.type === 'folder' && item.id === currentFolder.value)
      const folderGlobalOrder = folderOrderItem?.order ?? 999

      // 为文件夹内的插件分配连续的order值
      newPluginIds.forEach((pluginId, index) => {
        const existingItem = orderConfig.value.find(item => item.type === 'plugin' && item.id === pluginId)
        if (existingItem) {
          existingItem.order = folderGlobalOrder + 0.1 + index * 0.01 // 使用小数确保在文件夹后面
        } else {
          orderConfig.value.push({
            id: pluginId,
            type: 'plugin',
            order: folderGlobalOrder + 0.1 + index * 0.01,
          })
        }
      })

      // 保存全局排序配置
      await savePluginOrderConfig(orderConfig.value)
      orderPersisted = true

      // 保存到后端
      await savePluginFolders()
    }
  } catch (error) {
    console.error(error)
    if (orderPersisted) {
      await reloadPersistedOrderingState()
    } else {
      restoreFolderState(folderSnapshot)
      orderConfig.value = previousOrder
    }
    $toast.error(t('plugin.operationFailed'))
  } finally {
    // 清除拖拽标志
    isDraggingSortMode.value = false
    updateMixedSortList()
  }
}

/** 将插件市场运行时字段转换为可安全比较的文本。 */
function normalizeMarketText(value: unknown) {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return ''
}

/** 将插件市场逗号分隔字段转换为去重前的文本数组。 */
function splitMarketValues(value: unknown) {
  if (Array.isArray(value)) {
    return value
      .map(normalizeMarketText)
      .map(item => item.trim())
      .filter(Boolean)
  }

  return normalizeMarketText(value)
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)
}

/** 判断插件是否来源于本地插件仓库。 */
function isLocalRepoSource(item: Plugin | string | undefined) {
  if (!item) return false

  const repoUrl = typeof item === 'string' ? item : normalizeMarketText(item.repo_url)

  return Boolean((typeof item !== 'string' && item.is_local) || repoUrl.startsWith('local://'))
}

// 初始化过滤选项
function initOptions(item: Plugin) {
  const optionValue = (options: Array<string>, value: unknown, preferred = false) => {
    const text = normalizeMarketText(value).trim()
    if (!text || options.includes(text)) return
    if (preferred) options.unshift(text)
    else options.push(text)
  }
  const optionMutipleValue = (options: Array<string>, value: unknown) => {
    splitMarketValues(value).forEach(v => !options.includes(v) && options.push(v))
  }
  optionValue(authorFilterOptions.value, item.plugin_author)
  optionMutipleValue(labelFilterOptions.value, item.plugin_label)
  optionValue(repoFilterOptions.value, handleRepoUrl(item), isLocalRepoSource(item))
}

// 关闭插件市场窗口
function pluginDialogClose() {
  PluginAppDialog.value = false
}

// 安装插件
async function installPlugin(item: Plugin, releaseVersion?: string, repoUrl?: string) {
  const pluginId = item?.id
  if (!pluginId || installingPluginIds.value.has(pluginId)) {
    return
  }

  if (!releaseVersion && item?.system_version_compatible === false) {
    $toast.error(item.system_version_message || t('plugin.incompatibleSystemVersion'))
    return
  }

  installingPluginIds.value = new Set([...installingPluginIds.value, pluginId])

  const releaseInstallReservation = () => {
    const pending = new Set(installingPluginIds.value)
    pending.delete(pluginId)
    installingPluginIds.value = pending
  }

  let useExplicitSource = false
  try {
    const sourceOptions = await getPluginSourceOptions(pluginId)
    if (sourceOptions.selection_status === 'conflict') {
      if (!repoUrl) {
        releaseInstallReservation()
        openPluginMarketDetail(item)
        return
      }
      const selectedCandidate = sourceOptions.candidates.find(
        candidate => candidate.repo_url === repoUrl && candidate.source_type !== 'local',
      )
      if (!selectedCandidate) {
        releaseInstallReservation()
        $toast.error(t('plugin.selectSourceRequired'))
        openPluginMarketDetail(item)
        return
      }
      useExplicitSource = true
    } else if (['unavailable', 'incomplete'].includes(sourceOptions.selection_status)) {
      releaseInstallReservation()
      $toast.error(sourceOptions.selection_reason || t('plugin.sourceUnavailable'))
      return
    }
  } catch (error) {
    console.error(error)
    // 候选查询失败时仍由安装 Gateway 执行最终来源准入，避免只读接口故障扩大为安装停机。
  }

  const previousIndex = dataList.value.findIndex(plugin => plugin.id === item.id)
  const previousPlugin = previousIndex >= 0 ? dataList.value[previousIndex] : undefined
  sortMode.value = false
  currentFolder.value = ''
  installedFilter.value = null
  hasUpdateFilter.value = false
  enabledFilter.value = false
  tabScrollPositions.installed = 0
  installScrollPluginId.value = pluginId
  dataList.value = [
    ...dataList.value.filter(plugin => plugin.id !== pluginId),
    {
      ...item,
      installed: true,
      state: false,
      runtime_status: 'source_missing',
    },
  ]
  activeTab.value = 'installed'
  pluginDialogClose()

  let installed = false
  try {
    if (useExplicitSource && repoUrl) {
      await installPluginFromSource(pluginId, {
        repo_url: repoUrl,
        release_version: releaseVersion,
        force: Boolean(item?.has_update || releaseVersion),
      })
    } else {
      await api.get(`plugin/install/${pluginId}`, {
        params: {
          release_version: releaseVersion,
          force: item?.has_update || Boolean(releaseVersion),
        },
        feedback: 'silent',
      })
    }
    installed = true

    $toast.success(t('plugin.installSuccess', { name: item?.plugin_name }))
    await fetchInstalledPlugins({ silent: true })
    if (userStore.superUser) await pluginRuntimeStore.refresh()
    await pluginSidebarNavStore.ensureSidebarNav(true)
    await nextTick()
    if (installScrollPluginId.value === pluginId) installScrollPluginId.value = null
  } catch (error) {
    const pending = new Set(installingPluginIds.value)
    pending.delete(pluginId)
    installingPluginIds.value = pending
    const nextData = dataList.value.filter(plugin => plugin.id !== pluginId)
    if (previousPlugin) nextData.splice(Math.min(previousIndex, nextData.length), 0, previousPlugin)
    dataList.value = nextData
    if (installScrollPluginId.value === pluginId) installScrollPluginId.value = null
    console.error(error)
    $toast.error(
      t('plugin.installFailed', {
        name: item?.plugin_name,
        message: getApiBusinessErrorMessage(error) || (error instanceof Error ? error.message : ''),
      }),
    )
    // 列表校准不能延迟失败反馈，网络异常时也要立即告诉用户安装事务已回滚。
    void fetchInstalledPlugins({ silent: true })
  } finally {
    if (!installed) {
      const pending = new Set(installingPluginIds.value)
      pending.delete(pluginId)
      installingPluginIds.value = pending
    }
  }
}

/** 打开未安装插件的市场详情，确认后才进入安装流程。 */
function openPluginMarketDetail(item: Plugin) {
  openSharedDialog(
    PluginMarketDetailDialog,
    {
      plugin: item,
      count: PluginStatistics.value[item.id || '0'],
      installHandler: (releaseVersion?: string, repoUrl?: string) => installPlugin(item, releaseVersion, repoUrl),
    },
    {
      install: pluginInstalled,
    },
    { closeOn: ['close', 'install', 'update:modelValue'] },
  )
}

// 打开插件搜索结果
function openPlugin(item: Plugin) {
  if (item.installed === true) {
    // 已安装插件继续进入对应的插件操作面板。
    pluginActions.value[item.id || '0'] = true
  } else {
    openPluginMarketDetail(item)
  }
  closeSearchDialog()
}

// 关闭插件搜索窗口
function closeSearchDialog() {
  searchDialogController?.close()
  searchDialogController = null
}

// 过滤插件
const filterPlugins = computed(() => {
  const all_list = [...dataList.value, ...uninstalledList.value]
  const normalizedKeyword = normalizeMarketText(keyword.value).toLowerCase()
  return all_list.filter((item: Plugin) => {
    // 需要忽略大小写
    return (
      !normalizedKeyword ||
      normalizeMarketText(item.plugin_name).toLowerCase().includes(normalizedKeyword) ||
      normalizeMarketText(item.plugin_desc).toLowerCase().includes(normalizedKeyword)
    )
  })
})

// 获取插件列表数据
async function fetchInstalledPlugins(context: KeepAliveRefreshContext = {}): Promise<boolean> {
  const generation = ++installedWriterGeneration
  if (!context.silent || !isRefreshed.value) {
    installedLoadError.value = false
  }

  try {
    const installedPlugins: Plugin[] = await api.get('plugin/', {
      params: {
        state: 'installed',
      },
    })
    if (generation !== installedWriterGeneration) return false

    const previousById = new Map([...uninstalledList.value, ...dataList.value].map(plugin => [plugin.id, plugin]))
    const mergedPlugins = installedPlugins.map(plugin => {
      const previous = previousById.get(plugin.id)
      const isRuntimePlaceholder = plugin.plugin_name === plugin.id && !plugin.plugin_version
      return {
        ...(previous || {}),
        ...plugin,
        ...(isRuntimePlaceholder && previous
          ? {
              plugin_name: previous.plugin_name,
              plugin_desc: previous.plugin_desc,
              plugin_icon: previous.plugin_icon,
              plugin_version: previous.plugin_version,
              plugin_author: previous.plugin_author,
              author_url: previous.author_url,
              repo_url: previous.repo_url,
            }
          : {}),
      }
    })
    const serverIds = new Set(mergedPlugins.map(plugin => plugin.id))
    const optimisticPlugins = dataList.value.filter(
      plugin => installingPluginIds.value.has(plugin.id) && !serverIds.has(plugin.id),
    )
    if (installingPluginIds.value.size > 0) {
      const pending = new Set(installingPluginIds.value)
      serverIds.forEach(pluginId => pending.delete(pluginId))
      installingPluginIds.value = pending
    }

    mergeRatingsIntoPlugins(mergedPlugins)
    dataList.value = [...mergedPlugins, ...optimisticPlugins]
    mergeMarketMetadataIntoInstalled()
    // 排序
    sortPluginOrder()
    isRefreshed.value = true
    installedLoadError.value = false
    return true
  } catch (error) {
    console.error(error)
    if (generation === installedWriterGeneration && !isRefreshed.value) {
      installedLoadError.value = true
    }
    return false
  }
}

/** 运行态变化在市场页发生时延后应用，回到已安装列表后再补一次快照。 */
async function reconcileInstalledRuntime(): Promise<void> {
  const reconciliation = pluginRuntimeStore.reconciliation
  if (reconciliation <= appliedRuntimeReconciliation.value) return

  const refreshed = await fetchInstalledPlugins({ silent: true })
  if (refreshed && reconciliation === pluginRuntimeStore.reconciliation) {
    appliedRuntimeReconciliation.value = reconciliation
  }
}

function isPluginRuntimeSettling(pluginId: string) {
  return pluginRuntimeSummary.value?.ready === false || installingPluginIds.value.has(pluginId)
}

/** 将市场更新元数据投影到当前已安装快照。 */
function mergeMarketMetadataIntoInstalled() {
  const marketById = new Map(
    uninstalledList.value.filter(plugin => plugin.has_update).map(plugin => [plugin.id, plugin]),
  )
  dataList.value.forEach(plugin => {
    const marketPlugin = marketById.get(plugin.id)
    plugin.has_update = Boolean(marketPlugin)
    if (!marketPlugin) return

    plugin.repo_url = marketPlugin.repo_url
    plugin.history = marketPlugin.history
    plugin.system_version = marketPlugin.system_version
    plugin.system_version_compatible = marketPlugin.system_version_compatible
    plugin.system_version_message = marketPlugin.system_version_message
  })
}

interface PluginMarketMetrics {
  statistics?: { [key: string]: number }
  ratings?: { [key: string]: PluginRating }
}

type CompletePluginMarketMetrics = Required<PluginMarketMetrics>

/** 将市场快照一次性投影到列表和过滤选项，避免请求过程暴露半成品状态。 */
function applyMarketSnapshot(marketResponse: Plugin[], metrics?: CompletePluginMarketMetrics) {
  if (metrics) {
    PluginStatistics.value = metrics.statistics
    PluginRatings.value = metrics.ratings
  }
  mergeRatingsIntoPlugins(marketResponse, metrics?.ratings)
  uninstalledList.value = marketResponse
  mergeMarketMetadataIntoInstalled()
  marketList.value = uninstalledList.value.filter(item => !(item.has_update && item.installed))
  authorFilterOptions.value = []
  labelFilterOptions.value = []
  repoFilterOptions.value = []
  marketList.value.forEach(initOptions)
  isAppMarketLoaded.value = true
  marketLoadError.value = false
}

// 获取未安装插件列表数据
async function fetchUninstalledPlugins(
  force: boolean = false,
  context: KeepAliveRefreshContext = {},
  commit = true,
): Promise<Plugin[] | undefined> {
  const generation = ++marketWriterGeneration
  if (!context.silent || !isAppMarketLoaded.value) {
    marketLoadError.value = false
  }

  try {
    const marketResponse: Plugin[] = await api.get('plugin/', {
      params: {
        state: 'market',
        force: force,
      },
    })
    if (generation !== marketWriterGeneration) return

    if (commit) applyMarketSnapshot(marketResponse)
    return marketResponse
  } catch (error) {
    console.error(error)
    if (generation === marketWriterGeneration && !isAppMarketLoaded.value) {
      marketLoadError.value = true
    }
    return undefined
  }
}

// 加载插件统计数据
async function fetchPluginStatistics(): Promise<{ [key: string]: number } | undefined> {
  const generation = ++statisticWriterGeneration
  try {
    const statistics = await api.get<Record<string, number>, Record<string, number>>('plugin/statistic')
    return generation === statisticWriterGeneration ? statistics : undefined
  } catch (error) {
    console.error(error)
    return undefined
  }
}

/** 批量加载插件评分并合并到已安装和市场插件对象。 */
async function fetchPluginRatings(
  plugins: Plugin[] = marketList.value,
  marketGeneration = marketWriterGeneration,
): Promise<{ [key: string]: PluginRating } | undefined> {
  const generation = ++ratingWriterGeneration
  const pluginIds = Array.from(new Set([...dataList.value, ...plugins].map(plugin => plugin.id).filter(Boolean)))
  if (pluginIds.length === 0) {
    return generation === ratingWriterGeneration ? {} : undefined
  }

  try {
    const ratings: { [key: string]: PluginRating } = {}
    for (let start = 0; start < pluginIds.length; start += 100) {
      const chunk = pluginIds.slice(start, start + 100)
      const response: { [key: string]: PluginRating } = await api.get('plugin/rating', {
        params: {
          plugin_ids: chunk.join(','),
        },
      })
      Object.assign(ratings, response)
    }

    const currentPluginIds = Array.from(
      new Set([...dataList.value, ...plugins].map(plugin => plugin.id).filter(Boolean)),
    )
    if (
      generation !== ratingWriterGeneration ||
      marketGeneration !== marketWriterGeneration ||
      currentPluginIds.join('\0') !== pluginIds.join('\0')
    )
      return

    return ratings
  } catch (error) {
    console.error(error)
    return undefined
  }
}

/** 下载量与评分属于同一份市场指标快照，始终在同一刷新时机加载。 */
async function getPluginMarketMetrics(
  plugins: Plugin[] = marketList.value,
  commit = true,
): Promise<PluginMarketMetrics> {
  const marketGeneration = marketWriterGeneration
  const [statistics, ratings] = await Promise.all([
    fetchPluginStatistics(),
    fetchPluginRatings(plugins, marketGeneration),
  ])

  if (commit && statistics !== undefined && ratings !== undefined) {
    PluginStatistics.value = statistics
    PluginRatings.value = ratings
    mergeRatingsIntoPlugins([...dataList.value, ...uninstalledList.value, ...marketList.value], ratings, true)
  }

  return { statistics, ratings }
}

/** 新列表写入前复用最近一次评分快照，避免静默刷新期间评分闪烁。 */
function mergeRatingsIntoPlugins(
  plugins: Plugin[],
  ratings: Record<string, PluginRating> = PluginRatings.value,
  overwrite = false,
) {
  for (const plugin of plugins) {
    const pluginRating = ratings[plugin.id]
    if (!pluginRating) continue
    if (overwrite || plugin.average_rating === undefined) plugin.average_rating = pluginRating.average_rating
    if (overwrite || plugin.rating_count === undefined) plugin.rating_count = pluginRating.rating_count
    if (overwrite || plugin.user_rating === undefined) plugin.user_rating = pluginRating.user_rating
  }
}

/** 评分提交接口已返回新值，只回写当前插件，避免重新加载全部市场指标。 */
function applyPluginRating(pluginRating: PluginRating) {
  const pluginId = pluginRating.plugin_id
  if (!pluginId) return

  PluginRatings.value = {
    ...PluginRatings.value,
    [pluginId]: pluginRating,
  }

  mergeRatingsIntoPlugins(
    [...dataList.value, ...uninstalledList.value, ...marketList.value],
    {
      [pluginId]: pluginRating,
    },
    true,
  )
}

// 加载所有数据
async function refreshData(context: KeepAliveRefreshContext = {}) {
  await fetchInstalledPlugins(context)
  await fetchUninstalledPlugins(false, context)
  await getPluginMarketMetrics()
  // 重新加载文件夹配置，确保分身插件能正确显示在文件夹中
  await loadPluginFolders()
}

/** 只有列表、评分和统计均来自同一轮请求时才发布市场快照。 */
async function refreshMarketData(
  force = false,
  context: KeepAliveRefreshContext = {},
  resetScroll = false,
): Promise<boolean> {
  const marketResponse = await fetchUninstalledPlugins(force, context, false)
  if (!marketResponse) return false

  const metrics = await getPluginMarketMetrics(marketResponse, false)
  if (metrics.statistics === undefined || metrics.ratings === undefined) {
    if (!isAppMarketLoaded.value) marketLoadError.value = true
    console.warn('插件市场指标快照不完整，保留上一份市场数据')
    return false
  }

  applyMarketSnapshot(marketResponse, {
    statistics: metrics.statistics,
    ratings: metrics.ratings,
  })
  if (resetScroll) {
    marketVisibleCount.value = marketPageSize
    tabScrollPositions.market = 0
  }
  return true
}

// 对uninstalledList进行排序到sortedUninstalledList
watch([marketList, filterForm, activeSort, PluginStatistics, PluginRatings], () => {
  // 匹配过滤函数
  const match = (filter: Array<string>, value: unknown) => {
    const text = normalizeMarketText(value).trim()

    return filter.length === 0 || (!!text && filter.includes(text))
  }
  const matchMultiple = (filter: Array<string>, value: unknown) =>
    filter.length === 0 || splitMarketValues(value).some(v => filter.includes(v))
  const filterText = (filter: string, value: unknown) => {
    const text = normalizeMarketText(value).toLowerCase()

    return !filter || (!!text && text.includes(filter.toLowerCase()))
  }

  sortedUninstalledList.value = []

  // 过滤
  marketList.value.forEach(value => {
    if (value) {
      if (
        filterText(
          filterForm.name,
          `${normalizeMarketText(value.plugin_name)} ${normalizeMarketText(value.plugin_desc)}`,
        ) &&
        match(filterForm.author, value.plugin_author) &&
        matchMultiple(filterForm.label, value.plugin_label) &&
        match(filterForm.repo, handleRepoUrl(value))
      ) {
        sortedUninstalledList.value.push(value)
      }
    }
  })

  // 排序
  const sortKey = activeSort.value || 'count'
  if (sortKey === 'count') {
    sortedUninstalledList.value = sortedUninstalledList.value.sort((a, b) => {
      return (PluginStatistics.value[b.id || '0'] ?? 0) - (PluginStatistics.value[a.id || '0'] ?? 0)
    })
  } else if (sortKey === 'average_rating') {
    sortedUninstalledList.value = sortedUninstalledList.value.sort((a, b) => {
      const aRating = PluginRatings.value[a.id]?.average_rating ?? a.average_rating ?? 0
      const bRating = PluginRatings.value[b.id]?.average_rating ?? b.average_rating ?? 0
      return bRating - aRating
    })
  } else {
    sortedUninstalledList.value = sortedUninstalledList.value.sort((a, b) => {
      if (sortKey === 'add_time') {
        return a.add_time !== undefined && b.add_time !== undefined && a.add_time > b.add_time ? 1 : -1
      }

      const aValue = a[sortKey]
      const bValue = b[sortKey]
      return aValue !== undefined && bValue !== undefined && aValue > bValue ? 1 : -1
    })
  }

  // 静默刷新和排序只替换完整快照，保留用户已经展开的页数。
  marketVisibleCount.value = Math.max(
    marketPageSize,
    Math.min(marketVisibleCount.value, sortedUninstalledList.value.length),
  )
})

// 新安装了插件
async function pluginInstalled() {
  pluginDialogClose()
  await refreshData()
  await pluginSidebarNavStore.ensureSidebarNav(true)
}

// 插件市场设置完成
function marketSettingDone() {
  // 重新加载数据
  refreshData()
}

// 手动刷新插件市场
async function refreshMarket() {
  if (isMarketRefreshing.value) return

  isMarketRefreshing.value = true
  try {
    const refreshed = await refreshMarketData(true, { silent: false, source: 'manual' }, true)
    if (!refreshed) return

    await nextTick()
    window.scrollTo({ behavior: 'auto', top: 0 })
  } catch (error) {
    console.error(error)
  } finally {
    isMarketRefreshing.value = false
  }
}

async function refreshActiveTabData(context: KeepAliveRefreshContext = {}) {
  if (sortMode.value || isDraggingSortMode.value) return

  if (activeTab.value === 'market') {
    await fetchUninstalledPlugins(false, context)
    await getPluginMarketMetrics()
    return
  }

  await fetchInstalledPlugins(context)
  await fetchUninstalledPlugins(false, context)
  await getPluginMarketMetrics()
  // 文件夹配置可能在其它入口被插件操作改变，重新进入时同步一次。
  await loadPluginFolders()
}

// 处理掉github地址的前缀
function handleRepoUrl(item: Plugin | string | undefined) {
  const url = typeof item === 'string' ? item : normalizeMarketText(item?.repo_url)
  if (!url) return ''
  if (isLocalRepoSource(item)) return localRepoLabel.value
  return url.replace('https://github.com/', '').replace('https://raw.githubusercontent.com/', '')
}

// 监测dataList变化或installedFilter、hasUpdateFilter变化时更新filteredDataList
watch([dataList, installedFilter, hasUpdateFilter, enabledFilter], () => {
  filteredDataList.value = dataList.value.filter(item => {
    if (!installedFilter.value && !hasUpdateFilter.value && !enabledFilter.value) return true
    if (hasUpdateFilter.value && enabledFilter.value) {
      return item.has_update && item.state
    }
    if (hasUpdateFilter.value) return item.has_update
    if (enabledFilter.value) return item.state
    if (installedFilter.value) {
      return item.plugin_name?.toLowerCase().includes((installedFilter.value as string).toLowerCase())
    }
    return true
  })
})

// 插件市场加载更多数据
function loadMarketMore({ done }: { done: (status: 'ok' | 'empty' | 'loading' | 'error') => void }) {
  if (marketVisibleCount.value >= sortedUninstalledList.value.length) {
    done('empty')
    return
  }

  marketVisibleCount.value = Math.min(marketVisibleCount.value + marketPageSize, sortedUninstalledList.value.length)
  done('ok')
}

// 组件挂载后

onMounted(async () => {
  isPluginPageActive.value = true
  await loadPluginOrderConfig()
  await loadPluginFolders() // 加载文件夹配置
  await refreshData()
  if (userStore.superUser) await pluginRuntimeStore.refresh()
  if (activeTab.value != 'market' && pluginId.value) {
    // 找到这个插件
    const plugin = dataList.value.find(item => item.id === pluginId.value)
    if (plugin) {
      plugin.page_open = true
    }
  }
})

useKeepAliveRefresh(refreshActiveTabData)

watch(activeTab, (newTab, oldTab) => {
  if (!oldTab || newTab === oldTab || (newTab !== 'installed' && newTab !== 'market')) return

  if (oldTab === 'installed' || oldTab === 'market') {
    tabScrollPositions[oldTab] = window.scrollY
  }

  const generation = ++tabScrollRestoreGeneration
  void nextTick().then(() => {
    if (generation !== tabScrollRestoreGeneration) return
    window.scrollTo({ behavior: 'auto', top: tabScrollPositions[newTab] })
  })

  if (newTab === 'installed' && isPluginPageActive.value && !document.hidden) {
    void reconcileInstalledRuntime()
  }
})

watch(
  () => pluginRuntimeStore.reconciliation,
  () => {
    if (isPluginPageActive.value && activeTab.value === 'installed' && !document.hidden) {
      void reconcileInstalledRuntime()
    }
  },
)

onActivated(() => {
  isPluginPageActive.value = true
  if (activeTab.value === 'installed' && !document.hidden) {
    void reconcileInstalledRuntime()
  }
})

onDeactivated(() => {
  isPluginPageActive.value = false
})

onUnmounted(() => {
  isPluginPageActive.value = false
  folderCreateDialogController?.close()
  searchDialogController?.close()
})

function openPluginSearchDialog() {
  searchDialogController = openSharedDialog(
    PluginSearchDialog,
    {
      keyword: keyword.value,
      plugins: filterPlugins.value,
    },
    {
      'open-plugin': openPlugin,
      'update:keyword': (value: string) => {
        keyword.value = value
        searchDialogController?.updateProps({ keyword: value, plugins: filterPlugins.value })
      },
    },
    { closeOn: ['close'] },
  )
}

function openMarketSettingDialog() {
  openSharedDialog(
    PluginMarketSettingDialog,
    {},
    {
      changed: marketSettingDone,
      save: marketSettingDone,
    },
    { closeOn: ['close', 'save'] },
  )
}

const showSearchAction = computed(() => activeTab.value === 'installed' || activeTab.value === 'market')
const canAdmin = computed(() =>
  hasPermission(buildUserPermissionContext(userStore.superUser, userStore.permissions), 'admin'),
)
const showNewFolderAction = computed(() => activeTab.value === 'installed' && !currentFolder.value && canAdmin.value)
const showMarketSettingAction = computed(() => activeTab.value === 'market' && canAdmin.value)

const pluginDynamicMenuItems = computed(() => {
  if (!appMode.value) return undefined
  if (!showSearchAction.value) return undefined

  const items: DynamicButtonMenuItem[] = [
    {
      titleKey: 'plugin.searchPlugins',
      icon: 'mdi-magnify',
      permission: 'admin',
      action: openPluginSearchDialog,
    },
  ]

  if (showNewFolderAction.value) {
    items.push({
      titleKey: 'plugin.newFolder',
      icon: 'mdi-folder-plus',
      permission: 'admin',
      action: showNewFolderDialog,
    })
  }

  if (showMarketSettingAction.value) {
    items.push({
      titleKey: 'dialog.pluginMarketSetting.title',
      icon: 'mdi-store-cog',
      permission: 'admin',
      action: openMarketSettingDialog,
    })
  }

  return items.length > 1 ? items : undefined
})

useDynamicButton({
  icon: 'mdi-magnify',
  onClick: openPluginSearchDialog,
  menuItems: pluginDynamicMenuItems,
  permission: 'admin',
  show: computed(() => appMode.value && showSearchAction.value && isRefreshed.value),
})

// 获取插件文件夹配置
async function loadPluginFolders() {
  try {
    const foldersData = await api.get<
      Record<string, string[] | Partial<PluginFolderConfig>>,
      Record<string, string[] | Partial<PluginFolderConfig>>
    >('plugin/folders')

    // 处理旧格式兼容性（array）和新格式（object with config）
    const processedFolders: Record<string, PluginFolderConfig> = {}
    const order: string[] = []

    Object.keys(foldersData).forEach(folderName => {
      const folderData = foldersData[folderName]

      if (Array.isArray(folderData)) {
        // 旧格式：直接是插件数组
        processedFolders[folderName] = {
          plugins: folderData,
          order: order.length,
          icon: defaultIcon,
          color: defaultColor,
          gradient: defaultGradient,
          background: '',
          showIcon: true,
        }
      } else if (folderData && typeof folderData === 'object') {
        // 新格式：包含配置的对象
        processedFolders[folderName] = {
          plugins: folderData.plugins || [],
          order: folderData.order ?? order.length,
          icon: folderData.icon || defaultIcon,
          color: folderData.color || defaultColor,
          gradient: folderData.gradient || defaultGradient,
          background: folderData.background || '',
          showIcon: folderData.showIcon !== undefined ? folderData.showIcon : true,
        }
      }

      order.push(folderName)
    })

    pluginFolders.value = processedFolders

    // 设置文件夹排序 - 使用全局排序配置
    const folderNames = Object.keys(processedFolders)
    folderOrder.value = folderNames.sort((a, b) => {
      const aOrder = orderValueMap.value.get(`folder:${a}`) ?? processedFolders[a].order ?? 999
      const bOrder = orderValueMap.value.get(`folder:${b}`) ?? processedFolders[b].order ?? 999

      return aOrder - bOrder
    })
  } catch (error) {
    console.error(error)
    pluginFolders.value = {}
    folderOrder.value = []
  }
}

// 保存插件文件夹配置
async function savePluginFolders() {
  const foldersToSave: Record<string, PluginFolderConfig> = {}
  Object.keys(pluginFolders.value).forEach(folderName => {
    const folderData = pluginFolders.value[folderName]
    const orderIndex = folderOrder.value.indexOf(folderName)
    const normalizedFolder = Array.isArray(folderData)
      ? {
          plugins: [...folderData],
          order: orderIndex,
          icon: defaultIcon,
          color: defaultColor,
          gradient: defaultGradient,
          background: '',
          showIcon: true,
        }
      : folderData

    foldersToSave[folderName] = {
      ...normalizedFolder,
      order: orderIndex >= 0 ? orderIndex : 999,
    }
  })

  await api.post('plugin/folders', foldersToSave, { feedback: 'silent' })
}

// 创建新文件夹
async function createNewFolder() {
  const folderName = newFolderName.value.trim()
  if (!folderName) {
    $toast.error(t('plugin.folderNameEmpty'))
    return
  }

  if (pluginFolders.value[folderName]) {
    $toast.error(t('plugin.folderExists'))
    return
  }

  const snapshot = captureFolderState()

  try {
    // 直接在本地添加文件夹
    pluginFolders.value[folderName] = {
      plugins: [],
      order: folderOrder.value.length,
      icon: defaultIcon,
      color: defaultColor,
      gradient: defaultGradient,
      background: '',
      showIcon: true,
    }

    // 添加到排序列表
    folderOrder.value.push(folderName)

    // 保存到后端
    await savePluginFolders()

    folderCreateDialogController?.close()
    folderCreateDialogController = null
    newFolderName.value = ''
    $toast.success(t('plugin.folderCreateSuccess'))
  } catch (error) {
    console.error(error)
    restoreFolderState(snapshot)
    $toast.error(t('plugin.operationFailed'))
  }
}

// 打开文件夹
function openFolder(folderName: string) {
  currentFolder.value = folderName
}

// 返回主列表
function backToMain() {
  currentFolder.value = ''
}

// 重命名文件夹
async function renameFolder(oldName: string, newName: string) {
  if (pluginFolders.value[newName]) {
    $toast.error(t('plugin.folderExists'))
    return
  }

  const snapshot = captureFolderState()
  try {
    // 更新本地状态
    const folderData = pluginFolders.value[oldName] || { plugins: [] }
    pluginFolders.value[newName] = folderData
    delete pluginFolders.value[oldName]

    // 更新排序列表
    const orderIndex = folderOrder.value.indexOf(oldName)
    if (orderIndex >= 0) {
      folderOrder.value[orderIndex] = newName
    }

    // 如果正在查看该文件夹，更新当前文件夹名
    if (currentFolder.value === oldName) {
      currentFolder.value = newName
    }

    // 保存到后端
    await savePluginFolders()

    $toast.success(t('plugin.folderRenameSuccess'))
  } catch (error) {
    console.error(error)
    restoreFolderState(snapshot)
    $toast.error(t('plugin.folderRenameFailed'))
  }
}

// 删除文件夹
async function deleteFolder(folderName: string) {
  const snapshot = captureFolderState()
  try {
    delete pluginFolders.value[folderName]

    // 从排序列表中移除
    folderOrder.value = folderOrder.value.filter(name => name !== folderName)

    // 如果正在查看该文件夹，返回主列表
    if (currentFolder.value === folderName) {
      currentFolder.value = ''
    }

    // 保存到后端
    await savePluginFolders()

    $toast.success(t('plugin.folderDeleteSuccess'))
  } catch (error) {
    console.error(error)
    restoreFolderState(snapshot)
    $toast.error(t('plugin.folderDeleteFailed'))
  }
}

// 显示新建文件夹对话框
function showNewFolderDialog() {
  newFolderName.value = ''
  folderCreateDialogController = openSharedDialog(
    PluginFolderCreateDialog,
    { name: newFolderName.value },
    {
      create: createNewFolder,
      'update:name': (value: string) => {
        newFolderName.value = value
        folderCreateDialogController?.updateProps({ name: value })
      },
    },
    { closeOn: ['close'] },
  )
}

// 移出文件夹
async function removeFromFolder(pluginId: string) {
  if (!currentFolder.value) return

  const snapshot = captureFolderState()
  try {
    // 从当前文件夹中移除插件
    const folderData = pluginFolders.value[currentFolder.value]
    const plugins = Array.isArray(folderData) ? folderData : folderData?.plugins || []
    const index = plugins.indexOf(pluginId)
    if (index > -1) {
      plugins.splice(index, 1)
      if (!Array.isArray(folderData)) {
        folderData.plugins = plugins
      }

      // 保存配置
      await savePluginFolders()

      $toast.success(t('plugin.removeFromFolderSuccess'))
    }
  } catch (error) {
    console.error(error)
    restoreFolderState(snapshot)
    $toast.error(t('plugin.operationFailed'))
  }
}

// 更新文件夹配置
async function updateFolderConfig(folderName: string, config: Partial<PluginFolderConfig>) {
  const snapshot = captureFolderState()
  try {
    // 更新本地配置
    if (pluginFolders.value[folderName]) {
      pluginFolders.value[folderName] = {
        ...pluginFolders.value[folderName],
        ...config,
      }

      // 保存到后端
      await savePluginFolders()
      $toast.success(t('folder.folderSettingsSaved'))
    }
  } catch (error) {
    console.error(error)
    restoreFolderState(snapshot)
    $toast.error(t('plugin.saveFolderConfigFailed'))
  }
}

// 当前拖拽的插件ID
const currentDraggedPluginId = ref('')

// 处理拖拽到文件夹的事件
async function handleDropToFolder(event: DragEvent, folderName: string) {
  event.preventDefault()
  event.stopPropagation()
  const target = event.currentTarget as HTMLElement
  target.classList.remove('drag-over')

  // 使用跟踪的插件ID
  const pluginId = currentDraggedPluginId.value

  if (!pluginId) {
    return
  }

  const snapshot = captureFolderState()
  try {
    // 检查是否是文件夹名（忽略文件夹拖入文件夹的情况）
    if (Object.keys(pluginFolders.value).includes(pluginId)) {
      return
    }

    // 验证插件ID
    const plugin = pluginByIdMap.value.get(pluginId)

    if (!plugin) {
      return
    }

    // 获取目标文件夹数据
    const targetFolderData = pluginFolders.value[folderName] || { plugins: [] }
    const targetPlugins = Array.isArray(targetFolderData) ? targetFolderData : targetFolderData.plugins || []

    // 检查插件是否已在此文件夹中
    if (targetPlugins.includes(pluginId)) {
      $toast.warning('插件已在此文件夹中')
      return
    }

    // 从其他文件夹中移除该插件
    Object.keys(pluginFolders.value).forEach(fname => {
      if (fname !== folderName) {
        const folderData = pluginFolders.value[fname]
        const plugins = Array.isArray(folderData) ? folderData : folderData.plugins || []
        const index = plugins.indexOf(pluginId)
        if (index > -1) {
          plugins.splice(index, 1)
          if (!Array.isArray(folderData)) {
            folderData.plugins = plugins
          }
        }
      }
    })

    // 从主列表中移除（如果存在）
    const mainIndex = mixedSortList.value.findIndex(item => item.type === 'plugin' && item.id === pluginId)
    if (mainIndex > -1) {
      mixedSortList.value.splice(mainIndex, 1)
    }

    // 添加到目标文件夹
    if (!pluginFolders.value[folderName]) {
      pluginFolders.value[folderName] = {
        plugins: [],
        order: folderOrder.value.length,
        icon: defaultIcon,
        color: defaultColor,
        gradient: defaultGradient,
        background: '',
        showIcon: true,
      }
    }

    const targetFolder = pluginFolders.value[folderName]
    if (Array.isArray(targetFolder)) {
      targetFolder.push(pluginId)
    } else {
      targetFolder.plugins = targetFolder.plugins || []
      targetFolder.plugins.push(pluginId)
    }

    // 保存配置
    await savePluginFolders()

    // 更新混合排序列表
    updateMixedSortList()

    $toast.success(`插件已移动到文件夹 "${folderName}"`)
  } catch (error) {
    console.error(error)
    restoreFolderState(snapshot)
    isDraggingSortMode.value = false
    currentDraggedPluginId.value = ''
    updateMixedSortList()
    $toast.error('操作失败')
  }
}

// 记录拖拽起点对应的插件 ID
function onDragStartPlugin(evt: { oldIndex?: number; item?: HTMLElement }) {
  // 设置拖拽模式标志
  isDraggingSortMode.value = true

  // 从oldIndex获取插件ID
  const oldIndex = evt.oldIndex
  if (oldIndex !== undefined) {
    if (currentFolder.value) {
      const plugin = draggableFolderPlugins.value[oldIndex]
      if (plugin && plugin.id) {
        currentDraggedPluginId.value = plugin.id
        return
      }
    } else {
      const item = mixedSortList.value[oldIndex]
      if (item && item.id) {
        currentDraggedPluginId.value = item.id
        return
      }
    }
  }

  // 从拖拽元素获取
  const item = evt.item
  if (item && item.dataset && item.dataset.pluginId) {
    currentDraggedPluginId.value = item.dataset.pluginId
    return
  }

  // 查找data-plugin-id属性
  const pluginCard = item?.querySelector('[data-plugin-id]')
  if (pluginCard) {
    currentDraggedPluginId.value = pluginCard.getAttribute('data-plugin-id') || ''
    return
  }

  // 直接从元素属性获取
  if (item && item.getAttribute && item.getAttribute('data-plugin-id')) {
    currentDraggedPluginId.value = item.getAttribute('data-plugin-id') || ''
  }
}
</script>

<template>
  <div>
    <!-- 已安装插件过滤下拉菜单 -->
    <Teleport to="body" v-if="filterInstalledPluginDialog">
      <VMenu
        v-model="filterInstalledPluginDialog"
        :close-on-content-click="false"
        :activator="'[data-menu-activator=installed-filter-btn]'"
        location="bottom end"
      >
        <VCard min-width="220">
          <!-- 名称搜索 -->
          <div class="pa-3">
            <VCombobox
              v-model="installedFilter"
              :items="installedPluginNames"
              :placeholder="t('plugin.name')"
              prepend-inner-icon="mdi-magnify"
              density="compact"
              variant="outlined"
              hide-details
              clearable
              @keyup.enter="submitInstalledNameFilter"
            />
          </div>
          <VDivider class="mt-2" />
          <!-- 快捷筛选 -->
          <VList density="compact" class="px-2 py-1">
            <VListSubheader>{{ t('common.filter') }}</VListSubheader>
            <VListItem :active="enabledFilter" @click="toggleEnabledInstalledFilter" density="compact">
              <template #prepend>
                <VIcon icon="mdi-play-circle" color="success" size="small" />
              </template>
              <VListItemTitle>{{ t('plugin.running') }}</VListItemTitle>
              <template #append>
                <VIcon v-if="enabledFilter" icon="mdi-check" color="primary" size="small" />
              </template>
            </VListItem>
            <VListItem :active="hasUpdateFilter" @click="toggleHasUpdateInstalledFilter" density="compact">
              <template #prepend>
                <VIcon icon="mdi-arrow-up-circle" color="info" size="small" />
              </template>
              <VListItemTitle>{{ t('plugin.hasNewVersion') }}</VListItemTitle>
              <template #append>
                <VIcon v-if="hasUpdateFilter" icon="mdi-check" color="primary" size="small" />
              </template>
            </VListItem>
          </VList>
        </VCard>
      </VMenu>
    </Teleport>

    <!-- 插件市场过滤下拉菜单 -->
    <Teleport to="body" v-if="filterMarketPluginDialog">
      <VMenu
        v-model="filterMarketPluginDialog"
        :close-on-content-click="false"
        :activator="'[data-menu-activator=market-filter-btn]'"
        location="bottom end"
      >
        <VCard min-width="260" max-width="320">
          <!-- 名称搜索 -->
          <div class="pa-3">
            <VTextField
              v-model="filterForm.name"
              :placeholder="t('plugin.name')"
              prepend-inner-icon="mdi-magnify"
              density="compact"
              variant="outlined"
              hide-details
              clearable
              @keyup.enter="submitMarketNameFilter"
            />
          </div>
          <VDivider class="mt-2" />
          <!-- 排序 -->
          <VList density="compact" class="px-2 py-1">
            <VListSubheader>{{ t('plugin.sortTitle') }}</VListSubheader>
            <VListItem
              v-for="option in sortOptions"
              :key="option.value"
              :active="(activeSort || 'count') === option.value"
              @click="selectMarketSort(option.value)"
              density="compact"
            >
              <VListItemTitle>{{ option.title }}</VListItemTitle>
              <template #append>
                <VIcon v-if="(activeSort || 'count') === option.value" icon="mdi-check" color="primary" size="small" />
              </template>
            </VListItem>
          </VList>
          <!-- 下拉多选筛选项 -->
          <VDivider />
          <VList density="compact" class="market-filter-options-list px-2 py-1">
            <VListSubheader>{{ t('common.filter') }}</VListSubheader>
            <VListItem>
              <VSelect
                v-if="authorFilterOptions.length > 0"
                v-model="filterForm.author"
                :items="authorFilterOptions"
                :label="t('plugin.author')"
                mobile-control-width="75%"
                multiple
                chips
                closable-chips
                density="compact"
                variant="outlined"
                hide-details
                clearable
              />
            </VListItem>
            <VListItem>
              <VSelect
                v-if="labelFilterOptions.length > 0"
                v-model="filterForm.label"
                :items="labelFilterOptions"
                :label="t('plugin.label')"
                mobile-control-width="75%"
                multiple
                chips
                closable-chips
                density="compact"
                variant="outlined"
                hide-details
                clearable
              />
            </VListItem>
            <VListItem>
              <VSelect
                v-if="repoFilterOptions.length > 0"
                v-model="filterForm.repo"
                :items="repoFilterOptions"
                :label="t('plugin.repository')"
                mobile-control-width="75%"
                multiple
                chips
                closable-chips
                density="compact"
                variant="outlined"
                hide-details
                clearable
              />
            </VListItem>
          </VList>
        </VCard>
      </VMenu>
    </Teleport>

    <VWindow v-model="activeTab" class="disable-tab-transition px-2" :touch="false">
      <!-- 我的插件 -->
      <VWindowItem value="installed">
        <div>
          <VPageContentTitle v-if="installedFilter" :title="t('plugin.filter', { name: installedFilter })" />
          <LoadingBanner v-if="!isRefreshed && !installedLoadError" class="mt-12" />
          <NoDataFound
            v-if="installedLoadError && !isRefreshed"
            error-code="500"
            :error-title="t('common.serverConnectionFailed')"
            :error-description="t('common.troubleshooting')"
          >
            <template #button>
              <VBtn color="primary" variant="tonal" @click="refreshData()">
                {{ t('common.retry') }}
              </VBtn>
            </template>
          </NoDataFound>
          <VAlert v-if="sortMode" color="warning" variant="tonal" class="mb-4 py-0 app-surface-static">
            <div class="d-flex flex-wrap align-center justify-space-between gap-2 py-5">
              <span>{{ t('common.sortModeHint') }}</span>
              <VBtn variant="tonal" color="error" @click="sortMode = false">
                {{ t('common.exit') }}
              </VBtn>
            </div>
          </VAlert>

          <!-- 文件夹和插件网格 -->
          <div v-if="(mixedSortList.length > 0 || displayedPlugins.length > 0) && isRefreshed">
            <!-- 混合排序列表（文件夹和插件） -->
            <template v-if="!currentFolder">
              <!-- 主列表：使用draggable进行混合排序 -->
              <Draggable
                v-if="canDragSort"
                v-model="mixedSortList"
                @end="saveMixedSortOrder"
                @start="onDragStartPlugin"
                item-key="id"
                tag="div"
                class="grid gap-4 grid-plugin-card"
                group="mixed"
              >
                <template #item="{ element }">
                  <PluginMixedSortCard
                    :item="element"
                    :plugin-statistics="PluginStatistics"
                    :plugin-actions="pluginActions"
                    :runtime-settling="isPluginRuntimeSettling(element.id)"
                    :sortable="true"
                    @open-folder="openFolder"
                    @delete-folder="deleteFolder"
                    @rename-folder="(oldName, newName) => renameFolder(oldName, newName)"
                    @update-folder-config="(folderName, config) => updateFolderConfig(folderName, config)"
                    @refresh-data="refreshData"
                    @rating="applyPluginRating"
                    @action-done="
                      pluginId => {
                        pluginActions[pluginId] = false
                      }
                    "
                    @drop-to-folder="(event, folderName) => handleDropToFolder(event, folderName)"
                  />
                </template>
              </Draggable>
              <ProgressiveCardGrid
                v-else-if="shouldVirtualizeInstalledMainList"
                :items="mixedSortList"
                :get-item-key="item => `${item.type}:${item.id}`"
                :min-item-width="256"
                :estimated-item-height="180"
                :scroll-to-index="installedScrollToIndex"
              >
                <template #default="{ item }">
                  <PluginMixedSortCard
                    :item="item"
                    :plugin-statistics="PluginStatistics"
                    :plugin-actions="pluginActions"
                    :runtime-settling="isPluginRuntimeSettling(item.id)"
                    :sortable="false"
                    @open-folder="openFolder"
                    @delete-folder="deleteFolder"
                    @rename-folder="(oldName, newName) => renameFolder(oldName, newName)"
                    @update-folder-config="(folderName, config) => updateFolderConfig(folderName, config)"
                    @refresh-data="refreshData"
                    @rating="applyPluginRating"
                    @action-done="
                      pluginId => {
                        pluginActions[pluginId] = false
                      }
                    "
                    @drop-to-folder="(event, folderName) => handleDropToFolder(event, folderName)"
                  />
                </template>
              </ProgressiveCardGrid>
            </template>

            <template v-else>
              <!-- 文件夹内：使用draggable排序 + 移出按钮 -->
              <Draggable
                v-if="canDragSort"
                v-model="draggableFolderPlugins"
                @end="saveFolderPluginOrder"
                @start="onDragStartPlugin"
                item-key="id"
                tag="div"
                class="grid gap-4 grid-plugin-card"
                group="plugins"
              >
                <template #item="{ element }">
                  <PluginMixedSortCard
                    :item="{ type: 'plugin', id: element.id, data: element, order: 0 }"
                    :plugin-statistics="PluginStatistics"
                    :plugin-actions="pluginActions"
                    :runtime-settling="isPluginRuntimeSettling(element.id)"
                    :sortable="true"
                    :show-remove-button="true"
                    @refresh-data="refreshData"
                    @rating="applyPluginRating"
                    @action-done="
                      pluginId => {
                        pluginActions[pluginId] = false
                      }
                    "
                    @remove-from-folder="removeFromFolder"
                  />
                </template>
              </Draggable>
              <ProgressiveCardGrid
                v-else-if="shouldVirtualizeInstalledFolderList"
                :items="draggableFolderPlugins"
                :get-item-key="item => item.id"
                :min-item-width="256"
                :estimated-item-height="180"
              >
                <template #default="{ item }">
                  <PluginMixedSortCard
                    :item="{ type: 'plugin', id: item.id, data: item, order: 0 }"
                    :plugin-statistics="PluginStatistics"
                    :plugin-actions="pluginActions"
                    :runtime-settling="isPluginRuntimeSettling(item.id)"
                    :sortable="false"
                    :show-remove-button="true"
                    @refresh-data="refreshData"
                    @rating="applyPluginRating"
                    @action-done="
                      pluginId => {
                        pluginActions[pluginId] = false
                      }
                    "
                    @remove-from-folder="removeFromFolder"
                  />
                </template>
              </ProgressiveCardGrid>
            </template>
          </div>

          <NoDataFound
            v-if="displayedFolders.length === 0 && displayedPlugins.length === 0 && isRefreshed"
            error-code="404"
            :error-title="t('common.noData')"
            :error-description="
              installedFilter || hasUpdateFilter ? t('plugin.noMatchingContent') : t('plugin.pleaseInstallFromMarket')
            "
          />
        </div>
      </VWindowItem>
      <!-- 插件市场 -->
      <VWindowItem value="market">
        <div>
          <LoadingBanner
            v-if="
              (!isAppMarketLoaded && !marketLoadError) || (isMarketRefreshing && displayUninstalledList.length === 0)
            "
            class="mt-12"
          />
          <NoDataFound
            v-if="marketLoadError && !isAppMarketLoaded"
            error-code="500"
            :error-title="t('common.serverConnectionFailed')"
            :error-description="t('common.troubleshooting')"
          >
            <template #button>
              <VBtn color="primary" variant="tonal" @click="refreshMarket()">
                {{ t('common.retry') }}
              </VBtn>
            </template>
          </NoDataFound>
          <!-- 资源列表 -->
          <VInfiniteScroll
            v-if="isAppMarketLoaded && !(isMarketRefreshing && displayUninstalledList.length === 0)"
            mode="intersect"
            side="end"
            :items="displayUninstalledList"
            @load="loadMarketMore"
            class="overflow-visible"
          >
            <template #loading />
            <template #empty />
            <ProgressiveCardGrid
              v-if="displayUninstalledList.length > 0"
              :items="displayUninstalledList"
              :get-item-key="item => item.id"
              :min-item-width="256"
              :estimated-item-height="260"
            >
              <template #default="{ item }">
                <PluginAppCard
                  :plugin="item"
                  :count="PluginStatistics[item.id || '0']"
                  :install-handler="(releaseVersion, repoUrl) => installPlugin(item, releaseVersion, repoUrl)"
                  @install="pluginInstalled"
                />
              </template>
            </ProgressiveCardGrid>
          </VInfiniteScroll>
          <NoDataFound
            v-if="displayUninstalledList.length === 0 && isAppMarketLoaded"
            error-code="404"
            :error-title="t('common.noData')"
            :error-description="t('plugin.allPluginsInstalled')"
          />
        </div>
      </VWindowItem>
    </VWindow>
  </div>

  <!-- 插件搜索图标 -->
  <Teleport to="body" v-if="route.path === '/plugins'">
    <div v-if="isRefreshed && !appMode && showSearchAction && canAdmin" class="compact-fab-stack">
      <VFab
        v-if="showMarketSettingAction"
        icon="mdi-store-cog"
        color="warning"
        variant="tonal"
        appear
        class="compact-fab compact-fab--secondary"
        @click="openMarketSettingDialog"
      />
      <VFab
        v-if="showNewFolderAction"
        icon="mdi-folder-plus"
        color="success"
        variant="tonal"
        appear
        class="compact-fab compact-fab--secondary"
        @click="showNewFolderDialog"
      />
      <VFab
        icon="mdi-magnify"
        color="primary"
        appear
        class="compact-fab compact-fab--primary"
        @click="openPluginSearchDialog"
      />
    </div>
  </Teleport>
</template>

<style scoped lang="scss">
/* stylelint-disable selector-pseudo-class-no-unknown */

@media (width < 960px) {
  // 弹出菜单使用紧凑录入行，避免叠加全局移动表单高度与列表项纵向留白。
  .market-filter-options-list :deep(.v-list-item) {
    padding-block: 0;
  }

  .market-filter-options-list :deep(.app-responsive-input) {
    min-block-size: 3rem;
    padding-block: 0.125rem;
  }
}
</style>
