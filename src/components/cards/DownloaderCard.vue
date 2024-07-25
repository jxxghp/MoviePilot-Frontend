<script setup lang="ts">
import { DownloaderConf } from '@/api/types'
import { formatBytes } from '@core/utils/formatters'
import qbittorrent_image from '@images/logos/qbittorrent.png'
import transmission_image from '@images/logos/transmission.png'

// 定义输入
const props = defineProps({
  downloader: {
    type: Object as PropType<DownloaderConf>,
    required: true,
  },
})

// 上传速率
const upload_rate = ref(0)

// 下载速度
const download_rate = ref(0)

// 速度
const getSpeedText = computed(() => {
  return `↑ ${upload_rate.value}/s ↓ ${download_rate.value}/s`
})

// 根据存储类型选择图标
const getIcon = computed(() => {
  switch (props.downloader.type) {
    case 'qbittorrent':
      return qbittorrent_image
    case 'transmission':
      return transmission_image
    default:
      return qbittorrent_image
  }
})
</script>
<template>
  <VCard variant="tonal">
    <VCardText class="flex justify-space-between align-center gap-3">
      <div class="align-self-start">
        <h5 class="text-h5 mb-1">{{ downloader.name }}</h5>
        <div class="text-body-1 mb-3">{{ getSpeedText }}</div>
      </div>
      <VImg :src="getIcon" cover class="m-3" max-width="6rem" />
    </VCardText>
  </VCard>
</template>
