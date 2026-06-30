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

const viewList = reactive<{ apipath: string; linkurl: string; title: string; type: string }[]>([
  {
    apipath: 'recommend/tmdb_trending',
    linkurl: '/browse/recommend/tmdb_trending?title=' + t('recommend.trendingNow'),
    title: t('recommend.trendingNow'),
    type: t('recommend.categoryRankings'),
  },
  {
    apipath: 'recommend/douban_showing',
    linkurl: '/browse/recommend/douban_showing?title=' + t('recommend.nowShowing'),
    title: t('recommend.nowShowing'),
    type: t('recommend.categoryMovie'),
  },
  {
    apipath: 'recommend/bangumi_calendar',
    linkurl: '/browse/recommend/bangumi_calendar?title=' + t('recommend.bangumiDaily'),
    title: t('recommend.bangumiDaily'),
    type: t('recommend.categoryAnime'),
  },
  {
    apipath: 'recommend/tmdb_movies',
    linkurl: '/browse/recommend/tmdb_movies?title=' + t('recommend.tmdbHotMovies'),
    title: t('recommend.tmdbHotMovies'),
    type: t('recommend.categoryMovie'),
  },
  {
    apipath: 'recommend/tmdb_tvs?with_original_language=zh|en|ja|ko',
    linkurl: '/browse/recommend/tmdb_tvs??with_original_language=zh|en|ja|ko&title=' + t('recommend.tmdbHotTVShows'),
    title: t('recommend.tmdbHotTVShows'),
    type: t('recommend.categoryTV'),
  },
  {
    apipath: 'recommend/douban_movie_hot',
    linkurl: '/browse/recommend/douban_movie_hot?title=' + t('recommend.doubanHotMovies'),
    title: t('recommend.doubanHotMovies'),
    type: t('recommend.categoryMovie'),
  },
  {
    apipath: 'recommend/douban_tv_hot',
    linkurl: '/browse/recommend/douban_tv_hot?title=' + t('recommend.doubanHotTVShows'),
    title: t('recommend.doubanHotTVShows'),
    type: t('recommend.categoryTV'),
  },
  {
    apipath: 'recommend/douban_tv_animation',
    linkurl: '/browse/recommend/douban_tv_animation?title=' + t('recommend.doubanHotAnime'),
    title: t('recommend.doubanHotAnime'),
    type: t('recommend.categoryAnime'),
  },
  {
    apipath: 'recommend/douban_movies',
    linkurl: '/browse/recommend/douban_movies?title=' + t('recommend.doubanNewMovies'),
    title: t('recommend.doubanNewMovies'),
    type: t('recommend.categoryMovie'),
  },
  {
    apipath: 'recommend/douban_tvs',
    linkurl: '/browse/recommend/douban_tvs?title=' + t('recommend.doubanNewTVShows'),
    title: t('recommend.doubanNewTVShows'),
    type: t('recommend.categoryTV'),
  },
  {
    apipath: 'recommend/douban_movie_top250',
    linkurl: '/browse/recommend/douban_movie_top250?title=' + t('recommend.doubanTop250'),
    title: t('recommend.doubanTop250'),
    type: t('recommend.categoryRankings'),
  },
  {
    apipath: 'recommend/douban_tv_weekly_chinese',
    linkurl: '/browse/recommend/douban_tv_weekly_chinese?title=' + t('recommend.doubanChineseTVRankings'),
    title: t('recommend.doubanChineseTVRankings'),
    type: t('recommend.categoryRankings'),
  },
  {
    apipath: 'recommend/douban_tv_weekly_global',
    linkurl: '/browse/recommend/douban_tv_weekly_global?title=' + t('recommend.doubanGlobalTVRankings'),
    title: t('recommend.doubanGlobalTVRankings'),
    type: t('recommend.categoryRankings'),
  },
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

// 加载额外的发现数据源
async function loadExtraRecommendSources() {
  try {
    extraRecommendSources.value = await api.get('recommend/source')
    if (extraRecommendSources.value.length > 0) {
      extraRecommendSources.value.map(source => {
        if (!viewList.some(item => item.apipath === source.api_path)) {
          const querySeparator = source.api_path.includes('?') ? '&' : '?'
          const linkUrl = `/browse/${source.api_path}${querySeparator}title=${encodeURIComponent(source.name)}`
          viewList.push({
            apipath: source.api_path,
            linkurl: linkUrl,
            title: source.name,
            type: source.type,
          })
        }
      })
    }
  } catch (error) {
    console.log(error)
  }
}

// 加载面板配置
async function loadConfig() {
  // 显示配置
  const local_enable = localStorage.getItem('MP_RECOMMEND')
  if (local_enable) {
    enableConfig.value = JSON.parse(local_enable)
  } else {
    const response = await api.get('/user/config/Recommend')
    if (response && response.data && response.data.value) {
      enableConfig.value = response.data.value
      localStorage.setItem('MP_RECOMMEND', JSON.stringify(response.data.value))
    }
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
