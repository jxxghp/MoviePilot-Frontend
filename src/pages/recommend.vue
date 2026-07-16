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
  mergeExtraRecommendSources,
  type RecommendViewSource,
} from '@/utils/recommendSources'

const ContentToggleSettingsDialog = defineAsyncComponent(() => import('@/components/dialog/ContentToggleSettingsDialog.vue'))

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

const viewList = reactive<RecommendViewSource[]>(createBuiltInRecommendSources(t))

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

/** 只接受以标题为键、布尔值为开关的推荐配置。 */
function normalizeEnableConfig(value: unknown): Record<string, boolean> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null

  const entries = Object.entries(value)
  if (entries.some(([, enabled]) => typeof enabled !== 'boolean')) return null

  return Object.fromEntries(entries)
}

// 加载额外的发现数据源
async function loadExtraRecommendSources() {
  try {
    extraRecommendSources.value = await api.get('recommend/source')
    mergeExtraRecommendSources(viewList, extraRecommendSources.value)
  } catch (error) {
    console.log(error)
  }
}

// 加载面板配置
async function loadConfig() {
  const localEnable = localStorage.getItem('MP_RECOMMEND')
  if (localEnable) {
    try {
      const localConfig = normalizeEnableConfig(JSON.parse(localEnable))
      if (localConfig) {
        enableConfig.value = localConfig
        return
      }
    } catch {
      // 损坏的本地值按未配置处理，继续尝试服务端配置。
    }
    localStorage.removeItem('MP_RECOMMEND')
  }

  try {
    const response = await api.get('/user/config/Recommend')
    const remoteConfig = normalizeEnableConfig(response?.data?.value)
    if (remoteConfig) {
      enableConfig.value = remoteConfig
      localStorage.setItem('MP_RECOMMEND', JSON.stringify(remoteConfig))
    }
  } catch (error) {
    console.error(error)
  }
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
  await loadConfig()
  initializeColors()
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

.content-group :deep(.slider-content-wrapper) {
  content-visibility: auto;
  contain-intrinsic-block-size: 16rem;
}

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
