<script setup lang="ts">
import SubscribeShareView from '@/views/subscribe/SubscribeShareView.vue'
// 从路由参数中获取搜索关键字
const route = useRoute()
const keyword = route.query.keyword as string
</script>

<template>
  <div>
    <SubscribeShareView :keyword="keyword" />
    <!-- 滚动到顶部按钮 -->
    <Teleport to="body" v-if="route.path === '/subscribe-share'">
      <VScrollToTopBtn />
    </Teleport>
  </div>
</template>
