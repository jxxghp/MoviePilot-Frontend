<script lang="ts" setup>
import { useToast } from 'vue-toast-notification'
import QrcodeVue from 'qrcode.vue'
import { VForm } from 'vuetify/lib/components/index.mjs'
import { requiredValidator } from '@/@validators'
import api from '@/api'
import type { User } from '@/api/types'
import avatar1 from '@images/avatars/avatar-1.png'
import { useDisplay } from 'vuetify'

// 显示器宽度
const display = useDisplay()

const isNewPasswordVisible = ref(false)
const isConfirmPasswordVisible = ref(false)
const isPasswordVisible = ref(false)
const newPassword = ref('')
const confirmPassword = ref('')

// 提示框
const $toast = useToast()

const refInputEl = ref<HTMLElement>()

// 新增用户窗口
const addUserDialog = ref(false)

// 开启双重验证窗口
const otpDialog = ref(false)

// otp uri
const otpUri = ref('')

// otp secret
const secret = ref('')

// 确认双重验证密码
const otpPassword = ref('')

// 新增用户表单
const userForm = reactive({
  name: '',
  password: '',
  email: '',
})

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
})

// 所有用户信息
const allUsers = ref<User[]>([])

// 二维码信息
const qrCode = ref('')

// changeAvatar function
function changeAvatar(file: Event) {
  const fileReader = new FileReader()
  const { files } = file.target as HTMLInputElement

  if (files && files.length > 0) {
    fileReader.readAsDataURL(files[0])
    fileReader.onload = () => {
      if (typeof fileReader.result === 'string') {
        accountInfo.value.avatar = fileReader.result
        saveAccountInfo()
      }
    }
  }
}

// reset avatar image
function resetAvatar() {
  accountInfo.value.avatar = avatar1
}

// 调用API，加载当前用户数据
async function loadAccountInfo() {
  try {
    const user: User = await api.get('user/current')
    console.log(user)
    accountInfo.value = user
    if (!accountInfo.value.avatar) accountInfo.value.avatar = avatar1
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
  try {
    const result: { [key: string]: any } = await api.put('user/', accountInfo.value)
    if (result.success) $toast.success('用户信息保存成功！')
    else $toast.error(`用户信息保存失败：${result.message}！`)
  } catch (error) {
    console.log(error)
  }
}

// 调用API，查询所有用户
async function loadAllUsers() {
  try {
    const result: User[] = await api.get('/user/')

    allUsers.value = result
  } catch (error) {
    console.log(error)
  }
}

// 删除用户
async function deleteUser(user: User) {
  try {
    const result: { [key: string]: any } = await api.delete(`user/${user.name}`)
    if (result.success) {
      $toast.success('用户删除成功！')
      loadAllUsers()
    } else {
      $toast.error(`用户删除失败：${result.message}！`)
    }
  } catch (error) {
    console.log(error)
  }
}

// 冻结用户
async function deactivateUser(user: User) {
  try {
    user.is_active = !user.is_active

    const result: { [key: string]: any } = await api.put('user/', user)
    if (result.success) {
      $toast.success('用户冻结成功！')
      loadAllUsers()
    } else {
      $toast.error(`用户冻结失败：${result.message}！`)
    }
  } catch (error) {
    console.log(error)
  }
}

// 新增用户
async function addUser() {
  if (!userForm.name || !userForm.password || !userForm.email) {
    $toast.error('请填写完整信息！')
    return
  }
  try {
    const result: { [key: string]: any } = await api.post('user/', userForm)
    if (result.success) {
      $toast.success('用户新增成功！')
      loadAllUsers()
      addUserDialog.value = false
    } else {
      $toast.error(`用户新增失败：${result.message}！`)
    }
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
</script>

<template>
  <div>
    <VRow>
      <VCol cols="12">
        <VCard title="个人信息">
          <VCardText class="d-flex">
            <!-- 👉 Avatar -->
            <VAvatar rounded="lg" size="100" class="me-6" :image="accountInfo.avatar" />

            <!-- 👉 Upload Photo -->
            <form class="d-flex flex-column justify-center gap-5">
              <div class="d-flex flex-wrap gap-2">
                <VBtn color="primary" @click="refInputEl?.click()">
                  <VIcon icon="mdi-cloud-upload-outline" />
                  <span v-if="display.mdAndUp.value" class="ms-2">上传头像</span>
                </VBtn>

                <input
                  ref="refInputEl"
                  type="file"
                  name="file"
                  accept=".jpeg,.png,.jpg,GIF"
                  hidden
                  @input="changeAvatar"
                />

                <VBtn type="reset" color="error" variant="tonal" @click="resetAvatar">
                  <VIcon icon="mdi-refresh" />
                  <span v-if="display.mdAndUp.value" class="ms-2">重置</span>
                </VBtn>

                <VBtn
                  :color="accountInfo.is_otp ? 'error' : 'info'"
                  variant="tonal"
                  @click.stop="accountInfo.is_otp ? disableOtp() : getOtpUri()"
                >
                  <VIcon icon="mdi-account-key" />
                  <span v-if="display.mdAndUp.value" class="ms-2">{{
                    accountInfo.is_otp ? '关闭验证' : '双重验证'
                  }}</span>
                </VBtn>
              </div>

              <p class="text-body-1 mb-0">允许 JPG、GIF 或 PNG 格式， 最大尺寸 800K。</p>
            </form>
          </VCardText>

          <VDivider />

          <VCardText>
            <!-- 👉 Form -->
            <VForm class="mt-6">
              <VRow>
                <!-- 👉 Name -->
                <VCol md="6" cols="12">
                  <VTextField v-model="accountInfo.name" readonly label="用户名" />
                </VCol>

                <!-- 👉 Email -->
                <VCol cols="12" md="6">
                  <VTextField v-model="accountInfo.email" label="邮箱" type="email" />
                </VCol>

                <VCol cols="12" md="6">
                  <!-- 👉 new password -->
                  <VTextField
                    v-model="newPassword"
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
                    :type="isConfirmPasswordVisible ? 'text' : 'password'"
                    :append-inner-icon="isConfirmPasswordVisible ? 'mdi-eye-off-outline' : 'mdi-eye-outline'"
                    label="确认新密码"
                    @click:append-inner="isConfirmPasswordVisible = !isConfirmPasswordVisible"
                  />
                </VCol>

                <!-- 👉 Form Actions -->
                <VCol cols="12" class="d-flex flex-wrap gap-4">
                  <VBtn @click="saveAccountInfo"> 保存 </VBtn>
                </VCol>
              </VRow>
            </VForm>
          </VCardText>
        </VCard>
      </VCol>

      <VCol v-if="accountInfo.is_superuser" cols="12">
        <!-- 👉 Accounts -->
        <VCard title="所有用户">
          <template #append>
            <IconBtn @click.stop="addUserDialog = true">
              <VIcon icon="mdi-plus" />
            </IconBtn>
          </template>
          <VTable class="text-no-wrap">
            <thead>
              <tr>
                <th scope="col">用户名</th>
                <th scope="col">邮箱</th>
                <th scope="col">状态</th>
                <th scope="col">管理员</th>
                <th scope="col" class="w-5" />
              </tr>
            </thead>
            <tbody>
              <tr v-for="user in allUsers" :key="user.name">
                <td>
                  {{ user.name }}
                </td>
                <td>{{ user.email }}</td>
                <td>
                  <VChip v-if="user.is_active" color="success" text-color="white"> 激活 </VChip>
                  <VChip v-else color="error" text-color="white"> 冻结 </VChip>
                </td>
                <td>{{ user.is_superuser ? '是' : '否' }}</td>
                <td>
                  <IconBtn v-show="accountInfo.is_superuser && accountInfo.name !== user.name">
                    <VIcon icon="mdi-dots-vertical" />
                    <VMenu activator="parent" close-on-content-click>
                      <VList>
                        <VListItem variant="plain" @click="deactivateUser(user)">
                          <template #prepend>
                            <VIcon icon="mdi-lock" />
                          </template>
                          <VListItemTitle>
                            {{ user.is_active ? '冻结' : '解冻' }}
                          </VListItemTitle>
                        </VListItem>
                        <VListItem variant="plain" base-color="error" @click="deleteUser(user)">
                          <template #prepend>
                            <VIcon icon="mdi-delete" />
                          </template>
                          <VListItemTitle>删除</VListItemTitle>
                        </VListItem>
                      </VList>
                    </VMenu>
                  </IconBtn>
                </td>
              </tr>
            </tbody>
          </VTable>
        </VCard>
      </VCol>
    </VRow>
    <!-- =弹窗 -->
    <VDialog v-model="addUserDialog" max-width="50rem" persistent z-index="1010">
      <!-- Dialog Content -->
      <VCard title="新增用户">
        <VCardText>
          <VForm @submit.prevent="() => {}">
            <VRow>
              <VCol cols="12" md="6">
                <VTextField v-model="userForm.name" label="用户名" :rules="[requiredValidator]" />
              </VCol>
              <VCol cols="12" md="6">
                <VTextField
                  v-model="userForm.password"
                  label="密码"
                  :rules="[requiredValidator]"
                  :type="isPasswordVisible ? 'text' : 'password'"
                  :append-inner-icon="isPasswordVisible ? 'mdi-eye-off-outline' : 'mdi-eye-outline'"
                  @click:append-inner="isPasswordVisible = !isPasswordVisible"
                />
              </VCol>
              <VCol cols="12" md="6">
                <VTextField v-model="userForm.email" :rules="[requiredValidator]" label="邮箱" />
              </VCol>
            </VRow>
          </VForm>
        </VCardText>
        <VCardActions>
          <VBtn @click="addUserDialog = false"> 取消 </VBtn>
          <VSpacer />
          <VBtn @click="addUser"> 确定 </VBtn>
        </VCardActions>
      </VCard>
    </VDialog>

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
