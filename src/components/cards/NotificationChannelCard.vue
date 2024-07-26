<script setup lang="ts">
import { NotificationConf } from '@/api/types'
import wechat_image from '@images/logos/wechat.png'
import telegram_image from '@images/logos/telegram.webp'
import vocechat_image from '@images/logos/vocechat.png'
import synologychat_image from '@images/logos/synologychat.png'
import slack_image from '@images/logos/slack.webp'
import chrome_image from '@images/logos/chrome.png'

// 定义输入
const props = defineProps({
  notification: {
    type: Object as PropType<NotificationConf>,
    required: true,
  },
})

// 根据存储类型选择图标
const getIcon = computed(() => {
  switch (props.notification.type) {
    case 'wechat':
      return wechat_image
    case 'telegram':
      return telegram_image
    case 'vocechat':
      return vocechat_image
    case 'synologychat':
      return synologychat_image
    case 'slack':
      return slack_image
    case 'webpush':
      return chrome_image
    default:
      return wechat_image
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
        <h5 class="text-h6 mb-1">{{ notification.name }}</h5>
        <div class="text-body-1 mb-3">{{ notification.type }}</div>
      </div>
      <VImg :src="getIcon" cover class="mt-5 me-7" max-width="4rem" />
    </VCardText>
  </VCard>
</template>
