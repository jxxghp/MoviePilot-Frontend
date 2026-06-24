<script lang="ts" setup>
import api from '@/api'
import type { DownloadingInfo } from '@/api/types'
import { formatFileSize } from '@/@core/utils/formatters'

// 输入参数
const props = defineProps({
  info: Object as PropType<DownloadingInfo>,
  downloaderName: String,
})

// 是否显示卡片
const cardState = ref(true)

// 进度条
function getPercentage() {
  return props.info?.progress ?? 0
}

// 速度
function getSpeedText() {
  return `${formatFileSize(props.info?.size || 0)} ↑ ${props.info?.upspeed}/s ↓ ${props.info?.dlspeed}/s ${
    props.info?.left_time
  }`
}

// 下载状态
const isDownloading = ref(props.info?.state === 'downloading')

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

// 下载状态控制
async function toggleDownload() {
  const operation = isDownloading.value ? 'stop' : 'start'
  try {
    const result: { [key: string]: any } = await api.get(`download/${operation}/${props.info?.hash}`, {
      params: {
        name: props.downloaderName,
      },
    })

    if (result.success) isDownloading.value = !isDownloading.value
  } catch (error) {
    console.error(error)
  }
}

// 删除下截
async function deleteDownload() {
  try {
    await api.delete(`download/${props.info?.hash}`, { params: { name: props.downloaderName } })
    cardState.value = false
  } catch (error) {
    console.error(error)
  }
}
</script>

<template>
  <VHover>
    <template #default="hover">
      <!-- Hover 命中区域保持静止，避免卡片上浮后底边反复触发 mouseleave。 -->
      <div v-if="cardState" v-bind="hover.props" class="downloading-card-hover-area h-full">
        <VCard
          :key="props.info?.hash"
          class="downloading-card app-hover-lift-card app-surface flex flex-col h-full overflow-hidden"
          :class="{
            'app-hover-lift-card--hovering': hover.isHovering,
          }"
          min-height="150"
        >
        <template #image>
          <VImg
            :src="props.info?.media.image"
            class="downloading-card-image"
            aspect-ratio="2/3"
            cover
            @load="imageLoadHandler"
            position="top"
          >
            <template #placeholder>
              <div class="w-full h-full">
                <VSkeletonLoader class="object-cover aspect-w-2 aspect-h-3" />
              </div>
            </template>
            <template #default>
              <div class="absolute inset-0 outline-none downloading-card-background"></div>
            </template>
          </VImg>
        </template>

        <div>
          <VCardTitle class="break-words whitespace-normal text-white">
            {{ props.info?.media.title || props.info?.name }}
            {{
              props.info?.media.episode
                ? `${props.info?.media.season} ${props.info?.media.episode}`
                : props.info?.season_episode
            }}
          </VCardTitle>

          <VCardSubtitle class="break-words whitespace-normal text-white">
            {{ props.info?.title }}
          </VCardSubtitle>

          <VCardText class="text-subtitle-1 pt-3 pb-1 text-white">
            {{ getSpeedText() }}
          </VCardText>

          <VCardText v-if="getPercentage() > 0" class="text-white">
            <VProgressLinear :model-value="getPercentage()" bg-color="success" color="success" />
          </VCardText>

          <VCardActions class="justify-space-between">
            <VBtn :icon="`${isDownloading ? 'mdi-pause' : 'mdi-play'}`" @click="toggleDownload" />
            <VBtn color="error" icon="mdi-trash-can-outline" @click="deleteDownload" />
          </VCardActions>
        </div>
        </VCard>
      </div>
    </template>
  </VHover>
</template>

<style lang="scss" scoped>
/* stylelint-disable selector-pseudo-class-no-unknown */

.downloading-card-hover-area {
  inline-size: 100%;
}

.downloading-card-image {
  block-size: 100%;
}

.downloading-card-background {
  border-radius: inherit;
  background-image: linear-gradient(180deg, rgba(31, 41, 55, 47%) 0%, rgb(31, 41, 55) 100%);
  pointer-events: none;
}
</style>
