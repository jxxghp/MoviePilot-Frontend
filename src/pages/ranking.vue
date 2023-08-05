<script setup lang="ts">
import MediaCardSlideView from '@/views/discover/MediaCardSlideView.vue'
</script>

<template>
  <div>
    <MediaCardSlideView
      apipath="tmdb/trending"
      linkurl="/browse/tmdb/trending?title=流行趋势"
      title="流行趋势"
    />

    <MediaCardSlideView
      apipath="tmdb/movies"
      linkurl="/browse/tmdb/movies?title=热门电影"
      title="热门电影"
    />

    <MediaCardSlideView
      apipath="tmdb/tvs?with_original_language=zh|en|ja|ko"
      linkurl="/browse/tmdb/tvs??with_original_language=zh|en|ja|ko&title=热门电视剧"
      title="热门电视剧"
    />

    <MediaCardSlideView
      apipath="douban/movies"
      linkurl="/browse/douban/movies?title=最新电影"
      title="最新电影"
    />

    <MediaCardSlideView
      apipath="douban/tvs"
      linkurl="/browse/douban/tvs?title=最新电视剧"
      title="最新电视剧"
    />

    <MediaCardSlideView
      apipath="douban/movie_top250"
      linkurl="/browse/douban/movie_top250?title=电影TOP250"
      title="电影TOP250"
    />

    <MediaCardSlideView
      apipath="douban/tv_weekly_chinese"
      linkurl="/browse/douban/tv_weekly_chinese?title=国产剧集榜"
      title="国产剧集榜"
    />

    <MediaCardSlideView
      apipath="douban/tv_weekly_global"
      linkurl="/browse/douban/tv_weekly_global?title=全球剧集榜"
      title="全球剧集榜"
    />
  </div>
</template>
