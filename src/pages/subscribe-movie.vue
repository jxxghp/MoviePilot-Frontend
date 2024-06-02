<script setup lang="ts">
import SubscribeListView from '@/views/subscribe/SubscribeListView.vue'
import SubscribePopularView from '@/views/subscribe/SubscribePopularView.vue'
import router from '@/router'
import { SubscribeMovieTabs } from '@/router/menu'

const route = useRoute()

// 订阅ID参数
const subId = ref(route.query.id as string)

// 当前标签
const activeTab = ref(route.query.tab)

// 跳转tab
function jumpTab(tab: string) {
  router.push('/subscribe-movie?tab=' + tab)
}
</script>

<template>
  <div>
    <VTabs v-model="activeTab">
      <VTab v-for="item in SubscribeMovieTabs" :value="item.tab" @click="jumpTab(item.tab)">
        <span class="mx-5">{{ item.title }}</span>
      </VTab>
    </VTabs>

    <VWindow v-model="activeTab" class="mt-5 disable-tab-transition" :touch="false">
      <VWindowItem value="mysub">
        <transition name="fade-slide" appear>
          <SubscribeListView type="电影" :subid="subId" />
        </transition>
      </VWindowItem>
      <VWindowItem value="popular">
        <transition name="fade-slide" appear>
          <SubscribePopularView type="电影" :subid="subId" />
        </transition>
      </VWindowItem>
    </VWindow>
  </div>
</template>
