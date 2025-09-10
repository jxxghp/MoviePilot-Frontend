<script lang="ts" setup>
import { useI18n } from 'vue-i18n'
import { useSetupWizard } from '@/composables/useSetupWizard'

const { t } = useI18n()
const { wizardData, selectNotification } = useSetupWizard()
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
                    <VImg
                      src="/src/assets/images/logos/wechat.png"
                      height="48"
                      width="48"
                      class="mx-auto mb-2"
                    />
                    <div class="text-h6">微信</div>
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
                    <VImg
                      src="/src/assets/images/logos/telegram.webp"
                      height="48"
                      width="48"
                      class="mx-auto mb-2"
                    />
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
                    <VImg
                      src="/src/assets/images/logos/slack.webp"
                      height="48"
                      width="48"
                      class="mx-auto mb-2"
                    />
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
                    <VImg
                      src="/src/assets/images/logos/synologychat.png"
                      height="48"
                      width="48"
                      class="mx-auto mb-2"
                    />
                    <div class="text-h6">Synology Chat</div>
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
                    <VImg
                      src="/src/assets/images/logos/vocechat.png"
                      height="48"
                      width="48"
                      class="mx-auto mb-2"
                    />
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
                  <VCol cols="12" md="6">
                    <VSwitch v-model="wizardData.notification.enabled" :label="t('notification.enabled')" />
                  </VCol>
                  <VCol cols="12">
                    <VAutocomplete
                      v-model="wizardData.notification.switchs"
                      :items="[]"
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
                      persistent-hint
                      prepend-inner-icon="mdi-label"
                    />
                  </VCol>
                  <VCol cols="12" md="6">
                    <VTextField
                      v-model="wizardData.notification.config.WECHAT_CORPID"
                      :label="t('notification.wechat.corpId')"
                      :hint="t('notification.wechat.corpIdHint')"
                      persistent-hint
                      prepend-inner-icon="mdi-domain"
                    />
                  </VCol>
                  <VCol cols="12" md="6">
                    <VTextField
                      v-model="wizardData.notification.config.WECHAT_APP_ID"
                      :label="t('notification.wechat.appId')"
                      :hint="t('notification.wechat.appIdHint')"
                      persistent-hint
                      prepend-inner-icon="mdi-application"
                    />
                  </VCol>
                  <VCol cols="12" md="6">
                    <VTextField
                      v-model="wizardData.notification.config.WECHAT_APP_SECRET"
                      :label="t('notification.wechat.appSecret')"
                      :hint="t('notification.wechat.appSecretHint')"
                      persistent-hint
                      prepend-inner-icon="mdi-key"
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
                <VRow v-else-if="wizardData.notification.type === 'telegram'">
                  <VCol cols="12" md="6">
                    <VTextField
                      v-model="wizardData.notification.name"
                      :label="t('notification.name')"
                      :placeholder="t('notification.name')"
                      :hint="t('notification.nameHint')"
                      persistent-hint
                      prepend-inner-icon="mdi-label"
                    />
                  </VCol>
                  <VCol cols="12" md="6">
                    <VTextField
                      v-model="wizardData.notification.config.TELEGRAM_TOKEN"
                      :label="t('notification.telegram.token')"
                      :hint="t('notification.telegram.tokenHint')"
                      persistent-hint
                      prepend-inner-icon="mdi-key"
                    />
                  </VCol>
                  <VCol cols="12" md="6">
                    <VTextField
                      v-model="wizardData.notification.config.TELEGRAM_CHAT_ID"
                      :label="t('notification.telegram.chatId')"
                      :hint="t('notification.telegram.chatIdHint')"
                      persistent-hint
                      prepend-inner-icon="mdi-chat"
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
                <VRow v-else-if="wizardData.notification.type === 'slack'">
                  <VCol cols="12" md="6">
                    <VTextField
                      v-model="wizardData.notification.name"
                      :label="t('notification.name')"
                      :placeholder="t('notification.name')"
                      :hint="t('notification.nameHint')"
                      persistent-hint
                      prepend-inner-icon="mdi-label"
                    />
                  </VCol>
                  <VCol cols="12" md="6">
                    <VTextField
                      v-model="wizardData.notification.config.SLACK_OAUTH_TOKEN"
                      :label="t('notification.slack.oauthToken')"
                      :placeholder="t('notification.slack.oauthTokenPlaceholder')"
                      :hint="t('notification.slack.oauthTokenHint')"
                      persistent-hint
                      prepend-inner-icon="mdi-key"
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
                      persistent-hint
                      prepend-inner-icon="mdi-pound"
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
                      persistent-hint
                      prepend-inner-icon="mdi-label"
                    />
                  </VCol>
                  <VCol cols="12" md="6">
                    <VTextField
                      v-model="wizardData.notification.config.SYNOLOGYCHAT_WEBHOOK"
                      :label="t('notification.synologychat.webhook')"
                      :hint="t('notification.synologychat.webhookHint')"
                      persistent-hint
                      prepend-inner-icon="mdi-webhook"
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
                      persistent-hint
                      prepend-inner-icon="mdi-label"
                    />
                  </VCol>
                  <VCol cols="12" md="6">
                    <VTextField
                      v-model="wizardData.notification.config.VOCECHAT_HOST"
                      :label="t('notification.vocechat.host')"
                      :hint="t('notification.vocechat.hostHint')"
                      persistent-hint
                      prepend-inner-icon="mdi-server"
                    />
                  </VCol>
                  <VCol cols="12" md="6">
                    <VTextField
                      v-model="wizardData.notification.config.VOCECHAT_API_KEY"
                      :label="t('notification.vocechat.apiKey')"
                      :hint="t('notification.vocechat.apiKeyHint')"
                      persistent-hint
                      prepend-inner-icon="mdi-key"
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
                      persistent-hint
                      prepend-inner-icon="mdi-label"
                    />
                  </VCol>
                  <VCol cols="12" md="6">
                    <VTextField
                      v-model="wizardData.notification.config.WEBPUSH_USERNAME"
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
  box-shadow: 0 4px 12px rgba(0, 0, 0, 15%);
  transform: translateY(-2px);
}

.cursor-pointer:active {
  transform: translateY(0);
}

/* 选中状态的样式 */
.v-card--variant-tonal.v-theme--light {
  background-color: rgb(var(--v-theme-primary), 0.12);
}

.v-card--variant-tonal.v-theme--dark {
  background-color: rgb(var(--v-theme-primary), 0.2);
}
</style>