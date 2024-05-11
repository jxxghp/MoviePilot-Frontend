<script setup lang="ts">
import store from '@/store'
import { formatDateDifference } from '@core/utils/formatters'
import { SystemNotification } from '@/api/types'

// 是否有新消息
const hasNewMessage = ref(false)

// 通知列表
const notificationList = ref<SystemNotification[]>([])

// 事件源
let eventSource: EventSource | null = null

// 弹窗
const appsMenu = ref(false)

// SSE持续接收消息
function startSSEMessager() {
  const token = store.state.auth.token
  if (token) {
    eventSource = new EventSource(`${import.meta.env.VITE_API_BASE_URL}system/message?token=${token}`)
    eventSource.addEventListener('message', event => {
      if (event.data) {
        const noti: SystemNotification = JSON.parse(event.data)
        notificationList.value.unshift(noti)
        hasNewMessage.value = true
        // TODO 在顶部显示消息汽泡
      }
    })
  }
}

// 页面加载时，加载当前用户数据
onBeforeMount(async () => {
  startSSEMessager()
})

// 页面卸载时，关闭事件源
onBeforeUnmount(() => {
  if (eventSource) eventSource.close()
})
</script>
<template>
  <VMenu v-model="appsMenu" width="400" transition="scale-transition" close-on-content-click>
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
      <VCardItem class="border-b">
        <VCardTitle>通知</VCardTitle>
        <template #append>
          <VTooltip text="设为已读">
            <template #activator="{ props }">
              <IconBtn
                v-bind="props"
                @click="
                  () => {
                    hasNewMessage = false
                    appsMenu = false
                  }
                "
              >
                <VIcon icon="mdi-email-mark-as-unread" />
              </IconBtn>
            </template>
          </VTooltip>
        </template>
      </VCardItem>
      <VList lines="two" v-if="notificationList.length > 0" max-height="600">
        <VListItem v-for="(item, i) in notificationList" :key="i">
          <template #prepend>
            <VAvatar rounded>
              <VIcon v-if="item.type === 'user'" icon="mdi-account-alert" size="large"></VIcon>
              <VIcon v-else-if="item.type === 'plugin'" icon="mdi-robot-happy" size="large"></VIcon>
              <VIcon v-else icon="mdi-laptop" size="large"></VIcon>
            </VAvatar>
          </template>
          <VListItemTitle class="overflow-visiable break-words whitespace-break-spaces">
            {{ item.title }}
          </VListItemTitle>
          <VListItemSubtitle class="mt-2">{{ item.text }}</VListItemSubtitle>
          <VListItemSubtitle class="mt-2">{{ formatDateDifference(item.date) }}</VListItemSubtitle>
        </VListItem>
      </VList>
      <VList v-else>
        <VListItem>
          <VListItemTitle class="text-center">暂无通知</VListItemTitle>
        </VListItem>
      </VList>
    </VCard>
  </VMenu>
</template>
