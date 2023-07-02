<script lang="ts" setup>
import { DownloadingInfo } from "@/api/types";

// 输入参数
const props = defineProps({
  info: Object as PropType<DownloadingInfo>,
});

// 进度条
const getPercentage = () => {
  return props.info?.progress || 0;
};

// 速度
const getSpeedText = () => {
  return `↑${props.info?.upspeed}B/s ↓${props.info?.dlspeed}B/s`;
};

// 暂述状态
const isDownloading = () => {
  return props.info?.state === "downloading";
};

// 下载状态控制
const toggleDownload = () => {
  if (isDownloading()) {
    // 暂停
  } else {
    // 开始
  }
};

// 删除下截
const deleteDownload = () => {
  // 删除
};
</script>

<template>
  <VCard :key="props.info?.hash">
    <div class="d-flex justify-space-between flex-nowrap flex-row">
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
          <VCardTitle>{{ props.info?.media.title || props.info?.name }}</VCardTitle>
        </VCardItem>

        <VCardText
          class="break-all whitespace-normal line-clamp-2 overflow-hidden text-ellipsis ..."
        >
          {{ props.info?.title }}
        </VCardText>

        <VCardText class="text-subtitle-1"> {{ getSpeedText() }} </VCardText>

        <VCardText>
          <VProgressLinear v-if="getPercentage() > 0" :model-value="getPercentage()" />
        </VCardText>

        <VCardActions class="justify-space-t">
          <VBtn @click="toggleDownload">
            <span class="ms-2">{{ isDownloading() ? "暂停" : "开始" }}</span>
          </VBtn>
          <VBtn color="error" icon="mdi-trash-can-outline" @click="deleteDownload" />
        </VCardActions>
      </div>
    </div>
  </VCard>
</template>
