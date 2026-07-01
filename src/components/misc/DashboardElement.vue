<script setup lang="ts">
import { h, resolveComponent } from 'vue'
import api from '@/api'
import { DashboardItem } from '@/api/types'
import DashboardRender from '@/components/render/DashboardRender.vue'
import { isNullOrEmptyObject } from '@/@core/utils'
import { loadRemoteComponent } from '@/utils/federationLoader'

type DashboardComponentLoader = () => Promise<any>

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

const builtInDashboardComponentLoaders: Record<string, DashboardComponentLoader> = {
  storage: () => import('@/views/dashboard/AnalyticsStorage.vue'),
  mediaStatistic: () => import('@/views/dashboard/AnalyticsMediaStatistic.vue'),
  mediaRecommend: () => import('@/views/dashboard/MediaRecommend.vue'),
  weeklyOverview: () => import('@/views/dashboard/AnalyticsWeeklyOverview.vue'),
  speed: () => import('@/views/dashboard/AnalyticsSpeed.vue'),
  scheduler: () => import('@/views/dashboard/AnalyticsScheduler.vue'),
  cpu: () => import('@/views/dashboard/AnalyticsCpu.vue'),
  memory: () => import('@/views/dashboard/AnalyticsMemory.vue'),
  network: () => import('@/views/dashboard/AnalyticsNetwork.vue'),
  library: () => import('@/views/dashboard/MediaServerLibrary.vue'),
  playing: () => import('@/views/dashboard/MediaServerPlaying.vue'),
  latest: () => import('@/views/dashboard/MediaServerLatest.vue'),
  recentImports: () => import('@/views/dashboard/DashboardRecentImports.vue'),
  quickActions: () => import('@/views/dashboard/DashboardQuickActions.vue'),
  systemInfo: () => import('@/views/dashboard/DashboardSystemInfo.vue'),
}

const builtInDashboardComponentPromises = new Map<string, Promise<any>>()

// 复用内置仪表盘组件加载 Promise，让页面层可以等待异步组件模块真正加载完成。
function loadBuiltInDashboardComponent(id: string) {
  const loader = builtInDashboardComponentLoaders[id]
  if (!loader) return Promise.resolve()

  let loadPromise = builtInDashboardComponentPromises.get(id)
  if (!loadPromise) {
    loadPromise = loader().catch(error => {
      builtInDashboardComponentPromises.delete(id)
      throw error
    })
    builtInDashboardComponentPromises.set(id, loadPromise)
  }

  return loadPromise
}

// 创建内置仪表盘异步组件，并与加载完成上报共享同一份加载 Promise。
function createAsyncDashboardComponent(id: string) {
  return defineAsyncComponent({
    loader: () => loadBuiltInDashboardComponent(id),
    ...asyncDashboardOptions,
  })
}

// 内置仪表盘按需加载，关闭的卡片不再挤进 dashboard 首屏 chunk。
const AnalyticsStorage = createAsyncDashboardComponent('storage')
const AnalyticsMediaStatistic = createAsyncDashboardComponent('mediaStatistic')
const MediaRecommend = createAsyncDashboardComponent('mediaRecommend')
const AnalyticsWeeklyOverview = createAsyncDashboardComponent('weeklyOverview')
const AnalyticsSpeed = createAsyncDashboardComponent('speed')
const AnalyticsScheduler = createAsyncDashboardComponent('scheduler')
const AnalyticsCpu = createAsyncDashboardComponent('cpu')
const AnalyticsMemory = createAsyncDashboardComponent('memory')
const AnalyticsNetwork = createAsyncDashboardComponent('network')
const MediaServerLibrary = createAsyncDashboardComponent('library')
const MediaServerPlaying = createAsyncDashboardComponent('playing')
const MediaServerLatest = createAsyncDashboardComponent('latest')
const DashboardRecentImports = createAsyncDashboardComponent('recentImports')
const DashboardQuickActions = createAsyncDashboardComponent('quickActions')
const DashboardSystemInfo = createAsyncDashboardComponent('systemInfo')

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

const emit = defineEmits(['update:refreshStatus', 'loaded'])

// 当前仪表盘节点是否已经向页面层报告过加载完成。
const isDashboardElementLoaded = ref(false)

let isDashboardElementUnmounted = false
let pluginDashboardComponentLoadPromise: Promise<any> | null = null

// 插件UI渲染模式 ('vuetify' 或 'vue')
const pluginRenderMode = computed(() => props.config?.render_mode || 'vuetify')

// 加载 Vue 模式的插件仪表盘远程组件，并缓存当前节点的加载 Promise。
function loadPluginDashboardComponent() {
  if (!props.config?.id) return Promise.reject(new Error('插件ID不存在'))

  if (!pluginDashboardComponentLoadPromise) {
    pluginDashboardComponentLoadPromise = loadRemoteComponent(props.config.id, 'Dashboard').catch(error => {
      pluginDashboardComponentLoadPromise = null
      throw error
    })
  }

  return pluginDashboardComponentLoadPromise
}

// Vue 模式：动态加载的组件
const dynamicPluginComponent = defineAsyncComponent({
  // 工厂函数
  loader: async () => {
    try {
      const module = await loadPluginDashboardComponent()

      // 直接返回加载的组件，无需再获取default
      return module
    } catch (error) {
      console.error('加载远程组件失败:', error)
      throw error
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

// 判断当前配置是否对应内置异步仪表盘组件。
function isBuiltInDashboardElement() {
  return !!props.config?.id && !!builtInDashboardComponentLoaders[props.config.id]
}

// 判断当前配置是否需要等待插件 Vue 远程组件加载。
function isVuePluginDashboardElement() {
  return !isBuiltInDashboardElement() && pluginRenderMode.value === 'vue' && !isNullOrEmptyObject(props.config)
}

// 向页面层上报当前仪表盘节点已完成首次组件加载。
function emitDashboardElementLoaded() {
  if (isDashboardElementLoaded.value || isDashboardElementUnmounted) return

  isDashboardElementLoaded.value = true
  emit('loaded')
}

// 等待当前仪表盘节点的异步组件加载完成，静态渲染模式则等待一次 DOM 更新。
async function waitForDashboardElementLoaded() {
  if (isDashboardElementLoaded.value) return

  try {
    if (isBuiltInDashboardElement() && props.config?.id) {
      await loadBuiltInDashboardComponent(props.config.id)
    } else if (isVuePluginDashboardElement()) {
      await loadPluginDashboardComponent()
    }

    await nextTick()
  } catch (error) {
    console.error(error)
  } finally {
    emitDashboardElementLoaded()
  }
}

watch(
  () => [props.config?.id, props.config?.key, pluginRenderMode.value],
  () => {
    void waitForDashboardElementLoaded()
  },
  { immediate: true },
)

onUnmounted(() => {
  isDashboardElementUnmounted = true
  // 组件卸载时禁用刷新状态
  emit('update:refreshStatus', false)
})
</script>
<template>
  <!-- 系统内置的仪表板 -->
  <AnalyticsStorage v-if="config?.id === 'storage'" />
  <AnalyticsMediaStatistic v-else-if="config?.id === 'mediaStatistic'" />
  <MediaRecommend v-else-if="config?.id === 'mediaRecommend'" />
  <AnalyticsWeeklyOverview v-else-if="config?.id === 'weeklyOverview'" />
  <AnalyticsSpeed v-else-if="config?.id === 'speed'" :allowRefresh="props.allowRefresh" />
  <AnalyticsScheduler v-else-if="config?.id === 'scheduler'" :allowRefresh="props.allowRefresh" />
  <AnalyticsCpu v-else-if="config?.id === 'cpu'" :allowRefresh="props.allowRefresh" />
  <AnalyticsMemory v-else-if="config?.id === 'memory'" :allowRefresh="props.allowRefresh" />
  <AnalyticsNetwork v-else-if="config?.id === 'network'" :allowRefresh="props.allowRefresh" />
  <MediaServerLibrary v-else-if="config?.id === 'library'" />
  <MediaServerPlaying v-else-if="config?.id === 'playing'" />
  <MediaServerLatest v-else-if="config?.id === 'latest'" />
  <DashboardRecentImports v-else-if="config?.id === 'recentImports'" />
  <DashboardQuickActions v-else-if="config?.id === 'quickActions'" />
  <DashboardSystemInfo v-else-if="config?.id === 'systemInfo'" :allow-refresh="props.allowRefresh" />
  <!-- 插件仪表板 -->
  <template v-else-if="!isNullOrEmptyObject(props.config)">
    <!-- Vue 渲染模式 -->
    <div v-if="pluginRenderMode === 'vue'" class="dashboard-plugin-vue-renderer">
      <component :is="dynamicPluginComponent" :config="props.config" :allow-refresh="props.allowRefresh" :api="api" />
    </div>
    <!-- Vuetify 渲染模式 -->
    <template v-else-if="pluginRenderMode === 'vuetify'">
      <!-- 无边框 -->
      <div v-if="props.config?.attrs.border === false">
        <VCard>
          <VCardText class="p-0">
            <DashboardRender v-for="(item, index) in props.config?.elements" :key="index" :config="item" />
          </VCardText>
        </VCard>
      </div>
      <!-- 有边框 -->
      <VCard v-else>
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
    <!-- 未知模式或错误 -->
    <VCard v-else>
      <VCardText>无法渲染插件仪表盘部件: 未知渲染模式或配置错误</VCardText>
    </VCard>
  </template>
</template>

<style scoped>
/* stylelint-disable selector-pseudo-class-no-unknown */

.dashboard-plugin-vue-renderer {
  display: flex;
  flex-direction: column;
  block-size: 100%;
  inline-size: 100%;
  min-block-size: 0;
}
</style>
