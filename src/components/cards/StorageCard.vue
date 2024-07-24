<script setup lang="ts">
import { StorageConf } from '@/api/types'
import { formatBytes } from '@core/utils/formatters'
import storage_png from '@images/misc/storage.png'
import alipan_png from '@images/misc/alipan.webp'
import u115_png from '@images/misc/u115.png'
import rclone_png from '@images/misc/rclone.png'

// 定义输入
const props = defineProps({
  storage: {
    type: Object as PropType<StorageConf>,
    required: true,
  },
})

// 存储总空间
const total = ref(0)

// 存储可用空间
const available = ref(0)

// 根据存储类型选择图标
const getIcon = computed(() => {
  switch (props.storage.type) {
    case 'local':
      return storage_png
    case 'alipan':
      return alipan_png
    case 'u115':
      return u115_png
    case 'rclone':
      return rclone_png
    default:
      return storage_png
  }
})

// 计算存储使用率
const usage = computed(() => {
  return Math.round((available.value / (total.value || 1)) * 1000) / 10
})
</script>
<template>
  <VCard variant="tonal">
    <VCardText class="flex justify-space-between align-center gap-3">
      <div class="align-self-start">
        <h5 class="text-h5 mb-1">{{ storage.name }}</h5>
        <div class="text-body-1 mb-3">空间使用率 {{ usage }}%</div>
        <div v-if="available" class="d-flex align-center flex-wrap">
          <h4 class="text-h4">{{ formatBytes(available) }}</h4>
        </div>
      </div>
      <VImg :src="getIcon" cover class="m-3" max-width="6rem" />
    </VCardText>
  </VCard>
</template>
