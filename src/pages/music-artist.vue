<script setup lang="ts">
import MusicArtistView from '@/views/discover/MusicArtistView.vue'

// 路由参数
const route = useRoute()

// MusicBrainz Artist ID
const mediaid = computed(() => route.query?.mediaid?.toString())

// 音乐元数据来源
const source = computed(() => route.query?.source?.toString() || 'musicbrainz')
</script>

<template>
  <div>
    <MusicArtistView :mediaid="mediaid" :source="source" />
  </div>
</template>
