<script setup lang="ts">
import MediaCardSlideView from '@/views/discover/MediaCardSlideView.vue'
</script>

<template>
  <div>
    <MediaCardSlideView apipath="tmdb/trending">
      <template #title="{ loaded }">
        <div
          v-if="loaded"
          class="slider-header ms-1"
        >
          <RouterLink
            to="/browse/tmdb/trending"
            class="slider-title"
          >
            <span>流行趋势</span>
            <VIcon
              icon="mdi-arrow-right-circle-outline"
              class="ms-1"
            />
          </RouterLink>
        </div>
      </template>
    </MediaCardSlideView>

    <MediaCardSlideView apipath="tmdb/movies">
      <template #title="{ loaded }">
        <div
          v-if="loaded"
          class="slider-header mt-3 ms-1"
        >
          <RouterLink
            to="/browse/tmdb/movies"
            class="slider-title"
          >
            <span>热门电影</span>
            <VIcon
              icon="mdi-arrow-right-circle-outline"
              class="ms-1"
            />
          </RouterLink>
        </div>
      </template>
    </MediaCardSlideView>

    <MediaCardSlideView apipath="tmdb/tvs">
      <template #title="{ loaded }">
        <div
          v-if="loaded"
          class="slider-header mt-3 ms-1"
        >
          <RouterLink
            to="/browse/tmdb/tvs"
            class="slider-title"
          >
            <span>热门电视剧</span>
            <VIcon
              icon="mdi-arrow-right-circle-outline"
              class="ms-1"
            />
          </RouterLink>
        </div>
      </template>
    </MediaCardSlideView>

    <MediaCardSlideView apipath="douban/movies">
      <template #title="{ loaded }">
        <div
          v-if="loaded"
          class="slider-header mt-3 ms-1"
        >
          <RouterLink
            to="/browse/douban/movies"
            class="slider-title"
          >
            <span>最新电影</span>
            <VIcon
              icon="mdi-arrow-right-circle-outline"
              class="ms-1"
            />
          </RouterLink>
        </div>
      </template>
    </MediaCardSlideView>

    <MediaCardSlideView apipath="douban/tvs">
      <template #title="{ loaded }">
        <div
          v-if="loaded"
          class="slider-header mt-3 ms-1"
        >
          <RouterLink
            to="/browse/douban/tvs"
            class="slider-title"
          >
            <span>最新电视剧</span>
            <VIcon
              icon="mdi-arrow-right-circle-outline"
              class="ms-1"
            />
          </RouterLink>
        </div>
      </template>
    </MediaCardSlideView>

    <MediaCardSlideView apipath="douban/movie_top250">
      <template #title="{ loaded }">
        <div
          v-if="loaded"
          class="slider-header mt-3 ms-1"
        >
          <RouterLink
            to="/browse/douban/movie_top250"
            class="slider-title"
          >
            <span>电影TOP250</span>
            <VIcon
              icon="mdi-arrow-right-circle-outline"
              class="ms-1"
            />
          </RouterLink>
        </div>
      </template>
    </MediaCardSlideView>

    <MediaCardSlideView apipath="douban/tv_weekly_chinese">
      <template #title="{ loaded }">
        <div
          v-if="loaded"
          class="slider-header mt-3 ms-1"
        >
          <RouterLink
            to="/browse/douban/tv_weekly_chinese"
            class="slider-title"
          >
            <span>国产剧集榜</span>
            <VIcon
              icon="mdi-arrow-right-circle-outline"
              class="ms-1"
            />
          </RouterLink>
        </div>
      </template>
    </MediaCardSlideView>

    <MediaCardSlideView apipath="douban/tv_weekly_global">
      <template #title="{ loaded }">
        <div
          v-if="loaded"
          class="slider-header mt-3 ms-1"
        >
          <RouterLink
            to="/browse/douban/tv_weekly_global"
            class="slider-title"
          >
            <span>全球剧集榜</span>
            <VIcon
              icon="mdi-arrow-right-circle-outline"
              class="ms-1"
            />
          </RouterLink>
        </div>
      </template>
    </MediaCardSlideView>
  </div>
</template>

<style type="text/css">
.slider-header {
  position: relative;
  display: flex;

  @apply mb-1;
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
