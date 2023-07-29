<script setup lang="ts">
import MediaCardListView from '@/views/discover/MediaCardListView.vue'

// 输入参数
const props = defineProps({
  // API路径
  paths: Array as PropType<string[]> | PropType<string>,
})

// 路由参数
const route = useRoute()

// 面包屑标题定义
const titles: { [key: string]: any } = {
  tmdb: {
    trending: '流行趋势',
    movies: '热门电影',
    tvs: '热门电视剧',
  },
  douban: {
    movies: '最新电影',
    tvs: '最新电视剧',
    tv_weekly_chinese: '华语剧集榜',
    tv_weekly_global: '全球剧集榜',
    movie_top250: '电影TOP250',
  },
  credits: '演员阵容',
  media: {
    search: '搜索',
  },
}

// 计算API路径
function getApiPath(paths: string[] | string) {
  if (Array.isArray(paths))
    return paths.join('/')
  else
    return paths
}

// 面包屑标题
function getTitle(paths: string[] | string, title: any = '') {
  if (Array.isArray(paths)) {
    if (title)
      return [titles[paths[0]][paths[1]], title]

    return ['推荐', titles[paths[0]][paths[1]]]
  }
  else {
    return ['发现']
  }
}
</script>

<template>
  <div>
    <VBreadcrumbs :items="getTitle(props.paths || '', route.query?.title)" />
    <MediaCardListView
      :apipath="getApiPath(props.paths || '')"
      :params="route.query"
    />
  </div>
</template>
