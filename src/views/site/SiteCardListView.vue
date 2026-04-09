<script lang="ts" setup>
import draggable from 'vuedraggable'
import api from '@/api'
import type { Site, SiteUserData } from '@/api/types'
import SiteCard from '@/components/cards/SiteCard.vue'
import NoDataFound from '@/components/NoDataFound.vue'
import SiteAddEditDialog from '@/components/dialog/SiteAddEditDialog.vue'
import SiteStatisticsDialog from '@/components/dialog/SiteStatisticsDialog.vue'
import SiteImportDialog from '@/components/dialog/SiteImportDialog.vue'
import { useDisplay } from 'vuetify'
import { useDynamicButton } from '@/composables/useDynamicButton'
import { useI18n } from 'vue-i18n'
import { usePWA } from '@/composables/usePWA'
import { useToast } from 'vue-toastification'

// 国际化
const { t } = useI18n()

// 提示框
const $toast = useToast()

// 路由
const route = useRoute()

// APP
const display = useDisplay()
// PWA模式检测
const { appMode } = usePWA()

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

// 新增站点对话框
const siteAddDialog = ref(false)

// 统计信息对话框
const siteStatsDialog = ref(false)

// 导入站点对话框
const siteImportDialog = ref(false)

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

// 当前筛选选项的显示信息
const currentFilter = computed(() => {
  return filterOptions.value.find(option => option.value === filterOption.value)
})

// 获取站点列表数据
async function fetchData() {
  try {
    loading.value = true
    siteList.value = await api.get('site/')
    loading.value = false
    isRefreshed.value = true
    // 获取站点列表后，获取统计数据
    await fetchSiteStats()
  } catch (error) {
    console.error(error)
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

// 根据站点ID获取站点数据
function getUserData(domain: string) {
  return userDataList.value.find(userData => userData.domain === domain)
}

// 根据站点域名获取统计数据
function getSiteStats(domain: string) {
  return siteStatsList.value[domain] || {}
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
  siteAddDialog.value = false
  fetchData()
}

// 选择筛选选项
function selectFilter(value: string) {
  filterOption.value = value
  filterMenu.value = false
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

onActivated(() => {
  if (!loading.value) {
    fetchData()
    fetchUserData()
  }
})

// 使用动态按钮钩子
useDynamicButton({
  icon: 'mdi-web-plus',
  onClick: () => {
    siteAddDialog.value = true
  },
})
</script>

<template>
  <div class="card-list-container">
    <!-- 页面标题和筛选按钮 -->
    <div class="d-flex justify-space-between align-center mb-4">
      <VPageContentTitle :title="t('navItems.siteManager')" class="mb-0" />
      <!-- 右侧按钮组 -->
      <div class="d-flex align-center gap-2">
        <!-- 导入按钮 -->
        <VBtn :icon="display.smAndDown.value" variant="text" color="success" @click="siteImportDialog = true">
          <VIcon icon="mdi-import" />
          <span v-if="!display.smAndDown.value" class="ml-2">
            {{ t('site.actions.import') }}
          </span>
        </VBtn>
        <!-- 导出按钮 -->
        <VBtn :icon="display.smAndDown.value" variant="text" color="warning" @click="exportSites">
          <VIcon icon="mdi-export" />
          <span v-if="!display.smAndDown.value" class="ml-2">
            {{ t('site.actions.export') }}
          </span>
        </VBtn>
        <!-- 统计信息按钮 -->
        <VBtn :icon="display.smAndDown.value" variant="text" color="info" @click="siteStatsDialog = true">
          <VIcon icon="mdi-chart-line" />
          <span v-if="!display.smAndDown.value" class="ml-2">
            {{ t('site.statistics') }}
          </span>
        </VBtn>
        <!-- 筛选按钮 -->
        <VMenu v-model="filterMenu" offset-y :close-on-content-click="false" location="bottom end">
          <template #activator="{ props }">
            <VBtn
              v-bind="props"
              :icon="display.smAndDown.value"
              :variant="filterOption === 'all' ? 'text' : 'tonal'"
              :color="currentFilter?.color"
            >
              <VIcon :icon="currentFilter?.icon || 'mdi-filter'" />
              <span v-if="!display.smAndDown.value" class="ml-2">
                {{ currentFilter?.label }}
              </span>
              <VIcon v-if="!display.smAndDown.value" icon="mdi-chevron-down" class="ml-1" />
            </VBtn>
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
      </div>
    </div>

    <LoadingBanner v-if="!isRefreshed" class="mt-12" />
    <draggable
      v-if="draggableSiteList.length > 0"
      v-model="draggableSiteList"
      @end="savaSitesPriority"
      handle=".cursor-move"
      item-key="id"
      tag="div"
      :component-data="{ 'class': 'grid gap-4 grid-site-card px-2' }"
      :disabled="filterOption !== 'all'"
    >
      <template #item="{ element }">
        <SiteCard
          :site="element"
          :data="getUserData(element.domain)"
          :stats="getSiteStats(element.domain)"
          @remove="fetchData"
          @update="fetchData"
          @refresh-stats="handleRefreshStats"
        />
      </template>
    </draggable>
  </div>
  <NoDataFound
    v-if="draggableSiteList.length === 0 && isRefreshed"
    error-code="404"
    :error-title="filterOption === 'all' ? t('site.noSites') : t('common.noMatchingData')"
    :error-description="filterOption === 'all' ? t('site.sitesWillBeShownHere') : t('common.tryChangingFilters')"
  />
  <!-- 新增站点按钮 -->
  <Teleport to="body" v-if="route.path === '/site'">
    <VFab
      v-if="isRefreshed && !appMode"
      icon="mdi-web-plus"
      location="bottom"
      size="x-large"
      fixed
      app
      appear
      @click="siteAddDialog = true"
      :class="{ 'mb-12': appMode }"
    />
  </Teleport>
  <!-- 新增站点弹窗 -->
  <SiteAddEditDialog
    v-if="siteAddDialog"
    v-model="siteAddDialog"
    oper="add"
    @save="onSiteSave"
    @close="siteAddDialog = false"
  />

  <!-- 统计信息弹窗 -->
  <SiteStatisticsDialog v-if="siteStatsDialog" v-model="siteStatsDialog" :sites="siteList" />

  <!-- 导入站点弹窗 -->
  <SiteImportDialog v-if="siteImportDialog" v-model="siteImportDialog" @import-success="fetchData" />
</template>
