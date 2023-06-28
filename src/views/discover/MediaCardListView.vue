<script lang="ts" setup>
import api from "@/api";

// 定义订阅字典结构
interface MediaInfo {
    // 类型 电影、电视剧
    type?: string
    // 媒体标题
    title?: string
    // 年份
    year?: string
    // TMDB ID
    tmdb_id?: number
    // IMDB ID
    imdb_id?: string
    // TVDB ID
    tvdb_id?: string
    // 豆瓣ID
    douban_id?: string
    // 媒体原语种
    original_language?: string
    // 媒体原发行标题
    original_title?: string
    // 媒体发行日期
    release_date?: string
    // 背景图片
    backdrop_path?: string
    // 海报图片
    poster_path?: string
    // 评分
    vote_average: number
    // 描述
    overview?: string
    // 二级分类
    category?: string
}

// 输入参数
const props = defineProps({
  apipath: String,
});

// 数据列表
const dataList = ref<MediaInfo[]>([]);

// 获取订阅列表数据
const fetchData = async () => {
  try {
    if (!props.apipath){
      return
    }
    dataList.value = await api.get(props.apipath);
  } catch (error) {
    console.error(error);
  }
};

// 加载时获取数据
onMounted(fetchData);

</script>

<template>
  <VRow>
    <VCol v-for="data in dataList" :key="data.tmdb_id" cols="6" md="3" lg="2">
      <VCard>
        <VImg
          :src="data.poster_path"
          cover
        />
      </VCard>
    </VCol>
  </VRow>
</template>
