<script setup lang="ts">
import MediaDetailView from '@/views/discover/MediaDetailView.vue'

// 路由参数
const route = useRoute()

// TMDB ID
const mediaid = route.query?.mediaid?.toString()

// 类型：电影、电视剧
const type = route.query?.type?.toString()

// 标题
const title = route.query?.title?.toString()

// 年份
const year = route.query?.year?.toString()
</script>

<template>
  <div>
    <MediaDetailView :mediaid="mediaid" :type="type" :title="title" :year="year" />
  </div>
</template>
