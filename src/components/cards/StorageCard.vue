<script setup lang="ts">
import { StorageConf } from '@/api/types'
import { formatBytes } from '@core/utils/formatters'
import storage_png from '@images/misc/storage.png'

// 定义输入
defineProps({
  storage: {
    type: Object as PropType<StorageConf>,
    required: true,
  },
})

// 存储总空间
const total = ref(0)

// 存储可用空间
const available = ref(0)

// 计算存储使用率
const usage = computed(() => {
  return Math.round((available.value / (total.value || 1)) * 1000) / 10
})
</script>
<template>
  <VCard>
    <VCardText class="flex justify-space-between align-center gap-3">
      <div>
        <h5 class="text-h5 mb-1">{{ storage.name }}</h5>
        <div class="text-body-1 mb-3">空间使用率 {{ usage }}%</div>
        <div class="d-flex align-center flex-wrap">
          <h4 class="text-h4">{{ formatBytes(available) }}</h4>
          <div class="d-flex align-center">
            /
            <span class="text-body-1 text-success">
              {{ formatBytes(total) }}
            </span>
          </div>
        </div>
      </div>
      <div style="min-block-size: 6rem">
        <VImg :src="storage_png" cover />
      </div>
    </VCardText>
  </VCard>
</template>
