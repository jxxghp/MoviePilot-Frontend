<script lang="ts" setup>
import { useToast } from 'vue-toast-notification'
import api from '@/api'
import draggable from 'vuedraggable'
import type { NotificationConf } from '@/api/types'
import NotificationChannelCard from '@/components/cards/NotificationChannelCard.vue'

// 所有消息渠道
const notifications = ref<NotificationConf[]>([])

// 提示框
const $toast = useToast()

// 添加媒体服务器
function addNotification(notification: string) {
  notifications.value.push({
    name: `通知${notifications.value.length + 1}`,
    type: notification,
    enabled: false,
  })
}

// 移除媒体服务器
function removeNotification(notification: NotificationConf) {
  const index = notifications.value.indexOf(notification)
  if (index > -1) notifications.value.splice(index, 1)
}

// 调用API查询通知设置
async function loadNotificationSetting() {
  try {
    const result: { [key: string]: any } = await api.get('system/setting/Notifications')
    notifications.value = result.data?.value ?? []
  } catch (error) {
    console.log(error)
  }
}

// 调用API保存通知设置
async function saveNotificationSetting() {
  try {
    const result: { [key: string]: any } = await api.post('system/setting/Notifications', notifications.value)
    if (result.success) $toast.success('通知设置保存成功')
    else $toast.error('通知设置保存失败！')
  } catch (error) {
    console.log(error)
  }
}

// 加载数据
onMounted(() => {
  loadNotificationSetting()
})
</script>

<template>
  <VRow>
    <VCol cols="12">
      <VCard>
        <VCardItem>
          <VCardTitle>通知渠道</VCardTitle>
          <VCardSubtitle>设置消息发送渠道参数。</VCardSubtitle>
        </VCardItem>
        <VCardText>
          <draggable
            v-model="notifications"
            handle=".cursor-move"
            item-key="name"
            tag="div"
            :component-data="{ 'class': 'grid gap-3 grid-app-card' }"
          >
            <template #item="{ element }">
              <NotificationChannelCard :notification="element" @close="removeNotification(element)" />
            </template>
          </draggable>
        </VCardText>
        <VCardText>
          <VForm @submit.prevent="() => {}">
            <div class="d-flex flex-wrap gap-4 mt-4">
              <VBtn mtype="submit" @click="saveNotificationSetting"> 保存 </VBtn>
              <VBtn color="success" variant="tonal" @click="">
                <VIcon icon="mdi-plus" />
                <VMenu activator="parent" close-on-content-click>
                  <VList>
                    <VListItem variant="plain" @click="addNotification('wechat')">
                      <VListItemTitle>微信</VListItemTitle>
                    </VListItem>
                    <VListItem variant="plain" @click="addNotification('telegram')">
                      <VListItemTitle>Telegram</VListItemTitle>
                    </VListItem>
                    <VListItem variant="plain" @click="addNotification('slack')">
                      <VListItemTitle>Slack</VListItemTitle>
                    </VListItem>
                    <VListItem variant="plain" @click="addNotification('synologychat')">
                      <VListItemTitle>SynologyChat</VListItemTitle>
                    </VListItem>
                    <VListItem variant="plain" @click="addNotification('vocechat')">
                      <VListItemTitle>VoceChat</VListItemTitle>
                    </VListItem>
                    <VListItem variant="plain" @click="addNotification('webpush')">
                      <VListItemTitle>WebPush</VListItemTitle>
                    </VListItem>
                  </VList>
                </VMenu>
              </VBtn>
            </div>
          </VForm>
        </VCardText>
      </VCard>
    </VCol>
  </VRow>
  <VRow>
    <VCol cols="12">
      <VCard>
        <VCardItem>
          <VCardTitle>通知发送范围</VCardTitle>
          <VCardSubtitle>对应消息类型只会发送给设定的用户。</VCardSubtitle>
        </VCardItem>

        <VCardText>
          <VForm @submit.prevent="() => {}">
            <div class="d-flex flex-wrap gap-4 mt-4">
              <VBtn mtype="submit" @click=""> 保存 </VBtn>
            </div>
          </VForm>
        </VCardText>
      </VCard>
    </VCol>
  </VRow>
</template>
