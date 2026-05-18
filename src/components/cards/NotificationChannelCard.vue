<script setup lang="ts">
import type { NotificationConf } from '@/api/types'
import { getLogoUrl } from '@/utils/imageUtils'
import { useI18n } from 'vue-i18n'
import { openSharedDialog } from '@/composables/useSharedDialog'
import { useCardAccentColor } from '@/composables/useCardAccentColor'

const NotificationChannelInfoDialog = defineAsyncComponent(() => import('@/components/dialog/NotificationChannelInfoDialog.vue'))

const { t } = useI18n()
const { accentRgb, imageRef, updateAccentColor } = useCardAccentColor()

// 定义输入
const props = defineProps({
  // 单个通知
  notification: {
    type: Object as PropType<NotificationConf>,
    required: true,
  },
  // 所有通知
  notifications: {
    type: Array as PropType<NotificationConf[]>,
    required: true,
  },
})

// 定义触发的自定义事件
const emit = defineEmits(['close', 'change', 'done'])

// 各通知类型的名称字典
const notificationTypeNames: { [key: string]: string } = {
  wechat: t('notification.wechat.name'),
  feishu: t('notification.feishu.name'),
  wechatclawbot: t('notification.wechatclawbot.name'),
  telegram: t('notification.telegram.name'),
  qqbot: t('notification.qqbot.name'),
  vocechat: t('notification.vocechat.name'),
  synologychat: t('notification.synologychat.name'),
  slack: t('notification.slack.name'),
  discord: t('notification.discord.name'),
  webpush: t('notification.webpush.name'),
  custom: t('setting.notification.custom'),
}

/** 打开共享通知渠道配置弹窗。 */
function openNotificationInfoDialog() {
  openSharedDialog(
    NotificationChannelInfoDialog,
    {
      notification: props.notification,
      notifications: props.notifications,
    },
    {
      change: (...args: unknown[]) => emit('change', ...args),
      done: () => emit('done'),
    },
    { closeOn: ['close', 'update:modelValue'] },
  )
}

// 根据存储类型选择图标
const getIcon = computed(() => {
  switch (props.notification.type) {
    case 'wechat':
      return getLogoUrl('wechat')
    case 'wechatclawbot':
      return getLogoUrl('wechatclawbot')
    case 'feishu':
      return getLogoUrl('feishu')
    case 'telegram':
      return getLogoUrl('telegram')
    case 'qqbot':
      return getLogoUrl('qq')
    case 'vocechat':
      return getLogoUrl('vocechat')
    case 'synologychat':
      return getLogoUrl('synologychat')
    case 'slack':
      return getLogoUrl('slack')
    case 'discord':
      return getLogoUrl('discord')
    case 'webpush':
      return getLogoUrl('chrome')
    default:
      return getLogoUrl('notification')
  }
})

/** 关闭通知渠道卡片。 */
function onClose() {
  emit('close')
}
</script>

<template>
  <VCard
    variant="tonal"
    class="app-card-shell app-card-colorful"
    :style="{ '--app-card-accent-rgb': accentRgb }"
    @click="openNotificationInfoDialog"
  >
    <span class="app-card-top-action absolute top-3 right-12">
      <IconBtn @click.stop>
        <VIcon class="cursor-move" icon="mdi-drag" />
      </IconBtn>
    </span>
    <VDialogCloseBtn @click="onClose" />
    <VCardText class="app-card-summary app-card-summary--double-action app-card-summary--title-subtitle">
      <div class="app-card-summary__content">
        <div class="app-card-summary__title-row">
          <VBadge v-if="props.notification.enabled" dot inline color="success" class="me-1" />
          <span class="app-card-summary__title text-h6">{{ props.notification.name }}</span>
        </div>
        <div class="app-card-summary__subtitle text-body-1">{{ notificationTypeNames[notification.type] }}</div>
      </div>
      <div class="app-card-summary__media" aria-hidden="true">
        <VImg ref="imageRef" :src="getIcon" contain class="app-card-summary__image" @load="updateAccentColor" />
      </div>
    </VCardText>
  </VCard>
</template>
