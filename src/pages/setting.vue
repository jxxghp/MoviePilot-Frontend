<script lang="ts" setup>
import { useRoute } from 'vue-router'
import { getSettingTabs } from '@/router/i18n-menu'
import { useDynamicHeaderTab } from '@/composables/useDynamicHeaderTab'

const { t } = useI18n()
const route = useRoute()

const activeTab = ref((route.query.tab as string) || '')
const settingTabs = computed(() => getSettingTabs(t))
const SETTINGS_HEADER_SCOPE_CLASS = 'settings-page-header-tabs-active'

// 设置页的每个大类都很重，按标签页拆包，避免进入设置时一次性下载全部配置面板。
const AccountSettingSystem = defineAsyncComponent(() => import('@/views/setting/AccountSettingSystem.vue'))
const AccountSettingDirectory = defineAsyncComponent(() => import('@/views/setting/AccountSettingDirectory.vue'))
const AccountSettingClassification = defineAsyncComponent(
  () => import('@/views/setting/AccountSettingClassification.vue'),
)
const AccountSettingSite = defineAsyncComponent(() => import('@/views/setting/AccountSettingSite.vue'))
const AccountSettingRule = defineAsyncComponent(() => import('@/views/setting/AccountSettingRule.vue'))
const AccountSettingSearch = defineAsyncComponent(() => import('@/views/setting/AccountSettingSearch.vue'))
const AccountSettingSubscribe = defineAsyncComponent(() => import('@/views/setting/AccountSettingSubscribe.vue'))
const AccountSettingNotification = defineAsyncComponent(() => import('@/views/setting/AccountSettingNotification.vue'))

const visitedTabs = ref(new Set<string>())

const settingTabComponents = [
  { value: 'system', component: AccountSettingSystem },
  { value: 'directory', component: AccountSettingDirectory },
  { value: 'classification', component: AccountSettingClassification },
  { value: 'site', component: AccountSettingSite },
  { value: 'rule', component: AccountSettingRule },
  { value: 'search', component: AccountSettingSearch },
  { value: 'subscribe', component: AccountSettingSubscribe },
  { value: 'notification', component: AccountSettingNotification },
]
const settingTabValues = new Set(settingTabComponents.map(item => item.value))

/** 记录已访问标签，保留重型设置面板的状态并避免首次加载全部面板。 */
function markTabVisited(tab: string) {
  if (!tab) return

  const nextTabs = new Set(visitedTabs.value)
  nextTabs.add(tab)
  visitedTabs.value = nextTabs
}

/** 从路由查询参数提取一个存在于当前设置页的标签值。 */
function validRouteTab(value: unknown): string | null {
  const tab = Array.isArray(value) ? value[0] : value
  return typeof tab === 'string' && settingTabValues.has(tab) ? tab : null
}

/** 限定设置页动态页头样式，并在页面失活后及时移除全局标记。 */
function setSettingsHeaderScope(enabled: boolean) {
  if (typeof document === 'undefined') return

  document.documentElement.classList.toggle(SETTINGS_HEADER_SCOPE_CLASS, enabled)
}

// 使用动态标签页
const { registerHeaderTab } = useDynamicHeaderTab()

// 注册动态标签页
registerHeaderTab({
  items: settingTabs,
  modelValue: activeTab,
})

onBeforeMount(() => setSettingsHeaderScope(true))
onActivated(() => setSettingsHeaderScope(true))
onDeactivated(() => setSettingsHeaderScope(false))
onUnmounted(() => setSettingsHeaderScope(false))

// 注册动态标签页
onMounted(() => {
  // 无效的深链参数不能让设置页停留在空白 VWindow。
  if (!settingTabValues.has(activeTab.value) && settingTabs.value.length > 0) {
    activeTab.value = settingTabs.value[0].tab
  }
  markTabVisited(activeTab.value)
})

watch(activeTab, markTabVisited, { immediate: true })
watch(
  () => route.query.tab,
  value => {
    const nextTab = validRouteTab(value)
    if (nextTab && nextTab !== activeTab.value) activeTab.value = nextTab
  },
  { immediate: true },
)
</script>

<template>
  <div>
    <VWindow v-model="activeTab" class="settings-content-window disable-tab-transition" :touch="false">
      <VWindowItem v-for="item in settingTabComponents" :key="item.value" :value="item.value">
        <div>
          <component :is="item.component" v-if="visitedTabs.has(item.value)" :active="activeTab === item.value" />
        </div>
      </VWindowItem>
    </VWindow>
  </div>
</template>

<style lang="scss">
@media (max-width: 599.98px) {
  html.settings-page-header-tabs-active {
    .layout-dynamic-header-tab,
    .layout-dynamic-header-tab .tab-header {
      inline-size: 100%;
    }

    .layout-dynamic-header-tab .scroll-button {
      display: none !important;
    }

    .layout-dynamic-header-tab .header-tabs {
      display: flex;
      gap: 0;
      inline-size: 100%;
      mask-image: none;
      overflow-x: auto;
      overscroll-behavior-inline: contain;
      padding: 2px;
      scroll-padding-inline: 2px;
      scroll-snap-type: inline proximity;
    }

    .layout-dynamic-header-tab .header-tab {
      box-sizing: border-box;
      flex: 0 0 calc(100% / 3);
      justify-content: center;
      border-radius: 6px;
      block-size: 44px;
      font-size: 0.875rem;
      line-height: 1.25rem;
      min-inline-size: 0;
      padding-block: 0;
      padding-inline: 8px;
      scroll-snap-align: start;
    }

    .layout-dynamic-header-tab .header-tab > span {
      min-inline-size: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .layout-dynamic-header-tab .header-tab-icon {
      flex: 0 0 20px;
      block-size: 20px;
      font-size: 20px;
      inline-size: 20px;
      margin-inline-end: 6px;
    }

    .layout-dynamic-header-tab .header-tab::after {
      block-size: 2px;
      inline-size: min(72px, calc(100% - 16px));
      inset-block-end: 1px;
    }
  }

  html[data-theme='glass'].settings-page-header-tabs-active {
    .layout-dynamic-header-tab .header-tabs {
      border: 1px solid var(--glass-border);
      border-radius: 8px;
      -webkit-backdrop-filter: var(--glass-control-backdrop-filter);
      backdrop-filter: var(--glass-control-backdrop-filter);
      background-color: var(--glass-surface-soft);
      background-image: var(--glass-sheen);
      box-shadow: var(--glass-control-shadow);
    }

    .layout-dynamic-header-tab .header-tab {
      text-shadow: none;
    }

    .layout-dynamic-header-tab .header-tab:hover:not(.active) {
      background-color: var(--glass-control);
    }

    .layout-dynamic-header-tab .header-tab.active {
      background-color: var(--glass-control-prominent);
      box-shadow: var(--glass-control-prominent-shadow);
    }
  }
}
</style>
