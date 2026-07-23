<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { MfaMethod } from '@/types/auth'

interface Props {
  /** 当前验证步骤的错误信息。 */
  errorMessage: string
  /** 密码验证通过后服务端声明的可用方式。 */
  methods: MfaMethod[]
  /** OTP 提交状态。 */
  otpLoading: boolean
  /** 当前输入的 OTP。 */
  otpPassword: string
}

const props = defineProps<Props>()

const emit = defineEmits<{
  (event: 'back'): void
  (event: 'otp'): void
  (event: 'update:otpPassword', value: string): void
}>()

const { t } = useI18n()
const hasOtp = computed(() => props.methods.includes('otp'))
</script>

<template>
  <section class="mfa-step" :class="{ 'mfa-step--unavailable': !hasOtp }" aria-labelledby="mfa-step-title">
    <header class="mfa-step__header">
      <VBtn
        data-testid="mfa-back"
        icon="mdi-arrow-left"
        size="small"
        variant="text"
        :aria-label="t('login.mfa.back')"
        :disabled="props.otpLoading"
        @click="emit('back')"
      />
      <div>
        <h2 id="mfa-step-title" class="mfa-step__title">{{ t('login.secondaryVerification') }}</h2>
      </div>
    </header>

    <form v-if="hasOtp" data-testid="mfa-otp-form" class="mfa-step__method" @submit.prevent="emit('otp')">
      <p class="mfa-step__description">{{ t('login.mfa.otpPrompt') }}</p>
      <div class="mfa-step__field">
        <VIcon icon="mdi-shield-key" class="mfa-step__field-icon" aria-hidden="true" />
        <input
          :value="props.otpPassword"
          class="mfa-step__input"
          type="text"
          name="otp"
          autocomplete="one-time-code"
          inputmode="numeric"
          maxlength="6"
          :placeholder="t('login.otpCode')"
          :aria-label="t('login.otpCode')"
          autofocus
          :disabled="props.otpLoading"
          @input="emit('update:otpPassword', ($event.target as HTMLInputElement).value)"
        />
      </div>
      <VBtn
        block
        type="submit"
        color="primary"
        class="mfa-step__submit"
        prepend-icon="mdi-login"
        :loading="props.otpLoading"
        :disabled="!props.otpPassword"
      >
        {{ t('login.loginWithOtp') }}
      </VBtn>
    </form>

    <VAlert v-if="props.errorMessage" class="mfa-step__alert" type="error" variant="tonal" role="alert">
      {{ props.errorMessage }}
    </VAlert>
  </section>
</template>

<style scoped>
.mfa-step {
  display: flex;
  flex-direction: column;
}

.mfa-step__header {
  display: grid;
  align-items: center;
  grid-template-columns: 40px 1fr 40px;
  margin-block-end: 20px;
}

.mfa-step__title {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 600;
  letter-spacing: 0;
  line-height: 1.3;
  text-align: center;
}

.mfa-step__method {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.mfa-step__field {
  position: relative;
  display: flex;
  overflow: hidden;
  align-items: center;
  border: 1px solid rgba(var(--v-border-color), 0.38);
  min-block-size: 52px;
  border-radius: 12px;
  background: rgba(var(--v-theme-surface), 0.13);
  transition:
    border-color 150ms ease,
    box-shadow 150ms ease,
    background 220ms ease;
}

.mfa-step__field:focus-within {
  border-color: rgb(var(--v-theme-primary));
  box-shadow: inset 0 0 0 1px rgb(var(--v-theme-primary));
}

.mfa-step__field-icon {
  position: absolute;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  inset-inline-start: 16px;
  pointer-events: none;
}

.mfa-step__input {
  border: 0;
  appearance: none;
  background: transparent;
  block-size: 50px;
  color: rgb(var(--v-theme-on-surface));
  font: inherit;
  inline-size: 100%;
  outline: none;
  padding-block: 0;
  padding-inline: 48px 16px;
}

.mfa-step__input::placeholder {
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  opacity: 1;
}

.mfa-step__input:disabled {
  cursor: not-allowed;
  opacity: var(--v-disabled-opacity);
}

.mfa-step__submit {
  flex: 0 0 48px !important;
  block-size: 48px !important;
  max-block-size: 48px !important;
  min-block-size: 48px !important;
  border-radius: 12px;
  font-weight: 600;
}

.mfa-step__description {
  margin: 0;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  line-height: 1.6;
  text-align: center;
}

.mfa-step__alert {
  margin-block-start: 18px;
  border-radius: 8px;
}

.mfa-step--unavailable {
  min-block-size: 0;
}

.mfa-step--unavailable .mfa-step__header {
  margin-block-end: 16px;
}

.mfa-step--unavailable .mfa-step__alert {
  margin-block-start: 0;
}
</style>
