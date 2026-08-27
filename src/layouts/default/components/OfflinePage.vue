<script setup lang="ts">
import { useGlobalOfflineStatus } from '@/composables/useOfflineStatus'
import { useSystemRestartStatus } from '@/composables/useSystemRestart'
import { useToast } from 'vue-toastification'

const { t } = useI18n()
const toast = useToast()
const { connectionStatus, connectionReason } = useGlobalOfflineStatus()
const { isRestarting } = useSystemRestartStatus()
const shownConnectionPromptKeys = new Set<string>()

const statusMessage = computed(() => {
  if (connectionReason.value === 'browser-offline') return t('app.browserOfflineMessage')
  if (connectionReason.value === 'timeout') return t('app.serviceTimeoutMessage')
  return t('app.serviceUnavailableMessage')
})

/** 拼接离线状态提示文案，供 Toast 或 Agent 助手气泡展示。 */
function buildConnectionPromptMessage() {
  return `${t('app.serviceUnavailable')}：${statusMessage.value}`
}

/** 显示连接失败 Toast，Agent 助手可用时会由全局 Toast 路由接管。 */
function showConnectionPrompt() {
  toast.error(buildConnectionPromptMessage(), { timeout: 7000 })
}

/** 仅在确认连接失败后提示，并在恢复在线后允许下一轮提示重新出现。 */
function handleConnectionStatusChange() {
  if (connectionStatus.value === 'online') {
    shownConnectionPromptKeys.clear()
    return
  }

  if (connectionStatus.value !== 'offline') return

  // 重启期间由重启进度弹窗承载反馈，避免离线提示与进度提示叠加。
  if (isRestarting.value) return

  const promptKey = `${connectionStatus.value}:${connectionReason.value || 'unknown'}`

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
