<script setup lang="ts">
import type { StorageConf } from '@/api/types'
import { formatBytes } from '@core/utils/formatters'
import storage_png from '@images/misc/storage.png'
import alipan_png from '@images/misc/alipan.webp'
import u115_png from '@images/misc/u115.png'
import rclone_png from '@images/misc/rclone.png'
import alist_png from '@images/misc/openlist.svg'
import custom_png from '@images/misc/database.png'
import smb_png from '@images/misc/smb.png'
import api from '@/api'
import { useToast } from 'vue-toastification'
import { isNullOrEmptyObject } from '@/@core/utils'
import { useI18n } from 'vue-i18n'
import { openSharedDialog } from '@/composables/useSharedDialog'
import { useCardAccentColor } from '@/composables/useCardAccentColor'

const AliyunAuthDialog = defineAsyncComponent(() => import('../dialog/AliyunAuthDialog.vue'))
const U115AuthDialog = defineAsyncComponent(() => import('../dialog/U115AuthDialog.vue'))
const RcloneConfigDialog = defineAsyncComponent(() => import('../dialog/RcloneConfigDialog.vue'))
const AlistConfigDialog = defineAsyncComponent(() => import('../dialog/AlistConfigDialog.vue'))
const SmbConfigDialog = defineAsyncComponent(() => import('../dialog/SmbConfigDialog.vue'))
const StorageCustomConfigDialog = defineAsyncComponent(() => import('../dialog/StorageCustomConfigDialog.vue'))

// 国际化
const { t } = useI18n()
const { accentRgb, imageRef, updateAccentColor } = useCardAccentColor('#FFB400')

// 定义输入
const props = defineProps({
  storage: {
    type: Object as PropType<StorageConf>,
    required: true,
  },
})

// 定义事件
const emit = defineEmits(['done', 'close'])

// 提示信息
const $toast = useToast()

// 存储总空间
const total = ref(0)

// 存储可用空间
const available = ref(0)

// 储存已用空间
const used = computed(() => {
  return total.value - available.value
})

/** 打开指定类型的共享存储配置弹窗。 */
function openStorageDialog() {
  const dialogMap: Record<string, Component> = {
    alipan: AliyunAuthDialog,
    u115: U115AuthDialog,
    rclone: RcloneConfigDialog,
    alist: AlistConfigDialog,
    smb: SmbConfigDialog,
  }

  if (props.storage.type === 'local') {
    $toast.info(t('storage.noConfigNeeded'))
    return
  }

  const dialog = dialogMap[props.storage.type] || StorageCustomConfigDialog
  const dialogProps = dialog === StorageCustomConfigDialog
    ? { storage: props.storage }
    : { conf: props.storage.config || {} }

  openSharedDialog(
    dialog,
    dialogProps,
    {
      done: handleDone,
    },
    { closeOn: ['close', 'done', 'update:modelValue'] },
  )
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
    case 'alist':
      return alist_png
    case 'smb':
      return smb_png
    default:
      return custom_png
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
  return Math.round((used.value / (total.value || 1)) * 1000) / 10
})

/** 查询存储空间使用信息。 */
async function queryStorage() {
  try {
    const data: { total: number; available: number } = await api.get(`storage/usage/${props.storage.type}`)
    total.value = data.total
    available.value = data.available
  } catch (error) {
    console.error(error)
  }
}

/** 完成配置后的处理并通知父级刷新。 */
function handleDone(storage?: StorageConf) {
  emit('done', storage || props.storage)
}

onMounted(() => {
  queryStorage()
})

/** 关闭存储卡片。 */
function onClose() {
  emit('close')
}
</script>

<template>
  <VCard
    variant="tonal"
    class="app-card-shell app-card-colorful"
    :style="{ '--app-card-accent-rgb': accentRgb }"
    @click="openStorageDialog"
  >
    <VDialogCloseBtn @click="onClose" />
    <VCardText class="flex justify-space-between align-center gap-3">
      <div class="align-self-start flex-1">
        <h5 class="text-h6 mb-1">{{ storage.name }}</h5>
        <div class="mb-3 text-sm" v-if="total">{{ formatBytes(used, 1) }} / {{ formatBytes(total, 1) }}</div>
        <div v-else-if="isNullOrEmptyObject(storage.config)">{{ t('storage.notConfigured') }}</div>
      </div>
      <VImg
        ref="imageRef"
        :src="getIcon"
        cover
        class="mt-8"
        max-width="3rem"
        min-width="3rem"
        @load="updateAccentColor"
      />
    </VCardText>
    <div class="w-full absolute bottom-0">
      <VProgressLinear v-if="usage > 0" :model-value="usage" :bg-color="progressColor" :color="progressColor" />
    </div>
  </VCard>
</template>
