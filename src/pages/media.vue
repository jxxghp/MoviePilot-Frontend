<script setup lang="ts">
import MediaDetailView from '@/views/discover/MediaDetailView.vue'
import { isMediaDataSource } from '@/utils/mediaId'

// 路由参数
const route = useRoute()

// 媒体主身份
const mediaSource = computed(() => {
  const source = route.query?.media_source?.toString()
  return isMediaDataSource(source) ? source : undefined
})
const mediaId = computed(() => route.query?.media_id?.toString())

// 类型：电影、电视剧
const type = computed(() => route.query?.type?.toString())

// 标题
const title = computed(() => route.query?.title?.toString())

// 年份
const year = computed(() => route.query?.year?.toString())
</script>

<template>
  <div>
    <MediaDetailView :media-source="mediaSource" :media-id="mediaId" :type="type" :title="title" :year="year" />
  </div>
</template>
