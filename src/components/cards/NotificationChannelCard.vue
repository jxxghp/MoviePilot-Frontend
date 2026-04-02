<script setup lang="ts">
import { NotificationConf } from '@/api/types'
import { getLogoUrl } from '@/utils/imageUtils'
import { useToast } from 'vue-toastification'
import { cloneDeep } from 'lodash-es'
import { useI18n } from 'vue-i18n'
import { useDisplay } from 'vuetify'

// 显示器宽度
const display = useDisplay()

const { t } = useI18n()

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

// 提示框
const $toast = useToast()

// 通知详情弹窗
const notificationInfoDialog = ref(false)

// 通知详情
const notificationInfo = ref<NotificationConf>({
  name: '',
  type: '',
  enabled: false,
  config: {},
})

// 各通知类型的名称字典
const notificationTypeNames: { [key: string]: string } = {
  wechat: t('notification.wechat.name'),
  telegram: t('notification.telegram.name'),
  qqbot: t('notification.qqbot.name'),
  vocechat: t('notification.vocechat.name'),
  synologychat: t('notification.synologychat.name'),
  slack: t('notification.slack.name'),
  discord: t('notification.discord.name'),
  webpush: t('notification.webpush.name'),
  custom: t('setting.notification.custom'),
}

// 消息类型下拉字典
const notificationTypes = [
  { value: '资源下载', title: t('notificationSwitch.resourceDownload') },
  { value: '整理入库', title: t('notificationSwitch.organize') },
  { value: '订阅', title: t('notificationSwitch.subscribe') },
  { value: '站点', title: t('notificationSwitch.site') },
  { value: '媒体服务器', title: t('notificationSwitch.mediaServer') },
  { value: '手动处理', title: t('notificationSwitch.manual') },
  { value: '插件', title: t('notificationSwitch.plugin') },
  { value: '智能体', title: t('notificationSwitch.agent') },
  { value: '其它', title: t('notificationSwitch.other') },
]

function ensureWechatConfigDefaults(notification: NotificationConf) {
  if (notification.type !== 'wechat') {
    return
  }
  if (!notification.config) {
    notification.config = {}
  }
  if (!notification.config.WECHAT_MODE) {
    notification.config.WECHAT_MODE = 'app'
  }
  if (!notification.config.WECHAT_BOT_WS_URL) {
    notification.config.WECHAT_BOT_WS_URL = 'wss://openws.work.weixin.qq.com'
  }
}

const isWechatBotMode = computed({
  get: () => notificationInfo.value.config?.WECHAT_MODE === 'bot',
  set: value => {
    if (!notificationInfo.value.config) {
      notificationInfo.value.config = {}
    }
    notificationInfo.value.config.WECHAT_MODE = value ? 'bot' : 'app'
    if (value && !notificationInfo.value.config.WECHAT_BOT_WS_URL) {
      notificationInfo.value.config.WECHAT_BOT_WS_URL = 'wss://openws.work.weixin.qq.com'
    }
  },
})

// 打开详情弹窗
function openNotificationInfoDialog() {
  // 替换成深复制，避免修改时影响原数据
  notificationInfo.value = cloneDeep(props.notification)
  ensureWechatConfigDefaults(notificationInfo.value)
  notificationInfoDialog.value = true
}

// 保存详情数据
function saveNotificationInfo() {
  // 为空不保存，跳出警告框
  if (!notificationInfo.value.name) {
    $toast.error(t('notification.name') + t('common.required'))
    return
  }
  // 重名判断
  if (props.notifications.some(item => item.name === notificationInfo.value.name && item !== props.notification)) {
    $toast.error(t('notification.channel') + `【${notificationInfo.value.name}】` + t('common.exists'))
    return
  }
  ensureWechatConfigDefaults(notificationInfo.value)
  notificationInfoDialog.value = false
  emit('change', notificationInfo.value, props.notification.name)
  emit('done')
}

// 根据存储类型选择图标
const getIcon = computed(() => {
  switch (props.notification.type) {
    case 'wechat':
      return getLogoUrl('wechat')
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
    case 'webpush':
      return getLogoUrl('chrome')
    default:
      return getLogoUrl('notification')
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
      <span class="absolute top-3 right-12">
        <IconBtn>
          <VIcon class="cursor-move" icon="mdi-drag" />
        </IconBtn>
      </span>
      <VDialogCloseBtn @click="onClose" />
      <VCardText class="flex justify-space-between align-center gap-3">
        <div class="align-self-start">
          <div class="flex items-center">
            <VBadge v-if="props.notification.enabled" dot inline color="success" class="me-1" />
            <span class="text-h6">{{ props.notification.name }}</span>
          </div>
          <div class="text-body-1 mb-3">{{ notificationTypeNames[notification.type] }}</div>
        </div>
        <VImg :src="getIcon" cover class="mt-7 me-1" max-width="3rem" />
      </VCardText>
    </VCard>

    <VDialog
      v-if="notificationInfoDialog"
      v-model="notificationInfoDialog"
      scrollable
      max-width="40rem"
      :fullscreen="!display.mdAndUp.value"
    >
      <VCard>
        <VCardItem class="py-2">
          <template #prepend>
            <VIcon icon="mdi-cog" class="me-2" />
          </template>
          <VCardTitle>{{ t('common.config') }}</VCardTitle>
          <VCardSubtitle>{{ props.notification.name }}</VCardSubtitle>
        </VCardItem>
        <VDialogCloseBtn @click="notificationInfoDialog = false" />
        <VDivider />
        <VCardText>
          <VForm>
            <VRow>
              <VCol cols="12" md="6">
                <VSwitch v-model="notificationInfo.enabled" :label="t('notification.enabled')" />
              </VCol>
              <VCol cols="12">
                <VAutocomplete
                  v-model="notificationInfo.switchs"
                  :items="notificationTypes"
                  :label="t('notification.type')"
                  :hint="t('notification.typeHint')"
                  multiple
                  clearable
                  chips
                  persistent-hint
                  prepend-inner-icon="mdi-bell-outline"
                />
              </VCol>
            </VRow>
            <VRow v-if="notificationInfo.type == 'wechat'">
              <VCol cols="12" md="6">
                <VTextField
                  v-model="notificationInfo.name"
                  :label="t('notification.name')"
                  :placeholder="t('notification.name')"
                  :hint="t('notification.nameHint')"
                  persistent-hint
                  prepend-inner-icon="mdi-label"
                />
              </VCol>
              <VCol cols="12" md="6">
                <VSwitch
                  v-model="isWechatBotMode"
                  :label="t('notification.wechat.useBotMode')"
                  :hint="t('notification.wechat.useBotModeHint')"
                  persistent-hint
                  color="primary"
                />
              </VCol>
              <template v-if="isWechatBotMode">
                <VCol cols="12" md="6">
                  <VTextField
                    v-model="notificationInfo.config.WECHAT_BOT_ID"
                    :label="t('notification.wechat.botId')"
                    :hint="t('notification.wechat.botIdHint')"
                    persistent-hint
                    prepend-inner-icon="mdi-robot"
                  />
                </VCol>
                <VCol cols="12" md="6">
                  <VTextField
                    v-model="notificationInfo.config.WECHAT_BOT_SECRET"
                    :label="t('notification.wechat.botSecret')"
                    :hint="t('notification.wechat.botSecretHint')"
                    persistent-hint
                    prepend-inner-icon="mdi-key"
                  />
                </VCol>
                <VCol cols="12" md="6">
                  <VTextField
                    v-model="notificationInfo.config.WECHAT_BOT_CHAT_ID"
                    :label="t('notification.wechat.botChatId')"
                    :placeholder="t('notification.wechat.botChatIdPlaceholder')"
                    :hint="t('notification.wechat.botChatIdHint')"
                    persistent-hint
                    prepend-inner-icon="mdi-chat-processing"
                  />
                </VCol>
                <VCol cols="12" md="6">
                  <VTextField
                    v-model="notificationInfo.config.WECHAT_BOT_WS_URL"
                    :label="t('notification.wechat.botWsUrl')"
                    :hint="t('notification.wechat.botWsUrlHint')"
                    persistent-hint
                    prepend-inner-icon="mdi-lan-connect"
                  />
                </VCol>
                <VCol cols="12" md="6">
                  <VTextField
                    v-model="notificationInfo.config.WECHAT_ADMINS"
                    :label="t('notification.wechat.admins')"
                    :placeholder="t('notification.wechat.adminsPlaceholder')"
                    :hint="t('notification.wechat.adminsHint')"
                    persistent-hint
                    prepend-inner-icon="mdi-account-supervisor"
                  />
                </VCol>
              </template>
              <template v-else>
                <VCol cols="12" md="6">
                  <VTextField
                    v-model="notificationInfo.config.WECHAT_CORPID"
                    :label="t('notification.wechat.corpId')"
                    :hint="t('notification.wechat.corpIdHint')"
                    persistent-hint
                    prepend-inner-icon="mdi-domain"
                  />
                </VCol>
                <VCol cols="12" md="6">
                  <VTextField
                    v-model="notificationInfo.config.WECHAT_APP_ID"
                    :label="t('notification.wechat.appId')"
                    :hint="t('notification.wechat.appIdHint')"
                    persistent-hint
                    prepend-inner-icon="mdi-application"
                  />
                </VCol>
                <VCol cols="12" md="6">
                  <VTextField
                    v-model="notificationInfo.config.WECHAT_APP_SECRET"
                    :label="t('notification.wechat.appSecret')"
                    :hint="t('notification.wechat.appSecretHint')"
                    persistent-hint
                    prepend-inner-icon="mdi-key"
                  />
                </VCol>
                <VCol cols="12" md="6">
                  <VTextField
                    v-model="notificationInfo.config.WECHAT_PROXY"
                    :label="t('notification.wechat.proxy')"
                    :hint="t('notification.wechat.proxyHint')"
                    persistent-hint
                    prepend-inner-icon="mdi-server-network"
                  />
                </VCol>
                <VCol cols="12" md="6">
                  <VTextField
                    v-model="notificationInfo.config.WECHAT_TOKEN"
                    :label="t('notification.wechat.token')"
                    :hint="t('notification.wechat.tokenHint')"
                    persistent-hint
                    prepend-inner-icon="mdi-key-variant"
                  />
                </VCol>
                <VCol cols="12" md="6">
                  <VTextField
                    v-model="notificationInfo.config.WECHAT_ENCODING_AESKEY"
                    :label="t('notification.wechat.encodingAesKey')"
                    :hint="t('notification.wechat.encodingAesKeyHint')"
                    persistent-hint
                    prepend-inner-icon="mdi-lock"
                  />
                </VCol>
                <VCol cols="12" md="6">
                  <VTextField
                    v-model="notificationInfo.config.WECHAT_ADMINS"
                    :label="t('notification.wechat.admins')"
                    :placeholder="t('notification.wechat.adminsPlaceholder')"
                    :hint="t('notification.wechat.adminsHint')"
                    persistent-hint
                    prepend-inner-icon="mdi-account-supervisor"
                  />
                </VCol>
              </template>
            </VRow>
            <VRow v-else-if="notificationInfo.type == 'telegram'">
              <VCol cols="12" md="6">
                <VTextField
                  v-model="notificationInfo.name"
                  :label="t('notification.name')"
                  :placeholder="t('notification.name')"
                  :hint="t('notification.nameHint')"
                  persistent-hint
                  prepend-inner-icon="mdi-label"
                />
              </VCol>
              <VCol cols="12" md="6">
                <VTextField
                  v-model="notificationInfo.config.TELEGRAM_TOKEN"
                  :label="t('notification.telegram.token')"
                  :hint="t('notification.telegram.tokenHint')"
                  persistent-hint
                  prepend-inner-icon="mdi-key"
                />
              </VCol>
              <VCol cols="12" md="6">
                <VTextField
                  v-model="notificationInfo.config.TELEGRAM_CHAT_ID"
                  :label="t('notification.telegram.chatId')"
                  :hint="t('notification.telegram.chatIdHint')"
                  persistent-hint
                  prepend-inner-icon="mdi-chat"
                />
              </VCol>
              <VCol cols="12" md="6">
                <VTextField
                  v-model="notificationInfo.config.TELEGRAM_USERS"
                  :label="t('notification.telegram.users')"
                  :placeholder="t('notification.telegram.usersPlaceholder')"
                  :hint="t('notification.telegram.usersHint')"
                  persistent-hint
                  prepend-inner-icon="mdi-account-group"
                />
              </VCol>
              <VCol cols="12" md="6">
                <VTextField
                  v-model="notificationInfo.config.TELEGRAM_ADMINS"
                  :label="t('notification.telegram.admins')"
                  :placeholder="t('notification.telegram.adminsPlaceholder')"
                  :hint="t('notification.telegram.adminsHint')"
                  persistent-hint
                  prepend-inner-icon="mdi-account-supervisor"
                />
              </VCol>
              <VCol cols="12" md="6">
                <VTextField
                  v-model="notificationInfo.config.API_URL"
                  :label="t('notification.telegram.apiUrl')"
                  :placeholder="t('notification.telegram.apiUrlPlaceholder')"
                  :hint="t('notification.telegram.apiUrlHint')"
                  persistent-hint
                  prepend-inner-icon="mdi-web"
                />
              </VCol>
            </VRow>
            <VRow v-else-if="notificationInfo.type == 'slack'">
              <VCol cols="12" md="6">
                <VTextField
                  v-model="notificationInfo.name"
                  :label="t('notification.name')"
                  :placeholder="t('notification.name')"
                  :hint="t('notification.nameHint')"
                  persistent-hint
                  prepend-inner-icon="mdi-label"
                />
              </VCol>
              <VCol cols="12" md="6">
                <VTextField
                  v-model="notificationInfo.config.SLACK_OAUTH_TOKEN"
                  :label="t('notification.slack.oauthToken')"
                  :placeholder="t('notification.slack.oauthTokenPlaceholder')"
                  :hint="t('notification.slack.oauthTokenHint')"
                  persistent-hint
                  prepend-inner-icon="mdi-key"
                />
              </VCol>
              <VCol cols="12" md="6">
                <VTextField
                  v-model="notificationInfo.config.SLACK_APP_TOKEN"
                  :label="t('notification.slack.appToken')"
                  :placeholder="t('notification.slack.appTokenPlaceholder')"
                  :hint="t('notification.slack.appTokenHint')"
                  persistent-hint
                  prepend-inner-icon="mdi-application"
                />
              </VCol>
              <VCol cols="12" md="6">
                <VTextField
                  v-model="notificationInfo.config.SLACK_CHANNEL"
                  :label="t('notification.slack.channel')"
                  :placeholder="t('notification.slack.channelPlaceholder')"
                  :hint="t('notification.slack.channelHint')"
                  persistent-hint
                  prepend-inner-icon="mdi-pound"
                />
              </VCol>
            </VRow>
            <VRow v-else-if="notificationInfo.type == 'discord'">
              <VCol cols="12" md="6">
                <VTextField
                  v-model="notificationInfo.name"
                  :label="t('notification.name')"
                  :placeholder="t('notification.name')"
                  :hint="t('notification.nameHint')"
                  persistent-hint
                  prepend-inner-icon="mdi-label"
                />
              </VCol>
              <VCol cols="12" md="6">
                <VTextField
                  v-model="notificationInfo.config.DISCORD_BOT_TOKEN"
                  :label="t('notification.discord.botToken')"
                  :hint="t('notification.discord.botTokenHint')"
                  persistent-hint
                  prepend-inner-icon="mdi-key-variant"
                />
              </VCol>
              <VCol cols="12" md="6">
                <VTextField
                  v-model="notificationInfo.config.DISCORD_GUILD_ID"
                  :label="t('notification.discord.guildId')"
                  :placeholder="t('notification.discord.guildIdPlaceholder')"
                  :hint="t('notification.discord.guildIdHint')"
                  persistent-hint
                  prepend-inner-icon="mdi-pound"
                />
              </VCol>
              <VCol cols="12" md="6">
                <VTextField
                  v-model="notificationInfo.config.DISCORD_CHANNEL_ID"
                  :label="t('notification.discord.channelId')"
                  :placeholder="t('notification.discord.channelIdPlaceholder')"
                  :hint="t('notification.discord.channelIdHint')"
                  persistent-hint
                  prepend-inner-icon="mdi-pound-box"
                />
              </VCol>
            </VRow>
            <VRow v-else-if="notificationInfo.type == 'synologychat'">
              <VCol cols="12" md="6">
                <VTextField
                  v-model="notificationInfo.name"
                  :label="t('notification.name')"
                  :placeholder="t('notification.name')"
                  :hint="t('notification.nameHint')"
                  persistent-hint
                  prepend-inner-icon="mdi-label"
                />
              </VCol>
              <VCol cols="12" md="6">
                <VTextField
                  v-model="notificationInfo.config.SYNOLOGYCHAT_WEBHOOK"
                  :label="t('notification.synologychat.webhook')"
                  :hint="t('notification.synologychat.webhookHint')"
                  persistent-hint
                  prepend-inner-icon="mdi-webhook"
                />
              </VCol>
              <VCol cols="12" md="6">
                <VTextField
                  v-model="notificationInfo.config.SYNOLOGYCHAT_TOKEN"
                  :label="t('notification.synologychat.token')"
                  :hint="t('notification.synologychat.tokenHint')"
                  persistent-hint
                  prepend-inner-icon="mdi-key"
                />
              </VCol>
            </VRow>
            <VRow v-else-if="notificationInfo.type == 'vocechat'">
              <VCol cols="12" md="6">
                <VTextField
                  v-model="notificationInfo.name"
                  :label="t('notification.name')"
                  :placeholder="t('notification.name')"
                  :hint="t('notification.nameHint')"
                  persistent-hint
                  prepend-inner-icon="mdi-label"
                />
              </VCol>
              <VCol cols="12" md="6">
                <VTextField
                  v-model="notificationInfo.config.VOCECHAT_HOST"
                  :label="t('notification.vocechat.host')"
                  :hint="t('notification.vocechat.hostHint')"
                  persistent-hint
                  prepend-inner-icon="mdi-server"
                />
              </VCol>
              <VCol cols="12" md="6">
                <VTextField
                  v-model="notificationInfo.config.VOCECHAT_API_KEY"
                  :label="t('notification.vocechat.apiKey')"
                  :hint="t('notification.vocechat.apiKeyHint')"
                  persistent-hint
                  prepend-inner-icon="mdi-key"
                />
              </VCol>
              <VCol cols="12" md="6">
                <VTextField
                  v-model="notificationInfo.config.VOCECHAT_CHANNEL_ID"
                  :label="t('notification.vocechat.channelId')"
                  :placeholder="t('notification.vocechat.channelIdPlaceholder')"
                  :hint="t('notification.vocechat.channelIdHint')"
                  persistent-hint
                  prepend-inner-icon="mdi-pound"
                />
              </VCol>
            </VRow>
            <VRow v-else-if="notificationInfo.type == 'qqbot'">
              <VCol cols="12" md="6">
                <VTextField
                  v-model="notificationInfo.name"
                  :label="t('notification.name')"
                  :placeholder="t('notification.name')"
                  :hint="t('notification.nameHint')"
                  persistent-hint
                  prepend-inner-icon="mdi-label"
                />
              </VCol>
              <VCol cols="12" md="6">
                <VTextField
                  v-model="notificationInfo.config.QQ_APP_ID"
                  :label="t('notification.qqbot.appId')"
                  :hint="t('notification.qqbot.appIdHint')"
                  persistent-hint
                  prepend-inner-icon="mdi-application"
                />
              </VCol>
              <VCol cols="12" md="6">
                <VTextField
                  v-model="notificationInfo.config.QQ_APP_SECRET"
                  :label="t('notification.qqbot.appSecret')"
                  :hint="t('notification.qqbot.appSecretHint')"
                  persistent-hint
                  prepend-inner-icon="mdi-key"
                />
              </VCol>
              <VCol cols="12" md="6">
                <VTextField
                  v-model="notificationInfo.config.QQ_OPENID"
                  :label="t('notification.qqbot.openId')"
                  :placeholder="t('notification.qqbot.openIdPlaceholder')"
                  :hint="t('notification.qqbot.openIdHint')"
                  persistent-hint
                  prepend-inner-icon="mdi-account"
                />
              </VCol>
              <VCol cols="12" md="6">
                <VTextField
                  v-model="notificationInfo.config.QQ_GROUP_OPENID"
                  :label="t('notification.qqbot.groupOpenId')"
                  :placeholder="t('notification.qqbot.groupOpenIdPlaceholder')"
                  :hint="t('notification.qqbot.groupOpenIdHint')"
                  persistent-hint
                  prepend-inner-icon="mdi-account-group"
                />
              </VCol>
            </VRow>
            <VRow v-else-if="notificationInfo.type == 'webpush'">
              <VCol cols="12" md="6">
                <VTextField
                  v-model="notificationInfo.name"
                  :label="t('notification.name')"
                  :placeholder="t('notification.name')"
                  :hint="t('notification.nameHint')"
                  persistent-hint
                  prepend-inner-icon="mdi-label"
                />
              </VCol>
              <VCol cols="12" md="6">
                <VTextField
                  v-model="notificationInfo.config.WEBPUSH_USERNAME"
                  :label="t('notification.webpush.username')"
                  :hint="t('notification.webpush.usernameHint')"
                  persistent-hint
                  prepend-inner-icon="mdi-account"
                />
              </VCol>
            </VRow>
            <VRow v-else>
              <VCol cols="12" md="6">
                <VTextField
                  v-model="notificationInfo.type"
                  :label="t('notification.type')"
                  :hint="t('notification.customTypeHint')"
                  persistent-hint
                  active
                  prepend-inner-icon="mdi-cog"
                />
              </VCol>
              <VCol cols="12" md="6">
                <VTextField
                  v-model="notificationInfo.name"
                  :label="t('notification.name')"
                  :hint="t('notification.nameRequired')"
                  persistent-hint
                  prepend-inner-icon="mdi-label"
                />
              </VCol>
            </VRow>
          </VForm>
        </VCardText>
        <VCardActions class="pt-3">
          <VBtn @click="saveNotificationInfo" prepend-icon="mdi-content-save" class="px-5">
            {{ t('common.confirm') }}
          </VBtn>
        </VCardActions>
      </VCard>
    </VDialog>
  </div>
</template>
