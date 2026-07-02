<script setup lang="ts">
import { useGlobalOfflineStatus } from '@/composables/useOfflineStatus'

const props = withDefaults(
  defineProps<{
    navbarExtraHeight?: string
  }>(),
  {
    navbarExtraHeight: '0rem',
  },
)

const { t } = useI18n()
const { connectionStatus, connectionReason, requestConnectionCheck } = useGlobalOfflineStatus()
const dismissed = ref(false)

const shouldShow = computed(() => connectionStatus.value !== 'online' && !dismissed.value)
const isChecking = computed(() => connectionStatus.value === 'checking')
const alertType = computed(() => (isChecking.value ? 'warning' : 'error'))
const statusTitle = computed(() => (isChecking.value ? t('app.connectionChecking') : t('app.serviceUnavailable')))
const statusMessage = computed(() => {
  if (connectionReason.value === 'browser-offline') return t('app.browserOfflineMessage')
  if (connectionReason.value === 'timeout') return t('app.serviceTimeoutMessage')
  if (isChecking.value) return t('app.connectionCheckingMessage')
  return t('app.serviceUnavailableMessage')
})

/** 立即请求重新探测 MoviePilot 服务。 */
function handleRetry() {
  requestConnectionCheck()
}

/** 隐藏本次连接提示并允许用户继续浏览。 */
function handleContinueBrowsing() {
  dismissed.value = true
}

watch(connectionStatus, (status, previousStatus) => {
  if (status === 'online' || (status === 'offline' && previousStatus === 'checking')) {
    dismissed.value = false
  }
})
</script>

<template>
  <Transition name="connection-status">
    <div
      v-if="shouldShow"
      class="connection-status-host"
      :style="{ '--connection-status-navbar-extra-height': props.navbarExtraHeight }"
      role="status"
      aria-live="polite"
    >
      <VAlert :type="alertType" variant="elevated" density="comfortable" class="connection-status-alert">
        <div class="connection-status-content">
          <div class="connection-status-copy">
            <div class="text-subtitle-2 font-weight-bold">
              {{ statusTitle }}
            </div>
            <div class="text-body-2 mt-1">
              {{ statusMessage }}
            </div>
          </div>

          <div class="connection-status-actions">
            <VBtn
              size="small"
              variant="text"
              :loading="isChecking"
              :disabled="isChecking"
              @click="handleRetry"
            >
              {{ isChecking ? t('common.checking') : t('common.retry') }}
            </VBtn>
            <VBtn size="small" variant="text" @click="handleContinueBrowsing">
              {{ t('app.continueBrowsing') }}
            </VBtn>
          </div>
        </div>
      </VAlert>
    </div>
  </Transition>
</template>

<style scoped>
.connection-status-host {
  position: fixed;
  z-index: 30;
  inline-size: min(44rem, calc(100vw - 2rem));
  inset-block-start: calc(
    env(safe-area-inset-top, 0px) + 4rem + var(--connection-status-navbar-extra-height, 0rem) + 0.75rem
  );
  inset-inline-start: 50%;
  pointer-events: none;
  transform: translateX(-50%);
}

.connection-status-alert {
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: var(--app-overlay-radius);
  box-shadow: var(--app-overlay-shadow);
  pointer-events: auto;
}

.connection-status-content {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.connection-status-copy {
  flex: 1;
  min-inline-size: 0;
}

.connection-status-actions {
  display: flex;
  flex-shrink: 0;
  align-items: center;
}

.connection-status-enter-active,
.connection-status-leave-active {
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
}

.connection-status-enter-from,
.connection-status-leave-to {
  opacity: 0;
  transform: translate(-50%, -0.75rem);
}

@media (width <= 600px) {
  .connection-status-host {
    inline-size: calc(100vw - 1rem);
  }

  .connection-status-content {
    align-items: flex-start;
    flex-direction: column;
    gap: 0.5rem;
  }

  .connection-status-actions {
    align-self: flex-end;
  }
}

@media (prefers-reduced-motion: reduce) {
  .connection-status-enter-active,
  .connection-status-leave-active {
    transition: none;
  }
}
</style>
