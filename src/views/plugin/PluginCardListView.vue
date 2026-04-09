<script lang="ts" setup>
import draggable from 'vuedraggable'
import { useToast } from 'vue-toastification'
import api from '@/api'
import type { Plugin } from '@/api/types'
import NoDataFound from '@/components/NoDataFound.vue'
import PluginAppCard from '@/components/cards/PluginAppCard.vue'
import { getLogoUrl } from '@/utils/imageUtils'
import { useDisplay } from 'vuetify'
import { isNullOrEmptyObject } from '@/@core/utils'
import { getPluginTabs } from '@/router/i18n-menu'
import PluginMarketSettingDialog from '@/components/dialog/PluginMarketSettingDialog.vue'
import { useDynamicButton } from '@/composables/useDynamicButton'
import { useI18n } from 'vue-i18n'
import PluginMixedSortCard from '@/components/cards/PluginMixedSortCard.vue'
import { usePWA } from '@/composables/usePWA'
import { useDynamicHeaderTab } from '@/composables/useDynamicHeaderTab'

// 国际化
const { t } = useI18n()

const route = useRoute()

// 显示器宽度
const display = useDisplay()

// APP
// PWA模式检测
const { appMode } = usePWA()

// 当前标签
const activeTab = ref('installed')

// 获取插件标签页
const pluginTabs = computed(() => getPluginTabs(t))

// 使用动态标签页
const { registerHeaderTab } = useDynamicHeaderTab()

// 注册动态标签页（在setup顶层立即执行）
registerHeaderTab({
  items: pluginTabs.value,
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
      action: () => {
        filterInstalledPluginDialog.value = true
      },
      show: computed(() => activeTab.value === 'installed'),
    },
    {
      icon: 'mdi-filter-multiple-outline',
      variant: 'text',
      color: computed(() => (isFilterFormEmpty.value ? 'gray' : 'primary')),
      class: 'settings-icon-button',
      dataAttr: 'market-filter-btn',
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
      action: () => {
        refreshMarket()
      },
      show: computed(() => activeTab.value === 'market'),
    },
    {
      icon: 'mdi-store-cog',
      variant: 'text',
      color: 'gray',
      class: 'settings-icon-button',
      action: () => {
        MarketSettingDialog.value = true
      },
      show: computed(() => activeTab.value === 'market'),
    },
    {
      icon: 'mdi-folder-plus',
      variant: 'text',
      color: 'gray',
      class: 'settings-icon-button',
      action: () => {
        showNewFolderDialog()
      },
      show: computed(() => activeTab.value === 'installed' && !currentFolder.value),
    },
    {
      icon: 'mdi-arrow-left',
      variant: 'text',
      color: 'gray',
      class: 'settings-icon-button',
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

// 搜索窗口
const SearchDialog = ref(false)

// 插件市场设置窗口
const MarketSettingDialog = ref(false)

// 插件市场刷新状态
const isMarketRefreshing = ref(false)

// 搜索关键字
const keyword = ref('')

// 每一个插件的图标加载状态
const pluginIconLoaded = ref<{ [key: string]: boolean }>({})

// 每一个插件的动作标识
const pluginActions: Ref<{ [key: string]: boolean }> = ref({})

// 提示框
const $toast = useToast()

// 进度框
const progressDialog = ref(false)

// 进度框文本
const progressText = ref(t('plugin.installingPlugin'))

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
const newFolderDialog = ref(false)

// 新文件夹名称
const newFolderName = ref('')

// 获取文件夹内筛选后的插件
const getFilteredFolderPlugins = (folderName: string) => {
  const folderData = pluginFolders.value[folderName]
  const folderPluginIds = Array.isArray(folderData) ? folderData : folderData?.plugins || []

  // 获取文件夹内的插件并应用筛选条件
  const folderPlugins: Plugin[] = []
  folderPluginIds.forEach((pluginId: string) => {
    const plugin = dataList.value.find(p => p.id === pluginId)
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
    const folderedPluginIds = new Set()
    Object.values(pluginFolders.value).forEach(folderData => {
      const plugins = Array.isArray(folderData) ? folderData : folderData.plugins || []
      plugins.forEach((pid: string) => folderedPluginIds.add(pid))
    })
    return filteredDataList.value.filter(plugin => !folderedPluginIds.has(plugin.id))
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
      const orderItem = orderConfig.value.find((item: any) => item.type === 'folder' && item.id === folder.name)
      allItems.push({
        type: 'folder',
        id: folder.name,
        data: folder,
        order: orderItem?.order ?? 999,
      })
    })

    // 添加插件项目
    displayedPlugins.value.forEach(plugin => {
      const orderItem = orderConfig.value.find((item: any) => item.type === 'plugin' && item.id === plugin.id)
      allItems.push({
        type: 'plugin',
        id: plugin.id || '',
        data: plugin,
        order: orderItem?.order ?? 999,
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
    const aIndex = orderConfig.value.findIndex((item: { id: string }) => item.id === a.id)
    const bIndex = orderConfig.value.findIndex((item: { id: string }) => item.id === b.id)
    return (aIndex === -1 ? 999 : aIndex) - (bIndex === -1 ? 999 : bIndex)
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
        const folderPlugin = dataList.value.find(p => p.id === id)
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

// 初始化过滤选项
function initOptions(item: Plugin) {
  const optionValue = (options: Array<string>, value: string | undefined) => {
    value && !options.includes(value) && options.push(value)
  }
  const optionMutipleValue = (options: Array<string>, value: string | undefined) => {
    value && value.split(',').forEach(v => !options.includes(v) && options.push(v))
  }
  optionValue(authorFilterOptions.value, item.plugin_author)
  optionMutipleValue(labelFilterOptions.value, item.plugin_label)
  optionValue(repoFilterOptions.value, handleRepoUrl(item.repo_url))
}

// 关闭插件市场窗口
function pluginDialogClose() {
  PluginAppDialog.value = false
}

// 安装插件
async function installPlugin(item: Plugin) {
  try {
    // 显示等待提示框
    progressDialog.value = true
    progressText.value = t('plugin.installing', { name: item?.plugin_name, version: item?.plugin_version })

    const result: { [key: string]: any } = await api.get(`plugin/install/${item?.id}`, {
      params: {
        repo_url: item?.repo_url,
        force: item?.has_update,
      },
    })

    // 隐藏等待提示框
    progressDialog.value = false

    if (result.success) {
      $toast.success(t('plugin.installSuccess', { name: item?.plugin_name }))
      // 清空过滤条件
      hasUpdateFilter.value = false
      enabledFilter.value = false
      installedFilter.value = null
      // 刷新
      refreshData()
    } else {
      $toast.error(t('plugin.installFailed', { name: item?.plugin_name, message: result.message }))
    }
  } catch (error) {
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
  SearchDialog.value = false
}

// 插件图标加载错误
function pluginIconError(item: Plugin) {
  pluginIconLoaded.value[item.id || '0'] = false
}

// 插件图标地址
function pluginIcon(item: Plugin) {
  // 如果图片加载错误
  if (pluginIconLoaded.value[item.id || '0'] === false) return getLogoUrl('plugin')
  // 如果是网络图片则使用代理后返回
  if (item?.plugin_icon?.startsWith('http'))
    return `${import.meta.env.VITE_API_BASE_URL}system/img/1?imgurl=${encodeURIComponent(item?.plugin_icon)}&cache=true`

  return `./plugin_icon/${item?.plugin_icon}`
}

// 过滤插件
const filterPlugins = computed(() => {
  const all_list = [...dataList.value, ...uninstalledList.value]
  return all_list.filter((item: Plugin) => {
    // 需要忽略大小写
    return (
      item.plugin_name?.toLowerCase().includes(keyword.value.toLowerCase()) ||
      item.plugin_desc?.toLowerCase().includes(keyword.value.toLowerCase()) ||
      !keyword
    )
  })
})

// 获取插件列表数据
async function fetchInstalledPlugins() {
  try {
    loading.value = true
    dataList.value = await api.get('plugin/', {
      params: {
        state: 'installed',
      },
    })
    // 排序
    sortPluginOrder()
    loading.value = false
    isRefreshed.value = true
  } catch (error) {
    console.error(error)
  }
}

// 获取未安装插件列表数据
async function fetchUninstalledPlugins(force: boolean = false) {
  try {
    loading.value = true
    uninstalledList.value = await api.get('plugin/', {
      params: {
        state: 'market',
        force: force,
      },
    })
    // 设置更新状态
    for (const uninstalled of uninstalledList.value) {
      for (const data of dataList.value) {
        if (uninstalled.id === data.id) {
          data.has_update = true
          data.repo_url = uninstalled.repo_url
          data.history = uninstalled.history
        }
      }
    }
    loading.value = false
    isRefreshed.value = true
    // 更新插件市场列表
    // 排除已安装且有更新的，上面的问题在于"本地存在未安装的旧版本插件且云端有更新时"不会在插件市场展示
    marketList.value = uninstalledList.value.filter(item => !(item.has_update && item.installed))
    // 初始化过滤选项
    marketList.value.forEach(initOptions)
    // 设置APP市场加载完成
    isAppMarketLoaded.value = true
  } catch (error) {
    console.error(error)
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
async function refreshData() {
  await fetchInstalledPlugins()
  fetchUninstalledPlugins()
  // 重新加载文件夹配置，确保分身插件能正确显示在文件夹中
  await loadPluginFolders()
}

// 对uninstalledList进行排序到sortedUninstalledList
watch([marketList, filterForm, activeSort], () => {
  // 匹配过滤函数
  const match = (filter: Array<string>, value: string | undefined) =>
    filter.length === 0 || (value && filter.includes(value))
  const matchMultiple = (filter: Array<string>, value: string | undefined) =>
    filter.length === 0 || (value && value.split(',').some(v => filter.includes(v)))
  const filterText = (filter: string, value: string | undefined) =>
    !filter || (value && value.toLowerCase().includes(filter.toLowerCase()))

  sortedUninstalledList.value = []

  // 过滤
  marketList.value.forEach(value => {
    if (value) {
      if (
        filterText(filterForm.name, `${value.plugin_name} ${value.plugin_desc}`) &&
        match(filterForm.author, value.plugin_author) &&
        matchMultiple(filterForm.label, value.plugin_label) &&
        match(filterForm.repo, handleRepoUrl(value.repo_url))
      ) {
        sortedUninstalledList.value.push(value)
      }
    }
  })

  // 排序
  if (!isNullOrEmptyObject(PluginStatistics.value)) {
    if (!activeSort.value || activeSort.value === 'count') {
      sortedUninstalledList.value = sortedUninstalledList.value.sort((a, b) => {
        return PluginStatistics.value[b.id || '0'] - PluginStatistics.value[a.id || '0']
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

// 标签转换
function pluginLabels(label: string | undefined) {
  if (!label) return []
  return label.split(',')
}

// 新安装了插件
function pluginInstalled() {
  pluginDialogClose()
  refreshData()
}

// 插件市场设置完成
function marketSettingDone() {
  MarketSettingDialog.value = false
  // 重新加载数据
  refreshData()
}

// 手动刷新插件市场
async function refreshMarket() {
  isMarketRefreshing.value = true
  try {
    await fetchUninstalledPlugins(true)
    await getPluginStatistics()
  } catch (error) {
    console.error(error)
  } finally {
    isMarketRefreshing.value = false
  }
}

// 处理掉github地址的前缀
function handleRepoUrl(url: string | undefined) {
  if (!url) return ''
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
  displayUninstalledList.value.push(...itemsToMove)
  done('ok')
}

// 组件挂载后

onMounted(async () => {
  await loadPluginOrderConfig()
  await loadPluginFolders() // 加载文件夹配置
  await refreshData()
  getPluginStatistics()
  if (activeTab.value != 'market' && pluginId.value) {
    // 找到这个插件
    const plugin = dataList.value.find(item => item.id === pluginId.value)
    if (plugin) {
      plugin.page_open = true
    }
  }
})

// 使用动态按钮钩子
useDynamicButton({
  icon: 'mdi-magnify',
  onClick: () => {
    SearchDialog.value = true
  },
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
      // 从全局排序配置中查找文件夹的order
      const aOrderItem = orderConfig.value.find((item: any) => item.type === 'folder' && item.id === a)
      const bOrderItem = orderConfig.value.find((item: any) => item.type === 'folder' && item.id === b)

      const aOrder = aOrderItem?.order ?? processedFolders[a].order ?? 999
      const bOrder = bOrderItem?.order ?? processedFolders[b].order ?? 999

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

    newFolderDialog.value = false
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
  newFolderDialog.value = true
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
    const plugin = filteredDataList.value.find(p => p.id === pluginId)

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
          <div class="px-3 pt-3 pb-1">
            <VCombobox
              v-model="installedFilter"
              :items="installedPluginNames"
              :placeholder="t('plugin.name')"
              prepend-inner-icon="mdi-magnify"
              density="compact"
              variant="outlined"
              hide-details
              clearable
            />
          </div>
          <VDivider class="mt-2" />
          <!-- 快捷筛选 -->
          <VList density="compact" class="px-2 py-1">
            <VListSubheader>{{ t('common.filter') }}</VListSubheader>
            <VListItem
              :active="enabledFilter"
              @click="enabledFilter = !enabledFilter"
              density="compact"
            >
              <template #prepend>
                <VIcon icon="mdi-play-circle" color="success" size="small" />
              </template>
              <VListItemTitle>{{ t('plugin.running') }}</VListItemTitle>
              <template #append>
                <VIcon v-if="enabledFilter" icon="mdi-check" color="primary" size="small" />
              </template>
            </VListItem>
            <VListItem
              :active="hasUpdateFilter"
              @click="hasUpdateFilter = !hasUpdateFilter"
              density="compact"
            >
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
          <div class="px-3 pt-3 pb-1">
            <VTextField
              v-model="filterForm.name"
              :placeholder="t('plugin.name')"
              prepend-inner-icon="mdi-magnify"
              density="compact"
              variant="outlined"
              hide-details
              clearable
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
              @click="activeSort = option.value"
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

            <!-- 文件夹和插件网格 -->
            <div v-if="(mixedSortList.length > 0 || displayedPlugins.length > 0) && isRefreshed">
              <!-- 混合排序列表（文件夹和插件） -->
              <template v-if="!currentFolder">
                <!-- 主列表：使用draggable进行混合排序 -->
                <draggable
                  v-model="mixedSortList"
                  @end="saveMixedSortOrder"
                  @start="onDragStartPlugin"
                  handle=".cursor-move"
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
                </draggable>
              </template>

              <template v-else>
                <!-- 文件夹内：使用draggable排序 + 移出按钮 -->
                <draggable
                  v-model="draggableFolderPlugins"
                  @end="saveFolderPluginOrder"
                  @start="onDragStartPlugin"
                  handle=".cursor-move"
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
                </draggable>
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
            <LoadingBanner v-if="!isAppMarketLoaded || isMarketRefreshing" class="mt-12" />
            <!-- 资源列表 -->
            <VInfiniteScroll
              v-if="isAppMarketLoaded && !isMarketRefreshing"
              mode="intersect"
              side="end"
              :items="displayUninstalledList"
              @load="loadMarketMore"
              class="overflow-visible"
            >
              <template #loading />
              <template #empty />
              <div class="grid gap-4 grid-plugin-card">
                <template
                  v-for="(data, index) in displayUninstalledList"
                  :key="`${data.id}_v${data.plugin_version}_${index}`"
                >
                  <PluginAppCard :plugin="data" :count="PluginStatistics[data.id || '0']" @install="pluginInstalled" />
                </template>
              </div>
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
    <div v-if="isRefreshed">
      <VFab
        v-if="!appMode"
        icon="mdi-magnify"
        color="info"
        location="bottom"
        size="x-large"
        fixed
        app
        appear
        @click="SearchDialog = true"
        :class="{ 'mb-12': appMode }"
      />
    </div>
  </Teleport>
  <!-- 插件市场设置窗口 -->
  <PluginMarketSettingDialog
    v-if="MarketSettingDialog"
    v-model="MarketSettingDialog"
    @close="MarketSettingDialog = false"
    @save="marketSettingDone"
  />

  <!-- 插件搜索窗口 -->
  <VDialog
    v-if="SearchDialog"
    v-model="SearchDialog"
    scrollable
    max-width="40rem"
    :max-height="!display.mdAndUp.value ? '' : '85vh'"
    :fullscreen="!display.mdAndUp.value"
  >
    <VCard class="mx-auto" width="100%">
      <VToolbar flat class="p-0">
        <VTextField
          v-model="keyword"
          :label="t('plugin.searchPlugins')"
          single-line
          :placeholder="t('plugin.searchPlaceholder')"
          variant="solo"
          prepend-inner-icon="mdi-magnify"
          flat
          class="mx-1"
        />
      </VToolbar>
      <VDialogCloseBtn @click="closeSearchDialog" />
      <VList v-if="filterPlugins.length > 0" lines="two">
        <VVirtualScroll :items="filterPlugins">
          <template #default="{ item }">
            <VListItem @click="openPlugin(item)">
              <template #prepend>
                <VAvatar>
                  <VImg :src="pluginIcon(item)" @error="pluginIconError(item)">
                    <template #placeholder>
                      <div class="w-full h-full">
                        <VSkeletonLoader class="object-cover aspect-w-1 aspect-h-1" />
                      </div>
                    </template>
                  </VImg>
                </VAvatar>
              </template>
              <VListItemTitle>
                {{ item.plugin_name }}<span class="text-sm ms-2 mt-1 text-gray-500">v{{ item?.plugin_version }}</span>
                <VIcon v-if="item.installed" color="success" icon="mdi-check-circle" class="ms-2" size="small" />
              </VListItemTitle>
              <VListItemSubtitle>
                <VChip
                  v-for="label in pluginLabels(item.plugin_label)"
                  variant="tonal"
                  size="small"
                  class="me-1 my-1"
                  color="info"
                  label
                >
                  {{ label }}
                </VChip>
                {{ item.plugin_desc }}
              </VListItemSubtitle>
            </VListItem>
          </template>
        </VVirtualScroll>
      </VList>
    </VCard>
  </VDialog>

  <!-- 安装插件进度框 -->
  <VDialog v-if="progressDialog" v-model="progressDialog" :scrim="false" width="25rem">
    <VCard color="primary">
      <VCardText class="text-center">
        {{ progressText }}
        <VProgressLinear indeterminate color="white" class="mb-0 mt-1" />
      </VCardText>
    </VCard>
  </VDialog>

  <!-- 新建文件夹对话框 -->
  <VDialog v-if="newFolderDialog" v-model="newFolderDialog" max-width="400">
    <VCard>
      <VDialogCloseBtn @click="newFolderDialog = false" />
      <VCardItem>
        <VCardTitle>{{ t('plugin.newFolder') }}</VCardTitle>
      </VCardItem>
      <VDivider />
      <VCardText>
        <VTextField
          v-model="newFolderName"
          :label="t('plugin.folderName')"
          variant="outlined"
          @keyup.enter="createNewFolder"
        />
      </VCardText>
      <VCardActions>
        <VSpacer />
        <VBtn color="primary" @click="createNewFolder" prepend-icon="mdi-folder-plus" class="px-5">{{
          t('plugin.create')
        }}</VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
</template>
