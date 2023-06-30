<script setup lang="ts">
import MediaCardSlideView from "@/views/discover/MediaCardSlideView.vue";
</script>

<template>
  <div>
    <div class="slider-header">
      <RouterLink to="/browse/tmdb/trending" class="slider-title">
        <span>流行趋势</span>
        <VIcon icon="mdi-arrow-right-circle-outline" class="ms-1" />
      </RouterLink>
    </div>
    <MediaCardSlideView apipath="tmdb/trending" class="mb-3" />

    <div class="slider-header">
      <RouterLink to="/browse/tmdb/movies" class="slider-title">
        <span>热门电影</span>
        <VIcon icon="mdi-arrow-right-circle-outline" class="ms-1" />
      </RouterLink>
    </div>
    <MediaCardSlideView apipath="tmdb/movies" class="mb-3" />

    <div class="slider-header">
      <RouterLink to="/browse/tmdb/tvs" class="slider-title">
        <span>热门电视剧</span>
        <VIcon icon="mdi-arrow-right-circle-outline" class="ms-1" />
      </RouterLink>
    </div>
    <MediaCardSlideView apipath="tmdb/tvs" class="mb-3" />

    <div class="slider-header">
      <RouterLink to="/browse/douban/movies" class="slider-title">
        <span>最新电影</span>
        <VIcon icon="mdi-arrow-right-circle-outline" class="ms-1" />
      </RouterLink>
    </div>
    <MediaCardSlideView apipath="douban/movies" class="mb-3" />

    <div class="slider-header">
      <RouterLink to="/browse/douban/tvs" class="slider-title">
        <span>最新电视剧</span>
        <VIcon icon="mdi-arrow-right-circle-outline" class="ms-1" />
      </RouterLink>
    </div>
    <MediaCardSlideView apipath="douban/tvs" class="mb-3" />

    <div class="slider-header">
      <RouterLink to="/browse/douban/tv_weekly_chinese" class="slider-title">
        <span>国产剧集榜</span>
        <VIcon icon="mdi-arrow-right-circle-outline" class="ms-1" />
      </RouterLink>
    </div>
    <MediaCardSlideView apipath="douban/tv_weekly_chinese" class="mb-3" />

    <div class="slider-header">
      <RouterLink to="/browse/douban/tv_weekly_global" class="slider-title">
        <span>全球剧集榜</span>
        <VIcon icon="mdi-arrow-right-circle-outline" class="ms-1" />
      </RouterLink>
    </div>
    <MediaCardSlideView apipath="douban/tv_weekly_global" class="mb-3" />
  </div>
</template>

<style type="text/css">
.slider-header {
  position: relative;
  display: flex;

  @apply mb-3;
}

.slider-title {
  --tw-text-opacity: 1;

  display: inline-flex;
  align-items: center;
  color: inherit;
  font-size: 1.25rem;
  font-weight: 700;
  line-height: 1.75rem;
  transition-duration: 0.3s;
}
</style>
