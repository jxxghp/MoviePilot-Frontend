<script setup lang="ts">
import type { NotificationConf } from '@/api/types'
import { getLogoUrl } from '@/utils/imageUtils'
import { useI18n } from 'vue-i18n'
import { openSharedDialog } from '@/composables/useSharedDialog'
import { useCardAccentColor } from '@/composables/useCardAccentColor'

const NotificationChannelInfoDialog = defineAsyncComponent(
  () => import('@/components/dialog/NotificationChannelInfoDialog.vue'),
)

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
  dingtalk: t('notification.dingtalk.name'),
  webpush: t('notification.webpush.name'),
  apppush: t('notification.apppush.name'),
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

// 根据通知渠道类型选择图标，App 私有推送使用 MoviePilot 品牌标志。
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
    case 'dingtalk':
      return getLogoUrl('dingtalk')
    case 'webpush':
      return getLogoUrl('chrome')
    case 'apppush':
      return getLogoUrl('apppush')
    default:
      return getLogoUrl('notification')
  }
})

/** 关闭通知渠道卡片。 */
function onClose() {
  emit('close')
}

const sceneCount = computed(() => props.notification.switchs?.length || 0)
</script>

<template>
  <VCard
    variant="flat"
    class="app-card-shell app-card-colorful mp-setting-card mp-setting-card--interactive"
    :class="{ 'mp-setting-card--inactive': !props.notification.enabled }"
    :style="{ '--app-card-accent-rgb': accentRgb }"
    @click="openNotificationInfoDialog"
  >
    <div class="mp-setting-card__header">
      <div class="mp-setting-card__icon mp-setting-card__icon--logo" aria-hidden="true">
        <VImg ref="imageRef" :src="getIcon" contain class="mp-setting-card__logo" @load="updateAccentColor" />
      </div>
      <div class="mp-setting-card__heading">
        <div class="mp-setting-card__title-row">
          <span class="mp-setting-card__title" :title="props.notification.name">{{ props.notification.name }}</span>
        </div>
        <div class="mp-setting-card__subtitle">
          <span class="mp-setting-card__subtitle-text">
            {{ notificationTypeNames[notification.type] || notification.type }}
          </span>
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
      <span
        class="mp-setting-card__status"
        :class="props.notification.enabled ? 'mp-setting-card__status--active' : 'mp-setting-card__status--inactive'"
      >
        <span
          class="mp-setting-card__status-dot"
          :class="
            props.notification.enabled ? 'mp-setting-card__status-dot--active' : 'mp-setting-card__status-dot--inactive'
          "
        />
        {{ props.notification.enabled ? t('settingCard.enabled') : t('settingCard.disabled') }}
      </span>
      <div class="flex min-w-0 items-center gap-1.5">
        <span v-if="sceneCount > 0" class="mp-setting-card__chip">
          <VIcon icon="mdi-bell-outline" size="12" class="shrink-0" />
          <span>{{ t('settingCard.notificationScenes', { count: sceneCount }) }}</span>
        </span>
        <VIcon class="mp-setting-card__chevron" icon="mdi-chevron-right" size="16" />
      </div>
    </div>
  </VCard>
</template>
