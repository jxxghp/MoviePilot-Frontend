<script setup lang="ts">
import AnalyticsMediaStatistic from '@/views/dashboard/AnalyticsMediaStatistic.vue'
import AnalyticsScheduler from '@/views/dashboard/AnalyticsScheduler.vue'
import AnalyticsSpeed from '@/views/dashboard/AnalyticsSpeed.vue'
import AnalyticsStorage from '@/views/dashboard/AnalyticsStorage.vue'
import AnalyticsWeeklyOverview from '@/views/dashboard/AnalyticsWeeklyOverview.vue'
import AnalyticsCpu from '@/views/dashboard/AnalyticsCpu.vue'
import AnalyticsMemory from '@/views/dashboard/AnalyticsMemory.vue'
import MediaServerLatest from '@/views/dashboard/MediaServerLatest.vue'
import MediaServerLibrary from '@/views/dashboard/MediaServerLibrary.vue'
import MediaServerPlaying from '@/views/dashboard/MediaServerPlaying.vue'
import DashboardRender from '@/components/render/DashboardRender.vue'
import api from '@/api'
import { isNullOrEmptyObject } from '@/@core/utils'
import { useDisplay } from 'vuetify'
import { PluginDashboard } from '@/api/types'
import store from '@/store'

// 显示器宽度
const display = useDisplay()

// 从Vuex Store中获取superuser信息
const superUser = store.state.auth.superUser

// 从localStorage中获取数据
const default_config = {
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
}

// 仪表盘字典
const dashboard_names = ref<{ [key: string]: string }>({
  storage: '存储空间',
  mediaStatistic: '媒体统计',
  weeklyOverview: '最近入库',
  speed: '实时速率',
  scheduler: '后台任务',
  cpu: 'CPU',
  memory: '内存',
  library: '我的媒体库',
  playing: '继续观看',
  latest: '最近添加',
})

// 有仪表板的插件
const dashboard_plugins = ref<any[]>([])

// 插件仪表板配置
const plugin_dashboards = ref<PluginDashboard[]>([])

// 弹窗
const dialog = ref(false)

// 初始化默认值
const config = ref(JSON.parse(localStorage.getItem('MP_DASHBOARD') || '{}'))
if (isNullOrEmptyObject(config.value)) {
  config.value = default_config
}

// 设置项目
function setDashboardConfig() {
  const data = JSON.stringify(config.value)
  localStorage.setItem('MP_DASHBOARD', data)
  // 保存到服务端
  api.post('/user/config/Dashboard', data, {
    headers: {
      'Content-Type': 'application/json',
    },
  })
  dialog.value = false
}

// 调用API获取有仪表板的插件
async function getDashboardPlugins() {
  // 只有超级用户才能获取插件仪表板
  if (!superUser) return
  try {
    dashboard_plugins.value = await api.get('/plugin/dashboards')
    if (!isNullOrEmptyObject(dashboard_plugins.value)) {
      // 获取id和name补充到 dashboard_names 中
      dashboard_plugins.value.forEach((plugin: { [key: string]: string }) => {
        dashboard_names.value[plugin.id] = plugin.name
      })
      // 下载插件仪表板配置
      dashboard_plugins.value.forEach(async (plugin: { id: string }) => {
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
        plugin_dashboards.value.push(res)
        if (res.attrs?.refresh) {
          // 定时刷新
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

onMounted(() => {
  getDashboardPlugins()
})
</script>

<template>
  <!-- 底部操作按钮 -->
  <VFab icon="mdi-view-dashboard-edit" location="bottom end" size="x-large" fixed app appear @click="dialog = true" />
  <!-- 仪表板 -->
  <VRow class="match-height">
    <!-- 系统内置的仪表板 -->
    <VCol v-if="config.storage" cols="12" md="4">
      <AnalyticsStorage />
    </VCol>
    <VCol v-if="config.mediaStatistic" cols="12" md="8">
      <AnalyticsMediaStatistic />
    </VCol>
    <VCol v-if="config.weeklyOverview" cols="12" md="4">
      <AnalyticsWeeklyOverview />
    </VCol>
    <VCol v-if="config.speed" cols="12" md="4">
      <AnalyticsSpeed />
    </VCol>
    <VCol v-if="config.scheduler" cols="12" md="4">
      <AnalyticsScheduler />
    </VCol>
    <VCol v-if="config.cpu" cols="12" md="6">
      <AnalyticsCpu />
    </VCol>
    <VCol v-if="config.memory" cols="12" md="6">
      <AnalyticsMemory />
    </VCol>
    <VCol v-if="config.library" cols="12">
      <MediaServerLibrary />
    </VCol>
    <VCol v-if="config.playing" cols="12">
      <MediaServerPlaying />
    </VCol>
    <VCol v-if="config.latest" cols="12">
      <MediaServerLatest />
    </VCol>
    <!-- 插件仪表板 -->
    <template v-for="plugin in plugin_dashboards" :key="plugin.id">
      <VCol v-if="config[plugin.id]" v-bind="plugin.cols">
        <VCard :title="plugin.name">
          <VCardItem>
            <DashboardRender v-for="(item, index) in plugin.elements" :key="index" :config="item" />
          </VCardItem>
        </VCard>
      </VCol>
    </template>
  </VRow>

  <!-- 弹窗，根据配置生成选项 -->
  <VDialog v-model="dialog" max-width="35rem" scrollable :fullscreen="!display.mdAndUp.value">
    <VCard>
      <VCardItem>
        <VCardTitle>设置仪表板</VCardTitle>
      </VCardItem>
      <VDivider />
      <VCardText>
        <VRow>
          <VCol v-for="(name, key) in dashboard_names" :key="key" cols="12" md="4" sm="4">
            <VCheckbox v-model="config[key]" :label="name" />
          </VCol>
        </VRow>
      </VCardText>
      <VDivider />
      <VCardText class="pt-5 text-end">
        <VSpacer />
        <VBtn variant="outlined" color="secondary" class="me-4" @click="dialog = false"> 关闭 </VBtn>
        <VBtn @click="setDashboardConfig">
          <template #prepend>
            <VIcon icon="mdi-content-save" />
          </template>
          保存
        </VBtn>
      </VCardText>
    </VCard>
  </VDialog>
</template>
