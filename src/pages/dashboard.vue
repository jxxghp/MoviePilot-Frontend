<script setup lang="ts">
import { GridStack } from 'gridstack'
import type { ColumnOptions, GridItemHTMLElement, GridStackWidget } from 'gridstack'
import 'gridstack/dist/gridstack.min.css'
import api from '@/api'
import { isNullOrEmptyObject } from '@/@core/utils'
import type { DashboardItem } from '@/api/types'
import DashboardElement from '@/components/misc/DashboardElement.vue'
import { useDynamicButton, type DynamicButtonMenuItem } from '@/composables/useDynamicButton'
import { useI18n } from 'vue-i18n'
import { usePWA } from '@/composables/usePWA'
import { openSharedDialog } from '@/composables/useSharedDialog'
import { useUserStore } from '@/stores'
import { buildUserPermissionContext, hasPermission } from '@/utils/permission'
import { useDisplay } from 'vuetify'

const ContentToggleSettingsDialog = defineAsyncComponent(
  () => import('@/components/dialog/ContentToggleSettingsDialog.vue'),
)

// 国际化
const { t } = useI18n()

// PWA模式检测
const { appMode } = usePWA()
const display = useDisplay()
const userStore = useUserStore()
const userPermissionContext = computed(() =>
  buildUserPermissionContext(userStore.superUser, userStore.permissions),
)
const canAdmin = computed(() => hasPermission(userPermissionContext.value, 'admin'))
const canDiscovery = computed(() => hasPermission(userPermissionContext.value, 'discovery'))

// 路由
const route = useRoute()

const DASHBOARD_GRID_COLUMNS = 12
const DASHBOARD_GRID_DESKTOP_BREAKPOINT = 1280
const DASHBOARD_GRID_TABLET_BREAKPOINT = 960
const DASHBOARD_GRID_MOBILE_BREAKPOINT = 640
const DASHBOARD_GRID_CELL_HEIGHT = 16
const DASHBOARD_GRID_FALLBACK_ROWS = 4
const DASHBOARD_GRID_MARGIN = 8
const DASHBOARD_GRID_CONTENT_RESIZE_THRESHOLD = 4
const DASHBOARD_ENABLE_STORAGE_KEY = 'MP_DASHBOARD'
const DASHBOARD_ORDER_STORAGE_KEY = 'MP_DASHBOARD_ORDER'
const DASHBOARD_GRID_LAYOUT_STORAGE_KEY_PREFIX = 'MP_DASHBOARD_GRID_LAYOUT'
const DASHBOARD_ENABLE_CONFIG_KEY = 'Dashboard'
const DASHBOARD_ORDER_CONFIG_KEY = 'DashboardOrder'
const DASHBOARD_GRID_LAYOUT_CONFIG_KEY = 'DashboardGridLayout'
const DASHBOARD_GRID_LAYOUT_CONFIG_KEY_PREFIX = 'DashboardGridLayout'

type DashboardEnableConfig = Record<string, boolean>
type DashboardOrderConfig = { id: string; key: string }[]
type DashboardGridLayoutConfig = Record<string, DashboardGridLayoutItem>
type DashboardConfigNormalizer<T> = (value: unknown) => T | undefined
type DashboardConfigRemoteValueBuilder<T> = (value: T) => unknown
type DashboardLayoutProfile = 'desktop' | 'tablet' | 'mobile'

// CPU 与内存组件共用默认行高，确保两张资源趋势卡片始终等高。
const DASHBOARD_RESOURCE_CHART_ROWS = 11

interface DashboardGridLayoutItem {
  x?: number
  y?: number
  w?: number
  h?: number
}

// 参考桌面端设计稿定义默认排布；用户保存过的布局仍优先于这里的初始值。
const DASHBOARD_DESKTOP_DEFAULT_LAYOUT: DashboardGridLayoutConfig = {
  storage: { x: 0, y: 0, w: 4, h: 7 },
  mediaStatistic: { x: 4, y: 0, w: 8, h: 7 },
  speed: { x: 0, y: 7, w: 4, h: 12 },
  recentImports: { x: 4, y: 7, w: 4, h: 15 },
  scheduler: { x: 8, y: 7, w: 4, h: 15 },
  memory: { x: 0, y: 22, w: 4, h: DASHBOARD_RESOURCE_CHART_ROWS },
  cpu: { x: 4, y: 22, w: 4, h: DASHBOARD_RESOURCE_CHART_ROWS },
  quickActions: { x: 8, y: 22, w: 4, h: 5 },
  systemInfo: { x: 8, y: 27, w: 4, h: 6 },
  mediaRecommend: { x: 0, y: 33, w: 8, h: 17 },
}

// 单个设备档位的仪表盘配置，将布局与显示项绑定到同一份持久化数据。
interface DashboardProfileConfig {
  enabled?: DashboardEnableConfig
  items: DashboardGridLayoutConfig
  updatedAt?: number
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

// 仪表板配置是否已完成首次加载，包含插件仪表板配置。
const isDashboardConfigLoaded = ref(false)

// 已完成组件模块加载的仪表板项目 ID。
const loadedDashboardGridItemIds = ref<Set<string>>(new Set())

// 是否正在由 Vue 同步 GridStack，避免初始化写入覆盖用户布局
const isSyncingDashboardGrid = ref(false)

// 是否正在把 GridStack 当前布局写回 Vue 状态，避免同源变更再次反向同步到 GridStack。
const isPersistingDashboardGridLayoutFromGrid = ref(false)

// 仪表板本地布局覆盖配置
const dashboardGridLayout = ref<DashboardGridLayoutConfig>({})

// 最近一次已确认持久化的仪表板布局，用于编辑模式下避开临时布局草稿。
let persistedDashboardGridLayout: DashboardGridLayoutConfig = {}

// 是否处于“恢复默认布局”的临时草稿，确认前保持清空布局覆盖的语义。
const isDashboardGridLayoutResetDraft = ref(false)

// 当前仪表板布局档位，按 GridStack 响应式列数拆分跨端配置。
const dashboardLayoutProfile = ref<DashboardLayoutProfile>('desktop')

// 旧版跨设备显示项配置，仅用于首次迁移到按设备拆分的仪表盘配置。
let legacyDashboardEnableConfig: DashboardEnableConfig | undefined
let isLegacyDashboardEnableConfigLoaded = false

const dashboardGridResizeStartHeights = new Map<string, number | undefined>()
const dashboardGridPendingContentResize = new Set<GridItemHTMLElement>()
const dashboardGridObservedContentHeights = new Map<string, number>()

let dashboardGridContentObserver: ResizeObserver | null = null
let dashboardGridContentResizeFrame: number | null = null
let dashboardGridResizeRefreshFrame: number | null = null
let dashboardRevealFrame: number | null = null
let isDashboardRevealPending = false
let dashboardProfileSaveQueue = Promise.resolve()
// 标记最近一次响应式档位切换，避免快速缩放时较早的异步配置覆盖最新档位。
let dashboardLayoutProfileSwitchId = 0

// 是否正在手动缩放组件，避免自动测高抢回用户拖动中的高度。
const isDashboardGridResizing = ref(false)

// 所有组件刷新定时器的句柄
const refreshTimers = ref<{ [key: string]: NodeJS.Timeout }>({})

// 仪表板启用配置
const enableConfig = ref<DashboardEnableConfig>(getDefaultDashboardEnableConfig())

// 仪表板顺序配置
const orderConfig = ref<DashboardOrderConfig>([])

// 仪表板配置
const dashboardConfigs = ref<DashboardItem[]>([
  {
    id: 'storage',
    name: t('dashboard.storage'),
    key: '',
    attrs: {},
    cols: { cols: 12, md: 4 },
    rows: 7,
    elements: [],
  },
  {
    id: 'mediaStatistic',
    name: t('dashboard.mediaStatistic'),
    key: '',
    attrs: {},
    cols: { cols: 12, md: 8 },
    rows: 7,
    elements: [],
  },
  {
    id: 'mediaRecommend',
    name: t('dashboard.recommendedMedia'),
    key: '',
    attrs: {},
    cols: { cols: 12, md: 8 },
    rows: 17,
    elements: [],
  },
  {
    id: 'weeklyOverview',
    name: t('dashboard.weeklyOverview'),
    key: '',
    attrs: {},
    cols: { cols: 12, md: 4 },
    rows: 23,
    elements: [],
  },
  {
    id: 'speed',
    name: t('dashboard.realTimeSpeed'),
    key: '',
    attrs: {},
    cols: { cols: 12, md: 4 },
    rows: 12,
    elements: [],
  },
  {
    id: 'scheduler',
    name: t('dashboard.scheduler'),
    key: '',
    attrs: {},
    cols: { cols: 12, md: 4 },
    rows: 15,
    elements: [],
  },
  {
    id: 'cpu',
    name: t('dashboard.cpu'),
    key: '',
    attrs: {},
    cols: { cols: 12, sm: 3, md: 4 },
    rows: DASHBOARD_RESOURCE_CHART_ROWS,
    elements: [],
  },
  {
    id: 'memory',
    name: t('dashboard.memory'),
    key: '',
    attrs: {},
    cols: { cols: 12, sm: 3, md: 4 },
    rows: DASHBOARD_RESOURCE_CHART_ROWS,
    elements: [],
  },
  {
    id: 'network',
    name: t('dashboard.network'),
    key: '',
    attrs: {},
    cols: { cols: 12, sm: 3, md: 4 },
    rows: DASHBOARD_RESOURCE_CHART_ROWS,
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
  {
    id: 'recentImports',
    name: t('dashboard.recentImports'),
    key: '',
    attrs: {},
    cols: { cols: 12, sm: 2, md: 4 },
    rows: 15,
    elements: [],
  },
  {
    id: 'quickActions',
    name: t('dashboard.quickActions.title'),
    key: '',
    attrs: {},
    cols: { cols: 12, sm: 3, md: 4 },
    rows: 5,
    elements: [],
  },
  {
    id: 'systemInfo',
    name: t('dashboard.systemInfo.title'),
    key: '',
    attrs: {},
    cols: { cols: 12, sm: 3, md: 4 },
    rows: 6,
    elements: [],
  },
])

// 插件的仪表板元信息
const pluginDashboardMeta = ref<any[]>([])

// 插件仪表板的刷新状态
const pluginDashboardRefreshStatus = ref<{ [key: string]: boolean }>({})

// 当前启用且可渲染的仪表板 Grid 项。
const dashboardGridItems = computed<DashboardGridItem[]>(() =>
  dashboardConfigs.value
    .filter(
      item =>
        enableConfig.value[buildPluginDashboardId(item.id, item.key)] &&
        item.cols &&
        (item.id !== 'mediaRecommend' || canDiscovery.value),
    )
    .map(item => {
      const id = buildPluginDashboardId(item.id, item.key)

      return {
        config: item,
        id,
        widget: buildDashboardGridWidget(item, id),
      }
    }),
)

// 获取当前可渲染仪表板项目 ID 列表。
function getDashboardGridItemIds() {
  return dashboardGridItems.value.map(item => item.id)
}

// 清理已经不在当前仪表板列表中的加载完成标记。
function syncDashboardLoadedItemIds() {
  const currentIds = new Set(getDashboardGridItemIds())
  const nextLoadedIds = new Set([...loadedDashboardGridItemIds.value].filter(id => currentIds.has(id)))

  if (nextLoadedIds.size !== loadedDashboardGridItemIds.value.size) {
    loadedDashboardGridItemIds.value = nextLoadedIds
  }
}

// 判断当前启用的仪表板项目是否都已经完成组件加载。
function areDashboardGridItemsLoaded() {
  return getDashboardGridItemIds().every(id => loadedDashboardGridItemIds.value.has(id))
}

// 判断 GridStack 是否已经可承载当前仪表板项目。
function isDashboardGridReadyForReveal() {
  return getDashboardGridItemIds().length === 0 || !!dashboardGrid.value
}

// 在配置、组件和 GridStack 都就绪后安排仪表板整体渐现。
function scheduleDashboardReveal() {
  if (
    isDashboardRevealPending ||
    dashboardRevealFrame !== null ||
    !isDashboardConfigLoaded.value ||
    !isDashboardGridReadyForReveal() ||
    !areDashboardGridItemsLoaded()
  ) {
    return
  }

  isDashboardRevealPending = true
  void nextTick(() => {
    isDashboardRevealPending = false
    if (!isDashboardConfigLoaded.value || !isDashboardGridReadyForReveal() || !areDashboardGridItemsLoaded()) {
      return
    }

    syncDashboardFillContentState()
    resizeAutoDashboardItemsToContent()

    if (typeof window === 'undefined') {
      return
    }

    dashboardRevealFrame = window.requestAnimationFrame(() => {
      dashboardRevealFrame = null
      notifyDashboardContentResize()
    })
  })
}

// 标记单个仪表板项目已经完成首次组件加载。
function markDashboardGridItemLoaded(id: string) {
  if (loadedDashboardGridItemIds.value.has(id)) return

  loadedDashboardGridItemIds.value = new Set([...loadedDashboardGridItemIds.value, id])
  scheduleDashboardReveal()
  void nextTick(syncDashboardFillContentState)
}

// 将未知数值限制到 GridStack 可接受的整数区间。
function clampGridNumber(value: unknown, min: number, max: number, fallback: number) {
  const numericValue = Number(value)
  if (!Number.isFinite(numericValue)) return fallback

  return Math.min(max, Math.max(min, Math.round(numericValue)))
}

// 获取仪表盘内置组件的默认显示配置。
function getDefaultDashboardEnableConfig(): DashboardEnableConfig {
  return {
    mediaStatistic: true,
    mediaRecommend: true,
    scheduler: true,
    speed: true,
    storage: true,
    weeklyOverview: false,
    cpu: true,
    memory: true,
    network: false,
    library: false,
    playing: false,
    latest: false,
    recentImports: true,
    quickActions: true,
    systemInfo: true,
  }
}

// 用默认开关补齐旧配置中新出现的组件，同时保留用户已有选择。
function mergeDashboardEnableConfig(config?: DashboardEnableConfig): DashboardEnableConfig {
  return {
    ...getDefaultDashboardEnableConfig(),
    ...config,
  }
}

// 校验并归一化仪表板显示配置，避免异常用户配置影响页面渲染。
function normalizeDashboardEnableConfig(value: unknown): DashboardEnableConfig | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined

  return Object.entries(value).reduce<DashboardEnableConfig>((config, [key, enabled]) => {
    config[key] = Boolean(enabled)

    return config
  }, {})
}

// 校验并归一化仪表板顺序配置，只保留具备组件 ID 的项目。
function normalizeDashboardOrderConfig(value: unknown): DashboardOrderConfig | undefined {
  if (!Array.isArray(value)) return undefined

  return value.reduce<DashboardOrderConfig>((config, item) => {
    if (!item || typeof item !== 'object') return config

    const rawItem = item as { id?: unknown; key?: unknown }
    if (typeof rawItem.id !== 'string' || !rawItem.id) return config

    config.push({
      id: rawItem.id,
      key: typeof rawItem.key === 'string' ? rawItem.key : '',
    })

    return config
  }, [])
}

// 校验并归一化仪表板 Grid 布局覆盖配置，兼容旧版裸布局和新版 profile 包装结构。
function normalizeDashboardGridLayout(value: unknown): DashboardGridLayoutConfig | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined

  const configValue = value as { items?: unknown }
  const hasWrappedLayout = Object.prototype.hasOwnProperty.call(configValue, 'items')
  const layoutValue = hasWrappedLayout ? configValue.items : value
  if (!layoutValue || typeof layoutValue !== 'object' || Array.isArray(layoutValue)) {
    return hasWrappedLayout ? {} : undefined
  }

  const normalizedLayout: DashboardGridLayoutConfig = {}

  Object.entries(layoutValue).forEach(([id, layout]) => {
    if (!layout || typeof layout !== 'object') return

    const rawLayout = layout as DashboardGridLayoutItem
    const width = clampGridNumber(rawLayout.w, 1, DASHBOARD_GRID_COLUMNS, DASHBOARD_GRID_COLUMNS)
    const normalizedItemLayout: DashboardGridLayoutItem = {
      x: clampGridNumber(rawLayout.x, 0, DASHBOARD_GRID_COLUMNS - width, 0),
      y: clampGridNumber(rawLayout.y, 0, 999, 0),
      w: width,
    }

    if (rawLayout.h !== undefined) {
      normalizedItemLayout.h = clampGridNumber(rawLayout.h, 1, 96, getDefaultDashboardGridRows())
    }

    normalizedLayout[id] = normalizedItemLayout
  })

  return normalizedLayout
}

// 校验并归一化单个设备档位的仪表盘配置，兼容旧版只保存 Grid 布局的数据。
function normalizeDashboardProfileConfig(value: unknown): DashboardProfileConfig | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined

  const configValue = value as { enabled?: unknown; items?: unknown; updatedAt?: unknown }
  const hasProfileField =
    Object.prototype.hasOwnProperty.call(configValue, 'items') ||
    Object.prototype.hasOwnProperty.call(configValue, 'enabled')
  const items = normalizeDashboardGridLayout(hasProfileField ? { items: configValue.items ?? {} } : value)
  if (items === undefined) return undefined

  const enabled = normalizeDashboardEnableConfig(configValue.enabled)
  const profileConfig: DashboardProfileConfig = { items }

  if (enabled !== undefined) {
    profileConfig.enabled = enabled
  }

  const updatedAt = Number(configValue.updatedAt)
  if (Number.isFinite(updatedAt) && updatedAt > 0) {
    profileConfig.updatedAt = updatedAt
  }

  return profileConfig
}

// 构造设备档位仪表盘配置，让显示项和 Grid 布局始终作为一个整体持久化。
function buildDashboardProfileConfig(
  layout: DashboardGridLayoutConfig = dashboardGridLayout.value,
  enabled: DashboardEnableConfig = enableConfig.value,
  updatedAt = Date.now(),
): DashboardProfileConfig {
  return {
    enabled,
    items: layout,
    updatedAt,
  }
}

// 构造服务端设备档位配置，避免空布局被后端按空值删除后又被其他浏览器旧缓存回填。
function buildRemoteDashboardProfileConfig(config: DashboardProfileConfig) {
  const remoteConfig: DashboardProfileConfig = { items: config.items }

  if (config.enabled !== undefined) {
    remoteConfig.enabled = config.enabled
  }

  if (config.updatedAt !== undefined) {
    remoteConfig.updatedAt = config.updatedAt
  }

  return remoteConfig
}

// 判断本地仪表盘配置是否比服务端配置更新，用于保护刚保存但尚未同步成功的布局。
function isLocalDashboardProfileConfigNewer(
  localConfig: DashboardProfileConfig | undefined,
  remoteConfig: DashboardProfileConfig | undefined,
) {
  return (
    localConfig?.updatedAt !== undefined &&
    (remoteConfig?.updatedAt === undefined || localConfig.updatedAt > remoteConfig.updatedAt)
  )
}

// 串行写入仪表盘布局配置，避免较早的异步保存请求后完成并覆盖较新的布局。
function queueDashboardProfileRemoteSave(configKey: string, profileConfig: DashboardProfileConfig) {
  const remoteConfig = buildRemoteDashboardProfileConfig(profileConfig)

  dashboardProfileSaveQueue = dashboardProfileSaveQueue
    .catch(error => console.error(error))
    .then(() => saveUserDashboardConfig(configKey, remoteConfig))

  return dashboardProfileSaveQueue
}

// 根据当前视口判断仪表板布局档位，避免手机和桌面共用 Grid 坐标。
function resolveDashboardLayoutProfile(): DashboardLayoutProfile {
  const width =
    display.width.value || (typeof window === 'undefined' ? DASHBOARD_GRID_DESKTOP_BREAKPOINT : window.innerWidth)

  if (width <= DASHBOARD_GRID_MOBILE_BREAKPOINT) return 'mobile'
  if (width <= DASHBOARD_GRID_TABLET_BREAKPOINT) return 'tablet'

  return 'desktop'
}

// 获取当前布局档位对应的 GridStack 列数。
function getDashboardGridColumnsForProfile(profile: DashboardLayoutProfile) {
  if (profile === 'mobile') return 1
  if (profile === 'tablet') return 6

  return DASHBOARD_GRID_COLUMNS
}

// 获取当前 Grid 实际列数，用于按布局档位保存当前坐标。
function getCurrentDashboardGridColumns() {
  return dashboardGrid.value?.getColumn() ?? getDashboardGridColumnsForProfile(dashboardLayoutProfile.value)
}

// 获取当前布局档位的 GridStack 列变化策略。
function getDashboardGridColumnLayout(profile: DashboardLayoutProfile): ColumnOptions {
  return profile === 'mobile' ? 'list' : 'moveScale'
}

// 获取布局档位对应的本地存储键，桌面沿用旧键以兼容已有配置。
function getDashboardGridLayoutStorageKey(profile: DashboardLayoutProfile) {
  if (profile === 'desktop') return DASHBOARD_GRID_LAYOUT_STORAGE_KEY_PREFIX

  return `${DASHBOARD_GRID_LAYOUT_STORAGE_KEY_PREFIX}_${profile.toUpperCase()}`
}

// 获取布局档位对应的用户配置键，桌面沿用旧键以兼容已同步配置。
function getDashboardGridLayoutConfigKey(profile: DashboardLayoutProfile) {
  if (profile === 'desktop') return DASHBOARD_GRID_LAYOUT_CONFIG_KEY

  return `${DASHBOARD_GRID_LAYOUT_CONFIG_KEY_PREFIX}${profile === 'mobile' ? 'Mobile' : 'Tablet'}`
}

// 加载指定设备档位的仪表盘配置，远端旧布局缺少显示项时保留本地新版显示项。
async function loadDashboardProfileConfig(profile: DashboardLayoutProfile) {
  const configKey = getDashboardGridLayoutConfigKey(profile)
  const storageKey = getDashboardGridLayoutStorageKey(profile)
  const localConfig = readLocalDashboardConfig(storageKey, normalizeDashboardProfileConfig)

  try {
    const response = await api.get(`/user/config/${configKey}`)
    const remoteConfig = normalizeDashboardProfileConfig(response?.data?.value)

    if (remoteConfig !== undefined) {
      if (localConfig && isLocalDashboardProfileConfigNewer(localConfig, remoteConfig)) {
        await queueDashboardProfileRemoteSave(configKey, localConfig)

        return localConfig
      }

      const profileConfig: DashboardProfileConfig = { items: remoteConfig.items, updatedAt: remoteConfig.updatedAt }
      const enabled = remoteConfig.enabled ?? localConfig?.enabled

      if (enabled !== undefined) {
        profileConfig.enabled = enabled
      }

      saveLocalDashboardConfig(storageKey, profileConfig)

      if (remoteConfig.enabled === undefined && localConfig?.enabled !== undefined) {
        await queueDashboardProfileRemoteSave(configKey, profileConfig)
      }

      return profileConfig
    }

    if (localConfig !== undefined) {
      await queueDashboardProfileRemoteSave(configKey, localConfig)
    }
  } catch (error) {
    console.error(error)
  }

  return localConfig
}

// 从本地存储读取并归一化指定的仪表板配置。
function readLocalDashboardConfig<T>(storageKey: string, normalize: DashboardConfigNormalizer<T>) {
  const rawConfig = localStorage.getItem(storageKey)
  if (!rawConfig) return undefined

  try {
    return normalize(JSON.parse(rawConfig))
  } catch (error) {
    console.error(error)

    return undefined
  }
}

// 将仪表板配置写入本地存储，保留离线和接口失败时的兜底能力。
function saveLocalDashboardConfig(storageKey: string, value: unknown) {
  localStorage.setItem(storageKey, JSON.stringify(value))
}

// 将仪表板配置写入用户配置，用于跨浏览器共享。
async function saveUserDashboardConfig(configKey: string, value: unknown) {
  await api.post(`/user/config/${configKey}`, value)
}

// 读取旧版全局显示项配置，用于设备档位配置还没有 enabled 字段时迁移。
async function loadLegacyDashboardEnableConfig() {
  if (isLegacyDashboardEnableConfigLoaded) return legacyDashboardEnableConfig

  const localConfig = readLocalDashboardConfig(DASHBOARD_ENABLE_STORAGE_KEY, normalizeDashboardEnableConfig)

  try {
    const response = await api.get(`/user/config/${DASHBOARD_ENABLE_CONFIG_KEY}`)
    legacyDashboardEnableConfig = normalizeDashboardEnableConfig(response?.data?.value) ?? localConfig
  } catch (error) {
    console.error(error)
    legacyDashboardEnableConfig = localConfig
  }

  isLegacyDashboardEnableConfigLoaded = true

  return legacyDashboardEnableConfig
}

// 优先加载用户配置；服务端缺失时使用本地历史配置并回填到用户配置。
async function loadSharedDashboardConfig<T>(
  configKey: string,
  storageKey: string,
  normalize: DashboardConfigNormalizer<T>,
  buildRemoteValue: DashboardConfigRemoteValueBuilder<T> = value => value,
) {
  const localConfig = readLocalDashboardConfig(storageKey, normalize)

  try {
    const response = await api.get(`/user/config/${configKey}`)
    const remoteConfig = normalize(response?.data?.value)

    if (remoteConfig !== undefined) {
      saveLocalDashboardConfig(storageKey, remoteConfig)

      return remoteConfig
    }

    if (localConfig !== undefined) {
      await saveUserDashboardConfig(configKey, buildRemoteValue(localConfig))
    }
  } catch (error) {
    console.error(error)
  }

  return localConfig
}

// 保存指定布局或当前已确认布局到本地和用户配置。
function saveDashboardProfileConfig(layout?: DashboardGridLayoutConfig, enabled = enableConfig.value) {
  const profile = dashboardLayoutProfile.value
  const layoutToPersist = layout ?? (isLayoutEditing.value ? persistedDashboardGridLayout : dashboardGridLayout.value)
  const profileConfig = buildDashboardProfileConfig(layoutToPersist, enabled)

  saveLocalDashboardConfig(getDashboardGridLayoutStorageKey(profile), profileConfig)
  persistedDashboardGridLayout = cloneDashboardGridLayout(layoutToPersist)

  return queueDashboardProfileRemoteSave(getDashboardGridLayoutConfigKey(profile), profileConfig).catch(error =>
    console.error(error),
  )
}

// 持久化指定的仪表板布局覆盖配置。
function saveDashboardGridLayout(layout: DashboardGridLayoutConfig) {
  return saveDashboardProfileConfig(layout)
}

// 克隆仪表板布局配置，避免临时编辑草稿和已确认布局共用对象引用。
function cloneDashboardGridLayout(layout: DashboardGridLayoutConfig): DashboardGridLayoutConfig {
  return Object.entries(layout).reduce<DashboardGridLayoutConfig>((clonedLayout, [id, itemLayout]) => {
    clonedLayout[id] = { ...itemLayout }

    return clonedLayout
  }, {})
}

// 获取仪表板组件的默认宽度，优先兼容插件旧版 cols.md / cols.cols 配置。
function getDefaultDashboardGridWidth(item: DashboardItem) {
  const profile = dashboardLayoutProfile.value
  if (profile === 'mobile') return 1

  const columns = getDashboardGridColumnsForProfile(profile)
  const requestedWidth = profile === 'tablet' ? item.cols?.sm ?? item.cols?.md : item.cols?.md ?? item.cols?.cols

  return clampGridNumber(requestedWidth, 1, columns, columns)
}

// 获取仪表板组件测量前的兜底高度，兼容未来 rows 字段和插件 attrs.rows。
function getDefaultDashboardGridRows(item?: DashboardItem) {
  return clampGridNumber(item?.rows ?? item?.attrs?.rows, 1, 96, DASHBOARD_GRID_FALLBACK_ROWS)
}

// 合并插件/内置组件默认尺寸与用户本地布局覆盖。
function buildDashboardGridWidget(item: DashboardItem, id: string): GridStackWidget {
  const savedLayout = dashboardGridLayout.value[id]
  const defaultLayout = dashboardLayoutProfile.value === 'desktop' ? DASHBOARD_DESKTOP_DEFAULT_LAYOUT[id] : undefined
  const gridColumns = getDashboardGridColumnsForProfile(dashboardLayoutProfile.value)
  const width = savedLayout?.w ?? defaultLayout?.w ?? getDefaultDashboardGridWidth(item)
  const height = savedLayout?.h ?? defaultLayout?.h ?? getDefaultDashboardGridRows(item)
  const normalizedWidth = clampGridNumber(width, 1, gridColumns, gridColumns)
  const widget: GridStackWidget = {
    id,
    w: normalizedWidth,
    h: clampGridNumber(height, 1, 96, getDefaultDashboardGridRows(item)),
    minW: 1,
    minH: 1,
  }

  const x = savedLayout?.x ?? defaultLayout?.x
  const y = savedLayout?.y ?? defaultLayout?.y
  if (x !== undefined && y !== undefined) {
    widget.x = clampGridNumber(x, 0, gridColumns - normalizedWidth, 0)
    widget.y = clampGridNumber(y, 0, 999, 0)
  } else {
    widget.autoPosition = true
  }

  return widget
}

// 使用动态按钮钩子
let settingsDialogController: ReturnType<typeof openSharedDialog> | null = null

// 打开仪表板共享设置弹窗。
function openDashboardSettings() {
  settingsDialogController?.close()
  settingsDialogController = openSharedDialog(
    ContentToggleSettingsDialog,
    {
      enabled: enableConfig.value,
      hint: t('dashboard.chooseContent'),
      items: dashboardConfigs.value,
      labelGetter: (item: DashboardItem) => item.attrs?.title ?? item.name,
      title: t('dashboard.settings'),
      valueGetter: (item: DashboardItem) => buildPluginDashboardId(item.id, item.key),
    },
    {
      close: () => {
        settingsDialogController = null
      },
      save: saveDashboardConfig,
      'update:modelValue': (value: boolean) => {
        if (!value) settingsDialogController = null
      },
    },
    { closeOn: ['close', 'update:modelValue'] },
  )
}

// 同步已打开的仪表盘设置弹窗，避免设备档位切换后继续显示旧档位的开关副本。
function updateDashboardSettingsDialog() {
  settingsDialogController?.updateProps({
    enabled: enableConfig.value,
    items: dashboardConfigs.value,
  })
}

// 退出仪表板布局编辑模式；用户点击确认时才把临时布局草稿持久化。
async function exitDashboardLayoutEditing() {
  if (isDashboardGridLayoutResetDraft.value) {
    await saveDashboardGridLayout(dashboardGridLayout.value)
    isDashboardGridLayoutResetDraft.value = false
  } else {
    await persistCurrentDashboardGridLayout()
  }

  isLayoutEditing.value = false
  await nextTick()
  await reloadDashboardGridWidgetsFromLayout()
  syncDashboardFillContentState()
  resizeAutoDashboardItemsToContent()
  notifyDashboardContentResize()
}

// 清除用户布局覆盖并恢复默认占位；编辑中仅写入临时草稿并等待确认持久化。
async function resetDashboardGridLayout() {
  const shouldPersistImmediately = !isLayoutEditing.value

  dashboardGridLayout.value = {}
  if (shouldPersistImmediately) {
    await saveDashboardGridLayout({})
  }
  isDashboardGridLayoutResetDraft.value = isLayoutEditing.value
  dashboardGrid.value?.removeAll(false, false)
  await syncDashboardGrid()
  await nextTick()
  syncDashboardFillContentState()
  resizeAutoDashboardItemsToContent()
  notifyDashboardContentResize()
}

// 生成 appMode 底部动态按钮菜单，普通 Web 模式由页面内 FAB 承接。
const dashboardDynamicButtonMenuItems = computed<DynamicButtonMenuItem[] | undefined>(() => {
  if (!appMode.value) return undefined

  const items: DynamicButtonMenuItem[] = [
    {
      title: isLayoutEditing.value ? t('dashboard.exitEditMode') : t('dashboard.editLayout'),
      icon: isLayoutEditing.value ? 'mdi-check' : 'mdi-view-dashboard-edit',
      color: 'primary',
      permission: 'admin',
      action: toggleDashboardLayoutEditing,
    },
  ]

  if (isLayoutEditing.value) {
    items.push({
      title: t('dashboard.resetLayout'),
      icon: 'mdi-restore',
      color: 'warning',
      permission: 'admin',
      action: resetDashboardGridLayout,
    })
  }

  items.push({
    title: t('dashboard.settings'),
    icon: 'mdi-tune',
    color: 'info',
    permission: 'admin',
    action: openDashboardSettings,
  })

  return items
})

useDynamicButton({
  icon: 'mdi-view-dashboard-edit',
  menuItems: dashboardDynamicButtonMenuItems,
  permission: 'admin',
  show: computed(() => appMode.value && route.path === '/dashboard'),
})

// 切换仪表板布局编辑模式，点击确认退出时持久化当前布局草稿。
function toggleDashboardLayoutEditing() {
  if (isLayoutEditing.value) {
    void exitDashboardLayoutEditing()
    return
  }

  isDashboardGridLayoutResetDraft.value = false
  isLayoutEditing.value = true
  nextTick(syncDashboardGrid)
}

// 加载用户监控面板配置，优先使用服务端用户配置以支持跨浏览器同步。
async function loadDashboardConfig() {
  dashboardLayoutProfile.value = resolveDashboardLayoutProfile()
  // 顺序配置
  const order = await loadSharedDashboardConfig(
    DASHBOARD_ORDER_CONFIG_KEY,
    DASHBOARD_ORDER_STORAGE_KEY,
    normalizeDashboardOrderConfig,
  )
  if (order !== undefined) {
    orderConfig.value = order
  }
  // 设备档位配置同时承载 Grid 布局和显示项，显示项缺失时从旧版全局配置迁移。
  const profileConfig = await loadDashboardProfileConfig(dashboardLayoutProfile.value)
  const legacyEnable = profileConfig?.enabled === undefined ? await loadLegacyDashboardEnableConfig() : undefined
  const loadedLayout = profileConfig?.items ?? {}
  dashboardGridLayout.value = loadedLayout
  persistedDashboardGridLayout = cloneDashboardGridLayout(loadedLayout)
  isDashboardGridLayoutResetDraft.value = false
  enableConfig.value = mergeDashboardEnableConfig(profileConfig?.enabled ?? legacyEnable)
  if (profileConfig?.enabled === undefined && legacyEnable !== undefined) {
    await saveDashboardProfileConfig()
  }
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

  // 顺序配置，从dashboardConfigs中提取
  const orderObj = dashboardConfigs.value.map(item => ({ id: item.id, key: item.key }))
  saveLocalDashboardConfig(DASHBOARD_ORDER_STORAGE_KEY, orderObj)
  await saveDashboardProfileConfig()

  // 保存到服务端
  try {
    await saveUserDashboardConfig(DASHBOARD_ORDER_CONFIG_KEY, orderObj)
  } catch (error) {
    console.error(error)
  }
  // 保存后重新获取插件仪表板
  void getPluginDashboardMeta()
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
  try {
    pluginDashboardMeta.value = (await api.get('/plugin/dashboard/meta')) ?? []
    if (!isNullOrEmptyObject(pluginDashboardMeta.value)) {
      // 下载插件仪表板配置
      await Promise.all(
        pluginDashboardMeta.value.map(async (pluginDashboard: { id: string; key: string }) => {
          const pluginDashboardId = buildPluginDashboardId(pluginDashboard.id, pluginDashboard.key)
          // 初始化插件仪表板的刷新状态
          pluginDashboardRefreshStatus.value[pluginDashboardId] = true
          await getPluginDashboard(pluginDashboard.id, pluginDashboard.key)
        }),
      )
    }
  } catch (error) {
    console.error(error)
  }
}

// 清理指定插件仪表板的定时刷新任务。
function clearPluginDashboardTimer(pluginDashboardId: string) {
  if (!refreshTimers.value[pluginDashboardId]) return

  clearTimeout(refreshTimers.value[pluginDashboardId])
  delete refreshTimers.value[pluginDashboardId]
}

// 根据插件刷新配置安排下一次仪表板数据刷新。
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
      void getPluginDashboard(item.id, item.key)
    }, item.attrs.refresh * 1000)
  }
}

// 重新拉取当前启用的插件仪表板数据。
function refreshEnabledPluginDashboards() {
  if (isNullOrEmptyObject(pluginDashboardMeta.value)) return

  pluginDashboardMeta.value.forEach((pluginDashboard: { id: string; key: string }) => {
    const pluginDashboardId = buildPluginDashboardId(pluginDashboard.id, pluginDashboard.key)
    if (enableConfig.value[pluginDashboardId]) {
      void getPluginDashboard(pluginDashboard.id, pluginDashboard.key)
    }
  })
}

// 获取一个插件的仪表板配置项
async function getPluginDashboard(id: string, key: string) {
  try {
    const url = key ? `/plugin/dashboard/${id}/${key}` : `/plugin/dashboard/${id}`
    const res: DashboardItem | undefined = await api.get(url)
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
        // 排序
        sortDashboardConfigs()
      }
      // 定时刷新
      schedulePluginDashboardRefresh(res)
    }
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
        breakpointForWindow: true,
        breakpoints: [
          { w: DASHBOARD_GRID_MOBILE_BREAKPOINT, c: 1, layout: 'list' },
          { w: DASHBOARD_GRID_TABLET_BREAKPOINT, c: 6, layout: 'moveScale' },
          { w: DASHBOARD_GRID_DESKTOP_BREAKPOINT, c: DASHBOARD_GRID_COLUMNS, layout: 'moveScale' },
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
  dashboardGrid.value.on('resize', handleDashboardGridResize)
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
  syncDashboardFillContentState()

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
    syncDashboardFillContentState()
    observeDashboardGridContent()
    nextTick(() => {
      syncDashboardFillContentState()
      resizeAutoDashboardItemsToContent()
      scheduleDashboardReveal()
    })
  } finally {
    isSyncingDashboardGrid.value = false
  }
}

// 判断仪表板组件高度是否已被用户手动固定。
function hasManualDashboardGridHeight(id: string) {
  return dashboardGridLayout.value[id]?.h !== undefined
}

// 根据子组件声明的填充标记，同步 GridStack 外层测高节点的填充状态。
function syncDashboardFillContentState(element?: GridItemHTMLElement) {
  const gridElement = dashboardGridRef.value
  const itemElements = element
    ? [element]
    : Array.from(gridElement?.querySelectorAll<GridItemHTMLElement>('.dashboard-grid-item') ?? [])

  itemElements.forEach(itemElement => {
    itemElement.classList.toggle('has-fill-content', Boolean(itemElement.querySelector('.dashboard-grid-fill')))
  })
}

// 监听仪表板组件内容尺寸变化，让未手动调高的组件按内容高度自适应。
function observeDashboardGridContent() {
  const gridElement = dashboardGridRef.value
  if (!gridElement || typeof ResizeObserver === 'undefined') return

  syncDashboardFillContentState()
  dashboardGridContentObserver?.disconnect()
  dashboardGridPendingContentResize.clear()
  dashboardGridObservedContentHeights.clear()
  dashboardGridContentObserver = new ResizeObserver(entries => {
    entries.forEach(entry => {
      const itemElement = entry.target.closest('.dashboard-grid-item') as GridItemHTMLElement | null
      if (itemElement && shouldScheduleDashboardContentResize(itemElement, entry.contentRect.height)) {
        scheduleDashboardItemContentResize(itemElement)
      }
    })
  })

  gridElement.querySelectorAll<HTMLElement>('.dashboard-grid-auto-size').forEach(element => {
    dashboardGridContentObserver?.observe(element)
  })
}

// 判断内容高度变化是否足够触发 GridStack 行高重算，避免 hover 级微小波动造成布局抖动。
function shouldScheduleDashboardContentResize(element: GridItemHTMLElement, nextHeight: number) {
  const id = element.getAttribute('gs-id') ?? ''
  if (!id) return true

  const previousHeight = dashboardGridObservedContentHeights.get(id)
  dashboardGridObservedContentHeights.set(id, nextHeight)

  return (
    previousHeight === undefined || Math.abs(nextHeight - previousHeight) >= DASHBOARD_GRID_CONTENT_RESIZE_THRESHOLD
  )
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

  syncDashboardFillContentState(element)
  const shouldMeasureFillContent = element.classList.contains('has-fill-content')
  if (shouldMeasureFillContent) {
    element.classList.add('is-measuring-content')
  }

  try {
    grid.resizeToContent(element)
  } finally {
    if (shouldMeasureFillContent) {
      element.classList.remove('is-measuring-content')
    }
  }
}

// 将所有未手动固定高度的组件高度调整到内容实际高度。
function resizeAutoDashboardItemsToContent() {
  const gridElement = dashboardGridRef.value
  if (!gridElement) return

  syncDashboardFillContentState()
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
  notifyDashboardContentResize()
}

// 在用户缩放过程中通知图表、虚拟网格等内容重新读取容器尺寸。
function handleDashboardGridResize() {
  notifyDashboardContentResize()
}

// 缓存用户拖动后的位置，并保持未手动调高组件继续按内容自适应。
function handleDashboardGridDragStop() {
  void cacheCurrentDashboardGridLayout(false)
}

// 缓存用户缩放后的布局，只有高度发生变化时才把高度标记为手动固定。
function handleDashboardGridResizeStop(_event: Event, element: GridItemHTMLElement) {
  const id = element.getAttribute('gs-id') ?? ''
  const previousHeight = dashboardGridResizeStartHeights.get(id)
  const nextHeight = element.gridstackNode?.h
  const heightChanged = previousHeight !== undefined && nextHeight !== undefined && previousHeight !== nextHeight

  dashboardGridResizeStartHeights.delete(id)
  isDashboardGridResizing.value = false
  notifyDashboardContentResize()
  void cacheCurrentDashboardGridLayout(heightChanged ? id : false)
}

// 合并连续 resize 通知，模拟浏览器窗口变化让组件内部内容自适配新尺寸。
function notifyDashboardContentResize() {
  if (typeof window === 'undefined' || dashboardGridResizeRefreshFrame !== null) return

  dashboardGridResizeRefreshFrame = window.requestAnimationFrame(() => {
    dashboardGridResizeRefreshFrame = null
    window.dispatchEvent(new Event('resize'))
  })
}

// 将 GridStack 保存结果归一化为临时布局草稿。
function cacheDashboardGridLayoutDraft(manualHeightId: string | false = false) {
  if (!dashboardGrid.value || isSyncingDashboardGrid.value) return undefined

  const gridColumns = getCurrentDashboardGridColumns()
  const savedWidgets = dashboardGrid.value.save(false, false, undefined, gridColumns)
  const widgets = Array.isArray(savedWidgets) ? savedWidgets : (savedWidgets.children ?? [])
  const nextLayout = { ...dashboardGridLayout.value }

  widgets.forEach(widget => {
    if (!widget.id) return

    const id = String(widget.id)
    const width = clampGridNumber(widget.w, 1, gridColumns, getDefaultDashboardGridWidthById(id, gridColumns))
    const previousLayout = dashboardGridLayout.value[id]
    const nextItemLayout: DashboardGridLayoutItem = {
      x: clampGridNumber(widget.x, 0, gridColumns - width, 0),
      y: clampGridNumber(widget.y, 0, 999, 0),
      w: width,
    }

    if (manualHeightId === id || previousLayout?.h !== undefined) {
      nextItemLayout.h = clampGridNumber(widget.h, 1, 96, getDefaultDashboardGridRows())
    }

    nextLayout[id] = nextItemLayout
  })

  isPersistingDashboardGridLayoutFromGrid.value = true
  dashboardGridLayout.value = nextLayout
  isDashboardGridLayoutResetDraft.value = false
  nextTick(() => {
    isPersistingDashboardGridLayoutFromGrid.value = false
    resizeAutoDashboardItemsToContent()
  })

  return nextLayout
}

// 根据组件 ID 查找默认宽度，保存布局时用于兜底。
function getDefaultDashboardGridWidthById(id: string, maxColumns = DASHBOARD_GRID_COLUMNS) {
  const item = dashboardConfigs.value.find(config => buildPluginDashboardId(config.id, config.key) === id)

  return item ? Math.min(getDefaultDashboardGridWidth(item), maxColumns) : maxColumns
}

// 等待 GridStack 当前拖拽/缩放事件收尾后，把用户当前看到的布局写入临时草稿。
async function cacheCurrentDashboardGridLayout(manualHeightId: string | false = false) {
  if (!dashboardGrid.value || isSyncingDashboardGrid.value) return

  await nextTick()
  return cacheDashboardGridLayoutDraft(manualHeightId)
}

// 等待 GridStack 当前拖拽/缩放事件收尾后，持久化用户确认的临时布局草稿。
async function persistCurrentDashboardGridLayout(manualHeightId: string | false = false) {
  const nextLayout = await cacheCurrentDashboardGridLayout(manualHeightId)
  if (!nextLayout) return

  await saveDashboardGridLayout(nextLayout)
}

// 清理 GridStack 内部响应式布局缓存，并用当前 Vue 布局状态重新注册已有 DOM 节点。
async function reloadDashboardGridWidgetsFromLayout() {
  if (!dashboardGrid.value) return

  dashboardGrid.value.removeAll(false, false)
  await syncDashboardGrid()
}

watch(isLayoutEditing, value => {
  updateDashboardGridEditableState(value)
})

watch(
  dashboardGridItems,
  () => {
    syncDashboardLoadedItemIds()
    if (!isPersistingDashboardGridLayoutFromGrid.value) {
      syncDashboardGrid()
    }
    scheduleDashboardReveal()
  },
  { deep: true },
)

watch(
  () => display.width.value,
  async () => {
    const nextProfile = resolveDashboardLayoutProfile()
    if (nextProfile === dashboardLayoutProfile.value) return

    // GridStack 可能已先完成列数压缩；档位切换只读取目标配置，不能保存当前自动重排结果。
    const profileSwitchId = ++dashboardLayoutProfileSwitchId
    dashboardLayoutProfile.value = nextProfile
    const profileConfig = await loadDashboardProfileConfig(nextProfile)
    if (profileSwitchId !== dashboardLayoutProfileSwitchId || dashboardLayoutProfile.value !== nextProfile) return

    const legacyEnable = profileConfig?.enabled === undefined ? await loadLegacyDashboardEnableConfig() : undefined
    if (profileSwitchId !== dashboardLayoutProfileSwitchId || dashboardLayoutProfile.value !== nextProfile) return

    const loadedLayout = profileConfig?.items ?? {}
    dashboardGridLayout.value = loadedLayout
    persistedDashboardGridLayout = cloneDashboardGridLayout(loadedLayout)
    isDashboardGridLayoutResetDraft.value = false
    enableConfig.value = mergeDashboardEnableConfig(profileConfig?.enabled ?? legacyEnable)
    if (profileConfig?.enabled === undefined && legacyEnable !== undefined) {
      await saveDashboardProfileConfig()
    }
    updateDashboardSettingsDialog()
    dashboardGrid.value?.column(
      getDashboardGridColumnsForProfile(nextProfile),
      getDashboardGridColumnLayout(nextProfile),
    )
    dashboardGrid.value?.removeAll(false, false)
    await syncDashboardGrid()
    notifyDashboardContentResize()
  },
)

onBeforeMount(async () => {
  await loadDashboardConfig()
  await getPluginDashboardMeta()
  isDashboardConfigLoaded.value = true
  scheduleDashboardReveal()
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
  if (dashboardGridResizeRefreshFrame !== null) {
    cancelAnimationFrame(dashboardGridResizeRefreshFrame)
    dashboardGridResizeRefreshFrame = null
  }
  if (dashboardRevealFrame !== null) {
    cancelAnimationFrame(dashboardRevealFrame)
    dashboardRevealFrame = null
  }
  dashboardGridPendingContentResize.clear()
  dashboardGridObservedContentHeights.clear()
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
              @loaded="markDashboardGridItemLoaded(gridItem.id)"
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
    <div v-if="canAdmin" class="compact-fab-stack">
      <VFab
        icon="mdi-tune"
        color="info"
        variant="tonal"
        appear
        class="compact-fab compact-fab--secondary"
        @click="openDashboardSettings"
      />
      <VFab
        v-if="isLayoutEditing"
        icon="mdi-restore"
        color="warning"
        variant="tonal"
        appear
        class="compact-fab compact-fab--secondary"
        @click="resetDashboardGridLayout"
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
  pointer-events: auto;
  transition:
    opacity 0.45s cubic-bezier(0.25, 1, 0.5, 1),
    transform 0.45s cubic-bezier(0.25, 1, 0.5, 1);
  will-change: opacity, transform;
}

.dashboard-grid :deep(.v-card) {
  border: var(--app-surface-border);
  border-radius: var(--app-surface-radius);
  box-shadow: var(--app-surface-shadow);
}

.dashboard-grid :deep(.v-card-title) {
  font-size: 0.92rem;
  font-weight: 650;
}

/* 媒体卡片上浮 4px 时保留安全区，避免被标题栏或滚动容器顶边裁切。 */
.dashboard-grid :deep(.dashboard-media-content) {
  padding-block-start: 0.5rem;
}

.dashboard-grid-item.is-manual-height :deep(.v-card) {
  block-size: 100%;
}

/* 需要默认尺寸约束的组件可挂载此类，用户编辑后统一解除比例和最小高度。 */
.dashboard-grid-item.is-manual-height :deep(.dashboard-grid-adaptive-size),
.dashboard-grid.is-editing :deep(.dashboard-grid-adaptive-size) {
  aspect-ratio: auto;
  min-block-size: 0;
}

.dashboard-grid-item.is-manual-height :deep(.dashboard-work-card),
.dashboard-grid.is-editing :deep(.dashboard-work-card) {
  max-block-size: none;
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

.dashboard-grid-item.has-fill-content .dashboard-grid-auto-size,
.dashboard-grid-item.has-fill-content .dashboard-grid-content-measure {
  block-size: 100%;
  min-block-size: 100%;
}

.dashboard-grid-item.has-fill-content.is-measuring-content .dashboard-grid-auto-size,
.dashboard-grid-item.has-fill-content.is-measuring-content .dashboard-grid-content-measure {
  block-size: auto;
  min-block-size: 0;
}

/* 自动测高时解除填充卡片的百分比高度，避免浏览器缩放取整后把当前格子高度继续写回内容高度。 */
.dashboard-grid-item.has-fill-content.is-measuring-content :deep(.dashboard-grid-fill) {
  block-size: auto;
}

/* ApexCharts 会保留上一次容器高度；测高时只用最小绘图区参与计算，切断 resize 后高度逐轮放大的反馈。 */
.dashboard-grid-item.has-fill-content.is-measuring-content :deep(.dashboard-chart-plot) {
  flex: 0 0 auto;
  block-size: 120px;
  overflow: hidden;
}

.dashboard-grid.is-editing :deep(.v-card) {
  block-size: 100%;
}

.dashboard-grid.is-editing :deep(.v-card-text),
.dashboard-grid-item.is-manual-height :deep(.v-card-text) {
  overflow: auto;
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

@media (prefers-reduced-motion: reduce) {
  .dashboard-grid {
    transform: none;
    transition: none;
  }
}
</style>
