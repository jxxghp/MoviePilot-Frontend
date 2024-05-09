<script setup lang="ts">
import { DashboardItem } from '@/api/types'
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
import { isNullOrEmptyObject } from '@/@core/utils'
// 输入参数
const props = defineProps({
  // 仪表板配置
  config: Object as PropType<DashboardItem>,
})

console.log(props.config)
</script>
<template>
  <!-- 系统内置的仪表板 -->
  <AnalyticsStorage v-if="config?.id === 'storage'" />
  <AnalyticsMediaStatistic v-else-if="config?.id === 'mediaStatistic'" />
  <AnalyticsWeeklyOverview v-else-if="config?.id === 'weeklyOverview'" />
  <AnalyticsSpeed v-else-if="config?.id === 'speed'" />
  <AnalyticsScheduler v-else-if="config?.id === 'scheduler'" />
  <AnalyticsCpu v-else-if="config?.id === 'cpu'" />
  <AnalyticsMemory v-else-if="config?.id === 'memory'" />
  <MediaServerLibrary v-else-if="config?.id === 'library'" />
  <MediaServerPlaying v-else-if="config?.id === 'playing'" />
  <MediaServerLatest v-else-if="config?.id === 'latest'" />
  <!-- 插件仪表板 -->
  <VCard v-else-if="!isNullOrEmptyObject(props.config)">
    <VCardItem>
      <VCardTitle class="cursor-move">{{ props.config?.name }}</VCardTitle>
    </VCardItem>
    <VCardItem>
      <DashboardRender v-for="(item, index) in props.config?.elements" :key="index" :config="item" />
    </VCardItem>
  </VCard>
</template>
