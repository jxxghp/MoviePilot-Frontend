<script setup lang="ts">
import SubscribeListView from '@/views/subscribe/SubscribeListView.vue'
import SubscribePopularView from '@/views/subscribe/SubscribePopularView.vue'

const route = useRoute()

// 标签页
const tabs = [
  {
    title: '我的订阅',
    tab: 'mysub',
  },
  {
    title: '热门订阅',
    tab: 'popular',
  },
]

// 当前标签
const activeTab = ref(route.params.tab)
</script>

<template>
  <div>
    <VTabs v-model="activeTab">
      <VTab v-for="item in tabs" :value="item.tab" :to="'/subscribe-tv/' + item.tab">
        <span class="mx-5">{{ item.title }}</span>
      </VTab>
    </VTabs>

    <VWindow v-model="activeTab" class="mt-5 disable-tab-transition" :touch="false">
      <VWindowItem value="mysub">
        <transition name="fade-slide" appear>
          <SubscribeListView type="电视剧" />
        </transition>
      </VWindowItem>
      <VWindowItem value="popular">
        <transition name="fade-slide" appear>
          <SubscribePopularView type="电视剧" />
        </transition>
      </VWindowItem>
    </VWindow>
  </div>
</template>
