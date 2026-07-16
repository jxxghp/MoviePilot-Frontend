<script lang="ts" setup>
import { useToast } from 'vue-toastification'
import api from '@/api'
import type { Plugin } from '@/api/types'
import NoDataFound from '@/components/states/NoDataFound.vue'
import { useDisplay } from 'vuetify'
import { isNullOrEmptyObject } from '@/@core/utils'
import { getPluginTabs } from '@/router/i18n-menu'
import { useDynamicButton, type DynamicButtonMenuItem } from '@/composables/useDynamicButton'
import { useI18n } from 'vue-i18n'
import PluginMixedSortCard from '@/components/cards/PluginMixedSortCard.vue'
import ProgressiveCardGrid from '@/components/misc/ProgressiveCardGrid.vue'
import { usePWA } from '@/composables/usePWA'
import { useDynamicHeaderTab } from '@/composables/useDynamicHeaderTab'
import { useKeepAliveRefresh, type KeepAliveRefreshContext } from '@/composables/useKeepAliveRefresh'
import { openSharedDialog } from '@/composables/useSharedDialog'
import { useUserStore } from '@/stores'
import { buildUserPermissionContext, hasPermission } from '@/utils/permission'

// 国际化
const { t } = useI18n()

const route = useRoute()
const userStore = useUserStore()

// 市场卡片、拖拽排序和市场设置只在对应标签/操作中需要，延迟到真正使用时加载。
const Draggable = defineAsyncComponent(() => import('vuedraggable').then(module => module.default))
const PluginAppCard = defineAsyncComponent(() => import('@/components/cards/PluginAppCard.vue'))
const PluginFolderCreateDialog = defineAsyncComponent(() => import('@/components/dialog/PluginFolderCreateDialog.vue'))
const PluginMarketSettingDialog = defineAsyncComponent(
  () => import('@/components/dialog/PluginMarketSettingDialog.vue'),
)
const ProgressDialog = defineAsyncComponent(() => import('@/components/dialog/ProgressDialog.vue'))
const PluginSearchDialog = defineAsyncComponent(() => import('@/components/dialog/PluginSearchDialog.vue'))

// 显示器宽度
const display = useDisplay()

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

// 当前排序字段
const activeSort = ref<string | null>(null)

// 插件顺序配置
const orderConfig = ref<{ id: string; type?: string; order?: number }[]>([])

// 排序选项
const sortOptions = computed(() => [
  { title: t('plugin.sort.popular'), value: 'count' },
  { title: t('plugin.sort.name'), value: 'plugin_name' },
  { title: t('plugin.sort.author'), value: 'plugin_author' },
  { title: t('plugin.sort.repository'), value: 'repo_url' },
  { title: t('plugin.sort.latest'), value: 'add_time' },
])

// 加载中
const loading = ref(false)

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
const displayUninstalledList = ref<Plugin[]>([])

// 是否刷新过
const isRefreshed = ref(false)

// APP市场是否加载完成
const isAppMarketLoaded = ref(false)

// APP市场窗口
const PluginAppDialog = ref(false)

// 插件安装统计
const PluginStatistics = ref<{ [key: string]: number }>({})

// 插件市场刷新状态
const isMarketRefreshing = ref(false)

// 搜索关键字
const keyword = ref('')

// 每一个插件的动作标识
const pluginActions: Ref<{ [key: string]: boolean }> = ref({})

// 提示框
const $toast = useToast()

// 进度框文本
const progressText = ref(t('plugin.installingPlugin'))
let folderCreateDialogController: ReturnType<typeof openSharedDialog> | null = null
let progressDialogController: ReturnType<typeof openSharedDialog> | null = null
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

// 切换市场过滤器多选项
function toggleMarketFilter(field: 'author' | 'label' | 'repo', value: string) {
  const index = filterForm[field].indexOf(value)
  if (index > -1) {
    filterForm[field].splice(index, 1)
  } else {
    filterForm[field].push(value)
  }
}

// 关闭插件市场过滤菜单。
function closeMarketFilterMenu() {
  filterMarketPluginDialog.value = false
}

// 选择插件市场排序项并关闭过滤菜单。
function selectMarketSort(value: string) {
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
const pluginFolders: Ref<{ [key: string]: any }> = ref({})

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
  if (sortMode.value || currentFolder.value || !pluginId.value) {
    return undefined
  }

  const targetIndex = mixedSortList.value.findIndex(item => item.type === 'plugin' && item.id === pluginId.value)

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
  data: any
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
    const allItems: { type: 'folder' | 'plugin'; id: string; data: any; order: number }[] = []

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
    const response = await api.get('/user/config/PluginOrder')
    if (response && response.data && response.data.value) {
      const serverData = response.data.value
      // 兼容服务端的旧格式和新格式
      if (serverData.length > 0 && typeof serverData[0] === 'object' && 'type' in serverData[0]) {
        orderConfig.value = serverData
      } else {
        // 旧格式，转换为新格式
        orderConfig.value = serverData.map((item: any, index: number) => ({
          id: typeof item === 'string' ? item : item.id,
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

// 按order的顺序对插件进行排序
function sortPluginOrder() {
  if (!orderConfig.value) {
    return
  }
  if (dataList.value.length === 0) {
    return
  }
  dataList.value.sort((a, b) => {
    const aIndex = orderValueMap.value.get(`plugin:${a.id}`) ?? Number.MAX_SAFE_INTEGER
    const bIndex = orderValueMap.value.get(`plugin:${b.id}`) ?? Number.MAX_SAFE_INTEGER

    return aIndex - bIndex
  })
}

// 保存混合排序
async function saveMixedSortOrder() {
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
        newPluginOrder.push(item.data)
      }
    })

    // 更新文件夹排序并设置order属性
    folderOrder.value = newFolderOrder
    newFolderOrder.forEach((folderName, index) => {
      if (pluginFolders.value[folderName]) {
        // 找到该文件夹在全局排序中的位置
        const globalOrderItem = globalOrder.find(item => item.type === 'folder' && item.id === folderName)
        pluginFolders.value[folderName].order = globalOrderItem ? globalOrderItem.order : index
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
    await api.post('/user/config/PluginOrder', orderObj)

    // 保存文件夹排序
    await savePluginFolders()
  } catch (error) {
    console.error(error)
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
      const folderOrderItem = orderConfig.value.find(
        (item: any) => item.type === 'folder' && item.id === currentFolder.value,
      )
      const folderGlobalOrder = folderOrderItem?.order ?? 999

      // 为文件夹内的插件分配连续的order值
      newPluginIds.forEach((pluginId, index) => {
        const existingItem = orderConfig.value.find((item: any) => item.type === 'plugin' && item.id === pluginId)
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
      await api.post('/user/config/PluginOrder', orderConfig.value)

      // 保存到后端
      await savePluginFolders()
    }
  } catch (error) {
    console.error(error)
  } finally {
    // 清除拖拽标志
    isDraggingSortMode.value = false
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
    return value.map(normalizeMarketText).map(item => item.trim()).filter(Boolean)
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

/** 解码本地插件仓库路径，避免异常路径中断市场列表加载。 */
function decodeLocalRepoPath(value: string) {
  try {
    return decodeURIComponent(value)
  } catch (error) {
    return value
  }
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

// 打开插件安装进度弹窗。
function openPluginProgressDialog(text: string) {
  progressDialogController?.close()
  progressDialogController = openSharedDialog(ProgressDialog, { text }, {}, { closeOn: false })
}

// 关闭插件安装进度弹窗。
function closePluginProgressDialog() {
  progressDialogController?.close()
  progressDialogController = null
}

// 安装插件
async function installPlugin(item: Plugin) {
  if (item?.system_version_compatible === false) {
    $toast.error(item.system_version_message || t('plugin.incompatibleSystemVersion'))
    return
  }

  try {
    // 显示等待提示框
    progressText.value = t('plugin.installing', { name: item?.plugin_name, version: item?.plugin_version })
    openPluginProgressDialog(progressText.value)

    const result: { [key: string]: any } = await api.get(`plugin/install/${item?.id}`, {
      params: {
        repo_url: item?.repo_url,
        force: item?.has_update,
      },
    })

    // 隐藏等待提示框
    closePluginProgressDialog()

    if (result.success) {
      $toast.success(t('plugin.installSuccess', { name: item?.plugin_name }))
      // 清空过滤条件
      hasUpdateFilter.value = false
      enabledFilter.value = false
      installedFilter.value = null
      // 刷新
      await refreshData()
    } else {
      $toast.error(t('plugin.installFailed', { name: item?.plugin_name, message: result.message }))
    }
  } catch (error) {
    closePluginProgressDialog()
    console.error(error)
  }
}

// 打开插件搜索结果
function openPlugin(item: Plugin) {
  // 如果是已安装插件则打开插件详情
  if (item.installed === true) {
    // 标记插件动作
    pluginActions.value[item.id || '0'] = true
  } else {
    // 如果是未安装插件则安装
    installPlugin(item)
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
async function fetchInstalledPlugins(context: KeepAliveRefreshContext = {}) {
  const showLoading = !context.silent || !isRefreshed.value

  try {
    if (showLoading) {
      loading.value = true
    }
    dataList.value = await api.get('plugin/', {
      params: {
        state: 'installed',
      },
    })
    // 排序
    sortPluginOrder()
    isRefreshed.value = true
  } catch (error) {
    console.error(error)
  } finally {
    if (showLoading) {
      loading.value = false
    }
  }
}

// 获取未安装插件列表数据
async function fetchUninstalledPlugins(force: boolean = false, context: KeepAliveRefreshContext = {}) {
  const showLoading = !context.silent || !isAppMarketLoaded.value

  try {
    if (showLoading) {
      loading.value = true
    }
    const marketResponse = await api.get('plugin/', {
      params: {
        state: 'market',
        force: force,
      },
    })
    uninstalledList.value = Array.isArray(marketResponse) ? marketResponse : []
    // 设置更新状态
    for (const uninstalled of uninstalledList.value) {
      for (const data of dataList.value) {
        if (uninstalled.id === data.id) {
          data.has_update = true
          data.repo_url = uninstalled.repo_url
          data.history = uninstalled.history
          data.system_version = uninstalled.system_version
          data.system_version_compatible = uninstalled.system_version_compatible
          data.system_version_message = uninstalled.system_version_message
        }
      }
    }
    isRefreshed.value = true
    // 更新插件市场列表
    // 排除已安装且有更新的，上面的问题在于"本地存在未安装的旧版本插件且云端有更新时"不会在插件市场展示
    marketList.value = uninstalledList.value.filter(item => !(item.has_update && item.installed))
    // 初始化过滤选项
    authorFilterOptions.value = []
    labelFilterOptions.value = []
    repoFilterOptions.value = []
    marketList.value.forEach(initOptions)
    // 设置APP市场加载完成
    isAppMarketLoaded.value = true
  } catch (error) {
    console.error(error)
  } finally {
    if (showLoading) {
      loading.value = false
    }
  }
}

// 加载插件统计数据
async function getPluginStatistics() {
  try {
    PluginStatistics.value = await api.get('plugin/statistic')
  } catch (error) {
    console.error(error)
  }
}

// 加载所有数据
async function refreshData(context: KeepAliveRefreshContext = {}) {
  await fetchInstalledPlugins(context)
  await fetchUninstalledPlugins(false, context)
  await getPluginStatistics()
  // 重新加载文件夹配置，确保分身插件能正确显示在文件夹中
  await loadPluginFolders()
}

// 对uninstalledList进行排序到sortedUninstalledList
watch([marketList, filterForm, activeSort, PluginStatistics], () => {
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
        filterText(filterForm.name, `${normalizeMarketText(value.plugin_name)} ${normalizeMarketText(value.plugin_desc)}`) &&
        match(filterForm.author, value.plugin_author) &&
        matchMultiple(filterForm.label, value.plugin_label) &&
        match(filterForm.repo, handleRepoUrl(value))
      ) {
        sortedUninstalledList.value.push(value)
      }
    }
  })

  // 排序
  if (!isNullOrEmptyObject(PluginStatistics.value)) {
    if (!activeSort.value || activeSort.value === 'count') {
      sortedUninstalledList.value = sortedUninstalledList.value.sort((a, b) => {
        return (PluginStatistics.value[b.id || '0'] ?? 0) - (PluginStatistics.value[a.id || '0'] ?? 0)
      })
    } else if (activeSort.value) {
      sortedUninstalledList.value = sortedUninstalledList.value.sort((a: any, b: any) => {
        return a[activeSort.value ?? ''] > b[activeSort.value ?? ''] ? 1 : -1
      })
    }
  }

  // 显示前20个
  displayUninstalledList.value = sortedUninstalledList.value.splice(0, 20)
})

// 新安装了插件
async function pluginInstalled() {
  pluginDialogClose()
  await refreshData()
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
    await fetchUninstalledPlugins(true, { silent: false, source: 'manual' })
    await getPluginStatistics()
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
    await getPluginStatistics()
    return
  }

  await fetchInstalledPlugins(context)
  await fetchUninstalledPlugins(false, context)
  await getPluginStatistics()
  // 文件夹配置可能在其它入口被插件操作改变，重新进入时同步一次。
  await loadPluginFolders()
}

function parseLocalRepoPath(repoUrl: string | undefined) {
  const text = normalizeMarketText(repoUrl)
  if (!text.startsWith('local://')) return ''

  try {
    return new URL(text).searchParams.get('path') || ''
  } catch (error) {
    return decodeLocalRepoPath(text.match(/[?&]path=([^&]+)/)?.[1] || '')
  }
}

// 处理掉github地址的前缀
function handleRepoUrl(item: Plugin | string | undefined) {
  const url = typeof item === 'string' ? item : normalizeMarketText(item?.repo_url)
  if (!url) return ''
  if (isLocalRepoSource(item)) return parseLocalRepoPath(url) || localRepoLabel.value
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
function loadMarketMore({ done }: { done: any }) {
  // 从 dataList 中获取最前面的 20 个元素
  const itemsToMove = sortedUninstalledList.value.splice(0, 20)
  if (itemsToMove.length === 0) {
    done('empty')
    return
  }

  displayUninstalledList.value.push(...itemsToMove)
  done('ok')
}

// 组件挂载后

onMounted(async () => {
  await loadPluginOrderConfig()
  await loadPluginFolders() // 加载文件夹配置
  await refreshData()
  if (activeTab.value != 'market' && pluginId.value) {
    // 找到这个插件
    const plugin = dataList.value.find(item => item.id === pluginId.value)
    if (plugin) {
      plugin.page_open = true
    }
  }
})

const { refresh: refreshKeepAliveData } = useKeepAliveRefresh(refreshActiveTabData)

watch(activeTab, (newTab, oldTab) => {
  if (!oldTab || newTab === oldTab) return

  refreshKeepAliveData({ silent: true, source: 'tab' })
})

onUnmounted(() => {
  closePluginProgressDialog()
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
const showMarketSettingAction = computed(
  () => activeTab.value === 'market' && canAdmin.value,
)

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
    const response = await api.get('plugin/folders')
    const foldersData: any = response && typeof response === 'object' ? response : {}

    // 处理旧格式兼容性（array）和新格式（object with config）
    const processedFolders: any = {}
    const order = []

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
    pluginFolders.value = {}
    folderOrder.value = []
  }
}

// 保存插件文件夹配置
async function savePluginFolders() {
  try {
    // 更新排序信息
    const foldersToSave: any = {}
    Object.keys(pluginFolders.value).forEach(folderName => {
      const folderData = pluginFolders.value[folderName]
      const orderIndex = folderOrder.value.indexOf(folderName)

      foldersToSave[folderName] = {
        ...folderData,
        order: orderIndex >= 0 ? orderIndex : 999,
      }
    })

    await api.post('plugin/folders', foldersToSave)
  } catch (error) {
    throw error
  }
}

// 创建新文件夹
async function createNewFolder() {
  if (!newFolderName.value.trim()) {
    $toast.error(t('plugin.folderNameEmpty'))
    return
  }

  if (pluginFolders.value[newFolderName.value]) {
    $toast.error(t('plugin.folderExists'))
    return
  }

  try {
    // 直接在本地添加文件夹
    pluginFolders.value[newFolderName.value] = {
      plugins: [],
      order: folderOrder.value.length,
      icon: defaultIcon,
      color: defaultColor,
      gradient: defaultGradient,
      background: '',
      showIcon: true,
    }

    // 添加到排序列表
    folderOrder.value.push(newFolderName.value)

    // 保存到后端
    await savePluginFolders()

    folderCreateDialogController?.close()
    folderCreateDialogController = null
    newFolderName.value = ''
    $toast.success(t('plugin.folderCreateSuccess'))
  } catch (error) {
    // 回滚本地更改
    delete pluginFolders.value[newFolderName.value]
    folderOrder.value = folderOrder.value.filter(name => name !== newFolderName.value)
    $toast.error(t('plugin.folderCreateFailed'))
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
    // 回滚本地更改
    pluginFolders.value[oldName] = pluginFolders.value[newName] || { plugins: [] }
    delete pluginFolders.value[newName]
    const orderIndex = folderOrder.value.indexOf(newName)
    if (orderIndex >= 0) {
      folderOrder.value[orderIndex] = oldName
    }
    if (currentFolder.value === newName) {
      currentFolder.value = oldName
    }
    $toast.error(t('plugin.folderRenameFailed'))
  }
}

// 删除文件夹
async function deleteFolder(folderName: string) {
  // 保存被删除的文件夹内容以便回滚
  const deletedFolder = { ...pluginFolders.value[folderName] }
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
    // 回滚本地更改
    pluginFolders.value[folderName] = deletedFolder
    if (!folderOrder.value.includes(folderName)) {
      folderOrder.value.push(folderName)
    }
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
    $toast.error(t('plugin.operationFailed'))
  }
}

// 更新文件夹配置
async function updateFolderConfig(folderName: string, config: any) {
  try {
    // 更新本地配置
    if (pluginFolders.value[folderName]) {
      pluginFolders.value[folderName] = {
        ...pluginFolders.value[folderName],
        ...config,
      }

      // 保存到后端
      await savePluginFolders()
    }
  } catch (error) {
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
    $toast.error('操作失败')
  }
}

// 拖拽开始事件（修复版本）
function onDragStartPlugin(evt: any) {
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
    currentDraggedPluginId.value = item.getAttribute('data-plugin-id')
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
          <div class="px-3 py-2 d-flex flex-column gap-2">
            <VSelect
              v-if="authorFilterOptions.length > 0"
              v-model="filterForm.author"
              :items="authorFilterOptions"
              :label="t('plugin.author')"
              mobile-control-width="72%"
              multiple
              chips
              closable-chips
              density="compact"
              variant="outlined"
              hide-details
              clearable
            />
            <VSelect
              v-if="labelFilterOptions.length > 0"
              v-model="filterForm.label"
              :items="labelFilterOptions"
              :label="t('plugin.label')"
              mobile-control-width="72%"
              multiple
              chips
              closable-chips
              density="compact"
              variant="outlined"
              hide-details
              clearable
            />
            <VSelect
              v-if="repoFilterOptions.length > 0"
              v-model="filterForm.repo"
              :items="repoFilterOptions"
              :label="t('plugin.repository')"
              mobile-control-width="72%"
              multiple
              chips
              closable-chips
              density="compact"
              variant="outlined"
              hide-details
              clearable
            />
          </div>
        </VCard>
      </VMenu>
    </Teleport>

    <VWindow v-model="activeTab" class="disable-tab-transition px-2" :touch="false">
      <!-- 我的插件 -->
      <VWindowItem value="installed">
        <transition name="fade-slide" appear>
          <div>
            <VPageContentTitle v-if="installedFilter" :title="t('plugin.filter', { name: installedFilter })" />
            <LoadingBanner v-if="!isRefreshed" class="mt-12" />
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
                      :sortable="true"
                      @open-folder="openFolder"
                      @delete-folder="deleteFolder"
                      @rename-folder="(oldName, newName) => renameFolder(oldName, newName)"
                      @update-folder-config="(folderName, config) => updateFolderConfig(folderName, config)"
                      @refresh-data="refreshData"
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
                      :sortable="false"
                      @open-folder="openFolder"
                      @delete-folder="deleteFolder"
                      @rename-folder="(oldName, newName) => renameFolder(oldName, newName)"
                      @update-folder-config="(folderName, config) => updateFolderConfig(folderName, config)"
                      @refresh-data="refreshData"
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
                      :sortable="true"
                      :show-remove-button="true"
                      @refresh-data="refreshData"
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
                      :sortable="false"
                      :show-remove-button="true"
                      @refresh-data="refreshData"
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
        </transition>
      </VWindowItem>
      <!-- 插件市场 -->
      <VWindowItem value="market">
        <transition name="fade-slide" appear>
          <div>
            <LoadingBanner
              v-if="!isAppMarketLoaded || (isMarketRefreshing && displayUninstalledList.length === 0)"
              class="mt-12"
            />
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
                :get-item-key="item => `${item.id}_v${item.plugin_version}`"
                :min-item-width="256"
                :estimated-item-height="260"
              >
                <template #default="{ item }">
                  <PluginAppCard :plugin="item" :count="PluginStatistics[item.id || '0']" @install="pluginInstalled" />
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
        </transition>
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
