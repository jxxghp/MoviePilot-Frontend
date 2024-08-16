<script lang="ts" setup>
import { useRoute } from 'vue-router'
import router from '@/router'
import AccountSettingAccount from '@/views/setting/AccountSettingAccount.vue'
import AccountSettingNotification from '@/views/setting/AccountSettingNotification.vue'
import AccountSettingSite from '@/views/setting/AccountSettingSite.vue'
import AccountSettingWords from '@/views/setting/AccountSettingWords.vue'
import AccountSettingAbout from '@/views/setting/AccountSettingAbout.vue'
import AccountSettingSearch from '@/views/setting/AccountSettingSearch.vue'
import AccountSettingSubscribe from '@/views/setting/AccountSettingSubscribe.vue'
import AccountSettingService from '@/views/setting/AccountSettingService.vue'
import AccountSettingSystem from '@/views/setting/AccountSettingSystem.vue'
import AccountSettingDirectory from '@/views/setting/AccountSettingDirectory.vue'
import { SettingTabs } from '@/router/menu'

const route = useRoute()

const activeTab = ref(route.query.tab)

function jumpTab(tab: string) {
  router.push('/setting?tab=' + tab)
}
</script>

<template>
  <div>
    <VTabs v-model="activeTab" show-arrows class="v-tabs-pill">
      <VTab
        v-for="item in SettingTabs"
        :key="item.icon"
        :value="item.tab"
        @click="jumpTab(item.tab)"
        selected-class="v-slide-group-item--active v-tab--selected"
      >
        <div>
          <VIcon size="20" start :icon="item.icon" />
          {{ item.title }}
        </div>
      </VTab>
    </VTabs>

    <VWindow v-model="activeTab" class="mt-5 disable-tab-transition" :touch="false">
      <!-- 用户 -->
      <VWindowItem value="account">
        <transition name="fade-slide" appear>
          <div>
            <AccountSettingAccount />
          </div>
        </transition>
      </VWindowItem>

      <!-- 连接 -->
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

      <!-- 服务 -->
      <VWindowItem value="service">
        <transition name="fade-slide" appear>
          <div>
            <AccountSettingService />
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

      <!-- 词表 -->
      <VWindowItem value="words">
        <transition name="fade-slide" appear>
          <div>
            <AccountSettingWords />
          </div>
        </transition>
      </VWindowItem>

      <!-- 关于 -->
      <VWindowItem value="about">
        <transition name="fade-slide" appear>
          <div>
            <AccountSettingAbout />
          </div>
        </transition>
      </VWindowItem>
    </VWindow>
  </div>
</template>
