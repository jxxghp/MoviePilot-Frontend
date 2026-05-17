<script lang="ts" setup>
import { useToast } from 'vue-toastification'
import { VForm } from 'vuetify/lib/components/index.mjs'
import api from '@/api'
import type { User, PassKey } from '@/api/types'
import avatar1 from '@images/avatars/avatar-1.png'
import { useDisplay } from 'vuetify'
import { useUserStore } from '@/stores'
import { useI18n } from 'vue-i18n'
import { openSharedDialog } from '@/composables/useSharedDialog'

const OTPAuthDialog = defineAsyncComponent(() => import('@/components/dialog/OTPAuthDialog.vue'))
const PasskeyDialog = defineAsyncComponent(() => import('@/components/dialog/PasskeyDialog.vue'))
const VerifyPasswordDialog = defineAsyncComponent(() => import('@/components/dialog/VerifyPasswordDialog.vue'))

// 国际化
const { t, locale } = useI18n()

// 显示器宽度
const display = useDisplay()

const isNewPasswordVisible = ref(false)
const isConfirmPasswordVisible = ref(false)
const newPassword = ref('')
const confirmPassword = ref('')

// 用户 Store
const userStore = useUserStore()

// 提示框
const $toast = useToast()

const refInputEl = ref<HTMLElement>()

// 正在保存
const isSaving = ref(false)

// 当前头像缓存
const currentAvatar = ref(avatar1)

// 当前用户名
const currentUserName = ref('')

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
  settings: {},
  nickname: '',
})

// PassKey列表
const passkeyList = ref<PassKey[]>([])

// 双重验证菜单
const mfaMenu = ref(false)

// 验证密码
const verifyPassword = ref('')

// 验证后的回调
const verifyCallback = ref<((password: string) => void) | null>(null)

// 验证对话框标题
const verifyTitle = ref('')

// 验证对话框提示
const verifyText = ref('')

// 检查是否已启用任何双重验证
const hasMfaEnabled = computed(() => {
  return accountInfo.value.is_otp || passkeyList.value.length > 0
})

let otpDialogController: ReturnType<typeof openSharedDialog> | null = null
let passkeyDialogController: ReturnType<typeof openSharedDialog> | null = null
let verifyPasswordDialogController: ReturnType<typeof openSharedDialog> | null = null

// 打开共享 OTP 管理弹窗，并把状态变更回写到用户资料。
function openOtpDialog() {
  mfaMenu.value = false
  otpDialogController?.close()
  otpDialogController = openSharedDialog(
    OTPAuthDialog,
    {
      isOtp: accountInfo.value.is_otp,
      passkeyList: passkeyList.value,
    },
    {
      'update:isOtp': (value: boolean) => {
        accountInfo.value.is_otp = value
      },
      'update:modelValue': (value: boolean) => {
        if (!value) otpDialogController = null
      },
      verifyPassword: onVerifyPassword,
    },
    { closeOn: ['update:modelValue'] },
  )
}

// 打开共享 PassKey 管理弹窗，并同步最新 PassKey 列表。
function openPasskeyDialog() {
  mfaMenu.value = false
  passkeyDialogController?.close()
  passkeyDialogController = openSharedDialog(
    PasskeyDialog,
    {
      isOtp: accountInfo.value.is_otp,
    },
    {
      'update:modelValue': (value: boolean) => {
        if (!value) passkeyDialogController = null
      },
      'update:passkeyList': (value: PassKey[]) => {
        passkeyList.value = value
      },
      verifyPassword: onVerifyPassword,
    },
    { closeOn: ['update:modelValue'] },
  )
}

// 打开共享密码验证弹窗。
function openVerifyPasswordDialog() {
  verifyPasswordDialogController?.close()
  verifyPasswordDialogController = openSharedDialog(
    VerifyPasswordDialog,
    {
      text: verifyText.value,
      title: verifyTitle.value,
    },
    {
      close: () => {
        verifyPasswordDialogController = null
      },
      confirm: confirmVerifyPassword,
      'update:modelValue': (value: boolean) => {
        if (!value) verifyPasswordDialogController = null
      },
    },
    { closeOn: ['close', 'update:modelValue'] },
  )
}

// 关闭共享密码验证弹窗并清理控制器。
function closeVerifyPasswordDialog() {
  verifyPasswordDialogController?.close()
  verifyPasswordDialogController = null
}

// 更新头像
function changeAvatar(file: Event) {
  const fileReader = new FileReader()
  const { files } = file.target as HTMLInputElement
  if (files && files.length > 0) {
    const selectedFile = files[0]
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
    const maxSize = 800 * 1024
    // 检查文件是否为图片
    if (!allowedTypes.includes(selectedFile.type)) {
      $toast.error(t('profile.avatarFormatError'))
      return
    }
    // 检查文件大小
    if (selectedFile.size > maxSize) {
      $toast.error(t('profile.avatarSizeError'))
      return
    }
    fileReader.readAsDataURL(selectedFile)
    fileReader.onload = () => {
      if (typeof fileReader.result === 'string') {
        currentAvatar.value = fileReader.result
        $toast.success(t('profile.avatarUploadSuccess'))
      }
    }
  }
}

// 重置默认头像
function resetDefaultAvatar() {
  currentAvatar.value = avatar1
  $toast.success(t('profile.resetAvatarSuccess'))
}

// 还原当前头像
function restoreCurrentAvatar() {
  currentAvatar.value = accountInfo.value.avatar
  $toast.success(t('profile.restoreAvatarSuccess'))
}

// 加载当前用户信息
async function fetchUserInfo() {
  try {
    const result: User = await api.get(`user/${userStore.userName}`)
    if (result) {
      accountInfo.value = result
      accountInfo.value.avatar = accountInfo.value.avatar ? accountInfo.value.avatar : avatar1
      accountInfo.value.nickname = accountInfo.value.settings?.nickname ?? ''
      currentUserName.value = accountInfo.value.name
      currentAvatar.value = accountInfo.value.avatar
      // 同时加载PassKey列表
      await fetchPassKeyList()
    }
  } catch (error) {
    console.log(error)
  }
}

// 保存账户信息
async function saveAccountInfo() {
  if (isSaving.value) {
    $toast.error(t('profile.savingInProgress'))
    return
  }
  if (!currentUserName.value) {
    $toast.error(t('profile.usernameRequired'))
    return
  }
  if (newPassword.value || confirmPassword.value) {
    if (newPassword.value !== confirmPassword.value) {
      $toast.error(t('profile.passwordMismatch'))
      return
    }
    accountInfo.value.password = newPassword.value
  }

  // 将nickname保存到settings中，后端可以直接处理JSON对象
  if (!accountInfo.value.settings) {
    accountInfo.value.settings = {}
  }
  accountInfo.value.settings.nickname = accountInfo.value.nickname ?? ''

  const oldUserName = accountInfo.value.name
  const oldAvatar = accountInfo.value.avatar
  accountInfo.value.avatar = currentAvatar.value
  accountInfo.value.name = currentUserName.value
  isSaving.value = true
  try {
    // 创建一个临时对象来保存用户数据，确保所有字段都会发送
    const userData = { ...accountInfo.value }

    const result: { [key: string]: any } = await api.put('user/', userData)

    if (result.success) {
      if (oldUserName !== currentUserName.value) {
        $toast.success(t('profile.usernameChangeSuccess', { oldName: oldUserName, newName: currentUserName.value }))
        // 更新本地用户名显示
        userStore.setUserName(currentUserName.value)
      } else {
        $toast.success(t('profile.saveSuccess'))
      }
      // 更新本地头像显示
      if (oldAvatar !== currentAvatar.value) {
        userStore.setAvatar(currentAvatar.value)
      }
    } else {
      if (oldAvatar !== currentAvatar.value) {
        $toast.error(
          t('profile.saveFailedWithNameChange', {
            oldName: oldUserName,
            newName: currentUserName.value,
            message: result.message,
          }),
        )
      } else {
        $toast.error(t('profile.saveFailed', { message: result.message }))
      }
      // 失败缓存值还原
      currentUserName.value = accountInfo.value.name
      accountInfo.value.name = oldUserName
      currentAvatar.value = accountInfo.value.avatar
      accountInfo.value.avatar = oldAvatar
    }
  } catch (error) {
    console.log('保存失败:', error)
  }
  isSaving.value = false
}

// 验证密码载荷接口
interface VerifyPasswordPayload {
  title: string
  text: string
  callback: (password: string) => void
}

// 密码验证并执行回调
function withPasswordVerification(title: string, text: string, callback: (password: string) => void) {
  verifyTitle.value = title
  verifyText.value = text
  verifyCallback.value = callback
  verifyPassword.value = ''
  openVerifyPasswordDialog()
}

// 弹窗请求密码验证
function onVerifyPassword({ title, text, callback }: VerifyPasswordPayload) {
  withPasswordVerification(title, text, callback)
}

// 确认密码验证
async function confirmVerifyPassword(password = verifyPassword.value) {
  verifyPassword.value = password
  if (!verifyPassword.value) {
    $toast.error(t('user.passwordHint'))
    return
  }
  if (verifyCallback.value) {
    verifyCallback.value(verifyPassword.value)
  }
  closeVerifyPasswordDialog()
}

// 获取PassKey列表
async function fetchPassKeyList() {
  try {
    const result: { [key: string]: any } = await api.get('mfa/passkey/list')
    if (result.success) {
      passkeyList.value = result.data || []
    }
  } catch (error) {
    console.log(error)
  }
}

// 加载当前用户数据
onMounted(() => {
  fetchUserInfo()
})

// 监听 localStorage 中的用户头像变化
watch(
  () => userStore.avatar,
  () => {
    currentAvatar.value = userStore.avatar
  },
)
</script>

<template>
  <div>
    <VRow>
      <VCol cols="12">
        <VCard :title="t('profile.personalInfo')">
          <VCardText class="flex">
            <!-- 👉 Avatar -->
            <VAvatar rounded="lg" size="100" class="me-6" :image="currentAvatar" />

            <!-- 👉 Upload Photo -->
            <form class="flex flex-col justify-center gap-5">
              <div class="flex flex-wrap gap-2">
                <VBtn color="primary" @click="refInputEl?.click()">
                  <VIcon icon="mdi-cloud-upload-outline" />
                  <span v-if="display.mdAndUp.value" class="ms-2">{{ t('profile.uploadNewAvatar') }}</span>
                </VBtn>

                <input
                  ref="refInputEl"
                  type="file"
                  name="file"
                  accept=".jpeg,.png,.jpg,GIF"
                  hidden
                  @input="changeAvatar"
                />

                <VBtn type="reset" color="info" variant="tonal" @click="restoreCurrentAvatar">
                  <VIcon icon="mdi-refresh" />
                  <span v-if="display.mdAndUp.value" class="ms-2">{{ t('common.reset') }}</span>
                </VBtn>

                <VBtn type="reset" color="error" variant="tonal" @click="resetDefaultAvatar">
                  <VIcon icon="mdi-image-sync-outline" />
                  <span v-if="display.mdAndUp.value" class="ms-2">{{ t('common.default') }}</span>
                </VBtn>

                <!-- 双重验证菜单按钮 -->
                <VMenu v-model="mfaMenu" :close-on-content-click="false">
                  <template #activator="{ props }">
                    <VBtn :color="hasMfaEnabled ? 'warning' : 'success'" variant="tonal" v-bind="props">
                      <VIcon icon="mdi-shield-key" />
                      <span v-if="display.mdAndUp.value" class="ms-2">
                        {{ hasMfaEnabled ? t('profile.setupMfa') : t('profile.enableMfa') }}
                      </span>
                      <VIcon icon="mdi-menu-down" class="ms-1" />
                    </VBtn>
                  </template>
                  <VList>
                    <VListItem @click="openOtpDialog">
                      <template #prepend>
                        <VIcon icon="mdi-cellphone-key" />
                      </template>
                      <VListItemTitle>{{ t('profile.useAuthenticator') }}</VListItemTitle>
                      <VListItemSubtitle v-if="accountInfo.is_otp" class="text-success">
                        {{ t('profile.enabled') }}
                      </VListItemSubtitle>
                    </VListItem>
                    <VListItem @click="openPasskeyDialog">
                      <template #prepend>
                        <VIcon icon="material-symbols:passkey" />
                      </template>
                      <VListItemTitle>{{ t('profile.usePasskey') }}</VListItemTitle>
                      <VListItemSubtitle v-if="passkeyList.length > 0" class="text-success">
                        {{ t('profile.keysCount', { count: passkeyList.length }) }}
                      </VListItemSubtitle>
                    </VListItem>
                  </VList>
                </VMenu>
              </div>

              <p class="text-body-1 mb-0">{{ t('profile.avatarFormatTip') }}</p>
            </form>
          </VCardText>

          <VCardText>
            <!-- 👉 Form -->
            <VForm class="mt-6">
              <VRow>
                <VCol cols="12" md="6">
                  <VTextField
                    v-model="currentUserName"
                    density="comfortable"
                    readonly
                    :label="t('user.username')"
                    prepend-inner-icon="mdi-account"
                  />
                </VCol>
                <VCol cols="12" md="6">
                  <VTextField
                    v-model="accountInfo.email"
                    density="comfortable"
                    clearable
                    :label="t('user.email')"
                    type="email"
                    prepend-inner-icon="mdi-email"
                  />
                </VCol>
                <VCol cols="12" md="6">
                  <VTextField
                    v-model="newPassword"
                    density="comfortable"
                    :type="isNewPasswordVisible ? 'text' : 'password'"
                    :append-inner-icon="isNewPasswordVisible ? 'mdi-eye-off-outline' : 'mdi-eye-outline'"
                    clearable
                    :label="t('user.password')"
                    autocomplete=""
                    prepend-inner-icon="mdi-lock"
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
                    clearable
                    :label="t('user.confirmPassword')"
                    prepend-inner-icon="mdi-lock-check"
                    @click:append-inner="isConfirmPasswordVisible = !isConfirmPasswordVisible"
                  />
                </VCol>
                <VCol cols="12" md="6">
                  <VTextField
                    v-model="accountInfo.nickname"
                    density="comfortable"
                    clearable
                    :label="t('profile.nickname')"
                    :placeholder="t('profile.nicknamePlaceholder')"
                    prepend-inner-icon="mdi-card-account-details"
                  />
                </VCol>
              </VRow>

              <VDivider class="my-10">
                <span>{{ t('profile.accountBinding') }}</span>
              </VDivider>

              <VRow>
                <VCol cols="12" md="6">
                  <VTextField
                    v-model="accountInfo.settings.wechat_userid"
                    density="comfortable"
                    clearable
                    :label="t('profile.wechatUser')"
                    prepend-inner-icon="mdi-wechat"
                  />
                </VCol>
                <VCol cols="12" md="6">
                  <VTextField
                    v-model="accountInfo.settings.wechatclawbot_userid"
                    density="comfortable"
                    clearable
                    :label="t('profile.wechatClawBotUser')"
                    prepend-inner-icon="mdi-robot-happy-outline"
                  />
                </VCol>
                <VCol cols="12" md="6">
                  <VTextField
                    v-model="accountInfo.settings.feishu_openid"
                    density="comfortable"
                    clearable
                    :label="t('profile.feishuUser')"
                    prepend-inner-icon="mdi-message-badge-outline"
                  />
                </VCol>
                <VCol cols="12" md="6">
                  <VTextField
                    v-model="accountInfo.settings.telegram_userid"
                    density="comfortable"
                    clearable
                    :label="t('profile.telegramUser')"
                    prepend-inner-icon="mdi-send"
                  />
                </VCol>
                <VCol cols="12" md="6">
                  <VTextField
                    v-model="accountInfo.settings.slack_userid"
                    density="comfortable"
                    clearable
                    :label="t('profile.slackUser')"
                    prepend-inner-icon="mdi-slack"
                  />
                </VCol>
                <VCol cols="12" md="6">
                  <VTextField
                    v-model="accountInfo.settings.discord_userid"
                    density="comfortable"
                    clearable
                    :label="t('profile.discordUser')"
                    prepend-inner-icon="mdi-discord"
                  />
                </VCol>
                <VCol cols="12" md="6">
                  <VTextField
                    v-model="accountInfo.settings.vocechat_userid"
                    density="comfortable"
                    clearable
                    :label="t('profile.vocechatUser')"
                    prepend-inner-icon="mdi-chat"
                  />
                </VCol>
                <VCol cols="12" md="6">
                  <VTextField
                    v-model="accountInfo.settings.synologychat_userid"
                    density="comfortable"
                    clearable
                    :label="t('profile.synologychatUser')"
                    prepend-inner-icon="mdi-message"
                  />
                </VCol>
                <VCol cols="12" md="6">
                  <VTextField
                    v-model="accountInfo.settings.douban_userid"
                    density="comfortable"
                    clearable
                    :label="t('profile.doubanUser')"
                    prepend-inner-icon="mdi-movie"
                  />
                </VCol>
              </VRow>
              <VRow>
                <!-- 👉 Form Actions -->
                <VCol cols="12" class="d-flex flex-wrap gap-4">
                  <VBtn @click="saveAccountInfo" :disabled="isSaving" prepend-icon="mdi-content-save">
                    <span v-if="isSaving">{{ t('common.saving') }}...</span>
                    <span v-else>{{ t('common.save') }}</span>
                  </VBtn>
                </VCol>
              </VRow>
            </VForm>
          </VCardText>
        </VCard>
      </VCol>
    </VRow>
  </div>
</template>
