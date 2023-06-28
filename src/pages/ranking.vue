<script setup lang="ts">
import MediaCardListView from '@/views/discover/MediaCardListView.vue';
import MediaCardSlideView from '@/views/discover/MediaCardSlideView.vue';
</script>

<template>
  <div>
    <p class="text-2xl font-weight-medium my-5">
      TMDB电影
    </p>

    <MediaCardListView apipath="/tmdb/movies"/>

    <p class="text-2xl font-weight-medium my-5">
      TMDB流行趋势
    </p>

    <MediaCardSlideView apipath="/tmdb/trending"/>

  </div>
</template>
