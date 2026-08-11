<script setup lang="ts">
import MusicArtistView from '@/views/discover/MusicArtistView.vue'

// 路由参数
const route = useRoute()

// 音乐数据源原生艺术家 ID
const mediaid = computed(() => route.query?.mediaid?.toString())

// 音乐元数据来源
const source = computed(() => route.query?.source?.toString() || 'musicbrainz')
</script>

<template>
  <div>
    <MusicArtistView :mediaid="mediaid" :source="source" />
  </div>
</template>
