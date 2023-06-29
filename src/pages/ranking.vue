<script setup lang="ts">
import MediaCardSlideView from '@/views/discover/MediaCardSlideView.vue';
</script>

<template>
  <div>
    <RouterLink to="/browse/tmdb/trending" class="text-2xl font-weight-medium my-4">
      流行趋势
    </RouterLink>
    <MediaCardSlideView apipath="tmdb/trending"/>

    <RouterLink to="/browse/tmdb/movies" class="text-2xl font-weight-medium my-5">
      热门电影
    </RouterLink>
    <MediaCardSlideView apipath="tmdb/movies"/>

    <RouterLink to="/browse/tmdb/tvs" class="text-2xl font-weight-medium my-5">
      热门电视剧
    </RouterLink>
    <MediaCardSlideView apipath="tmdb/tvs"/>

    <RouterLink to="/browse/douban/movies" class="text-2xl font-weight-medium my-5">
      最新电影
    </RouterLink>
    <MediaCardSlideView apipath="douban/movies"/>

    <RouterLink to="/browse/douban/tvs" class="text-2xl font-weight-medium my-5">
      最新电视剧
    </RouterLink>
    <MediaCardSlideView apipath="douban/tvs"/>

    <RouterLink to="/browse/douban/tv_weekly_chinese" class="text-2xl font-weight-medium my-5">
      国产剧集榜
    </RouterLink>
    <MediaCardSlideView apipath="douban/tv_weekly_chinese"/>

    <RouterLink to="/browse/douban/tv_weekly_global" class="text-2xl font-weight-medium my-5">
      全球剧集榜
    </RouterLink>
    <MediaCardSlideView apipath="douban/tv_weekly_global"/>

  </div>
</template>
