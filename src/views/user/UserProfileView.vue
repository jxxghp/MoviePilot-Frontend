<script lang="ts" setup>
import { bufferToBase64Url, base64UrlToUint8Array } from '@/@core/utils/navigator'
import { useToast } from 'vue-toastification'
import QrcodeVue from 'qrcode.vue'
import { VForm } from 'vuetify/lib/components/index.mjs'
import api from '@/api'
import type { User } from '@/api/types'
import avatar1 from '@images/avatars/avatar-1.png'
import { useDisplay } from 'vuetify'
import { useUserStore } from '@/stores'
import { useI18n } from 'vue-i18n'

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

// 开启双重验证窗口
const otpDialog = ref(false)

// otp uri
const otpUri = ref('')

// otp secret
const secret = ref('')

// 确认双重验证密码
const otpPassword = ref('')

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

// 二维码信息
const qrCode = ref('')

// PassKey类型
interface PassKey {
  id: number
  name: string
  created_at: string
  last_used_at?: string
  aaguid?: string
  transports?: string
}

// PassKey列表
const passkeyList = ref<PassKey[]>([])

// PassKey对话框
const passkeyDialog = ref(false)

// PassKey注册loading
const passkeyRegistering = ref(false)

// PassKey名称
const passkeyName = ref('')

// PassKey challenge
const passkeyChallenge = ref('')

// 双重验证菜单
const mfaMenu = ref(false)

// 密码验证对话框
const verifyPasswordDialog = ref(false)

// 验证密码
const verifyPassword = ref('')

// 验证后的回调
const verifyCallback = ref<(() => void) | null>(null)

// 验证对话框标题
const verifyTitle = ref('')

// 验证对话框提示
const verifyText = ref('')

// 检查是否已启用任何双重验证
const hasMfaEnabled = computed(() => {
  return accountInfo.value.is_otp || passkeyList.value.length > 0
})

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
  if (accountInfo.value.nickname) {
    if (!accountInfo.value.settings) {
      accountInfo.value.settings = {}
    }
    accountInfo.value.settings.nickname = accountInfo.value.nickname
  }

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

// 为当前用户获取Otp Uri
async function getOtpUri() {
  // 如果已经启用OTP，只打开对话框，不生成新的二维码
  if (accountInfo.value.is_otp) {
    qrCode.value = '' // 清空二维码，这样对话框会显示清除界面
    otpDialog.value = true
    return
  }
  
  // 未启用OTP，生成新的二维码
  try {
    const result: { [key: string]: any } = await api.post('mfa/otp/generate')
    if (result.success) {
      otpUri.value = result.data.uri
      secret.value = result.data.secret
      qrCode.value = result.data.uri
      otpDialog.value = true
    } else {
      $toast.error(t('profile.otpGenerateFailed', { message: result.message }))
    }
  } catch (error) {
    console.log(error)
  }
}

// 密码验证并执行回调
function withPasswordVerification(title: string, text: string, callback: () => void) {
  verifyTitle.value = title
  verifyText.value = text
  verifyCallback.value = callback
  verifyPassword.value = ''
  verifyPasswordDialog.value = true
}

// 确认密码验证
async function confirmVerifyPassword() {
  if (!verifyPassword.value) {
    $toast.error(t('user.passwordHint'))
    return
  }
  if (verifyCallback.value) {
    verifyCallback.value()
  }
  verifyPasswordDialog.value = false
}

// 关闭当前用户的双重验证
async function disableOtp() {
  if (passkeyList.value.length > 0) {
    $toast.error(t('profile.otpDisableRestrictedByPasskey'))
    return
  }
  withPasswordVerification(t('profile.disableTwoFactor'), t('profile.confirmToDisableOtp'), async () => {
    try {
      const result: { [key: string]: any } = await api.post('mfa/otp/disable', {
        password: verifyPassword.value,
      })
      if (result.success) {
        accountInfo.value.is_otp = false
        $toast.success(t('profile.otpDisableSuccess'))
        otpDialog.value = false
      } else {
        $toast.error(t('profile.otpDisableFailed', { message: result.message }))
      }
    } catch (error) {
      console.log(error)
    }
  })
}

// 启用Otp
async function judgeOtpPassword() {
  if (!otpPassword.value) {
    $toast.error(t('profile.otpCodeRequired'))
    return
  }
  try {
    const result: { [key: string]: any } = await api.post('mfa/otp/verify', {
      uri: otpUri.value,
      otpPassword: otpPassword.value,
    })

    if (result.success) {
      $toast.success(t('profile.otpEnableSuccess'))
      otpDialog.value = false
      accountInfo.value.is_otp = true
    } else {
      $toast.error(t('profile.otpEnableFailed', { message: result.message }))
    }
  } catch (error) {
    console.log(error)
  }
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

// 打开PassKey注册对话框
async function openPassKeyDialog() {
  passkeyName.value = ''
  passkeyDialog.value = true
  await fetchPassKeyList()
}

// 注册PassKey
async function registerPassKey() {
  if (!passkeyName.value) {
    $toast.error(t('profile.passkeyNameRequired'))
    return
  }

  passkeyRegistering.value = true
  try {
    // 1. 开始注册
    const startResult: { [key: string]: any } = await api.post('mfa/passkey/register/start', {
      name: passkeyName.value,
    })

    if (!startResult.success) {
      $toast.error(startResult.message || t('profile.passkeyRegisterFailed'))
      passkeyRegistering.value = false
      return
    }

    const { options, challenge } = startResult.data
    const publicKeyOptions = JSON.parse(options)
    passkeyChallenge.value = challenge

    // 2. 调用WebAuthn API
    const credential = await navigator.credentials.create({
      publicKey: {
        ...publicKeyOptions,
        challenge: base64UrlToUint8Array(publicKeyOptions.challenge),
        user: {
          ...publicKeyOptions.user,
          id: base64UrlToUint8Array(publicKeyOptions.user.id),
        },
        excludeCredentials: publicKeyOptions.excludeCredentials?.map((cred: any) => ({
          ...cred,
          id: base64UrlToUint8Array(cred.id),
        })),
      },
    })

    if (!credential) {
      $toast.error(t('profile.passkeyRegisterCancelled'))
      return
    }

    // 3. 转换credential为可传输格式
    const credentialJSON = {
      id: credential.id,
      rawId: bufferToBase64Url((credential as any).rawId),
      type: credential.type,
      response: {
        attestationObject: bufferToBase64Url((credential as any).response.attestationObject),
        clientDataJSON: bufferToBase64Url((credential as any).response.clientDataJSON),
        transports: (credential as any).response.getTransports ? (credential as any).response.getTransports() : [],
      },
    }

    // 4. 完成注册
    const finishResult: { [key: string]: any } = await api.post('mfa/passkey/register/finish', {
      credential: credentialJSON,
      challenge: passkeyChallenge.value,
      name: passkeyName.value,
    })

    if (finishResult.success) {
      $toast.success(t('profile.passkeyRegisterSuccess'))
      passkeyName.value = ''
      await fetchPassKeyList()
    } else {
      $toast.error(finishResult.message || t('profile.passkeyRegisterFailed'))
    }
  } catch (error: any) {
    console.error('PassKey注册失败:', error)
    if (error.name === 'NotAllowedError') {
      $toast.error(t('profile.passkeyRegisterCancelled'))
    } else {
      $toast.error(t('profile.passkeyRegisterFailed'))
    }
  }
  passkeyRegistering.value = false
}

// 删除PassKey
async function deletePassKey(passkeyId: number) {
  withPasswordVerification(t('common.delete') + t('profile.usePasskey'), t('profile.confirmToDeletePasskey'), async () => {
    try {
      const result: { [key: string]: any } = await api.post('mfa/passkey/delete', {
        passkey_id: passkeyId,
        password: verifyPassword.value,
      })
      if (result.success) {
        $toast.success(t('profile.passkeyDeleteSuccess'))
        await fetchPassKeyList()
      } else {
        $toast.error(result.message || t('profile.passkeyDeleteFailed'))
      }
    } catch (error) {
      console.log(error)
      $toast.error(t('profile.passkeyDeleteFailed'))
    }
  })
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
                    <VBtn
                      :color="hasMfaEnabled ? 'warning' : 'success'"
                      variant="tonal"
                      v-bind="props"
                    >
                      <VIcon icon="mdi-shield-key" />
                      <span v-if="display.mdAndUp.value" class="ms-2">
                        {{ hasMfaEnabled ? t('profile.setupMfa') : t('profile.enableMfa') }}
                      </span>
                      <VIcon icon="mdi-menu-down" class="ms-1" />
                    </VBtn>
                  </template>
                  <VList>
                    <VListItem @click="getOtpUri(); mfaMenu = false">
                      <template #prepend>
                        <VIcon icon="mdi-cellphone-key" />
                      </template>
                      <VListItemTitle>{{ t('profile.useAuthenticator') }}</VListItemTitle>
                      <VListItemSubtitle v-if="accountInfo.is_otp" class="text-success">
                        {{ t('profile.enabled') }}
                      </VListItemSubtitle>
                    </VListItem>
                    <VListItem @click="openPassKeyDialog(); mfaMenu = false">
                      <template #prepend>
                        <VIcon icon="mdi-key-variant" />
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

    <!-- 双重验证弹窗 -->
    <VDialog v-if="otpDialog" v-model="otpDialog" max-width="45rem" scrollable>
      <VCard>
        <VDialogCloseBtn @click="otpDialog = false" />
        <VCardText>
          <!-- 如果已启用OTP，显示清除界面 -->
          <template v-if="accountInfo.is_otp && !qrCode">
            <h4 class="text-h4 text-center mb-6 mt-5">{{ t('profile.authenticatorManagement') }}</h4>
            <VAlert type="success" variant="tonal" class="mb-4">
              {{ t('profile.authenticatorEnabled') }}
            </VAlert>
            <p class="mb-6">
              {{ t('profile.clearAuthenticatorTip') }}
            </p>
            <div class="d-flex justify-end flex-wrap gap-4">
              <VBtn variant="outlined" color="secondary" @click="otpDialog = false">
                {{ t('common.cancel') }}
              </VBtn>
              <VBtn color="error" @click="disableOtp(); otpDialog = false">
                <template #prepend>
                  <VIcon icon="mdi-delete" />
                </template>
                {{ t('profile.clearAuthenticator') }}
              </VBtn>
            </div>
          </template>

          <!-- 设置新的OTP -->
          <template v-else>
            <h4 class="text-h4 text-center mb-6 mt-5">{{ t('profile.setupAuthenticator') }}</h4>
            <h5 class="text-h5 font-weight-medium mb-2">{{ t('profile.authenticatorApp') }}</h5>
            <p class="mb-6">
              {{ t('profile.authenticatorAppDescription') }}
            </p>
            <div class="my-6">
              <QrcodeVue class="mx-auto" :value="qrCode" :size="200" max-width="25rem" />
            </div>
            <VAlert :title="secret" variant="tonal" type="warning" class="my-4" :text="t('profile.secretKeyTip')">
              <template #prepend />
            </VAlert>
            <VForm @submit.prevent="judgeOtpPassword">
              <VTextField
                v-model="otpPassword"
                type="text"
                inputmode="numeric"
                autocomplete="one-time-code"
                :label="t('profile.enterVerificationCode')"
                class="mb-8"
                variant="outlined"
                prepend-inner-icon="mdi-shield-key"
              />
              <div class="d-flex justify-end flex-wrap gap-4">
                <VBtn variant="outlined" color="secondary" @click="otpDialog = false">
                  {{ t('common.cancel') }}
                </VBtn>
                <VBtn type="submit">
                  <template #prepend>
                    <VIcon icon="mdi-check" />
                  </template>
                  {{ t('common.confirm') }}
                </VBtn>
              </div>
            </VForm>
          </template>
        </VCardText>
      </VCard>
    </VDialog>

    <!-- PassKey管理对话框 -->
    <VDialog v-if="passkeyDialog" v-model="passkeyDialog" max-width="45rem" scrollable>
      <VCard>
        <VDialogCloseBtn @click="passkeyDialog = false" />
        <VCardText>
          <h4 class="text-h4 text-center mb-6 mt-5">{{ t('profile.passkeyManagement') }}</h4>

          <!-- 安全警告 -->
          <VAlert
            type="warning"
            variant="tonal"
            class="mb-6"
            icon="mdi-alert"
          >
            <i18n-t keypath="profile.passkeyDomainWarning" tag="span">
              <template #domain>
                <b>{{ t('profile.accessDomain') }}</b>
              </template>
            </i18n-t>
          </VAlert>
          
          <!-- 注册新通行密钥 -->
          <VCard v-if="accountInfo.is_otp" variant="tonal" class="mb-6">
            <VCardText>
              <h5 class="text-h5 font-weight-medium mb-2">{{ t('profile.registerNewPasskey') }}</h5>
              <p class="mb-4">{{ t('profile.passkeyDescription') }}</p>
              <VForm @submit.prevent="registerPassKey">
                <VTextField
                  v-model="passkeyName"
                  :label="t('profile.passkeyName')"
                  :placeholder="t('profile.passkeyNamePlaceholder')"
                  class="mb-4"
                  variant="outlined"
                  prepend-inner-icon="mdi-form-textbox"
                />
                <VBtn
                  color="primary"
                  type="submit"
                  :loading="passkeyRegistering"
                  prepend-icon="mdi-plus"
                >
                  {{ t('profile.registerPasskey') }}
                </VBtn>
              </VForm>
            </VCardText>
          </VCard>

          <!-- 未启用 OTP 提示 -->
          <VAlert
            v-else
            type="error"
            variant="tonal"
            class="mb-6"
            icon="mdi-shield-lock"
          >
            <i18n-t keypath="profile.otpRequiredForPasskey" tag="span">
              <template #otp>
                <b>{{ t('profile.otpAuthenticator') }}</b>
              </template>
            </i18n-t>
          </VAlert>

          <!-- 已注册的通行密钥列表 -->
          <VCard variant="tonal">
            <VCardText>
              <h5 class="text-h5 font-weight-medium mb-2">{{ t('profile.registeredPasskeys') }}</h5>
              <VList v-if="passkeyList.length > 0" class="mt-4">
                <VListItem
                  v-for="passkey in passkeyList"
                  :key="passkey.id"
                  class="mb-2 py-4"
                  rounded="lg"
                  border
                >
                  <template #prepend>
                    <VIcon icon="mdi-key-variant" size="32" class="me-4" />
                  </template>
                  <VListItemTitle class="font-weight-medium">
                    {{ passkey.name }}
                  </VListItemTitle>
                  <VListItemSubtitle>
                    {{ t('profile.createdAt') }}: {{ new Date(passkey.created_at).toLocaleString(locale) }}
                  </VListItemSubtitle>
                  <template #append>
                    <VBtn
                      icon="mdi-delete"
                      variant="text"
                      color="error"
                      size="small"
                      @click="deletePassKey(passkey.id)"
                    />
                  </template>
                </VListItem>
              </VList>
              <VAlert v-else type="info" variant="tonal" class="mt-4">
                {{ t('profile.noPasskeys') }}
              </VAlert>
            </VCardText>
          </VCard>

          <div class="d-flex justify-end mt-6">
            <VBtn variant="outlined" @click="passkeyDialog = false">{{ t('common.close') }}</VBtn>
          </div>
        </VCardText>
      </VCard>
    </VDialog>

    <!-- 密码验证对话框 -->
    <VDialog v-model="verifyPasswordDialog" max-width="30rem">
      <VCard>
        <VCardTitle class="text-h5 text-center mt-4">{{ verifyTitle }}</VCardTitle>
        <VCardText>
          <p class="mb-4">{{ verifyText }}</p>
          <VForm @submit.prevent="confirmVerifyPassword">
            <VTextField
              v-model="verifyPassword"
              :type="isConfirmPasswordVisible ? 'text' : 'password'"
              :label="t('user.password')"
              :append-inner-icon="isConfirmPasswordVisible ? 'mdi-eye-off-outline' : 'mdi-eye-outline'"
              variant="outlined"
              prepend-inner-icon="mdi-lock"
              autocomplete="current-password"
              @click:append-inner="isConfirmPasswordVisible = !isConfirmPasswordVisible"
            />
            <div class="d-flex justify-end gap-4 mt-4">
              <VBtn variant="outlined" color="secondary" @click="verifyPasswordDialog = false">
                {{ t('common.cancel') }}
              </VBtn>
              <VBtn type="submit" color="primary">
                {{ t('common.confirm') }}
              </VBtn>
            </div>
          </VForm>
        </VCardText>
      </VCard>
    </VDialog>
  </div>
</template>
