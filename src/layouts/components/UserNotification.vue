<script setup lang="ts">
import { formatDateDifference } from '@core/utils/formatters'
import { SystemNotification } from '@/api/types'
import { useI18n } from 'vue-i18n'
import { useBackground } from '@/composables/useBackground'

const { t } = useI18n()
const { useDelayedSSE } = useBackground()

// 是否有新消息
const hasNewMessage = ref(false)

// 通知列表
const notificationList = ref<SystemNotification[]>([])
const MAX_NOTIFICATIONS = 100

// 弹窗
const appsMenu = ref(false)

// 标记所有消息为已读
function markAllAsRead() {
  hasNewMessage.value = false
  // 标记所有消息为已读
  notificationList.value.forEach(item => {
    item.read = true
  })
  appsMenu.value = false
}

// 消息处理函数
function handleMessage(event: MessageEvent) {
  if (event.data) {
    const noti: SystemNotification = JSON.parse(event.data)
    notificationList.value.unshift(noti)
    if (notificationList.value.length > MAX_NOTIFICATIONS) {
      notificationList.value.length = MAX_NOTIFICATIONS
    }
    hasNewMessage.value = true
  }
}

// 延迟3秒启动SSE连接，避免认证信息尚未准备好。
useDelayedSSE(
  `${import.meta.env.VITE_API_BASE_URL}system/message`,
  handleMessage,
  'user-notification',
  3000,
  {
    backgroundCloseDelay: 5000,
    reconnectDelay: 3000,
    maxReconnectAttempts: 3
  }
)
</script>

<template>
  <VMenu
    v-model="appsMenu"
    width="400"
    transition="scale-transition"
    close-on-content-click
    class="notification-menu"
    scrim
  >
    <!-- Menu Activator -->
    <template #activator="{ props }">
      <VBadge v-if="hasNewMessage" dot color="error" :offset-x="5" :offset-y="5" v-bind="props">
        <IconBtn>
          <VIcon icon="mdi-bell-outline" />
        </IconBtn>
      </VBadge>
      <IconBtn v-else v-bind="props">
        <VIcon icon="mdi-bell-outline" />
      </IconBtn>
    </template>
    <!-- Menu Content -->
    <VCard>
      <VCardItem class="py-3">
        <VCardTitle>{{ t('notification.center') }}</VCardTitle>
        <template #append>
          <VTooltip :text="t('notification.markRead')">
            <template #activator="{ props }">
              <IconBtn v-bind="props" @click="markAllAsRead">
                <VIcon icon="mdi-email-check-outline" size="20" />
              </IconBtn>
            </template>
          </VTooltip>
        </template>
      </VCardItem>
      <VDivider />
      <div class="notification-list-container">
        <div v-if="notificationList.length > 0">
          <VListItem v-for="(item, i) in notificationList" :key="i" lines="two" class="mb-1">
            <template #prepend>
              <VAvatar rounded>
                <VIcon v-if="item.type === 'user'" icon="mdi-account-alert" size="large"></VIcon>
                <VIcon v-else-if="item.type === 'plugin'" icon="mdi-robot" size="large"></VIcon>
                <VIcon v-else icon="mdi-laptop" size="large"></VIcon>
              </VAvatar>
            </template>
            <div>
              <div class="text-body-1 text-high-emphasis break-words whitespace-break-spaces">
                {{ item.title }}
              </div>
              <div class="text-caption mt-1.5">
                {{ item.text }}
              </div>
              <div class="text-sm text-primary mt-1.5">
                {{ formatDateDifference(item.date) }}
              </div>
            </div>
          </VListItem>
        </div>
        <div v-else class="py-8 text-center">
          <VIcon icon="mdi-bell-sleep-outline" size="40" class="mb-3" />
          <div>{{ t('notification.empty') }}</div>
        </div>
      </div>
    </VCard>
  </VMenu>
</template>

<style scoped>
.notification-list-container {
  max-block-size: 50vh;
  overflow-y: auto;
  scrollbar-width: thin;
}
</style>
