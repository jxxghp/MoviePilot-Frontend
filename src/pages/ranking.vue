<script setup lang="ts">
import MediaCardSlideView from '@/views/discover/MediaCardSlideView.vue'

const viewList = reactive<{ apipath: string; linkurl: string; title: string }[]>([
  {
    apipath: 'tmdb/trending',
    linkurl: '/browse/tmdb/trending?title=流行趋势',
    title: '流行趋势',
  },
  {
    apipath: 'douban/showing',
    linkurl: '/browse/douban/showing?title=正在热映',
    title: '正在热映',
  },
  {
    apipath: 'bangumi/calendar',
    linkurl: '/browse/bangumi/calendar?title=Bangumi每日放送',
    title: 'Bangumi每日放送',
  },
  {
    apipath: 'tmdb/movies',
    linkurl: '/browse/tmdb/movies?title=TMDB热门电影',
    title: 'TMDB热门电影',
  },
  {
    apipath: 'tmdb/tvs?with_original_language=zh|en|ja|ko',
    linkurl: '/browse/tmdb/tvs??with_original_language=zh|en|ja|ko&title=TMDB热门电视剧',
    title: 'TMDB热门电视剧',
  },
  {
    apipath: 'douban/movie_hot',
    linkurl: '/browse/douban/movie_hot?title=豆瓣热门电影',
    title: '豆瓣热门电影',
  },
  {
    apipath: 'douban/tv_hot',
    linkurl: '/browse/douban/tv_hot?title=豆瓣热门电视剧',
    title: '豆瓣热门电视剧',
  },
  {
    apipath: 'douban/tv_animation',
    linkurl: '/browse/douban/tv_animation?title=豆瓣热门动漫',
    title: '豆瓣热门动漫',
  },
  {
    apipath: 'douban/movies',
    linkurl: '/browse/douban/movies?title=豆瓣最新电影',
    title: '豆瓣最新电影',
  },
  {
    apipath: 'douban/tvs',
    linkurl: '/browse/douban/tvs?title=豆瓣最新电视剧',
    title: '豆瓣最新电视剧',
  },
  {
    apipath: 'douban/movie_top250',
    linkurl: '/browse/douban/movie_top250?title=电影TOP250',
    title: '豆瓣电影TOP250',
  },
  {
    apipath: 'douban/tv_weekly_chinese',
    linkurl: '/browse/douban/tv_weekly_chinese?title=豆瓣国产剧集榜',
    title: '豆瓣国产剧集榜',
  },
  {
    apipath: 'douban/tv_weekly_global',
    linkurl: '/browse/douban/tv_weekly_global?title=豆瓣全球剧集榜',
    title: '豆瓣全球剧集榜',
  },
])
</script>

<template>
  <div>
    <MediaCardSlideView v-for="(item, index) in viewList" :key="index" v-bind="item" />
  </div>
</template>
