<script setup lang="ts">
import MediaCardListView from '@/views/discover/MediaCardListView.vue'
</script>

<template>
  <MediaCardListView apipath="music/explore" :params="{ count: 30 }" />
</template>
