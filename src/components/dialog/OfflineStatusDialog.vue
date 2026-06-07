<script setup lang="ts">
import { useGlobalOfflineStatus } from '@/composables/useOfflineStatus'

const props = withDefaults(
  defineProps<{
    modelValue?: boolean
    type?: 'offline' | 'online'
  }>(),
  {
    modelValue: true,
    type: 'offline',
  },
)

const { t } = useI18n()
const { isOnline, canPerformNetworkAction, getOfflineMessage } = useGlobalOfflineStatus()

// 重试连接
const retrying = ref(false)

/** 尝试请求静态资源来触发网络状态重新检测。 */
async function handleRetry() {
  if (retrying.value) return

  retrying.value = true

  try {
    await fetch('/favicon.ico?' + new Date().getTime(), {
      method: 'HEAD',
      cache: 'no-cache',
    })

    setTimeout(() => {
      retrying.value = false
    }, 1000)
  } catch (error) {
    retrying.value = false
  }
}

// 状态文本
const statusText = computed(() => {
  if (props.type === 'online') {
    return t('app.onlineMessage')
  }
  return getOfflineMessage()
})

// 图标
const statusIcon = computed(() => {
  return props.type === 'online' ? 'mdi-wifi' : 'mdi-wifi-off'
})

// 颜色主题
const colorTheme = computed(() => {
  return props.type === 'online' ? 'success' : 'error'
})
</script>

<template>
  <VDialog :model-value="props.modelValue" persistent max-width="420" scrollable>
    <VCard class="offline-dialog">
      <div class="status-icon-wrapper">
        <div class="status-icon-bg">
          <VIcon :icon="statusIcon" size="48" :color="colorTheme" />
        </div>
      </div>

      <VCardText class="text-center">
        <h2 class="offline-title mb-4">
          {{ props.type === 'online' ? t('app.online') : t('app.offline') }}
        </h2>

        <p class="offline-message mb-6">
          {{ statusText }}
        </p>

        <div class="action-section mb-6">
          <VBtn
            v-if="props.type === 'offline'"
            :loading="retrying"
            :color="colorTheme"
            size="default"
            variant="flat"
            @click="handleRetry"
          >
            <VIcon icon="mdi-refresh" class="me-2" />
            {{ retrying ? t('common.checking') : t('common.retry') }}
          </VBtn>
        </div>

        <div class="status-indicators">
          <VChip
            :color="isOnline ? 'success' : 'error'"
            :prepend-icon="isOnline ? 'mdi-wifi' : 'mdi-wifi-off'"
            variant="tonal"
            size="small"
            class="me-2"
          >
            {{ isOnline ? t('common.networkOnline') : t('common.networkOffline') }}
          </VChip>

          <VChip
            :color="canPerformNetworkAction ? 'success' : 'warning'"
            :prepend-icon="canPerformNetworkAction ? 'mdi-check-circle' : 'mdi-alert-circle'"
            variant="tonal"
            size="small"
          >
            {{ canPerformNetworkAction ? t('common.serviceAvailable') : t('common.serviceUnavailable') }}
          </VChip>
        </div>
      </VCardText>
    </VCard>
  </VDialog>
</template>

<style scoped>
.status-icon-wrapper {
  padding-block: 24px 0;
  padding-inline: 24px;
  text-align: center;
}

.status-icon-bg {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  animation: icon-pulse 3s ease-in-out infinite;
  background: rgba(var(--v-theme-surface-variant), 0.5);
  block-size: 80px;
  inline-size: 80px;
  margin-block: 0;
  margin-inline: auto;
}

.status-icon-bg::before {
  position: absolute;
  z-index: -1;
  border-radius: 50%;
  animation: icon-glow 2s ease-in-out infinite alternate;
  background: linear-gradient(45deg, rgb(var(--v-theme-primary)), rgb(var(--v-theme-secondary)));
  content: '';
  inset: -3px;
  opacity: 0.1;
}

@keyframes icon-pulse {
  0%,
  100% {
    transform: scale(1);
  }

  50% {
    transform: scale(1.05);
  }
}

@keyframes icon-glow {
  0% {
    opacity: 0.1;
    transform: scale(1);
  }

  100% {
    opacity: 0.3;
    transform: scale(1.1);
  }
}
</style>
