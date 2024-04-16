<script setup lang="ts">
import MediaCardSlideView from '@/views/discover/MediaCardSlideView.vue'

const viewList = reactive<{apipath: string, linkurl: string, title: string}[]>([
  {
    apipath: 'tmdb/trending',
    linkurl: "/browse/tmdb/trending?title=流行趋势",
    title: "流行趋势",
  },
  {
     apipath: "douban/showing",
      linkurl: "/browse/douban/showing?title=正在热映",
      title: "正在热映"
  },
  {
    apipath: "bangumi/calendar",
      linkurl: "/browse/bangumi/calendar?title=Bangumi每日放送",
      title: "Bangumi每日放送"
  },
  {
    apipath: "tmdb/movies",
      linkurl: "/browse/tmdb/movies?title=热门电影",
      title: "热门电影"
  },
  {
     apipath: "tmdb/tvs?with_original_language=zh|en|ja|ko",
      linkurl: "/browse/tmdb/tvs??with_original_language=zh|en|ja|ko&title=热门电视剧",
      title: "热门电视剧"
  },
  {
    apipath: "douban/movie_hot",
      linkurl: "/browse/douban/movie_hot?title=热门电影",
      title: "热门电影"
  },
  {
     apipath: "douban/tv_hot",
      linkurl: "/browse/douban/tv_hot?title=热门电视剧",
      title: "热门电视剧"
  },
  {
    apipath: "douban/tv_animation",
      linkurl: "/browse/douban/tv_animation?title=热门动漫",
      title: "热门动漫"
  },
  {
    apipath: "douban/movies",
      linkurl: "/browse/douban/movies?title=最新电影",
      title: "最新电影"
  },
  {
    apipath: "douban/tvs",
      linkurl: "/browse/douban/tvs?title=最新电视剧",
      title: "最新电视剧"
  },
  {
    apipath: "douban/movie_top250",
      linkurl: "/browse/douban/movie_top250?title=电影TOP250",
      title: "电影TOP250"
  },
  {
    apipath: "douban/tv_weekly_chinese",
      linkurl: "/browse/douban/tv_weekly_chinese?title=国产剧集榜",
      title: "国产剧集榜"
  },
  {
    apipath: "douban/tv_weekly_global",
      linkurl: "/browse/douban/tv_weekly_global?title=全球剧集榜",
      title: "全球剧集榜"
  }
])

</script>

<template>
  <div>
    <MediaCardSlideView 
      v-for="item in viewList" 
      :key="item.apipath"
      v-bind="item"
    />
  </div>
</template>
