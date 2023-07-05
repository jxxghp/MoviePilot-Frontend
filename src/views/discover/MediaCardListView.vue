<script lang="ts" setup>
import api from "@/api";
import { MediaInfo } from "@/api/types";
import MediaCard from "@/components/cards/MediaCard.vue";

// 输入参数
const props = defineProps({
  apipath: String,
  params: Object as PropType<{ [key: string]: any }>,
});

// 判断是否有滚动条
const hasScroll = () => {
  return (
    document.body.scrollHeight -
      (window.innerHeight || document.documentElement.clientHeight) >
    2
  );
};

// 当前页码
const page = ref(1);
// 是否加载中
const loading = ref(false);
// 是否加载完成
const isRefreshed = ref(false);

// 数据列表
const dataList = ref<MediaInfo[]>([]);
const currData = ref<MediaInfo[]>([]);

// 拼装参数
const getParams = () => {
  let params = {
    page: page.value,
  };
  if (props.params) {
    params = { ...params, ...props.params };
  }
  return params;
};

// 获取订阅列表数据
const fetchData = async ({ done }) => {
  try {
    if (!props.apipath) {
      return;
    }
    // 如果正在加载中，直接返回
    if (loading.value) {
      done("ok");
      return;
    }
    // 设置加载中
    loading.value = true;
    // 加载到满屏或者加载出错
    if (!hasScroll()) {
      // 加载多次
      while (!hasScroll()) {
        // 请求API
        currData.value = await api.get(props.apipath, {
          params: getParams(),
        });
        // 标计为已请求完成
        isRefreshed.value = true;
        if (currData.value.length === 0) {
          // 如果没有数据，跳出
          done("ok");
          return;
        }
        // 合并数据
        dataList.value = [...dataList.value, ...currData.value];
        // 页码+1
        page.value++;
      }
    } else {
      // 加载一次
      // 请求API
      currData.value = await api.get(props.apipath, {
        params: getParams(),
      });
      // 标计为已请求完成
      isRefreshed.value = true;
      if (currData.value.length === 0) {
        // 如果没有数据，跳出
        done("ok");
        return;
      }
      // 合并数据
      dataList.value = [...dataList.value, ...currData.value];
      // 页码+1
      page.value++;
    }

    // 取消加载中
    loading.value = false;
    // 返回加载成功
    done("ok");
  } catch (error) {
    console.error(error);
    // 返回加载失败
    done("error");
  }
};
</script>

<template>
  <VProgressCircular
    class="centered"
    v-if="!isRefreshed"
    indeterminate
    color="primary"
  ></VProgressCircular>
  <VInfiniteScroll
    mode="intersect"
    side="end"
    :onLoad="fetchData"
    class="overflow-hidden"
  >
    <template #loading />
    <div class="grid gap-4 grid-media-card mx-3" v-if="dataList.length > 0">
      <MediaCard v-for="data in dataList" :key="data.tmdb_id" :media="data"> </MediaCard>
    </div>
    <NoDataFound
      v-if="dataList.length === 0 && isRefreshed"
      error-code="500"
      error-title="出错啦！"
      error-description="无法获取到媒体信息，请检查网络连接。"
    >
    </NoDataFound>
  </VInfiniteScroll>
</template>

<style type="scss">
.grid-media-card {
  grid-template-columns: repeat(auto-fill, minmax(9.375rem, 1fr));
}

</style>
