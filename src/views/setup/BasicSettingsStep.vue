<script lang="ts" setup>
import { useI18n } from 'vue-i18n'
import { useSetupWizard } from '@/composables/useSetupWizard'

const { t } = useI18n()
const { wizardData, createRandomString, copyValue, validateCurrentStep } = useSetupWizard()

// 密码可见性控制
const isPasswordVisible = ref(false)
const isConfirmPasswordVisible = ref(false)

// 验证状态
const validation = computed(() => validateCurrentStep())
const hasErrors = computed(() => !validation.value.isValid)

// 密码相关验证
const passwordError = computed(() => {
  if (!wizardData.value.basic.password) return false
  return wizardData.value.basic.password.length < 6
})

const confirmPasswordError = computed(() => {
  if (!wizardData.value.basic.password) return false
  if (!wizardData.value.basic.confirmPassword) return true
  return wizardData.value.basic.password !== wizardData.value.basic.confirmPassword
})

const passwordErrorMessage = computed(() => {
  if (passwordError.value) return t('dialog.userAddEdit.passwordMinLength')
  return ''
})

const confirmPasswordErrorMessage = computed(() => {
  if (!wizardData.value.basic.password) return ''
  if (!wizardData.value.basic.confirmPassword) return t('dialog.userAddEdit.confirmPasswordRequired')
  if (confirmPasswordError.value) return t('dialog.userAddEdit.passwordMismatch')
  return ''
})

// API Token验证
const apiTokenError = computed(() => {
  return !wizardData.value.basic.apiToken && hasErrors.value
})

const apiTokenErrorMessage = computed(() => {
  if (apiTokenError.value) return t('setupWizard.basic.apiTokenRequired')
  return ''
})

// 用户名验证（虽然是只读的，但为了完整性）
const usernameError = computed(() => {
  return !wizardData.value.basic.username && hasErrors.value
})

const usernameErrorMessage = computed(() => {
  if (usernameError.value) return t('dialog.userAddEdit.usernameRequired')
  return ''
})
</script>

<template>
  <VCard variant="outlined">
    <VCardText>
      <div class="text-center mb-6">
        <h3 class="text-h4 mb-2">{{ t('setupWizard.basic.title') }}</h3>
        <p class="text-body-1 text-medium-emphasis">{{ t('setupWizard.basic.description') }}</p>
      </div>
      <VRow>
        <VCol cols="12" md="6">
          <VTextField
            v-model="wizardData.basic.appDomain"
            :label="t('setupWizard.basic.appDomain')"
            :hint="t('setupWizard.basic.appDomainHint')"
            placeholder="http://localhost:3000"
            persistent-hint
            prepend-inner-icon="mdi-web"
          />
        </VCol>
        <VCol cols="12" md="6">
          <VTextField
            v-model="wizardData.basic.username"
            :label="t('user.username')"
            :hint="t('setupWizard.basic.currentUserHint')"
            persistent-hint
            prepend-inner-icon="mdi-account"
            readonly
            :error="usernameError"
            :error-messages="usernameError ? [usernameErrorMessage] : []"
          />
        </VCol>
        <VCol cols="12" md="6">
          <VTextField
            v-model="wizardData.basic.password"
            :type="isPasswordVisible ? 'text' : 'password'"
            :label="t('user.password')"
            :hint="t('setupWizard.basic.passwordOptionalHint')"
            persistent-hint
            prepend-inner-icon="mdi-lock"
            :append-inner-icon="isPasswordVisible ? 'mdi-eye-off-outline' : 'mdi-eye-outline'"
            @click:append-inner="isPasswordVisible = !isPasswordVisible"
            :error="passwordError"
            :error-messages="passwordError ? [passwordErrorMessage] : []"
            clearable
          />
        </VCol>
        <VCol cols="12" md="6">
          <VTextField
            v-model="wizardData.basic.confirmPassword"
            :type="isConfirmPasswordVisible ? 'text' : 'password'"
            :label="t('user.confirmPassword')"
            :hint="t('setupWizard.basic.confirmPasswordHint')"
            persistent-hint
            prepend-inner-icon="mdi-lock-check"
            :append-inner-icon="isConfirmPasswordVisible ? 'mdi-eye-off-outline' : 'mdi-eye-outline'"
            @click:append-inner="isConfirmPasswordVisible = !isConfirmPasswordVisible"
            :disabled="!wizardData.basic.password"
            :error="confirmPasswordError"
            :error-messages="confirmPasswordError ? [confirmPasswordErrorMessage] : []"
            clearable
          />
        </VCol>
        <VCol cols="12" md="6">
          <VTextField
            v-model="wizardData.basic.ocrHost"
            :label="t('setting.system.ocrHost')"
            :hint="t('setting.system.ocrHostHint')"
            placeholder="https://movie-pilot.org"
            persistent-hint
            prepend-inner-icon="mdi-text-recognition"
          />
        </VCol>
        <VCol cols="12" md="6">
          <VTextField
            v-model="wizardData.basic.proxyHost"
            :label="t('setting.system.proxyHost')"
            :hint="t('setting.system.proxyHostHint')"
            placeholder="http://127.0.0.1:7890"
            persistent-hint
            prepend-inner-icon="mdi-server-network"
          />
        </VCol>
        <VCol cols="12" md="6">
          <VTextField
            v-model="wizardData.basic.githubToken"
            :label="t('setting.system.githubToken')"
            :placeholder="t('setting.system.githubTokenFormat')"
            :hint="t('setting.system.githubTokenHint')"
            persistent-hint
            prepend-inner-icon="mdi-github"
          />
        </VCol>
        <VCol cols="12" md="6">
          <VTextField
            v-model="wizardData.basic.apiToken"
            :label="t('setupWizard.basic.apiToken')"
            :hint="t('setupWizard.basic.apiTokenHint')"
            persistent-hint
            prepend-inner-icon="mdi-key"
            :append-inner-icon="wizardData.basic.apiToken ? 'mdi-content-copy' : 'mdi-reload'"
            @click:append-inner="
              wizardData.basic.apiToken ? copyValue(wizardData.basic.apiToken) : createRandomString()
            "
            :error="apiTokenError"
            :error-messages="apiTokenError ? [apiTokenErrorMessage] : []"
          />
        </VCol>
      </VRow>
    </VCardText>
  </VCard>
</template>
