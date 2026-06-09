<script setup lang="ts">
import api from '@/api'
import { NotificationConf } from '@/api/types'
import { Handle, Position } from '@vue-flow/core'
import { useI18n } from 'vue-i18n'
import { useUserStore } from '@/stores'
import { buildUserPermissionContext, hasPermission } from '@/utils/permission'

const { t } = useI18n()
const userStore = useUserStore()
const canAdmin = computed(() =>
  hasPermission(buildUserPermissionContext(userStore.superUser, userStore.permissions), 'admin'),
)

defineProps({
  id: {
    type: String,
    required: true,
  },
  data: {
    type: Object,
    required: true,
  },
})

// 所有消息渠道
const notifications = ref<NotificationConf[]>([])

// 调用API查询通知渠道设置
async function loadNotificationSetting() {
  if (!canAdmin.value) return

  try {
    const result: { [key: string]: any } = await api.get('system/setting/Notifications')
    notifications.value = result.data?.value ?? []
  } catch (error) {
    console.log(error)
  }
}

// 计算消息渠道选项
const sourceOptions = computed(() => {
  return notifications.value.map(item => {
    return {
      title: item.name,
      value: item.name,
    }
  })
})

onMounted(() => {
  loadNotificationSetting()
})
</script>
<template>
  <div>
    <VCard max-width="20rem">
      <Handle id="edge_in" type="target" :position="Position.Left" />
      <VCardItem>
        <template v-slot:prepend>
          <VAvatar>
            <VIcon icon="mdi-message-arrow-right" size="x-large"></VIcon>
          </VAvatar>
        </template>
        <VCardTitle>{{ t('workflow.sendMessage.title') }}</VCardTitle>
        <VCardSubtitle>{{ t('workflow.sendMessage.subtitle') }}</VCardSubtitle>
      </VCardItem>
      <VDivider />
      <VCardText>
        <VRow>
          <VCol cols="12">
            <VSelect
              v-model="data.client"
              :items="sourceOptions"
              :label="t('workflow.sendMessage.channel')"
              chips
              multiple
              outlined
              dense
              clearable
            />
          </VCol>
          <VCol cols="12">
            <VTextField
              v-model="data.userid"
              :label="t('workflow.sendMessage.userId')"
              chips
              multiple
              outlined
              dense
              clearable
            />
          </VCol>
        </VRow>
      </VCardText>
      <Handle id="edge_out" type="source" :position="Position.Right" />
    </VCard>
  </div>
</template>
