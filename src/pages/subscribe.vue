<script setup lang="ts">
import { debounce } from 'lodash-es'
import SubscribeListView from '@/views/subscribe/SubscribeListView.vue'
import { useI18n } from 'vue-i18n'
import { useDynamicHeaderTab } from '@/composables/useDynamicHeaderTab'
import { useDynamicButton } from '@/composables/useDynamicButton'
import { usePWA } from '@/composables/usePWA'
import { useUserStore } from '@/stores'
import { openSharedDialog } from '@/composables/useSharedDialog'

import { getSubscribeMovieTabs, getSubscribeTvTabs } from '@/router/i18n-menu'

// 国际化
const { t } = useI18n()

const route = useRoute()
const userStore = useUserStore()
const { appMode } = usePWA()

// 非默认标签页和弹窗按需加载，避免进入订阅列表时同步下载分享/统计相关代码。
const SubscribePopularView = defineAsyncComponent(() => import('@/views/subscribe/SubscribePopularView.vue'))
const SubscribeShareView = defineAsyncComponent(() => import('@/views/subscribe/SubscribeShareView.vue'))
const SubscribeEditDialog = defineAsyncComponent(() => import('@/components/dialog/SubscribeEditDialog.vue'))
const SubscribeShareStatisticsDialog = defineAsyncComponent(
  () => import('@/components/dialog/SubscribeShareStatisticsDialog.vue'),
)

const subType = route.meta.subType?.toString()
const subId = ref(route.query.id as string)
const activeTab = ref((route.query.tab as string) || '')
const subscribeListViewRef = ref<InstanceType<typeof SubscribeListView> | null>(null)

// 获取标签页
const subscribeTabs = computed(() => {
  if (subType === '电影') {
    return getSubscribeMovieTabs(t)
  } else {
    return getSubscribeTvTabs(t)
  }
})

// 订阅过滤弹窗
const filterSubscribeDialog = ref(false)

// 搜索订阅分享弹窗
const searchShareDialog = ref(false)

// 排序模式
const subscribeSortMode = ref(false)

// 订阅过滤词
const subscribeFilter = ref('')

// 订阅状态筛选
const subscribeStatusFilter = ref<string | null>(null)

type SubscribeSortBy = 'custom' | 'last_update' | 'date' | 'lack_episode'

// 订阅排序方式
const subscribeSortBy = ref<SubscribeSortBy | ''>('')

// 分享搜索词
const shareKeyword = ref('')
const shareKeywordInput = ref('')

// 筛选选项
const filterOptions = computed(() => {
  const baseOptions = [
    { value: 'all', label: t('common.all'), icon: 'mdi-filter-multiple-outline' },
    { value: 'best_version', label: t('subscribe.bestVersion'), icon: 'mdi-refresh', color: 'warning' },
  ]

  // 电影只显示基本选项和状态选项
  if (subType === '电影') {
    return [
      ...baseOptions,
      { value: 'pending', label: t('subscribe.pending'), icon: 'mdi-help-circle', color: 'secondary' },
      { value: 'paused', label: t('subscribe.paused'), icon: 'mdi-pause-circle', color: 'error' },
    ]
  }

  // 电视剧显示所有选项
  return [
    ...baseOptions,
    { value: 'not_started', label: t('subscribe.notStarted'), icon: 'mdi-clock-outline', color: 'secondary' },
    { value: 'subscribing', label: t('subscribe.subscribing'), icon: 'mdi-download', color: 'info' },
    { value: 'pending', label: t('subscribe.pending'), icon: 'mdi-help-circle', color: 'secondary' },
    { value: 'paused', label: t('subscribe.paused'), icon: 'mdi-pause-circle', color: 'error' },
    { value: 'completed', label: t('subscribe.completed'), icon: 'mdi-check-circle', color: 'success' },
  ]
})

// 排序选项
const sortOptions = computed<Array<{ value: SubscribeSortBy; label: string }>>(() => {
  const options: Array<{ value: SubscribeSortBy; label: string }> = [
    { value: 'custom', label: t('subscribe.sort.custom') },
    { value: 'last_update', label: t('subscribe.sort.lastUpdate') },
    { value: 'date', label: t('subscribe.sort.addTime') },
  ]

  if (subType !== '电影') {
    options.push({ value: 'lack_episode', label: t('subscribe.sort.lackEpisode') })
  }

  return options
})

// 当前选中的排序选项
const currentSortBy = computed<SubscribeSortBy>(() => {
  if (subscribeSortBy.value && sortOptions.value.some(option => option.value === subscribeSortBy.value)) {
    return subscribeSortBy.value
  }

  return 'date'
})

// 当前选中的筛选选项
const currentFilter = computed(() => {
  return filterOptions.value.find(option => option.value === (subscribeStatusFilter.value || 'all'))
})

// 计算筛选按钮颜色 - 有名称筛选或状态筛选时高亮
const filterButtonColor = computed(() => {
  if (subscribeFilter.value || (subscribeStatusFilter.value && subscribeStatusFilter.value !== 'all')) {
    return currentFilter.value?.color || 'primary'
  }
  return 'gray'
})

// 选择筛选选项
function selectFilter(value: string) {
  subscribeStatusFilter.value = value
  filterSubscribeDialog.value = false
}

// 选择订阅排序选项，非自定义排序会退出拖拽排序模式。
function selectSubscribeSort(value: SubscribeSortBy) {
  if (!sortOptions.value.some(option => option.value === value)) {
    return
  }

  subscribeSortBy.value = value
  if (value !== 'custom') {
    subscribeSortMode.value = false
  }
}

// VMenu activator选择器
const filterActivator = computed(() => '[data-menu-activator="filter-btn"]')
const searchActivator = computed(() => '[data-menu-activator="share-filter-btn"]')

const showDefaultRuleAction = computed(() => activeTab.value === 'mysub')
const showSubscribeHistoryAction = computed(() => showDefaultRuleAction.value && userStore.superUser)
const showShareStatisticsAction = computed(() => activeTab.value === 'share')

function openDefaultRuleDialog() {
  openSharedDialog(
    SubscribeEditDialog,
    {
      default: true,
      type: subType,
    },
    {},
    { closeOn: ['close', 'save'] },
  )
}

function openSubscribeHistoryDialog() {
  subscribeListViewRef.value?.openHistoryDialog()
}

function openShareStatisticsDialog() {
  openSharedDialog(SubscribeShareStatisticsDialog, {}, {}, { closeOn: ['close'] })
}

// 切换订阅拖拽排序模式，进入时固定使用自定义排序。
function toggleSubscribeSortMode() {
  if (!subscribeSortMode.value) {
    subscribeSortBy.value = 'custom'
  }
  subscribeSortMode.value = !subscribeSortMode.value
}

const shareKeywordUpdater = debounce((keyword: string) => {
  shareKeyword.value = keyword.trim()
}, 300)

watch(shareKeywordInput, newKeyword => {
  shareKeywordUpdater(newKeyword || '')
})

watch(activeTab, newTab => {
  if (newTab !== 'share') {
    searchShareDialog.value = false
  }
})

onUnmounted(() => {
  shareKeywordUpdater.cancel()
})

const subscribeDynamicMenuItems = computed(() => {
  if (!appMode.value) return undefined

  if (activeTab.value === 'mysub') {
    const items: Array<{
      titleKey: string
      titleParams?: Record<string, unknown>
      icon: string
      action: () => void
    }> = []

    if (showSubscribeHistoryAction.value) {
      items.push({
        titleKey: 'dialog.subscribeHistory.title',
        titleParams: { type: subType },
        icon: 'mdi-history',
        action: openSubscribeHistoryDialog,
      })
    }

    items.push({
      titleKey: 'dialog.subscribeEdit.titleDefault',
      icon: 'mdi-clipboard-edit-outline',
      action: openDefaultRuleDialog,
    })

    return items.length > 1 ? items : undefined
  }

  return undefined
})

const subscribeDynamicIcon = computed(() => {
  if (showShareStatisticsAction.value) return 'mdi-chart-line'
  if (showSubscribeHistoryAction.value) return 'mdi-history'
  return 'mdi-clipboard-edit-outline'
})

function handleSubscribeDynamicAction() {
  if (showShareStatisticsAction.value) {
    openShareStatisticsDialog()
    return
  }

  if (showSubscribeHistoryAction.value) {
    openSubscribeHistoryDialog()
    return
  }

  if (showDefaultRuleAction.value) {
    openDefaultRuleDialog()
  }
}

useDynamicButton({
  icon: subscribeDynamicIcon,
  onClick: handleSubscribeDynamicAction,
  menuItems: subscribeDynamicMenuItems,
  show: computed(() => appMode.value && (showDefaultRuleAction.value || showShareStatisticsAction.value)),
})

// 使用动态标签页
const { registerHeaderTab } = useDynamicHeaderTab()

// 注册动态标签页
registerHeaderTab({
  items: subscribeTabs.value,
  modelValue: activeTab,
  appendButtons: [
    {
      icon: 'mdi-filter-multiple-outline',
      variant: 'text',
      color: filterButtonColor,
      class: 'settings-icon-button',
      dataAttr: 'filter-btn',
      action: () => {
        filterSubscribeDialog.value = true
      },
      show: computed(() => activeTab.value === 'mysub'),
    },
    {
      icon: 'mdi-sort-variant',
      variant: 'text',
      color: computed(() => (subscribeSortMode.value ? 'warning' : 'gray')),
      class: 'settings-icon-button',
      action: toggleSubscribeSortMode,
      show: computed(() => activeTab.value === 'mysub'),
    },
    {
      icon: 'mdi-checkbox-multiple-marked-outline',
      variant: 'text',
      color: 'gray',
      class: 'settings-icon-button',
      action: () => {
        // 触发批量管理模式
        const event = new CustomEvent('toggle-batch-mode')
        window.dispatchEvent(event)
      },
      show: computed(() => activeTab.value === 'mysub'),
    },
    {
      icon: 'mdi-filter-multiple-outline',
      variant: 'text',
      color: computed(() => (shareKeywordInput.value ? 'primary' : 'gray')),
      class: 'settings-icon-button',
      dataAttr: 'share-filter-btn',
      action: () => {
        searchShareDialog.value = true
      },
      show: computed(() => activeTab.value === 'share'),
    },
  ],
})

// 注册动态标签页
onMounted(() => {
  // 设置初始activeTab值
  if (!activeTab.value && subscribeTabs.value.length > 0) {
    activeTab.value = subscribeTabs.value[0].tab
  }
})
</script>

<template>
  <div>
    <VWindow v-model="activeTab" class="disable-tab-transition content-window" :touch="false">
      <VWindowItem value="mysub">
        <transition name="fade-slide" appear>
          <div>
            <SubscribeListView
              ref="subscribeListViewRef"
              :type="subType"
              :subid="subId"
              :keyword="subscribeFilter"
              :status-filter="subscribeStatusFilter ?? ''"
              :sort-mode="subscribeSortMode"
              :sort-by="subscribeSortBy"
              :active="activeTab === 'mysub'"
              @update:sort-mode="subscribeSortMode = $event"
              @update:sort-by="subscribeSortBy = $event"
            />
          </div>
        </transition>
      </VWindowItem>
      <VWindowItem value="popular">
        <transition name="fade-slide" appear>
          <div>
            <SubscribePopularView :type="subType" />
          </div>
        </transition>
      </VWindowItem>
      <VWindowItem value="share">
        <transition name="fade-slide" appear>
          <div>
            <SubscribeShareView :keyword="shareKeyword" />
          </div>
        </transition>
      </VWindowItem>
    </VWindow>

    <!-- 订阅过滤下拉菜单 -->
    <Teleport to="body" v-if="filterSubscribeDialog">
      <VMenu
        v-model="filterSubscribeDialog"
        :close-on-content-click="false"
        :activator="filterActivator"
        location="bottom end"
      >
        <VCard min-width="220">
          <!-- 名称搜索 -->
          <div class="pa-3">
            <VTextField
              v-model="subscribeFilter"
              :placeholder="t('subscribe.name')"
              prepend-inner-icon="mdi-magnify"
              density="compact"
              variant="outlined"
              hide-details
              clearable
            />
          </div>
          <VDivider class="mt-2" />
          <!-- 状态筛选列表 -->
          <VList density="compact" class="px-2 py-1">
            <VListSubheader>{{ t('common.status') }}</VListSubheader>
            <VListItem
              v-for="option in filterOptions"
              :key="option.value"
              :active="(subscribeStatusFilter || 'all') === option.value"
              @click="selectFilter(option.value)"
              density="compact"
            >
              <template #prepend>
                <VIcon :icon="option.icon" :color="option.color" size="small" />
              </template>
              <VListItemTitle>{{ option.label }}</VListItemTitle>
              <template #append>
                <VIcon
                  v-if="(subscribeStatusFilter || 'all') === option.value"
                  icon="mdi-check"
                  color="primary"
                  size="small"
                />
              </template>
            </VListItem>
          </VList>
          <VDivider />
          <!-- 排序 -->
          <VList density="compact" class="px-2 py-1">
            <VListSubheader>{{ t('subscribe.sortTitle') }}</VListSubheader>
            <VListItem
              v-for="option in sortOptions"
              :key="option.value"
              :active="currentSortBy === option.value"
              @click="selectSubscribeSort(option.value)"
              density="compact"
            >
              <VListItemTitle>{{ option.label }}</VListItemTitle>
              <template #append>
                <VIcon v-if="currentSortBy === option.value" icon="mdi-check" color="primary" size="small" />
              </template>
            </VListItem>
          </VList>
        </VCard>
      </VMenu>
    </Teleport>

    <!-- 搜索订阅分享弹窗 -->
    <Teleport to="body" v-if="searchShareDialog">
      <VMenu
        v-model="searchShareDialog"
        :close-on-content-click="false"
        :activator="searchActivator"
        location="bottom end"
      >
        <VCard min-width="260" max-width="320">
          <div class="pa-3">
            <VTextField
              v-model="shareKeywordInput"
              :placeholder="t('subscribe.keyword')"
              prepend-inner-icon="mdi-magnify"
              density="compact"
              variant="outlined"
              hide-details
              clearable
            />
          </div>
        </VCard>
      </VMenu>
    </Teleport>

    <Teleport to="body" v-if="!appMode && route.path.startsWith(`/subscribe/${subType === '电影' ? 'movie' : 'tv'}`)">
      <div class="compact-fab-stack">
        <VFab
          v-if="showSubscribeHistoryAction"
          icon="mdi-history"
          color="info"
          variant="tonal"
          appear
          class="compact-fab compact-fab--secondary"
          @click="openSubscribeHistoryDialog"
        />
        <VFab
          v-if="showDefaultRuleAction"
          icon="mdi-clipboard-edit-outline"
          color="primary"
          appear
          class="compact-fab compact-fab--primary"
          @click="openDefaultRuleDialog"
        />
        <VFab
          v-if="showShareStatisticsAction"
          icon="mdi-chart-line"
          color="primary"
          appear
          class="compact-fab compact-fab--primary"
          @click="openShareStatisticsDialog"
        />
      </div>
    </Teleport>

  </div>
</template>

<style scoped>
.content-window {
  margin-block-start: 0;
}
</style>
