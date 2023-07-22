<script setup lang="ts">
import TorrentCardListView from '@/views/discover/TorrentCardListView.vue'

// 路由参数
const route = useRoute()

// 查询TMDBID或标题
const keyword = route.query?.keyword?.toString() ?? ''

// 查询类型
const type = route.query?.type?.toString() ?? ''
</script>

<template>
  <div class="relative">
    <TorrentCardListView
      :keyword="keyword"
      :type="type"
    />
  </div>
</template>
