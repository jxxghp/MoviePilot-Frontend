<script setup lang="ts">
import SubscribeListView from '@/views/subscribe/SubscribeListView.vue'
import SubscribePopularView from '@/views/subscribe/SubscribePopularView.vue'
import SubscribeShareView from '@/views/subscribe/SubscribeShareView.vue'
import SubscribeEditDialog from '@/components/dialog/SubscribeEditDialog.vue'
import SubscribeShareStatisticsDialog from '@/components/dialog/SubscribeShareStatisticsDialog.vue'
import { useI18n } from 'vue-i18n'
import { useDynamicHeaderTab } from '@/composables/useDynamicHeaderTab'

import { getSubscribeMovieTabs, getSubscribeTvTabs } from '@/router/i18n-menu'

// 国际化
const { t } = useI18n()

const route = useRoute()

const subType = route.meta.subType?.toString()
const subId = ref(route.query.id as string)
const activeTab = ref((route.query.tab as string) || '')
const shareViewKey = ref(0)

// 获取标签页
const subscribeTabs = computed(() => {
  if (subType === '电影') {
    return getSubscribeMovieTabs(t)
  } else {
    return getSubscribeTvTabs(t)
  }
})

// 默认订阅设置弹窗
const subscribeEditDialog = ref(false)

// 订阅过滤弹窗
const filterSubscribeDialog = ref(false)

// 搜索订阅分享弹窗
const searchShareDialog = ref(false)

// 订阅分享统计弹窗
const shareStatisticsDialog = ref(false)

// 订阅过滤词
const subscribeFilter = ref('')

// 订阅状态筛选
const subscribeStatusFilter = ref<string | null>(null)

// 分享搜索词
const shareKeyword = ref('')

// 搜索分享
const searchShares = () => {
  searchShareDialog.value = false
  shareViewKey.value++
}

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

// VMenu activator选择器
const filterActivator = computed(() => '[data-menu-activator="filter-btn"]')
const searchActivator = computed(() => '[data-menu-activator="search-btn"]')

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
      icon: 'mdi-chart-line',
      variant: 'text',
      color: 'gray',
      class: 'settings-icon-button',
      dataAttr: 'statistics-btn',
      action: () => {
        shareStatisticsDialog.value = true
      },
      show: computed(() => activeTab.value === 'share'),
    },
    {
      icon: 'mdi-movie-search-outline',
      variant: 'text',
      color: computed(() => (shareKeyword.value ? 'primary' : 'gray')),
      class: 'settings-icon-button',
      dataAttr: 'search-btn',
      action: () => {
        searchShareDialog.value = true
      },
      show: computed(() => activeTab.value === 'share'),
    },
    {
      icon: 'mdi-clipboard-edit-outline',
      variant: 'text',
      color: 'gray',
      class: 'settings-icon-button',
      action: () => {
        subscribeEditDialog.value = true
      },
      show: computed(() => activeTab.value === 'mysub'),
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
              :type="subType"
              :subid="subId"
              :keyword="subscribeFilter"
              :status-filter="subscribeStatusFilter ?? ''"
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
            <SubscribeShareView :keyword="shareKeyword" :key="shareViewKey" />
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
          <div class="px-3 pt-3 pb-1">
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
                <VIcon v-if="(subscribeStatusFilter || 'all') === option.value" icon="mdi-check" color="primary" size="small" />
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
        width="25rem"
        :close-on-content-click="false"
        :activator="searchActivator"
        location="bottom end"
      >
        <VCard>
          <VCardItem>
            <VCardTitle>
              <VIcon icon="mdi-movie-search-outline" class="mr-2" />
              {{ t('subscribe.searchShares') }}
            </VCardTitle>
            <VDialogCloseBtn @click="searchShareDialog = false" />
          </VCardItem>
          <VCardText>
            <VTextField v-model="shareKeyword" :label="t('subscribe.keyword')" clearable density="comfortable">
              <template #append>
                <VBtn prepend-icon="mdi-magnify" color="primary" @click="searchShares">{{ t('common.search') }}</VBtn>
              </template>
            </VTextField>
          </VCardText>
        </VCard>
      </VMenu>
    </Teleport>

    <!-- 订阅编辑弹窗 -->
    <SubscribeEditDialog
      v-if="subscribeEditDialog"
      v-model="subscribeEditDialog"
      :default="true"
      :type="subType"
      @save="subscribeEditDialog = false"
      @close="subscribeEditDialog = false"
    />

    <!-- 订阅分享统计弹窗 -->
    <SubscribeShareStatisticsDialog
      v-if="shareStatisticsDialog"
      v-model="shareStatisticsDialog"
      @close="shareStatisticsDialog = false"
    />
  </div>
</template>

<style scoped>
.content-window {
  margin-block-start: 0;
}
</style>
