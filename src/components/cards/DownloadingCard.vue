<script lang="ts" setup>
import api from '@/api'
import type { DownloadingInfo } from '@/api/types'
import { formatFileSize } from '@/@core/utils/formatters'

// 输入参数
const props = defineProps({
  info: Object as PropType<DownloadingInfo>,
})

// 是否显示卡片
const cardState = ref(true)

// 进度条
function getPercentage() {
  return props.info?.progress ?? 0
}

// 速度
function getSpeedText() {
  return `${formatFileSize(props.info?.size || 0)} ↑ ${props.info?.upspeed}/s ↓ ${props.info?.dlspeed}/s ${convertTimeString(props.info?.left_time)
    }`
}

// 下载状态
const isDownloading = ref(props.info?.state === 'downloading')
/**
 * @Author: wintsa
 * @Date: 2025-01-09 
 * @LastEditors: wintsa
 * @Description: 转换时间单位
 * @returns {*} 
 */
function convertTimeString(timeString: string | undefined) {
  // 匹配原始格式中的数字和单位
  if (!timeString) {
    return timeString
  }
  const match = timeString.match(/(\d+)时(\d+)分(\d+)秒/);
  if (!match) {
    throw new Error("时间格式不正确");
  }

  let hours = parseInt(match[1], 10); // 提取时
  const minutes = parseInt(match[2], 10); // 提取分
  const seconds = parseInt(match[3], 10); // 提取秒

  // 将小时转换为天和小时
  const days = Math.floor(hours / 24);
  hours = hours % 24;

  return `${days}天${hours}时${minutes}分${seconds}秒`;
}
// 监听props.info?.state的变化
watch(
  () => props.info?.state,
  newValue => {
    isDownloading.value = newValue === 'downloading'
  },
)

// 图片是否加载完成
const imageLoaded = ref(false)

// 图片加载完成响应
function imageLoadHandler() {
  imageLoaded.value = true
}

// 计算文本类
function getTextClass() {
  return imageLoaded.value ? 'text-white' : ''
}

// 下载状态控制
async function toggleDownload() {
  const operation = isDownloading.value ? 'stop' : 'start'
  try {
    const result: { [key: string]: any } = await api.get(`download/${operation}/${props.info?.hash}`)

    if (result.success) isDownloading.value = !isDownloading.value
  } catch (error) {
    console.error(error)
  }
}

// 删除下截
async function deleteDownload() {
  try {
    await api.delete(`download/${props.info?.hash}`)
    cardState.value = false
  } catch (error) {
    console.error(error)
  }
}
</script>

<template>
  <VCard v-if="cardState" :key="props.info?.hash">
    <template #image>
      <VImg :src="props.info?.media.image" aspect-ratio="2/3" cover class="brightness-50" @load="imageLoadHandler" />
    </template>

    <VCardTitle class="break-words whitespace-normal" :class="getTextClass()">
      {{ props.info?.media.title || props.info?.name }}
      {{
        props.info?.media.episode
          ? `${props.info?.media.season} ${props.info?.media.episode}`
          : props.info?.season_episode
      }}
    </VCardTitle>

    <VCardSubtitle class="break-words whitespace-normal" :class="getTextClass()">
      {{ props.info?.title }}
    </VCardSubtitle>

    <VCardText class="text-subtitle-1 pt-3 pb-1" :class="getTextClass()">
      {{ getSpeedText() }}
    </VCardText>

    <VCardText v-if="getPercentage() > 0" :class="getTextClass()">
      <VProgressLinear :model-value="getPercentage()" />
    </VCardText>

    <VCardActions class="justify-space-between">
      <VBtn :icon="`${isDownloading ? 'mdi-pause' : 'mdi-play'}`" @click="toggleDownload" />
      <VBtn color="error" icon="mdi-trash-can-outline" @click="deleteDownload" />
    </VCardActions>
  </VCard>
</template>
