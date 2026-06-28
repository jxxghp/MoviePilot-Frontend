<script lang="ts" setup>
import api from '@/api'
import type { Site, SiteUserData } from '@/api/types'
import SiteCard from '@/components/cards/SiteCard.vue'
import NoDataFound from '@/components/states/NoDataFound.vue'
import ProgressiveCardGrid from '@/components/misc/ProgressiveCardGrid.vue'
import { useDynamicButton, type DynamicButtonMenuItem } from '@/composables/useDynamicButton'
import { useI18n } from 'vue-i18n'
import { usePWA } from '@/composables/usePWA'
import { useToast } from 'vue-toastification'
import { useKeepAliveRefresh, type KeepAliveRefreshContext } from '@/composables/useKeepAliveRefresh'
import { openSharedDialog } from '@/composables/useSharedDialog'
import { useUserStore } from '@/stores'
import { buildUserPermissionContext, hasPermission } from '@/utils/permission'

// 国际化
const { t } = useI18n()

// 提示框
const $toast = useToast()

// 路由
const route = useRoute()

// APP 模式检测
const { appMode } = usePWA()
const userStore = useUserStore()
const canManage = computed(() =>
  hasPermission(buildUserPermissionContext(userStore.superUser, userStore.permissions), 'manage'),
)

// 拖拽排序和站点弹窗都不是站点列表首屏必需，打开对应功能时再加载。
const Draggable = defineAsyncComponent(() => import('vuedraggable').then(module => module.default))
const SiteAddEditDialog = defineAsyncComponent(() => import('@/components/dialog/SiteAddEditDialog.vue'))
const SiteStatisticsDialog = defineAsyncComponent(() => import('@/components/dialog/SiteStatisticsDialog.vue'))
const SiteImportDialog = defineAsyncComponent(() => import('@/components/dialog/SiteImportDialog.vue'))

// 站点列表
const siteList = ref<Site[]>([])

// 站点数据列表
const userDataList = ref<SiteUserData[]>([])

// 站点统计数据列表
const siteStatsList = ref<{ [domain: string]: any }>({})

// 是否刷新过
const isRefreshed = ref(false)

// 是否加载中
const loading = ref(false)

const sortMode = ref(false)

// 筛选相关
const filterMenu = ref(false)
const filterOption = ref('all') // all, active, inactive, connected, slow, failed, unknown

// 筛选选项
const filterOptions = computed(() => [
  { value: 'all', label: t('common.all'), icon: 'mdi-filter-multiple-outline' },
  { value: 'active', label: t('common.active'), icon: 'mdi-check-circle', color: 'success' },
  { value: 'inactive', label: t('common.inactive'), icon: 'mdi-stop-circle', color: 'error' },
  { value: 'connected', label: t('site.connectionNormal'), icon: 'mdi-wifi', color: 'success' },
  { value: 'slow', label: t('site.connectionSlow'), icon: 'mdi-wifi-strength-2', color: 'warning' },
  { value: 'failed', label: t('site.connectionFailed'), icon: 'mdi-wifi-off', color: 'error' },
  { value: 'unknown', label: t('site.connectionUnknown'), icon: 'mdi-help-circle', color: 'secondary' },
])

// 筛选后的站点列表
const filteredSiteList = computed(() => {
  if (filterOption.value === 'all') {
    return siteList.value
  }
  return siteList.value.filter(site => {
    if (filterOption.value === 'active') {
      return site.is_active
    } else if (filterOption.value === 'inactive') {
      return !site.is_active
    } else if (['connected', 'slow', 'failed', 'unknown'].includes(filterOption.value)) {
      const connectionStatus = getConnectionStatus(site.domain)
      return connectionStatus === filterOption.value
    }
    return true
  })
})

// 用于拖拽排序的列表
const draggableSiteList = computed({
  get() {
    return filterOption.value === 'all' ? siteList.value : filteredSiteList.value
  },
  set(value) {
    if (filterOption.value === 'all') {
      siteList.value = value
    }
  },
})

const siteUserDataMap = computed<Record<string, SiteUserData | undefined>>(() => {
  const map: Record<string, SiteUserData | undefined> = {}

  userDataList.value.forEach(userData => {
    if (userData.domain) {
      map[userData.domain] = userData
    }
  })

  return map
})

const canDragSort = computed(() => sortMode.value && filterOption.value === 'all')
const shouldVirtualizeList = computed(() => !sortMode.value)

// 当前筛选选项的显示信息
const currentFilter = computed(() => {
  return filterOptions.value.find(option => option.value === filterOption.value)
})

// 获取站点列表数据
async function fetchData(context: KeepAliveRefreshContext = {}) {
  const showLoading = !context.silent || !isRefreshed.value

  try {
    if (showLoading) {
      loading.value = true
    }

    const [sites] = await Promise.all([
      api.get<Site[], Site[]>('site/'),
      // 站点统计在列表请求期间并行预取，减少刷新时卡片分两轮明显重绘。
      fetchSiteStats(),
    ])
    siteList.value = sites
    isRefreshed.value = true
  } catch (error) {
    console.error(error)
  } finally {
    if (showLoading) {
      loading.value = false
    }
  }
}

// 获取站点最新数据
async function fetchUserData() {
  try {
    userDataList.value = await api.get('site/userdata/latest')
  } catch (error) {
    console.error(error)
  }
}

// 获取站点统计数据
async function fetchSiteStats() {
  try {
    // 使用批量接口一次性获取所有站点统计数据
    const response = await api.get('site/statistic')
    const stats = response.data || response

    // 将数组转换为以domain为键的对象
    const statsMap: { [domain: string]: any } = {}
    if (Array.isArray(stats)) {
      stats.forEach((stat: any) => {
        if (stat.domain) {
          statsMap[stat.domain] = stat
        }
      })
    }
    siteStatsList.value = statsMap
  } catch (error) {
    console.error('Failed to fetch site statistics:', error)
    siteStatsList.value = {}
  }
}

// 根据站点统计数据判断连接状态
function getConnectionStatus(domain: string) {
  const stats = siteStatsList.value[domain]
  if (!stats || Object.keys(stats).length === 0) {
    return 'unknown'
  }
  if (stats.lst_state === 1) {
    return 'failed'
  } else if (stats.lst_state === 0) {
    if (!stats.seconds) return 'unknown'
    if (stats.seconds >= 5) return 'slow'
    return 'connected'
  }
  return 'unknown'
}

// 保存站点排序
async function savaSitesPriority() {
  // 只在显示全部站点时允许排序
  if (filterOption.value !== 'all') {
    return
  }

  // 重新排序
  const priorities = draggableSiteList.value.map((site, index) => ({ id: site.id, pri: index + 1 }))
  try {
    const result: { [key: string]: any } = await api.post('site/priorities', priorities)
    if (!result.success) {
      fetchData()
    }
  } catch (error) {
    console.error(error)
  }
}

// 处理站点统计数据刷新请求
async function handleRefreshStats(domain?: string) {
  if (domain) {
    // 刷新特定站点的统计数据
    try {
      const stats = await api.get(`site/statistic/${domain}`)
      siteStatsList.value[domain] = stats
    } catch (error) {
      console.error(`Failed to refresh stats for ${domain}:`, error)
    }
  } else {
    // 刷新所有站点统计数据
    await fetchSiteStats()
  }
}

// 更新站点事件时
function onSiteSave() {
  fetchData()
}

// 选择筛选选项
function selectFilter(value: string) {
  filterOption.value = value
  filterMenu.value = false
}

function toggleSortMode() {
  sortMode.value = !sortMode.value
}

function openSiteAddDialog() {
  openSharedDialog(
    SiteAddEditDialog,
    { oper: 'add' },
    {
      save: onSiteSave,
    },
    { closeOn: ['close', 'save'] },
  )
}

function openSiteImportDialog() {
  openSharedDialog(
    SiteImportDialog,
    {},
    {
      'import-success': fetchData,
    },
    { closeOn: ['update:modelValue'] },
  )
}

function openSiteStatisticsDialog() {
  openSharedDialog(SiteStatisticsDialog, { sites: siteList.value }, {}, { closeOn: ['update:modelValue'] })
}

// 导出站点数据
async function exportSites() {
  try {
    // 获取所有站点数据
    const sites: Site[] = await api.get('site/')

    // 创建导出数据，只包含必要的字段
    const exportData = sites.map((site: Site) => ({
      name: site.name,
      domain: site.domain,
      url: site.url,
      rss: site.rss,
      downloader: site.downloader,
      cookie: site.cookie,
      apikey: site.apikey,
      token: site.token,
      ua: site.ua,
      proxy: site.proxy,
      filter: site.filter,
      render: site.render,
      public: site.public,
      note: site.note,
      timeout: site.timeout,
      limit_interval: site.limit_interval,
      limit_count: site.limit_count,
      limit_seconds: site.limit_seconds,
      is_active: site.is_active,
      pri: site.pri,
    }))

    // 创建Blob对象
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })

    // 创建下载链接
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `sites_export_${new Date().toISOString().split('T')[0]}.json`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)

    // 显示成功提示
    $toast.success(t('site.messages.exportSuccess'))
  } catch (error) {
    console.error('Export sites failed:', error)
    $toast.error(t('site.messages.exportFailed'))
  }
}

// 加载时获取数据
onBeforeMount(() => {
  fetchData()
  fetchUserData()
})

useKeepAliveRefresh(async context => {
  if (loading.value) return

  await Promise.all([fetchData(context), fetchUserData()])
})

watch(
  () => filterOption.value,
  value => {
    if (value !== 'all' && sortMode.value) {
      sortMode.value = false
    }
  },
  { immediate: true },
)

const shouldShowFloatingActions = computed(() => route.path === '/site' && isRefreshed.value && canManage.value)

// App 模式下将站点操作收纳到 Footer 动态菜单中，和插件页保持一致。
const siteDynamicMenuItems = computed<DynamicButtonMenuItem[]>(() => [
  {
    titleKey: 'site.actions.add',
    icon: 'mdi-web-plus',
    permission: 'manage',
    action: openSiteAddDialog,
  },
  {
    titleKey: 'site.actions.import',
    icon: 'mdi-import',
    permission: 'manage',
    action: openSiteImportDialog,
  },
  {
    titleKey: 'site.actions.export',
    icon: 'mdi-export',
    permission: 'manage',
    action: exportSites,
  },
  {
    titleKey: 'site.statistics',
    icon: 'mdi-chart-line',
    permission: 'manage',
    action: openSiteStatisticsDialog,
  },
])

// 使用动态按钮钩子
useDynamicButton({
  icon: 'mdi-web-plus',
  onClick: openSiteAddDialog,
  menuItems: siteDynamicMenuItems,
  permission: 'manage',
  show: computed(() => appMode.value && shouldShowFloatingActions.value),
})
</script>

<template>
  <div class="card-list-container">
    <!-- 页面标题和筛选/排序按钮 -->
    <div class="d-flex justify-space-between align-center mb-3">
      <VPageContentTitle :title="t('navItems.siteManager')" class="my-0" style="margin-block: 0" />
      <!-- 右侧按钮组：保留筛选和排序，其他页面动作移到 FAB -->
      <div class="d-flex align-center gap-1">
        <!-- 筛选按钮 -->
        <VMenu v-model="filterMenu" offset-y :close-on-content-click="false" location="bottom end">
          <template #activator="{ props }">
            <IconBtn v-bind="props" :variant="filterOption === 'all' ? 'text' : 'tonal'" :color="currentFilter?.color">
              <VIcon :icon="currentFilter?.icon || 'mdi-filter'" />
            </IconBtn>
          </template>
          <!-- 筛选菜单 -->
          <VCard min-width="200">
            <VList class="px-2">
              <VListSubheader>{{ t('common.filter') }}</VListSubheader>
              <VListItem
                v-for="option in filterOptions"
                :key="option.value"
                :active="filterOption === option.value"
                @click="selectFilter(option.value)"
              >
                <template #prepend>
                  <VIcon :icon="option.icon" :color="option.color" />
                </template>
                <VListItemTitle>{{ option.label }}</VListItemTitle>
                <template #append>
                  <VIcon v-if="filterOption === option.value" icon="mdi-check" color="primary" />
                </template>
              </VListItem>
            </VList>
          </VCard>
        </VMenu>
        <!-- 排序按钮 -->
        <IconBtn variant="text" :color="sortMode ? 'warning' : 'gray'" @click="toggleSortMode">
          <VIcon icon="mdi-sort-variant" />
        </IconBtn>
      </div>
    </div>

    <VAlert v-if="sortMode" color="warning" variant="tonal" class="mb-4 py-0 app-surface-static">
      <div class="d-flex flex-wrap align-center justify-space-between gap-2 py-5">
        <span>{{ t('common.sortModeHint') }}</span>
        <VBtn variant="tonal" color="error" @click="sortMode = false">
          {{ t('common.exit') }}
        </VBtn>
      </div>
    </VAlert>

    <LoadingBanner v-if="!isRefreshed" class="mt-12" />
    <Draggable
      v-if="draggableSiteList.length > 0 && canDragSort"
      v-model="draggableSiteList"
      @end="savaSitesPriority"
      item-key="id"
      tag="div"
      :component-data="{ 'class': 'grid gap-4 grid-site-card px-2' }"
    >
      <template #item="{ element }">
        <SiteCard
          :site="element"
          :data="siteUserDataMap[element.domain]"
          :stats="siteStatsList[element.domain] || {}"
          :sortable="true"
          @remove="fetchData"
          @update="fetchData"
          @refresh-stats="handleRefreshStats"
        />
      </template>
    </Draggable>
    <ProgressiveCardGrid
      v-else-if="draggableSiteList.length > 0 && shouldVirtualizeList"
      :items="draggableSiteList"
      :get-item-key="item => item.id"
      :min-item-width="256"
      :estimated-item-height="168"
      class="px-2"
    >
      <template #default="{ item }">
        <SiteCard
          :site="item"
          :data="siteUserDataMap[item.domain]"
          :stats="siteStatsList[item.domain] || {}"
          :sortable="false"
          @remove="fetchData"
          @update="fetchData"
          @refresh-stats="handleRefreshStats"
        />
      </template>
    </ProgressiveCardGrid>
  </div>
  <NoDataFound
    v-if="draggableSiteList.length === 0 && isRefreshed"
    error-code="404"
    :error-title="filterOption === 'all' ? t('site.noSites') : t('common.noMatchingData')"
    :error-description="filterOption === 'all' ? t('site.sitesWillBeShownHere') : t('common.tryChangingFilters')"
  />
  <!-- 新增站点按钮 -->
  <Teleport to="body" v-if="route.path === '/site'">
    <div v-if="shouldShowFloatingActions && !appMode" class="compact-fab-stack">
      <VFab
        icon="mdi-chart-line"
        color="info"
        variant="tonal"
        appear
        class="compact-fab compact-fab--secondary"
        @click="openSiteStatisticsDialog"
      />
      <VFab
        icon="mdi-export"
        color="warning"
        variant="tonal"
        appear
        class="compact-fab compact-fab--secondary"
        @click="exportSites"
      />
      <VFab
        icon="mdi-import"
        color="success"
        variant="tonal"
        appear
        class="compact-fab compact-fab--secondary"
        @click="openSiteImportDialog"
      />
      <VFab
        icon="mdi-web-plus"
        color="primary"
        appear
        class="compact-fab compact-fab--primary"
        @click="openSiteAddDialog"
      />
    </div>
  </Teleport>
</template>
