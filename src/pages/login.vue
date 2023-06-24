<script setup lang="ts">
import { useTheme } from 'vuetify'

import api from '@/api'
import router from '@/router'
import logo from '@images/logo.svg?raw'
import authV1MaskDark from '@images/pages/auth-v1-mask-dark.png'
import authV1MaskLight from '@images/pages/auth-v1-mask-light.png'
import authV1Tree2 from '@images/pages/auth-v1-tree-2.png'
import authV1Tree from '@images/pages/auth-v1-tree.png'

const form = ref({
  username: '',
  password: '',
  remember: true,
})

const vuetifyTheme = useTheme()

const authThemeMask = computed(() => {
  return vuetifyTheme.global.name.value === 'light' ? authV1MaskLight : authV1MaskDark
})

const isPasswordVisible = ref(false)
const errorMessage = ref('')

// 登录获取token事件
const login = () => {
  errorMessage.value = ''
  if (!form.value.username || !form.value.password) {
    errorMessage.value = '请输入用户名和密码'

    return
  }

  // 用户名密码
  const formData = new FormData()

  formData.append('username', form.value.username)
  formData.append('password', form.value.password)

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

      // 将token保存在本地存储中，用于后续请求
      localStorage.setItem('token', token)

      // 保存保持登录状态
      localStorage.setItem('remember', form.value.remember.toString())

      // 跳转到首页
      router.push('/')
    })
    .catch((error: any) => {
      // 登录失败，显示错误提示
      if (!error.response)
        errorMessage.value = '登录失败，请检查网络连接'

      else if (error.response.status === 401)
        errorMessage.value = '登录失败，请检查用户名和密码是否正确'

      else if (error.response.status === 403)
        errorMessage.value = '登录失败，您没有权限访问'

      else if (error.response.status === 500)
        errorMessage.value = '登录失败，服务器错误'

      else
        errorMessage.value = `登录失败 ${error.response.status}，请检查用户名和密码是否正确`
    })
}

// 自动登录
onMounted(() => {
  // 获取token
  const token = localStorage.getItem('token')

  // 获取保持登录状态
  const remember = localStorage.getItem('remember')

  // 如果token存在，且保持登录状态为true，则跳转到首页
  if (token && remember === 'true')
    router.push('/')
})
</script>

<template>
  <div class="auth-wrapper d-flex align-center justify-center pa-4">
    <VCard class="auth-card pa-4 pt-7">
      <VCardItem class="justify-center">
        <template #prepend>
          <div class="d-flex">
            <div v-html="logo" />
          </div>
        </template>

        <VCardTitle class="font-weight-semibold text-2xl text-uppercase">
          MoviePilot
        </VCardTitle>
      </VCardItem>

      <VCardText class="pt-2">
        <h5 class="text-h5 font-weight-semibold mb-1">
          欢迎使用 MoviePilot! 👋🏻
        </h5>
        <p class="mb-0">
          请输入用户名密码登录
        </p>
      </VCardText>

      <VCardText>
        <VForm @submit.prevent="login">
          <VRow>
            <!-- username -->
            <VCol cols="12">
              <VTextField
                v-model="form.username"
                label="用户名"
                type="text"
                required
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
                required
                @click:append-inner="isPasswordVisible = !isPasswordVisible"
              />

              <div
                v-if="errorMessage"
                class="text-error mt-1"
              >
                {{ errorMessage }}
              </div>

              <!-- remember me checkbox -->
              <div class="d-flex align-center justify-space-between flex-wrap mt-1 mb-4">
                <VCheckbox
                  v-model="form.remember"
                  label="保持登录"
                  required
                />
              </div>

              <!-- login button -->
              <VBtn
                block
                type="submit"
              >
                登录
              </VBtn>
            </VCol>
          </VRow>
        </VForm>
      </VCardText>
    </VCard>
  </div>
</template>

<style lang="scss">
@use "@core/scss/pages/page-auth.scss";
</style>
