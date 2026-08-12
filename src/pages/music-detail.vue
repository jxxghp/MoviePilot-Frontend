<script setup lang="ts">
import MusicDetailView from '@/views/discover/MusicDetailView.vue'

// 路由参数
const route = useRoute()

// 音乐数据源原生单曲 ID
const mediaid = computed(() => route.query?.mediaid?.toString())

// 音乐元数据来源
const mediaSource = computed(() => route.query?.media_source?.toString() || 'musicbrainz')
</script>

<template>
  <div>
    <MusicDetailView :mediaid="mediaid" :media-source="mediaSource" />
  </div>
</template>
