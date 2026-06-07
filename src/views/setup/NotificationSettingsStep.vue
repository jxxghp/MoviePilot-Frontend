<script lang="ts" setup>
import { useI18n } from 'vue-i18n'
import { useSetupWizard } from '@/composables/useSetupWizard'
import { getLogoUrl } from '@/utils/imageUtils'

const { t } = useI18n()
const { wizardData, selectNotification, validationErrors } = useSetupWizard()

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
</script>

<template>
  <VCard variant="outlined">
    <VCardText>
      <div class="text-center mb-6">
        <h3 class="text-h4 mb-2">{{ t('setupWizard.notification.title') }}</h3>
        <p class="text-body-1 text-medium-emphasis">{{ t('setupWizard.notification.description') }}</p>
      </div>
      <VRow>
        <VCol cols="12">
          <VAlert type="info" variant="tonal" class="mb-4">
            <VAlertTitle>{{ t('setupWizard.notification.info') }}</VAlertTitle>
            {{ t('setupWizard.notification.infoDesc') }}
          </VAlert>
        </VCol>

        <!-- 通知选择 -->
        <VCol cols="12">
          <div class="mb-4">
            <h4 class="text-h6 mb-4">{{ t('setupWizard.notification.type') }}</h4>
            <VRow>
              <VCol cols="12" md="3">
                <VCard
                  :color="wizardData.notification.type === 'wechat' ? 'primary' : 'default'"
                  :variant="wizardData.notification.type === 'wechat' ? 'tonal' : 'outlined'"
                  class="cursor-pointer"
                  @click="selectNotification('wechat')"
                >
                  <VCardText class="text-center">
                    <VImg :src="getLogoUrl('wechat')" height="48" width="48" class="mx-auto mb-2" />
                    <div class="text-h6">企业微信</div>
                  </VCardText>
                </VCard>
              </VCol>
              <VCol cols="12" md="3">
                <VCard
                  :color="wizardData.notification.type === 'wechatclawbot' ? 'primary' : 'default'"
                  :variant="wizardData.notification.type === 'wechatclawbot' ? 'tonal' : 'outlined'"
                  class="cursor-pointer"
                  @click="selectNotification('wechatclawbot')"
                >
                  <VCardText class="text-center">
                    <VImg :src="getLogoUrl('wechatclawbot')" height="48" width="48" class="mx-auto mb-2" />
                    <div class="text-h6">WeChat ClawBot</div>
                  </VCardText>
                </VCard>
              </VCol>
              <VCol cols="12" md="3">
                <VCard
                  :color="wizardData.notification.type === 'feishu' ? 'primary' : 'default'"
                  :variant="wizardData.notification.type === 'feishu' ? 'tonal' : 'outlined'"
                  class="cursor-pointer"
                  @click="selectNotification('feishu')"
                >
                  <VCardText class="text-center">
                    <VImg :src="getLogoUrl('feishu')" height="48" width="48" class="mx-auto mb-2" />
                    <div class="text-h6">飞书</div>
                  </VCardText>
                </VCard>
              </VCol>
              <VCol cols="12" md="3">
                <VCard
                  :color="wizardData.notification.type === 'telegram' ? 'primary' : 'default'"
                  :variant="wizardData.notification.type === 'telegram' ? 'tonal' : 'outlined'"
                  class="cursor-pointer"
                  @click="selectNotification('telegram')"
                >
                  <VCardText class="text-center">
                    <VImg :src="getLogoUrl('telegram')" height="48" width="48" class="mx-auto mb-2" />
                    <div class="text-h6">Telegram</div>
                  </VCardText>
                </VCard>
              </VCol>
              <VCol cols="12" md="3">
                <VCard
                  :color="wizardData.notification.type === 'slack' ? 'primary' : 'default'"
                  :variant="wizardData.notification.type === 'slack' ? 'tonal' : 'outlined'"
                  class="cursor-pointer"
                  @click="selectNotification('slack')"
                >
                  <VCardText class="text-center">
                    <VImg :src="getLogoUrl('slack')" height="48" width="48" class="mx-auto mb-2" />
                    <div class="text-h6">Slack</div>
                  </VCardText>
                </VCard>
              </VCol>
              <VCol cols="12" md="3">
                <VCard
                  :color="wizardData.notification.type === 'synologychat' ? 'primary' : 'default'"
                  :variant="wizardData.notification.type === 'synologychat' ? 'tonal' : 'outlined'"
                  class="cursor-pointer"
                  @click="selectNotification('synologychat')"
                >
                  <VCardText class="text-center">
                    <VImg :src="getLogoUrl('synologychat')" height="48" width="48" class="mx-auto mb-2" />
                    <div class="text-h6">Synology Chat</div>
                  </VCardText>
                </VCard>
              </VCol>
              <VCol cols="12" md="3">
                <VCard
                  :color="wizardData.notification.type === 'qqbot' ? 'primary' : 'default'"
                  :variant="wizardData.notification.type === 'qqbot' ? 'tonal' : 'outlined'"
                  class="cursor-pointer"
                  @click="selectNotification('qqbot')"
                >
                  <VCardText class="text-center">
                    <VImg :src="getLogoUrl('notification')" height="48" width="48" class="mx-auto mb-2" />
                    <div class="text-h6">QQ</div>
                  </VCardText>
                </VCard>
              </VCol>
              <VCol cols="12" md="3">
                <VCard
                  :color="wizardData.notification.type === 'vocechat' ? 'primary' : 'default'"
                  :variant="wizardData.notification.type === 'vocechat' ? 'tonal' : 'outlined'"
                  class="cursor-pointer"
                  @click="selectNotification('vocechat')"
                >
                  <VCardText class="text-center">
                    <VImg :src="getLogoUrl('vocechat')" height="48" width="48" class="mx-auto mb-2" />
                    <div class="text-h6">VoceChat</div>
                  </VCardText>
                </VCard>
              </VCol>
              <VCol cols="12" md="3">
                <VCard
                  :color="wizardData.notification.type === 'webpush' ? 'primary' : 'default'"
                  :variant="wizardData.notification.type === 'webpush' ? 'tonal' : 'outlined'"
                  class="cursor-pointer"
                  @click="selectNotification('webpush')"
                >
                  <VCardText class="text-center">
                    <VIcon icon="mdi-apple-safari" size="48" class="mb-2" />
                    <div class="text-h6">WebPush</div>
                  </VCardText>
                </VCard>
              </VCol>
            </VRow>
          </div>
        </VCol>

        <!-- 通知配置 -->
        <VCol v-if="wizardData.notification.type" cols="12">
          <VCard>
            <VCardText>
              <VForm>
                <VRow>
                  <VCol cols="12">
                    <VAutocomplete
                      v-model="wizardData.notification.switchs"
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
                <VRow v-if="wizardData.notification.type === 'wechat'">
                  <VCol cols="12" md="6">
                    <VTextField
                      v-model="wizardData.notification.name"
                      :label="t('notification.name')"
                      :placeholder="t('notification.name')"
                      :hint="t('notification.nameHint')"
                      :error="validationErrors.notification.name"
                      :error-messages="validationErrors.notification.name ? [t('notification.nameRequired')] : []"
                      persistent-hint
                      prepend-inner-icon="mdi-label"
                      required
                    />
                  </VCol>
                  <VCol cols="12" md="6">
                    <VTextField
                      v-model="wizardData.notification.config.WECHAT_CORPID"
                      :label="t('notification.wechat.corpId')"
                      :hint="t('notification.wechat.corpIdHint')"
                      :error="validationErrors.notification.WECHAT_CORPID"
                      :error-messages="
                        validationErrors.notification.WECHAT_CORPID ? [t('notification.wechat.corpIdRequired')] : []
                      "
                      persistent-hint
                      prepend-inner-icon="mdi-domain"
                      required
                    />
                  </VCol>
                  <VCol cols="12" md="6">
                    <VTextField
                      v-model="wizardData.notification.config.WECHAT_APP_ID"
                      :label="t('notification.wechat.appId')"
                      :hint="t('notification.wechat.appIdHint')"
                      :error="validationErrors.notification.WECHAT_APP_ID"
                      :error-messages="
                        validationErrors.notification.WECHAT_APP_ID ? [t('notification.wechat.appIdRequired')] : []
                      "
                      persistent-hint
                      prepend-inner-icon="mdi-application"
                      required
                    />
                  </VCol>
                  <VCol cols="12" md="6">
                    <VTextField
                      v-model="wizardData.notification.config.WECHAT_APP_SECRET"
                      :label="t('notification.wechat.appSecret')"
                      :hint="t('notification.wechat.appSecretHint')"
                      :error="validationErrors.notification.WECHAT_APP_SECRET"
                      :error-messages="
                        validationErrors.notification.WECHAT_APP_SECRET
                          ? [t('notification.wechat.appSecretRequired')]
                          : []
                      "
                      persistent-hint
                      prepend-inner-icon="mdi-key"
                      required
                    />
                  </VCol>
                  <VCol cols="12" md="6">
                    <VTextField
                      v-model="wizardData.notification.config.WECHAT_PROXY"
                      :label="t('notification.wechat.proxy')"
                      :hint="t('notification.wechat.proxyHint')"
                      persistent-hint
                      prepend-inner-icon="mdi-server-network"
                    />
                  </VCol>
                  <VCol cols="12" md="6">
                    <VTextField
                      v-model="wizardData.notification.config.WECHAT_TOKEN"
                      :label="t('notification.wechat.token')"
                      :hint="t('notification.wechat.tokenHint')"
                      persistent-hint
                      prepend-inner-icon="mdi-key-variant"
                    />
                  </VCol>
                  <VCol cols="12" md="6">
                    <VTextField
                      v-model="wizardData.notification.config.WECHAT_ENCODING_AESKEY"
                      :label="t('notification.wechat.encodingAesKey')"
                      :hint="t('notification.wechat.encodingAesKeyHint')"
                      persistent-hint
                      prepend-inner-icon="mdi-lock"
                    />
                  </VCol>
                  <VCol cols="12" md="6">
                    <VTextField
                      v-model="wizardData.notification.config.WECHAT_ADMINS"
                      :label="t('notification.wechat.admins')"
                      :placeholder="t('notification.wechat.adminsPlaceholder')"
                      :hint="t('notification.wechat.adminsHint')"
                      persistent-hint
                      prepend-inner-icon="mdi-account-supervisor"
                    />
                  </VCol>
                </VRow>
                <VRow v-else-if="wizardData.notification.type === 'wechatclawbot'">
                  <VCol cols="12" md="6">
                    <VTextField
                      v-model="wizardData.notification.name"
                      :label="t('notification.name')"
                      :placeholder="t('notification.name')"
                      :hint="t('notification.nameHint')"
                      :error="validationErrors.notification.name"
                      :error-messages="validationErrors.notification.name ? [t('notification.nameRequired')] : []"
                      persistent-hint
                      prepend-inner-icon="mdi-label"
                      required
                    />
                  </VCol>
                  <VCol cols="12" md="6">
                    <VTextField
                      v-model="wizardData.notification.config.WECHATCLAWBOT_BASE_URL"
                      :label="t('notification.wechatclawbot.baseUrl')"
                      :hint="t('notification.wechatclawbot.baseUrlHint')"
                      persistent-hint
                      prepend-inner-icon="mdi-web"
                    />
                  </VCol>
                  <VCol cols="12" md="6">
                    <VTextField
                      v-model="wizardData.notification.config.WECHATCLAWBOT_DEFAULT_TARGET"
                      :label="t('notification.wechatclawbot.defaultTarget')"
                      :placeholder="t('notification.wechatclawbot.defaultTargetPlaceholder')"
                      :hint="t('notification.wechatclawbot.defaultTargetHint')"
                      persistent-hint
                      prepend-inner-icon="mdi-account-arrow-right"
                    />
                  </VCol>
                  <VCol cols="12" md="6">
                    <VTextField
                      v-model="wizardData.notification.config.WECHATCLAWBOT_ADMINS"
                      :label="t('notification.wechatclawbot.admins')"
                      :placeholder="t('notification.wechatclawbot.adminsPlaceholder')"
                      :hint="t('notification.wechatclawbot.adminsHint')"
                      persistent-hint
                      prepend-inner-icon="mdi-account-supervisor"
                    />
                  </VCol>
                </VRow>
                <VRow v-else-if="wizardData.notification.type === 'feishu'">
                  <VCol cols="12" md="6">
                    <VTextField
                      v-model="wizardData.notification.name"
                      :label="t('notification.name')"
                      :placeholder="t('notification.name')"
                      :hint="t('notification.nameHint')"
                      :error="validationErrors.notification.name"
                      :error-messages="validationErrors.notification.name ? [t('notification.nameRequired')] : []"
                      persistent-hint
                      prepend-inner-icon="mdi-label"
                      required
                    />
                  </VCol>
                  <VCol cols="12" md="6">
                    <VTextField
                      v-model="wizardData.notification.config.FEISHU_APP_ID"
                      :label="t('notification.feishu.appId')"
                      :hint="t('notification.feishu.appIdHint')"
                      :error="validationErrors.notification.FEISHU_APP_ID"
                      :error-messages="validationErrors.notification.FEISHU_APP_ID ? [t('notification.feishu.appIdRequired')] : []"
                      persistent-hint
                      prepend-inner-icon="mdi-application"
                      required
                    />
                  </VCol>
                  <VCol cols="12" md="6">
                    <VTextField
                      v-model="wizardData.notification.config.FEISHU_APP_SECRET"
                      :label="t('notification.feishu.appSecret')"
                      :hint="t('notification.feishu.appSecretHint')"
                      :error="validationErrors.notification.FEISHU_APP_SECRET"
                      :error-messages="validationErrors.notification.FEISHU_APP_SECRET ? [t('notification.feishu.appSecretRequired')] : []"
                      persistent-hint
                      prepend-inner-icon="mdi-key"
                      required
                    />
                  </VCol>
                  <VCol cols="12" md="6">
                    <VTextField
                      v-model="wizardData.notification.config.FEISHU_OPEN_ID"
                      :label="t('notification.feishu.openId')"
                      :placeholder="t('notification.feishu.openIdPlaceholder')"
                      :hint="t('notification.feishu.openIdHint')"
                      persistent-hint
                      prepend-inner-icon="mdi-account"
                    />
                  </VCol>
                  <VCol cols="12" md="6">
                    <VTextField
                      v-model="wizardData.notification.config.FEISHU_CHAT_ID"
                      :label="t('notification.feishu.chatId')"
                      :placeholder="t('notification.feishu.chatIdPlaceholder')"
                      :hint="t('notification.feishu.chatIdHint')"
                      persistent-hint
                      prepend-inner-icon="mdi-chat-processing"
                    />
                  </VCol>
                  <VCol cols="12" md="6">
                    <VTextField
                      v-model="wizardData.notification.config.FEISHU_ADMINS"
                      :label="t('notification.feishu.admins')"
                      :placeholder="t('notification.feishu.adminsPlaceholder')"
                      :hint="t('notification.feishu.adminsHint')"
                      persistent-hint
                      prepend-inner-icon="mdi-account-supervisor"
                    />
                  </VCol>
                  <VCol cols="12" md="6">
                    <VTextField
                      v-model="wizardData.notification.config.FEISHU_VERIFICATION_TOKEN"
                      :label="t('notification.feishu.verificationToken')"
                      :hint="t('notification.feishu.verificationTokenHint')"
                      persistent-hint
                      prepend-inner-icon="mdi-shield-key"
                    />
                  </VCol>
                  <VCol cols="12" md="6">
                    <VTextField
                      v-model="wizardData.notification.config.FEISHU_ENCRYPT_KEY"
                      :label="t('notification.feishu.encryptKey')"
                      :hint="t('notification.feishu.encryptKeyHint')"
                      persistent-hint
                      prepend-inner-icon="mdi-lock"
                    />
                  </VCol>
                </VRow>
                <VRow v-else-if="wizardData.notification.type === 'telegram'">
                  <VCol cols="12" md="6">
                    <VTextField
                      v-model="wizardData.notification.name"
                      :label="t('notification.name')"
                      :placeholder="t('notification.name')"
                      :hint="t('notification.nameHint')"
                      :error="validationErrors.notification.name"
                      :error-messages="validationErrors.notification.name ? [t('notification.nameRequired')] : []"
                      persistent-hint
                      prepend-inner-icon="mdi-label"
                      required
                    />
                  </VCol>
                  <VCol cols="12" md="6">
                    <VTextField
                      v-model="wizardData.notification.config.TELEGRAM_TOKEN"
                      :label="t('notification.telegram.token')"
                      :hint="t('notification.telegram.tokenHint')"
                      :error="validationErrors.notification.TELEGRAM_TOKEN"
                      :error-messages="
                        validationErrors.notification.TELEGRAM_TOKEN ? [t('notification.telegram.tokenRequired')] : []
                      "
                      persistent-hint
                      prepend-inner-icon="mdi-key"
                      required
                    />
                  </VCol>
                  <VCol cols="12" md="6">
                    <VTextField
                      v-model="wizardData.notification.config.TELEGRAM_CHAT_ID"
                      :label="t('notification.telegram.chatId')"
                      :hint="t('notification.telegram.chatIdHint')"
                      :error="validationErrors.notification.TELEGRAM_CHAT_ID"
                      :error-messages="
                        validationErrors.notification.TELEGRAM_CHAT_ID
                          ? [t('notification.telegram.chatIdRequired')]
                          : []
                      "
                      persistent-hint
                      prepend-inner-icon="mdi-chat"
                      required
                    />
                  </VCol>
                  <VCol cols="12" md="6">
                    <VTextField
                      v-model="wizardData.notification.config.TELEGRAM_USERS"
                      :label="t('notification.telegram.users')"
                      :placeholder="t('notification.telegram.usersPlaceholder')"
                      :hint="t('notification.telegram.usersHint')"
                      persistent-hint
                      prepend-inner-icon="mdi-account-group"
                    />
                  </VCol>
                  <VCol cols="12" md="6">
                    <VTextField
                      v-model="wizardData.notification.config.TELEGRAM_ADMINS"
                      :label="t('notification.telegram.admins')"
                      :placeholder="t('notification.telegram.adminsPlaceholder')"
                      :hint="t('notification.telegram.adminsHint')"
                      persistent-hint
                      prepend-inner-icon="mdi-account-supervisor"
                    />
                  </VCol>
                  <VCol cols="12" md="6">
                    <VTextField
                      v-model="wizardData.notification.config.API_URL"
                      :label="t('notification.telegram.apiUrl')"
                      :placeholder="t('notification.telegram.apiUrlPlaceholder')"
                      :hint="t('notification.telegram.apiUrlHint')"
                      persistent-hint
                      prepend-inner-icon="mdi-web"
                    />
                  </VCol>
                </VRow>
                <VRow v-else-if="wizardData.notification.type === 'qqbot'">
                  <VCol cols="12" md="6">
                    <VTextField
                      v-model="wizardData.notification.name"
                      :label="t('notification.name')"
                      :placeholder="t('notification.name')"
                      :hint="t('notification.nameHint')"
                      :error="validationErrors.notification.name"
                      :error-messages="validationErrors.notification.name ? [t('notification.nameRequired')] : []"
                      persistent-hint
                      prepend-inner-icon="mdi-label"
                      required
                    />
                  </VCol>
                  <VCol cols="12" md="6">
                    <VTextField
                      v-model="wizardData.notification.config.QQ_APP_ID"
                      :label="t('notification.qqbot.appId')"
                      :hint="t('notification.qqbot.appIdHint')"
                      :error="validationErrors.notification.QQ_APP_ID"
                      :error-messages="
                        validationErrors.notification.QQ_APP_ID ? [t('notification.qqbot.appIdRequired')] : []
                      "
                      persistent-hint
                      prepend-inner-icon="mdi-application"
                    />
                  </VCol>
                  <VCol cols="12" md="6">
                    <VTextField
                      v-model="wizardData.notification.config.QQ_APP_SECRET"
                      :label="t('notification.qqbot.appSecret')"
                      :hint="t('notification.qqbot.appSecretHint')"
                      :error="validationErrors.notification.QQ_APP_SECRET"
                      :error-messages="
                        validationErrors.notification.QQ_APP_SECRET
                          ? [t('notification.qqbot.appSecretRequired')]
                          : []
                      "
                      persistent-hint
                      prepend-inner-icon="mdi-key"
                    />
                  </VCol>
                  <VCol cols="12" md="6">
                    <VTextField
                      v-model="wizardData.notification.config.QQ_OPENID"
                      :label="t('notification.qqbot.openId')"
                      :placeholder="t('notification.qqbot.openIdPlaceholder')"
                      :hint="t('notification.qqbot.openIdHint')"
                      persistent-hint
                      prepend-inner-icon="mdi-account"
                    />
                  </VCol>
                  <VCol cols="12" md="6">
                    <VTextField
                      v-model="wizardData.notification.config.QQ_GROUP_OPENID"
                      :label="t('notification.qqbot.groupOpenId')"
                      :placeholder="t('notification.qqbot.groupOpenIdPlaceholder')"
                      :hint="t('notification.qqbot.groupOpenIdHint')"
                      persistent-hint
                      prepend-inner-icon="mdi-account-group"
                    />
                  </VCol>
                </VRow>
                <VRow v-else-if="wizardData.notification.type === 'slack'">
                  <VCol cols="12" md="6">
                    <VTextField
                      v-model="wizardData.notification.name"
                      :label="t('notification.name')"
                      :placeholder="t('notification.name')"
                      :hint="t('notification.nameHint')"
                      :error="validationErrors.notification.name"
                      :error-messages="validationErrors.notification.name ? [t('notification.nameRequired')] : []"
                      persistent-hint
                      prepend-inner-icon="mdi-label"
                      required
                    />
                  </VCol>
                  <VCol cols="12" md="6">
                    <VTextField
                      v-model="wizardData.notification.config.SLACK_OAUTH_TOKEN"
                      :label="t('notification.slack.oauthToken')"
                      :placeholder="t('notification.slack.oauthTokenPlaceholder')"
                      :hint="t('notification.slack.oauthTokenHint')"
                      :error="validationErrors.notification.SLACK_OAUTH_TOKEN"
                      :error-messages="
                        validationErrors.notification.SLACK_OAUTH_TOKEN
                          ? [t('notification.slack.oauthTokenRequired')]
                          : []
                      "
                      persistent-hint
                      prepend-inner-icon="mdi-key"
                      required
                    />
                  </VCol>
                  <VCol cols="12" md="6">
                    <VTextField
                      v-model="wizardData.notification.config.SLACK_APP_TOKEN"
                      :label="t('notification.slack.appToken')"
                      :placeholder="t('notification.slack.appTokenPlaceholder')"
                      :hint="t('notification.slack.appTokenHint')"
                      persistent-hint
                      prepend-inner-icon="mdi-application"
                    />
                  </VCol>
                  <VCol cols="12" md="6">
                    <VTextField
                      v-model="wizardData.notification.config.SLACK_CHANNEL"
                      :label="t('notification.slack.channel')"
                      :placeholder="t('notification.slack.channelPlaceholder')"
                      :hint="t('notification.slack.channelHint')"
                      :error="validationErrors.notification.SLACK_CHANNEL"
                      :error-messages="
                        validationErrors.notification.SLACK_CHANNEL ? [t('notification.slack.channelRequired')] : []
                      "
                      persistent-hint
                      prepend-inner-icon="mdi-pound"
                      required
                    />
                  </VCol>
                </VRow>
                <VRow v-else-if="wizardData.notification.type === 'synologychat'">
                  <VCol cols="12" md="6">
                    <VTextField
                      v-model="wizardData.notification.name"
                      :label="t('notification.name')"
                      :placeholder="t('notification.name')"
                      :hint="t('notification.nameHint')"
                      :error="validationErrors.notification.name"
                      :error-messages="validationErrors.notification.name ? [t('notification.nameRequired')] : []"
                      persistent-hint
                      prepend-inner-icon="mdi-label"
                      required
                    />
                  </VCol>
                  <VCol cols="12" md="6">
                    <VTextField
                      v-model="wizardData.notification.config.SYNOLOGYCHAT_WEBHOOK"
                      :label="t('notification.synologychat.webhook')"
                      :hint="t('notification.synologychat.webhookHint')"
                      :error="validationErrors.notification.SYNOLOGYCHAT_WEBHOOK"
                      :error-messages="
                        validationErrors.notification.SYNOLOGYCHAT_WEBHOOK
                          ? [t('notification.synologychat.webhookRequired')]
                          : []
                      "
                      persistent-hint
                      prepend-inner-icon="mdi-webhook"
                      required
                    />
                  </VCol>
                  <VCol cols="12" md="6">
                    <VTextField
                      v-model="wizardData.notification.config.SYNOLOGYCHAT_TOKEN"
                      :label="t('notification.synologychat.token')"
                      :hint="t('notification.synologychat.tokenHint')"
                      persistent-hint
                      prepend-inner-icon="mdi-key"
                    />
                  </VCol>
                </VRow>
                <VRow v-else-if="wizardData.notification.type === 'vocechat'">
                  <VCol cols="12" md="6">
                    <VTextField
                      v-model="wizardData.notification.name"
                      :label="t('notification.name')"
                      :placeholder="t('notification.name')"
                      :hint="t('notification.nameHint')"
                      :error="validationErrors.notification.name"
                      :error-messages="validationErrors.notification.name ? [t('notification.nameRequired')] : []"
                      persistent-hint
                      prepend-inner-icon="mdi-label"
                      required
                    />
                  </VCol>
                  <VCol cols="12" md="6">
                    <VTextField
                      v-model="wizardData.notification.config.VOCECHAT_HOST"
                      :label="t('notification.vocechat.host')"
                      :hint="t('notification.vocechat.hostHint')"
                      :error="validationErrors.notification.VOCECHAT_HOST"
                      :error-messages="
                        validationErrors.notification.VOCECHAT_HOST ? [t('notification.vocechat.hostRequired')] : []
                      "
                      persistent-hint
                      prepend-inner-icon="mdi-server"
                      required
                    />
                  </VCol>
                  <VCol cols="12" md="6">
                    <VTextField
                      v-model="wizardData.notification.config.VOCECHAT_API_KEY"
                      :label="t('notification.vocechat.apiKey')"
                      :hint="t('notification.vocechat.apiKeyHint')"
                      :error="validationErrors.notification.VOCECHAT_API_KEY"
                      :error-messages="
                        validationErrors.notification.VOCECHAT_API_KEY
                          ? [t('notification.vocechat.apiKeyRequired')]
                          : []
                      "
                      persistent-hint
                      prepend-inner-icon="mdi-key"
                      required
                    />
                  </VCol>
                  <VCol cols="12" md="6">
                    <VTextField
                      v-model="wizardData.notification.config.VOCECHAT_CHANNEL_ID"
                      :label="t('notification.vocechat.channelId')"
                      :placeholder="t('notification.vocechat.channelIdPlaceholder')"
                      :hint="t('notification.vocechat.channelIdHint')"
                      persistent-hint
                      prepend-inner-icon="mdi-pound"
                    />
                  </VCol>
                </VRow>
                <VRow v-else-if="wizardData.notification.type === 'webpush'">
                  <VCol cols="12" md="6">
                    <VTextField
                      v-model="wizardData.notification.name"
                      :label="t('notification.name')"
                      :placeholder="t('notification.name')"
                      :hint="t('notification.nameHint')"
                      :error="validationErrors.notification.name"
                      :error-messages="validationErrors.notification.name ? [t('notification.nameRequired')] : []"
                      persistent-hint
                      prepend-inner-icon="mdi-label"
                      required
                    />
                  </VCol>
                  <VCol cols="12" md="6">
                    <VTextField
                      v-model="wizardData.notification.config.WEBPUSH_USERNAME"
                      :label="t('notification.webpush.username')"
                      :hint="t('notification.webpush.usernameHint')"
                      :error="validationErrors.notification.WEBPUSH_USERNAME"
                      :error-messages="
                        validationErrors.notification.WEBPUSH_USERNAME
                          ? [t('notification.webpush.usernameRequired')]
                          : []
                      "
                      persistent-hint
                      prepend-inner-icon="mdi-account"
                      required
                    />
                  </VCol>
                </VRow>
                <VRow v-else>
                  <VCol cols="12" md="6">
                    <VTextField
                      v-model="wizardData.notification.type"
                      :label="t('notification.type')"
                      :hint="t('notification.customTypeHint')"
                      persistent-hint
                      active
                      prepend-inner-icon="mdi-cog"
                    />
                  </VCol>
                  <VCol cols="12" md="6">
                    <VTextField
                      v-model="wizardData.notification.name"
                      :label="t('notification.name')"
                      :hint="t('notification.nameRequired')"
                      persistent-hint
                      prepend-inner-icon="mdi-label"
                    />
                  </VCol>
                </VRow>
              </VForm>
            </VCardText>
          </VCard>
        </VCol>
      </VRow>
    </VCardText>
  </VCard>
</template>

<style scoped>
.cursor-pointer {
  cursor: pointer;
  transition: all 0.2s ease;
}

.cursor-pointer:hover {
  transform: translateY(-2px);
}

.cursor-pointer:active {
  transform: translateY(0);
}

/* 选中状态的样式 */
.v-card--variant-tonal.v-theme--light {
  border: 2px solid rgb(var(--v-theme-primary));
  background-color: rgb(var(--v-theme-primary), 0.12);
}

.v-card--variant-tonal.v-theme--dark {
  border: 2px solid rgb(var(--v-theme-primary));
  background-color: rgb(var(--v-theme-primary), 0.2);
}
</style>
