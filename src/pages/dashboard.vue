<script setup lang="ts">
import draggable from 'vuedraggable'
import api from '@/api'
import { isNullOrEmptyObject } from '@/@core/utils'
import { DashboardItem } from '@/api/types'
import store from '@/store'
import DashboardElement from '@/components/misc/DashboardElement.vue'
import { useDisplay } from 'vuetify'

// APP
const display = useDisplay()
const appMode = computed(() => {
  return localStorage.getItem('MP_APPMODE') != '0' && display.mdAndDown.value
})

// 从Vuex Store中获取superuser信息
const superUser = store.state.auth.superUser

// 是否拉升高度
const isElevated = ref(true)

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
    name: '存储空间',
    key: '',
    attrs: {},
    cols: { cols: 12, md: 4 },
    elements: [],
  },
  {
    id: 'mediaStatistic',
    name: '媒体统计',
    key: '',
    attrs: {},
    cols: { cols: 12, md: 8 },
    elements: [],
  },
  {
    id: 'weeklyOverview',
    name: '最近入库',
    key: '',
    attrs: {},
    cols: { cols: 12, md: 4 },
    elements: [],
  },
  {
    id: 'speed',
    name: '实时速率',
    key: '',
    attrs: {},
    cols: { cols: 12, md: 4 },
    elements: [],
  },
  {
    id: 'scheduler',
    name: '后台任务',
    key: '',
    attrs: {},
    cols: { cols: 12, md: 4 },
    elements: [],
  },
  {
    id: 'cpu',
    name: 'CPU',
    key: '',
    attrs: {},
    cols: { cols: 12, md: 6 },
    elements: [],
  },
  {
    id: 'memory',
    name: '内存',
    key: '',
    attrs: {},
    cols: { cols: 12, md: 6 },
    elements: [],
  },
  {
    id: 'library',
    name: '我的媒体库',
    key: '',
    attrs: {},
    cols: { cols: 12 },
    elements: [],
  },
  {
    id: 'playing',
    name: '继续观看',
    key: '',
    attrs: {},
    cols: { cols: 12 },
    elements: [],
  },
  {
    id: 'latest',
    name: '最近添加',
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

// 弹窗
const dialog = ref(false)

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
async function saveDashboardConfig() {
  // 启用配置
  const data = JSON.stringify(enableConfig.value)
  localStorage.setItem('MP_DASHBOARD', data)
  // 顺序配置，从dashboardConfigs中提取
  const order = JSON.stringify(dashboardConfigs.value.map(item => ({ id: item.id, key: item.key })))
  localStorage.setItem('MP_DASHBOARD_ORDER', order)
  // 是否拉升高度
  localStorage.setItem('MP_DASHBOARD_ELEVATED', isElevated.value.toString())
  // 保存到服务端
  try {
    await api.post('/user/config/Dashboard', data, {
      headers: {
        'Content-Type': 'application/json',
      },
    })
    await api.post('/user/config/DashboardOrder', order, {
      headers: {
        'Content-Type': 'application/json',
      },
    })
  } catch (error) {
    console.error(error)
  }
  // 保存后重新获取插件仪表板
  getPluginDashboardMeta()
  dialog.value = false
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
          // 排序
          sortDashboardConfigs()
        }
        const pluginDashboardId = buildPluginDashboardId(id, key)
        // 定时刷新
        if (
          res.attrs?.refresh &&
          pluginDashboardRefreshStatus.value[pluginDashboardId] &&
          enableConfig.value[pluginDashboardId]
        ) {
          // 清除之前的定时器
          if (refreshTimers.value[pluginDashboardId]) {
            clearTimeout(refreshTimers.value[pluginDashboardId])
          }
          // 设置新的定时器
          let timer = setTimeout(() => {
            getPluginDashboard(id, key)
          }, res.attrs.refresh * 1000)
          refreshTimers.value[pluginDashboardId] = timer
        }
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
  getPluginDashboardMeta()
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
          v-model:refreshStatus="pluginDashboardRefreshStatus[buildPluginDashboardId(element.id, element.key)]"
        />
      </VCol>
    </template>
  </draggable>

  <!-- 底部操作按钮 -->
  <VFab
    icon="mdi-view-dashboard-edit"
    location="bottom"
    size="x-large"
    fixed
    app
    appear
    @click="dialog = true"
    :class="{ 'mb-12': appMode }"
  />

  <!-- 弹窗，根据配置生成选项 -->
  <VDialog v-model="dialog" max-width="35rem" scrollable>
    <VCard>
      <VCardItem>
        <VCardTitle>设置仪表板</VCardTitle>
      </VCardItem>
      <VDivider />
      <VCardText>
        <VRow>
          <VCol
            v-for="item in dashboardConfigs"
            :key="buildPluginDashboardId(item.id, item.key)"
            cols="6"
            md="4"
            sm="4"
          >
            <VCheckbox
              v-model="enableConfig[buildPluginDashboardId(item.id, item.key)]"
              :label="item.attrs?.title ?? item.name"
            />
          </VCol>
        </VRow>
        <VRow>
          <VCol cols="12" md="6">
            <VSwitch v-model="isElevated" label="自适应组件高度" />
          </VCol>
        </VRow>
      </VCardText>
      <VDivider />
      <VCardText class="pt-5 text-end">
        <VSpacer />
        <VBtn variant="outlined" color="secondary" class="me-4" @click="dialog = false"> 关闭 </VBtn>
        <VBtn @click="saveDashboardConfig">
          <template #prepend>
            <VIcon icon="mdi-content-save" />
          </template>
          保存
        </VBtn>
      </VCardText>
    </VCard>
  </VDialog>
</template>
