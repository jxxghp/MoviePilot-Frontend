<script lang="ts" setup>
import { useToast } from 'vue-toastification'
import QRCode from 'qrcode'
import { useDisplay } from 'vuetify'
import { useI18n } from 'vue-i18n'
import api from '@/api'
import type { ApiResponse, PassKey } from '@/api/types'
import { useGlobalSettingsStore } from '@/stores'

interface Props {
  modelValue: boolean
  isOtp: boolean
  passkeyList?: PassKey[]
}

const props = withDefaults(defineProps<Props>(), {
  passkeyList: () => [],
})

const emit = defineEmits(['update:modelValue', 'update:isOtp', 'verifyPassword'])

const { t } = useI18n()
const display = useDisplay()
const $toast = useToast()
const globalSettingsStore = useGlobalSettingsStore()

// 内部状态
const show = computed({
  get: () => props.modelValue,
  set: value => emit('update:modelValue', value),
})

// otp uri
const otpUri = ref('')

// otp secret
const secret = ref('')

// 确认双重验证密码
const otpPassword = ref('')

const allowPasskeyWithoutOtp = computed(() => globalSettingsStore.get('PASSKEY_ALLOW_REGISTER_WITHOUT_OTP') === true)

// OTP 初始化加载状态
const otpLoading = ref(false)

// OTP 初始化失败信息
const otpGenerateError = ref('')

// 二维码图片 base64
const qrCodeImage = ref('')

// 二维码信息
const qrCode = ref('')

// 清空当前 OTP 设置流程的临时数据。
function resetOtpSetupState() {
  qrCodeImage.value = ''
  qrCode.value = ''
  otpUri.value = ''
  secret.value = ''
  otpGenerateError.value = ''
}

// 标记 OTP 初始化失败，并向用户显示明确错误。
function setOtpGenerateError(message?: string) {
  const errorMessage = message || t('common.error')
  otpGenerateError.value = t('profile.otpGenerateFailed', { message: errorMessage })
  $toast.error(otpGenerateError.value)
}

// 为当前用户获取 OTP URI 并生成二维码图片。
async function getOtpUri() {
  resetOtpSetupState()
  // 如果已经启用OTP，只打开对话框，不生成新的二维码
  if (props.isOtp) {
    return
  }

  // 未启用OTP，生成新的二维码
  otpLoading.value = true
  try {
    const result = (await api.post('mfa/otp/generate')) as ApiResponse<{
      uri: string
      secret: string
    }>
    const uri = result.data?.uri?.trim()
    const otpSecret = result.data?.secret?.trim()

    if (result.success && uri) {
      otpUri.value = uri
      secret.value = otpSecret || ''
      qrCode.value = uri
      // 生成二维码图片
      qrCodeImage.value = await QRCode.toDataURL(uri, {
        width: 200,
        margin: 1,
      })
    } else {
      setOtpGenerateError(result.message || 'empty otp uri')
    }
  } catch (error) {
    console.error(error)
    setOtpGenerateError(error instanceof Error ? error.message : String(error))
  } finally {
    otpLoading.value = false
  }
}

// 启用Otp
async function judgeOtpPassword() {
  if (!otpPassword.value) {
    $toast.error(t('profile.otpCodeRequired'))
    return
  }
  try {
    const result = (await api.post('mfa/otp/verify', {
      uri: otpUri.value,
      otpPassword: otpPassword.value,
    })) as ApiResponse

    if (result.success) {
      $toast.success(t('profile.otpEnableSuccess'))
      show.value = false
      emit('update:isOtp', true)
    } else {
      $toast.error(t('profile.otpEnableFailed', { message: result.message }))
    }
  } catch (error) {
    console.error(error)
    $toast.error(t('profile.otpEnableFailed', { message: error instanceof Error ? error.message : String(error) }))
  }
}

// 关闭当前用户的双重验证
function disableOtp() {
  // 如果已绑定PassKey，不允许关闭OTP
  if (props.passkeyList && props.passkeyList.length > 0 && !allowPasskeyWithoutOtp.value) {
    $toast.error(t('profile.disableOtpWithPasskeyError'))
    return
  }

  emit('verifyPassword', {
    title: t('profile.disableTwoFactor'),
    text: t('profile.confirmToDisableOtp'),
    callback: async (password: string) => {
      try {
        const result = (await api.post('mfa/otp/disable', {
          password,
        })) as ApiResponse
        if (result.success) {
          emit('update:isOtp', false)
          $toast.success(t('profile.otpDisableSuccess'))
          show.value = false
        } else {
          $toast.error(t('profile.otpDisableFailed', { message: result.message }))
        }
      } catch (error) {
        console.error(error)
        $toast.error(t('profile.otpDisableFailed', { message: error instanceof Error ? error.message : String(error) }))
      }
    },
  })
}

// 监听弹窗打开，自动获取 URI
watch(
  () => props.modelValue,
  val => {
    if (val) {
      getOtpUri()
      otpPassword.value = ''
    } else {
      // 弹窗关闭时，清空数据
      resetOtpSetupState()
      otpLoading.value = false
      otpPassword.value = ''
    }
  },
  { immediate: true },
)
</script>

<template>
  <VDialog v-model="show" max-width="45rem" scrollable :fullscreen="!display.mdAndUp.value">
    <VCard>
      <VCardItem>
        <VCardTitle>
          <VIcon icon="mdi-cellphone-key" class="me-2" />
          {{ props.isOtp && !qrCode ? t('profile.authenticatorManagement') : t('profile.setupAuthenticator') }}
        </VCardTitle>
        <VDialogCloseBtn @click="show = false" />
      </VCardItem>
      <VDivider />
      <VCardText>
        <p class="mb-6">
          {{ t('profile.authenticatorAppDescription') }}
        </p>
        <!-- 如果已启用OTP，显示清除界面 -->
        <template v-if="props.isOtp && !qrCode">
          <VAlert type="success" variant="tonal" class="mb-4">
            {{ t('profile.authenticatorEnabled') }}
          </VAlert>
          <p class="mb-6">
            {{ t('profile.clearAuthenticatorTip') }}
          </p>
          <div class="d-flex justify-end flex-wrap gap-4">
            <VBtn variant="outlined" color="secondary" @click="show = false">
              {{ t('common.cancel') }}
            </VBtn>
            <VBtn color="error" @click="disableOtp">
              <template #prepend>
                <VIcon icon="mdi-delete" />
              </template>
              {{ t('profile.clearAuthenticator') }}
            </VBtn>
          </div>
        </template>

        <!-- 设置新的OTP -->
        <template v-else>
          <div
            class="my-6 rounded text-center p-3 border d-flex align-center justify-center"
            style="width: 226px; height: 226px; margin: 0 auto"
          >
            <img
              v-if="qrCodeImage"
              class="mx-auto d-block otp-qrcode-image"
              :src="qrCodeImage"
              :alt="t('profile.setupAuthenticator')"
              width="200"
              height="200"
            />
            <VProgressCircular v-else-if="otpLoading" indeterminate color="primary" />
            <div v-else class="w-100">
              <VAlert type="error" variant="tonal" density="compact" class="mb-3">
                {{ otpGenerateError || t('profile.otpGenerateFailed', { message: t('common.error') }) }}
              </VAlert>
              <VBtn size="small" variant="tonal" prepend-icon="mdi-refresh" @click="getOtpUri">
                {{ t('common.retry') }}
              </VBtn>
            </div>
          </div>
          <VAlert v-if="secret" :title="secret" variant="tonal" type="warning" class="my-4" :text="t('profile.secretKeyTip')">
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
              <VBtn variant="outlined" color="secondary" @click="show = false">
                {{ t('common.cancel') }}
              </VBtn>
              <VBtn type="submit" :disabled="!otpUri || otpLoading">
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
</template>

<style scoped>
.otp-qrcode-image {
  inline-size: 200px;
  block-size: 200px;
}
</style>
