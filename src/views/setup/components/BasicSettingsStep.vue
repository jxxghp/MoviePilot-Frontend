<script lang="ts" setup>
import { useI18n } from 'vue-i18n'
import { useSetupWizard } from '@/composables/useSetupWizard'

const { t } = useI18n()
const { wizardData, createRandomString, copyValue } = useSetupWizard()

// 密码可见性控制
const isPasswordVisible = ref(false)
const isConfirmPasswordVisible = ref(false)
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
            :hint="t('user.usernameHint')"
            persistent-hint
            prepend-inner-icon="mdi-account"
            :rules="[(v: string) => !!v || t('user.usernameRequired')]"
          />
        </VCol>
        <VCol cols="12" md="6">
          <VTextField
            v-model="wizardData.basic.password"
            :type="isPasswordVisible ? 'text' : 'password'"
            :label="t('user.password')"
            :hint="t('user.passwordHint')"
            persistent-hint
            prepend-inner-icon="mdi-lock"
            :append-inner-icon="isPasswordVisible ? 'mdi-eye-off-outline' : 'mdi-eye-outline'"
            @click:append-inner="isPasswordVisible = !isPasswordVisible"
            :rules="[(v: string) => !!v || t('user.passwordRequired'), (v: string) => v.length >= 6 || t('user.passwordMinLength')]"
          />
        </VCol>
        <VCol cols="12" md="6">
          <VTextField
            v-model="wizardData.basic.confirmPassword"
            :type="isConfirmPasswordVisible ? 'text' : 'password'"
            :label="t('user.confirmPassword')"
            :hint="t('user.confirmPasswordHint')"
            persistent-hint
            prepend-inner-icon="mdi-lock-check"
            :append-inner-icon="isConfirmPasswordVisible ? 'mdi-eye-off-outline' : 'mdi-eye-outline'"
            @click:append-inner="isConfirmPasswordVisible = !isConfirmPasswordVisible"
            :rules="[
              (v: string) => !!v || t('user.confirmPasswordRequired'),
              (v: string) => v === wizardData.basic.password || t('user.passwordMismatch')
            ]"
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
            readonly
          />
        </VCol>
      </VRow>
    </VCardText>
  </VCard>
</template>