<script setup lang="ts">
import { GridStack } from 'gridstack'
import type { GridItemHTMLElement, GridStackWidget } from 'gridstack'
import 'gridstack/dist/gridstack.min.css'
import api from '@/api'
import { isNullOrEmptyObject } from '@/@core/utils'
import type { DashboardItem } from '@/api/types'
import { useUserStore } from '@/stores'
import DashboardElement from '@/components/misc/DashboardElement.vue'
import { useDynamicButton, type DynamicButtonMenuItem } from '@/composables/useDynamicButton'
import { useI18n } from 'vue-i18n'
import { usePWA } from '@/composables/usePWA'
import { getItemColor, initializeItemColors } from '@/utils/colorUtils'
import { openSharedDialog } from '@/composables/useSharedDialog'

const ContentToggleSettingsDialog = defineAsyncComponent(
  () => import('@/components/dialog/ContentToggleSettingsDialog.vue'),
)

// 国际化
const { t } = useI18n()

// PWA模式检测
const { appMode } = usePWA()

// 路由
const route = useRoute()

// 从用户 Store 中获取superuser信息
const superUser = useUserStore().superUser

const DASHBOARD_GRID_COLUMNS = 12
const DASHBOARD_GRID_CELL_HEIGHT = 32
const DASHBOARD_GRID_FALLBACK_ROWS = 4
const DASHBOARD_GRID_MARGIN = 8
const DASHBOARD_GRID_LAYOUT_STORAGE_KEY = 'MP_DASHBOARD_GRID_LAYOUT'

interface DashboardGridLayoutItem {
  x?: number
  y?: number
  w?: number
  h?: number
}

interface DashboardGridItem {
  config: DashboardItem
  id: string
  widget: GridStackWidget
}

// 是否处于仪表板布局编辑模式
const isLayoutEditing = ref(false)

// 是否发送请求的总开关
const isRequest = ref(true)

// GridStack 容器引用
const dashboardGridRef = ref<HTMLElement | null>(null)

// GridStack 实例
const dashboardGrid = shallowRef<GridStack | null>(null)

// 是否正在由 Vue 同步 GridStack，避免初始化写入覆盖用户布局
const isSyncingDashboardGrid = ref(false)

// 仪表板本地布局覆盖配置
const dashboardGridLayout = ref<Record<string, DashboardGridLayoutItem>>({})

const dashboardGridResizeStartHeights = new Map<string, number | undefined>()
const dashboardGridPendingContentResize = new Set<GridItemHTMLElement>()

let dashboardGridContentObserver: ResizeObserver | null = null
let dashboardGridContentResizeFrame: number | null = null

// 是否正在手动缩放组件，避免自动测高抢回用户拖动中的高度。
const isDashboardGridResizing = ref(false)

// 所有组件刷新定时器的句柄
const refreshTimers = ref<{ [key: string]: NodeJS.Timeout }>({})

// 仪表板启用配置
const enableConfig = ref<{ [key: string]: boolean }>({
  mediaStatistic: true,
  scheduler: false,
  speed: false,
  storage: true,
  weeklyOverview: false,
  cpu: false,
  memory: false,
  network: false,
  library: true,
  playing: true,
  latest: true,
})

// 仪表板顺序配置
const orderConfig = ref<{ id: string; key: string }[]>([])

// 仪表板配置
const dashboardConfigs = ref<DashboardItem[]>([
  {
    id: 'storage',
    name: t('dashboard.storage'),
    key: '',
    attrs: {},
    cols: { cols: 12, md: 4 },
    rows: 5,
    elements: [],
  },
  {
    id: 'mediaStatistic',
    name: t('dashboard.mediaStatistic'),
    key: '',
    attrs: {},
    cols: { cols: 12, md: 8 },
    rows: 5,
    elements: [],
  },
  {
    id: 'weeklyOverview',
    name: t('dashboard.weeklyOverview'),
    key: '',
    attrs: {},
    cols: { cols: 12, md: 4 },
    rows: 11,
    elements: [],
  },
  {
    id: 'speed',
    name: t('dashboard.realTimeSpeed'),
    key: '',
    attrs: {},
    cols: { cols: 12, md: 4 },
    rows: 11,
    elements: [],
  },
  {
    id: 'scheduler',
    name: t('dashboard.scheduler'),
    key: '',
    attrs: {},
    cols: { cols: 12, md: 4 },
    rows: 11,
    elements: [],
  },
  {
    id: 'cpu',
    name: t('dashboard.cpu'),
    key: '',
    attrs: {},
    cols: { cols: 12, md: 6 },
    rows: 8,
    elements: [],
  },
  {
    id: 'memory',
    name: t('dashboard.memory'),
    key: '',
    attrs: {},
    cols: { cols: 12, md: 6 },
    rows: 8,
    elements: [],
  },
  {
    id: 'network',
    name: t('dashboard.network'),
    key: '',
    attrs: {},
    cols: { cols: 12, md: 6 },
    rows: 8,
    elements: [],
  },
  {
    id: 'library',
    name: t('dashboard.library'),
    key: '',
    attrs: {},
    cols: { cols: 12 },
    elements: [],
  },
  {
    id: 'playing',
    name: t('dashboard.playing'),
    key: '',
    attrs: {},
    cols: { cols: 12 },
    elements: [],
  },
  {
    id: 'latest',
    name: t('dashboard.latest'),
    key: '',
    attrs: {},
    cols: { cols: 12 },
    elements: [],
  },
])

// 插件的仪表板元信息
const pluginDashboardMeta = ref<any[]>([])

// 插件仪表板的刷新状态
const pluginDashboardRefreshStatus = ref<{ [key: string]: boolean }>({})

// 为每个项目生成随机颜色
const itemColors = ref<{ [key: string]: string }>({})

// 当前启用且可渲染的仪表板 Grid 项。
const dashboardGridItems = computed<DashboardGridItem[]>(() =>
  dashboardConfigs.value
    .filter(item => enableConfig.value[buildPluginDashboardId(item.id, item.key)] && item.cols)
    .map(item => {
      const id = buildPluginDashboardId(item.id, item.key)

      return {
        config: item,
        id,
        widget: buildDashboardGridWidget(item, id),
      }
    }),
)

// 将未知数值限制到 GridStack 可接受的整数区间。
function clampGridNumber(value: unknown, min: number, max: number, fallback: number) {
  const numericValue = Number(value)
  if (!Number.isFinite(numericValue)) return fallback

  return Math.min(max, Math.max(min, Math.round(numericValue)))
}

// 读取并校验本地仪表板布局覆盖配置。
function readDashboardGridLayout() {
  const rawLayout = localStorage.getItem(DASHBOARD_GRID_LAYOUT_STORAGE_KEY)
  if (!rawLayout) return {}

  try {
    const parsedLayout = JSON.parse(rawLayout) as Record<string, DashboardGridLayoutItem>
    const normalizedLayout: Record<string, DashboardGridLayoutItem> = {}

    Object.entries(parsedLayout).forEach(([id, layout]) => {
      if (!layout || typeof layout !== 'object') return
      const width = clampGridNumber(layout.w, 1, DASHBOARD_GRID_COLUMNS, DASHBOARD_GRID_COLUMNS)
      const normalizedItemLayout: DashboardGridLayoutItem = {
        x: clampGridNumber(layout.x, 0, DASHBOARD_GRID_COLUMNS - width, 0),
        y: clampGridNumber(layout.y, 0, 999, 0),
        w: width,
      }

      if (layout.h !== undefined) {
        normalizedItemLayout.h = clampGridNumber(layout.h, 1, 96, getDefaultDashboardGridRows())
      }

      normalizedLayout[id] = normalizedItemLayout
    })

    return normalizedLayout
  } catch (error) {
    console.error(error)

    return {}
  }
}

// 将当前仪表板布局覆盖配置保存到本地。
function saveDashboardGridLayout(layout: Record<string, DashboardGridLayoutItem>) {
  localStorage.setItem(DASHBOARD_GRID_LAYOUT_STORAGE_KEY, JSON.stringify(layout))
}

// 获取仪表板组件的默认宽度，优先兼容插件旧版 cols.md / cols.cols 配置。
function getDefaultDashboardGridWidth(item: DashboardItem) {
  return clampGridNumber(item.cols?.md ?? item.cols?.cols, 1, DASHBOARD_GRID_COLUMNS, DASHBOARD_GRID_COLUMNS)
}

// 获取仪表板组件测量前的兜底高度，兼容未来 rows 字段和插件 attrs.rows。
function getDefaultDashboardGridRows(item?: DashboardItem) {
  return clampGridNumber(item?.rows ?? item?.attrs?.rows, 1, 96, DASHBOARD_GRID_FALLBACK_ROWS)
}

// 合并插件/内置组件默认尺寸与用户本地布局覆盖。
function buildDashboardGridWidget(item: DashboardItem, id: string): GridStackWidget {
  const savedLayout = dashboardGridLayout.value[id]
  const width = savedLayout?.w ?? getDefaultDashboardGridWidth(item)
  const height = savedLayout?.h ?? getDefaultDashboardGridRows(item)
  const normalizedWidth = clampGridNumber(width, 1, DASHBOARD_GRID_COLUMNS, DASHBOARD_GRID_COLUMNS)
  const widget: GridStackWidget = {
    id,
    w: normalizedWidth,
    h: clampGridNumber(height, 1, 96, getDefaultDashboardGridRows(item)),
    minW: 1,
    minH: 1,
  }

  if (savedLayout?.x !== undefined && savedLayout?.y !== undefined) {
    widget.x = clampGridNumber(savedLayout.x, 0, DASHBOARD_GRID_COLUMNS - normalizedWidth, 0)
    widget.y = clampGridNumber(savedLayout.y, 0, 999, 0)
  } else {
    widget.autoPosition = true
  }

  return widget
}

// 初始化颜色。
function initializeColors() {
  initializeItemColors(dashboardConfigs.value, item => buildPluginDashboardId(item.id, item.key))
  dashboardConfigs.value.forEach(item => {
    const itemId = buildPluginDashboardId(item.id, item.key)
    itemColors.value[itemId] = getItemColor(itemId)
  })
}

// 使用动态按钮钩子
let settingsDialogController: ReturnType<typeof openSharedDialog> | null = null

// 打开仪表板共享设置弹窗。
function openDashboardSettings() {
  settingsDialogController?.close()
  settingsDialogController = openSharedDialog(
    ContentToggleSettingsDialog,
    {
      colors: itemColors.value,
      enabled: enableConfig.value,
      hint: t('dashboard.chooseContent'),
      items: dashboardConfigs.value,
      labelGetter: (item: DashboardItem) => item.attrs?.title ?? item.name,
      resetText: t('dashboard.resetLayout'),
      title: t('dashboard.settings'),
      valueGetter: (item: DashboardItem) => buildPluginDashboardId(item.id, item.key),
    },
    {
      close: () => {
        settingsDialogController = null
      },
      reset: resetDashboardGridLayout,
      save: saveDashboardConfig,
      'update:modelValue': (value: boolean) => {
        if (!value) settingsDialogController = null
      },
    },
    { closeOn: ['close', 'update:modelValue'] },
  )
}

// 清除用户本地布局覆盖，并恢复内置组件和插件声明的默认占位。
function resetDashboardGridLayout() {
  dashboardGridLayout.value = {}
  localStorage.removeItem(DASHBOARD_GRID_LAYOUT_STORAGE_KEY)
  dashboardGrid.value?.removeAll(false, false)
  nextTick(syncDashboardGrid)
}

// 生成 appMode 底部动态按钮菜单，普通 Web 模式由页面内 FAB 承接。
const dashboardDynamicButtonMenuItems = computed<DynamicButtonMenuItem[] | undefined>(() => {
  if (!appMode.value) return undefined

  return [
    {
      title: isLayoutEditing.value ? t('dashboard.exitEditMode') : t('dashboard.editLayout'),
      icon: isLayoutEditing.value ? 'mdi-check' : 'mdi-view-dashboard-edit',
      color: 'primary',
      action: toggleDashboardLayoutEditing,
    },
    {
      title: t('dashboard.settings'),
      icon: 'mdi-tune',
      color: 'info',
      action: openDashboardSettings,
    },
  ]
})

useDynamicButton({
  icon: 'mdi-view-dashboard-edit',
  menuItems: dashboardDynamicButtonMenuItems,
  show: computed(() => appMode.value && route.path === '/dashboard'),
})

// 切换仪表板布局编辑模式，退出编辑时压实并保存当前布局。
function toggleDashboardLayoutEditing() {
  if (isLayoutEditing.value) {
    compactAndPersistDashboardGrid()
    isLayoutEditing.value = false
    return
  }

  isLayoutEditing.value = true
  nextTick(syncDashboardGrid)
}

// 加载用户监控面板配置（本地无配置时才加载）
async function loadDashboardConfig() {
  // 显示配置
  const local_enable = localStorage.getItem('MP_DASHBOARD')
  if (local_enable) {
    enableConfig.value = JSON.parse(local_enable)
  } else {
    const response = await api.get('/user/config/Dashboard')
    if (response && response.data && response.data.value) {
      enableConfig.value = response.data.value
      localStorage.setItem('MP_DASHBOARD', JSON.stringify(response.data.value))
    }
  }
  // 顺序配置
  const local_order = localStorage.getItem('MP_DASHBOARD_ORDER')
  if (local_order) {
    orderConfig.value = JSON.parse(local_order)
  } else {
    const response2 = await api.get('/user/config/DashboardOrder')
    if (response2 && response2.data && response2.data.value) {
      orderConfig.value = response2.data.value
      localStorage.setItem('MP_DASHBOARD_ORDER', JSON.stringify(orderConfig.value))
    }
  }
  // 本地 Grid 布局覆盖
  dashboardGridLayout.value = readDashboardGridLayout()
  // 排序
  if (orderConfig.value) {
    sortDashboardConfigs()
  }
}

// 按order的顺序对dashboardConfigs进行排序
function sortDashboardConfigs() {
  dashboardConfigs.value.sort((a, b) => {
    const aIndex = orderConfig.value.findIndex(
      (item: { id: string; key: string }) => item.id === a.id && item.key === a.key,
    )
    const bIndex = orderConfig.value.findIndex(
      (item: { id: string; key: string }) => item.id === b.id && item.key === b.key,
    )
    return (aIndex === -1 ? 999 : aIndex) - (bIndex === -1 ? 999 : bIndex)
  })
}

// 设置项目
async function saveDashboardConfig(payload?: { enabled?: Record<string, boolean> }) {
  if (payload?.enabled) {
    enableConfig.value = payload.enabled
  }

  // 启用配置
  const enableString = JSON.stringify(enableConfig.value)
  localStorage.setItem('MP_DASHBOARD', enableString)

  // 顺序配置，从dashboardConfigs中提取
  const orderObj = dashboardConfigs.value.map(item => ({ id: item.id, key: item.key }))
  const orderString = JSON.stringify(orderObj)
  localStorage.setItem('MP_DASHBOARD_ORDER', orderString)

  // 保存到服务端
  try {
    await api.post('/user/config/Dashboard', enableConfig.value)
    await api.post('/user/config/DashboardOrder', orderObj)
  } catch (error) {
    console.error(error)
  }
  // 保存后重新获取插件仪表板
  getPluginDashboardMeta()
  settingsDialogController?.close()
  settingsDialogController = null
}

// 构造插件仪表板主ID
function buildPluginDashboardId(plugin_id: string, key: string) {
  if (!key) return plugin_id
  return plugin_id + ':' + key
}

// 调用API获取所有插件的仪表板元信息
async function getPluginDashboardMeta() {
  // 只有超级用户才能获取
  if (!superUser) return
  pluginDashboardMeta.value = await api.get('/plugin/dashboard/meta')
  try {
    if (!isNullOrEmptyObject(pluginDashboardMeta.value)) {
      // 下载插件仪表板配置
      pluginDashboardMeta.value.forEach(async (pluginDashboard: { id: string; key: string }) => {
        const pluginDashboardId = buildPluginDashboardId(pluginDashboard.id, pluginDashboard.key)
        // 初始化插件仪表板的刷新状态
        pluginDashboardRefreshStatus.value[pluginDashboardId] = true
        await getPluginDashboard(pluginDashboard.id, pluginDashboard.key)
      })
    }
  } catch (error) {
    console.error(error)
  }
}

function clearPluginDashboardTimer(pluginDashboardId: string) {
  if (!refreshTimers.value[pluginDashboardId]) return

  clearTimeout(refreshTimers.value[pluginDashboardId])
  delete refreshTimers.value[pluginDashboardId]
}

function schedulePluginDashboardRefresh(item: DashboardItem) {
  const pluginDashboardId = buildPluginDashboardId(item.id, item.key)
  clearPluginDashboardTimer(pluginDashboardId)

  if (
    item.attrs?.refresh &&
    pluginDashboardRefreshStatus.value[pluginDashboardId] &&
    enableConfig.value[pluginDashboardId] &&
    isRequest.value
  ) {
    refreshTimers.value[pluginDashboardId] = setTimeout(() => {
      getPluginDashboard(item.id, item.key)
    }, item.attrs.refresh * 1000)
  }
}

function refreshEnabledPluginDashboards() {
  if (!superUser || isNullOrEmptyObject(pluginDashboardMeta.value)) return

  pluginDashboardMeta.value.forEach((pluginDashboard: { id: string; key: string }) => {
    const pluginDashboardId = buildPluginDashboardId(pluginDashboard.id, pluginDashboard.key)
    if (enableConfig.value[pluginDashboardId]) {
      getPluginDashboard(pluginDashboard.id, pluginDashboard.key)
    }
  })
}

// 获取一个插件的仪表板配置项
async function getPluginDashboard(id: string, key: string) {
  try {
    const url = key ? `/plugin/dashboard/${id}/${key}` : `/plugin/dashboard/${id}`
    api.get(url).then((res: any) => {
      if (res) {
        // 名称替换为元信息的名称
        const meta = pluginDashboardMeta.value.find(
          (item: { id: string; key: string }) => item.id === id && item.key === key,
        )
        if (meta) res.name = meta.name
        // 保存到仪表板配置中，如果已经存在则替换
        const index = dashboardConfigs.value.findIndex(
          (item: { id: string; key: string }) => item.id === id && item.key === key,
        )
        if (index !== -1) {
          dashboardConfigs.value[index] = res
        } else {
          dashboardConfigs.value.push(res)
          // 为新增的插件仪表板生成颜色
          const pluginDashboardId = buildPluginDashboardId(id, key)
          if (!itemColors.value[pluginDashboardId]) {
            itemColors.value[pluginDashboardId] = getItemColor(pluginDashboardId)
          }
          // 排序
          sortDashboardConfigs()
        }
        const pluginDashboardId = buildPluginDashboardId(id, key)
        // 定时刷新
        schedulePluginDashboardRefresh(res)
      }
    })
  } catch (error) {
    console.error(error)
  }
}

// 初始化 GridStack 仪表板实例。
function initializeDashboardGrid() {
  if (!dashboardGridRef.value || dashboardGrid.value) return

  dashboardGrid.value = GridStack.init(
    {
      animate: true,
      cellHeight: DASHBOARD_GRID_CELL_HEIGHT,
      column: DASHBOARD_GRID_COLUMNS,
      columnOpts: {
        breakpoints: [
          { w: 640, c: 1, layout: 'list' },
          { w: 960, c: 6, layout: 'moveScale' },
          { w: 1280, c: DASHBOARD_GRID_COLUMNS, layout: 'moveScale' },
        ],
        layout: 'moveScale',
      },
      draggable: {
        cancel: 'input,textarea,button,select,option,a,.dashboard-grid-no-drag',
        handle: '.dashboard-grid-drag-handle',
      },
      float: false,
      margin: DASHBOARD_GRID_MARGIN,
      resizable: {
        handles: 'e,s,se',
      },
      staticGrid: !isLayoutEditing.value,
    },
    dashboardGridRef.value,
  )

  dashboardGrid.value.on('dragstop', handleDashboardGridDragStop)
  dashboardGrid.value.on('resizestart', handleDashboardGridResizeStart)
  dashboardGrid.value.on('resizestop', handleDashboardGridResizeStop)
  updateDashboardGridEditableState(isLayoutEditing.value)
  syncDashboardGrid()
}

// 根据编辑状态启用或禁用 GridStack 拖拽和缩放能力。
function updateDashboardGridEditableState(editable: boolean) {
  if (!dashboardGrid.value) return

  dashboardGrid.value.setStatic(!editable)
  if (editable) {
    dashboardGrid.value.enableMove(true)
    dashboardGrid.value.enableResize(true)
  }
}

// 将 Vue 渲染出的仪表板节点同步注册到 GridStack。
async function syncDashboardGrid() {
  const grid = dashboardGrid.value
  const gridElement = dashboardGridRef.value
  if (!grid || !gridElement) return

  isSyncingDashboardGrid.value = true
  await nextTick()

  const items = dashboardGridItems.value
  const itemMap = new Map(items.map(item => [item.id, item]))
  const elements = Array.from(gridElement.querySelectorAll<GridItemHTMLElement>('.dashboard-grid-item'))

  try {
    grid.batchUpdate()

    grid.engine.nodes
      .filter(node => {
        const nodeId = String(node.id ?? node.el?.getAttribute('gs-id') ?? '')

        return Boolean(node.el) && !itemMap.has(nodeId)
      })
      .forEach(node => {
        if (node.el) grid.removeWidget(node.el, false, false)
      })

    elements.forEach(element => {
      const id = element.getAttribute('gs-id') ?? ''
      const item = itemMap.get(id)
      if (!item) return

      const widget = { ...item.widget }
      if (element.gridstackNode && !dashboardGridLayout.value[id]) {
        delete widget.autoPosition
        delete widget.x
        delete widget.y
      }
      if (element.gridstackNode && !hasManualDashboardGridHeight(id)) {
        widget.h = element.gridstackNode.h
      }

      if (element.gridstackNode) {
        grid.update(element, widget)
      } else {
        grid.makeWidget(element, widget)
      }
    })

    grid.batchUpdate(false)
    updateDashboardGridEditableState(isLayoutEditing.value)
    observeDashboardGridContent()
    nextTick(resizeAutoDashboardItemsToContent)
  } finally {
    isSyncingDashboardGrid.value = false
  }
}

// 判断仪表板组件高度是否已被用户手动固定。
function hasManualDashboardGridHeight(id: string) {
  return dashboardGridLayout.value[id]?.h !== undefined
}

// 监听仪表板组件内容尺寸变化，让未手动调高的组件按内容高度自适应。
function observeDashboardGridContent() {
  const gridElement = dashboardGridRef.value
  if (!gridElement || typeof ResizeObserver === 'undefined') return

  dashboardGridContentObserver?.disconnect()
  dashboardGridContentObserver = new ResizeObserver(entries => {
    entries.forEach(entry => {
      const itemElement = entry.target.closest('.dashboard-grid-item') as GridItemHTMLElement | null
      if (itemElement) scheduleDashboardItemContentResize(itemElement)
    })
  })

  gridElement.querySelectorAll<HTMLElement>('.dashboard-grid-auto-size').forEach(element => {
    dashboardGridContentObserver?.observe(element)
  })
}

// 延迟执行单个组件内容测高，合并连续 ResizeObserver 回调。
function scheduleDashboardItemContentResize(element: GridItemHTMLElement) {
  dashboardGridPendingContentResize.add(element)
  if (dashboardGridContentResizeFrame !== null) return

  dashboardGridContentResizeFrame = requestAnimationFrame(() => {
    dashboardGridContentResizeFrame = null
    dashboardGridPendingContentResize.forEach(itemElement => resizeDashboardItemToContent(itemElement))
    dashboardGridPendingContentResize.clear()
  })
}

// 将未手动固定高度的单个组件高度调整到内容实际高度。
function resizeDashboardItemToContent(element: GridItemHTMLElement) {
  const grid = dashboardGrid.value
  const id = element.getAttribute('gs-id') ?? ''
  if (!grid || !id || isLayoutEditing.value || isDashboardGridResizing.value || hasManualDashboardGridHeight(id)) return

  grid.resizeToContent(element)
}

// 将所有未手动固定高度的组件高度调整到内容实际高度。
function resizeAutoDashboardItemsToContent() {
  const gridElement = dashboardGridRef.value
  if (!gridElement) return

  gridElement.querySelectorAll<GridItemHTMLElement>('.dashboard-grid-item').forEach(element => {
    resizeDashboardItemToContent(element)
  })
}

// 记录缩放开始前的高度，用于区分用户是否真的手动改过高度。
function handleDashboardGridResizeStart(_event: Event, element: GridItemHTMLElement) {
  const id = element.getAttribute('gs-id') ?? ''
  if (!id) return

  isDashboardGridResizing.value = true
  dashboardGridResizeStartHeights.set(id, element.gridstackNode?.h)
}

// 保存用户拖动后的位置，并保持未手动调高组件继续按内容自适应。
function handleDashboardGridDragStop() {
  compactAndPersistDashboardGrid(false)
}

// 保存用户缩放后的布局，只有高度发生变化时才把高度标记为手动固定。
function handleDashboardGridResizeStop(_event: Event, element: GridItemHTMLElement) {
  const id = element.getAttribute('gs-id') ?? ''
  const previousHeight = dashboardGridResizeStartHeights.get(id)
  const nextHeight = element.gridstackNode?.h
  const heightChanged = previousHeight !== undefined && nextHeight !== undefined && previousHeight !== nextHeight

  dashboardGridResizeStartHeights.delete(id)
  isDashboardGridResizing.value = false
  compactAndPersistDashboardGrid(heightChanged ? id : false)
}

// 将 GridStack 保存结果归一化为本地布局覆盖表。
function persistDashboardGridLayout(manualHeightId: string | false = false) {
  if (!dashboardGrid.value || isSyncingDashboardGrid.value) return

  const savedWidgets = dashboardGrid.value.save(false, false, undefined, DASHBOARD_GRID_COLUMNS)
  const widgets = Array.isArray(savedWidgets) ? savedWidgets : (savedWidgets.children ?? [])
  const nextLayout = { ...dashboardGridLayout.value }

  widgets.forEach(widget => {
    if (!widget.id) return

    const id = String(widget.id)
    const width = clampGridNumber(widget.w, 1, DASHBOARD_GRID_COLUMNS, getDefaultDashboardGridWidthById(id))
    const previousLayout = dashboardGridLayout.value[id]
    const nextItemLayout: DashboardGridLayoutItem = {
      x: clampGridNumber(widget.x, 0, DASHBOARD_GRID_COLUMNS - width, 0),
      y: clampGridNumber(widget.y, 0, 999, 0),
      w: width,
    }

    if (manualHeightId === id || previousLayout?.h !== undefined) {
      nextItemLayout.h = clampGridNumber(widget.h, 1, 96, getDefaultDashboardGridRows())
    }

    nextLayout[id] = nextItemLayout
  })

  dashboardGridLayout.value = nextLayout
  saveDashboardGridLayout(nextLayout)
  nextTick(resizeAutoDashboardItemsToContent)
}

// 根据组件 ID 查找默认宽度，保存布局时用于兜底。
function getDefaultDashboardGridWidthById(id: string) {
  const item = dashboardConfigs.value.find(config => buildPluginDashboardId(config.id, config.key) === id)

  return item ? getDefaultDashboardGridWidth(item) : DASHBOARD_GRID_COLUMNS
}

// 压实 GridStack 布局并保存本地占位信息。
function compactAndPersistDashboardGrid(manualHeightId: string | false = false) {
  if (!dashboardGrid.value || isSyncingDashboardGrid.value) return

  dashboardGrid.value.compact('compact')
  nextTick(() => persistDashboardGridLayout(manualHeightId))
}

watch(isLayoutEditing, value => {
  updateDashboardGridEditableState(value)
})

watch(
  dashboardGridItems,
  () => {
    syncDashboardGrid()
  },
  { deep: true },
)

onBeforeMount(async () => {
  await loadDashboardConfig()
  initializeColors()
  getPluginDashboardMeta()
})

onMounted(() => {
  initializeDashboardGrid()
})

onActivated(() => {
  isRequest.value = true
  refreshEnabledPluginDashboards()
  nextTick(syncDashboardGrid)
})

onDeactivated(() => {
  isRequest.value = false
  Object.keys(refreshTimers.value).forEach(clearPluginDashboardTimer)
})

onBeforeUnmount(() => {
  Object.keys(refreshTimers.value).forEach(clearPluginDashboardTimer)
  dashboardGridContentObserver?.disconnect()
  dashboardGridContentObserver = null
  if (dashboardGridContentResizeFrame !== null) {
    cancelAnimationFrame(dashboardGridContentResizeFrame)
    dashboardGridContentResizeFrame = null
  }
  dashboardGridPendingContentResize.clear()
  dashboardGridResizeStartHeights.clear()
  dashboardGrid.value?.destroy(false)
  dashboardGrid.value = null
})
</script>

<template>
  <!-- 仪表板 -->
  <div ref="dashboardGridRef" class="grid-stack dashboard-grid" :class="{ 'is-editing': isLayoutEditing }">
    <div
      v-for="gridItem in dashboardGridItems"
      :key="gridItem.id"
      class="grid-stack-item dashboard-grid-item"
      :class="{ 'is-manual-height': hasManualDashboardGridHeight(gridItem.id) }"
      :gs-id="gridItem.id"
      :gs-x="gridItem.widget.x"
      :gs-y="gridItem.widget.y"
      :gs-w="gridItem.widget.w"
      :gs-h="gridItem.widget.h"
      :gs-auto-position="gridItem.widget.autoPosition ? 'true' : undefined"
      :gs-min-w="gridItem.widget.minW"
      :gs-min-h="gridItem.widget.minH"
    >
      <div class="grid-stack-item-content dashboard-grid-item-content">
        <div class="dashboard-grid-auto-size">
          <div class="dashboard-grid-content-measure">
            <DashboardElement
              :config="gridItem.config"
              :allow-refresh="isRequest"
              v-model:refreshStatus="pluginDashboardRefreshStatus[gridItem.id]"
            />
          </div>
          <span v-if="isLayoutEditing" class="dashboard-grid-drag-handle" :aria-label="t('dashboard.dragHandle')">
            <VIcon icon="mdi-drag" size="small" />
          </span>
        </div>
      </div>
    </div>
  </div>

  <Teleport to="body" v-if="!appMode && route.path === '/dashboard'">
    <div class="compact-fab-stack">
      <VFab
        icon="mdi-tune"
        color="info"
        variant="tonal"
        appear
        class="compact-fab compact-fab--secondary"
        @click="openDashboardSettings"
      />
      <VFab
        :icon="isLayoutEditing ? 'mdi-check' : 'mdi-view-dashboard-edit'"
        color="primary"
        appear
        class="compact-fab compact-fab--primary"
        @click="toggleDashboardLayoutEditing"
      />
    </div>
  </Teleport>
</template>

<style scoped>
/* stylelint-disable selector-pseudo-class-no-unknown */

.dashboard-grid {
  margin-block: -6px 0;
}

.dashboard-grid-item.is-manual-height :deep(.v-card) {
  block-size: 100%;
}

.dashboard-grid-item-content {
  position: relative;
}

.dashboard-grid > .dashboard-grid-item > .dashboard-grid-item-content {
  overflow: visible !important;
}

.dashboard-grid-auto-size {
  position: relative;
  inline-size: 100%;
}

.dashboard-grid-item.is-manual-height .dashboard-grid-auto-size,
.dashboard-grid-item.is-manual-height .dashboard-grid-content-measure,
.dashboard-grid.is-editing .dashboard-grid-auto-size,
.dashboard-grid.is-editing .dashboard-grid-content-measure {
  block-size: 100%;
}

.dashboard-grid.is-editing :deep(.v-card) {
  block-size: 100%;
}

.dashboard-grid-drag-handle {
  position: absolute;
  z-index: 10;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 4px;
  block-size: 28px;
  color: rgba(var(--v-theme-on-surface), 0.72);
  cursor: move;
  inline-size: 28px;
  inset-block-start: 8px;
  inset-inline-end: 8px;
}

.dashboard-grid-drag-handle:hover {
  background: rgba(var(--v-theme-on-surface), 0.12);
}

.dashboard-grid :deep(.ui-resizable-handle) {
  z-index: 11;
  pointer-events: auto;
}

.dashboard-grid.is-editing :deep(.ui-resizable-s) {
  block-size: 18px;
  inset-block-end: -4px;
}

.dashboard-grid.is-editing :deep(.ui-resizable-se) {
  block-size: 24px;
  inline-size: 24px;
  inset-block-end: -4px;
  inset-inline-end: -4px;
}
</style>
