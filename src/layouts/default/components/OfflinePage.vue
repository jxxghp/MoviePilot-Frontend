<script setup lang="ts">
import { useGlobalOfflineStatus } from '@/composables/useOfflineStatus'
import { useToast } from 'vue-toastification'

const { t } = useI18n()
const toast = useToast()
const { connectionStatus, connectionReason } = useGlobalOfflineStatus()
const shownConnectionPromptKeys = new Set<string>()

const isChecking = computed(() => connectionStatus.value === 'checking')
const statusTitle = computed(() => (isChecking.value ? t('app.connectionChecking') : t('app.serviceUnavailable')))
const statusMessage = computed(() => {
  if (connectionReason.value === 'browser-offline') return t('app.browserOfflineMessage')
  if (connectionReason.value === 'timeout') return t('app.serviceTimeoutMessage')
  if (isChecking.value) return t('app.connectionCheckingMessage')
  return t('app.serviceUnavailableMessage')
})

/** 拼接离线状态提示文案，供 Toast 或 Agent 助手气泡展示。 */
function buildConnectionPromptMessage() {
  return `${statusTitle.value}：${statusMessage.value}`
}

/** 根据当前连接状态选择 Toast 级别，Agent 助手可用时会由全局 Toast 路由接管。 */
function showConnectionPrompt() {
  const message = buildConnectionPromptMessage()
  const options = {
    timeout: isChecking.value ? 5000 : 7000,
  }

  if (isChecking.value) {
    toast.warning(message, options)
    return
  }

  toast.error(message, options)
}

/** 在同一轮连接异常内按状态去重提示，并在恢复在线后允许下一轮提示重新出现。 */
function handleConnectionStatusChange() {
  if (connectionStatus.value === 'online') {
    shownConnectionPromptKeys.clear()
    return
  }

  const promptKey =
    connectionStatus.value === 'checking'
      ? connectionStatus.value
      : `${connectionStatus.value}:${connectionReason.value || 'unknown'}`

  if (shownConnectionPromptKeys.has(promptKey)) return

  shownConnectionPromptKeys.add(promptKey)
  showConnectionPrompt()
}

watch([connectionStatus, connectionReason], handleConnectionStatusChange, {
  flush: 'post',
})
</script>

<template>
  <span class="d-none" aria-hidden="true" />
</template>
