<script setup lang="ts">
import { useAuthStore, useUserStore } from '@/stores'
import { useGithubTokenAuth } from '@/composables/useGithubTokenAuth'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const DISMISSED_KEY = 'github-token-prompt-dismissed'

const authStore = useAuthStore()
const userStore = useUserStore()
const route = useRoute()
const router = useRouter()
const { refreshStatus } = useGithubTokenAuth('settings')

const showBanner = ref(false)
const dismissed = ref(false)
const shownThisSession = ref(false)
let showTimer: number | null = null

const isAdminLogin = computed(() => Boolean(authStore.token && userStore.superUser))
const shouldShowBanner = computed(
  () =>
    showBanner.value &&
    !dismissed.value &&
    isAdminLogin.value &&
    route.path !== '/setting' &&
    route.path !== '/initialize',
)

/** 记录永久关闭选择，后续登录和刷新页面都不再自动提示。 */
function dismissBanner() {
  showBanner.value = false
  dismissed.value = true
  localStorage.setItem(DISMISSED_KEY, '1')
}

/** 打开系统设置中的 GitHub Token 区域，并关闭当前会话的横幅。 */
async function openSettings() {
  showBanner.value = false
  shownThisSession.value = true
  await router.push({ path: '/setting', query: { tab: 'system' } })
}

/** 延迟检查管理员 Token 状态，保持与 PWA 提示一致的非侵入式进入时机。 */
function scheduleStatusCheck() {
  if (showTimer !== null) window.clearTimeout(showTimer)
  if (!isAdminLogin.value || shownThisSession.value || route.path === '/setting' || route.path === '/initialize') return
  if (localStorage.getItem(DISMISSED_KEY)) {
    dismissed.value = true
    return
  }
  showTimer = window.setTimeout(async () => {
    const status = await refreshStatus()
    if (status && (!status.configured || status.valid === false)) showBanner.value = true
  }, 5000)
}

onMounted(() => {
  scheduleStatusCheck()
})

watch([() => authStore.token, () => userStore.superUser, () => route.path], () => {
  if (!isAdminLogin.value) showBanner.value = false
  else scheduleStatusCheck()
})

onBeforeUnmount(() => {
  if (showTimer !== null) window.clearTimeout(showTimer)
})
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition-all duration-300"
      enter-from-class="translate-y-full opacity-0"
      enter-to-class="translate-y-0 opacity-100"
      leave-active-class="transition-all duration-300"
      leave-from-class="translate-y-0 opacity-100"
      leave-to-class="translate-y-full opacity-0"
    >
      <VCard v-if="shouldShowBanner" class="github-token-prompt">
        <div class="github-token-prompt__content">
          <VIcon icon="mdi-github" size="24" class="me-3" />
          <div class="flex-grow-1">
            <div class="font-weight-medium">{{ t('githubToken.promptTitle') }}</div>
            <div class="text-sm opacity-70">{{ t('githubToken.promptDescription') }}</div>
          </div>
          <VBtn color="primary" size="small" variant="flat" @click="openSettings">
            {{ t('githubToken.promptAction') }}
          </VBtn>
          <VBtn icon size="small" variant="text" :aria-label="t('githubToken.dismissPrompt')" @click="dismissBanner">
            <VIcon icon="mdi-close" />
          </VBtn>
        </div>
      </VCard>
    </Transition>
  </Teleport>
</template>

<style scoped>
.github-token-prompt {
  position: fixed;
  z-index: 1000;
  background: rgb(var(--v-theme-surface));
  inset-block-end: 5rem;
  inset-inline: 20px;
}

.github-token-prompt__content {
  display: flex;
  align-items: center;
  padding: 16px;
  gap: 8px;
}

@media (width >= 600px) {
  .github-token-prompt {
    inset-inline: auto 20px;
    max-inline-size: 440px;
  }
}
</style>
