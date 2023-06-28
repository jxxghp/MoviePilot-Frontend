<script setup lang="ts">
import MediaCardListView from '@/views/discover/MediaCardListView.vue';
</script>

<template>
  <div>
    <p class="text-2xl font-weight-medium my-5">
      TMDB电影
    </p>

    <MediaCardListView apipath="/tmdb/movies"/>

  </div>
</template>
