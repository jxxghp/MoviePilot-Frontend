<script setup lang="ts">
import type { Component } from 'vue'
import { useAuthStore, useUserStore } from '@/stores'
import { authState, userState } from '@/stores/types'
import api from '@/api'
import router from '@/router'
import logo from '@images/logo.png'
import { bufferToBase64Url, base64UrlToUint8Array, urlBase64ToUint8Array } from '@/@core/utils/navigator'
import { SUPPORTED_LOCALES, SupportedLocale } from '@/types/i18n'
import { getCurrentLocale, setI18nLanguage } from '@/plugins/i18n'
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

const refForm = ref<HTMLFormElement | null>(null)

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

// 语言选择菜单
const langMenu = ref(false)

// 当前语言
const currentLocale = ref(getCurrentLocale())

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
  const root = refForm.value || document

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

// 执行 PassKey WebAuthn 认证并返回登录完成信息。
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
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return

  try {
    const registration = await navigator.serviceWorker.ready
    let subscription = await registration.pushManager.getSubscription()

    if (!subscription) {
      if (typeof Notification !== 'undefined' && Notification.permission !== 'granted') return

      const convertedVapidKey = urlBase64ToUint8Array(import.meta.env.VITE_PUBLIC_VAPID_KEY)
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: convertedVapidKey,
      })
    }

    if (subscription) {
      await api.post('/message/webpush/subscribe', subscription)
    }
  } catch (error) {
    console.warn('WebPush subscription failed:', error)
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
  if (superuser) void subscribeForPushNotifications()
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
  syncLoginCredentialValues()

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
})
</script>

<template>
  <!-- 登录页面容器 -->
  <div class="login-root">
    <!-- 装饰性背景光晕 -->
    <div class="login-bg-decor" aria-hidden="true">
      <div class="login-orb login-orb--1" />
      <div class="login-orb login-orb--2" />
      <div class="login-orb login-orb--3" />
    </div>

    <!-- 顶部漂浮语言切换 -->
    <VMenu v-model="langMenu" :close-on-content-click="false">
      <template #activator="{ props }">
        <VBtn variant="text" size="small" v-bind="props" class="lang-switch-btn">
          <span v-if="SUPPORTED_LOCALES[currentLocale].flag">{{ SUPPORTED_LOCALES[currentLocale].flag }}</span>
          <VIcon v-else icon="mdi-translate" />
          <span class="ms-1">{{ SUPPORTED_LOCALES[currentLocale].title }}</span>
        </VBtn>
      </template>
      <VCard min-width="180" class="lang-menu-card">
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
        class="auth-card login-card glass-effect pa-7 pa-sm-9 w-full h-full login-card--enter"
        max-width="24rem"
        flat
      >
        <!-- 卡片头部：Logo + 标题 + 欢迎语 -->
        <div class="login-head">
          <div class="login-logo-wrapper">
            <VImg :src="logo" width="72" height="72" class="login-logo" />
          </div>
          <h1 class="login-title">MoviePilot</h1>
          <p class="login-subtitle">{{ t('login.welcomeBack') || 'Welcome Back' }}</p>
        </div>

        <VCardText class="login-body">
          <form
            ref="refForm"
            class="login-form"
            method="post"
            action="/login/access-token"
            autocomplete="on"
            @submit.prevent="login"
          >
            <VRow>
              <!-- username -->
              <VCol cols="12">
                <div class="native-login-field login-input">
                  <VIcon icon="mdi-account-outline" class="native-login-field__icon" aria-hidden="true" />
                  <input
                    id="username"
                    v-model="form.username"
                    class="native-login-field__input"
                    type="text"
                    name="username"
                    autocomplete="username"
                    autocapitalize="none"
                    spellcheck="false"
                    enterkeyhint="next"
                    :placeholder="t('login.username')"
                    :aria-label="t('login.username')"
                    required
                  />
                </div>
              </VCol>
              <!-- password -->
              <VCol cols="12">
                <div class="native-login-field native-login-field--password login-input">
                  <VIcon icon="mdi-lock-outline" class="native-login-field__icon" aria-hidden="true" />
                  <input
                    id="password"
                    v-model="form.password"
                    class="native-login-field__input"
                    :type="isPasswordVisible ? 'text' : 'password'"
                    name="password"
                    autocomplete="current-password"
                    :placeholder="t('login.password')"
                    :aria-label="t('login.password')"
                    required
                  />
                  <button
                    class="native-login-field__toggle"
                    type="button"
                    :aria-label="isPasswordVisible ? t('login.hidePassword') : t('login.showPassword')"
                    @click="isPasswordVisible = !isPasswordVisible"
                  >
                    <VIcon :icon="isPasswordVisible ? 'mdi-eye-off-outline' : 'mdi-eye-outline'" size="20" />
                  </button>
                </div>
              </VCol>
              <VCol cols="12" class="py-0">
                <!-- remember me checkbox -->
                <div class="d-flex align-center justify-space-between flex-wrap">
                  <label class="native-login-checkbox login-checkbox">
                    <input
                      v-model="form.remember"
                      class="native-login-checkbox__input"
                      type="checkbox"
                      name="remember"
                    />
                    <span class="native-login-checkbox__label">{{ t('login.stayLoggedIn') }}</span>
                  </label>
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
                  class="mt-3 plugin-auth-btn"
                  :prepend-icon="provider.icon || 'mdi-login-variant'"
                  :loading="pluginAuthLoading && selectedAuthProvider?.id === provider.id"
                  rounded="lg"
                  @click="openPluginAuth(provider)"
                >
                  {{ provider.name }}
                </VBtn>
                <VAlert v-if="errorMessage" type="error" variant="tonal" class="mt-4 login-alert">
                  {{ errorMessage }}
                </VAlert>
              </VCol>
            </VRow>
          </form>
        </VCardText>

        <!-- 卡片页脚：版权 + 版本 -->
        <div class="login-foot">
          <span>{{ t('login.copyright', { year: copyrightYear }) }}</span>
          <span v-if="appVersion" class="login-version">{{ appVersion }}</span>
        </div>
      </VCard>
    </div>
    <VDialog v-model="pluginAuthDialog" max-width="520" persistent>
      <VCard class="plugin-auth-card">
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
  overflow: hidden;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  isolation: isolate;
  min-block-size: 100vh;
  min-block-size: 100dvh;
}

/* ===================== 装饰性背景光晕 ===================== */
.login-bg-decor {
  position: absolute;
  z-index: 0;
  overflow: hidden;
  inset: 0;
  pointer-events: none;
}

.login-orb {
  position: absolute;
  border-radius: 50%;
  will-change: transform;
}

.login-orb--1 {
  animation: orb-float-1 12s ease-in-out infinite alternate;
  background: rgba(var(--v-theme-primary), 0.35);
  block-size: 360px;
  filter: blur(60px);
  inline-size: 360px;
  inset-block-start: -15%;
  inset-inline-end: -12%;
}

.login-orb--2 {
  animation: orb-float-2 15s ease-in-out infinite alternate;
  background: rgba(var(--v-theme-primary), 0.25);
  block-size: 300px;
  filter: blur(55px);
  inline-size: 300px;
  inset-block-end: -10%;
  inset-inline-start: -15%;
}

.login-orb--3 {
  animation: orb-float-3 10s ease-in-out infinite alternate;
  background: rgba(var(--v-theme-primary), 0.15);
  block-size: 220px;
  filter: blur(50px);
  inline-size: 220px;
  inset-block-start: 50%;
  inset-inline-end: 15%;
}

@keyframes orb-float-1 {
  0% {
    transform: translate(0, 0) scale(1);
  }

  100% {
    transform: translate(-30px, 40px) scale(1.1);
  }
}

@keyframes orb-float-2 {
  0% {
    transform: translate(0, 0) scale(1);
  }

  100% {
    transform: translate(25px, -30px) scale(1.08);
  }
}

@keyframes orb-float-3 {
  0% {
    transform: translate(0, 0) scale(1);
  }

  100% {
    transform: translate(-20px, 20px) scale(0.92);
  }
}

/* ===================== 浮动语言切换 ===================== */
.lang-switch-btn {
  position: absolute;
  z-index: 3;
  border: 1px solid rgba(var(--v-border-color), calc(var(--v-border-opacity) * 0.6));
  border-radius: 999px;
  background: rgba(var(--v-theme-surface), 0.6);
  inset-block-start: calc(env(safe-area-inset-top, 0px) + 16px);
  inset-inline-end: calc(env(safe-area-inset-right, 0px) + 16px);
  transition:
    background 200ms ease,
    border-color 200ms ease;

  &:hover {
    border-color: rgba(var(--v-theme-primary), 0.3);
    background: rgba(var(--v-theme-surface), 0.85);
  }
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
  border-radius: var(--app-surface-radius, 20px) !important;
  box-shadow:
    0 20px 50px rgba(var(--app-shadow-rgb, 0, 0, 0), 0.12),
    0 8px 20px rgba(var(--app-shadow-rgb, 0, 0, 0), 0.06),
    0 0 0 1px rgba(var(--v-theme-primary), 0.04) !important;
  transition: box-shadow 300ms ease;

  /* 顶部高光线，营造立体感 */
  &::before {
    position: absolute;
    z-index: 1;
    border-radius: inherit;
    background: linear-gradient(90deg, transparent 10%, rgba(255, 255, 255, 35%) 50%, transparent 90%);
    block-size: 1px;
    content: '';
    inset-block-start: 0;
    inset-inline: 0;
    pointer-events: none;
  }
}

/* 登录卡片自身承载固定磨砂效果，避免跟随透明主题设置变化。 */
.glass-effect {
  backdrop-filter: blur(28px) saturate(170%) !important;
  background: rgba(var(--v-theme-surface), 0.75) !important;
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
  gap: 4px;
  margin-block-end: 12px;
  text-align: center;
}

.login-logo-wrapper {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  animation: logo-enter 700ms cubic-bezier(0.16, 1, 0.3, 1) 100ms both;
  margin-block-end: 8px;

  /* Logo 背后的柔光环 */
  &::before {
    position: absolute;
    z-index: -1;
    border-radius: 50%;
    animation: logo-pulse 4s ease-in-out infinite;
    background: radial-gradient(circle, rgba(var(--v-theme-primary), 0.2) 0%, transparent 70%);
    block-size: 120px;
    content: '';
    inline-size: 120px;
  }
}

.login-logo {
  animation: logo-float 6s ease-in-out infinite;
  filter: drop-shadow(0 8px 20px rgba(var(--v-theme-primary), 0.3));
}

@keyframes logo-float {
  0%,
  100% {
    transform: translateY(0);
  }

  50% {
    transform: translateY(-4px);
  }
}

@keyframes logo-pulse {
  0%,
  100% {
    opacity: 0.6;
    transform: scale(1);
  }

  50% {
    opacity: 1;
    transform: scale(1.05);
  }
}

.login-title {
  margin: 0;
  animation: text-enter 600ms cubic-bezier(0.16, 1, 0.3, 1) 200ms both;
  background: linear-gradient(135deg, rgb(var(--v-theme-on-surface)) 30%, rgba(var(--v-theme-primary), 1) 100%);
  background-clip: text;
  font-size: 1.85rem;
  font-weight: 800;
  letter-spacing: 0.03em;
  line-height: 1.2;
  -webkit-text-fill-color: transparent;
  text-transform: uppercase;
}

.login-subtitle {
  animation: text-enter 600ms cubic-bezier(0.16, 1, 0.3, 1) 300ms both;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 0.875rem;
  font-weight: 400;
  letter-spacing: 0.01em;
  margin-block: 4px 0;
  margin-inline: 0;
  opacity: 0.8;
}

/* ===================== 卡片主体 ===================== */
.login-body {
  padding-block: 8px !important;
}

/* 原生登录输入框：保留标准 input DOM，便于密码管理器识别。 */
.native-login-field {
  position: relative;
  display: flex;
  align-items: center;
  border: 1px solid rgba(var(--v-border-color), 0.38);
  min-block-size: 56px;
  border-radius: 12px;
  background: transparent;
  transition:
    border-color 150ms ease,
    box-shadow 150ms ease;
}

.native-login-field:focus-within {
  border-color: rgb(var(--v-theme-primary));
  box-shadow: inset 0 0 0 1px rgb(var(--v-theme-primary));
}

.native-login-field__icon {
  position: absolute;
  z-index: 1;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  inset-block-start: 16px;
  inset-inline-start: 16px;
  pointer-events: none;
}

.native-login-field__input {
  display: block;
  border: 0;
  appearance: none;
  background: transparent;
  block-size: 54px;
  color: rgb(var(--v-theme-on-surface));
  font: inherit;
  inline-size: 100%;
  line-height: 1.5;
  outline: none;
  padding-block: 0;
  padding-inline: 48px 16px;
}

.native-login-field__input::placeholder {
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  opacity: 1;
}

.native-login-field--password .native-login-field__input {
  padding-inline-end: 48px;
}

.native-login-field__input:-webkit-autofill,
.native-login-field__input:-webkit-autofill:hover,
.native-login-field__input:-webkit-autofill:focus {
  -webkit-text-fill-color: rgb(var(--v-theme-on-surface));
  caret-color: rgb(var(--v-theme-on-surface));
  transition: background-color 9999s ease-in-out 0s;
}

.native-login-field__toggle {
  position: absolute;
  z-index: 2;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 50%;
  background: transparent;
  block-size: 40px;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  cursor: pointer;
  inline-size: 40px;
  inset-block-start: 8px;
  inset-inline-end: 8px;
  padding: 0;
  transition:
    background 150ms ease,
    color 150ms ease;
}

.native-login-field__toggle:hover,
.native-login-field__toggle:focus-visible {
  background: rgba(var(--v-theme-on-surface), 0.08);
  color: rgba(var(--v-theme-on-surface), var(--v-high-emphasis-opacity));
  outline: none;
}

/* 原生保持登录复选框，避免使用全局 VCheckbox 小屏适配布局。 */
.native-login-checkbox {
  display: inline-flex;
  align-items: center;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  cursor: pointer;
  gap: 10px;
  min-block-size: 40px;
  user-select: none;
}

.native-login-checkbox__input {
  position: relative;
  display: inline-grid;
  flex: 0 0 18px;
  border: 2px solid rgba(var(--v-theme-on-surface), 0.54);
  border-radius: 4px;
  margin: 0;
  appearance: none;
  background: transparent;
  block-size: 18px;
  cursor: pointer;
  inline-size: 18px;
  place-content: center;
  transition:
    background-color 150ms ease,
    border-color 150ms ease,
    box-shadow 150ms ease;
}

.native-login-checkbox__input::before {
  block-size: 5px;
  border-block-end: 2px solid rgb(var(--v-theme-on-primary));
  border-inline-start: 2px solid rgb(var(--v-theme-on-primary));
  content: '';
  inline-size: 9px;
  transform: translateY(-1px) rotate(-45deg) scale(0);
  transform-origin: center;
  transition: transform 120ms ease;
}

.native-login-checkbox__input:checked {
  border-color: rgb(var(--v-theme-primary));
  background-color: rgb(var(--v-theme-primary));
}

.native-login-checkbox__input:checked::before {
  transform: translateY(-1px) rotate(-45deg) scale(1);
}

.native-login-checkbox__input:focus-visible {
  box-shadow: 0 0 0 3px rgba(var(--v-theme-primary), 0.18);
  outline: none;
}

.native-login-checkbox__label {
  font-size: 0.9375rem;
  line-height: 1.4;
}

/* Remember me 复选框样式优化 */
.login-checkbox {
  opacity: 0.85;
  transition: opacity 150ms ease;

  &:hover {
    opacity: 1;
  }
}

/* 登录按钮：渐变 + 悬浮抬升 + 光泽 */
.login-submit {
  position: relative;
  overflow: hidden;
  box-shadow: 0 8px 24px rgba(var(--v-theme-primary), 0.35);
  font-weight: 600;
  letter-spacing: 0.03em;
  transition:
    transform 200ms cubic-bezier(0.2, 0.8, 0.2, 1),
    box-shadow 200ms cubic-bezier(0.2, 0.8, 0.2, 1);

  &:hover {
    box-shadow: 0 12px 32px rgba(var(--v-theme-primary), 0.45);
    transform: translateY(-2px);
  }

  &:active {
    box-shadow: 0 4px 12px rgba(var(--v-theme-primary), 0.3);
    transform: translateY(0);
  }
}

/* 登录按钮内部光泽扫描层 */
.login-submit :deep(.v-btn__content)::after {
  position: absolute;
  z-index: 10;
  background: linear-gradient(
    105deg,
    transparent 35%,
    rgba(255, 255, 255, 30%) 43%,
    rgba(255, 255, 255, 40%) 50%,
    rgba(255, 255, 255, 30%) 57%,
    transparent 65%
  );
  content: '';
  inset-block: -50%;
  inset-inline: -50%;
  pointer-events: none;
  transform: translateX(-120%);
  transition: transform 700ms cubic-bezier(0.4, 0, 0.2, 1);
}

.login-submit:hover :deep(.v-btn__content)::after {
  transform: translateX(120%);
}

/* Passkey 按钮 */
.passkey-btn {
  border-radius: 12px;
  font-weight: 500;
  transition:
    background 200ms ease,
    border-color 200ms ease,
    transform 150ms ease;

  &:hover {
    transform: translateY(-1px);
  }
}

/* 插件认证按钮 */
.plugin-auth-btn {
  border-radius: 12px;
  font-weight: 500;
  transition:
    background 200ms ease,
    border-color 200ms ease,
    transform 150ms ease;

  &:hover {
    transform: translateY(-1px);
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
    border-block-end: 1px solid rgba(var(--v-border-color), calc(var(--v-border-opacity) * 0.7));
    content: '';
  }

  .or-divider-text {
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
    font-size: 0.72rem;
    font-weight: 600;
    letter-spacing: 0.1em;
    padding-inline: 16px;
    text-transform: uppercase;
    white-space: nowrap;
  }
}

/* 错误提示 */
.login-alert {
  border-radius: 12px;
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
  font-size: 0.7rem;
  gap: 8px;
  letter-spacing: 0.03em;
  margin-block-start: 14px;
  opacity: 0.75;
}

.login-version {
  border-inline-start: 1px solid rgba(var(--v-border-color), calc(var(--v-border-opacity) * 0.6));
  padding-inline: 6px;
}

/* ===================== 入场动画 ===================== */
.login-card--enter {
  animation: login-enter 600ms cubic-bezier(0.16, 1, 0.3, 1) both;
}

@keyframes login-enter {
  0% {
    filter: blur(4px);
    opacity: 0;
    transform: translateY(20px) scale(0.97);
  }

  100% {
    filter: blur(0);
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@keyframes logo-enter {
  0% {
    opacity: 0;
    transform: scale(0.8) translateY(10px);
  }

  100% {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

@keyframes text-enter {
  0% {
    opacity: 0;
    transform: translateY(8px);
  }

  100% {
    opacity: 1;
    transform: translateY(0);
  }
}

/* ===================== 无障碍：尊重减少动态偏好 ===================== */
@media (prefers-reduced-motion: reduce) {
  .login-card--enter,
  .login-logo-wrapper,
  .login-title,
  .login-subtitle {
    animation-duration: 1ms !important;
  }

  .login-submit {
    transition: none !important;
  }

  .login-submit :deep(.v-btn__content)::after {
    display: none !important;
  }

  .login-logo {
    animation: none !important;
  }

  .login-orb {
    animation: none !important;
  }

  .login-logo-wrapper::before {
    animation: none !important;
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
    border-radius: 16px !important;
  }

  .login-orb--1 {
    block-size: 220px;
    inline-size: 220px;
  }

  .login-orb--2 {
    block-size: 180px;
    inline-size: 180px;
  }

  .login-orb--3 {
    display: none;
  }
}
</style>
