<script setup lang="ts">
import SubscribeListView from '@/views/subscribe/SubscribeListView.vue'
import SubscribePopularView from '@/views/subscribe/SubscribePopularView.vue'
import router from '@/router'
import { SubscribeTvTabs } from '@/router/menu'

const route = useRoute()

const activeTab = ref(route.query.tab)

// 订阅ID参数
const subId = ref(route.query.id as string)

// 跳转tab
function jumpTab(tab: string) {
  router.push('/subscribe-tv?tab=' + tab)
}
</script>

<template>
  <div>
    <VTabs v-model="activeTab">
      <VTab v-for="item in SubscribeTvTabs" :value="item.tab" @click="jumpTab(item.tab)">
        <span class="mx-5">{{ item.title }}</span>
      </VTab>
    </VTabs>

    <VWindow v-model="activeTab" class="mt-5 disable-tab-transition" :touch="false">
      <VWindowItem value="mysub">
        <transition name="fade-slide" appear>
          <SubscribeListView type="电视剧" :subid="subId" />
        </transition>
      </VWindowItem>
      <VWindowItem value="popular">
        <transition name="fade-slide" appear>
          <SubscribePopularView type="电视剧" :subid="subId" />
        </transition>
      </VWindowItem>
    </VWindow>
  </div>
</template>
