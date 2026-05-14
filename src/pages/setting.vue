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

// 使用动态标签页
const { registerHeaderTab } = useDynamicHeaderTab()

// 注册动态标签页
registerHeaderTab({
  items: settingTabs.value,
  modelValue: activeTab,
})

// 注册动态标签页
onMounted(() => {
  // 设置初始activeTab值
  if (!activeTab.value && settingTabs.value.length > 0) {
    activeTab.value = settingTabs.value[0].tab
  }
})
</script>

<template>
  <div>
    <VWindow v-model="activeTab" class="disable-tab-transition" :touch="false">
      <!-- 系统 -->
      <VWindowItem value="system">
        <transition name="fade-slide" appear>
          <div>
            <AccountSettingSystem />
          </div>
        </transition>
      </VWindowItem>

      <!-- 目录 -->
      <VWindowItem value="directory">
        <transition name="fade-slide" appear>
          <div>
            <AccountSettingDirectory />
          </div>
        </transition>
      </VWindowItem>

      <!-- 站点 -->
      <VWindowItem value="site">
        <transition name="fade-slide" appear>
          <div>
            <AccountSettingSite />
          </div>
        </transition>
      </VWindowItem>

      <!-- 规则 -->
      <VWindowItem value="rule">
        <transition name="fade-slide" appear>
          <div>
            <AccountSettingRule />
          </div>
        </transition>
      </VWindowItem>

      <!-- 搜索 -->
      <VWindowItem value="search">
        <transition name="fade-slide" appear>
          <div>
            <AccountSettingSearch />
          </div>
        </transition>
      </VWindowItem>

      <!-- 订阅 -->
      <VWindowItem value="subscribe">
        <transition name="fade-slide" appear>
          <div>
            <AccountSettingSubscribe />
          </div>
        </transition>
      </VWindowItem>

      <!-- 通知 -->
      <VWindowItem value="notification">
        <transition name="fade-slide" appear>
          <div>
            <AccountSettingNotification />
          </div>
        </transition>
      </VWindowItem>
    </VWindow>
  </div>
</template>
