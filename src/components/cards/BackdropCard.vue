<script lang="ts" setup>
import type { MediaServerPlayItem } from '@/api/types'
import { openMediaServerWithAutoDetect } from '@/utils/appDeepLink'
// 输入参数
const props = defineProps({
  media: Object as PropType<MediaServerPlayItem>,
  width: String,
  height: String,
})

// 图片是否加载完成
const imageLoaded = ref(false)

// 图片加载完成响应
function imageLoadHandler() {
  imageLoaded.value = true
}

// 跳转播放
async function goPlay() {
  if (props.media?.link) {
    await openMediaServerWithAutoDetect(props.media.link, undefined, props.media.server_type)
  }
}

// 计算图片地址
const getImgUrl = computed(() => {
  const image = props.media?.image || ''
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
      <VCard
        v-bind="hover.props"
        :height="props.height"
        :width="props.width"
        class="ring-gray-500"
        :class="{
          'transition transform-cpu duration-300 -translate-y-1': hover.isHovering,
          'ring-1': imageLoaded,
        }"
        @click="goPlay"
      >
        <template #image>
          <VImg :src="getImgUrl" aspect-ratio="2/3" cover @load="imageLoadHandler">
            <template #placeholder>
              <div class="w-full h-full">
                <VSkeletonLoader class="object-cover aspect-w-3 aspect-h-2" />
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
    </template>
  </VHover>
</template>
