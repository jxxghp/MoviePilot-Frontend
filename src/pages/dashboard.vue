<script setup lang="ts">
import draggable from 'vuedraggable'
import api from '@/api'
import { isNullOrEmptyObject } from '@/@core/utils'
import { useDisplay } from 'vuetify'
import { DashboardItem } from '@/api/types'
import store from '@/store'
import DashboardElement from '@/components/misc/DashboardElement.vue'

// 显示器宽度
const display = useDisplay()

// 从Vuex Store中获取superuser信息
const superUser = store.state.auth.superUser

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
const orderConfig = ref<{ id: string }[]>([])

// 仪表板配置
const dashboardConfigs = ref<DashboardItem[]>([
  {
    id: 'storage',
    name: '存储空间',
    attrs: {},
    cols: { cols: 12, md: 4 },
    elements: [],
  },
  {
    id: 'mediaStatistic',
    name: '媒体统计',
    attrs: {},
    cols: { cols: 12, md: 8 },
    elements: [],
  },
  {
    id: 'weeklyOverview',
    name: '最近入库',
    attrs: {},
    cols: { cols: 12, md: 4 },
    elements: [],
  },
  {
    id: 'speed',
    name: '实时速率',
    attrs: {},
    cols: { cols: 12, md: 4 },
    elements: [],
  },
  {
    id: 'scheduler',
    name: '后台任务',
    attrs: {},
    cols: { cols: 12, md: 4 },
    elements: [],
  },
  {
    id: 'cpu',
    name: 'CPU',
    attrs: {},
    cols: { cols: 12, md: 6 },
    elements: [],
  },
  {
    id: 'memory',
    name: '内存',
    attrs: {},
    cols: { cols: 12, md: 6 },
    elements: [],
  },
  {
    id: 'library',
    name: '我的媒体库',
    attrs: {},
    cols: { cols: 12 },
    elements: [],
  },
  {
    id: 'playing',
    name: '继续观看',
    attrs: {},
    cols: { cols: 12 },
    elements: [],
  },
  {
    id: 'latest',
    name: '最近添加',
    attrs: {},
    cols: { cols: 12 },
    elements: [],
  },
])

// 有仪表板的插件
const dashboardPlugins = ref<any[]>([])

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
  // 排序
  if (orderConfig.value) {
    sortDashboardConfigs()
  }
}

// 按order的顺序对dashboardConfigs进行排序
function sortDashboardConfigs() {
  dashboardConfigs.value.sort((a, b) => {
    const aIndex = orderConfig.value.findIndex((item: { id: string }) => item.id === a.id)
    const bIndex = orderConfig.value.findIndex((item: { id: string }) => item.id === b.id)
    return (aIndex === -1 ? 999 : aIndex) - (bIndex === -1 ? 999 : bIndex)
  })
}

// 设置项目
function saveDashboardConfig() {
  // 启用配置
  const data = JSON.stringify(enableConfig.value)
  localStorage.setItem('MP_DASHBOARD', data)
  // 顺序配置，从dashboardConfigs中提取
  const order = JSON.stringify(dashboardConfigs.value.map(item => ({ id: item.id })))
  localStorage.setItem('MP_DASHBOARD_ORDER', order)
  // 保存到服务端
  try {
    api.post('/user/config/Dashboard', data, {
      headers: {
        'Content-Type': 'application/json',
      },
    })
    api.post('/user/config/DashboardOrder', order, {
      headers: {
        'Content-Type': 'application/json',
      },
    })
  } catch (error) {
    console.error(error)
  }
  dialog.value = false
}

// 调用API获取有仪表板的插件
async function getDashboardPlugins() {
  // 只有超级用户才能获取插件仪表板
  if (!superUser) return
  try {
    dashboardPlugins.value = await api.get('/plugin/dashboards')
    if (!isNullOrEmptyObject(dashboardPlugins.value)) {
      // 下载插件仪表板配置
      dashboardPlugins.value.forEach(async (plugin: { id: string }) => {
        await getPluginDashboard(plugin.id)
      })
    }
  } catch (error) {
    console.error(error)
  }
}

// 获取一个插件的仪表板配置项
async function getPluginDashboard(id: string) {
  try {
    api.get(`/plugin/dashboard/${id}`).then((res: any) => {
      if (res) {
        // 保存到仪表板配置中
        dashboardConfigs.value.push(res)
        // 排序
        sortDashboardConfigs()
        // 定时刷新
        if (res.attrs?.refresh) {
          setTimeout(() => {
            getPluginDashboard(id)
          }, res.attrs.refresh * 1000)
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
  getDashboardPlugins()
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
    :component-data="{ 'class': 'match-height' }"
  >
    <template #item="{ element }">
      <VCol v-if="enableConfig[element.id] && element.cols" v-bind:="element.cols">
        <DashboardElement :config="element" />
      </VCol>
    </template>
  </draggable>

  <!-- 底部操作按钮 -->
  <VFab icon="mdi-view-dashboard-edit" location="bottom end" size="x-large" fixed app appear @click="dialog = true" />

  <!-- 弹窗，根据配置生成选项 -->
  <VDialog v-model="dialog" max-width="35rem" scrollable :fullscreen="!display.mdAndUp.value">
    <VCard>
      <VCardItem>
        <VCardTitle>设置仪表板</VCardTitle>
      </VCardItem>
      <VDivider />
      <VCardText>
        <VRow>
          <VCol v-for="item in dashboardConfigs" :key="item.id" cols="6" md="4" sm="4">
            <VCheckbox v-model="enableConfig[item.id]" :label="item.name" />
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
