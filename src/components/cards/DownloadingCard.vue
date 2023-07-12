<script lang="ts" setup>
import api from "@/api";
import { DownloadingInfo } from "@/api/types";

// 输入参数
const props = defineProps({
  info: Object as PropType<DownloadingInfo>,
});

// 是否显示卡片
const cardState = ref(true);

// 进度条
const getPercentage = () => {
  return props.info?.progress ?? 0;
};

// 速度
const getSpeedText = () => {
  return `↑ ${props.info?.upspeed}/s ↓ ${props.info?.dlspeed}/s`;
};

// 下载状态
const isDownloading = ref(props.info?.state === "downloading" ? true : false);

// 图片是否加载完成
const imageLoaded = ref(false);

// 图片加载完成响应
const imageLoadHandler = () => {
  imageLoaded.value = true;
};

// 计算文本类
const getTextClass = () => {
  return imageLoaded.value ? "text-white" : "";
};

// 下载状态控制
const toggleDownload = async () => {
  let operation = isDownloading.value ? "stop" : "start";
  try {
    const result: { [key: string]: any } = await api.put(
      `download/${props.info?.hash}/${operation}`
    );
    if (result.success) {
      isDownloading.value = !isDownloading.value;
    }
  } catch (error) {
    console.error(error);
  }
};

// 删除下截
const deleteDownload = async () => {
  try {
    await api.delete(`download/${props.info?.hash}`);
    cardState.value = false;
  } catch (error) {
    console.error(error);
  }
};
</script>

<template>
  <VCard :key="props.info?.hash" v-if="cardState">
    <template #image>
      <VImg
        :src="props.info?.media.image"
        aspect-ratio="2/3"
        cover
        class="brightness-50"
        @load="imageLoadHandler"
      />
    </template>

    <VCardTitle class="break-words whitespace-normal" :class="getTextClass()">
      {{ props.info?.media.title || props.info?.name }}
      {{ props.info?.season_episode }}
    </VCardTitle>

    <VCardSubtitle class="break-words whitespace-normal" :class="getTextClass()">
      {{ props.info?.title }}
    </VCardSubtitle>

    <VCardText class="text-subtitle-1 pt-3 pb-1" :class="getTextClass()"> {{ getSpeedText() }} </VCardText>

    <VCardText v-if="getPercentage() > 0" :class="getTextClass()">
      <VProgressLinear :model-value="getPercentage()" />
    </VCardText>

    <VCardActions class="justify-space-between">
      <VBtn @click="toggleDownload">
        <span class="ms-2">{{ isDownloading ? "暂停" : "开始" }}</span>
      </VBtn>
      <VBtn color="error" icon="mdi-trash-can-outline" @click="deleteDownload" />
    </VCardActions>
  </VCard>
</template>
