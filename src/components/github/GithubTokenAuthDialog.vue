<script setup lang="ts">
import { copyToClipboard } from '@/@core/utils/navigator'
import type { GithubDeviceAuthSession, GithubTokenStatus } from '@/composables/useGithubTokenAuth'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const props = defineProps<{
  modelValue: boolean
  session: GithubDeviceAuthSession | null
  status?: GithubTokenStatus | null
  loading?: boolean
  polling?: boolean
  error?: string
  popupBlocked?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  open: []
  poll: []
  cancel: []
}>()

const copied = ref(false)

const dialogModel = computed({
  get: () => props.modelValue,
  set: value => emit('update:modelValue', value),
})

/** 复制 GitHub 用户码，减少初始化时的手工输入成本。 */
async function copyCode() {
  if (!props.session?.user_code) return
  copied.value = await copyToClipboard(props.session.user_code)
}

/** 关闭设备授权弹窗并停止父级轮询。 */
function closeDialog() {
  emit('cancel')
  emit('update:modelValue', false)
}
</script>

<template>
  <VDialog v-model="dialogModel" max-width="520" @update:model-value="value => !value && emit('cancel')">
    <VCard>
      <VCardItem>
        <VCardTitle class="d-flex align-center">
          <VIcon icon="mdi-github" class="me-2" />
          {{ t('githubToken.authTitle') }}
        </VCardTitle>
        <VCardSubtitle>{{ t('githubToken.authSubtitle') }}</VCardSubtitle>
      </VCardItem>

      <VCardText>
        <VAlert v-if="props.error" type="error" variant="tonal" class="mb-4">
          {{ props.error }}
        </VAlert>

        <div v-if="props.session" class="github-token-auth-dialog__content">
          <div class="text-body-2 mb-4">{{ t('githubToken.authInstructions') }}</div>
          <div class="github-token-auth-dialog__code rounded pa-4 mb-4">
            <div class="text-caption opacity-70 mb-1">{{ t('githubToken.userCode') }}</div>
            <div class="d-flex align-center justify-space-between ga-2">
              <code>{{ props.session.user_code }}</code>
              <VBtn
                icon="mdi-content-copy"
                variant="text"
                size="small"
                :aria-label="t('githubToken.copyUserCode')"
                @click="copyCode"
              />
            </div>
            <div v-if="copied" class="text-caption text-success mt-1">{{ t('githubToken.copied') }}</div>
          </div>

          <VBtn block color="primary" variant="flat" prepend-icon="mdi-open-in-new" @click="emit('open')">
            {{ t('githubToken.openGithub') }}
          </VBtn>
          <VAlert v-if="props.popupBlocked" type="info" variant="tonal" density="compact" class="mt-3">
            {{ t('githubToken.popupBlocked') }}
            <a :href="props.session.verification_uri" target="_blank" rel="noopener noreferrer">
              {{ t('githubToken.openLink') }}
            </a>
          </VAlert>
          <div class="d-flex align-center justify-center text-body-2 opacity-70 mt-4">
            <VProgressCircular v-if="props.polling" indeterminate size="16" width="2" class="me-2" />
            <span>{{ props.polling ? t('githubToken.waiting') : t('githubToken.clickPoll') }}</span>
          </div>
          <VBtn
            block
            variant="text"
            class="mt-2"
            :loading="props.polling"
            :disabled="props.polling"
            @click="emit('poll')"
          >
            {{ t('githubToken.checkAuthorization') }}
          </VBtn>
        </div>
        <div v-else-if="props.status?.configured && !props.loading" class="d-flex flex-column align-center py-6">
          <VIcon icon="mdi-check-circle-outline" color="success" size="48" class="mb-3" />
          <div class="text-body-1 text-success">{{ t('githubToken.authorized') }}</div>
        </div>
        <div v-else class="d-flex flex-column align-center py-6">
          <VProgressCircular v-if="props.loading" indeterminate color="primary" />
          <div v-else class="text-body-2">{{ t('githubToken.authPreparing') }}</div>
        </div>
      </VCardText>

      <VCardActions class="app-dialog-actions">
        <VSpacer />
        <VBtn variant="text" @click="closeDialog">{{ t('common.cancel') }}</VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
</template>

<style scoped>
.github-token-auth-dialog__code {
  background: rgba(var(--v-theme-on-surface), 0.06);
  border: 1px solid rgba(var(--v-theme-on-surface), 0.1);
}

.github-token-auth-dialog__code code {
  color: rgb(var(--v-theme-primary));
  font-size: 1.25rem;
  font-weight: 700;
  letter-spacing: 0.12em;
}
</style>
