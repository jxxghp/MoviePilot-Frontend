<script lang="ts" setup>
import type { MediaServerLibrary } from '@/api/types'

// 输入参数
const props = defineProps({
  media: Object as PropType<MediaServerLibrary>,
  width: String,
  height: String,
})

// 图片是否加载完成
const imageLoaded = ref(false)

// 图片加载完成响应
function imageLoadHandler() {
  imageLoaded.value = true
}

// 计算图片地址
const getImgUrl = computed(() => {
  const image = props.media?.image || props.media?.image_list?.[0] || ''
  return `${import.meta.env.VITE_API_BASE_URL}system/img/${encodeURIComponent(image)}`
})

// 跳转播放
function goPlay() {
  if (props.media?.link)
    window.open(props.media?.link, '_blank')
}
</script>

<template>
  <VHover
    v-bind="props"
    :height="props.height"
    :width="props.width"
  >
    <template #default="hover">
      <VCard
        v-bind="hover.props"
        :height="props.height"
        :width="props.width"
        :class="{
          'transition transform-cpu duration-300 scale-105 shadow-lg': hover.isHovering,
        }"
        @click="goPlay"
      >
        <template #image>
          <VImg
            :src="getImgUrl"
            aspect-ratio="2/3"
            cover
            @load="imageLoadHandler"
          >
            <template #placeholder>
              <div class="w-full h-full">
                <VSkeletonLoader class="object-cover aspect-w-3 aspect-h-2" />
              </div>
            </template>
            <VCardText
              class="w-full flex flex-col flex-wrap justify-end align-center text-white absolute bottom-0 cursor-pointer pa-2"
            >
              <h1 class="mb-1 text-white font-bold line-clamp-2 overflow-hidden text-ellipsis ...">
                {{ props.media?.name }}
              </h1>
            </VCardText>
          </VImg>
        </template>
      </VCard>
    </template>
  </VHover>
</template>
