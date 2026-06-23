<script setup lang="ts">
import { usePWAInstall } from '@/composables/usePWAInstall'
import { useAuthStore } from '@/stores'
import { useI18n } from 'vue-i18n'
import { useToast } from 'vue-toastification'

const { t, locale, messages } = useI18n()
const { isInstalled, showInstallPrompt, getInstallInstructions } = usePWAInstall()

const showBanner = ref(false)
const showInstructions = ref(false)
const dismissed = ref(false)

// 检查是否登录
const authStore = useAuthStore()
const isLogin = computed(() => authStore.token)

// 检查当前是不是https环境
const isHttps = computed(() => {
  return window.location.protocol === 'https:'
})

// 检查是否应该显示横幅
const shouldShowBanner = computed(() => {
  return !isInstalled.value && !dismissed.value && !showInstructions.value && isLogin.value && isHttps.value
})

// 显示延迟（避免立即显示）
onMounted(() => {
  setTimeout(() => {
    // 检查本地存储，看用户是否已经关闭过提示
    const dismissedTime = localStorage.getItem('pwa-install-dismissed')
    if (dismissedTime) {
      const dismissedDate = new Date(dismissedTime)
      const now = new Date()
      const daysDiff = (now.getTime() - dismissedDate.getTime()) / (1000 * 60 * 60 * 24)

      // 如果距离上次关闭不到30天，不显示
      if (daysDiff < 30) {
        dismissed.value = true
        return
      }
    }

    showBanner.value = true
  }, 5000) // 5秒后显示
})

// 处理安装
const handleInstall = async () => {
  const installed = await showInstallPrompt()
  if (installed) {
    showBanner.value = false
    // 显示成功消息
    useToast().success(t('pwa.installSuccess'))
  } else {
    // 如果用户拒绝，显示手动安装说明
    showInstructions.value = true
  }
}

// 关闭横幅
const dismissBanner = () => {
  showBanner.value = false
  dismissed.value = true
  // 记录关闭时间
  localStorage.setItem('pwa-install-dismissed', new Date().toISOString())
}

// 获取平台特定的安装说明
const instructions = computed(() => {
  const rawInstructions = getInstallInstructions()
  const platformKey = rawInstructions.platformKey

  // 获取平台显示名称
  const platformName = t(`pwa.platforms.${platformKey}`)

  // 直接使用t函数获取安装步骤，避免编译对象的问题
  const steps = []
  const maxSteps = 10 // 最大步骤数，防止无限循环

  for (let i = 0; i < maxSteps; i++) {
    try {
      const stepKey = `pwa.installSteps.${platformKey}.${i}`
      const stepText = t(stepKey)

      // 如果返回的是键名本身，说明没有找到对应的翻译
      if (stepText === stepKey) {
        break
      }

      steps.push(stepText)
    } catch (error) {
      // 如果出现错误，说明没有更多步骤
      break
    }
  }

  return {
    platform: platformName,
    steps,
  }
})
</script>

<template>
  <!-- 安装横幅 -->
  <Teleport to="body">
    <Transition
      enter-active-class="transition-all duration-300"
      enter-from-class="translate-y-full opacity-0"
      enter-to-class="translate-y-0 opacity-100"
      leave-active-class="transition-all duration-300"
      leave-from-class="translate-y-0 opacity-100"
      leave-to-class="translate-y-full opacity-0"
    >
      <VCard v-if="shouldShowBanner && showBanner" class="pwa-install-banner">
        <div class="banner-content">
          <VIcon icon="mdi-cellphone-link" size="24" class="me-3" />
          <div class="flex-grow-1">
            <div class="font-weight-medium">{{ t('pwa.installApp') }}</div>
            <div class="text-sm opacity-70">{{ t('pwa.installDescription') }}</div>
          </div>
          <VBtn color="primary" size="small" variant="flat" @click="handleInstall">
            {{ t('pwa.install') }}
          </VBtn>
          <VBtn icon size="small" variant="text" @click="dismissBanner">
            <VIcon icon="mdi-close" />
          </VBtn>
        </div>
      </VCard>
    </Transition>
  </Teleport>

  <!-- 手动安装说明对话框 -->
  <VDialog v-model="showInstructions" max-width="500">
    <VCard>
      <VCardItem>
        <VCardTitle class="d-flex align-center">
          <VIcon icon="mdi-information-outline" class="me-2" />
          {{ t('pwa.installGuide') }}
        </VCardTitle>
      </VCardItem>

      <VCardText>
        <div class="mb-4">
          <div class="text-subtitle-1 mb-2">
            {{ t('pwa.installInstructions', { platform: instructions.platform }) }}
          </div>
          <VList density="compact">
            <VListItem
              v-for="(step, index) in instructions.steps"
              :key="index"
              :prepend-icon="`mdi-numeric-${index + 1}-circle`"
            >
              <VListItemTitle>{{ step }}</VListItemTitle>
            </VListItem>
          </VList>
        </div>

        <VAlert type="info" variant="tonal" density="compact">
          {{ t('pwa.installNote') }}
        </VAlert>
      </VCardText>

      <VCardActions class="app-dialog-actions">
        <VSpacer />
        <VBtn color="primary" variant="flat" class="px-5" @click="showInstructions = false">
          {{ t('pwa.gotIt') }}
        </VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
</template>

<style scoped>
.pwa-install-banner {
  position: fixed;
  z-index: 1000;
  background: rgb(var(--v-theme-surface));
  inset-block-end: 5rem;
  inset-inline: 20px;
}

.banner-content {
  display: flex;
  align-items: center;
  padding: 16px;
  gap: 8px;
}

@media (width >= 600px) {
  .pwa-install-banner {
    inset-inline: auto 20px;
    max-inline-size: 400px;
  }
}
</style>
