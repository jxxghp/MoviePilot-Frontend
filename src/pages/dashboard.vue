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
import MediaServerPlayActivity from '@/views/dashboard/MediaServerPlayActivity.vue'

// 仪表盘配置
const dashboard_names = {
  storage: '存储空间',
  mediaStatistic: '媒体统计',
  weeklyOverview: '最近入库',
  speed: '实时速率',
  scheduler: '后台任务',
  cpu: 'CPU',
  memory: '内存',
  playActivity: '活动图',
  library: '我的媒体库',
  playing: '继续观看',
  latest: '最近添加',
}

// 弹窗
const dialog = ref(false)

// 从localStorage中获取数据
const default_config = {
  mediaStatistic: true,
  scheduler: false,
  speed: false,
  storage: true,
  weeklyOverview: false,
  cpu: false,
  memory: false,
  playActivity: false,
  library: true,
  playing: true,
  latest: true,
}
const config = ref(JSON.parse(localStorage.getItem('MP_DASHBOARD') || '{}'))
if (Object.keys(config.value).length === 0) {
  config.value = default_config
  localStorage.setItem('MP_DASHBOARD', JSON.stringify(config.value))
}

// 设置项目
function setDashboardConfig() {
  localStorage.setItem('MP_DASHBOARD', JSON.stringify(config.value))
  dialog.value = false
}
</script>

<template>
  <VRow class="match-height">
    <VCol
      v-if="config.storage"
      cols="12"
      md="4"
    >
      <AnalyticsStorage />
    </VCol>

    <VCol
      v-if="config.mediaStatistic"
      cols="12"
      md="8"
    >
      <AnalyticsMediaStatistic />
    </VCol>

    <VCol
      v-if="config.weeklyOverview"
      cols="12"
      md="4"
    >
      <AnalyticsWeeklyOverview />
    </VCol>

    <VCol
      v-if="config.speed"
      cols="12"
      md="4"
    >
      <AnalyticsSpeed />
    </VCol>

    <VCol
      v-if="config.scheduler"
      cols="12"
      md="4"
    >
      <AnalyticsScheduler />
    </VCol>

    <VCol
      v-if="config.cpu"
      cols="12"
      md="6"
    >
      <AnalyticsCpu />
    </VCol>

    <VCol
      v-if="config.memory"
      cols="12"
      md="6"
    >
      <AnalyticsMemory />
    </VCol>

    <VCol
      v-if="config.playActivity"
      cols="12"
      md="8"
    >
      <MediaServerPlayActivity />
    </VCol>

    <VCol
      v-if="config.library"
      cols="12"
    >
      <MediaServerLibrary />
    </VCol>

    <VCol
      v-if="config.playing"
      cols="12"
    >
      <MediaServerPlaying />
    </VCol>

    <VCol
      v-if="config.latest"
      cols="12"
    >
      <MediaServerLatest />
    </VCol>
  </VRow>
  <!-- 底部操作按钮 -->
  <span class="fixed right-5 bottom-5">
    <VBtn icon="mdi-view-dashboard-edit" class="me-2" color="primary" size="x-large" @click="dialog = true" />
  </span>
  <!-- 弹窗，根据配置生成选项 -->
  <VDialog
    v-model="dialog"
    max-width="600"
    scrollable
  >
    <VCard title="设置仪表板">
      <VCardText>
        <VRow>
          <VCol
            v-for="(item, key) in dashboard_names"
            :key="key"
            cols="12"
            md="4"
          >
            <VCheckbox
              v-model="config[key]"
              :label="dashboard_names[key]"
            />
          </VCol>
        </VRow>
      </VCardText>
      <VCardActions>
        <VBtn
          color="primary"
          @click="dialog = false"
        >
          取消
        </VBtn>
        <VSpacer />
        <VBtn
          color="primary"
          @click="setDashboardConfig"
        >
          保存
        </VBtn>
      </VCardActions>
    </VCard>
  </vdialog>
</template>
