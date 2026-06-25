<script lang="ts" setup>
import type { MediaServerPlayItem } from '@/api/types'
import noImage from '@images/no-image.jpeg'
import { openMediaServerItem } from '@/utils/appDeepLink'
// 输入参数
const props = defineProps({
  media: Object as PropType<MediaServerPlayItem>,
  width: String,
  height: String,
})

// 图片是否加载完成
const imageLoaded = ref(false)
const imageLoadError = ref(false)

const cardStyle = computed(() => ({
  aspectRatio: props.height ? undefined : '3 / 2',
  blockSize: props.height,
  inlineSize: props.width || '100%',
}))

// 图片加载完成响应
function imageLoadHandler() {
  imageLoaded.value = true
}

// 图片加载失败响应
function imageErrorHandler() {
  imageLoadError.value = true
}

// 跳转播放
async function goPlay() {
  if (props.media) {
    await openMediaServerItem(props.media)
  }
}

// 计算图片地址
const getImgUrl = computed(() => {
  const image = props.media?.image || ''
  if (!image || imageLoadError.value) return noImage
  let url = `${import.meta.env.VITE_API_BASE_URL}system/img/0?imgurl=${encodeURIComponent(image)}`
  const use_cookies = props.media?.use_cookies
  if (use_cookies) {
   url += `&use_cookies=${encodeURIComponent(use_cookies)}`
  }
  return url
})
</script>

<template>
  <VHover>
    <template #default="hover">
      <!-- Hover 命中区域保持静止，避免卡片上浮后底边反复触发 mouseleave。 -->
      <div v-bind="hover.props" class="backdrop-card-hover-area">
        <VCard
          :style="cardStyle"
          class="app-hover-lift-card ring-gray-500"
          :class="{
            'app-hover-lift-card--hovering': hover.isHovering,
            'ring-1': imageLoaded,
          }"
          @click="goPlay"
        >
        <template #image>
          <VImg
            :src="getImgUrl"
            aspect-ratio="2/3"
            class="backdrop-card-image"
            :class="{ 'backdrop-card-image--loaded': imageLoaded }"
            cover
            @load="imageLoadHandler"
            @error="imageErrorHandler"
          >
            <template #placeholder>
              <div class="backdrop-card-placeholder">
                <VSkeletonLoader class="backdrop-card-skeleton" />
              </div>
            </template>
            <template #default>
              <VCardText
                class="w-full flex flex-col flex-wrap justify-end align-left text-white absolute bottom-0 cursor-pointer pa-2"
              >
                <h1
                  class="mb-1 text-white text-shadow font-bold text-lg line-clamp-2 overflow-hidden text-ellipsis ..."
                >
                  {{ props.media?.title }}
                </h1>
                <span class="text-shadow text-sm">{{ props.media?.subtitle }}</span>
              </VCardText>
            </template>
          </VImg>
        </template>
        <div class="w-full absolute bottom-0">
          <VProgressLinear
            v-if="props.media?.percent"
            :model-value="props.media?.percent"
            bg-color="success"
            color="success"
          />
        </div>
        </VCard>
      </div>
    </template>
  </VHover>
</template>

<style scoped>
/* stylelint-disable selector-pseudo-class-no-unknown */

.backdrop-card-hover-area {
  block-size: 100%;
  inline-size: 100%;
}

.backdrop-card-image {
  block-size: 100%;
  inline-size: 100%;
}

.backdrop-card-placeholder,
.backdrop-card-skeleton {
  block-size: 100%;
  inline-size: 100%;
}

.backdrop-card-image :deep(.v-img__img) {
  opacity: 0;
  transition: opacity 0.2s ease;
}

.backdrop-card-image--loaded :deep(.v-img__img) {
  opacity: 1;
}

@media (prefers-reduced-motion: reduce) {
  .backdrop-card-image :deep(.v-img__img) {
    transition: none;
  }
}
</style>
