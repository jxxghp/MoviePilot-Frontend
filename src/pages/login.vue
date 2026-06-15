<script setup lang="ts">
import type { Component } from 'vue'
import { VForm } from 'vuetify/components/VForm'
import { useAuthStore, useUserStore } from '@/stores'
import { authState, userState } from '@/stores/types'
import { requiredValidator } from '@/@validators'
import api from '@/api'
import router from '@/router'
import logo from '@images/logo.png'
import { bufferToBase64Url, base64UrlToUint8Array, urlBase64ToUint8Array } from '@/@core/utils/navigator'
import { SUPPORTED_LOCALES, SupportedLocale } from '@/types/i18n'
import { getCurrentLocale, setI18nLanguage } from '@/plugins/i18n'
import { useTheme } from 'vuetify'
import { getNavMenus } from '@/router/i18n-menu'
import { buildUserPermissionContext, filterMenusByPermission } from '@/utils/permission'
import type { ApiResponse } from '@/api/types'
import { openSharedDialog } from '@/composables/useSharedDialog'
import { loadRemoteComponentFromModule, type RemoteModule } from '@/utils/federationLoader'

const LoginMfaDialog = defineAsyncComponent(() => import('@/components/dialog/LoginMfaDialog.vue'))

// 国际化
const { t, te } = useI18n()

// 应用版本号（构建时注入，形如 v2.13.10）
const appVersion = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : ''

// 版权年份
const copyrightYear = new Date().getFullYear()

// 认证 Store
const authStore = useAuthStore()
//用户 Store
const userStore = useUserStore()
// 获取有权限的菜单
const navMenus = computed(() => getNavMenus(t))

// 表单
const form = ref({
  username: '',
  password: '',
  otp_password: '',
  remember: true,
})

const refForm = ref<InstanceType<typeof VForm> | null>(null)

// 密码输入
const isPasswordVisible = ref(false)

// 错误信息
const errorMessage = ref('')

// 是否开启双重验证
const isOTP = ref(false)

// 二次验证对话框
const mfaDialog = ref(false)

// MFA PassKey loading
const mfaPasskeyLoading = ref(false)
let mfaDialogController: ReturnType<typeof openSharedDialog> | null = null

// 用户名称输入框
const usernameInput = ref()

// 登录自动填充同步的延时任务
const autofillSyncTimerIds: number[] = []

// 语言选择菜单
const langMenu = ref(false)

// 当前语言
const currentLocale = ref(getCurrentLocale())

// 当前主题
const vuetifyTheme = useTheme()

// 判断是否为透明主题
const isTransparentTheme = computed(() => {
  return vuetifyTheme.name.value === 'transparent'
})

// 可用的语言列表
const locales = Object.values(SUPPORTED_LOCALES)

// 登录按钮 loading
const loading = ref(false)

// PassKey 登录按钮 loading
const passkeyLoading = ref(false)

// Conditional UI 的 AbortController
let conditionalAbortController: AbortController | null = null

// 手动模式的 AbortController（用于防止重复点击）
let manualAbortController: AbortController | null = null

// 标记当前是否有手动模式的 PassKey 请求正在进行
let isManualPassKeyActive = false

interface LoginAuthProvider {
  id: string
  type: 'system' | 'plugin'
  method?: string
  name: string
  icon?: string
  enabled?: boolean
  plugin_id?: string
  component?: string
  remote?: RemoteModule
}

interface PluginAuthPayload {
  ticket?: string
}

// 登录认证提供方
const authProviders = ref<LoginAuthProvider[]>([])
const selectedAuthProvider = ref<LoginAuthProvider | null>(null)
const RemoteAuthView = shallowRef<Component | null>(null)
const pluginAuthDialog = ref(false)
const pluginAuthLoading = ref(false)
const pluginAuthError = ref('')

const systemPasskeyProvider = computed(() =>
  authProviders.value.find(provider => provider.type === 'system' && provider.method === 'passkey'),
)
const pluginAuthProviders = computed(() =>
  authProviders.value.filter(provider => provider.type === 'plugin' && provider.remote && provider.enabled !== false),
)
const showPasskeyLogin = computed(() => !!systemPasskeyProvider.value?.enabled)

// 获取登录表单中的原生账号和密码输入框。
function getLoginCredentialInputs() {
  const formElement = refForm.value?.$el as HTMLFormElement | undefined
  const root = formElement || document

  return {
    username: root.querySelector<HTMLInputElement>('input[name="username"]'),
    password: root.querySelector<HTMLInputElement>('input[name="password"]'),
  }
}

// 将密码管理器写入 DOM 的账号密码同步回响应式表单。
function syncLoginCredentialValues() {
  const { username, password } = getLoginCredentialInputs()

  if (username && username.value !== form.value.username) {
    form.value.username = username.value
  }

  if (password && password.value !== form.value.password) {
    form.value.password = password.value
  }
}

// 清理尚未执行的登录自动填充同步任务。
function clearLoginAutofillSyncTimers() {
  autofillSyncTimerIds.forEach(timerId => window.clearTimeout(timerId))
  autofillSyncTimerIds.length = 0
}

// 延迟多次同步自动填充值，兼容只对聚焦字段派发事件的密码管理器。
function scheduleLoginAutofillSync() {
  clearLoginAutofillSyncTimers()
  syncLoginCredentialValues()
  autofillSyncTimerIds.push(window.setTimeout(syncLoginCredentialValues, 50))
  autofillSyncTimerIds.push(window.setTimeout(syncLoginCredentialValues, 250))
}

// 生成 MFA 共享弹窗使用的最新 props。
function getMfaDialogProps() {
  return {
    errorMessage: errorMessage.value,
    otpPassword: form.value.otp_password,
    passkeyLoading: mfaPasskeyLoading.value,
  }
}

// 打开 MFA 共享弹窗。
function openMfaDialog() {
  mfaDialog.value = true
  const dialogProps = getMfaDialogProps()
  if (mfaDialogController) {
    mfaDialogController.updateProps(dialogProps)
    return
  }

  mfaDialogController = openSharedDialog(
    LoginMfaDialog,
    dialogProps,
    {
      close: closeMfaDialog,
      otp: loginWithOTP,
      passkey: verifyWithPassKey,
      'update:otpPassword': (value: string) => {
        form.value.otp_password = value
      },
    },
    { closeOn: ['close'] },
  )
}

// 关闭 MFA 共享弹窗。
function closeMfaDialog() {
  mfaDialog.value = false
  mfaDialogController?.close()
  mfaDialogController = null
}

// 加载未登录可用的认证提供方。
async function loadAuthProviders() {
  try {
    const result = (await api.get('auth/providers')) as LoginAuthProvider[]
    authProviders.value = Array.isArray(result) ? result : []
  } catch (error) {
    console.error('加载认证提供方失败:', error)
    authProviders.value = []
  }
}

// 打开插件认证联邦页面。
async function openPluginAuth(provider: LoginAuthProvider) {
  if (!provider.remote) return
  selectedAuthProvider.value = provider
  RemoteAuthView.value = null
  pluginAuthError.value = ''
  pluginAuthLoading.value = true
  pluginAuthDialog.value = true
  try {
    RemoteAuthView.value = (await loadRemoteComponentFromModule(
      provider.remote,
      provider.component || 'AuthPage',
    )) as Component
  } catch (error: any) {
    console.error('加载插件认证页面失败:', error)
    pluginAuthError.value = error?.message || t('login.authFailure')
  } finally {
    pluginAuthLoading.value = false
  }
}

// 关闭插件认证弹窗。
function closePluginAuth() {
  pluginAuthDialog.value = false
  selectedAuthProvider.value = null
  RemoteAuthView.value = null
  pluginAuthError.value = ''
}

// 兑换插件认证票据并完成系统登录。
async function exchangePluginAuthTicket(ticket: string) {
  pluginAuthLoading.value = true
  try {
    const response: any = await api.post('auth/exchange', { ticket })
    closePluginAuth()
    await handleLoginSuccess(response)
  } catch (error: any) {
    console.error('插件认证票据兑换失败:', error)
    pluginAuthError.value = error?.response?.data?.detail || error?.message || t('login.authFailure')
  } finally {
    pluginAuthLoading.value = false
  }
}

// 处理插件认证成功事件。
async function handlePluginAuthenticated(payload: PluginAuthPayload) {
  if (!payload?.ticket) {
    pluginAuthError.value = t('login.authFailure')
    return
  }
  await exchangePluginAuthTicket(payload.ticket)
}

// 处理插件认证失败事件。
function handlePluginAuthError(error: any) {
  pluginAuthError.value = error?.message || String(error || '') || t('login.authFailure')
}

// PassKey 认证核心函数 - 处理 WebAuthn 认证流程
interface PassKeyAuthOptions {
  username?: string // 可选的用户名,用于 MFA 场景
  isConditional?: boolean // 是否为 Conditional UI 模式
  signal?: AbortSignal // AbortController 信号
}

// PassKey API 响应类型
interface PassKeyStartResponse {
  options: string // JSON 字符串
  challenge: string
}

interface PassKeyFinishResponse {
  access_token: string
  super_user: boolean
  user_id: number
  user_name: string
  avatar: string
  level: number
  permissions: Record<string, boolean>
  wizard: boolean
}

async function authenticateWithPassKey(options: PassKeyAuthOptions = {}): Promise<PassKeyFinishResponse> {
  const { username, isConditional = false, signal } = options

  // 1. 开始认证流程
  const startResponse = (await api.post(
    '/mfa/passkey/authenticate/start',
    username ? { username } : {},
  )) as ApiResponse<PassKeyStartResponse>

  if (!startResponse.success) {
    throw new Error(startResponse.message || 'PassKey start failed')
  }

  const { options: optionsStr, challenge } = startResponse.data
  const publicKeyOptions = JSON.parse(optionsStr)

  // 2. 调用WebAuthn API
  const credentialRequestOptions: CredentialRequestOptions = {
    publicKey: {
      ...publicKeyOptions,
      challenge: base64UrlToUint8Array(publicKeyOptions.challenge),
      allowCredentials: publicKeyOptions.allowCredentials?.map((cred: any) => ({
        ...cred,
        id: base64UrlToUint8Array(cred.id),
      })),
    },
  }

  // 如果是 Conditional UI 模式，添加 mediation 和 signal
  if (isConditional) {
    credentialRequestOptions.mediation = 'conditional'
    if (signal) {
      credentialRequestOptions.signal = signal
    }
  }

  const credential = await navigator.credentials.get(credentialRequestOptions)

  // Conditional UI 模式下，用户选择通行密钥后才显示 loading
  if (isConditional) {
    passkeyLoading.value = true
  }

  if (!credential) {
    throw new Error('No credential selected')
  }

  // 3. 转换credential为可传输格式
  const publicKeyCredential = credential as PublicKeyCredential
  const assertionResponse = publicKeyCredential.response as AuthenticatorAssertionResponse
  const credentialJSON = {
    id: publicKeyCredential.id,
    rawId: bufferToBase64Url(publicKeyCredential.rawId),
    type: publicKeyCredential.type,
    response: {
      authenticatorData: bufferToBase64Url(assertionResponse.authenticatorData),
      clientDataJSON: bufferToBase64Url(assertionResponse.clientDataJSON),
      signature: bufferToBase64Url(assertionResponse.signature),
      userHandle: assertionResponse.userHandle ? bufferToBase64Url(assertionResponse.userHandle) : null,
    },
  }

  // 4. 完成认证
  const finishResponse = (await api.post('/mfa/passkey/authenticate/finish', {
    credential: credentialJSON,
    challenge: challenge,
  })) as PassKeyFinishResponse

  if (!finishResponse || !finishResponse.access_token) {
    throw new Error('PassKey finish failed: No access token')
  }

  return finishResponse
}

// 统一处理 PassKey 认证流程
async function handlePassKeyAuth(
  authOptions: PassKeyAuthOptions,
  setLoading: (loading: boolean) => void,
  onSuccess: (response: PassKeyFinishResponse) => Promise<void>,
) {
  const { isConditional = false } = authOptions
  errorMessage.value = ''

  // 检查浏览器环境
  if (!window.PublicKeyCredential) {
    if (!isConditional) {
      if (!window.isSecureContext) {
        errorMessage.value = t('login.passkeySecureContextRequired')
      } else {
        errorMessage.value = t('login.passkeyNotSupported')
      }
    }
    return
  }

  // 如果是手动触发(非 Conditional UI)
  if (!isConditional) {
    // 取消之前的 Conditional UI 请求
    if (conditionalAbortController) {
      conditionalAbortController.abort()
      conditionalAbortController = null
    }

    // 取消之前的手动请求（防止重复点击）
    if (manualAbortController) {
      manualAbortController.abort()
    }

    // 创建新的 AbortController
    manualAbortController = new AbortController()

    // 标记手动请求为活跃状态，并立即设置 loading
    isManualPassKeyActive = true
    setLoading(true)
  }

  try {
    const finishResponse = await authenticateWithPassKey({
      ...authOptions,
      signal:
        isConditional && conditionalAbortController
          ? conditionalAbortController.signal
          : !isConditional && manualAbortController
            ? manualAbortController.signal
            : undefined,
    })

    await onSuccess(finishResponse)
  } catch (error: any) {
    // Conditional UI 模式下：
    // 1. 如果 loading 为 false，说明错误发生在用户选择密钥之前（如初始化失败、用户取消等），此时应静默
    // 2. 如果是 AbortError，始终静默
    if (isConditional && (!passkeyLoading.value || error.name === 'AbortError')) {
      console.warn('[PassKey] Conditional UI silenced error:', error)
      return
    }

    // 手动模式下的 AbortError 也应该静默（用户重复点击导致）
    if (!isConditional && error.name === 'AbortError') {
      console.warn('[PassKey] Manual request aborted (likely due to rapid clicking):', error)
      return
    }

    // 设置错误信息
    if (error.name === 'NotAllowedError') {
      errorMessage.value = t('login.passkeyAuthCanceled')
    } else if (error.name === 'NotSupportedError') {
      errorMessage.value = t('login.passkeyNotSupported')
    } else if (error.message?.includes('start failed')) {
      errorMessage.value = t('login.passkeyLoginStartFailed')
    } else {
      errorMessage.value = t('login.authFailure')
    }
  } finally {
    // 清除 loading 状态
    if (!isConditional) {
      // 手动模式：始终清除，并取消手动活跃标记
      isManualPassKeyActive = false
      setLoading(false)
      manualAbortController = null
    } else {
      // Conditional UI 模式：只有在没有手动请求活跃时才清除
      if (!isManualPassKeyActive && passkeyLoading.value) {
        passkeyLoading.value = false
      }
    }
  }
}

// 使用PassKey登录 (支持 Conditional UI)
async function loginWithPassKey(isConditional = false) {
  await handlePassKeyAuth(
    { isConditional },
    val => (passkeyLoading.value = val),
    async response => {
      await handleLoginSuccess(response)
    },
  )
}

// 切换语言
async function switchLanguage(locale: SupportedLocale) {
  await setI18nLanguage(locale)
  currentLocale.value = locale
  langMenu.value = false
}

// 订阅推送通知
async function subscribeForPushNotifications() {
  if ('serviceWorker' in navigator && 'PushManager' in window) {
    const registration = await navigator.serviceWorker.ready
    // 获取订阅信息
    const subscription = await registration.pushManager.getSubscription().then(function (subscription) {
      if (subscription === null) {
        const convertedVapidKey = urlBase64ToUint8Array(import.meta.env.VITE_PUBLIC_VAPID_KEY)
        return registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: convertedVapidKey,
        })
      } else {
        return subscription
      }
    })
    // 发送订阅请求
    try {
      await api.post('/message/webpush/subscribe', subscription)
    } catch (e) {
      console.error(e)
    }
  }
}

// 登录后处理
async function afterLogin(superuser: boolean, userPayload: userState, filteredMenus: any[]) {
  // 如果需要显示设置向导，跳转到设置向导页面
  if (userPayload.wizard) {
    router.push('/setup-wizard')
  } else {
    // 如果有原始路径，优先跳转到原始路径
    if (authStore.originalPath && authStore.originalPath !== '/') {
      router.push(authStore.originalPath)
    } else {
      // 跳转到第一个有权限的菜单
      router.push(filteredMenus[0].to)
    }
  }

  // 订阅推送通知
  if (superuser) await subscribeForPushNotifications()
}

// 处理登录成功
async function handleLoginSuccess(response: any) {
  const userPayload: userState = {
    superUser: response.super_user,
    userID: response.user_id,
    userName: response.user_name,
    avatar: response.avatar,
    level: response.level,
    permissions: response.permissions,
    wizard: response.wizard,
  }

  const userPermissions = buildUserPermissionContext(userPayload.superUser, userPayload.permissions)

  const filteredMenus = filterMenusByPermission(navMenus.value, userPermissions)
  if (filteredMenus.length === 0) {
    errorMessage.value = t('login.noPermission')
    return
  }

  const authPayLoad: authState = {
    token: response.access_token,
    remember: form.value.remember,
  }

  authStore.login(authPayLoad)
  userStore.loginUser(userPayload)

  await afterLogin(userPayload.superUser, userPayload, filteredMenus)
}

// 登录获取token事件
async function login() {
  errorMessage.value = ''

  // 进行表单校验
  if (!form.value.username || !form.value.password) {
    return
  }

  // 登录按钮 loading
  loading.value = true

  try {
    // 用户名密码
    const formData = new FormData()

    formData.append('username', form.value.username)
    formData.append('password', form.value.password)
    formData.append('otp_password', form.value.otp_password)

    // 请求token
    const response: any = await api.post('/login/access-token', formData, {
      headers: {
        Accept: 'application/json', // 设置 Accept 类型
      },
    })

    await handleLoginSuccess(response)
  } catch (error: any) {
    // 登录失败，显示错误提示
    if (!error.response) {
      errorMessage.value = t('login.networkError')
      return
    }

    switch (error.response.status) {
      case 401:
        // 401错误可能是需要MFA或者认证失败
        // 检查响应头是否有MFA要求标识
        if (error.response.headers?.['x-mfa-required'] === 'true' && !form.value.otp_password) {
          // 需要MFA验证，弹出对话框
          isOTP.value = true
          openMfaDialog()
          return
        }
        // 不需要MFA或已填写OTP但认证失败
        errorMessage.value = t('login.authFailure')
        // 认证失败后清空OTP密码，防止下次点击不弹出对话框
        form.value.otp_password = ''
        break
      case 403:
        errorMessage.value = t('login.permissionDenied')
        break
      case 500:
        errorMessage.value = t('login.serverError')
        break
      default:
        errorMessage.value = `${t('login.authFailure')} (Status: ${error.response.status})`
    }
  } finally {
    loading.value = false
  }
}

// 使用OTP码继续登录
function loginWithOTP() {
  closeMfaDialog()
  login()
}

// 使用PassKey进行MFA验证
async function verifyWithPassKey() {
  if (!form.value.username) return

  await handlePassKeyAuth(
    { username: form.value.username },
    val => (mfaPasskeyLoading.value = val),
    async response => {
      // 关闭MFA对话框
      closeMfaDialog()
      await handleLoginSuccess(response)
    },
  )
}

watch([mfaPasskeyLoading, errorMessage, () => form.value.otp_password], () => {
  mfaDialogController?.updateProps(getMfaDialogProps())
})

// 自动登录
onMounted(async () => {
  // 获取token和remember状态
  const token = authStore.token
  const remember = authStore.remember

  // 如果token存在，且保持登录状态为true，则跳转到首页
  if (token && remember) {
    router.push('/')
    return
  }

  // 加载系统和插件声明的未登录认证入口
  await loadAuthProviders()

  // 初始化 Conditional UI 的 PassKey 自动填充
  await initConditionalPasskey()
})

// 初始化 Conditional UI 的 PassKey 自动填充
async function initConditionalPasskey() {
  // 检查浏览器是否支持 WebAuthn 和 Conditional UI
  if (!window.PublicKeyCredential || !PublicKeyCredential.isConditionalMediationAvailable) {
    return
  }

  try {
    const available = await PublicKeyCredential.isConditionalMediationAvailable()
    if (!available) {
      return
    }

    // 安全防御：如果已存在 controller，先 abort 掉旧的，防止重复调用产生幽灵请求
    if (conditionalAbortController) {
      conditionalAbortController.abort()
      conditionalAbortController = null
    }

    // 创建 AbortController 用于取消请求
    conditionalAbortController = new AbortController()

    // 启动 Conditional UI 模式的 PassKey 认证
    await loginWithPassKey(true)
  } catch (error) {
    console.error('[PassKey] Failed to initialize Conditional UI:', error)
  }
}

// 组件卸载时清理
onUnmounted(() => {
  if (conditionalAbortController) {
    conditionalAbortController.abort()
    conditionalAbortController = null
  }
  if (manualAbortController) {
    manualAbortController.abort()
    manualAbortController = null
  }
  clearLoginAutofillSyncTimers()
})
</script>

<template>
  <!-- 登录页面容器 -->
  <div class="login-root">
    <!-- 顶部漂浮语言切换 -->
    <VMenu v-model="langMenu" :close-on-content-click="false">
      <template #activator="{ props }">
        <VBtn variant="text" size="small" v-bind="props" class="lang-switch-btn">
          <span v-if="SUPPORTED_LOCALES[currentLocale].flag">{{ SUPPORTED_LOCALES[currentLocale].flag }}</span>
          <VIcon v-else icon="mdi-translate" />
          <span class="ms-1">{{ SUPPORTED_LOCALES[currentLocale].title }}</span>
        </VBtn>
      </template>
      <VCard min-width="180">
        <VList>
          <VListItem
            v-for="locale in locales"
            :key="locale.name"
            :value="locale.name"
            @click="switchLanguage(locale.name as SupportedLocale)"
          >
            <template #prepend>
              <span v-if="locale.flag" class="mr-2">{{ locale.flag }}</span>
              <VIcon v-else icon="mdi-translate" size="small" />
            </template>
            <VListItemTitle>{{ locale.title }}</VListItemTitle>
          </VListItem>
        </VList>
      </VCard>
    </VMenu>

    <!-- 登录表单 -->
    <div v-if="!mfaDialog" class="auth-wrapper d-flex align-center justify-center">
      <VCard
        class="auth-card login-card pa-7 pa-sm-8 w-full h-full login-card--enter"
        :class="{ 'glass-effect': !isTransparentTheme }"
        max-width="23rem"
        flat
      >
        <!-- 卡片头部：Logo + 标题 + 标语 -->
        <div class="login-head">
          <VImg :src="logo" width="68" height="68" class="login-logo" />
          <h1 class="login-title">MoviePilot</h1>
        </div>

        <VCardText class="login-body">
          <VForm ref="refForm" autocomplete="on" @submit.prevent="login">
            <VRow>
              <!-- username -->
              <VCol cols="12">
                <VTextField
                  ref="usernameInput"
                  v-model="form.username"
                  :label="t('login.username')"
                  type="text"
                  name="username"
                  id="username"
                  autocomplete="username"
                  :rules="[requiredValidator]"
                  hide-details
                  variant="outlined"
                  density="comfortable"
                  @input="scheduleLoginAutofillSync"
                  @change="scheduleLoginAutofillSync"
                />
              </VCol>
              <!-- password -->
              <VCol cols="12">
                <VTextField
                  v-model="form.password"
                  :label="t('login.password')"
                  :type="isPasswordVisible ? 'text' : 'password'"
                  name="password"
                  id="password"
                  autocomplete="current-password"
                  :append-inner-icon="isPasswordVisible ? 'mdi-eye-off-outline' : 'mdi-eye-outline'"
                  :rules="[requiredValidator]"
                  hide-details
                  variant="outlined"
                  density="comfortable"
                  @click:append-inner="isPasswordVisible = !isPasswordVisible"
                  @input="scheduleLoginAutofillSync"
                  @change="scheduleLoginAutofillSync"
                />
              </VCol>
              <VCol cols="12" class="py-0">
                <!-- remember me checkbox -->
                <div class="d-flex align-center justify-space-between flex-wrap">
                  <VCheckbox
                    v-model="form.remember"
                    :label="t('login.stayLoggedIn')"
                    required
                    hide-details
                    density="compact"
                  />
                </div>
              </VCol>
              <VCol cols="12">
                <!-- login button -->
                <VBtn block type="submit" prepend-icon="mdi-login" :loading="loading" size="large" class="login-submit">
                  {{ t('login.login') }}
                </VBtn>

                <!-- or divider -->
                <div v-if="showPasskeyLogin || pluginAuthProviders.length > 0" class="or-divider my-5">
                  <span class="or-divider-text">{{ t('login.orDivider') }}</span>
                </div>

                <!-- passkey login button -->
                <VBtn
                  v-if="showPasskeyLogin"
                  block
                  variant="outlined"
                  color="success"
                  class="passkey-btn"
                  prepend-icon="material-symbols:passkey"
                  :loading="passkeyLoading"
                  @click="loginWithPassKey(false)"
                >
                  {{ t('login.loginWithPasskey') }}
                </VBtn>
                <VBtn
                  v-for="provider in pluginAuthProviders"
                  :key="provider.id"
                  block
                  variant="outlined"
                  color="primary"
                  class="mt-3"
                  :prepend-icon="provider.icon || 'mdi-login-variant'"
                  :loading="pluginAuthLoading && selectedAuthProvider?.id === provider.id"
                  @click="openPluginAuth(provider)"
                >
                  {{ provider.name }}
                </VBtn>
                <VAlert v-if="errorMessage" type="error" variant="tonal" class="mt-3">
                  {{ errorMessage }}
                </VAlert>
              </VCol>
            </VRow>
          </VForm>
        </VCardText>

        <!-- 卡片页脚：版权 + 版本 -->
        <div class="login-foot">
          <span>{{ t('login.copyright', { year: copyrightYear }) }}</span>
          <span v-if="appVersion" class="login-version">{{ appVersion }}</span>
        </div>
      </VCard>
    </div>
    <VDialog v-model="pluginAuthDialog" max-width="520" persistent>
      <VCard>
        <VCardItem>
          <VCardTitle>{{ selectedAuthProvider?.name }}</VCardTitle>
          <template #append>
            <VBtn icon="mdi-close" variant="text" @click="closePluginAuth" />
          </template>
        </VCardItem>
        <VCardText>
          <VSkeletonLoader v-if="pluginAuthLoading && !RemoteAuthView" type="article" />
          <VAlert v-else-if="pluginAuthError" type="error" variant="tonal">
            {{ pluginAuthError }}
          </VAlert>
          <component
            v-else-if="RemoteAuthView && selectedAuthProvider"
            :is="RemoteAuthView"
            :api="api"
            :provider="selectedAuthProvider"
            :plugin-id="selectedAuthProvider.plugin_id"
            @authenticated="handlePluginAuthenticated"
            @error="handlePluginAuthError"
            @close="closePluginAuth"
          />
        </VCardText>
      </VCard>
    </VDialog>
  </div>
</template>

<style lang="scss" scoped>
/* stylelint-disable selector-pseudo-class-no-unknown */

@use '@core/scss/pages/page-auth';

/* ===================== 布局根容器 ===================== */
.login-root {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  isolation: isolate;
  min-block-size: 100vh;
  min-block-size: 100dvh;
}

/* 登录页需要透出 App.vue 注入的壁纸层。 */
:global(.v-application:has(.login-root)) {
  background: transparent !important;
}

/* ===================== 浮动语言切换 ===================== */
.lang-switch-btn {
  position: absolute;
  z-index: 3;
  border: 1px solid rgba(var(--v-border-color), calc(var(--v-border-opacity) * 0.6));
  border-radius: 999px;
  backdrop-filter: blur(10px);
  background: rgba(var(--v-theme-surface), 0.55);
  inset-block-start: calc(env(safe-area-inset-top, 0px) + 16px);
  inset-inline-end: calc(env(safe-area-inset-right, 0px) + 16px);
}

/* ===================== 表单容器 ===================== */
.auth-wrapper {
  position: relative;
  z-index: 2;
  overflow: hidden;
  block-size: auto;
  inline-size: 100%;
  padding-inline: 16px;
}

/* ===================== 玻璃卡片 ===================== */
.login-card {
  position: relative;
  z-index: 1;
  border: none !important;
  border-radius: var(--app-surface-radius, 16px) !important;
  box-shadow: var(
    --app-overlay-shadow,
    0 18px 42px rgba(var(--app-shadow-rgb, 0, 0, 0), 0.14),
    0 6px 18px rgba(var(--app-shadow-rgb, 0, 0, 0), 0.08)
  ) !important;

  /* 顶部高光线，营造立体感 */
  &::before {
    position: absolute;
    background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 40%), transparent);
    block-size: 1px;
    content: '';
    inset-block-start: 0;
    inset-inline: 0;
    pointer-events: none;
  }
}

/* 非透明主题：磨砂玻璃卡片 */
.glass-effect {
  backdrop-filter: blur(24px) saturate(160%) !important;
  background: rgba(var(--v-theme-surface), 0.72) !important;
}

/* 深色主题上叠一条更亮的描边，区分背景 */
:deep(.v-theme--dark) .login-card,
:deep(.v-theme--purple) .login-card,
:deep(.v-theme--transparent) .login-card {
  border: 1px solid rgba(255, 255, 255, 8%) !important;
}

:deep(.v-theme--light) .login-card {
  border: 1px solid rgba(255, 255, 255, 65%) !important;
}

/* ===================== 卡片头部 ===================== */
.login-head {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  margin-block-end: 6px;
  text-align: center;
}

.login-logo {
  filter: drop-shadow(0 6px 16px rgba(var(--v-theme-primary), 0.35));
  margin-block-end: 4px;
}

.login-title {
  margin: 0;
  background: linear-gradient(120deg, rgb(var(--v-theme-on-surface)), rgba(var(--v-theme-primary), 1));
  background-clip: text;
  font-size: 1.8rem;
  font-weight: 800;
  letter-spacing: 0.025em;
  line-height: 1.2;
  -webkit-text-fill-color: transparent;
  text-transform: uppercase;
}

.login-tagline {
  margin: 0;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 0.85rem;
  font-weight: 500;
  letter-spacing: 0.01em;
}

/* ===================== 卡片主体 ===================== */
.login-body {
  padding-block: 8px !important;
}

/* 输入框聚焦时增加主色光晕 */
:deep(.login-body .v-field.v-field--focused) {
  box-shadow: 0 0 0 2px rgba(var(--v-theme-primary), 0.18);
}

/* 登录按钮：主色 + 悬浮抬升 */
.login-submit {
  box-shadow: 0 8px 20px rgba(var(--v-theme-primary), 0.35);
  letter-spacing: 0.02em;
  transition:
    transform var(--mp-motion-duration-overlay, 160ms) var(--mp-motion-ease-standard, ease),
    box-shadow var(--mp-motion-duration-overlay, 160ms) var(--mp-motion-ease-standard, ease);

  &:hover {
    box-shadow: 0 12px 26px rgba(var(--v-theme-primary), 0.42);
    transform: translateY(-1px);
  }

  &:active {
    transform: translateY(0);
  }
}

/* or 分隔线 */
.or-divider {
  position: relative;
  display: flex;
  align-items: center;
  text-align: center;

  &::before,
  &::after {
    flex: 1;
    border-block-end: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
    content: '';
  }

  .or-divider-text {
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 0.08em;
    padding-inline: 14px;
    text-transform: uppercase;
    white-space: nowrap;
  }
}

/* 浅色主题下 passkey 按钮保持绿色辨识度 */
:deep(.v-theme--light) .passkey-btn.v-btn--variant-outlined {
  color: rgb(86, 170, 0) !important;
}

/* ===================== 卡片页脚 ===================== */
.login-foot {
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(var(--v-theme-on-surface), calc(var(--v-disabled-opacity) * 1.4));
  font-size: 0.72rem;
  gap: 8px;
  letter-spacing: 0.02em;
  margin-block-start: 8px;
}

.login-version {
  border-inline-start: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  padding-inline: 6px;
}

/* ===================== 入场动画 ===================== */
.login-card--enter {
  animation: login-enter 520ms var(--mp-motion-ease-standard, cubic-bezier(0.2, 0.8, 0.2, 1)) both;
}

@keyframes login-enter {
  0% {
    opacity: 0;
    transform: translateY(14px) scale(0.985);
  }

  100% {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

/* ===================== 无障碍：尊重减少动态偏好 ===================== */
@media (prefers-reduced-motion: reduce) {
  .login-card--enter {
    animation-duration: 1ms !important;
  }

  .login-submit {
    transition: none !important;
  }
}

/* ===================== 小屏适配 ===================== */
@media (width <= 480px) {
  .auth-wrapper {
    padding-inline: 12px;
  }

  .login-title {
    font-size: 1.5rem;
  }

  .login-card {
    padding: 1.5rem !important;
  }
}
</style>
