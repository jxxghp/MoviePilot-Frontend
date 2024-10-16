<script lang="ts" setup>
import {useToast} from 'vue-toast-notification'
import QrcodeVue from 'qrcode.vue'
import {VForm} from 'vuetify/lib/components/index.mjs'
import api from '@/api'
import type {User} from '@/api/types'
import avatar1 from '@images/avatars/avatar-1.png'
import {useDisplay} from 'vuetify'
import store from "@/store";

// 显示器宽度
const display = useDisplay()

const isNewPasswordVisible = ref(false)
const isConfirmPasswordVisible = ref(false)
const newPassword = ref('')
const confirmPassword = ref('')

// 提示框
const $toast = useToast()

const refInputEl = ref<HTMLElement>()

// 开启双重验证窗口
const otpDialog = ref(false)

// otp uri
const otpUri = ref('')

// otp secret
const secret = ref('')

// 确认双重验证密码
const otpPassword = ref('')

// 当前头像缓存
const nowAvatar = ref(avatar1)

// 当前用户信息
const accountInfo = ref<User>({
  id: 0,
  name: '',
  password: '',
  email: '',
  is_active: false,
  is_superuser: false,
  avatar: '',
  is_otp: false,
  permissions: {},
  settings: {
    wechat_userid: null,
    telegram_userid: null,
    slack_userid: null,
    vocechat_userid: null,
    synologychat_userid: null,
  },
})

// 所有用户信息
const allUsers = ref<User[]>([])

// 二维码信息
const qrCode = ref('')

// 更新头像
function changeAvatar(file: Event) {
  const fileReader = new FileReader()
  const { files } = file.target as HTMLInputElement

  if (files && files.length > 0) {
    fileReader.readAsDataURL(files[0])
    fileReader.onload = () => {
      if (typeof fileReader.result === 'string') {
        nowAvatar.value = fileReader.result
        $toast.success('新头像上传成功，待保存后生效!')
      }
    }
  }
}

// 重置默认头像
function resetDefaultAvatar() {
  nowAvatar.value = avatar1
  $toast.success('已重置为默认头像，待保存后生效！')
}

// 还原当前头像
function restoreNowAvatar() {
  nowAvatar.value = accountInfo.value.avatar
  $toast.success('已还原当前使用头像！')
}

// 调用API，加载当前用户数据
async function loadAccountInfo() {
  try {
    const user: User = await api.get('user/current')
    console.log(user)
    accountInfo.value = user
    if (!accountInfo.value.avatar) {
      accountInfo.value.avatar = avatar1
    }
  nowAvatar.value = accountInfo.value.avatar
  } catch (error) {
    console.log(error)
  }
}

// 保存用户信息
async function saveAccountInfo() {
  if (newPassword.value || confirmPassword.value) {
    if (newPassword.value !== confirmPassword.value) {
      $toast.error('两次输入的密码不一致')

      return
    }
    accountInfo.value.password = newPassword.value
  }
  const oldAvatar = accountInfo.value.avatar
  accountInfo.value.avatar = nowAvatar.value
  try {
    const result: { [key: string]: any } = await api.put('user/', accountInfo.value)
    if (result.success) {
      $toast.success('用户信息保存成功！')
      if (oldAvatar !== nowAvatar.value) {
      // 通知 localStorage 中的用户头像发生变化
      store.commit('auth/setAvatar', nowAvatar.value)
      }
    }
    else $toast.error(`用户信息保存失败：${result.message}！`)
  } catch (error) {
    console.log(error)
  }
}

// 调用API，查询所有用户
async function loadAllUsers() {
  try {
    allUsers.value = await api.get('/user/')
  } catch (error) {
    console.log(error)
  }
}

// 为当前用户获取Otp Uri
async function getOtpUri() {
  try {
    const result: { [key: string]: any } = await api.post('user/otp/generate')
    if (result.success) {
      otpUri.value = result.data.uri
      secret.value = result.data.secret
      qrCode.value = result.data.uri
      otpDialog.value = true
    } else {
      $toast.error(`获取otp uri失败：${result.message}！`)
    }
  } catch (error) {
    console.log(error)
  }
}

// 关闭当前用户的双重验证
async function disableOtp() {
  try {
    const result: { [key: string]: any } = await api.post('user/otp/disable')
    if (result.success) {
      accountInfo.value.is_otp = false
      $toast.success('关闭登录双重验证成功！')
    } else {
      $toast.error(`关闭otp失败：${result.message}！`)
    }
  } catch (error) {
    console.log(error)
  }
}

// 启用Otp
async function judgeOtpPassword() {
  if (!otpPassword.value) {
    $toast.error('请填写6位验证码')
    return
  }
  try {
    const result: { [key: string]: any } = await api.post('user/otp/judge', {
      uri: otpUri.value,
      otpPassword: otpPassword.value,
    })

    if (result.success) {
      $toast.success('开启登录双重验证成功！')
      otpDialog.value = false
      accountInfo.value.is_otp = true
    } else {
      $toast.error(`开启otp失败：${result.message}！`)
    }
  } catch (error) {
    console.log(error)
  }
}

// 加载当前用户数据
onMounted(() => {
  loadAccountInfo()
  loadAllUsers()
})

// 监听 localStorage 中的用户头像变化
watch(() => store.state.auth.avatar, () => {
  nowAvatar.value = store.state.auth.avatar
})
</script>

<template>
  <div>
    <VRow>
      <VCol cols="12">
        <VCard title="个人信息">
          <VCardText class="d-flex">
            <!-- 👉 Avatar -->
            <VAvatar rounded="lg" size="100" class="me-6" :image="nowAvatar" />

            <!-- 👉 Upload Photo -->
            <form class="d-flex flex-column justify-center gap-5">
              <div class="d-flex flex-wrap gap-2">
                <VBtn color="primary" @click="refInputEl?.click()">
                  <VIcon icon="mdi-cloud-upload-outline" />
                  <span v-if="display.mdAndUp.value" class="ms-2">上传新头像</span>
                </VBtn>

                <input
                  ref="refInputEl"
                  type="file"
                  name="file"
                  accept=".jpeg,.png,.jpg,GIF"
                  hidden
                  @input="changeAvatar"
                />

                <VBtn type="reset" color="error" variant="tonal" @click="restoreNowAvatar">
                  <VIcon icon="mdi-refresh" />
                  <span v-if="display.mdAndUp.value" class="ms-2">还原当前头像</span>
                </VBtn>

                <VBtn type="reset" color="error" variant="tonal" @click="resetDefaultAvatar">
                  <VIcon icon="mdi-refresh" />
                  <span v-if="display.mdAndUp.value" class="ms-2">重置默认头像</span>
                </VBtn>

                <VBtn
                  :color="accountInfo.is_otp ? 'error' : 'info'"
                  variant="tonal"
                  @click.stop="accountInfo.is_otp ? disableOtp() : getOtpUri()"
                >
                  <VIcon icon="mdi-account-key" />
                  <span v-if="display.mdAndUp.value" class="ms-2">{{
                    accountInfo.is_otp ? '关闭双重验证' : '开启双重验证'
                  }}</span>
                </VBtn>
              </div>

              <p class="text-body-1 mb-0">允许 JPG、PNG、GIF 格式， 最大尺寸 800K。</p>
            </form>
          </VCardText>

          <VCardText>
            <!-- 👉 Form -->
            <VForm class="mt-6">
              <VRow>
                <VCol md="6" cols="12">
                  <VTextField v-model="accountInfo.name" density="comfortable" readonly label="用户名" />
                </VCol>
                <VCol cols="12" md="6">
                  <VTextField v-model="accountInfo.email" density="comfortable" label="邮箱" type="email" />
                </VCol>
                <VCol cols="12" md="6">
                  <VTextField
                    v-model="newPassword"
                    density="comfortable"
                    :type="isNewPasswordVisible ? 'text' : 'password'"
                    :append-inner-icon="isNewPasswordVisible ? 'mdi-eye-off-outline' : 'mdi-eye-outline'"
                    label="新密码"
                    autocomplete=""
                    @click:append-inner="isNewPasswordVisible = !isNewPasswordVisible"
                  />
                </VCol>
                <VCol cols="12" md="6">
                  <!-- 👉 confirm password -->
                  <VTextField
                    v-model="confirmPassword"
                    density="comfortable"
                    :type="isConfirmPasswordVisible ? 'text' : 'password'"
                    :append-inner-icon="isConfirmPasswordVisible ? 'mdi-eye-off-outline' : 'mdi-eye-outline'"
                    label="确认新密码"
                    @click:append-inner="isConfirmPasswordVisible = !isConfirmPasswordVisible"
                  />
                </VCol>
              </VRow>

              <VDivider class="my-10">
                <span>消息账号绑定</span>
              </VDivider>

              <VRow>
                <VCol cols="12" md="6">
                  <VTextField v-model="accountInfo.settings.wechat_userid" density="comfortable" label="微信用户" />
                </VCol>
                <VCol cols="12" md="6">
                  <VTextField
                    v-model="accountInfo.settings.telegram_userid"
                    density="comfortable"
                    label="Telegram用户"
                  />
                </VCol>
                <VCol cols="12" md="6">
                  <VTextField v-model="accountInfo.settings.slack_userid" density="comfortable" label="Slack用户" />
                </VCol>
                <VCol cols="12" md="6">
                  <VTextField
                    v-model="accountInfo.settings.vocechat_userid"
                    density="comfortable"
                    label="VoceChat用户"
                  />
                </VCol>
                <VCol cols="12" md="6">
                  <VTextField
                    v-model="accountInfo.settings.synologychat_userid"
                    density="comfortable"
                    label="SynologyChat用户"
                  />
                </VCol>
              </VRow>
              <VRow>
                <!-- 👉 Form Actions -->
                <VCol cols="12" class="d-flex flex-wrap gap-4">
                  <VBtn @click="saveAccountInfo"> 保存 </VBtn>
                </VCol>
              </VRow>
            </VForm>
          </VCardText>
        </VCard>
      </VCol>
    </VRow>

    <!-- 双重验证弹窗 -->
    <VDialog v-model="otpDialog" max-width="45rem" persistent z-index="1010">
      <!-- 开启双重验证弹窗内容 -->
      <VCard>
        <DialogCloseBtn @click="otpDialog = false" />
        <VCardText>
          <h4 class="text-h4 text-center mb-6 mt-5">登录双重验证</h4>
          <h5 class="text-h5 font-weight-medium mb-2">身份验证器</h5>
          <p class="mb-6">
            使用像Google Authenticator、Microsoft
            Authenticator、Authy或1Password这样的身份验证器应用程序，扫描二维码。它将为您生成一个6位数的代码，供您在下方输入。
          </p>
          <div class="my-6">
            <QrcodeVue class="mx-auto" :value="qrCode" :size="200" max-width="25rem" />
          </div>
          <VAlert
            :title="secret"
            variant="tonal"
            type="warning"
            class="my-4"
            text="如果您在使用二维码时遇到困难，请在您的应用程序中选择手动输入以上代码。"
          >
            <template #prepend />
          </VAlert>
          <VForm>
            <VTextField
              v-model="otpPassword"
              type="text"
              label="输入验证码以确认开启双重验证"
              autocomplete=""
              class="mb-8"
              variant="outlined"
            />
            <div class="d-flex justify-end flex-wrap gap-4">
              <VBtn variant="outlined" color="secondary" @click="otpDialog = false"> 取消 </VBtn>
              <VBtn @click="judgeOtpPassword">
                <template #prepend>
                  <VIcon icon="mdi-check" />
                </template>
                确定
              </VBtn>
            </div>
          </VForm>
        </VCardText>
      </VCard>
    </VDialog>
  </div>
</template>
