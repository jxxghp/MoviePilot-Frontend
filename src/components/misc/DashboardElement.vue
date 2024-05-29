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
  // 刷新状态
  refreshStatus: Boolean,
})

const emit = defineEmits(['update:refreshStatus'])

onUnmounted(() => {
  // 组件卸载时禁用刷新状态
  emit('update:refreshStatus', false)
})
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
  <VHover v-else-if="!isNullOrEmptyObject(props.config)">
    <template #default="hover">
      <!-- 无边框 -->
      <div v-if="props.config?.attrs.border === false">
        <VCard v-bind="hover.props">
          <VCardText class="p-0">
            <DashboardRender v-for="(item, index) in props.config?.elements" :key="index" :config="item" />
          </VCardText>
          <div v-if="hover.isHovering" class="absolute right-5 top-5">
            <VIcon class="cursor-move">mdi-drag</VIcon>
          </div>
        </VCard>
      </div>
      <!-- 有边框 -->
      <VCard v-else v-bind="hover.props">
        <VCardItem v-if="props.config?.attrs.border !== false">
          <template #append>
            <VIcon class="cursor-move" v-if="hover.isHovering">mdi-drag</VIcon>
          </template>
          <VCardTitle>
            {{ props.config?.attrs?.title ?? props.config?.name }}
          </VCardTitle>
          <VCardSubtitle v-if="props.config?.attrs?.subtitle"> {{ props.config?.attrs?.subtitle }}</VCardSubtitle>
        </VCardItem>
        <VCardText>
          <DashboardRender v-for="(item, index) in props.config?.elements" :key="index" :config="item" />
        </VCardText>
      </VCard>
    </template>
  </VHover>
</template>
