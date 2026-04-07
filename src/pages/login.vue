<script setup lang="ts">
import { VForm } from 'vuetify/components/VForm'
import { useAuthStore, useUserStore, useGlobalSettingsStore } from '@/stores'
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
import { filterMenusByPermission } from '@/utils/permission'
import type { ApiResponse } from '@/api/types'

// 国际化
const { t } = useI18n()
// 认证 Store
const authStore = useAuthStore()
//用户 Store
const userStore = useUserStore()
// 全局设置 Store
const globalSettingsStore = useGlobalSettingsStore()

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

// 用户名称输入框
const usernameInput = ref()

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

  const userPermissions = {
    is_superuser: userPayload.superUser,
    ...userPayload.permissions,
  }

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

  // 登录后加载用户相关的全局设置
  await globalSettingsStore.loadUserSettings()

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
          mfaDialog.value = true
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
  mfaDialog.value = false
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
      mfaDialog.value = false
      await handleLoginSuccess(response)
    },
  )
}

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
  <div class="relative flex min-h-screen flex-col items-center justify-center">
    <!-- 登录表单 -->
    <div v-if="!mfaDialog" class="auth-wrapper d-flex align-center justify-center">
      <VCard
        class="auth-card px-7 py-3 w-full h-full"
        :class="{ 'glass-effect': !isTransparentTheme }"
        max-width="24rem"
        border
      >
        <VCardItem class="justify-center">
          <template #prepend>
            <div class="d-flex pe-0">
              <VImg :src="logo" width="64" height="64" />
            </div>
          </template>
          <VCardTitle class="font-weight-bold text-2xl text-uppercase"> MoviePilot </VCardTitle>

          <!-- 语言切换按钮 -->
          <template #append>
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
          </template>
        </VCardItem>
        <VCardText>
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
                  @click:append-inner="isPasswordVisible = !isPasswordVisible"
                />
              </VCol>
              <VCol cols="12">
                <!-- remember me checkbox -->
                <div class="d-flex align-center justify-space-between flex-wrap">
                  <VCheckbox v-model="form.remember" :label="t('login.stayLoggedIn')" required />
                </div>
              </VCol>
              <VCol cols="12">
                <!-- login button -->
                <VBtn block type="submit" prepend-icon="mdi-login" :loading="loading" size="large">
                  {{ t('login.login') }}
                </VBtn>

                <!-- or divider -->
                <div class="or-divider my-4">
                  <span class="or-divider-text">{{ t('login.orDivider') }}</span>
                </div>

                <!-- passkey login button -->
                <VBtn
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
                <VAlert v-if="errorMessage" type="error" variant="tonal" class="mt-3">
                  {{ errorMessage }}
                </VAlert>
              </VCol>
            </VRow>
          </VForm>
        </VCardText>
      </VCard>
    </div>

    <!-- MFA二次验证对话框 -->
    <VDialog v-model="mfaDialog" max-width="400" persistent>
      <VCard>
        <VCardTitle class="text-h5 text-center mt-4 pb-2">{{ t('login.secondaryVerification') }}</VCardTitle>
        <VCardText class="pt-0">
          <p class="text-center mb-4">{{ t('login.mfa.selectVerificationMethod') }}</p>

          <!-- TOTP验证 -->
          <VCard variant="tonal" class="mb-3">
            <VCardText>
              <VForm @submit.prevent="loginWithOTP">
                <VTextField
                  v-model="form.otp_password"
                  :label="t('login.otpCode')"
                  :placeholder="t('login.otpPlaceholder')"
                  type="text"
                  name="otp"
                  id="otp"
                  autocomplete="one-time-code"
                  inputmode="numeric"
                  prepend-inner-icon="mdi-shield-key"
                  class="mb-2"
                />
                <VBtn block type="submit" color="primary" :disabled="!form.otp_password">
                  {{ t('login.loginWithOtp') }}
                </VBtn>
              </VForm>
            </VCardText>
          </VCard>

          <!-- PassKey验证 -->
          <VCard variant="tonal">
            <VCardText>
              <p class="text-body-2 mb-2">{{ t('login.orUsePasskey') }}</p>
              <VBtn
                block
                variant="tonal"
                color="success"
                class="passkey-btn"
                prepend-icon="material-symbols:passkey"
                :loading="mfaPasskeyLoading"
                @click="verifyWithPassKey"
              >
                {{ t('login.verifyWithPasskey') }}
              </VBtn>
            </VCardText>
          </VCard>

          <!-- 错误提示 -->
          <VAlert v-if="errorMessage" type="error" variant="tonal" class="mt-3">
            {{ errorMessage }}
          </VAlert>

          <VBtn block variant="text" class="mt-4" @click="mfaDialog = false">{{ t('common.cancel') }}</VBtn>
        </VCardText>
      </VCard>
    </VDialog>
  </div>
</template>

<style lang="scss" scoped>
@use '@core/scss/pages/page-auth';

.v-card-item__prepend {
  padding-inline-end: 0 !important;
}

.auth-wrapper {
  overflow: hidden;
  block-size: auto;
}

.lang-switch-btn {
  position: absolute;
  inset-block-start: 8px;
  inset-inline-end: 8px;
}

.glass-effect {
  backdrop-filter: blur(10px) !important;
  background: rgba(var(--v-theme-surface), 0.7) !important;
}

.or-divider {
  position: relative;
  display: flex;
  align-items: center;
  text-align: center;

  &::before,
  &::after {
    content: '';
    flex: 1;
    border-block-end: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  }

  .or-divider-text {
    padding-inline: 12px;
    font-size: 0.8125rem;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
    white-space: nowrap;
  }
}

.v-theme--light {
  .passkey-btn.v-btn--variant-outlined {
    color: rgb(86, 170, 0) !important;
  }
}
</style>
