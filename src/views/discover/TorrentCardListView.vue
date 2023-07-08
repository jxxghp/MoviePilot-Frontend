<script lang="ts" setup>
import api from "@/api";
import { Context } from "@/api/types";
import TorrentCard from "@/components/cards/TorrentCard.vue";
import NoDataFound from "@/components/NoDataFound.vue";

// 定义输入参数
const props = defineProps({
  keyword: String,
});

// 数据列表
const dataList = ref<Context[]>([]);

// 是否刷新过
const isRefreshed = ref(false);

// 获取订阅列表数据
const fetchData = async () => {
  try {
    let keyword = props.keyword?.toString() ?? "";
    if (!keyword) {
      // 查询上次搜索结果
      dataList.value = await api.get("search/last");
    } else {
      // 优先按TMDBID精确查询
      if (props.keyword?.startsWith("tmdb:") || props.keyword?.startsWith("douban:")) {
        dataList.value = await api.get(`search/media/${props.keyword}`);
      } else {
        // 按标题模糊查询
        dataList.value = await api.get(`search/title/${props.keyword}`);
      }
    }
    isRefreshed.value = true;
  } catch (error) {
    console.error(error);
  }
};

// 加载时获取数据
onBeforeMount(fetchData);
</script>

<template>
  <VProgressCircular
    class="centered"
    v-if="!isRefreshed"
    indeterminate
    color="primary"
  ></VProgressCircular>
  <div class="grid gap-3 grid-torrent-card" v-if="dataList.length > 0">
    <TorrentCard
      v-for="data in dataList"
      :key="data.torrent_info.title"
      :torrent="data"
    />
  </div>
  <NoDataFound
    v-if="dataList.length === 0 && isRefreshed"
    error-code="404"
    error-title="没有资源"
    error-description="没有搜索到符合条件的资源。"
  >
  </NoDataFound>
</template>

<style type="scss">
.grid-torrent-card {
  grid-template-columns: repeat(auto-fill, minmax(20rem, 1fr));
  padding-block-end: 1rem;
}
</style>
