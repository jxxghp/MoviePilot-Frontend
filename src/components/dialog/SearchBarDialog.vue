<script setup lang="ts">
import api from '@/api'
import type { Site, Plugin, Subscribe } from '@/api/types'
import { getNavMenus, getSettingTabs } from '@/router/i18n-menu'
import { NavMenu } from '@/@layouts/types'
import { useUserStore, useGlobalSettingsStore } from '@/stores'
import SearchSiteDialog from '@/components/dialog/SearchSiteDialog.vue'
import { useI18n } from 'vue-i18n'
import { useDisplay } from 'vuetify'
import { hasPermission, filterMenusByPermission } from '@/utils/permission'

// 显示器宽度
const display = useDisplay()

// 多语言支持
const { t } = useI18n()

// 定义props，接收modelValue
const props = defineProps<{
  modelValue: boolean
}>()

// 路由
const router = useRouter()

// 用户 Store
const userStore = useUserStore()

// 全局设置 Store
const globalSettingsStore = useGlobalSettingsStore()
const globalSettings = globalSettingsStore.globalSettings

// 超级用户
const superUser = userStore.superUser

// 当前用户名
const userName = userStore.userName

// 权限检查
const hasSearchPermission = computed(() => {
  return hasPermission(
    {
      is_superuser: userStore.superUser,
      ...userStore.permissions,
    },
    'search',
  )
})

const hasSubscribePermission = computed(() => {
  return hasPermission(
    {
      is_superuser: userStore.superUser,
      ...userStore.permissions,
    },
    'subscribe',
  )
})

const hasManagePermission = computed(() => {
  return hasPermission(
    {
      is_superuser: userStore.superUser,
      ...userStore.permissions,
    },
    'manage',
  )
})

// 是否显示合集搜索项（当SEARCH_SOURCE包含themoviedb时显示）
const showCollectionSearch = computed(() => {
  return globalSettings.SEARCH_SOURCE?.includes('themoviedb') || false
})

// 所有订阅数据
const SubscribeItems = ref<Subscribe[]>([])

// 站点选择对话框
const chooseSiteDialog = ref(false)
const selectedSites = ref<number[]>([])
const allSites = ref<Site[]>([])

// 定义事件
const emit = defineEmits(['close', 'update:modelValue'])

// 对话框状态的本地计算属性
const dialog = computed({
  get: () => props.modelValue,
  set: val => emit('update:modelValue', val),
})

// 搜索词
const searchWord = ref<string | null>(null)

// ref
const searchWordInput = ref<HTMLElement | null>(null)

// 近期搜索词条
const recentSearches = ref<string[]>([])

// 保存近期搜索到本地
function saveRecentSearches(keyword: string) {
  if (!keyword) return
  if (recentSearches.value.includes(keyword)) return
  recentSearches.value.unshift(keyword)
  localStorage.setItem('MP_RecentSearches', JSON.stringify(recentSearches.value))
}

// 从本地加载近期搜索
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

// 所有菜单功能
function getMenus(): NavMenu[] {
  let menus: NavMenu[] = []
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
      }),
  )
  // 设置标签页
  getSettingTabs(t).forEach(
    item =>
      item &&
      menus.push({
        title: t('setting') + ' -> ' + item.title,
        icon: item.icon,
        to: `/setting?tab=${item.tab}`,
        header: '',
        admin: true,
        description: item.description,
      }),
  )

  return menus
}

// 获取用户权限信息
const userPermissions = computed(() => ({
  is_superuser: userStore.superUser,
  ...userStore.permissions,
}))

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

// 获取插件列表数据
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
  if (!hasManagePermission.value) return []
  const lowerWord = (searchWord.value as string).toLowerCase()
  return pluginItems.value.filter((item: Plugin) => {
    if (!item.plugin_name && !item.plugin_desc) return false
    return item.plugin_name?.toLowerCase().includes(lowerWord) || item.plugin_desc?.toLowerCase().includes(lowerWord)
  })
})

// 获取订阅列表数据
async function fetchSubscribes() {
  try {
    SubscribeItems.value = await api.get('subscribe/')
  } catch (error) {
    console.error(error)
  }
}

// 从接口加载用户站点偏好设置
const loadUserSitePreferences = async () => {
  try {
    const result = await api.get('system/setting/IndexerSites')
    if (result && result.data && result.data.value) {
      selectedSites.value = result.data.value
      return
    }
  } catch (err) {
    console.error(err)
  }
}

// 查询所有站点
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

// 打开站点选择对话框
const openSiteDialog = () => {
  chooseSiteDialog.value = true
}

// 匹配的订阅列表
const matchedSubscribeItems = computed(() => {
  if (!searchWord.value) return []
  if (!hasSubscribePermission.value) return []
  const lowerWord = (searchWord.value as string).toLowerCase()
  return SubscribeItems.value.filter((item: Subscribe) => {
    return (item.name.toLowerCase().includes(lowerWord) && (superUser || userName === item.username)) || false
  })
})

// 搜索多站点
function searchSites(sites: number[]) {
  chooseSiteDialog.value = false
  selectedSites.value = sites
  searchTorrent()
}

// 搜索资源
function searchTorrent() {
  if (!searchWord.value) return
  // 记录搜索词
  saveRecentSearches(searchWord.value)
  // 跳转到搜索页面
  router.push({
    path: '/resource',
    query: {
      keyword: searchWord.value,
      area: 'title',
      sites: selectedSites.value.join(','),
    },
  })
  // 关闭搜索对话框
  dialog.value = false
  emit('close')
}

// 跳转媒体搜索页面
function searchMedia(searchType: string) {
  // 搜索类型 media/person
  if (!searchWord.value) return
  saveRecentSearches(searchWord.value)
  router.push({
    path: '/browse/media/search',
    query: {
      title: searchWord.value,
      type: searchType,
    },
  })
  emit('close')
}

// 跳转到历史记录页面
function searchHistory() {
  if (!searchWord.value) return
  saveRecentSearches(searchWord.value)
  router.push({
    path: '/history',
    query: {
      search: searchWord.value,
    },
  })
  emit('close')
}

// 跳转到订阅分享页面
function searchSubscribeShares() {
  if (!searchWord.value) return
  saveRecentSearches(searchWord.value)
  router.push({
    path: '/subscribe-share',
    query: {
      keyword: searchWord.value,
    },
  })
  emit('close')
}

// 跳转插件页面
function showPlugin(pluginId: string) {
  router.push({
    path: `/plugins/`,
    query: {
      tab: 'installed',
      id: pluginId,
    },
  })
  emit('close')
}

// 跳转菜单页面
function goPage(to: string) {
  router.push(to)
  emit('close')
}

// 跳转订阅页面
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
  emit('close')
}

onMounted(() => {
  setTimeout(() => {
    searchWordInput.value?.focus()
  }, 500)
  // 根据权限加载不同的数据
  if (hasManagePermission.value) {
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
  <VDialog v-model="dialog" max-width="42rem" scrollable :fullscreen="!display.mdAndUp.value">
    <VCard class="search-dialog">
      <!-- 搜索输入框 -->
      <VCardItem class="pa-4 pa-sm-5 search-box-container">
        <VCombobox
          ref="searchWordInput"
          v-model="searchWord"
          density="comfortable"
          variant="outlined"
          class="search-input"
          prepend-inner-icon="mdi-magnify"
          append-inner-icon="mdi-close"
          @click:append-inner="emit('close')"
          :placeholder="t('dialog.searchBar.searchPlaceholder')"
          @keydown.enter="searchMedia('media')"
          hide-details
          clearable
        />
      </VCardItem>

      <VDivider />

      <!-- 主搜索结果区域 -->
      <VCardText class="search-results-container pa-0">
        <!-- 有搜索词时显示结果 -->
        <VList lines="two" v-if="searchWord" class="search-list py-2">
          <!-- 搜索结果分组标题 -->
          <VListSubheader class="font-weight-medium text-uppercase py-2 px-4 px-sm-6">
            {{ t('common.media') }}
          </VListSubheader>

          <!-- 媒体搜索选项 -->
          <VHover>
            <template #default="hover">
              <VListItem
                density="comfortable"
                link
                rounded="xl"
                v-bind="hover.props"
                @click="searchMedia('media')"
                class="search-option mx-2 mx-sm-4 my-1"
              >
                <template #prepend>
                  <div class="option-icon-wrapper d-flex align-center justify-center">
                    <VIcon
                      icon="mdi-movie-search"
                      :color="hover.isHovering ? 'primary' : 'medium-emphasis'"
                      size="small"
                    />
                  </div>
                </template>
                <VListItemTitle class="font-weight-medium"
                  >{{ t('recommend.categoryMovie') }}、{{ t('recommend.categoryTV') }}</VListItemTitle
                >
                <VListItemSubtitle class="text-body-2 text-medium-emphasis mt-1">
                  {{ t('common.search') }} <span class="primary-text font-weight-medium">{{ searchWord }}</span>
                  {{ t('resource.title') }}
                </VListItemSubtitle>
                <template #append>
                  <VIcon v-if="hover.isHovering" icon="mdi-chevron-right" color="primary" />
                </template>
              </VListItem>
            </template>
          </VHover>

          <VHover v-if="showCollectionSearch">
            <template #default="hover">
              <VListItem
                density="comfortable"
                link
                rounded="xl"
                v-bind="hover.props"
                @click="searchMedia('collection')"
                class="search-option mx-2 mx-sm-4 my-1"
              >
                <template #prepend>
                  <div class="option-icon-wrapper d-flex align-center justify-center">
                    <VIcon
                      icon="mdi-movie-filter"
                      :color="hover.isHovering ? 'primary' : 'medium-emphasis'"
                      size="small"
                    />
                  </div>
                </template>
                <VListItemTitle class="font-weight-medium">{{ t('dialog.searchBar.collections') }}</VListItemTitle>
                <VListItemSubtitle class="text-body-2 text-medium-emphasis mt-1">
                  {{ t('common.search') }} <span class="primary-text font-weight-medium">{{ searchWord }}</span>
                  {{ t('dialog.searchBar.collectionSearch') }}
                </VListItemSubtitle>
                <template #append>
                  <VIcon v-if="hover.isHovering" icon="mdi-chevron-right" color="primary" />
                </template>
              </VListItem>
            </template>
          </VHover>

          <VHover>
            <template #default="hover">
              <VListItem
                density="comfortable"
                link
                rounded="xl"
                v-bind="hover.props"
                @click="searchMedia('person')"
                class="search-option mx-2 mx-sm-4 my-1"
              >
                <template #prepend>
                  <div class="option-icon-wrapper d-flex align-center justify-center">
                    <VIcon
                      icon="mdi-account-search"
                      :color="hover.isHovering ? 'primary' : 'medium-emphasis'"
                      size="small"
                    />
                  </div>
                </template>
                <VListItemTitle class="font-weight-medium">{{ t('browse.actor') }}</VListItemTitle>
                <VListItemSubtitle class="text-body-2 text-medium-emphasis mt-1">
                  {{ t('common.search') }} <span class="primary-text font-weight-medium">{{ searchWord }}</span>
                  {{ t('dialog.searchBar.actorSearch') }}
                </VListItemSubtitle>
                <template #append>
                  <VIcon v-if="hover.isHovering" icon="mdi-chevron-right" color="primary" />
                </template>
              </VListItem>
            </template>
          </VHover>

          <VHover v-if="hasSubscribePermission">
            <template #default="hover">
              <VListItem
                density="comfortable"
                link
                rounded="xl"
                v-bind="hover.props"
                @click="searchSubscribeShares"
                class="search-option mx-2 mx-sm-4 my-1"
              >
                <template #prepend>
                  <div class="option-icon-wrapper d-flex align-center justify-center">
                    <VIcon
                      icon="mdi-share-variant"
                      :color="hover.isHovering ? 'primary' : 'medium-emphasis'"
                      size="small"
                    />
                  </div>
                </template>
                <VListItemTitle class="font-weight-medium">{{ t('subscribe.searchShares') }}</VListItemTitle>
                <VListItemSubtitle class="text-body-2 text-medium-emphasis mt-1">
                  {{ t('common.search') }} <span class="primary-text font-weight-medium">{{ searchWord }}</span>
                  {{ t('dialog.searchBar.subscribeShareSearch') }}
                </VListItemSubtitle>
                <template #append>
                  <VIcon v-if="hover.isHovering" icon="mdi-chevron-right" color="primary" />
                </template>
              </VListItem>
            </template>
          </VHover>

          <VHover v-if="hasManagePermission">
            <template #default="hover">
              <VListItem
                density="comfortable"
                link
                rounded="xl"
                v-bind="hover.props"
                @click="searchHistory"
                class="search-option mx-2 mx-sm-4 my-1"
              >
                <template #prepend>
                  <div class="option-icon-wrapper d-flex align-center justify-center">
                    <VIcon icon="mdi-history" :color="hover.isHovering ? 'primary' : 'medium-emphasis'" size="small" />
                  </div>
                </template>
                <VListItemTitle class="font-weight-medium">{{ t('navItems.history') }}</VListItemTitle>
                <VListItemSubtitle class="text-body-2 text-medium-emphasis mt-1">
                  {{ t('common.search') }} <span class="primary-text font-weight-medium">{{ searchWord }}</span>
                  {{ t('dialog.searchBar.historySearch') }}
                </VListItemSubtitle>
                <template #append>
                  <VIcon v-if="hover.isHovering" icon="mdi-chevron-right" color="primary" />
                </template>
              </VListItem>
            </template>
          </VHover>

          <!-- 其他搜索结果 -->
          <template v-if="matchedSubscribeItems.length > 0">
            <VDivider class="mx-4 mx-sm-6 my-2 search-divider" />
            <VListSubheader class="font-weight-medium text-uppercase py-2 px-4 px-sm-6">{{
              t('dialog.searchBar.subscriptions')
            }}</VListSubheader>

            <VHover v-for="subscribe in matchedSubscribeItems" :key="subscribe.id">
              <template #default="hover">
                <VListItem
                  density="comfortable"
                  link
                  rounded="xl"
                  v-bind="hover.props"
                  @click="goSubscribe(subscribe)"
                  class="search-option mx-2 mx-sm-4 my-1"
                >
                  <template #prepend>
                    <div class="option-icon-wrapper d-flex align-center justify-center">
                      <VIcon
                        :icon="subscribe.type === '电影' ? 'mdi-movie-roll' : 'mdi-television-classic'"
                        :color="hover.isHovering ? 'primary' : 'medium-emphasis'"
                        size="small"
                      />
                    </div>
                  </template>
                  <VListItemTitle class="font-weight-medium">
                    {{ subscribe.name
                    }}<span v-if="subscribe.season" class="text-body-2">
                      {{ t('resource.season') }} {{ subscribe.season }}</span
                    >
                  </VListItemTitle>
                  <VListItemSubtitle class="text-body-2 text-medium-emphasis mt-1">
                    {{ subscribe.type }}
                  </VListItemSubtitle>
                  <template #append>
                    <VIcon v-if="hover.isHovering" icon="mdi-chevron-right" color="primary" />
                  </template>
                </VListItem>
              </template>
            </VHover>
          </template>

          <template v-if="matchedMenuItems.length > 0">
            <VDivider class="mx-4 mx-sm-6 my-2 search-divider" />
            <VListSubheader class="font-weight-medium text-uppercase py-2 px-4 px-sm-6">{{
              t('dialog.searchBar.functions')
            }}</VListSubheader>

            <VHover v-for="menu in matchedMenuItems" :key="menu.title">
              <template #default="hover">
                <VListItem
                  density="comfortable"
                  link
                  rounded="xl"
                  v-bind="hover.props"
                  @click="goPage(menu.to as string)"
                  class="search-option mx-2 mx-sm-4 my-1"
                >
                  <template #prepend>
                    <div class="option-icon-wrapper d-flex align-center justify-center">
                      <VIcon
                        :icon="menu.icon as string"
                        :color="hover.isHovering ? 'primary' : 'medium-emphasis'"
                        size="small"
                      />
                    </div>
                  </template>
                  <VListItemTitle class="font-weight-medium">
                    {{ menu.title }}
                  </VListItemTitle>
                  <VListItemSubtitle v-if="menu.description" class="text-body-2 text-medium-emphasis mt-1">
                    {{ menu.description }}
                  </VListItemSubtitle>
                  <template #append>
                    <VIcon v-if="hover.isHovering" icon="mdi-chevron-right" color="primary" />
                  </template>
                </VListItem>
              </template>
            </VHover>
          </template>

          <template v-if="matchedPluginItems.length > 0">
            <VDivider class="mx-4 mx-sm-6 my-2 search-divider" />
            <VListSubheader class="font-weight-medium text-uppercase py-2 px-4 px-sm-6">{{
              t('dialog.searchBar.plugins')
            }}</VListSubheader>

            <VHover v-for="plugin in matchedPluginItems" :key="plugin.id">
              <template #default="hover">
                <VListItem
                  density="comfortable"
                  link
                  rounded="xl"
                  v-bind="hover.props"
                  @click="showPlugin(plugin.id ?? '')"
                  class="search-option mx-2 mx-sm-4 my-1"
                >
                  <template #prepend>
                    <div class="option-icon-wrapper d-flex align-center justify-center">
                      <VIcon icon="mdi-apps" :color="hover.isHovering ? 'primary' : 'medium-emphasis'" size="small" />
                    </div>
                  </template>
                  <VListItemTitle class="font-weight-medium">
                    {{ plugin.plugin_name }}
                  </VListItemTitle>
                  <VListItemSubtitle class="text-body-2 text-medium-emphasis mt-1">
                    {{ plugin.plugin_desc }}
                  </VListItemSubtitle>
                  <template #append>
                    <VIcon v-if="hover.isHovering" icon="mdi-chevron-right" color="primary" />
                  </template>
                </VListItem>
              </template>
            </VHover>
          </template>

          <!-- 将站点资源搜索移到最底部 -->
          <template v-if="searchWord && hasSearchPermission">
            <VDivider class="mx-4 mx-sm-6 my-2 search-divider" />
            <VListSubheader class="font-weight-medium text-uppercase py-2 px-4 px-sm-6">{{
              t('dialog.searchBar.siteResources')
            }}</VListSubheader>

            <VCard class="mx-3 mx-sm-6 mb-4 mt-2 site-search-card">
              <VCardText class="pa-3 pa-sm-4">
                <div class="d-flex flex-column">
                  <div class="d-flex align-center">
                    <div class="search-icon-wrapper mr-3">
                      <VIcon icon="mdi-file-search" color="primary" size="small" />
                    </div>
                    <div class="flex-grow-1">
                      <div class="font-weight-medium text-body-1">{{ t('dialog.searchBar.searchInSites') }}</div>
                      <div class="text-caption text-medium-emphasis mt-1">
                        {{ t('common.search') }} <span class="primary-text font-weight-medium">{{ searchWord }}</span>
                        {{ t('dialog.searchBar.relatedResources') }}
                      </div>
                    </div>
                    <VBtn
                      color="primary"
                      @click="searchTorrent"
                      prepend-icon="mdi-magnify"
                      size="small"
                      variant="flat"
                      class="search-btn"
                    >
                      {{ t('common.search') }}
                    </VBtn>
                  </div>

                  <div
                    v-if="hasManagePermission"
                    class="d-flex align-center flex-wrap site-chips-container mt-4 py-2 px-2 px-sm-3"
                  >
                    <div class="d-flex align-center flex-wrap flex-grow-1">
                      <VChip
                        v-if="selectedSites.length > 0"
                        color="primary"
                        size="small"
                        variant="flat"
                        class="mr-2 mb-1 font-weight-medium"
                      >
                        {{ selectedSites.length }}/{{ allSites.length }}
                      </VChip>
                      <VChip
                        v-for="(site, index) in allSites.filter(s => selectedSites.includes(s.id)).slice(0, 5)"
                        :key="site.id"
                        size="x-small"
                        variant="outlined"
                        class="mr-1 mb-1 site-chip"
                      >
                        {{ site.name }}
                      </VChip>
                      <VChip
                        v-if="selectedSites.length > 5"
                        size="x-small"
                        variant="outlined"
                        class="mr-1 mb-1 site-chip text-medium-emphasis"
                      >
                        +{{ selectedSites.length - 5 }}
                      </VChip>
                    </div>
                    <VBtn
                      size="small"
                      variant="tonal"
                      color="primary"
                      @click="openSiteDialog"
                      class="ml-auto site-select-btn"
                      rounded="pill"
                    >
                      {{ t('dialog.searchBar.selectSites') }}
                      <VIcon size="small" class="ml-1">mdi-cog-outline</VIcon>
                    </VBtn>
                  </div>
                </div>
              </VCardText>
            </VCard>
          </template>
        </VList>

        <!-- 无搜索词时显示最近搜索和提示 -->
        <div v-else class="recent-searches py-6 px-4 px-sm-6">
          <div v-if="recentSearches.length > 0" class="mb-6">
            <div class="text-h6 font-weight-medium mb-3">{{ t('dialog.searchBar.recentSearches') }}</div>
            <div class="d-flex flex-wrap">
              <VChip
                v-for="(word, index) in recentSearches"
                :key="index"
                class="me-2 mb-2"
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

          <div v-else class="text-center mt-6 py-6 empty-search-state">
            <div class="search-icon-wrapper mx-auto mb-4">
              <VIcon icon="mdi-magnify" size="large" color="primary" />
            </div>
            <div class="text-h6 font-weight-medium mb-2">{{ t('dialog.searchBar.searchPlaceholder') }}</div>
            <div class="text-body-2 text-medium-emphasis">{{ t('dialog.searchBar.searchTip') }}</div>
          </div>
        </div>
      </VCardText>
    </VCard>
  </VDialog>

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
.search-dialog {
  overflow: hidden;
  border-radius: 16px;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 8%);
}

.site-dialog {
  overflow: hidden;
  border-radius: 16px;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 8%);
}

.search-divider {
  opacity: 0.08;
}

.close-btn {
  position: absolute;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background-color: rgba(var(--v-theme-on-surface), 0.04);
  block-size: 36px;
  inline-size: 36px;
  inset-block-start: 1.4rem;
  inset-inline-end: 1.2rem;
  transition: background-color 0.2s ease;
}

.close-btn:hover {
  background-color: rgba(var(--v-theme-error), 0.1);
}

.search-input {
  border-radius: 12px;
  font-size: 16px;
}

.search-icon {
  color: rgb(var(--v-theme-primary));
}

.option-icon-wrapper {
  border-radius: 8px;
  background-color: rgba(var(--v-theme-surface-variant), 0.12);
  block-size: 32px;
  inline-size: 32px;
  margin-inline-end: 12px;
}

.search-icon-wrapper {
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  background-color: rgba(var(--v-theme-primary), 0.08);
  block-size: 36px;
  inline-size: 36px;
}

.search-icon-wrapper.warning {
  background-color: rgba(var(--v-theme-warning), 0.08);
}

.primary-text {
  color: rgb(var(--v-theme-primary));
}

.search-option {
  border: 1px solid transparent;
  margin-block-end: 2px;
  transition: transform 0.2s ease, background-color 0.2s ease;
}

.search-option:hover {
  background-color: rgba(var(--v-theme-primary), 0.04);
  transform: translateX(4px);
}

.recent-searches {
  min-block-size: 200px;
}

.site-search-card {
  border: 1px solid rgba(var(--v-theme-on-surface), 0.08);
  border-radius: 14px;
}

.site-chip {
  font-weight: normal;
  transition: all 0.2s ease;
}

.site-chip:hover {
  background-color: rgba(var(--v-theme-primary), 0.1);
  color: rgb(var(--v-theme-primary));
}

.search-btn {
  font-weight: 500;
  letter-spacing: 0.5px;
  min-inline-size: 70px;
}

.empty-search-state,
.empty-site-state {
  animation: fade-in 0.3s ease-in-out;
}

@keyframes fade-in {
  from {
    opacity: 0;
    transform: translateY(10px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.clear-icon {
  opacity: 0.7;
}

.clear-icon:hover {
  opacity: 1;
}

.site-select-btn {
  font-size: 12px;
  letter-spacing: 0.5px;
  min-block-size: 32px;
  padding-block: 0;
  padding-inline: 12px;
}

.site-chips-container {
  border-radius: 10px;
  background-color: rgba(var(--v-theme-surface-variant), 0.06);
}

@media (width <= 600px) {
  .search-box-container {
    padding: 16px;
  }

  .search-input {
    font-size: 14px;
  }

  .close-btn {
    block-size: 32px;
    inline-size: 32px;
    inset-block-start: 1rem;
    inset-inline-end: 0.8rem;
  }

  .site-chips-container {
    padding-block: 6px;
    padding-inline: 8px;
  }

  .site-select-btn {
    font-size: 11px;
    min-block-size: 28px;
  }
}
</style>
