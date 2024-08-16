<script setup lang="ts">
import { StorageConf } from '@/api/types'
import { formatBytes } from '@core/utils/formatters'
import storage_png from '@images/misc/storage.png'
import alipan_png from '@images/misc/alipan.webp'
import u115_png from '@images/misc/u115.png'
import rclone_png from '@images/misc/rclone.png'
import api from '@/api'
import AliyunAuthDialog from '../dialog/AliyunAuthDialog.vue'
import U115AuthDialog from '../dialog/U115AuthDialog.vue'
import RcloneConfigDialog from '../dialog/RcloneConfigDialog.vue'
import { useToast } from 'vue-toast-notification'

// 定义输入
const props = defineProps({
  storage: {
    type: Object as PropType<StorageConf>,
    required: true,
  },
})

// 定义事件
const emit = defineEmits(['done'])

// 提示信息
const $toast = useToast()

// 存储总空间
const total = ref(0)

// 存储可用空间
const available = ref(0)

// 阿里云盘认证对话框
const aliyunAuthDialog = ref(false)
// 115网盘认证对话框
const u115AuthDialog = ref(false)
// Rclone配置对话框
const rcloneConfigDialog = ref(false)

// 打开存储对话框
function openStorageDialog() {
  switch (props.storage.type) {
    case 'alipan':
      aliyunAuthDialog.value = true
      break
    case 'u115':
      u115AuthDialog.value = true
      break
    case 'rclone':
      rcloneConfigDialog.value = true
      break
    default:
      $toast.info('此存储类型无需配置参数')
      break
  }
}

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

// 计算进度条颜色
const progressColor = computed(() => {
  if (usage.value > 90) {
    return 'error'
  } else if (usage.value > 70) {
    return 'warning'
  } else {
    return 'success'
  }
})

// 计算存储使用率
const usage = computed(() => {
  return Math.round((available.value / (total.value || 1)) * 1000) / 10
})

// 查询存储信息
async function queryStorage() {
  try {
    const data: { total: number; available: number } = await api.get(`storage/usage/${props.storage.type}`)
    total.value = data.total
    available.value = data.available
  } catch (error) {
    console.error(error)
  }
}

// 完成配置后的处理
function handleDone() {
  aliyunAuthDialog.value = false
  u115AuthDialog.value = false
  rcloneConfigDialog.value = false
  emit('done')
}

onMounted(() => {
  queryStorage()
})
</script>
<template>
  <VCard variant="tonal" @click="openStorageDialog">
    <VCardText class="flex justify-space-between align-center gap-3">
      <div class="align-self-start flex-1">
        <h5 class="text-h6 mb-1">{{ storage.name }}</h5>
        <div class="mb-3 text-sm" v-if="total">{{ formatBytes(available, 1) }} / {{ formatBytes(total, 1) }}</div>
        <div v-else>未配置</div>
      </div>
      <VImg :src="getIcon" cover class="mt-5" max-width="3rem" min-width="3rem" />
    </VCardText>
    <div class="w-full absolute bottom-0">
      <VProgressLinear v-if="usage > 0" :model-value="usage" :bg-color="progressColor" :color="progressColor" />
    </div>
  </VCard>
  <AliyunAuthDialog
    v-if="aliyunAuthDialog"
    v-model="aliyunAuthDialog"
    @close="aliyunAuthDialog = false"
    @done="handleDone"
  />
  <U115AuthDialog v-if="u115AuthDialog" v-model="u115AuthDialog" @close="u115AuthDialog = false" @done="handleDone" />
  <RcloneConfigDialog
    v-if="rcloneConfigDialog"
    v-model="rcloneConfigDialog"
    :conf="props.storage.config || {}"
    @close="rcloneConfigDialog = false"
    @done="handleDone"
  />
</template>
