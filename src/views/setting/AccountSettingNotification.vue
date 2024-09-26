<script lang="ts" setup>
import { useToast } from 'vue-toast-notification'
import api from '@/api'
import draggable from 'vuedraggable'
import type { NotificationConf, NotificationSwitchConf } from '@/api/types'
import NotificationChannelCard from '@/components/cards/NotificationChannelCard.vue'

// 所有消息渠道
const notifications = ref<NotificationConf[]>([])

// 提示框
const $toast = useToast()

// 消息类型开关
const notificationSwitchs = ref<NotificationSwitchConf[]>([
  {
    type: '资源下载',
    action: 'all',
  },
  {
    type: '整理入库',
    action: 'all',
  },
  {
    type: '订阅',
    action: 'all',
  },
  {
    type: '站点',
    action: 'admin',
  },
  {
    type: '媒体服务器',
    action: 'admin',
  },
  {
    type: '手动处理',
    action: 'admin',
  },
  {
    type: '插件',
    action: 'admin',
  },
  {
    type: '其它',
    action: 'admin',
  },
])

// 重载系统生效配置
async function reloadSystem() {
  try {
    const result: { [key: string]: any } = await api.get('system/reload')
    if (result.success) $toast.success('系统配置已生效')
    else $toast.error('重载系统失败！')
  } catch (error) {
    console.log(error)
  }
}

// 添加媒体服务器
function addNotification(notification: string) {
  let name = `通知${notifications.value.length + 1}`;
  while (notifications.value.some(item => item.name === name)) {
    name = `通知${parseInt(name.split('通知')[1]) + 1}`;
  }
  notifications.value.push({
    name: name,
    type: notification,
    enabled: false,
    config: {},
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
    if (result.success) {
      $toast.success('通知设置保存成功')
      await reloadSystem()
    } else $toast.error('通知设置保存失败！')
  } catch (error) {
    console.log(error)
  }
}

// 加载消息类型开关
async function loadNotificationSwitchs() {
  try {
    const result: { [key: string]: any } = await api.get('system/setting/NotificationSwitchs')
    if (result.data?.value && result.data?.value.length > 0) notificationSwitchs.value = result.data?.value
  } catch (error) {
    console.log(error)
  }
}

// 保存消息类型开关
async function saveNotificationSwitchs() {
  try {
    const result: { [key: string]: any } = await api.post(
      'system/setting/NotificationSwitchs',
      notificationSwitchs.value,
    )
    if (result.success) $toast.success('消息类型开关保存成功')
    else $toast.error('消息类型开关保存失败！')
  } catch (error) {
    console.log(error)
  }
}

// 加载数据
onMounted(() => {
  loadNotificationSetting()
  loadNotificationSwitchs()
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
              <NotificationChannelCard
                :notification="element"
                :notifications="notifications"
                @close="removeNotification(element)"
              />
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
        <VTable class="text-no-wrap">
          <thead>
            <tr>
              <th scope="col">消息类型</th>
              <th scope="col">范围</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(item, index) in notificationSwitchs" :key="index">
              <td>
                {{ item.type }}
              </td>
              <td>
                <VRadioGroup v-model="item.action" inline>
                  <VRadio value="user" label="仅操作用户" />
                  <VRadio value="admin" label="仅管理员" />
                  <VRadio value="all" label="所有用户" />
                </VRadioGroup>
              </td>
            </tr>
          </tbody>
        </VTable>
        <VDivider />
        <VCardText>
          <VForm @submit.prevent="() => {}">
            <div class="d-flex flex-wrap gap-4 mt-4">
              <VBtn mtype="submit" @click="saveNotificationSwitchs"> 保存 </VBtn>
            </div>
          </VForm>
        </VCardText>
      </VCard>
    </VCol>
  </VRow>
</template>
