<script setup lang="ts">
import MediaCardListView from '@/views/discover/MediaCardListView.vue';

// 输入参数
const props = defineProps({
  type: Array as PropType<string[]> | PropType<string>,
});

const titles: { [key: string]: any } = {
  tmdb: {
    trending: '流行趋势',
    movies: '热门电影',
    tvs: '热门电视剧',
  },
  douban: {
    movies: '最新电影',
    tvs: '最新电视剧',
    tv_weekly_chinese: '国产剧集榜',
    tv_weekly_global: '全球剧集榜',
  },
};

const getApiPath = (types: string[] | string) => {
  if (Array.isArray(types)) {
    return types.join('/')
  } else {
    return types
  }
};

const getTitle = (types: string[] | string) => {
  if (Array.isArray(types)) {
    return ['发现', titles[types[0]][types[1]]]
  } else {
    return ["发现"]
  }
};


</script>

<template>
  <div>
    <VBreadcrumbs :items="getTitle(props.type||'')"></VBreadcrumbs>
    <MediaCardListView :apipath="getApiPath(props.type||'')"/>
  </div>
</template>
