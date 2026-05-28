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
      <VCard
        v-bind="hover.props"
        :height="props.height"
        :width="props.width"
        class="outline-none ring-gray-500"
        :class="{
          'transition transform-cpu duration-300 -translate-y-1': hover.isHovering,
          'ring-1': isImageLoaded,
        }"
      >
        <VImg
          aspect-ratio="2/3"
          :src="getImgUrl"
          class="object-cover aspect-w-2 aspect-h-3"
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
          class="absolute left-2 top-2 bg-opacity-80 text-white font-bold"
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
    </template>
  </VHover>
</template>
