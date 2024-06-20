<script setup lang="ts">
import { debounce } from 'lodash'
import { VForm } from 'vuetify/components/VForm'
import { useStore } from 'vuex'
import { requiredValidator } from '@/@validators'
import api from '@/api'
import router from '@/router'
import logo from '@images/logo.png'
import { useTheme } from 'vuetify'
import { checkPrefersColorSchemeIsDark } from '@/@core/utils'
import { urlBase64ToUint8Array } from '@/@core/utils/navigator'

const { global: globalTheme } = useTheme()

// Vuex Store
const store = useStore()

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

// 背景图片
const backgroundImageUrl = ref('')

// 所有的背景图片
const backgroundImages = ref<string[]>([])

// 背景图片加载状态
const isImageLoaded = ref(false)

// 是否开启双重验证
const isOTP = ref(false)

// 用户名称输入框
const usernameInput = ref()

// Interval定时器
let intervalTimer: NodeJS.Timeout | null = null

// 获取背景图片
async function fetchBackgroundImage() {
  try {
    backgroundImages.value = await api.get('/login/wallpapers')
    if (backgroundImages.value && backgroundImages.value.length > 0) {
      backgroundImageUrl.value = backgroundImages.value[0]
    }
  } catch (e) {
    console.log(e)
  }
}

// 查询是否开启双重验证
const fetchOTP = debounce(async () => {
  const userid = usernameInput.value?.value
  if (!userid) {
    isOTP.value = false
    return
  }
  api
    .get(`/user/otp/${userid}`)
    .then((response: any) => {
      isOTP.value = response.success
    })
    .catch((error: any) => {
      console.log(error)
    })
}, 500)

// 获取用户主题配置
async function fetchThemeConfig() {
  const response = await api.get('/user/config/theme')
  if (response && response.data && response.data.value) {
    return response.data.value
  }
  return null
}

// 生效主题
async function setTheme() {
  let themeValue = (await fetchThemeConfig()) || localStorage.getItem('theme') || 'light'
  const autoTheme = checkPrefersColorSchemeIsDark() ? 'dark' : 'light'
  globalTheme.name.value = themeValue === 'auto' ? autoTheme : themeValue
  // 存储主题到本地
  localStorage.setItem('theme', themeValue)
  localStorage.setItem('materio-initial-loader-bg', globalTheme.current.value.colors.background)
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
async function afterLogin(superuser: boolean) {
  // 生效主题配置
  await setTheme()
  // 跳转到首页或回原始页面
  router.push(store.state.auth.originalPath ?? '/')
  // 订阅推送通知
  if (superuser) await subscribeForPushNotifications()
}

// 登录获取token事件
function login() {
  errorMessage.value = ''

  // 进行表单校验
  if (!form.value.username || !form.value.password || (isOTP.value && !form.value.otp_password)) {
    errorMessage.value = '请输入完整信息'
    return
  }
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
      // 获取token
      const token = response.access_token
      const superUser = response.super_user
      const userName = response.user_name
      const avatar = response.avatar
      const level = response.level
      const remember = form.value.remember

      // 更新token和remember状态到Vuex Store
      store.dispatch('auth/login', { token, remember, superUser, userName, avatar, level })

      // 登录后处理
      afterLogin(superUser)
    })
    .catch((error: any) => {
      // 登录失败，显示错误提示
      if (!error.response) errorMessage.value = '登录失败，请检查网络连接'
      else if (error.response.status === 401) errorMessage.value = '登录失败，请检查用户名、密码或双重验证是否正确'
      else if (error.response.status === 403) errorMessage.value = '登录失败，您没有权限访问'
      else if (error.response.status === 500) errorMessage.value = '登录失败，服务器错误'
      else errorMessage.value = `登录失败 ${error.response.status}，请检查用户名、密码或双重验证码是否正确`
    })
}

// 自动登录
onMounted(async () => {
  // 从Vuex Store中获取token和remember状态
  const token = store.state.auth.token
  const remember = store.state.auth.remember

  // 如果token存在，且保持登录状态为true，则跳转到首页
  if (token && remember) {
    router.push('/')
  } else {
    // 获取背景图片
    await fetchBackgroundImage()

    // 每隔5秒更换一次背景图片
    intervalTimer = setInterval(() => {
      if (backgroundImages.value.length > 0) {
        const index = Math.floor(Math.random() * backgroundImages.value.length)
        backgroundImageUrl.value = backgroundImages.value[index]
      }
    }, 5000)
  }
})

onUnmounted(() => {
  if (intervalTimer) clearInterval(intervalTimer)
})
</script>

<template>
  <template v-for="image in backgroundImages">
    <div v-if="backgroundImageUrl == image" class="absolute inset-0">
      <VImg :src="image" class="w-full h-full" cover position="center top" @load="isImageLoaded = true">
        <template #placeholder>
          <VSkeletonLoader v-if="!isImageLoaded" class="object-cover" />
        </template>
        <div
          class="absolute inset-0"
          style="background-image: linear-gradient(rgba(45, 55, 72, 33%) 0%, rgb(26, 32, 46) 100%)"
        />
      </VImg>
    </div>
  </template>
  <div class="auth-wrapper d-flex align-center justify-center pa-4">
    <VCard
      class="auth-card px-7 py-3 w-full h-full rounded-lg"
      :class="{ 'opacity-85': isImageLoaded }"
      max-width="24rem"
    >
      <VCardItem class="justify-center">
        <template #prepend>
          <div class="d-flex pe-0">
            <VImg :src="logo" width="64" height="64" />
          </div>
        </template>

        <VCardTitle class="font-weight-semibold text-2xl text-uppercase"> MoviePilot </VCardTitle>
      </VCardItem>

      <VCardText>
        <VForm ref="refForm" @submit.prevent="() => {}">
          <VRow>
            <!-- username -->
            <VCol cols="12">
              <VTextField
                ref="usernameInput"
                v-model="form.username"
                label="用户名"
                type="text"
                :rules="[requiredValidator]"
                @input="fetchOTP"
              />
            </VCol>
            <!-- password -->
            <VCol cols="12">
              <VTextField
                v-model="form.password"
                label="密码"
                :type="isPasswordVisible ? 'text' : 'password'"
                :append-inner-icon="isPasswordVisible ? 'mdi-eye-off-outline' : 'mdi-eye-outline'"
                :rules="[requiredValidator]"
                @click:append-inner="isPasswordVisible = !isPasswordVisible"
              />
            </VCol>
            <VCol cols="12">
              <VTextField v-if="isOTP" v-model="form.otp_password" label="双重验证码" type="input" />
              <!-- remember me checkbox -->
              <div class="d-flex align-center justify-space-between flex-wrap">
                <VCheckbox v-model="form.remember" label="保持登录" required />
              </div>
            </VCol>
            <VCol cols="12">
              <!-- login button -->
              <VBtn block type="submit" @click="login"> 登录 </VBtn>
              <div v-if="errorMessage" class="text-error mt-2 text-shadow">
                {{ errorMessage }}
              </div>
            </VCol>
          </VRow>
        </VForm>
      </VCardText>
    </VCard>
  </div>
</template>

<style lang="scss">
@use '@core/scss/pages/page-auth.scss';

.v-card-item__prepend {
  padding-inline-end: 0 !important;
}
</style>
