<script setup lang="ts">
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const props = withDefaults(
  defineProps<{
    errorMessage?: string
    modelValue?: boolean
    otpPassword?: string
    passkeyLoading?: boolean
  }>(),
  {
    errorMessage: '',
    modelValue: true,
    otpPassword: '',
    passkeyLoading: false,
  },
)

const emit = defineEmits<{
  (event: 'close'): void
  (event: 'otp'): void
  (event: 'passkey'): void
  (event: 'update:modelValue', value: boolean): void
  (event: 'update:otpPassword', value: string): void
}>()

const visible = computed({
  get: () => props.modelValue,
  set: value => {
    emit('update:modelValue', value)
    if (!value) emit('close')
  },
})

const otpValue = computed({
  get: () => props.otpPassword,
  set: value => emit('update:otpPassword', value),
})

// 提交 OTP 登录请求。
function submitOtp() {
  emit('otp')
}
</script>

<template>
  <VDialog v-if="visible" v-model="visible" max-width="400" persistent>
    <VCard>
      <VCardTitle class="text-h5 text-center mt-4 pb-2">{{ t('login.secondaryVerification') }}</VCardTitle>
      <VCardText class="pt-0">
        <p class="text-center mb-4">{{ t('login.mfa.selectVerificationMethod') }}</p>

        <VCard variant="tonal" class="mb-3">
          <VCardText>
            <VForm @submit.prevent="submitOtp">
              <VTextField
                v-model="otpValue"
                :label="t('login.otpCode')"
                :placeholder="t('login.otpPlaceholder')"
                type="text"
                name="otp"
                id="otp"
                autocomplete="one-time-code"
                inputmode="numeric"
                prepend-inner-icon="mdi-shield-key"
                class="mb-2"
              />
              <VBtn block type="submit" color="primary" :disabled="!otpValue">
                {{ t('login.loginWithOtp') }}
              </VBtn>
            </VForm>
          </VCardText>
        </VCard>

        <VCard variant="tonal">
          <VCardText>
            <p class="text-body-2 mb-2">{{ t('login.orUsePasskey') }}</p>
            <VBtn
              block
              variant="tonal"
              color="success"
              class="passkey-btn"
              prepend-icon="material-symbols:passkey"
              :loading="props.passkeyLoading"
              @click="emit('passkey')"
            >
              {{ t('login.verifyWithPasskey') }}
            </VBtn>
          </VCardText>
        </VCard>

        <VAlert v-if="props.errorMessage" type="error" variant="tonal" class="mt-3">
          {{ props.errorMessage }}
        </VAlert>

        <VBtn block variant="text" class="mt-4" @click="visible = false">{{ t('common.cancel') }}</VBtn>
      </VCardText>
    </VCard>
  </VDialog>
</template>
