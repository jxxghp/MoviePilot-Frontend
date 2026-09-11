<script setup lang="ts">
import api from '@/api'
import { RecommendSource } from '@/api/types'
import MediaCardSlideView from '@/views/discover/MediaCardSlideView.vue'
import { useI18n } from 'vue-i18n'
import { useDynamicHeaderTab } from '@/composables/useDynamicHeaderTab'
import { useDynamicButton } from '@/composables/useDynamicButton'
import { usePWA } from '@/composables/usePWA'
import { getItemColor, initializeItemColors } from '@/utils/colorUtils'
import { openSharedDialog } from '@/composables/useSharedDialog'
import { getRecommendTabs } from '@/router/i18n-menu'
import { useUserStore } from '@/stores'
import { buildUserPermissionContext, hasPermission } from '@/utils/permission'
import {
  createBuiltInRecommendSources,
  filterAvailableRecommendSources,
  mergeExtraRecommendSources,
  type RecommendViewSource,
} from '@/utils/recommendSources'
import { loadMediaSources } from '@/composables/useMediaSources'
import { getMediaSourceCatalog, isMediaSourceCatalogLoaded } from '@/utils/mediaId'
import { getModuleCatalog, isModuleCatalogLoaded, loadModuleCatalog } from '@/composables/useModuleCatalog'

const ContentToggleSettingsDialog = defineAsyncComponent(
  () => import('@/components/dialog/ContentToggleSettingsDialog.vue'),
)

const { appMode } = usePWA()

// 国际化
const { t } = useI18n()
const userStore = useUserStore()

// 路由
const route = useRoute()
const canDiscovery = computed(() =>
  hasPermission(buildUserPermissionContext(userStore.superUser, userStore.permissions), 'discovery'),
)

// 当前选择的分类
const currentCategory = ref(t('recommend.all'))

// 使用动态标签页
const { registerHeaderTab } = useDynamicHeaderTab()

let settingsDialogController: ReturnType<typeof openSharedDialog> | null = null

// 打开推荐内容共享设置弹窗。
function openRecommendSettings() {
  settingsDialogController?.close()
  settingsDialogController = openSharedDialog(
    ContentToggleSettingsDialog,
    {
      colors: itemColors.value,
      enabled: enableConfig.value,
      hint: t('recommend.selectContentToDisplay'),
      items: viewList,
      selectAllText: t('recommend.selectAll'),
      selectNoneText: t('recommend.selectNone'),
      showBulkActions: true,
      title: t('recommend.customizeContent'),
      valueGetter: (item: { title: string }) => item.title,
    },
    {
      close: () => {
        settingsDialogController = null
      },
      save: saveConfig,
      'update:modelValue': (value: boolean) => {
        if (!value) settingsDialogController = null
      },
    },
    { closeOn: ['close', 'update:modelValue'] },
  )
}

const builtInRecommendSources = ref<RecommendViewSource[]>([])
const viewList = reactive<RecommendViewSource[]>([])
const mediaSourceCatalog = getMediaSourceCatalog()
const moduleCatalog = getModuleCatalog()
const newlyAddedBuiltInPaths = new Set([
  'anilist/trending',
  'anilist/popular-this-season',
  'recommend/music_weekly',
  'recommend/music_douban',
])

// 计算当前分类下显示的视图
const filteredViews = computed(() => {
  if (currentCategory.value === t('recommend.all')) {
    return viewList.filter(item => enableConfig.value[item.title])
  }
  return viewList.filter(item => enableConfig.value[item.title] && item.type === currentCategory.value)
})

// 榜单启用配置， 以title为key
const enableConfig = ref<{ [key: string]: boolean }>({
  ...Object.fromEntries(viewList.map(item => [item.title, true])),
})

// 为每个项目生成随机颜色
const itemColors = ref<{ [key: string]: string }>({})

// 初始化颜色
function initializeColors() {
  initializeItemColors(viewList, item => item.title)
  viewList.forEach(item => {
    itemColors.value[item.title] = getItemColor(item.title)
  })
}

// 额外的数据源
const extraRecommendSources = ref<RecommendSource[]>([])
let extraSourcesRequest: Promise<void> | null = null
let initializationRequest: Promise<void> | null = null

/** 只接受以标题为键、布尔值为开关的推荐配置。 */
function normalizeEnableConfig(value: unknown): Record<string, boolean> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null

  const entries = Object.entries(value)
  if (entries.some(([, enabled]) => typeof enabled !== 'boolean')) return null

  return Object.fromEntries(entries)
}

/** 为推荐配置补入内置榜单，同时保留用户已经明确保存的开关值。 */
function enableMissingBuiltInSources(useDefaults = false) {
  builtInRecommendSources.value.forEach(source => {
    if ((useDefaults || newlyAddedBuiltInPaths.has(source.apipath)) && !(source.title in enableConfig.value)) {
      enableConfig.value[source.title] = true
    }
  })
}

/** 按当前后端模块快照重建可见的内置推荐榜单。 */
function refreshBuiltInRecommendSources() {
  const candidates = createBuiltInRecommendSources(t)
  const activeModuleIds = isModuleCatalogLoaded()
    ? new Set(
        getModuleCatalog()
          .value.filter(item => item.active)
          .map(item => item.id),
      )
    : undefined
  builtInRecommendSources.value = filterAvailableRecommendSources(
    candidates,
    isMediaSourceCatalogLoaded().value ? getMediaSourceCatalog().value : undefined,
    activeModuleIds,
  )
}

/** 按最新媒体来源、模块状态和已加载扩展源重建推荐列表。 */
function rebuildRecommendViewList() {
  refreshBuiltInRecommendSources()
  const nextViewList = [...builtInRecommendSources.value]
  mergeExtraRecommendSources(nextViewList, extraRecommendSources.value)
  viewList.splice(0, viewList.length, ...nextViewList)
  initializeColors()
}

/** 刷新扩展推荐源；并发生命周期入口共享请求，成功响应按当前服务端快照替换列表。 */
function loadExtraRecommendSources() {
  if (extraSourcesRequest) return extraSourcesRequest

  extraSourcesRequest = (async () => {
    if (initializationRequest) await initializationRequest
    try {
      extraRecommendSources.value = await api.get('recommend/source')
      rebuildRecommendViewList()
    } catch (error) {
      console.log(error)
    }
  })().finally(() => {
    extraSourcesRequest = null
  })

  return extraSourcesRequest
}

// 加载面板配置
async function loadConfig() {
  const localEnable = localStorage.getItem('MP_RECOMMEND')
  if (localEnable) {
    try {
      const localConfig = normalizeEnableConfig(JSON.parse(localEnable))
      if (localConfig) {
        enableConfig.value = localConfig
        return true
      }
    } catch {
      // 损坏的本地值按未配置处理，继续尝试服务端配置。
    }
    localStorage.removeItem('MP_RECOMMEND')
  }

  try {
    const response = await api.get<{ value?: unknown }>('/user/config/Recommend')
    const remoteConfig = normalizeEnableConfig(response.value)
    if (remoteConfig) {
      enableConfig.value = remoteConfig
      localStorage.setItem('MP_RECOMMEND', JSON.stringify(remoteConfig))
      return true
    }
  } catch (error) {
    console.error(error)
  }

  return false
}

// 设置项目
async function saveConfig(payload?: { enabled?: Record<string, boolean> }) {
  if (payload?.enabled) {
    enableConfig.value = payload.enabled
  }

  // 启用配置
  const enableString = JSON.stringify(enableConfig.value)
  localStorage.setItem('MP_RECOMMEND', enableString)

  // 保存到服务端
  try {
    await api.post('/user/config/Recommend', enableConfig.value)
  } catch (error) {
    console.error(error)
  }
  settingsDialogController?.close()
  settingsDialogController = null
}

// 推荐分类标签与导航三级菜单共用同一份定义。
const categoryItems = computed(() => getRecommendTabs(t))

// 注册动态标签页
registerHeaderTab({
  items: categoryItems,
  modelValue: currentCategory,
})

useDynamicButton({
  icon: 'mdi-tune',
  onClick: openRecommendSettings,
  permission: 'discovery',
  show: computed(() => appMode.value),
})

// 页面是否准备就绪
const isReady = ref(false)

// 定时器
let timer: ReturnType<typeof setTimeout>

onBeforeMount(async () => {
  initializationRequest = (async () => {
    await loadMediaSources()
    await loadModuleCatalog()
    rebuildRecommendViewList()
    const hasConfig = await loadConfig()
    enableMissingBuiltInSources(!hasConfig)
    initializeColors()
  })()
  await initializationRequest
})

watch([mediaSourceCatalog, moduleCatalog], () => {
  if (!isMediaSourceCatalogLoaded().value && !isModuleCatalogLoaded().value) return
  rebuildRecommendViewList()
})

onMounted(async () => {
  // 延迟渲染内容，避免阻塞页面切换动画
  timer = setTimeout(() => {
    isReady.value = true
  }, 400)

  await loadExtraRecommendSources()
  // 为新增的数据源也生成颜色
  extraRecommendSources.value.forEach(source => {
    if (!itemColors.value[source.name]) {
      itemColors.value[source.name] = getItemColor(source.name)
    }
  })
})

onUnmounted(() => {
  if (timer) clearTimeout(timer)
})

onActivated(async () => {
  if (initializationRequest) await initializationRequest
  await loadExtraRecommendSources()
})
</script>

<template>
  <div class="mp-recommend">
    <!-- 滚动内容区域 -->
    <div class="recommend-content">
      <TransitionGroup name="fade">
        <MediaCardSlideView
          v-for="item in filteredViews"
          :key="item.title"
          v-bind="item"
          :ready="isReady"
          class="content-group"
        />
      </TransitionGroup>

      <div v-if="isReady && filteredViews.length === 0" class="empty-category">
        <VIcon icon="mdi-alert-circle-outline" size="large" class="empty-icon" />
        <p class="empty-text">{{ t('recommend.noCategoryContent') }}</p>
        <VBtn color="primary" variant="tonal" size="small" @click="openRecommendSettings">
          {{ t('recommend.configureContent') }}
        </VBtn>
      </div>
    </div>

    <!-- 快速滚动到顶部按钮 -->
    <Teleport to="body" v-if="route.path === '/recommend'">
      <div v-if="!appMode && canDiscovery" class="compact-fab-stack">
        <VFab
          icon="mdi-tune"
          color="primary"
          appear
          class="compact-fab compact-fab--primary"
          @click="openRecommendSettings"
        />
      </div>
    </Teleport>

    <Teleport to="body" v-if="route.path === '/recommend'">
      <VScrollToTopBtn :offset-fab="!appMode" />
    </Teleport>
  </div>
</template>

<style lang="scss" scoped>
.mp-recommend {
  position: relative;
  padding: 0;
  max-inline-size: 100%;
}

.recommend-content {
  padding-block: 0;
}

/* Fade transition for content groups */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.content-group {
  transition: opacity 0.3s ease;
}

// 横向滚动层依靠纵向缓冲展示上浮与阴影，不可在外层启用会裁切溢出的 paint containment。

.empty-category {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px;
  color: rgba(var(--v-theme-on-surface), 0.6);
  text-align: center;
}

.empty-icon {
  margin-block-end: 16px;
  opacity: 0.5;
}

.empty-text {
  font-size: 1rem;
  margin-block-end: 16px;
}
</style>
