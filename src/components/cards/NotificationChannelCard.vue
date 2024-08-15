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

// 定义触发的自定义事件
const emit = defineEmits(['close', 'change'])

// 通知详情弹窗
const notificationInfoDialog = ref(false)

// 通知名称
const notificationName = ref('')

// 通知详情
const notificationInfo = ref<NotificationConf>({
  name: '',
  type: '',
  enabled: false,
  config: {},
})

// 各通知类型的名称字典
const notificationTypeNames: { [key: string]: string } = {
  wechat: '企业微信',
  telegram: 'Telegram',
  vocechat: 'VoceChat',
  synologychat: 'Synology Chat',
  slack: 'Slack',
  webpush: 'WebPush',
}

// 消息类型下拉字典
const notificationTypes = [
  { value: '资源下载', title: '资源下载' },
  { value: '整理入库', title: '整理入库' },
  { value: '订阅', title: '订阅' },
  { value: '站点', title: '站点' },
  { value: '媒体服务器', title: '媒体服务器' },
  { value: '手动处理', title: '手动处理' },
  { value: '插件', title: '插件' },
  { value: '其它', title: '其它' },
]

// 打开详情弹窗
function openNotificationInfoDialog() {
  notificationInfo.value = props.notification
  notificationName.value = props.notification.name
  notificationInfoDialog.value = true
}

// 保存详情数据
function saveNotificationInfo() {
  notificationInfoDialog.value = false
  notificationInfo.value.name = notificationName.value
  emit('change', notificationInfo.value)
}

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

// 按钮点击
function onClose() {
  emit('close')
}
</script>
<template>
  <div>
    <VCard variant="tonal" @click="openNotificationInfoDialog">
      <DialogCloseBtn @click="onClose" />
      <VCardText class="flex justify-space-between align-center gap-3">
        <div class="align-self-start">
          <div class="flex items-center">
            <VBadge v-if="props.notification.enabled" dot inline color="success" class="me-1" />
            <span class="text-h6">{{ props.notification.name }}</span>
          </div>
          <div class="text-body-1 mb-3">{{ notificationTypeNames[notification.type] }}</div>
        </div>
        <VImg :src="getIcon" cover class="mt-5 me-7" max-width="3rem" />
      </VCardText>
    </VCard>
    <VDialog v-model="notificationInfoDialog" scrollable max-width="40rem">
      <VCard :title="`${props.notification.name} - 配置`" class="rounded-t">
        <DialogCloseBtn v-model="notificationInfoDialog" />
        <VDivider />
        <VCardText>
          <VForm>
            <VRow>
              <VCol cols="12" md="6">
                <VSwitch v-model="notificationInfo.enabled" label="启用通知" />
              </VCol>
              <VCol cols="12">
                <VSelect
                  v-model="notificationInfo.switchs"
                  :items="notificationTypes"
                  label="消息类型"
                  hint="开启通知的消息类型"
                  multiple
                  chips
                  persistent-hint
                />
              </VCol>
            </VRow>
            <VRow v-if="notificationInfo.type == 'wechat'">
              <VCol cols="12" md="6">
                <VTextField
                  v-model="notificationName"
                  label="名称"
                  placeholder="别名"
                  hint="通知渠道的别名"
                  persistent-hint
                />
              </VCol>
              <VCol cols="12" md="6">
                <VTextField
                  v-model="notificationInfo.config.WECHAT_CORPID"
                  label="企业ID"
                  hint="企业微信后台企业信息中的企业ID"
                  persistent-hint
                />
              </VCol>
              <VCol cols="12" md="6">
                <VTextField
                  v-model="notificationInfo.config.WECHAT_APP_ID"
                  label="应用 AgentId"
                  hint="企业微信自建应用的AgentId"
                  persistent-hint
                />
              </VCol>
              <VCol cols="12" md="6">
                <VTextField
                  v-model="notificationInfo.config.WECHAT_APP_SECRET"
                  label="应用 Secret"
                  hint="企业微信自建应用的Secret"
                  persistent-hint
                />
              </VCol>
              <VCol cols="12" md="6">
                <VTextField
                  v-model="notificationInfo.config.WECHAT_PROXY"
                  label="代理地址"
                  hint="微信消息的转发代理地址，2022年6月20日后创建的自建应用才需要，不使用代理时需要保留默认值"
                  persistent-hint
                />
              </VCol>
              <VCol cols="12" md="6">
                <VTextField
                  v-model="notificationInfo.config.WECHAT_TOKEN"
                  label="Token"
                  hint="微信企业自建应用->API接收消息配置中的Token"
                  persistent-hint
                />
              </VCol>
              <VCol cols="12" md="6">
                <VTextField
                  v-model="notificationInfo.config.WECHAT_ENCODING_AESKEY"
                  label="EncodingAESKey"
                  hint="微信企业自建应用->API接收消息配置中的EncodingAESKey"
                  persistent-hint
                />
              </VCol>
              <VCol cols="12" md="6">
                <VTextField
                  v-model="notificationInfo.config.WECHAT_ADMINS"
                  label="管理员白名单"
                  placeholder="多个用,分隔"
                  hint="可使用管理菜单及命令的用户ID列表，多个ID使用,分隔"
                  persistent-hint
                />
              </VCol>
            </VRow>
            <VRow v-if="notificationInfo.type == 'telegram'">
              <VCol cols="12" md="6">
                <VTextField
                  v-model="notificationName"
                  label="名称"
                  placeholder="别名"
                  hint="通知渠道的别名"
                  persistent-hint
                />
              </VCol>
              <VCol cols="12" md="6">
                <VTextField
                  v-model="notificationInfo.config.TELEGRAM_TOKEN"
                  label="Bot Token"
                  hint="Telegram机器人token，格式：123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11"
                  persistent-hint
                />
              </VCol>
              <VCol cols="12" md="6">
                <VTextField
                  v-model="notificationInfo.config.TELEGRAM_CHAT_ID"
                  label="Chat ID"
                  hint="接受消息通知的用户、群组或频道Chat ID"
                  persistent-hint
                />
              </VCol>
              <VCol cols="12" md="6">
                <VTextField
                  v-model="notificationInfo.config.TELEGRAM_USERS"
                  label="用户白名单"
                  placeholder="多个用,分隔"
                  hint="可使用Telegram机器人的用户ID清单，多个用户用,分隔，不填写则所有用户都能使用"
                  persistent-hint
                />
              </VCol>
              <VCol cols="12" md="6">
                <VTextField
                  v-model="notificationInfo.config.TELEGRAM_ADMINS"
                  label="管理员白名单"
                  placeholder="多个用,分隔"
                  hint="可使用管理菜单及命令的用户ID列表，多个ID使用,分隔"
                  persistent-hint
                />
              </VCol>
            </VRow>
            <VRow v-if="notificationInfo.type == 'slack'">
              <VCol cols="12" md="6">
                <VTextField
                  v-model="notificationName"
                  label="名称"
                  placeholder="别名"
                  hint="通知渠道的别名"
                  persistent-hint
                />
              </VCol>
              <VCol cols="12" md="6">
                <VTextField
                  v-model="notificationInfo.config.SLACK_OAUTH_TOKEN"
                  label="Slack Bot User OAuth Token"
                  placeholder="xoxb-xxxxxxxxxxxx-xxxxxxxxxxxxxxxxxxxxxxxx"
                  hint="Slack应用`OAuth & Permissions`页面中的`Bot User OAuth Token`"
                  persistent-hint
                />
              </VCol>
              <VCol cols="12" md="6">
                <VTextField
                  v-model="notificationInfo.config.SLACK_APP_TOKEN"
                  label="Slack App-Level Token"
                  placeholder="xapp-xxxxxxxxxxxx-xxxxxxxxxxxxxxxxxxxxxxxx"
                  hint="Slack应用`OAuth & Permissions`页面中的`App-Level Token`"
                  persistent-hint
                />
              </VCol>
              <VCol cols="12" md="6">
                <VTextField
                  v-model="notificationInfo.config.SLACK_CHANNEL"
                  label="频道名称"
                  placeholder="全体"
                  hint="消息发送频道，默认`全体`"
                  persistent-hint
                />
              </VCol>
            </VRow>
            <VRow v-if="notificationInfo.type == 'synologychat'">
              <VCol cols="12" md="6">
                <VTextField
                  v-model="notificationName"
                  label="名称"
                  placeholder="别名"
                  hint="通知渠道的别名"
                  persistent-hint
                />
              </VCol>
              <VCol cols="12" md="6">
                <VTextField
                  v-model="notificationInfo.config.SYNOLOGYCHAT_WEBHOOK"
                  label="机器人传入URL"
                  hint="Synology Chat机器人传入URL"
                  persistent-hint
                />
              </VCol>
              <VCol cols="12" md="6">
                <VTextField
                  v-model="notificationInfo.config.SYNOLOGYCHAT_TOKEN"
                  label="令牌"
                  hint="Synology Chat机器人令牌"
                  persistent-hint
                />
              </VCol>
            </VRow>
            <VRow v-if="notificationInfo.type == 'vocechat'">
              <VCol cols="12" md="6">
                <VTextField
                  v-model="notificationName"
                  label="名称"
                  placeholder="别名"
                  hint="通知渠道的别名"
                  persistent-hint
                />
              </VCol>
              <VCol cols="12" md="6">
                <VTextField
                  v-model="notificationInfo.config.VOCECHAT_HOST"
                  label="地址"
                  hint="VoceChat服务端地址，格式：http(s)://ip:port"
                  persistent-hint
                />
              </VCol>
              <VCol cols="12" md="6">
                <VTextField
                  v-model="notificationInfo.config.VOCECHAT_API_KEY"
                  label="机器人密钥"
                  hint="VoceChat机器人密钥"
                  persistent-hint
                />
              </VCol>
              <VCol cols="12" md="6">
                <VTextField
                  v-model="notificationInfo.config.VOCECHAT_CHANNEL_ID"
                  label="频道ID"
                  placeholder="不包含#号"
                  hint="VoceChat的频道ID，不包含#号"
                  persistent-hint
                />
              </VCol>
            </VRow>
            <VRow v-if="notificationInfo.type == 'webpush'">
              <VCol cols="12" md="6">
                <VTextField
                  v-model="notificationName"
                  label="名称"
                  placeholder="别名"
                  hint="通知渠道的别名"
                  persistent-hint
                />
              </VCol>
              <VCol cols="12" md="6">
                <VTextField
                  v-model="notificationInfo.config.WEBPUSH_USERNAME"
                  label="登录用户名"
                  hint="只有对应的用户登录后才会推送消息"
                  persistent-hint
                />
              </VCol>
            </VRow>
          </VForm>
        </VCardText>
        <VCardActions class="pt-3">
          <VBtn @click="saveNotificationInfo" variant="elevated" prepend-icon="mdi-content-save" class="px-5">
            确定
          </VBtn>
        </VCardActions>
      </VCard>
    </VDialog>
  </div>
</template>
