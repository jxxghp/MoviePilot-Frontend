<script lang="ts" setup>
import { useToast } from 'vue-toast-notification'
import api from '@/api'
import draggable from 'vuedraggable'
import type { NotificationConf } from '@/api/types'
import NotificationChannelCard from '@/components/cards/NotificationChannelCard.vue'

// 所有消息渠道
const notifications = ref<NotificationConf[]>([])

// 消息渠道
const NotificationChannels = [
  {
    title: '微信',
    value: 'wechat',
  },
  {
    title: 'Telegram',
    value: 'telegram',
  },
  {
    title: 'Slack',
    value: 'slack',
  },
  {
    title: 'SynologyChat',
    value: 'synologychat',
  },
  {
    title: 'VoceChat',
    value: 'vocechat',
  },
  {
    title: 'WebPush',
    value: 'webpush',
  },
]

// 提示框
const $toast = useToast()

// 加载数据
onMounted(() => {})
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
              <NotificationChannelCard notification="element" />
            </template>
          </draggable>
        </VCardText>
        <VCardText>
          <VForm @submit.prevent="() => {}">
            <div class="d-flex flex-wrap gap-4 mt-4">
              <VBtn mtype="submit" @click=""> 保存 </VBtn>
              <VBtn color="success" variant="tonal" @click="">
                <VIcon icon="mdi-plus" />
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
