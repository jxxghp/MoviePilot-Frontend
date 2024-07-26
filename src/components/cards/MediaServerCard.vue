<script setup lang="ts">
import { MediaServerConf } from '@/api/types'
import emby_image from '@images/logos/emby.png'
import jellyfin_image from '@images/logos/jellyfin.png'
import plex_image from '@images/logos/plex.png'

// 定义输入
const props = defineProps({
  mediaserver: {
    type: Object as PropType<MediaServerConf>,
    required: true,
  },
})

// 根据存储类型选择图标
const getIcon = computed(() => {
  switch (props.mediaserver.type) {
    case 'emby':
      return emby_image
    case 'jellyfin':
      return jellyfin_image
    default:
      return plex_image
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
        <h5 class="text-h6 mb-1">{{ mediaserver.name }}</h5>
        <div class="text-body-1 mb-3"></div>
      </div>
      <VImg :src="getIcon" cover class="mt-5 me-7" max-width="4rem" />
    </VCardText>
  </VCard>
</template>
