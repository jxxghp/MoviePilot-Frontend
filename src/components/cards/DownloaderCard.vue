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

// 定义触发的自定义事件
const emit = defineEmits(['close'])

// 按钮点击
function onClose() {
  emit('close')
}
</script>
<template>
  <VCard variant="tonal">
    <DialogCloseBtn @click="onClose" />
    <VCardText class="flex justify-space-between align-center gap-3">
      <div class="align-self-start">
        <h5 class="text-h6 mb-1">{{ downloader.name }}</h5>
        <div class="text-body-1 mb-3">{{ getSpeedText }}</div>
      </div>
      <VImg :src="getIcon" cover class="mt-5 me-7" max-width="4rem" />
    </VCardText>
  </VCard>
</template>
