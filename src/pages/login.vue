<script setup lang="ts">
import { VForm } from 'vuetify/components/VForm'
import { useStore } from 'vuex'
import { requiredValidator } from '@/@validators'
import api from '@/api'
import router from '@/router'
import logo from '@images/logo.png'

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

// 背景图片加载状态
const isImageLoaded = ref(false)

// 是否开启双重验证
const isOTP = ref(false)

// 用户名称输入框
const usernameInput = ref()

// 获取背景图片
async function fetchBackgroundImage() {
  api
    .get('/login/wallpaper')
    .then((response: any) => {
      backgroundImageUrl.value = response.message
    })
    .catch((error: any) => {
      console.log(error)
    })
}

// 查询是否开启双重验证
async function fetchOTP() {
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
      const superuser = response.super_user
      const username = response.user_name
      const avatar = response.avatar

      // 更新token和remember状态到Vuex Store
      store.dispatch('auth/updateToken', token)
      store.dispatch('auth/updateRemember', form.value.remember)
      store.dispatch('auth/updateSuperUser', superuser)
      store.dispatch('auth/updateUserName', username)
      store.dispatch('auth/updateAvatar', avatar)

      // 跳转到首页或回原始页面
      router.push(store.state.auth.originalPath ?? '/')
    })
    .catch((error: any) => {
      // 登录失败，显示错误提示
      if (!error.response)
        errorMessage.value = '登录失败，请检查网络连接'
      else if (error.response.status === 401)
        errorMessage.value = '登录失败，请检查用户名、密码或双重验证是否正确'
      else if (error.response.status === 403)
        errorMessage.value = '登录失败，您没有权限访问'
      else if (error.response.status === 500)
        errorMessage.value = '登录失败，服务器错误'
      else
        errorMessage.value = `登录失败 ${error.response.status}，请检查用户名、密码或双重验证码是否正确`
    })
}

// 自动登录
onMounted(() => {
  // 从Vuex Store中获取token和remember状态
  const token = store.state.auth.token
  const remember = store.state.auth.remember

  // 如果token存在，且保持登录状态为true，则跳转到首页
  if (token && remember) {
    router.push('/')
  }
  else {
    // 获取背景图片
    fetchBackgroundImage()
  }
})
</script>

<template>
  <VImg
    aspect-ratio="4/3"
    :src="backgroundImageUrl"
    class="w-full h-full overflow-hidden"
    cover
    @load="isImageLoaded = true"
  >
    <div class="auth-wrapper d-flex align-center justify-center pa-4">
      <VCard
        class="auth-card pa-7 w-full h-full"
        :class="isImageLoaded ? 'backdrop-blur-xl bg-white/50' : ''"
        max-width="25rem"
        :theme="isImageLoaded ? 'light' : ''"
      >
        <VCardItem class="justify-center mb-7">
          <template #prepend>
            <div class="d-flex pe-0">
              <VImg :src="logo" width="64" height="64" />
            </div>
          </template>

          <VCardTitle class="font-weight-semibold text-2xl text-uppercase">
            MoviePilot
          </VCardTitle>
        </VCardItem>

        <VCardText>
          <VForm
            ref="refForm"
            @submit.prevent="() => {}"
          >
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
                  :append-inner-icon="
                    isPasswordVisible ? 'mdi-eye-off-outline' : 'mdi-eye-outline'
                  "
                  :rules="[requiredValidator]"
                  @click:append-inner="isPasswordVisible = !isPasswordVisible"
                />
              </VCol>
              <VCol cols="12">
                <VTextField
                  v-if="isOTP"
                  v-model="form.otp_password"
                  label="双重验证码"
                  type="input"
                />
                <!-- remember me checkbox -->
                <div class="d-flex align-center justify-space-between flex-wrap">
                  <VCheckbox
                    v-model="form.remember"
                    label="保持登录"
                    required
                  />
                </div>
              </VCol>
              <VCol cols="12">
                <!-- login button -->
                <VBtn
                  block
                  type="submit"
                  @click="login"
                >
                  登录
                </VBtn>
                <div
                  v-if="errorMessage"
                  class="text-error mt-2 text-shadow"
                >
                  {{ errorMessage }}
                </div>
              </VCol>
            </VRow>
          </VForm>
        </VCardText>
      </VCard>
    </div>
  </VImg>
</template>

<style lang="scss">
@use "@core/scss/pages/page-auth.scss";

.v-card-item__prepend {
  padding-inline-end: 0 !important;
}
</style>
