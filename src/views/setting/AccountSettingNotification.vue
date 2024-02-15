<script lang="ts" setup>
import { useToast } from 'vue-toast-notification'
import api from '@/api'
import type { NotificationSwitch } from '@/api/types'

const messagemTypes = ref<NotificationSwitch[]>([])

// 选中的消息渠道
const selectedChannels = ref([])

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
]

// 提示框
const $toast = useToast()

// 调用API查询消息开关
async function loadNotificationSwitchs() {
  try {
    const result: NotificationSwitch[] = await api.get('message/switchs')

    messagemTypes.value = result
  }
  catch (error) {
    console.log(error)
  }
}

// 调用API保存消息开关
async function saveNotificationSwitchs() {
  try {
    const result: { [key: string]: any } = await api.post(
      'message/switchs',
      messagemTypes.value,
    )

    if (result.success)
      $toast.success('保存通知消息设置成功')
    else
      $toast.error('保存通知消息设置失败！')

    // messagemTypes.value = messagemTypes.value
  }
  catch (error) {
    console.log(error)
  }
}

// 调用API查询消息渠道设置
async function loadNotificationChannels() {
  try {
    const result: { [key: string]: any } = await api.get('system/setting/MESSAGER')
    if (result.success)
      selectedChannels.value = result.data?.value?.split(',')
  }
  catch (error) {
    console.log(error)
  }
}

// 调用API保存消息渠道设置
async function saveNotificationChannels() {
  try {
    const result: { [key: string]: any } = await api.post(
      'system/setting/MESSAGER',
      selectedChannels.value.join(','),
    )

    if (result.success)
      $toast.success('保存通知渠道设置成功')
    else
      $toast.error('保存通知渠道设置失败！')
  }
  catch (error) {
    console.log(error)
  }
}

onMounted(() => {
  loadNotificationSwitchs()
  loadNotificationChannels()
})
</script>

<template>
  <VRow>
    <VCol cols="12">
      <VCard title="通知渠道">
        <VCardSubtitle>只有选中的渠道才会发送消息。</VCardSubtitle>
        <VCardText>
          <VForm>
            <VRow>
              <VCol cols="12" md="6">
                <VSelect
                  v-model="selectedChannels"
                  multiple
                  chips
                  :items="NotificationChannels"
                  label="当前使用通知渠道"
                />
              </VCol>
            </VRow>
          </VForm>
        </VCardText>
        <VCardText>
          <VForm @submit.prevent="() => {}">
            <div class="d-flex flex-wrap gap-4 mt-4">
              <VBtn
                mtype="submit"
                @click="saveNotificationChannels"
              >
                保存
              </VBtn>
            </div>
          </VForm>
        </VCardText>
      </VCard>
    </VCol>
  </VRow>
  <VRow>
    <VCol cols="12">
      <VCard title="消息类型">
        <VCardSubtitle> 对应消息类型只会发送给选中的消息渠道。 </VCardSubtitle>
        <VTable class="text-no-wrap">
          <thead>
            <tr>
              <th scope="col">
                消息类型
              </th>
              <th scope="col">
                微信
              </th>
              <th scope="col">
                Telegram
              </th>
              <th scope="col">
                Slack
              </th>
              <th scope="col">
                SynologyChat
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="message in messagemTypes"
              :key="message.mtype"
            >
              <td>
                {{ message.mtype }}
              </td>
              <td>
                <VCheckbox v-model="message.wechat" />
              </td>
              <td>
                <VCheckbox v-model="message.telegram" />
              </td>
              <td>
                <VCheckbox v-model="message.slack" />
              </td>
              <td>
                <VCheckbox v-model="message.synologychat" />
              </td>
            </tr>
            <tr v-if="messagemTypes.length === 0">
              <td
                colspan="4"
                class="text-center"
              >
                没有设置任何通知渠道
              </td>
            </tr>
          </tbody>
        </VTable>
        <VDivider />

        <VCardText>
          <VForm @submit.prevent="() => {}">
            <div class="d-flex flex-wrap gap-4 mt-4">
              <VBtn
                mtype="submit"
                @click="saveNotificationSwitchs"
              >
                保存
              </VBtn>
            </div>
          </VForm>
        </VCardText>
      </VCard>
    </VCol>
  </VRow>
</template>
