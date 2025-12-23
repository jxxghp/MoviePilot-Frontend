<script setup lang="ts">
import { VForm } from 'vuetify/components/VForm'
import { useAuthStore, useUserStore } from '@/stores'
import { authState, userState } from '@/stores/types'
import { requiredValidator } from '@/@validators'
import api from '@/api'
import router from '@/router'
import logo from '@images/logo.png'
import { urlBase64ToUint8Array } from '@/@core/utils/navigator'
import { SUPPORTED_LOCALES, SupportedLocale } from '@/types/i18n'
import { getCurrentLocale, setI18nLanguage } from '@/plugins/i18n'
import { useTheme } from 'vuetify'
import { getNavMenus } from '@/router/i18n-menu'
import { filterMenusByPermission } from '@/utils/permission'

// 国际化
const { t } = useI18n()
// 认证 Store
const authStore = useAuthStore()
//用户 Store
const userStore = useUserStore()

// 获取有权限的菜单
const navMenus = getNavMenus()

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

// 双重验证对话框
const mfaDialog = ref(false)

// MFA challenge（用于PassKey验证）
const mfaChallenge = ref('')

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

// 使用PassKey登录
async function loginWithPassKey() {
  errorMessage.value = ''
  passkeyLoading.value = true

  try {
    // 1. 开始认证流程
    const startResponse: any = await api.post('/mfa/passkey/authenticate/start', {})

    if (!startResponse.success) {
      errorMessage.value = startResponse.message || '启动通行密钥认证失败'
      passkeyLoading.value = false
      return
    }

    const { options, challenge } = startResponse.data
    const publicKeyOptions = JSON.parse(options)

    // 2. 调用WebAuthn API
    const credential = await navigator.credentials.get({
      publicKey: {
        ...publicKeyOptions,
        challenge: Uint8Array.from(atob(publicKeyOptions.challenge.replace(/-/g, '+').replace(/_/g, '/')), c =>
          c.charCodeAt(0),
        ),
        allowCredentials: publicKeyOptions.allowCredentials?.map((cred: any) => ({
          ...cred,
          id: Uint8Array.from(atob(cred.id.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0)),
        })),
      },
    })

    if (!credential) {
      errorMessage.value = '未选择通行密钥'
      passkeyLoading.value = false
      return
    }

    // 3. 转换credential为可传输格式
    const credentialJSON = {
      id: credential.id,
      rawId: btoa(String.fromCharCode(...new Uint8Array((credential as any).rawId)))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, ''),
      type: credential.type,
      response: {
        authenticatorData: btoa(String.fromCharCode(...new Uint8Array((credential as any).response.authenticatorData)))
          .replace(/\+/g, '-')
          .replace(/\//g, '_')
          .replace(/=/g, ''),
        clientDataJSON: btoa(String.fromCharCode(...new Uint8Array((credential as any).response.clientDataJSON)))
          .replace(/\+/g, '-')
          .replace(/\//g, '_')
          .replace(/=/g, ''),
        signature: btoa(String.fromCharCode(...new Uint8Array((credential as any).response.signature)))
          .replace(/\+/g, '-')
          .replace(/\//g, '_')
          .replace(/=/g, ''),
        userHandle: (credential as any).response.userHandle
          ? btoa(String.fromCharCode(...new Uint8Array((credential as any).response.userHandle)))
              .replace(/\+/g, '-')
              .replace(/\//g, '_')
              .replace(/=/g, '')
          : null,
      },
    }

    // 4. 完成认证
    const finishResponse: any = await api.post('/mfa/passkey/authenticate/finish', {
      credential: credentialJSON,
      challenge: challenge,
    })

    // 处理登录响应（与密码登录相同）
    const userPayload: userState = {
      superUser: finishResponse.super_user,
      userID: finishResponse.user_id,
      userName: finishResponse.user_name,
      avatar: finishResponse.avatar,
      level: finishResponse.level,
      permissions: finishResponse.permissions,
      wizard: finishResponse.widzard,
    }

    const userPermissions = {
      is_superuser: userPayload.superUser,
      ...userPayload.permissions,
    }

    const filteredMenus = filterMenusByPermission(navMenus, userPermissions)
    if (filteredMenus.length === 0) {
      errorMessage.value = t('login.noPermission')
      passkeyLoading.value = false
      return
    }

    const authPayLoad: authState = {
      token: finishResponse.access_token,
      remember: form.value.remember,
    }

    authStore.login(authPayLoad)
    userStore.loginUser(userPayload)

    await afterLogin(userPayload.superUser, userPayload, filteredMenus)
  } catch (error: any) {
    console.error('PassKey登录失败:', error)
    if (error.response) {
      errorMessage.value = error.response.data?.detail || '通行密钥登录失败'
    } else if (error.name === 'NotAllowedError') {
      errorMessage.value = '通行密钥认证被取消'
    } else {
      errorMessage.value = '通行密钥登录失败，请重试'
    }
    passkeyLoading.value = false
  }
}

// 切换语言
async function switchLanguage(locale: SupportedLocale) {
  await setI18nLanguage(locale)
  currentLocale.value = locale
  langMenu.value = false
}

// 查询是否开启双重验证
async function fetchOTP(): Promise<boolean> {
  if (!form.value.username) {
    isOTP.value = false
    return false
  }
  try {
    const response: any = await api.get(`/mfa/status/${form.value.username}`)
    isOTP.value = response.success
    return response.success
  } catch (error: any) {
    console.log(error)
    isOTP.value = false
    return false
  }
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
      console.log(e)
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
  // 登录按钮 loading
  loading.value = false
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

  // 用户名密码
  const formData = new FormData()

  formData.append('username', form.value.username)
  formData.append('password', form.value.password)
  formData.append('otp_password', form.value.otp_password)

  // 请求token
  api
    .post('/login/access-token', formData, {
      headers: {
        Accept: 'application/json', // 设置 Accept 类型
      },
    })
    .then((response: any) => {
      const userPayload: userState = {
        superUser: response.super_user,
        userID: response.user_id,
        userName: response.user_name,
        avatar: response.avatar,
        level: response.level,
        permissions: response.permissions,
        wizard: response.widzard,
      }

      // 在保存用户信息之前检查权限
      const userPermissions = {
        is_superuser: userPayload.superUser,
        ...userPayload.permissions,
      }

      const filteredMenus = filterMenusByPermission(navMenus, userPermissions)
      // 如果用户没有任何可用菜单，拒绝登录
      if (filteredMenus.length === 0) {
        // 显示错误信息
        errorMessage.value = t('login.noPermission')
        loading.value = false
        return
      }

      // 权限检查通过，保存用户信息
      const authPayLoad: authState = {
        token: response.access_token,
        remember: form.value.remember,
      }

      authStore.login(authPayLoad)
      userStore.loginUser(userPayload)

      // 登录后处理
      afterLogin(userPayload.superUser, userPayload, filteredMenus)
    })
    .catch(async (error: any) => {
      // 登录失败，显示错误提示
      if (!error.response) {
        errorMessage.value = t('login.networkError')
        loading.value = false
      }
      else if (error.response.status === 401) {
        // 401错误可能是需要MFA或者认证失败
        // 检查响应头是否有MFA要求标识
        const mfaRequired = error.response.headers?.['x-mfa-required'] === 'true'
        if (mfaRequired && !form.value.otp_password) {
          // 需要MFA验证，弹出对话框
          isOTP.value = true
          mfaDialog.value = true
          loading.value = false
          return
        }
        // 不需要MFA或已填写OTP但认证失败
        errorMessage.value = t('login.authFailure')
        // 认证失败后清空OTP密码，防止下次点击不弹出对话框
        form.value.otp_password = ''
        loading.value = false
      }
      else if (error.response.status === 403) {
        errorMessage.value = t('login.permissionDenied')
        loading.value = false
      }
      else if (error.response.status === 500) {
        errorMessage.value = t('login.serverError')
        loading.value = false
      }
      else {
        errorMessage.value = `${t('login.loginFailed')} ${error.response.status}，${t('login.checkCredentials')}`
        loading.value = false
      }
    })
}

// 使用OTP码继续登录
function loginWithOTP() {
  mfaDialog.value = false
  login()
}

// 使用PassKey进行MFA验证
async function verifyWithPassKey() {
  if (!form.value.username) return

  mfaPasskeyLoading.value = true
  errorMessage.value = ''

  try {
    // 1. 开始认证流程（指定用户名）
    const startResponse: any = await api.post('/mfa/passkey/authenticate/start', {
      username: form.value.username,
    })

    if (!startResponse.success) {
      errorMessage.value = startResponse.message || '启动通行密钥认证失败'
      mfaPasskeyLoading.value = false
      return
    }

    const { options, challenge } = startResponse.data
    const publicKeyOptions = JSON.parse(options)

    // 2. 调用WebAuthn API
    const credential = await navigator.credentials.get({
      publicKey: {
        ...publicKeyOptions,
        challenge: Uint8Array.from(atob(publicKeyOptions.challenge.replace(/-/g, '+').replace(/_/g, '/')), c =>
          c.charCodeAt(0),
        ),
        allowCredentials: publicKeyOptions.allowCredentials?.map((cred: any) => ({
          ...cred,
          id: Uint8Array.from(atob(cred.id.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0)),
        })),
      },
    })

    if (!credential) {
      errorMessage.value = '未选择通行密钥'
      mfaPasskeyLoading.value = false
      return
    }

    // 3. 转换credential
    const credentialJSON = {
      id: credential.id,
      rawId: btoa(String.fromCharCode(...new Uint8Array((credential as any).rawId)))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, ''),
      type: credential.type,
      response: {
        authenticatorData: btoa(String.fromCharCode(...new Uint8Array((credential as any).response.authenticatorData)))
          .replace(/\+/g, '-')
          .replace(/\//g, '_')
          .replace(/=/g, ''),
        clientDataJSON: btoa(String.fromCharCode(...new Uint8Array((credential as any).response.clientDataJSON)))
          .replace(/\+/g, '-')
          .replace(/\//g, '_')
          .replace(/=/g, ''),
        signature: btoa(String.fromCharCode(...new Uint8Array((credential as any).response.signature)))
          .replace(/\+/g, '-')
          .replace(/\//g, '_')
          .replace(/=/g, ''),
        userHandle: (credential as any).response.userHandle
          ? btoa(String.fromCharCode(...new Uint8Array((credential as any).response.userHandle)))
              .replace(/\+/g, '-')
              .replace(/\//g, '_')
              .replace(/=/g, '')
          : null,
      },
    }

    // 4. 完成认证（直接登录，不需要密码）
    const finishResponse: any = await api.post('/mfa/passkey/authenticate/finish', {
      credential: credentialJSON,
      challenge: challenge,
    })

    // 关闭MFA对话框
    mfaDialog.value = false

    // 处理登录响应
    const userPayload: userState = {
      superUser: finishResponse.super_user,
      userID: finishResponse.user_id,
      userName: finishResponse.user_name,
      avatar: finishResponse.avatar,
      level: finishResponse.level,
      permissions: finishResponse.permissions,
      wizard: finishResponse.widzard,
    }

    const userPermissions = {
      is_superuser: userPayload.superUser,
      ...userPayload.permissions,
    }

    const filteredMenus = filterMenusByPermission(navMenus, userPermissions)
    if (filteredMenus.length === 0) {
      errorMessage.value = t('login.noPermission')
      mfaPasskeyLoading.value = false
      return
    }

    const authPayLoad: authState = {
      token: finishResponse.access_token,
      remember: form.value.remember,
    }

    authStore.login(authPayLoad)
    userStore.loginUser(userPayload)

    await afterLogin(userPayload.superUser, userPayload, filteredMenus)
  } catch (error: any) {
    console.error('PassKey MFA验证失败:', error)
    if (error.response) {
      errorMessage.value = error.response.data?.detail || '通行密钥验证失败'
    } else if (error.name === 'NotAllowedError') {
      errorMessage.value = '通行密钥认证被取消'
    } else {
      errorMessage.value = '通行密钥验证失败，请重试'
    }
    mfaPasskeyLoading.value = false
  }
}

// 自动登录
onMounted(async () => {
  // 获取token和remember状态
  const token = authStore.token
  const remember = authStore.remember

  // 如果token存在，且保持登录状态为true，则跳转到首页
  if (token && remember) {
    router.push('/')
  }
})
</script>

<template>
  <!-- 登录页面容器 -->
  <div class="relative flex min-h-screen flex-col items-center justify-center">
    <!-- 登录表单 -->
    <div class="auth-wrapper d-flex align-center justify-center">
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
                  name="current-password"
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
                <VBtn block type="submit" prepend-icon="mdi-login" :loading="loading">
                  {{ t('login.login') }}
                </VBtn>
                <!-- passkey login button -->
                <VBtn
                  block
                  variant="tonal"
                  color="success"
                  class="mt-3"
                  prepend-icon="mdi-key-variant"
                  :loading="passkeyLoading"
                  @click="loginWithPassKey"
                >
                  使用通行密钥登录
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

    <!-- MFA双重验证对话框 -->
    <VDialog v-model="mfaDialog" max-width="400" persistent>
      <VCard>
        <VCardTitle class="text-h5 text-center mt-4">双重验证</VCardTitle>
        <VCardText>
          <p class="text-center mb-4">请选择验证方式</p>
          
          <!-- TOTP验证 -->
          <VCard variant="tonal" class="mb-3">
            <VCardText>
              <VForm @submit.prevent="loginWithOTP">
                <VTextField
                  v-model="form.otp_password"
                  label="验证码"
                  placeholder="请输入6位验证码"
                  type="text"
                  inputmode="numeric"
                  autocomplete="one-time-code"
                  prepend-inner-icon="mdi-shield-key"
                  class="mb-2"
                />
                <VBtn block type="submit" color="primary" :disabled="!form.otp_password">
                  使用验证码登录
                </VBtn>
              </VForm>
            </VCardText>
          </VCard>

          <!-- PassKey验证 -->
          <VCard variant="tonal">
            <VCardText>
              <p class="text-body-2 mb-2">或使用通行密钥进行验证</p>
              <VBtn
                block
                variant="tonal"
                color="success"
                prepend-icon="mdi-key-variant"
                :loading="mfaPasskeyLoading"
                @click="verifyWithPassKey"
              >
                使用通行密钥验证
              </VBtn>
            </VCardText>
          </VCard>

          <VBtn block variant="text" class="mt-4" @click="mfaDialog = false">取消</VBtn>
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
</style>
