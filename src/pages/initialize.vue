<script setup lang="ts">
import { useTheme } from 'vuetify'
import { useToast } from 'vue-toastification'
import api, { getApiBusinessErrorMessage } from '@/api'
import { copyToClipboard } from '@/@core/utils/navigator'
import { SUPPORTED_LOCALES, SupportedLocale } from '@/types/i18n'
import { getCurrentLocale, setI18nLanguage } from '@/plugins/i18n'
import { getInitializationState, markInitialized } from '@/utils/initialization'
import ThemeLogoMark from '@/components/misc/ThemeLogoMark.vue'
import router from '@/router'

interface InitializationPayload {
  username: string
  password: string
  confirm_password: string
  api_key: string
}

const { t } = useI18n()
const theme = useTheme()
const $toast = useToast()

const currentLocale = ref(getCurrentLocale())
const locales = Object.values(SUPPORTED_LOCALES)
const langMenu = ref(false)
const isPasswordVisible = ref(false)
const isConfirmPasswordVisible = ref(false)
const loading = ref(false)
const checking = ref(true)
const errorMessage = ref('')
const apiKeyCopied = ref(false)
const formRef = ref<HTMLFormElement | null>(null)

const form = ref<InitializationPayload>({
  username: '',
  password: '',
  confirm_password: '',
  api_key: '',
})

const currentTheme = computed(() => theme.global.name.value)
const themeClass = computed(() => 'initialize-page--' + currentTheme.value)

/** 使用浏览器密码学随机源生成一次性 API Key，避免把凭据交给第三方服务。 */
function generateApiKey(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
}

/** 切换界面语言并保留初始化表单内容。 */
async function switchLanguage(locale: SupportedLocale) {
  await setI18nLanguage(locale)
  currentLocale.value = locale
  langMenu.value = false
}

/** 重新生成 API Key，仅更新本地表单，点击保存后才写入后端。 */
function regenerateApiKey() {
  form.value.api_key = generateApiKey()
  apiKeyCopied.value = false
}

/** 将新生成的 API Key 复制到剪贴板，方便后续配置外部客户端。 */
async function copyApiKey() {
  if (!form.value.api_key) return
  apiKeyCopied.value = await copyToClipboard(form.value.api_key)
  if (apiKeyCopied.value) $toast.success(t('initialization.apiKeyCopied'))
}

/** 统一处理后端错误，保留服务端已本地化的业务消息。 */
function getErrorMessage(error: unknown): string {
  return getApiBusinessErrorMessage(error) || t('initialization.saveFailed')
}

/** 进入表单前再次确认实例仍未初始化；服务不可达时交给独立状态页持续检测。 */
async function checkInitializationStatus() {
  try {
    const initialized = await getInitializationState(true)
    if (initialized) {
      await router.replace('/login')
      return
    }
    checking.value = false
  } catch {
    await router.replace('/service-status')
  }
}

/** 提交首次初始化；后端会再次校验“零用户”条件，防止重复认领实例。 */
async function submit() {
  if (loading.value) return
  errorMessage.value = ''
  if (!formRef.value?.reportValidity()) return

  if (form.value.password !== form.value.confirm_password) {
    errorMessage.value = t('initialization.passwordMismatch')
    return
  }

  loading.value = true
  try {
    await api.post('/login/initialization', form.value, { feedback: 'silent' })
    markInitialized()
    $toast.success(t('initialization.saved'))
    await router.replace('/login')
  } catch (error) {
    errorMessage.value = getErrorMessage(error)
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  form.value.api_key = generateApiKey()
  void checkInitializationStatus()
})
</script>

<template>
  <main class="initialize-page" :class="themeClass">
    <div class="initialize-page__ambient initialize-page__ambient--one" aria-hidden="true" />
    <div class="initialize-page__ambient initialize-page__ambient--two" aria-hidden="true" />

    <VMenu v-model="langMenu" :close-on-content-click="false">
      <template #activator="{ props }">
        <VBtn v-bind="props" class="initialize-language" variant="text" size="small">
          <span v-if="SUPPORTED_LOCALES[currentLocale].flag">{{ SUPPORTED_LOCALES[currentLocale].flag }}</span>
          <VIcon v-else icon="mdi-translate" />
          <span class="ms-2">{{ SUPPORTED_LOCALES[currentLocale].title }}</span>
        </VBtn>
      </template>
      <VCard min-width="180" class="initialize-language__menu">
        <VList>
          <VListItem
            v-for="locale in locales"
            :key="locale.name"
            :active="locale.name === currentLocale"
            @click="switchLanguage(locale.name as SupportedLocale)"
          >
            <template #prepend>
              <span v-if="locale.flag" class="me-2">{{ locale.flag }}</span>
              <VIcon v-else icon="mdi-translate" size="small" />
            </template>
            <VListItemTitle>{{ locale.title }}</VListItemTitle>
          </VListItem>
        </VList>
      </VCard>
    </VMenu>

    <section class="initialize-shell" aria-labelledby="initialize-title">
      <VCard class="initialize-card" elevation="0">
        <div class="initialize-card__topline" aria-hidden="true" />
        <div class="initialize-card__header">
          <div class="initialize-brand-mark">
            <ThemeLogoMark class="initialize-brand-logo" decorative />
          </div>
          <div>
            <div class="initialize-brand">MoviePilot</div>
            <div class="initialize-kicker">{{ t('initialization.kicker') }}</div>
          </div>
        </div>

        <VCardItem class="px-0 pt-7 pb-1">
          <VCardTitle id="initialize-title" class="initialize-title">{{ t('initialization.title') }}</VCardTitle>
          <VCardSubtitle class="initialize-subtitle">{{ t('initialization.subtitle') }}</VCardSubtitle>
        </VCardItem>

        <VCardText class="px-0 pt-6">
          <VAlert
            v-if="errorMessage"
            type="error"
            variant="tonal"
            class="mb-5"
            closable
            @click:close="errorMessage = ''"
          >
            {{ errorMessage }}
          </VAlert>

          <VAlert v-if="checking" type="info" variant="tonal" class="mb-5">
            {{ t('initialization.checking') }}
          </VAlert>

          <form ref="formRef" class="initialize-form" novalidate @submit.prevent="submit">
            <div class="initialize-section-label">
              <span class="initialize-section-label__number">01</span>
              <span>{{ t('initialization.accountSection') }}</span>
            </div>

            <VTextField
              v-model="form.username"
              name="username"
              autocomplete="username"
              :label="t('initialization.username')"
              :placeholder="t('initialization.usernamePlaceholder')"
              prepend-inner-icon="mdi-account-outline"
              variant="outlined"
              density="comfortable"
              :disabled="checking || loading"
              required
              maxlength="50"
            />

            <VTextField
              v-model="form.password"
              name="password"
              autocomplete="new-password"
              :label="t('initialization.password')"
              :placeholder="t('initialization.passwordPlaceholder')"
              prepend-inner-icon="mdi-lock-outline"
              :append-inner-icon="isPasswordVisible ? 'mdi-eye-off-outline' : 'mdi-eye-outline'"
              :type="isPasswordVisible ? 'text' : 'password'"
              variant="outlined"
              density="comfortable"
              :disabled="checking || loading"
              :hint="t('initialization.passwordHint')"
              persistent-hint
              required
              minlength="6"
              maxlength="50"
              @click:append-inner="isPasswordVisible = !isPasswordVisible"
            />

            <VTextField
              v-model="form.confirm_password"
              name="confirm_password"
              autocomplete="new-password"
              :label="t('initialization.confirmPassword')"
              :placeholder="t('initialization.confirmPasswordPlaceholder')"
              prepend-inner-icon="mdi-lock-check-outline"
              :append-inner-icon="isConfirmPasswordVisible ? 'mdi-eye-off-outline' : 'mdi-eye-outline'"
              :type="isConfirmPasswordVisible ? 'text' : 'password'"
              variant="outlined"
              density="comfortable"
              :disabled="checking || loading"
              required
              minlength="6"
              maxlength="50"
              @click:append-inner="isConfirmPasswordVisible = !isConfirmPasswordVisible"
            />

            <div class="initialize-section-label initialize-section-label--key">
              <span class="initialize-section-label__number">02</span>
              <span>{{ t('initialization.apiKeySection') }}</span>
            </div>

            <div class="initialize-key-panel">
              <div class="initialize-key-panel__header">
                <div>
                  <div class="initialize-key-panel__title">{{ t('initialization.apiKey') }}</div>
                  <div class="initialize-key-panel__hint">{{ t('initialization.apiKeyHint') }}</div>
                </div>
                <VChip color="success" size="small" variant="tonal" prepend-icon="mdi-shield-check-outline">
                  {{ t('initialization.generated') }}
                </VChip>
              </div>
              <VTextField
                v-model="form.api_key"
                name="api_key"
                readonly
                variant="solo"
                flat
                density="compact"
                hide-details
                class="initialize-key-input"
                aria-label="API Key"
                required
                minlength="16"
              >
                <template #append-inner>
                  <VBtn
                    icon="mdi-content-copy"
                    variant="text"
                    size="small"
                    :aria-label="t('initialization.copyApiKey')"
                    @click="copyApiKey"
                  />
                </template>
              </VTextField>
              <div class="initialize-key-panel__actions">
                <span
                  ><VIcon icon="mdi-information-outline" size="15" class="me-1" />{{
                    t('initialization.apiKeyWarning')
                  }}</span
                >
                <VBtn variant="text" size="small" prepend-icon="mdi-refresh" @click="regenerateApiKey">
                  {{ t('initialization.regenerate') }}
                </VBtn>
              </div>
            </div>

            <VBtn
              block
              size="large"
              type="submit"
              class="initialize-submit mt-7"
              :loading="loading"
              :disabled="checking"
              append-icon="mdi-arrow-right"
            >
              {{ t('initialization.saveAndContinue') }}
            </VBtn>
          </form>
        </VCardText>

        <div class="initialize-card__footer">
          <VIcon icon="mdi-lock-outline" size="14" class="me-1" />
          <span>{{ t('initialization.privateHint') }}</span>
        </div>
      </VCard>
      <p class="initialize-copyright">MoviePilot · {{ new Date().getFullYear() }}</p>
    </section>
  </main>
</template>

<style lang="scss" scoped>
.initialize-page {
  --initialize-primary: rgb(var(--v-theme-primary));
  --initialize-surface: rgba(var(--v-theme-surface), 0.94);
  --initialize-border: rgba(var(--v-theme-on-surface), 0.1);
  position: relative;
  min-block-size: 100dvh;
  overflow: hidden;
  background: rgb(var(--v-theme-background));
  color: rgb(var(--v-theme-on-background));
  isolation: isolate;
}

.initialize-page__ambient {
  position: absolute;
  z-index: -1;
  border-radius: 999px;
  filter: blur(2px);
  opacity: 0.5;
  pointer-events: none;
}

.initialize-page__ambient--one {
  inset-block-start: -18rem;
  inset-inline-start: -14rem;
  inline-size: 38rem;
  block-size: 38rem;
  background: radial-gradient(circle, rgba(var(--v-theme-primary), 0.2), transparent 68%);
}

.initialize-page__ambient--two {
  inset-block-end: -24rem;
  inset-inline-end: -12rem;
  inline-size: 42rem;
  block-size: 42rem;
  background: radial-gradient(circle, rgba(var(--v-theme-info), 0.16), transparent 66%);
}

.initialize-language {
  position: absolute;
  z-index: 2;
  inset-block-start: 1.25rem;
  inset-inline-end: 1.25rem;
  color: rgba(var(--v-theme-on-background), 0.75);
  text-transform: none;
}

.initialize-language__menu {
  border: 1px solid var(--initialize-border);
}

.initialize-shell {
  display: grid;
  place-items: center;
  min-block-size: 100dvh;
  padding: 4rem 1.25rem 1.5rem;
}

.initialize-card {
  position: relative;
  inline-size: min(100%, 34rem);
  padding: 2.5rem 2.75rem 1.4rem;
  border: 1px solid var(--initialize-border);
  border-radius: 1.5rem;
  background: var(--initialize-surface);
  box-shadow: 0 1.5rem 4rem rgba(15, 23, 42, 0.12);
  backdrop-filter: blur(1.25rem);
}

.initialize-card__topline {
  position: absolute;
  inset-block-start: 0;
  inset-inline: 12%;
  block-size: 3px;
  border-radius: 0 0 99px 99px;
  background: linear-gradient(90deg, transparent, var(--initialize-primary), transparent);
}

.initialize-card__header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.initialize-brand-mark {
  display: grid;
  flex: 0 0 auto;
  place-items: center;
  inline-size: 2.5rem;
  block-size: 2.5rem;
  border-radius: 0.8rem;
  border: 1px solid rgba(var(--v-theme-primary), 0.2);
  background: color-mix(in srgb, rgb(var(--v-theme-surface)) 70%, rgb(var(--v-theme-primary)) 30%);
  box-shadow: 0 0.5rem 1rem rgba(var(--v-theme-primary), 0.16);
}

.initialize-brand-logo {
  block-size: 2.1rem;
  inline-size: 2.1rem;
}

.initialize-brand {
  font-size: 1rem;
  font-weight: 750;
  letter-spacing: -0.02em;
}

.initialize-kicker {
  margin-block-start: 0.1rem;
  color: rgba(var(--v-theme-on-surface), 0.58);
  font-size: 0.72rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.initialize-title {
  padding-inline: 0;
  color: rgb(var(--v-theme-on-surface));
  font-size: clamp(1.7rem, 5vw, 2.1rem);
  font-weight: 760;
  letter-spacing: -0.04em;
}

.initialize-subtitle {
  padding-inline: 0;
  color: rgba(var(--v-theme-on-surface), 0.62);
  line-height: 1.55;
  white-space: normal;
}

.initialize-section-label {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  margin-block-end: 0.9rem;
  color: rgba(var(--v-theme-on-surface), 0.72);
  font-size: 0.76rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.initialize-section-label--key {
  margin-block-start: 1.65rem;
}

.initialize-section-label__number {
  color: var(--initialize-primary);
  font-variant-numeric: tabular-nums;
}

.initialize-form :deep(.v-field) {
  border-radius: 0.8rem;
}

.initialize-form :deep(.v-input + .v-input) {
  margin-block-start: 0.75rem;
}

.initialize-key-panel {
  padding: 1rem;
  border: 1px solid rgba(var(--v-theme-primary), 0.18);
  border-radius: 1rem;
  background: rgba(var(--v-theme-primary), 0.055);
}

.initialize-key-panel__header,
.initialize-key-panel__actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.initialize-key-panel__title {
  color: rgb(var(--v-theme-on-surface));
  font-size: 0.92rem;
  font-weight: 700;
}

.initialize-key-panel__hint,
.initialize-key-panel__actions {
  color: rgba(var(--v-theme-on-surface), 0.57);
  font-size: 0.75rem;
}

.initialize-key-input {
  margin-block: 0.9rem;
}

.initialize-key-input :deep(.v-field) {
  border: 1px solid rgba(var(--v-theme-on-surface), 0.1);
  border-radius: 0.65rem;
  background: rgba(var(--v-theme-surface), 0.7);
}

.initialize-key-input :deep(input) {
  color: rgba(var(--v-theme-on-surface), 0.8);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.7rem;
  letter-spacing: 0.04em;
}

.initialize-key-panel__actions > span {
  display: flex;
  align-items: center;
  min-inline-size: 0;
}

.initialize-key-panel__actions .v-btn {
  flex: 0 0 auto;
  padding-inline: 0.35rem;
  color: var(--initialize-primary);
  text-transform: none;
}

.initialize-submit {
  border-radius: 0.8rem;
  box-shadow: 0 0.65rem 1.4rem rgba(var(--v-theme-primary), 0.22);
  text-transform: none;
  letter-spacing: 0;
}

.initialize-card__footer {
  display: flex;
  align-items: center;
  justify-content: center;
  margin-block-start: 1.5rem;
  color: rgba(var(--v-theme-on-surface), 0.48);
  font-size: 0.72rem;
  text-align: center;
}

.initialize-copyright {
  margin-block: 1rem 0;
  color: rgba(var(--v-theme-on-background), 0.42);
  font-size: 0.72rem;
}

@media (max-width: 600px) {
  .initialize-shell {
    padding: 4.5rem 0.8rem 1rem;
  }

  .initialize-card {
    padding: 2rem 1.2rem 1.25rem;
    border-radius: 1.15rem;
  }

  .initialize-key-panel__header,
  .initialize-key-panel__actions {
    align-items: flex-start;
    flex-direction: column;
  }

  .initialize-key-panel__actions {
    gap: 0.35rem;
  }
}
</style>
