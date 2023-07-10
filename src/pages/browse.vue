<script setup lang="ts">
import MediaCardListView from "@/views/discover/MediaCardListView.vue";

// 输入参数
const props = defineProps({
  type: Array as PropType<string[]> | PropType<string>,
});

// 路由参数
const route = useRoute();

// 面包屑标题定义
const titles: { [key: string]: any } = {
  tmdb: {
    trending: "流行趋势",
    movies: "热门电影",
    tvs: "热门电视剧",
  },
  douban: {
    movies: "最新电影",
    tvs: "最新电视剧",
    tv_weekly_chinese: "华语剧集榜",
    tv_weekly_global: "全球剧集榜",
    movie_top250: "电影Top250",
  },
  media: {
    search: "搜索",
  },
};

// 计算API路径
const getApiPath = (types: string[] | string) => {
  if (Array.isArray(types)) {
    return types.join("/");
  } else {
    return types;
  }
};

// 面包屑标题
const getTitle = (types: string[] | string, title: any = "") => {
  if (Array.isArray(types)) {
    if (title) {
      return [titles[types[0]][types[1]], title];
    }
    return ["推荐", titles[types[0]][types[1]]];
  } else {
    return ["发现"];
  }
};
</script>

<template>
  <div>
    <VBreadcrumbs :items="getTitle(props.type || '', route.query?.title)"></VBreadcrumbs>
    <MediaCardListView :apipath="getApiPath(props.type || '')" :params="route.query" />
  </div>
</template>
