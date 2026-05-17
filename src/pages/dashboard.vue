<script setup lang="ts">
import draggable from 'vuedraggable'
import api from '@/api'
import { isNullOrEmptyObject } from '@/@core/utils'
import { DashboardItem } from '@/api/types'
import { useUserStore } from '@/stores'
import DashboardElement from '@/components/misc/DashboardElement.vue'
import { useDynamicButton } from '@/composables/useDynamicButton'
import { useI18n } from 'vue-i18n'
import { usePWA } from '@/composables/usePWA'
import { getItemColor, initializeItemColors } from '@/utils/colorUtils'
import { openSharedDialog } from '@/composables/useSharedDialog'

const ContentToggleSettingsDialog = defineAsyncComponent(() => import('@/components/dialog/ContentToggleSettingsDialog.vue'))

// 国际化
const { t } = useI18n()

// PWA模式检测
const { appMode } = usePWA()

// 路由
const route = useRoute()

// 从用户 Store 中获取superuser信息
const superUser = useUserStore().superUser

// 是否拉升高度
const isElevated = ref(true)

// 是否发送请求的总开关
const isRequest = ref(true)

// 计算属性，控制是否拉升高度
const elevatedConf = controlledComputed(
  () => isElevated.value,
  () => ({
    class: { 'match-height': isElevated.value },
  }),
)

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
    elements: [],
  },
  {
    id: 'mediaStatistic',
    name: t('dashboard.mediaStatistic'),
    key: '',
    attrs: {},
    cols: { cols: 12, md: 8 },
    elements: [],
  },
  {
    id: 'weeklyOverview',
    name: t('dashboard.weeklyOverview'),
    key: '',
    attrs: {},
    cols: { cols: 12, md: 4 },
    elements: [],
  },
  {
    id: 'speed',
    name: t('dashboard.realTimeSpeed'),
    key: '',
    attrs: {},
    cols: { cols: 12, md: 4 },
    elements: [],
  },
  {
    id: 'scheduler',
    name: t('dashboard.scheduler'),
    key: '',
    attrs: {},
    cols: { cols: 12, md: 4 },
    elements: [],
  },
  {
    id: 'cpu',
    name: t('dashboard.cpu'),
    key: '',
    attrs: {},
    cols: { cols: 12, md: 6 },
    elements: [],
  },
  {
    id: 'memory',
    name: t('dashboard.memory'),
    key: '',
    attrs: {},
    cols: { cols: 12, md: 6 },
    elements: [],
  },
  {
    id: 'network',
    name: t('dashboard.network'),
    key: '',
    attrs: {},
    cols: { cols: 12, md: 6 },
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

// 初始化颜色
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
      elevated: isElevated.value,
      enabled: enableConfig.value,
      hint: t('dashboard.chooseContent'),
      items: dashboardConfigs.value,
      labelGetter: (item: DashboardItem) => item.attrs?.title ?? item.name,
      switchLabel: t('dashboard.adaptiveHeight'),
      title: t('dashboard.settings'),
      valueGetter: (item: DashboardItem) => buildPluginDashboardId(item.id, item.key),
    },
    {
      close: () => {
        settingsDialogController = null
      },
      save: saveDashboardConfig,
      'update:elevated': (value: boolean) => {
        isElevated.value = value
      },
      'update:modelValue': (value: boolean) => {
        if (!value) settingsDialogController = null
      },
    },
    { closeOn: ['close', 'update:modelValue'] },
  )
}

useDynamicButton({
  icon: 'mdi-view-dashboard-edit',
  onClick: openDashboardSettings,
})

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
  // 是否拉升高度
  const local_elevated = localStorage.getItem('MP_DASHBOARD_ELEVATED')
  if (local_elevated) isElevated.value = local_elevated === 'true'
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
async function saveDashboardConfig(payload?: { elevated?: boolean; enabled?: Record<string, boolean> }) {
  if (payload?.enabled) {
    enableConfig.value = payload.enabled
  }
  if (payload?.elevated !== undefined) {
    isElevated.value = payload.elevated
  }

  // 启用配置
  const enableString = JSON.stringify(enableConfig.value)
  localStorage.setItem('MP_DASHBOARD', enableString)

  // 顺序配置，从dashboardConfigs中提取
  const orderObj = dashboardConfigs.value.map(item => ({ id: item.id, key: item.key }))
  const orderString = JSON.stringify(orderObj)
  localStorage.setItem('MP_DASHBOARD_ORDER', orderString)

  // 是否拉升高度
  localStorage.setItem('MP_DASHBOARD_ELEVATED', isElevated.value.toString())

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

// 拖动排序结束
function dragOrderEnd() {
  // 保存数据
  saveDashboardConfig()
}

onBeforeMount(async () => {
  await loadDashboardConfig()
  initializeColors()
  getPluginDashboardMeta()
})

onActivated(() => {
  isRequest.value = true
  refreshEnabledPluginDashboards()
})

onDeactivated(() => {
  isRequest.value = false
  Object.keys(refreshTimers.value).forEach(clearPluginDashboardTimer)
})
</script>

<template>
  <!-- 仪表板 -->
  <draggable
    v-model="dashboardConfigs"
    @end="dragOrderEnd"
    handle=".cursor-move"
    item-key="id"
    tag="VRow"
    :component-data="elevatedConf"
  >
    <template #item="{ element }">
      <VCol v-if="enableConfig[buildPluginDashboardId(element.id, element.key)] && element.cols" v-bind:="element.cols">
        <DashboardElement
          :config="element"
          :allow-refresh="isRequest"
          v-model:refreshStatus="pluginDashboardRefreshStatus[buildPluginDashboardId(element.id, element.key)]"
        />
      </VCol>
    </template>
  </draggable>

  <!-- 底部操作按钮（只在非移动设备上显示） -->
  <Teleport to="body" v-if="route.path === '/dashboard'">
    <div v-if="!appMode" class="compact-fab-stack">
      <VFab
        icon="mdi-view-dashboard-edit"
        color="primary"
        appear
        class="compact-fab compact-fab--primary"
        @click="openDashboardSettings"
      />
    </div>
  </Teleport>

</template>
