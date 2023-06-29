<script lang="ts" setup>
import api from "@/api";
import { MediaInfo } from "@/api/types";
import MediaCard from "@/components/cards/MediaCard.vue";

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
  <div class="grid gap-3 grid-media-card">
    <MediaCard v-for="data in dataList" 
      :key="data.tmdb_id" 
      :media="data">
    </MediaCard>
  </div>
</template>
