<script lang="ts" setup>
import { useToast } from 'vue-toastification'
import QRCode from 'qrcode'
import { useDisplay } from 'vuetify'
import { useI18n } from 'vue-i18n'
import api from '@/api'
import type { ApiResponse, PassKey } from '@/api/types'

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

// 二维码图片 base64
const qrCodeImage = ref('')

// 二维码信息
const qrCode = ref('')

// 为当前用户获取Otp Uri
async function getOtpUri() {
  // 如果已经启用OTP，只打开对话框，不生成新的二维码
  if (props.isOtp) {
    qrCode.value = '' // 清空二维码，这样对话框会显示清除界面
    qrCodeImage.value = ''
    return
  }

  // 未启用OTP，生成新的二维码
  try {
    const result = (await api.post('mfa/otp/generate')) as ApiResponse<{
      uri: string
      secret: string
    }>
    if (result.success) {
      otpUri.value = result.data.uri
      secret.value = result.data.secret
      qrCode.value = result.data.uri
      // 生成二维码图片
      qrCodeImage.value = await QRCode.toDataURL(result.data.uri, {
        width: 200,
        margin: 1,
      })
    } else {
      $toast.error(t('profile.otpGenerateFailed', { message: result.message }))
    }
  } catch (error) {
    console.error(error)
    $toast.error(t('profile.otpGenerateFailed', { message: error instanceof Error ? error.message : String(error) }))
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
  if (props.passkeyList && props.passkeyList.length > 0) {
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
      qrCodeImage.value = ''
      qrCode.value = ''
      otpUri.value = ''
      secret.value = ''
      otpPassword.value = ''
    }
  },
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
          <div class="my-6 rounded text-center p-3 border" style="width: fit-content; margin: 0 auto">
            <VImg class="mx-auto" :src="qrCodeImage" width="200" height="200">
              <template #placeholder>
                <div class="w-full h-full">
                  <VSkeletonLoader class="object-cover aspect-w-1 aspect-h-1" />
                </div>
              </template>
            </VImg>
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
              <VBtn variant="outlined" color="secondary" @click="show = false">
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
</template>
