<script setup lang="ts">
import { h, resolveComponent } from 'vue'
import api from '@/api'
import { DashboardItem } from '@/api/types'
import DashboardRender from '@/components/render/DashboardRender.vue'
import { isNullOrEmptyObject } from '@/@core/utils'
import { loadRemoteComponent } from '@/utils/federationLoader'

const DashboardSkeleton = {
  setup() {
    const SkeletonLoader = resolveComponent('VSkeletonLoader')

    // 用 render 函数避免 runtime-only Vue 为异步 loadingComponent 解析模板。
    return () => h(SkeletonLoader, { type: 'card' })
  },
}

const asyncDashboardOptions = {
  loadingComponent: DashboardSkeleton,
}

// 内置仪表盘按需加载，关闭的卡片不再挤进 dashboard 首屏 chunk。
const AnalyticsStorage = defineAsyncComponent({
  loader: () => import('@/views/dashboard/AnalyticsStorage.vue'),
  ...asyncDashboardOptions,
})
const AnalyticsMediaStatistic = defineAsyncComponent({
  loader: () => import('@/views/dashboard/AnalyticsMediaStatistic.vue'),
  ...asyncDashboardOptions,
})
const AnalyticsWeeklyOverview = defineAsyncComponent({
  loader: () => import('@/views/dashboard/AnalyticsWeeklyOverview.vue'),
  ...asyncDashboardOptions,
})
const AnalyticsSpeed = defineAsyncComponent({
  loader: () => import('@/views/dashboard/AnalyticsSpeed.vue'),
  ...asyncDashboardOptions,
})
const AnalyticsScheduler = defineAsyncComponent({
  loader: () => import('@/views/dashboard/AnalyticsScheduler.vue'),
  ...asyncDashboardOptions,
})
const AnalyticsCpu = defineAsyncComponent({
  loader: () => import('@/views/dashboard/AnalyticsCpu.vue'),
  ...asyncDashboardOptions,
})
const AnalyticsMemory = defineAsyncComponent({
  loader: () => import('@/views/dashboard/AnalyticsMemory.vue'),
  ...asyncDashboardOptions,
})
const AnalyticsNetwork = defineAsyncComponent({
  loader: () => import('@/views/dashboard/AnalyticsNetwork.vue'),
  ...asyncDashboardOptions,
})
const MediaServerLibrary = defineAsyncComponent({
  loader: () => import('@/views/dashboard/MediaServerLibrary.vue'),
  ...asyncDashboardOptions,
})
const MediaServerPlaying = defineAsyncComponent({
  loader: () => import('@/views/dashboard/MediaServerPlaying.vue'),
  ...asyncDashboardOptions,
})
const MediaServerLatest = defineAsyncComponent({
  loader: () => import('@/views/dashboard/MediaServerLatest.vue'),
  ...asyncDashboardOptions,
})

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
  loadingComponent: DashboardSkeleton,
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
          </VCard>
        </div>
        <!-- 有边框 -->
        <VCard v-else v-bind="hover.props">
          <VCardItem v-if="props.config?.attrs.border !== false">
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
