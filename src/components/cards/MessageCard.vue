<script lang="ts" setup>
import type { Message } from '@/api/types'

// 输入参数
const props = defineProps({
  message: Object as PropType<Message>,
  width: String,
  height: String,
})

// 图片是否加载完成
const isImageLoaded = ref(false)

// 图片是否加载失败
const imageLoadError = ref(false)

// 图片加载完成
async function imageLoaded() {
  isImageLoaded.value = true
}

// 链接打开新窗口
function openLink() {
  if (props.message?.link)
    window.open(props.message.link, '_blank')
}
</script>

<template>
  <VCard
    :width="props.width"
    :height="props.height"
    @click="openLink"
  >
    <div
      v-if="props.message?.image"
      class="relative text-center card-cover-blurred"
    >
      <VImg
        :src="props.message?.image"
        aspect-ratio="4/3"
        cover
        :class="{ shadow: isImageLoaded }"
        @load="imageLoaded"
        @error="imageLoadError = true"
      />
    </div>
    <VCardTitle v-if="props.message?.title">
      {{ props.message?.title }}
    </VCardTitle>
    <VAlert
      v-if="props.message?.text && props.message?.action === 0"
      variant="tonal"
      type="success"
    >
      <template #prepend />
      {{ props.message?.text }}
    </VAlert>
    <VCardText v-if="props.message?.text && props.message?.action === 1">
      {{ props.message?.text }}
    </VCardText>
  </VCard>
</template>
