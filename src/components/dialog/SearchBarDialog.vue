<script setup lang="ts">
import api from '@/api'
import type { Site, Plugin, Subscribe } from '@/api/types'
import { getNavMenus, getSettingTabs } from '@/router/i18n-menu'
import { NavMenu } from '@/@layouts/types'
import { useUserStore } from '@/stores'
import SearchSiteDialog from '@/components/dialog/SearchSiteDialog.vue'
import { useI18n } from 'vue-i18n'
import { useDisplay } from 'vuetify'
import { VDialog, VMenu } from 'vuetify/components'
import { buildUserPermissionContext, hasPermission, filterMenusByPermission } from '@/utils/permission'

// 显示器宽度
const display = useDisplay()

// 多语言支持
const { t } = useI18n()

// 定义 props，接收浮层状态及是否显示响应式入口。
const props = withDefaults(
  defineProps<{
    modelValue: boolean
    showActivator?: boolean
  }>(),
  {
    showActivator: false,
  },
)

// 路由
const router = useRouter()

// 用户 Store
const userStore = useUserStore()

// 当前用户名
const userName = userStore.userName
const userPermissions = computed(() => buildUserPermissionContext(userStore.superUser, userStore.permissions))

// 权限检查
const hasSearchPermission = computed(() => {
  return hasPermission(userPermissions.value, 'search')
})

const hasDiscoveryPermission = computed(() => {
  return hasPermission(userPermissions.value, 'discovery')
})

const hasSubscribePermission = computed(() => {
  return hasPermission(userPermissions.value, 'subscribe')
})

const hasManagePermission = computed(() => {
  return hasPermission(userPermissions.value, 'manage')
})

const hasAdminPermission = computed(() => {
  return hasPermission(userPermissions.value, 'admin')
})

// 所有订阅数据
const SubscribeItems = ref<Subscribe[]>([])

// 站点选择对话框
const chooseSiteDialog = ref(false)
const selectedSites = ref<number[]>([])
const allSites = ref<Site[]>([])
const siteSearchType = ref<'torrent' | 'subtitle'>('torrent')

// 定义事件
const emit = defineEmits(['close', 'update:modelValue'])

// 对话框状态的本地计算属性
const dialog = computed({
  get: () => props.modelValue,
  set: val => emit('update:modelValue', val),
})

// 桌面使用锚定下拉，小屏继续使用原有搜索弹窗。
const searchOverlay = computed(() => (display.mdAndUp.value ? VMenu : VDialog))
const searchOverlayProps = computed(() =>
  display.mdAndUp.value
    ? {
        closeOnContentClick: false,
        location: 'bottom start' as const,
        offset: 8,
        scrollStrategy: 'reposition' as const,
      }
    : {
        fullscreen: true,
        maxWidth: '40rem',
        scrollable: true,
      },
)

// 搜索词
const searchWord = ref<string | null>(null)

type MediaSearchSource = 'themoviedb' | 'douban' | 'bangumi' | 'anilist'
type MediaSearchType = 'media' | 'collection' | 'person'

interface MediaSearchSourceOption {
  label: string
  name: string
  value: MediaSearchSource
}

interface MediaSearchAction {
  type: MediaSearchType
  icon: string
  title: string
  description: string
}

// 三类搜索各自维护来源选择，首次使用均默认 TheMovieDB。
const selectedMediaSearchSources = reactive<Record<MediaSearchType, MediaSearchSource>>({
  media: 'themoviedb',
  collection: 'themoviedb',
  person: 'themoviedb',
})

// 按后端实际能力限定每类搜索可选的数据源。
const mediaSearchSourceOptions = computed<Record<MediaSearchType, MediaSearchSourceOption[]>>(() => {
  const themoviedb = {
    label: 'TMDB',
    name: t('discoverTabs.themoviedb'),
    value: 'themoviedb' as const,
  }
  const douban = {
    label: t('discoverTabs.douban'),
    name: t('discoverTabs.douban'),
    value: 'douban' as const,
  }
  const bangumi = {
    label: 'Bangumi',
    name: t('discoverTabs.bangumi'),
    value: 'bangumi' as const,
  }
  const anilist = {
    label: 'AniList',
    name: t('discoverTabs.anilist'),
    value: 'anilist' as const,
  }

  return {
    media: [themoviedb, douban, bangumi, anilist],
    collection: [themoviedb],
    person: [themoviedb, douban],
  }
})

// 搜索项及其来源组共用同一份声明，避免显示能力与请求类型不一致。
const mediaSearchActions = computed(() => {
  return [
    {
      type: 'media',
      icon: 'mdi-movie-search',
      title: `${t('recommend.categoryMovie')}、${t('recommend.categoryTV')}`,
      description: t('resource.title'),
    },
    {
      type: 'collection',
      icon: 'mdi-movie-filter',
      title: t('dialog.searchBar.collections'),
      description: t('dialog.searchBar.collectionSearch'),
    },
    {
      type: 'person',
      icon: 'mdi-account-search',
      title: t('browse.actor'),
      description: t('dialog.searchBar.actorSearch'),
    },
  ] satisfies MediaSearchAction[]
})

// 当前尺寸下可见的搜索输入框。
const searchWordInput = ref<HTMLInputElement | null>(null)

// 近期搜索词条
const recentSearches = ref<string[]>([])

/** 检测操作系统是否为 macOS。 */
function isMac() {
  return navigator.platform.toUpperCase().indexOf('MAC') >= 0
}

// 计算属性：根据操作系统显示不同的按键提示
const metaKey = computed(() => (isMac() ? '⌘+K' : 'Ctrl+K'))

/** 将有效关键词保存到近期搜索记录。 */
function saveRecentSearches(keyword: string) {
  if (!keyword) return
  if (recentSearches.value.includes(keyword)) return
  recentSearches.value.unshift(keyword)
  localStorage.setItem('MP_RecentSearches', JSON.stringify(recentSearches.value))
}

/** 从本地存储加载并裁剪近期搜索记录。 */
function loadRecentSearches() {
  const recentSearchesStr = localStorage.getItem('MP_RecentSearches')
  if (recentSearchesStr) {
    recentSearches.value = JSON.parse(recentSearchesStr)
    // 只保留最近的 5 条
    if (recentSearches.value.length > 5) {
      recentSearches.value = recentSearches.value.slice(0, 5)
    }
  }
}

/** 获取可参与全局搜索的导航菜单和设置入口。 */
function getMenus(): NavMenu[] {
  const menus: NavMenu[] = []
  // 导航菜单
  getNavMenus(t).forEach(
    item =>
      item &&
      menus.push({
        title: item.full_title ?? item.title,
        icon: item.icon,
        to: item.to,
        header: item.header,
        admin: item.admin,
        permission: item.permission,
        feature: item.feature,
      }),
  )
  // 设置标签页
  getSettingTabs(t).forEach(
    item =>
      item &&
      menus.push({
        title: t('navItems.setting') + ' -> ' + item.title,
        icon: item.icon,
        to: `/setting?tab=${item.tab}`,
        header: '',
        admin: true,
        permission: 'admin',
        description: item.description,
      }),
  )

  return menus
}

// 匹配的菜单列表
const matchedMenuItems = computed(() => {
  if (!searchWord.value) return []
  const lowerWord = (searchWord.value as string).toLowerCase()
  const menuItems = getMenus()
  if (menuItems) {
    // 先根据用户权限过滤菜单
    const filteredMenus = filterMenusByPermission(menuItems, userPermissions.value)
    // 再根据搜索词过滤
    return filteredMenus.filter(
      item =>
        item.title.toLowerCase().includes(lowerWord) ||
        (item.description && item.description.toLowerCase().includes(lowerWord)),
    )
  }
  return []
})

// 所有插件（已安装）
const pluginItems = ref<Plugin[]>([])

/** 加载已安装插件，供搜索结果匹配。 */
async function fetchInstalledPlugins() {
  try {
    pluginItems.value = await api.get('plugin/', {
      params: {
        state: 'installed',
      },
    })
  } catch (error) {
    console.error(error)
  }
}

// 匹配的插件列表
const matchedPluginItems = computed(() => {
  if (!searchWord.value) return []
  if (!hasAdminPermission.value) return []
  const lowerWord = (searchWord.value as string).toLowerCase()
  return pluginItems.value.filter((item: Plugin) => {
    if (!item.plugin_name && !item.plugin_desc) return false
    return item.plugin_name?.toLowerCase().includes(lowerWord) || item.plugin_desc?.toLowerCase().includes(lowerWord)
  })
})

/** 加载订阅列表，供搜索结果匹配。 */
async function fetchSubscribes() {
  try {
    SubscribeItems.value = await api.get('subscribe/')
  } catch (error) {
    console.error(error)
  }
}

/** 从接口加载用户的站点搜索偏好。 */
const loadUserSitePreferences = async () => {
  try {
    const result = await api.get('system/setting/public/IndexerSites')
    if (result && result.data && result.data.value) {
      selectedSites.value = result.data.value
      return
    }
  } catch (err) {
    console.error(err)
  }
}

/** 查询所有启用站点，并初始化默认选择。 */
async function queryAllSites() {
  try {
    const data: Site[] = await api.get('site/')
    // 过滤站点，只有启用的站点才显示
    allSites.value = data.filter(item => item.is_active)
    // 如果没有选择任何站点并且有可用站点，才默认选择全部
    if (selectedSites.value.length === 0 && allSites.value.length > 0) {
      selectedSites.value = allSites.value.map((site: Site) => site.id)
    }
  } catch (error) {
    console.log(error)
  }
}

/** 打开指定资源类型的站点选择对话框。 */
const openSiteDialog = (type: 'torrent' | 'subtitle' = 'torrent') => {
  siteSearchType.value = type
  chooseSiteDialog.value = true
}

// 匹配的订阅列表
const matchedSubscribeItems = computed(() => {
  if (!searchWord.value) return []
  if (!hasSubscribePermission.value) return []
  const lowerWord = (searchWord.value as string).toLowerCase()
  return SubscribeItems.value.filter((item: Subscribe) => {
    return (item.name.toLowerCase().includes(lowerWord) && (userStore.superUser || userName === item.username)) || false
  })
})

/** 使用选中的站点执行当前资源类型搜索。 */
function searchSites(sites: number[]) {
  chooseSiteDialog.value = false
  selectedSites.value = sites
  if (siteSearchType.value === 'subtitle') {
    searchSubtitle()
    return
  }
  searchTorrent()
}

/** 使用当前关键词搜索站点资源。 */
function searchTorrent() {
  if (!searchWord.value || !hasSearchPermission.value) return
  // 记录搜索词
  saveRecentSearches(searchWord.value)
  // 跳转到搜索页面
  router.push({
    path: '/resource',
    query: {
      keyword: searchWord.value,
      area: 'title',
      result_type: 'torrent',
      sites: selectedSites.value.join(','),
    },
  })
  closeSearch()
}

/** 使用当前关键词搜索字幕资源。 */
function searchSubtitle() {
  if (!searchWord.value || !hasSearchPermission.value) return
  saveRecentSearches(searchWord.value)
  router.push({
    path: '/resource',
    query: {
      keyword: searchWord.value,
      area: 'title',
      result_type: 'subtitle',
      sites: selectedSites.value.join(','),
    },
  })
  closeSearch()
}

/** 跳转到指定类型的媒体搜索结果页。 */
function searchMedia(searchType: MediaSearchType) {
  if (!searchWord.value || !hasDiscoveryPermission.value) return
  saveRecentSearches(searchWord.value)
  router.push({
    path: '/browse/media/search',
    query: {
      title: searchWord.value,
      type: searchType,
      source: selectedMediaSearchSources[searchType],
    },
  })
  closeSearch()
}

/** 跳转到包含当前关键词的历史记录页。 */
function searchHistory() {
  if (!searchWord.value) return
  saveRecentSearches(searchWord.value)
  router.push({
    path: '/history',
    query: {
      search: searchWord.value,
    },
  })
  closeSearch()
}

/** 跳转到包含当前关键词的订阅分享页。 */
function searchSubscribeShares() {
  if (!searchWord.value) return
  saveRecentSearches(searchWord.value)
  router.push({
    path: '/subscribe-share',
    query: {
      keyword: searchWord.value,
    },
  })
  closeSearch()
}

/** 打开匹配插件的已安装详情。 */
function showPlugin(pluginId: string) {
  router.push({
    path: `/plugins/`,
    query: {
      tab: 'installed',
      id: pluginId,
    },
  })
  closeSearch()
}

/** 跳转到匹配的功能菜单。 */
function goPage(to: string) {
  router.push(to)
  closeSearch()
}

/** 根据订阅类型跳转到对应订阅详情。 */
function goSubscribe(subscribe: Subscribe) {
  if (subscribe.type === '电影') {
    router.push({
      path: '/subscribe/movie',
      query: {
        id: subscribe.id,
      },
    })
  } else {
    router.push({
      path: '/subscribe/tv',
      query: {
        id: subscribe.id,
      },
    })
  }
  closeSearch()
}

/** 关闭搜索浮层并通知外层入口同步状态。 */
function closeSearch() {
  dialog.value = false
  emit('close')
}

/** 聚焦当前可见输入框，供快捷键入口复用。 */
function focusSearchInput() {
  searchWordInput.value?.focus()
}

watch(dialog, async isOpen => {
  if (!isOpen) return
  await nextTick()
  focusSearchInput()
})

defineExpose({ focusSearchInput })

onMounted(() => {
  // 根据权限加载不同的数据
  if (hasAdminPermission.value) {
    fetchInstalledPlugins()
  }
  if (hasSubscribePermission.value) {
    fetchSubscribes()
  }
  loadRecentSearches()
  if (hasSearchPermission.value) {
    loadUserSitePreferences()
    if (hasManagePermission.value) {
      queryAllSites()
    }
  }
})
</script>
<template>
  <component :is="searchOverlay" v-model="dialog" v-bind="searchOverlayProps">
    <template v-if="showActivator" #activator="{ props: activatorProps }">
      <!-- 小屏入口保持图标形态，点击后打开全屏搜索弹窗。 -->
      <IconBtn
        v-if="!display.mdAndUp.value"
        v-bind="activatorProps"
        class="search-icon-trigger"
        :aria-label="t('dialog.searchBar.openSearch')"
      >
        <VIcon class="search-icon-trigger__icon" icon="mdi-magnify" />
      </IconBtn>

      <!-- 中屏及以上常驻搜索输入框，输入时直接在下方展示同一组选项。 -->
      <div v-else v-bind="activatorProps" class="search-desktop-activator">
        <div class="search-input-wrapper">
          <VIcon icon="mdi-magnify" size="22" class="search-input-icon" />
          <input
            ref="searchWordInput"
            v-model="searchWord"
            id="global-media-search"
            type="text"
            class="search-native-input"
            :aria-label="t('dialog.searchBar.searchPlaceholder')"
            :placeholder="t('dialog.searchBar.searchPlaceholder')"
            @keydown.enter="searchMedia('media')"
            @keydown.escape.stop="closeSearch"
          />
          <kbd class="search-shortcut-badge">{{ metaKey }}</kbd>
        </div>
      </div>
    </template>

    <VCard class="search-dialog" :class="{ 'search-dialog--dropdown': display.mdAndUp.value }">
      <!-- 弹窗模式保留原有搜索输入区。 -->
      <div v-if="!display.mdAndUp.value" class="search-header">
        <div class="search-input-wrapper">
          <VIcon icon="mdi-text" size="22" class="search-input-icon" />
          <input
            ref="searchWordInput"
            v-model="searchWord"
            id="global-media-search"
            type="text"
            class="search-native-input"
            :aria-label="t('dialog.searchBar.searchPlaceholder')"
            :placeholder="t('dialog.searchBar.searchPlaceholder')"
            @keydown.enter="searchMedia('media')"
            @keydown.escape.stop="closeSearch"
          />
          <VBtn icon size="small" variant="text" class="search-submit-btn" @click="searchMedia('media')">
            <VIcon icon="mdi-magnify" size="20" />
          </VBtn>
        </div>
      </div>

      <!-- 主内容区域 -->
      <div class="search-content">
        <!-- 有搜索词时显示搜索入口和匹配结果 -->
        <VList lines="two" v-if="searchWord" class="search-list pa-0 py-2">
          <!-- 媒体搜索入口 -->
          <template v-if="hasDiscoveryPermission">
            <VListSubheader class="font-weight-medium text-uppercase px-4">
              {{ t('common.media') }}
            </VListSubheader>

            <VListItem
              v-for="action in mediaSearchActions"
              :key="action.type"
              density="comfortable"
              link
              class="search-result-item search-source-result-item mx-2 my-1"
              @click="searchMedia(action.type)"
            >
              <template #prepend>
                <div class="result-icon-wrapper">
                  <VIcon :icon="action.icon" size="small" color="medium-emphasis" />
                </div>
              </template>
              <VListItemTitle class="font-weight-medium text-body-2">
                {{ action.title }}
              </VListItemTitle>
              <VListItemSubtitle class="text-caption text-medium-emphasis">
                {{ t('common.search') }} <span class="primary-text font-weight-medium">{{ searchWord }}</span>
                {{ action.description }}
              </VListItemSubtitle>
              <div class="search-item-source-row">
                <VBtnToggle
                  v-model="selectedMediaSearchSources[action.type]"
                  class="search-item-source-toggle"
                  density="compact"
                  mandatory
                  role="group"
                  selected-class="media-source-button--active"
                  variant="text"
                  :aria-label="t('dialog.searchBar.mediaSourceFor', { type: action.title })"
                  @click.stop
                  @keydown.stop
                >
                  <VBtn
                    v-for="source in mediaSearchSourceOptions[action.type]"
                    :key="source.value"
                    class="media-source-button"
                    size="x-small"
                    :value="source.value"
                    :aria-label="t('dialog.searchBar.searchWithSource', { source: source.name })"
                    :title="t('dialog.searchBar.searchWithSource', { source: source.name })"
                  >
                    {{ source.label }}
                  </VBtn>
                </VBtnToggle>
              </div>
            </VListItem>
          </template>

          <VListItem
            v-if="hasSubscribePermission"
            density="comfortable"
            link
            @click="searchSubscribeShares"
            class="search-result-item mx-2 my-1"
          >
            <template #prepend>
              <div class="result-icon-wrapper">
                <VIcon icon="mdi-share-variant" size="small" color="medium-emphasis" />
              </div>
            </template>
            <VListItemTitle class="font-weight-medium text-body-2">{{ t('subscribe.searchShares') }}</VListItemTitle>
            <VListItemSubtitle class="text-caption text-medium-emphasis">
              {{ t('common.search') }} <span class="primary-text font-weight-medium">{{ searchWord }}</span>
              {{ t('dialog.searchBar.subscribeShareSearch') }}
            </VListItemSubtitle>
          </VListItem>

          <VListItem
            v-if="hasManagePermission"
            density="comfortable"
            link
            @click="searchHistory"
            class="search-result-item mx-2 my-1"
          >
            <template #prepend>
              <div class="result-icon-wrapper">
                <VIcon icon="mdi-history" size="small" color="medium-emphasis" />
              </div>
            </template>
            <VListItemTitle class="font-weight-medium text-body-2">{{ t('navItems.history') }}</VListItemTitle>
            <VListItemSubtitle class="text-caption text-medium-emphasis">
              {{ t('common.search') }} <span class="primary-text font-weight-medium">{{ searchWord }}</span>
              {{ t('dialog.searchBar.historySearch') }}
            </VListItemSubtitle>
          </VListItem>

          <!-- 匹配的订阅 -->
          <template v-if="matchedSubscribeItems.length > 0">
            <VDivider class="mx-4 my-2 search-divider" />
            <VListSubheader class="font-weight-medium text-uppercase px-4">
              {{ t('dialog.searchBar.subscriptions') }}
            </VListSubheader>
            <VListItem
              v-for="subscribe in matchedSubscribeItems"
              :key="subscribe.id"
              density="comfortable"
              link
              @click="goSubscribe(subscribe)"
              class="search-result-item mx-2 my-1"
            >
              <template #prepend>
                <div class="result-icon-wrapper">
                  <VIcon
                    :icon="subscribe.type === '电影' ? 'mdi-movie-roll' : 'mdi-television-classic'"
                    size="small"
                    color="medium-emphasis"
                  />
                </div>
              </template>
              <VListItemTitle class="font-weight-medium text-body-2">
                {{ subscribe.name }}
                <span v-if="subscribe.season" class="text-caption">
                  {{ t('resource.season') }} {{ subscribe.season }}</span
                >
              </VListItemTitle>
              <VListItemSubtitle class="text-caption text-medium-emphasis">
                {{ subscribe.type }}
              </VListItemSubtitle>
            </VListItem>
          </template>

          <!-- 匹配的菜单/功能 -->
          <template v-if="matchedMenuItems.length > 0">
            <VDivider class="mx-4 my-2 search-divider" />
            <VListSubheader class="font-weight-medium text-uppercase px-4">
              {{ t('dialog.searchBar.functions') }}
            </VListSubheader>
            <VListItem
              v-for="menu in matchedMenuItems"
              :key="menu.title"
              density="comfortable"
              link
              @click="goPage(menu.to as string)"
              class="search-result-item mx-2 my-1"
            >
              <template #prepend>
                <div class="result-icon-wrapper">
                  <VIcon :icon="menu.icon as string" size="small" color="medium-emphasis" />
                </div>
              </template>
              <VListItemTitle class="font-weight-medium text-body-2">
                {{ menu.title }}
              </VListItemTitle>
              <VListItemSubtitle v-if="menu.description" class="text-caption text-medium-emphasis">
                {{ menu.description }}
              </VListItemSubtitle>
            </VListItem>
          </template>

          <!-- 匹配的插件 -->
          <template v-if="matchedPluginItems.length > 0">
            <VDivider class="mx-4 my-2 search-divider" />
            <VListSubheader class="font-weight-medium text-uppercase px-4">
              {{ t('dialog.searchBar.plugins') }}
            </VListSubheader>
            <VListItem
              v-for="plugin in matchedPluginItems"
              :key="plugin.id"
              density="comfortable"
              link
              @click="showPlugin(plugin.id ?? '')"
              class="search-result-item mx-2 my-1"
            >
              <template #prepend>
                <div class="result-icon-wrapper">
                  <VIcon icon="mdi-puzzle" size="small" color="medium-emphasis" />
                </div>
              </template>
              <VListItemTitle class="font-weight-medium text-body-2">
                {{ plugin.plugin_name }}
              </VListItemTitle>
              <VListItemSubtitle class="text-caption text-medium-emphasis">
                {{ plugin.plugin_desc }}
              </VListItemSubtitle>
            </VListItem>
          </template>

          <!-- 站点资源搜索 -->
          <template v-if="hasSearchPermission">
            <VDivider class="mx-4 my-2 search-divider" />
            <VListSubheader class="font-weight-medium text-uppercase px-4">
              {{ t('dialog.searchBar.siteResources') }}
            </VListSubheader>

            <VListItem density="comfortable" link @click="searchTorrent" class="search-result-item mx-2 my-1">
              <template #prepend>
                <div class="result-icon-wrapper">
                  <VIcon icon="mdi-file-search" size="small" color="medium-emphasis" />
                </div>
              </template>
              <VListItemTitle class="font-weight-medium text-body-2">{{
                t('dialog.searchBar.searchInSites')
              }}</VListItemTitle>
              <VListItemSubtitle class="text-caption text-medium-emphasis">
                {{ t('common.search') }} <span class="primary-text font-weight-medium">{{ searchWord }}</span>
                {{ t('dialog.searchBar.relatedResources') }}
              </VListItemSubtitle>
              <template #append>
                <VBtn
                  v-if="hasManagePermission"
                  size="x-small"
                  variant="tonal"
                  color="primary"
                  rounded="pill"
                  @click.stop="openSiteDialog('torrent')"
                >
                  {{ t('dialog.searchBar.selectSites') }}
                </VBtn>
              </template>
            </VListItem>

            <VListItem density="comfortable" link @click="searchSubtitle" class="search-result-item mx-2 my-1">
              <template #prepend>
                <div class="result-icon-wrapper">
                  <VIcon icon="mdi-subtitles-outline" size="small" color="medium-emphasis" />
                </div>
              </template>
              <VListItemTitle class="font-weight-medium text-body-2">{{
                t('dialog.searchBar.searchSubtitlesInSites')
              }}</VListItemTitle>
              <VListItemSubtitle class="text-caption text-medium-emphasis">
                {{ t('common.search') }} <span class="primary-text font-weight-medium">{{ searchWord }}</span>
                {{ t('dialog.searchBar.relatedSubtitles') }}
              </VListItemSubtitle>
              <template #append>
                <VBtn
                  v-if="hasManagePermission"
                  size="x-small"
                  variant="tonal"
                  color="primary"
                  rounded="pill"
                  @click.stop="openSiteDialog('subtitle')"
                >
                  {{ t('dialog.searchBar.selectSites') }}
                </VBtn>
              </template>
            </VListItem>
          </template>
        </VList>

        <!-- 无搜索词时显示空状态 -->
        <div v-else class="search-empty-state">
          <!-- 有最近搜索 -->
          <div v-if="!searchWord && recentSearches.length > 0" class="recent-searches-section">
            <div class="text-body-2 font-weight-medium text-medium-emphasis mb-3">
              {{ t('dialog.searchBar.recentSearches') }}
            </div>
            <div class="d-flex flex-wrap gap-2">
              <VChip
                v-for="(word, index) in recentSearches"
                :key="index"
                variant="flat"
                color="primary"
                size="small"
                @click="searchWord = word"
              >
                <VIcon start size="x-small">mdi-history</VIcon>
                {{ word }}
              </VChip>
            </div>
          </div>

          <!-- 空状态提示 -->
          <div v-else class="empty-hint pt-3">
            <span class="text-body-1 text-medium-emphasis">{{ t('dialog.searchBar.emptySearchHint') }}</span>
          </div>
        </div>
      </div>

      <!-- 弹窗形态保留底部关闭按钮，桌面下拉不显示页脚。 -->
      <div v-if="!display.mdAndUp.value" class="search-footer-mobile">
        <VBtn icon variant="tonal" @click="closeSearch">
          <VIcon icon="mdi-close" size="20" />
        </VBtn>
      </div>
    </VCard>
  </component>

  <!-- 站点选择对话框 -->
  <SearchSiteDialog
    v-if="chooseSiteDialog"
    v-model="chooseSiteDialog"
    :sites="allSites"
    :selected="selectedSites"
    @search="searchSites"
    @close="chooseSiteDialog = false"
    @reload="queryAllSites"
  />
</template>

<style scoped>
/* stylelint-disable no-descending-specificity */

.search-dialog {
  display: flex;
  overflow: hidden;
  flex-direction: column;
}

.search-dialog--dropdown {
  border: 1px solid rgba(var(--v-theme-on-surface), 0.08);
  inline-size: min(32rem, calc(100vw - 2rem));
  max-block-size: min(72vh, 42rem);
}

.search-desktop-activator {
  flex: 0 1 22rem;
  inline-size: clamp(15rem, 32vw, 22rem);
  max-inline-size: calc(100vw - 10rem);
}

.search-desktop-activator .search-input-wrapper {
  border-color: rgba(var(--v-theme-on-surface), 0.12);
  background: rgba(var(--v-theme-surface), 0.72);
  block-size: 42px;
  padding-inline: 14px 8px;
}

html[data-theme='transparent'] .search-desktop-activator .search-input-wrapper,
.v-theme--transparent .search-desktop-activator .search-input-wrapper {
  background: rgba(var(--v-theme-surface), var(--transparent-opacity-light, 0.2));
}

.search-icon-trigger {
  flex: 0 0 auto;
}

.search-icon-trigger__icon {
  transform: scaleX(-1);
}

/* 搜索头部区域 */
.search-header {
  padding-block: 16px 12px;
  padding-inline: 16px;
}

/* 搜索输入框容器 */
.search-input-wrapper {
  display: flex;
  align-items: center;
  border: 1.5px solid rgba(var(--v-theme-primary), 0.4);
  border-radius: var(--app-vuetify-rounded-pill);
  background-color: rgba(var(--v-theme-surface-variant), 0.04);
  block-size: 48px;
  padding-inline: 14px 6px;
  transition:
    border-color 0.2s ease,
    border-radius 0.2s ease,
    box-shadow 0.2s ease;
}

.search-input-wrapper:focus-within {
  border-color: rgb(var(--v-theme-primary));
}

.search-input-icon {
  flex-shrink: 0;
  color: rgba(var(--v-theme-on-surface), 0.45);
  margin-inline-end: 10px;
}

.search-native-input {
  flex: 1;
  border: none;
  background: transparent;
  color: rgba(var(--v-theme-on-surface), 0.87);
  font-size: 15px;
  line-height: 1.5;
  min-inline-size: 0;
  outline: none;
}

.search-native-input::placeholder {
  color: rgba(var(--v-theme-on-surface), 0.38);
}

.search-submit-btn {
  flex-shrink: 0;
  border-radius: 50% !important;
  background-color: rgba(var(--v-theme-on-surface), 0.06) !important;
  block-size: 36px !important;
  color: rgba(var(--v-theme-on-surface), 0.6) !important;
  inline-size: 36px !important;
  transition: background-color 0.2s ease;
}

.search-submit-btn:hover {
  background-color: rgba(var(--v-theme-on-surface), 0.12) !important;
}

.search-shortcut-badge {
  flex-shrink: 0;
  margin-inline-start: 10px;
  white-space: nowrap;
}

/* 主内容区域 */
.search-content {
  max-block-size: 600px;
  min-block-size: 150px;
  overflow-y: auto;
  overscroll-behavior-y: contain;
}

.search-dialog--dropdown .search-content {
  max-block-size: min(58vh, 34rem);
}

.search-list {
  background: transparent !important;
}

.search-item-source-row {
  display: flex;
  overflow: hidden;
  align-items: center;
  block-size: 0;
  inline-size: 100%;
  margin-block-start: 0;
  min-inline-size: 0;
  transition:
    block-size 0.15s ease,
    margin-block-start 0.15s ease;
}

.search-source-result-item:hover .search-item-source-row,
.search-source-result-item:focus-within .search-item-source-row {
  block-size: 28px;
  margin-block-start: 6px;
}

.search-item-source-toggle {
  overflow: auto hidden;
  border: var(--app-grouped-list-border);
  border-radius: var(--app-control-radius);
  backdrop-filter: var(--app-grouped-list-backdrop-filter);
  background: var(--app-grouped-list-background);
  block-size: 28px;
  max-inline-size: 100%;
  opacity: 0;
  pointer-events: none;
  transform: scale(0.98);
  transform-origin: center left;
  transition:
    opacity 0.15s ease,
    transform 0.15s ease;
}

.search-source-result-item:hover .search-item-source-toggle,
.search-source-result-item:focus-within .search-item-source-toggle {
  opacity: 1;
  pointer-events: auto;
  transform: scale(1);
}

.media-source-button {
  block-size: 100% !important;
  color: rgba(var(--v-theme-on-surface), 0.72) !important;
  font-size: 0.6875rem;
  letter-spacing: 0;
  min-inline-size: 0 !important;
  padding-inline: 7px !important;
  white-space: nowrap;
}

.media-source-button:hover {
  background: var(--app-grouped-list-hover-background) !important;
}

.media-source-button--active {
  background: var(--app-grouped-list-active-background) !important;
  color: rgb(var(--v-theme-primary)) !important;
}

.search-result-item {
  margin-block-end: 2px;
  transition: background-color 0.15s ease;
}

.search-result-item:hover {
  background-color: rgba(var(--v-theme-on-surface), 0.04);
}

@media (hover: none) {
  .search-item-source-row {
    block-size: 28px;
    margin-block-start: 6px;
  }

  .search-item-source-toggle {
    opacity: 1;
    pointer-events: auto;
    transform: none;
  }
}

.result-icon-wrapper {
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  background-color: rgba(var(--v-theme-surface-variant), 0.1);
  block-size: 32px;
  inline-size: 32px;
  margin-inline-end: 12px;
}

.search-divider {
  opacity: 0.08;
}

.primary-text {
  color: rgb(var(--v-theme-primary));
}

/* 空状态 */
.search-empty-state {
  display: flex;
  align-items: start;
  justify-content: center;
  min-block-size: 150px;
  padding-block: 0;
  padding-inline: 1.5rem;
}

.recent-searches-section {
  inline-size: 100%;
  padding-block-start: 1rem;
}

.empty-hint {
  text-align: center;
}

kbd {
  border: 1px solid rgba(var(--v-theme-on-surface), 0.15);
  border-radius: 5px;
  background-color: rgba(var(--v-theme-on-surface), 0.04);
  color: rgba(var(--v-theme-on-surface), 0.6);
  font-family: inherit;
  font-size: 11px;
  font-weight: 500;
  line-height: 1;
  padding-block: 3px;
  padding-inline: 6px;
}

/* 移动端底部关闭图标 */
.search-footer-mobile {
  display: flex;
  justify-content: center;
  margin-block-start: auto;
  padding-block: 12px;
  padding-block-end: calc(12px + env(safe-area-inset-bottom));
}

/* 响应式 */
@media (width <= 600px) {
  .search-header {
    padding-block: 12px 10px;
    padding-inline: 12px;
  }

  .search-input-wrapper {
    block-size: 44px;
    padding-inline: 12px 4px;
  }

  .search-native-input {
    font-size: 14px;
  }
}
</style>
