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
  <VSlideGroup
    show-arrows
  >
    <VSlideGroupItem v-for="data in dataList" 
      :key="data.tmdb_id"
      v-slot="{ isSelected, toggle }"
    >
      <MediaCard 
        :media="data" 
        @click="toggle"
        class="mx-1" 
        height="22rem"
        width="11rem"
        :color="isSelected ? 'primary' : 'grey-lighten-1'"
      >
        <div class="d-flex fill-height align-center justify-center">
          <VScaleTransition>
            <v-icon
              v-if="isSelected"
              color="white"
              size="48"
              icon="mdi-close-circle-outline"
            ></v-icon>
          </VScaleTransition>
        </div>
      </MediaCard>
    </VSlideGroupItem>
  </VSlideGroup>
</template>
