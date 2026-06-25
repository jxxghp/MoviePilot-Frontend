<script lang="ts" setup>
import type { PropType } from 'vue'
import type { MediaServerPlayItem } from '@/api/types'
import noImage from '@images/no-image.jpeg'
import { openMediaServerItem } from '@/utils/appDeepLink'

// 输入参数
const props = defineProps({
  media: Object as PropType<MediaServerPlayItem>,
  width: String,
  height: String,
})

// 图片加载状态
const isImageLoaded = ref(false)

// 图片加载失败
const imageLoadError = ref(false)

const cardStyle = computed(() => ({
  aspectRatio: props.height ? undefined : '2 / 3',
  blockSize: props.height,
  inlineSize: props.width || '100%',
}))

// 角标颜色
function getChipColor(type: string) {
  if (type === '电影') return 'border-blue-500 bg-blue-600'
  else if (type === '电视剧') return ' bg-indigo-500 border-indigo-600'
  else return 'border-purple-600 bg-purple-600'
}

// 计算图片地址
const getImgUrl = computed(() => {
  if (imageLoadError.value) return noImage
  const image = props.media?.image || ''
  let url = `${import.meta.env.VITE_API_BASE_URL}system/img/0?imgurl=${encodeURIComponent(image)}`
  const use_cookies = props.media?.use_cookies
  if (use_cookies) {
   url += `&use_cookies=${encodeURIComponent(use_cookies)}`
  }
  return url
})

// 跳转播放
async function goPlay(isHovering: boolean | null = false) {
  if (props.media && isHovering) {
    await openMediaServerItem(props.media)
  }
}
</script>

<template>
  <VHover>
    <template #default="hover">
      <!-- Hover 命中区域保持静止，避免卡片上浮后底边反复触发 mouseleave。 -->
      <div v-bind="hover.props" class="poster-card-hover-area">
        <VCard
          :style="cardStyle"
          class="app-hover-lift-card outline-none ring-gray-500"
          :class="{
            'app-hover-lift-card--hovering': hover.isHovering,
            'ring-1': isImageLoaded,
          }"
        >
        <VImg
          aspect-ratio="2/3"
          :src="getImgUrl"
          class="poster-card-image object-cover aspect-w-2 aspect-h-3"
          :class="{ 'poster-card-image--loaded': isImageLoaded }"
          cover
          @load="isImageLoaded = true"
          @error="imageLoadError = true"
        >
          <template #placeholder>
            <div class="w-full h-full">
              <VSkeletonLoader class="object-cover aspect-w-2 aspect-h-3" />
            </div>
          </template>
        </VImg>
        <!-- 类型角标 -->
        <VChip
          v-show="isImageLoaded"
          variant="elevated"
          size="small"
          :class="getChipColor(props.media?.type || '')"
          class="poster-card-chip absolute left-2 top-2 bg-opacity-80 text-white font-bold"
        >
          {{ props.media?.type }}
        </VChip>
        <!-- 详情 -->
        <VCardText
          v-show="hover.isHovering || imageLoadError"
          class="w-full h-full flex flex-col flex-wrap justify-end align-left text-white absolute bottom-0 cursor-pointer pa-2 pb-5"
          style="background: linear-gradient(rgba(45, 55, 72, 40%) 0%, rgba(45, 55, 72, 90%) 100%)"
          @click.stop="goPlay(hover.isHovering)"
        >
          <span class="font-semibold text-sm">{{ props.media?.subtitle }}</span>
          <h1 class="mb-1 text-white font-bold text-lg line-clamp-2 overflow-hidden text-ellipsis ...">
            {{ props.media?.title }}
          </h1>
        </VCardText>
        </VCard>
      </div>
    </template>
  </VHover>
</template>

<style scoped>
/* stylelint-disable selector-pseudo-class-no-unknown */

.poster-card-hover-area {
  block-size: 100%;
  inline-size: 100%;
}

.poster-card-image {
  block-size: 100%;
  inline-size: 100%;
}

.poster-card-image :deep(.v-img__img) {
  opacity: 0;
  transition: opacity 0.2s ease;
}

.poster-card-image--loaded :deep(.v-img__img) {
  opacity: 1;
}

.poster-card-image :deep(.v-responsive__sizer) {
  padding-bottom: 150%;
}

@media (prefers-reduced-motion: reduce) {
  .poster-card-image :deep(.v-img__img) {
    transition: none;
  }
}
</style>
