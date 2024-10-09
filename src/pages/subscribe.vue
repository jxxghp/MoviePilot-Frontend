<script setup lang="ts">
import SubscribeListView from '@/views/subscribe/SubscribeListView.vue'
import SubscribePopularView from '@/views/subscribe/SubscribePopularView.vue'
import SubscribeShareView from '@/views/subscribe/SubscribeShareView.vue'
import { SubscribeMovieTabs } from '@/router/menu'
import router from '@/router'

const route = useRoute()

const subType = route.meta.subType?.toString()
const subId = ref(route.query.id as string)
const activeTab = ref(route.query.tab)

function jumpTab(tab: string) {
  router.push('/subscribe/movie?tab=' + tab)
}
</script>

<template>
  <div>
    <VTabs v-model="activeTab">
      <VTab v-for="item in SubscribeMovieTabs" :value="item.tab" @to="jumpTab(item.tab)">
        <span class="mx-5">{{ item.title }}</span>
      </VTab>
      <VTab v-if="subType == '电视剧'" value="share" @to="jumpTab('share')">
        <span class="mx-5">订阅分享</span>
      </VTab>
    </VTabs>

    <VWindow v-model="activeTab" class="mt-5 disable-tab-transition" :touch="false">
      <VWindowItem value="mysub">
        <transition name="fade-slide" appear>
          <SubscribeListView :type="subType" :subid="subId" />
        </transition>
      </VWindowItem>
      <VWindowItem value="popular">
        <transition name="fade-slide" appear>
          <SubscribePopularView :type="subType" />
        </transition>
      </VWindowItem>
      <VWindowItem value="share">
        <transition name="fade-slide" appear>
          <SubscribeShareView />
        </transition>
      </VWindowItem>
    </VWindow>
  </div>
</template>
