<script setup lang="ts">
import api from '@/api'
import { NotificationConf } from '@/api/types'
import { useToast } from 'vue-toastification'
import { cloneDeep } from 'lodash-es'
import QRCode from 'qrcode'
import { useI18n } from 'vue-i18n'
import { useDisplay } from 'vuetify'

// 显示器宽度
const display = useDisplay()

const { t } = useI18n()

// 定义输入
const props = defineProps({
  modelValue: {
    type: Boolean,
    default: true,
  },
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
const emit = defineEmits(['update:modelValue', 'close', 'change', 'done'])

// 提示框
const $toast = useToast()

// 通知详情弹窗
const notificationInfoDialog = computed({
  get: () => props.modelValue,
  set: value => {
    emit('update:modelValue', value)
    if (!value) emit('close')
  },
})

// 通知详情
const notificationInfo = ref<NotificationConf>({
  name: '',
  type: '',
  enabled: false,
  config: {},
})

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

interface WechatClawBotStatus {
  connected?: boolean
  account_id?: string | null
  qrcode?: string | null
  qrcode_url?: string | null
  qrcode_status?: string | null
  qrcode_updated_at?: number | null
  known_targets?: Array<{ userid: string; username: string; last_active?: number | null }>
  default_target?: string | null
  base_url?: string | null
}

interface WechatClawBotStatusFetchOptions {
  autoGenerateQrcode?: boolean
  silent?: boolean
  autoRefreshExpired?: boolean
  showErrorToast?: boolean
}

interface WechatClawBotRefreshOptions {
  silent?: boolean
  showToast?: boolean
}

/** 补齐企业微信通知的默认配置。 */
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

/** 补齐微信客服通知的默认配置。 */
function ensureWechatClawBotConfigDefaults(notification: NotificationConf) {
  if (notification.type !== 'wechatclawbot') {
    return
  }
  if (!notification.config) {
    notification.config = {}
  }
  if (!notification.config.WECHATCLAWBOT_BASE_URL) {
    notification.config.WECHATCLAWBOT_BASE_URL = 'https://ilinkai.weixin.qq.com'
  }
  if (!notification.config.WECHATCLAWBOT_POLL_TIMEOUT) {
    notification.config.WECHATCLAWBOT_POLL_TIMEOUT = 25
  }
}

const wechatClawBotLoading = ref(false)
const wechatClawBotActionLoading = ref(false)
const wechatClawBotStatus = ref<WechatClawBotStatus | null>(null)
const wechatClawBotQrImage = ref('')
const wechatClawBotExpiredRefreshAttempted = ref(false)
let wechatClawBotTimer: number | null = null

/** 判断二维码数据是否可以直接作为图片地址使用。 */
function isImageSource(value?: string | null) {
  if (!value) {
    return false
  }
  const raw = value.trim()
  if (!raw) {
    return false
  }
  if (raw.toLowerCase().startsWith('data:image/')) {
    return true
  }
  return /\.(png|jpe?g|gif|webp|svg)(\?|$)/i.test(raw)
}

/** 根据微信客服状态生成二维码文本。 */
function getWechatClawBotQrText(status?: WechatClawBotStatus | null) {
  const directUrl = status?.qrcode_url?.trim()
  if (directUrl) {
    return directUrl
  }
  const qrcode = status?.qrcode?.trim()
  if (!qrcode) {
    return ''
  }
  return `https://liteapp.weixin.qq.com/q/7GiQu1?qrcode=${encodeURIComponent(qrcode)}&bot_type=3`
}

/** 根据微信客服状态刷新二维码图片。 */
async function updateWechatClawBotQrImage(status?: WechatClawBotStatus | null) {
  const directUrl = status?.qrcode_url?.trim()
  if (isImageSource(directUrl)) {
    wechatClawBotQrImage.value = directUrl || ''
    return
  }
  const qrText = getWechatClawBotQrText(status)
  if (!qrText) {
    wechatClawBotQrImage.value = ''
    return
  }
  try {
    wechatClawBotQrImage.value = await QRCode.toDataURL(qrText, {
      width: 220,
      margin: 1,
    })
  } catch (error) {
    console.error(error)
    wechatClawBotQrImage.value = ''
  }
}

/** 组装微信客服状态接口所需的请求参数。 */
function getWechatClawBotRequestParams(extraParams: Record<string, any> = {}) {
  const config = notificationInfo.value.config || {}
  return {
    source: notificationInfo.value.name,
    fallback_source: props.notification.name,
    WECHATCLAWBOT_BASE_URL: config.WECHATCLAWBOT_BASE_URL,
    WECHATCLAWBOT_DEFAULT_TARGET: config.WECHATCLAWBOT_DEFAULT_TARGET,
    WECHATCLAWBOT_ADMINS: config.WECHATCLAWBOT_ADMINS,
    WECHATCLAWBOT_POLL_TIMEOUT: config.WECHATCLAWBOT_POLL_TIMEOUT,
    ...extraParams,
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

/** 初始化通知渠道编辑数据并按需加载微信客服状态。 */
function openNotificationInfoDialog() {
  // 替换成深复制，避免修改时影响原数据
  notificationInfo.value = cloneDeep(props.notification)
  ensureWechatConfigDefaults(notificationInfo.value)
  ensureWechatClawBotConfigDefaults(notificationInfo.value)
  notificationInfoDialog.value = true
  if (notificationInfo.value.type === 'wechatclawbot') {
    fetchWechatClawBotStatus({
      autoGenerateQrcode: true,
      autoRefreshExpired: true,
    })
  }
}

/** 保存通知渠道编辑结果并通知父级刷新。 */
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
  ensureWechatClawBotConfigDefaults(notificationInfo.value)
  notificationInfoDialog.value = false
  emit('change', notificationInfo.value, props.notification.name)
  emit('done')
}

/** 清理微信客服状态轮询定时器。 */
function clearWechatClawBotTimer() {
  if (wechatClawBotTimer) {
    window.clearTimeout(wechatClawBotTimer)
    wechatClawBotTimer = null
  }
}

/** 按当前登录状态安排下一次微信客服状态刷新。 */
function scheduleWechatClawBotRefresh() {
  clearWechatClawBotTimer()
  if (!notificationInfoDialog.value || notificationInfo.value.type !== 'wechatclawbot') {
    return
  }
  const connected = wechatClawBotStatus.value?.connected
  const pendingStatus = ['waiting', 'scanned'].includes((wechatClawBotStatus.value?.qrcode_status || '').toLowerCase())
  if (connected || pendingStatus) {
    wechatClawBotTimer = window.setTimeout(() => {
      fetchWechatClawBotStatus({
        silent: true,
        autoRefreshExpired: true,
      })
    }, connected ? 10000 : 3000)
  }
}

/** 查询微信客服登录状态和二维码信息。 */
async function fetchWechatClawBotStatus(options: WechatClawBotStatusFetchOptions = {}) {
  const {
    autoGenerateQrcode = false,
    silent = false,
    autoRefreshExpired = false,
    showErrorToast = true,
  } = options
  if (notificationInfo.value.type !== 'wechatclawbot' || !notificationInfo.value.name) {
    return
  }
  if (!silent) {
    wechatClawBotLoading.value = true
  }
  try {
    const result: { [key: string]: any } = await api.get('notification/wechatclawbot/status', {
      params: getWechatClawBotRequestParams({ auto_generate_qrcode: autoGenerateQrcode }),
    })
    if (result.success) {
      wechatClawBotStatus.value = result.data
      await updateWechatClawBotQrImage(result.data)
      const status = (result.data?.qrcode_status || '').toLowerCase()
      if (status !== 'expired') {
        wechatClawBotExpiredRefreshAttempted.value = false
      }
      if (
        autoRefreshExpired &&
        !result.data?.connected &&
        status === 'expired' &&
        !wechatClawBotExpiredRefreshAttempted.value
      ) {
        wechatClawBotExpiredRefreshAttempted.value = true
        await refreshWechatClawBotQrcode({
          silent: true,
          showToast: false,
        })
        return
      }
      scheduleWechatClawBotRefresh()
    } else {
      wechatClawBotStatus.value = null
      wechatClawBotQrImage.value = ''
      clearWechatClawBotTimer()
      if (showErrorToast) {
        $toast.error(result.message || t('notification.wechatclawbot.statusLoadFailed'))
      }
    }
  } catch (error) {
    console.error(error)
    clearWechatClawBotTimer()
    if (showErrorToast) {
      $toast.error(t('notification.wechatclawbot.statusLoadFailed'))
    }
  } finally {
    if (!silent) {
      wechatClawBotLoading.value = false
    }
  }
}

/** 刷新微信客服登录二维码。 */
async function refreshWechatClawBotQrcode(options: WechatClawBotRefreshOptions = {}) {
  const { silent = false, showToast = true } = options
  if (!notificationInfo.value.name) {
    return
  }
  if (!silent) {
    wechatClawBotActionLoading.value = true
  }
  try {
    const result: { [key: string]: any } = await api.post('notification/wechatclawbot/refresh', null, {
      params: getWechatClawBotRequestParams(),
    })
    if (result.success) {
      wechatClawBotStatus.value = result.data
      await updateWechatClawBotQrImage(result.data)
      wechatClawBotExpiredRefreshAttempted.value = false
      scheduleWechatClawBotRefresh()
      if (showToast) {
        $toast.success(t('notification.wechatclawbot.qrcodeRefreshSuccess'))
      }
    } else {
      if (showToast) {
        $toast.error(result.message || t('notification.wechatclawbot.qrcodeRefreshFailed'))
      }
    }
  } catch (error) {
    console.error(error)
    if (showToast) {
      $toast.error(t('notification.wechatclawbot.qrcodeRefreshFailed'))
    }
  } finally {
    if (!silent) {
      wechatClawBotActionLoading.value = false
    }
  }
}

/** 退出当前微信客服登录会话。 */
async function logoutWechatClawBot() {
  if (!notificationInfo.value.name) {
    return
  }
  wechatClawBotActionLoading.value = true
  try {
    const result: { [key: string]: any } = await api.post('notification/wechatclawbot/logout', null, {
      params: getWechatClawBotRequestParams(),
    })
    if (result.success) {
      $toast.success(result.message || t('notification.wechatclawbot.logoutSuccess'))
      await fetchWechatClawBotStatus({
        autoGenerateQrcode: true,
        autoRefreshExpired: true,
      })
    } else {
      $toast.error(result.message || t('notification.wechatclawbot.logoutFailed'))
    }
  } catch (error) {
    console.error(error)
    $toast.error(t('notification.wechatclawbot.logoutFailed'))
  } finally {
    wechatClawBotActionLoading.value = false
  }
}

/** 格式化微信客服返回的时间戳。 */
function formatWechatClawBotTime(timestamp?: number | null) {
  if (!timestamp) {
    return ''
  }
  return new Date(timestamp * 1000).toLocaleString()
}

const wechatClawBotStatusText = computed(() => {
  const status = (wechatClawBotStatus.value?.qrcode_status || '').toLowerCase()
  if (wechatClawBotStatus.value?.connected) {
    return t('notification.wechatclawbot.connected')
  }
  if (status === 'scanned') {
    return t('notification.wechatclawbot.scanned')
  }
  if (status === 'expired') {
    return t('notification.wechatclawbot.expired')
  }
  if (status === 'confirmed') {
    return t('notification.wechatclawbot.confirmed')
  }
  return t('notification.wechatclawbot.waiting')
})

watch(notificationInfoDialog, value => {
  if (!value) {
    clearWechatClawBotTimer()
    wechatClawBotQrImage.value = ''
    wechatClawBotExpiredRefreshAttempted.value = false
  }
})


onMounted(() => {
  openNotificationInfoDialog()
})
</script>

<template>
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
        <VDialogCloseBtn v-model="notificationInfoDialog" />
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
            <VRow v-else-if="notificationInfo.type == 'wechatclawbot'">
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
                  v-model="notificationInfo.config.WECHATCLAWBOT_BASE_URL"
                  :label="t('notification.wechatclawbot.baseUrl')"
                  :hint="t('notification.wechatclawbot.baseUrlHint')"
                  persistent-hint
                  prepend-inner-icon="mdi-web"
                />
              </VCol>
              <VCol cols="12" md="6">
                <VTextField
                  v-model="notificationInfo.config.WECHATCLAWBOT_DEFAULT_TARGET"
                  :label="t('notification.wechatclawbot.defaultTarget')"
                  :placeholder="t('notification.wechatclawbot.defaultTargetPlaceholder')"
                  :hint="t('notification.wechatclawbot.defaultTargetHint')"
                  persistent-hint
                  prepend-inner-icon="mdi-account-arrow-right"
                />
              </VCol>
              <VCol cols="12" md="6">
                <VTextField
                  v-model="notificationInfo.config.WECHATCLAWBOT_ADMINS"
                  :label="t('notification.wechatclawbot.admins')"
                  :placeholder="t('notification.wechatclawbot.adminsPlaceholder')"
                  :hint="t('notification.wechatclawbot.adminsHint')"
                  persistent-hint
                  prepend-inner-icon="mdi-account-supervisor"
                />
              </VCol>
              <VCol cols="12" md="6">
                <VTextField
                  v-model="notificationInfo.config.WECHATCLAWBOT_POLL_TIMEOUT"
                  :label="t('notification.wechatclawbot.pollTimeout')"
                  :hint="t('notification.wechatclawbot.pollTimeoutHint')"
                  persistent-hint
                  type="number"
                  prepend-inner-icon="mdi-timer-outline"
                />
              </VCol>
              <VCol cols="12">
                <VCard variant="tonal" class="pa-4">
                  <div class="d-flex flex-wrap align-center justify-space-between gap-3 mb-3">
                    <div>
                      <div class="text-subtitle-1 font-weight-medium">{{ t('notification.wechatclawbot.loginStatus') }}</div>
                      <div class="text-body-2 text-medium-emphasis">{{ wechatClawBotStatusText }}</div>
                    </div>
                    <div class="d-flex flex-wrap gap-2">
                      <VBtn
                        size="small"
                        variant="tonal"
                        :loading="wechatClawBotLoading"
                        @click.stop="fetchWechatClawBotStatus({ autoGenerateQrcode: true, autoRefreshExpired: true })"
                      >
                        {{ t('common.refresh') }}
                      </VBtn>
                      <VBtn
                        size="small"
                        color="primary"
                        variant="tonal"
                        :loading="wechatClawBotActionLoading"
                        @click.stop="refreshWechatClawBotQrcode"
                      >
                        {{ t('notification.wechatclawbot.refreshQrcode') }}
                      </VBtn>
                      <VBtn
                        size="small"
                        color="error"
                        variant="tonal"
                        :loading="wechatClawBotActionLoading"
                        :disabled="!wechatClawBotStatus?.connected"
                        @click.stop="logoutWechatClawBot"
                      >
                        {{ t('notification.wechatclawbot.logout') }}
                      </VBtn>
                    </div>
                  </div>
                  <VRow>
                    <VCol cols="12" md="5">
                      <div class="rounded text-center p-3 border h-100 d-flex align-center justify-center min-h-[16rem]">
                        <VImg
                          v-if="wechatClawBotQrImage"
                          :src="wechatClawBotQrImage"
                          width="220"
                          height="220"
                          class="mx-auto"
                        />
                        <VProgressCircular v-else-if="wechatClawBotLoading" indeterminate color="primary" />
                        <div v-else class="text-body-2 text-medium-emphasis">
                          {{ t('notification.wechatclawbot.noQrcode') }}
                        </div>
                      </div>
                    </VCol>
                    <VCol cols="12" md="7">
                      <VAlert variant="tonal" :type="wechatClawBotStatus?.connected ? 'success' : 'info'" class="mb-3">
                        <div class="text-body-2">{{ t('notification.wechatclawbot.scanHint') }}</div>
                        <div v-if="wechatClawBotStatus?.account_id" class="mt-2">
                          {{ t('notification.wechatclawbot.accountId') }}: {{ wechatClawBotStatus.account_id }}
                        </div>
                        <div v-if="wechatClawBotStatus?.qrcode_updated_at" class="mt-2">
                          {{ t('notification.wechatclawbot.qrcodeUpdatedAt') }}:
                          {{ formatWechatClawBotTime(wechatClawBotStatus.qrcode_updated_at) }}
                        </div>
                      </VAlert>
                      <div class="text-subtitle-2 mb-2">{{ t('notification.wechatclawbot.knownTargets') }}</div>
                      <VList v-if="wechatClawBotStatus?.known_targets?.length" density="compact" class="border rounded">
                        <VListItem
                          v-for="item in wechatClawBotStatus.known_targets"
                          :key="item.userid"
                          :title="item.username || item.userid"
                          :subtitle="`${item.userid}${item.last_active ? ` · ${formatWechatClawBotTime(item.last_active)}` : ''}`"
                        />
                      </VList>
                      <div v-else class="text-body-2 text-medium-emphasis">
                        {{ t('notification.wechatclawbot.noKnownTargets') }}
                      </div>
                    </VCol>
                  </VRow>
                </VCard>
              </VCol>
            </VRow>
            <VRow v-else-if="notificationInfo.type == 'feishu'">
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
                  v-model="notificationInfo.config.FEISHU_APP_ID"
                  :label="t('notification.feishu.appId')"
                  :hint="t('notification.feishu.appIdHint')"
                  persistent-hint
                  prepend-inner-icon="mdi-application"
                />
              </VCol>
              <VCol cols="12" md="6">
                <VTextField
                  v-model="notificationInfo.config.FEISHU_APP_SECRET"
                  :label="t('notification.feishu.appSecret')"
                  :hint="t('notification.feishu.appSecretHint')"
                  persistent-hint
                  prepend-inner-icon="mdi-key"
                />
              </VCol>
              <VCol cols="12" md="6">
                <VTextField
                  v-model="notificationInfo.config.FEISHU_OPEN_ID"
                  :label="t('notification.feishu.openId')"
                  :placeholder="t('notification.feishu.openIdPlaceholder')"
                  :hint="t('notification.feishu.openIdHint')"
                  persistent-hint
                  prepend-inner-icon="mdi-account"
                />
              </VCol>
              <VCol cols="12" md="6">
                <VTextField
                  v-model="notificationInfo.config.FEISHU_CHAT_ID"
                  :label="t('notification.feishu.chatId')"
                  :placeholder="t('notification.feishu.chatIdPlaceholder')"
                  :hint="t('notification.feishu.chatIdHint')"
                  persistent-hint
                  prepend-inner-icon="mdi-chat-processing"
                />
              </VCol>
              <VCol cols="12" md="6">
                <VTextField
                  v-model="notificationInfo.config.FEISHU_ADMINS"
                  :label="t('notification.feishu.admins')"
                  :placeholder="t('notification.feishu.adminsPlaceholder')"
                  :hint="t('notification.feishu.adminsHint')"
                  persistent-hint
                  prepend-inner-icon="mdi-account-supervisor"
                />
              </VCol>
              <VCol cols="12" md="6">
                <VTextField
                  v-model="notificationInfo.config.FEISHU_VERIFICATION_TOKEN"
                  :label="t('notification.feishu.verificationToken')"
                  :hint="t('notification.feishu.verificationTokenHint')"
                  persistent-hint
                  prepend-inner-icon="mdi-shield-key"
                />
              </VCol>
              <VCol cols="12" md="6">
                <VTextField
                  v-model="notificationInfo.config.FEISHU_ENCRYPT_KEY"
                  :label="t('notification.feishu.encryptKey')"
                  :hint="t('notification.feishu.encryptKeyHint')"
                  persistent-hint
                  prepend-inner-icon="mdi-lock"
                />
              </VCol>
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
              <VCol cols="12" md="6">
                <VTextField
                  v-model="notificationInfo.config.SLACK_ADMINS"
                  :label="t('notification.slack.admins')"
                  :placeholder="t('notification.slack.adminsPlaceholder')"
                  :hint="t('notification.slack.adminsHint')"
                  persistent-hint
                  prepend-inner-icon="mdi-account-supervisor"
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
              <VCol cols="12" md="6">
                <VTextField
                  v-model="notificationInfo.config.DISCORD_ADMINS"
                  :label="t('notification.discord.admins')"
                  :placeholder="t('notification.discord.adminsPlaceholder')"
                  :hint="t('notification.discord.adminsHint')"
                  persistent-hint
                  prepend-inner-icon="mdi-account-supervisor"
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
              <VCol cols="12" md="6">
                <VTextField
                  v-model="notificationInfo.config.SYNOLOGYCHAT_ADMINS"
                  :label="t('notification.synologychat.admins')"
                  :placeholder="t('notification.synologychat.adminsPlaceholder')"
                  :hint="t('notification.synologychat.adminsHint')"
                  persistent-hint
                  prepend-inner-icon="mdi-account-supervisor"
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
              <VCol cols="12" md="6">
                <VTextField
                  v-model="notificationInfo.config.VOCECHAT_ADMINS"
                  :label="t('notification.vocechat.admins')"
                  :placeholder="t('notification.vocechat.adminsPlaceholder')"
                  :hint="t('notification.vocechat.adminsHint')"
                  persistent-hint
                  prepend-inner-icon="mdi-account-supervisor"
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
              <VCol cols="12" md="6">
                <VTextField
                  v-model="notificationInfo.config.QQBOT_ADMINS"
                  :label="t('notification.qqbot.admins')"
                  :placeholder="t('notification.qqbot.adminsPlaceholder')"
                  :hint="t('notification.qqbot.adminsHint')"
                  persistent-hint
                  prepend-inner-icon="mdi-account-supervisor"
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
        <VCardActions class="app-dialog-actions">
          <VSpacer />
          <VBtn
            color="primary"
            variant="flat"
            @click="saveNotificationInfo"
            prepend-icon="mdi-content-save"
            class="px-5"
          >
            {{ t('common.confirm') }}
          </VBtn>
        </VCardActions>
      </VCard>
  </VDialog>
</template>
