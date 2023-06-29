<script setup lang="ts">
import MediaCardSlideView from '@/views/discover/MediaCardSlideView.vue';
</script>

<template>
  <div>
    <p class="text-2xl font-weight-medium my-5">
      TMDB流行趋势
    </p>

    <MediaCardSlideView apipath="/tmdb/trending"/>

  </div>
</template>
