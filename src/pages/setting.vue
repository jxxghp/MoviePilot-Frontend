<script lang="ts" setup>
import { useRoute } from 'vue-router'
import AccountSettingAccount from '@/views/setting/AccountSettingAccount.vue'
import AccountSettingNotification from '@/views/setting/AccountSettingNotification.vue'
import AccountSettingRule from '@/views/setting/AccountSettingRule.vue'
import AccountSettingSite from '@/views/setting/AccountSettingSite.vue'
import AccountSettingWords from '@/views/setting/AccountSettingWords.vue'

const route = useRoute()

const activeTab = ref(route.params.tab)

// tabs
const tabs = [
  { title: '用户', icon: 'mdi-account', tab: 'account' },
  { title: '站点', icon: 'mdi-web', tab: 'site' },
  { title: '规则', icon: 'mdi-filter-cog', tab: 'filter' },
  { title: '通知', icon: 'mdi-bell', tab: 'notification' },
  { title: '自定义词表', icon: 'mdi-file-word-box', tab: 'words' },
]
</script>

<template>
  <div>
    <VTabs
      v-model="activeTab"
      show-arrows
    >
      <VTab
        v-for="item in tabs"
        :key="item.icon"
        :value="item.tab"
      >
        <VIcon
          size="20"
          start
          :icon="item.icon"
        />
        {{ item.title }}
      </VTab>
    </VTabs>
    <VDivider />

    <VWindow
      v-model="activeTab"
      class="mt-5"
    >
      <!-- Account -->
      <VWindowItem value="account" transition="scale-transition">
        <AccountSettingAccount />
      </VWindowItem>

      <!-- System -->
      <VWindowItem value="site" transition="scale-transition">
        <AccountSettingSite />
      </VWindowItem>

      <!-- Notification -->
      <VWindowItem value="filter" transition="scale-transition">
        <AccountSettingRule />
      </VWindowItem>

      <!-- Notification -->
      <VWindowItem value="notification" transition="scale-transition">
        <AccountSettingNotification />
      </VWindowItem>
      <!-- Words -->
      <VWindowItem value="words" transition="scale-transition">
        <AccountSettingWords />
      </VWindowItem>
    </VWindow>
  </div>
</template>
