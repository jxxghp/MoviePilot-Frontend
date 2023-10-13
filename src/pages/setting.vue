<script lang="ts" setup>
import { useRoute } from 'vue-router'
import AccountSettingAccount from '@/views/setting/AccountSettingAccount.vue'
import AccountSettingNotification from '@/views/setting/AccountSettingNotification.vue'
import AccountSettingSite from '@/views/setting/AccountSettingSite.vue'
import AccountSettingWords from '@/views/setting/AccountSettingWords.vue'
import AccountSettingAbout from '@/views/setting/AccountSettingAbout.vue'
import AccountSettingSearch from '@/views/setting/AccountSettingSearch.vue'
import AccountSettingSubscribe from '@/views/setting/AccountSettingSubscribe.vue'
import AccountSettingService from '@/views/setting/AccountSettingService.vue'

const route = useRoute()

const activeTab = ref(route.params.tab)

// tabs
const tabs = [
  {
    title: '用户',
    icon: 'mdi-account',
    tab: 'account',
  },
  {
    title: '站点',
    icon: 'mdi-web',
    tab: 'site',
  },
  {
    title: '搜索',
    icon: 'mdi-magnify',
    tab: 'search',
  },
  {
    title: '订阅',
    icon: 'mdi-rss',
    tab: 'subscribe',
  },
  {
    title: '服务',
    icon: 'mdi-list-box',
    tab: 'service',
  },
  {
    title: '通知',
    icon: 'mdi-bell',
    tab: 'notification',
  },
  {
    title: '词表',
    icon: 'mdi-file-word-box',
    tab: 'words',
  },
  {
    title: '关于',
    icon: 'mdi-information',
    tab: 'about',
  },
]
</script>

<template>
  <div>
    <VTabs
      v-model="activeTab"
      show-arrows
    >
      <VTab v-for="item in tabs" :key="item.icon" :value="item.tab">
        <VIcon size="20" start :icon="item.icon" />
        {{ item.title }}
      </VTab>
    </VTabs>
    <VDivider />

    <VWindow
      v-model="activeTab"
      class="mt-5 disable-tab-transition"
      :touch="false"
    >
      <!-- 用户 -->
      <VWindowItem value="account">
        <transition name="fade-slide" appear>
          <AccountSettingAccount />
        </transition>
      </VWindowItem>

      <!-- 站点 -->
      <VWindowItem value="site">
        <transition name="fade-slide" appear>
          <AccountSettingSite />
        </transition>
      </VWindowItem>

      <!-- 搜索 -->
      <VWindowItem value="search">
        <transition name="fade-slide" appear>
          <AccountSettingSearch />
        </transition>
      </VWindowItem>

      <!-- 订阅 -->
      <VWindowItem value="subscribe">
        <transition name="fade-slide" appear>
          <AccountSettingSubscribe />
        </transition>
      </VWindowItem>

      <!-- 服务 -->
      <VWindowItem value="service">
        <transition name="fade-slide" appear>
          <AccountSettingService />
        </transition>
      </VWindowItem>

      <!-- 通知 -->
      <VWindowItem value="notification">
        <transition name="fade-slide" appear>
          <AccountSettingNotification />
        </transition>
      </VWindowItem>
      <!-- 词表 -->
      <VWindowItem value="words">
        <transition name="fade-slide" appear>
          <AccountSettingWords />
        </transition>
      </VWindowItem>
      <!-- 关于 -->
      <VWindowItem value="about">
        <transition name="fade-slide" appear>
          <AccountSettingAbout />
        </transition>
      </VWindowItem>
    </VWindow>
  </div>
</template>
