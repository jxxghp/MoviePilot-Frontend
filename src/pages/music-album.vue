<script setup lang="ts">
import MusicAlbumView from '@/views/discover/MusicAlbumView.vue'
import { isMediaDataSource } from '@/utils/mediaId'

// 路由参数
const route = useRoute()

// 音乐数据源原生专辑 ID
const mediaId = computed(() => route.query?.media_id?.toString())

// 音乐元数据来源
const mediaSource = computed(() => {
  const source = route.query?.media_source?.toString()
  return isMediaDataSource(source) ? source : undefined
})
</script>

<template>
  <div>
    <MusicAlbumView :media-id="mediaId" :media-source="mediaSource" />
  </div>
</template>
