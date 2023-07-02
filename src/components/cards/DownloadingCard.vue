<script lang="ts" setup>
import api from "@/api";
import { DownloadingInfo } from "@/api/types";

// 输入参数
const props = defineProps({
  info: Object as PropType<DownloadingInfo>,
});

// 是否显示卡版
const cardState = ref(true);

// 进度条
const getPercentage = () => {
  return props.info?.progress || 0;
};

// 速度
const getSpeedText = () => {
  return `↑${props.info?.upspeed}B/s ↓${props.info?.dlspeed}B/s`;
};

// 下载状态
const isDownloading = ref(props.info?.state === "downloading" ? true : false);

// 下载状态控制
const toggleDownload = async () => {
  let operation = isDownloading.value ? "stop" : "start";
  try {
    const result: { [key: string]: any } = await api.put(
      `download/${props.info?.hash}/${operation}`
    );
    isDownloading.value = !isDownloading.value;
  } catch (error) {
    console.error(error);
  }
};

// 删除下截
const deleteDownload = () => {
  try {
    api.delete(`download/${props.info?.hash}`);
    cardState.value = false;
  } catch (error) {
    console.error(error);
  }
};
</script>

<template>
  <VCard :key="props.info?.hash" v-if="cardState">
    <div class="d-flex justify-space-between flex-wrap flex-row">
      <div class="ma-auto pa-5 pe-0" v-if="props.info?.media.image">
        <VImg
          aspect-ratio="2/3"
          width="120"
          class="rounded shadow-lg"
          :src="props.info?.media.image"
        />
      </div>

      <div class="w-full">
        <VCardItem>
          <VCardTitle>{{ props.info?.media.title || props.info?.name }} {{ props.info?.season_episode }}</VCardTitle>
        </VCardItem>

        <VCardText
          v-if="!props.info?.media.image"
          class="break-all whitespace-normal line-clamp-2 overflow-hidden text-ellipsis ..."
        >
          {{ props.info?.title }}
        </VCardText>

        <VCardText class="text-subtitle-1"> {{ getSpeedText() }} </VCardText>

        <VCardText>
          <VProgressLinear v-if="getPercentage() > 0" :model-value="getPercentage()" />
        </VCardText>

        <VCardActions class="justify-space-between">
          <VBtn @click="toggleDownload">
            <span class="ms-2">{{ isDownloading ? "暂停" : "开始" }}</span>
          </VBtn>
          <VBtn color="error" icon="mdi-trash-can-outline" @click="deleteDownload" />
        </VCardActions>
      </div>
    </div>
  </VCard>
</template>
