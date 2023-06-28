<script setup lang="ts">
import MediaCardListView from '@/views/discover/MediaCardListView.vue';
</script>

<template>
  <div>
    <p class="text-2xl font-weight-medium my-5">
      TMDB电影
    </p>

    <MediaCardListView apipath="/tmdb/movies"/>

    <p class="text-2xl font-weight-medium my-5">
      TMDB电视剧
    </p>

    <MediaCardListView apipath="/tmdb/tvs"/>

    <p class="text-2xl font-weight-medium my-5">
      豆瓣电影
    </p>

    <MediaCardListView apipath="/douban/movies"/>

    <p class="text-2xl font-weight-medium my-5">
      豆瓣电视剧
    </p>

    <MediaCardListView apipath="/douban/tvs"/>

  </div>
</template>
