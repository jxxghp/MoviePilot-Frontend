<script setup lang="ts">
import type { StorageConf } from '@/api/types'
import { formatBytes } from '@core/utils/formatters'
import storage_png from '@images/misc/storage.png'
import alipan_png from '@images/misc/alipan.webp'
import u115_png from '@images/misc/u115.png'
import rclone_png from '@images/misc/rclone.png'
import alist_png from '@images/misc/openlist.svg'
import alistgo_png from '@images/misc/alist.svg'
import custom_png from '@images/misc/database.png'
import smb_png from '@images/misc/smb.png'
import { manageStorage } from '@/api/manage'
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
    alistgo: AlistConfigDialog,
    smb: SmbConfigDialog,
  }

  if (props.storage.type === 'local') {
    $toast.info(t('storage.noConfigNeeded'))
    return
  }

  const dialog = dialogMap[props.storage.type] || StorageCustomConfigDialog
  const dialogProps =
    dialog === StorageCustomConfigDialog
      ? { storage: props.storage }
      : dialog === AlistConfigDialog
        ? { conf: props.storage.config || {}, type: props.storage.type }
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
    case 'alistgo':
      return alistgo_png
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
    const data = await manageStorage<{ total: number; available: number }>(props.storage.type, 'usage')
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

// 解析存储类型展示名称，未知自定义类型回退为“自定义”。
const storageTypeLabel = computed(() => {
  switch (props.storage.type) {
    case 'local':
      return t('storage.local')
    case 'alipan':
      return t('storage.alipan')
    case 'u115':
      return t('storage.u115')
    case 'rclone':
      return t('storage.rclone')
    case 'alist':
      return t('storage.alist')
    case 'alistgo':
      return t('storage.alistgo')
    case 'smb':
      return t('storage.smb')
    default:
      return t('storage.custom')
  }
})

const isUnconfigured = computed(() => props.storage.type !== 'local' && isNullOrEmptyObject(props.storage.config))
const clampedUsage = computed(() => Math.min(100, Math.max(0, usage.value)))
</script>

<template>
  <VCard
    variant="flat"
    class="app-card-shell app-card-colorful mp-setting-card mp-setting-card--interactive"
    :class="{ 'mp-setting-card--inactive': isUnconfigured }"
    :style="{ '--app-card-accent-rgb': accentRgb }"
    @click="openStorageDialog"
  >
    <div class="mp-setting-card__header">
      <div class="mp-setting-card__icon mp-setting-card__icon--logo" aria-hidden="true">
        <VImg ref="imageRef" :src="getIcon" contain class="mp-setting-card__logo" @load="updateAccentColor" />
      </div>
      <div class="mp-setting-card__heading">
        <div class="mp-setting-card__title-row">
          <span class="mp-setting-card__title" :title="storage.name">{{ storage.name }}</span>
        </div>
        <div class="mp-setting-card__subtitle">
          <span v-if="total" class="mp-setting-card__subtitle-text num">
            {{ `${formatBytes(used, 1)} / ${formatBytes(total, 1)}` }}
          </span>
          <span v-else class="mp-setting-card__subtitle-text">{{ storageTypeLabel }}</span>
        </div>
      </div>
      <div class="mp-setting-card__actions">
        <IconBtn class="mp-setting-card__action cursor-move" :aria-label="t('settingCard.dragSort')" @click.stop>
          <VIcon class="cursor-move" icon="mdi-drag" />
        </IconBtn>
        <VDialogCloseBtn inner-class="mp-setting-card__action mp-setting-card__action--danger" @click="onClose" />
      </div>
    </div>

    <div class="mp-setting-card__dock">
      <div v-if="total > 0" class="mp-setting-card__progress" :title="t('storage.usedPercent', { percent: usage })">
        <div class="mp-setting-card__progress-track">
          <span
            class="mp-setting-card__progress-fill"
            :class="`mp-setting-card__progress-fill--${progressColor}`"
            :style="{ inlineSize: `${clampedUsage}%` }"
          />
        </div>
        <span class="mp-setting-card__progress-pct">{{ `${usage}%` }}</span>
      </div>
      <span v-else-if="isUnconfigured" class="mp-setting-card__badge mp-setting-card__badge--warning">
        {{ t('storage.notConfigured') }}
      </span>
      <span v-else class="mp-setting-card__status mp-setting-card__status--active">
        <span class="mp-setting-card__status-dot mp-setting-card__status-dot--active" />
        {{ t('settingCard.configured') }}
      </span>
      <VIcon v-if="storage.type !== 'local'" class="mp-setting-card__chevron" icon="mdi-chevron-right" size="16" />
    </div>
  </VCard>
</template>
