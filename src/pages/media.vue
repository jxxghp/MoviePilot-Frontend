<script setup lang="ts">
import MediaDetailView from '@/views/discover/MediaDetailView.vue'

// 路由参数
const route = useRoute()

// TMDBID
const mediaid = route.query?.mediaid?.toString()

// 类型
const type = route.query?.type?.toString()
</script>

<template>
  <div>
    <MediaDetailView
      :mediaid="mediaid"
      :type="type"
    />
  </div>
</template>
