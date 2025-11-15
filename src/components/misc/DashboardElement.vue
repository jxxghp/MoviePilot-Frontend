<script setup lang="ts">
import api from '@/api'
import { DashboardItem } from '@/api/types'
import AnalyticsMediaStatistic from '@/views/dashboard/AnalyticsMediaStatistic.vue'
import AnalyticsScheduler from '@/views/dashboard/AnalyticsScheduler.vue'
import AnalyticsSpeed from '@/views/dashboard/AnalyticsSpeed.vue'
import AnalyticsStorage from '@/views/dashboard/AnalyticsStorage.vue'
import AnalyticsWeeklyOverview from '@/views/dashboard/AnalyticsWeeklyOverview.vue'
import AnalyticsCpu from '@/views/dashboard/AnalyticsCpu.vue'
import AnalyticsMemory from '@/views/dashboard/AnalyticsMemory.vue'
import AnalyticsNetwork from '@/views/dashboard/AnalyticsNetwork.vue'
import MediaServerLatest from '@/views/dashboard/MediaServerLatest.vue'
import MediaServerLibrary from '@/views/dashboard/MediaServerLibrary.vue'
import MediaServerPlaying from '@/views/dashboard/MediaServerPlaying.vue'
import DashboardRender from '@/components/render/DashboardRender.vue'
import { isNullOrEmptyObject } from '@/@core/utils'
import { loadRemoteComponent } from '@/utils/federationLoader'

// 输入参数
const props = defineProps({
  // 仪表板配置
  config: Object as PropType<DashboardItem>,
  // 刷新状态
  refreshStatus: Boolean,
  // 是否允许刷新数据
  allowRefresh: {
    type: Boolean,
    default: true,
  },
})

const emit = defineEmits(['update:refreshStatus'])

// 插件UI渲染模式 ('vuetify' 或 'vue')
const pluginRenderMode = computed(() => props.config?.render_mode || 'vuetify')

// Vue 模式：动态加载的组件
const dynamicPluginComponent = defineAsyncComponent({
  // 工厂函数
  loader: async () => {
    try {
      if (!props.config?.id) {
        throw new Error('插件ID不存在')
      }

      // 动态加载远程组件
      const module = await loadRemoteComponent(props.config.id, 'Dashboard')

      // 直接返回加载的组件，无需再获取default
      return module
    } catch (error) {
      console.error('加载远程组件失败:', error)
    }
  },
  // 加载中显示的组件
  loadingComponent: {
    template: '<VSkeletonLoader type="card"></VSkeletonLoader>',
  },
  // 添加错误处理
  errorComponent: {
    template: `
      <div class="pa-4">
        <VAlert type="error" title="组件加载错误">
          无法加载组件，请稍后再试
        </VAlert>
      </div>
    `,
  },
})

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
  <AnalyticsSpeed v-else-if="config?.id === 'speed'" :allowRefresh="props.allowRefresh" />
  <AnalyticsScheduler v-else-if="config?.id === 'scheduler'" :allowRefresh="props.allowRefresh" />
  <AnalyticsCpu v-else-if="config?.id === 'cpu'" :allowRefresh="props.allowRefresh" />
  <AnalyticsMemory v-else-if="config?.id === 'memory'" :allowRefresh="props.allowRefresh" />
  <AnalyticsNetwork v-else-if="config?.id === 'network'" :allowRefresh="props.allowRefresh" />
  <MediaServerLibrary v-else-if="config?.id === 'library'" />
  <MediaServerPlaying v-else-if="config?.id === 'playing'" />
  <MediaServerLatest v-else-if="config?.id === 'latest'" />
  <!-- 插件仪表板 -->
  <template v-else-if="!isNullOrEmptyObject(props.config)">
    <!-- Vue 渲染模式 -->
    <div v-if="pluginRenderMode === 'vue'">
      <component :is="dynamicPluginComponent" :config="props.config" :allow-refresh="props.allowRefresh" :api="api" />
    </div>
    <!-- Vuetify 渲染模式 -->
    <VHover v-else-if="pluginRenderMode === 'vuetify'">
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
    <!-- 未知模式或错误 -->
    <VCard v-else>
      <VCardText>无法渲染插件仪表盘部件: 未知渲染模式或配置错误</VCardText>
    </VCard>
  </template>
</template>
