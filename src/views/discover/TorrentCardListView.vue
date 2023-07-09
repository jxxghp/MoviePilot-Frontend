<script lang="ts" setup>
import api from "@/api";
import { Context } from "@/api/types";
import TorrentCard from "@/components/cards/TorrentCard.vue";
import NoDataFound from "@/components/NoDataFound.vue";
import store from "@/store";

// 定义输入参数
const props = defineProps({
  keyword: String,
});

// 数据列表
const dataList = ref<Context[]>([]);

// 分组后的数据列表
const groupedDataList = computed(() => {
  return groupByTitleAndSize(dataList.value);
});

// 是否刷新过
const isRefreshed = ref(false);

// 加载进度文本
const progressText = ref("");
// 加载进度
const progressValue = ref(0);
// 加载进度SSE
const progressEventSource = ref<EventSource>();

// 获取订阅列表数据
const fetchData = async () => {
  try {
    let keyword = props.keyword?.toString() ?? "";
    if (!keyword) {
      // 查询上次搜索结果
      dataList.value = await api.get("search/last");
    } else {
      startLoadingProgress();
      // 优先按TMDBID精确查询
      if (props.keyword?.startsWith("tmdb:") || props.keyword?.startsWith("douban:")) {
        dataList.value = await api.get(`search/media/${props.keyword}`);
      } else {
        // 按标题模糊查询
        dataList.value = await api.get(`search/title/${props.keyword}`);
      }
      stopLoadingProgress();
    }
    isRefreshed.value = true;
  } catch (error) {
    console.error(error);
  }
};

// 按标题和大小分组
const groupByTitleAndSize = (contextArray: Context[]): Map<string, Context[]> => {
  const groupMap = new Map<string, Context[]>();

  for (const context of contextArray) {
    const { torrent_info } = context;
    const key = `${torrent_info.title}_${torrent_info.size}`;

    if (groupMap.has(key)) {
      // 已存在相同标题和大小的分组，将当前上下文信息添加到分组中
      const group = groupMap.get(key);
      group?.push(context);
    } else {
      // 创建新的分组，并将当前上下文信息添加到分组中
      groupMap.set(key, [context]);
    }
  }

  return groupMap;
};

// 获取每个分组的第一个数据
const getFirstContexts = computed(() => {
  const firstContexts: Context[] = [];

  groupedDataList.value.forEach((group) => {
    if (group.length > 0) {
      firstContexts.push(group[0]);
    }
  });

  return firstContexts;
});

// 使用SSE监听加载进度
const startLoadingProgress = () => {
  progressText.value = "正在搜索，请稍候...";
  const token = store.state.auth.token;
  progressEventSource.value = new EventSource(
    `${import.meta.env.VITE_API_BASE_URL}system/progress/search?token=${token}`
  );
  progressEventSource.value.onmessage = (event) => {
    const progress = JSON.parse(event.data);
    console.log(progress);
    progressText.value = progress.text;
    progressValue.value = progress.value;
  };
};

// 停止监听加载进度
const stopLoadingProgress = () => {
  progressEventSource.value?.close();
};

// 加载时获取数据
onBeforeMount(fetchData);
</script>

<template>
  <VProgressCircular
    class="centered"
    v-if="!isRefreshed && !props.keyword"
    indeterminate
    color="primary"
  ></VProgressCircular>
  <div
    class="top-centered mt-12 w-full text-center text-gray-500 text-sm flex flex-col items-center"
    v-if="!isRefreshed && props.keyword"
  >
    <VProgressCircular
      class="mb-3"
      color="primary"
      :model-value="progressValue"
      size="64"
      width="7"
    ></VProgressCircular>
    <span>{{ progressText }}</span>
  </div>
  <div class="grid gap-3 grid-torrent-card items-start" v-if="dataList.length > 0">
    <TorrentCard
      v-for="data in getFirstContexts"
      :key="data.torrent_info.title"
      :torrent="data"
      :more="
        groupedDataList
          .get(`${data.torrent_info.title}_${data.torrent_info.size}`)
          ?.slice(1)
      "
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
