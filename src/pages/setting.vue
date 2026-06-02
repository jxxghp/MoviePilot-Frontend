<script lang="ts" setup>
import { useRoute } from 'vue-router'
import router from '@/router'
import { getSettingTabs } from '@/router/i18n-menu'
import { useDynamicHeaderTab } from '@/composables/useDynamicHeaderTab'

const { t } = useI18n()
const route = useRoute()

const activeTab = ref((route.query.tab as string) || '')
const settingTabs = computed(() => getSettingTabs(t))

// 设置页的每个大类都很重，按标签页拆包，避免进入设置时一次性下载全部配置面板。
const AccountSettingSystem = defineAsyncComponent(() => import('@/views/setting/AccountSettingSystem.vue'))
const AccountSettingDirectory = defineAsyncComponent(() => import('@/views/setting/AccountSettingDirectory.vue'))
const AccountSettingSite = defineAsyncComponent(() => import('@/views/setting/AccountSettingSite.vue'))
const AccountSettingRule = defineAsyncComponent(() => import('@/views/setting/AccountSettingRule.vue'))
const AccountSettingSearch = defineAsyncComponent(() => import('@/views/setting/AccountSettingSearch.vue'))
const AccountSettingSubscribe = defineAsyncComponent(() => import('@/views/setting/AccountSettingSubscribe.vue'))
const AccountSettingNotification = defineAsyncComponent(() => import('@/views/setting/AccountSettingNotification.vue'))

const visitedTabs = ref(new Set<string>())

const settingTabComponents = [
  { value: 'system', component: AccountSettingSystem },
  { value: 'directory', component: AccountSettingDirectory },
  { value: 'site', component: AccountSettingSite },
  { value: 'rule', component: AccountSettingRule },
  { value: 'search', component: AccountSettingSearch },
  { value: 'subscribe', component: AccountSettingSubscribe },
  { value: 'notification', component: AccountSettingNotification },
]

function markTabVisited(tab: string) {
  if (!tab) return

  const nextTabs = new Set(visitedTabs.value)
  nextTabs.add(tab)
  visitedTabs.value = nextTabs
}

// 使用动态标签页
const { registerHeaderTab } = useDynamicHeaderTab()

// 注册动态标签页
registerHeaderTab({
  items: settingTabs,
  modelValue: activeTab,
})

// 注册动态标签页
onMounted(() => {
  // 设置初始activeTab值
  if (!activeTab.value && settingTabs.value.length > 0) {
    activeTab.value = settingTabs.value[0].tab
  }
  markTabVisited(activeTab.value)
})

watch(activeTab, markTabVisited, { immediate: true })
</script>

<template>
  <div>
    <VWindow v-model="activeTab" class="disable-tab-transition" :touch="false">
      <VWindowItem v-for="item in settingTabComponents" :key="item.value" :value="item.value">
        <transition name="fade-slide" appear>
          <div>
            <component
              :is="item.component"
              v-if="visitedTabs.has(item.value)"
              :active="activeTab === item.value"
            />
          </div>
        </transition>
      </VWindowItem>
    </VWindow>
  </div>
</template>
