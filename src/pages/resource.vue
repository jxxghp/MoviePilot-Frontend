<script setup lang="ts">
import TorrentCardListView from '@/views/discover/TorrentCardListView.vue'

// 路由参数
const route = useRoute()

// 查询TMDBID或标题
const keyword = route.query?.keyword?.toString() ?? ''

// 查询类型
const type = route.query?.type?.toString() ?? ''

// 搜索字段
const area = route.query?.area?.toString() ?? ''
</script>

<template>
  <div>
    <TorrentCardListView
      :keyword="keyword"
      :type="type"
      :area="area"
    />
  </div>
</template>
