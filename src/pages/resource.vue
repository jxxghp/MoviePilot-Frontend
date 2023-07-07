<script setup lang="ts">
import TorrentCardListView from "@/views/discover/TorrentCardListView.vue";

// 路由参数
const route = useRoute();

// 查询TMDBID或标题
const keyword = route.params?.keyword?.toString() ?? "";
console.log(keyword);
</script>

<template>
  <div>
    <TorrentCardListView :keyword="keyword" />
  </div>
</template>
