<script setup lang="ts">
import MusicAlbumView from '@/views/discover/MusicAlbumView.vue'

// 路由参数
const route = useRoute()

// MusicBrainz Release Group ID
const mediaid = computed(() => route.query?.mediaid?.toString())

// 音乐元数据来源
const source = computed(() => route.query?.source?.toString() || 'musicbrainz')
</script>

<template>
  <div>
    <MusicAlbumView :mediaid="mediaid" :source="source" />
  </div>
</template>
