<script lang="ts" setup>
import type { MediaServerPlayItem } from '@/api/types'

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
function goPlay() {
  if (props.media?.link) window.open(props.media?.link, '_blank')
}

// 计算图片地址
const getImgUrl = computed(() => {
  const image = props.media?.image || ''
  return `${import.meta.env.VITE_API_BASE_URL}system/img/0?imgurl=${encodeURIComponent(image)}`
})
</script>

<template>
  <VHover v-bind="props">
    <template #default="hover">
      <VCard
        v-bind="hover.props"
        :height="props.height"
        :width="props.width"
        class="ring-gray-500"
        :class="{
          'transition transform-cpu duration-300 scale-105 shadow-lg': hover.isHovering,
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
            <VCardText
              class="w-full flex flex-col flex-wrap justify-end align-left text-white absolute bottom-0 cursor-pointer pa-2"
            >
              <h1
                class="mb-1 text-white text-shadow font-extrabold text-xl line-clamp-2 overflow-hidden text-ellipsis ..."
              >
                {{ props.media?.title }}
              </h1>
              <span class="text-shadow">{{ props.media?.subtitle }}</span>
            </VCardText>
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

<style lang="scss">
.text-shadow {
  text-shadow: 1px 1px #777;
}
</style>
