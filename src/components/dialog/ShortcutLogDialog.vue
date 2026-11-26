<script setup lang="ts">
import LoggingDialogHeader from '@/components/dialog/LoggingDialogHeader.vue'
import { useGlobalSettingsStore, useUserStore } from '@/stores'
import { requestAgentAssistantDiagnostic } from '@/utils/agentAssistantDiagnostic'
import { useI18n } from 'vue-i18n'
import { useDisplay } from 'vuetify'

const LoggingView = defineAsyncComponent(() => import('@/views/system/LoggingView.vue'))

// 国际化
const { t } = useI18n()

// 显示器宽度
const display = useDisplay()

const globalSettingsStore = useGlobalSettingsStore()
const userStore = useUserStore()

/** 仅在智能助手入口已启用且当前为系统管理员（read_log 仅管理员可用）时显示诊断按钮。 */
const canDiagnose = computed(
  () =>
    globalSettingsStore.data?.AI_AGENT_ENABLE === true &&
    globalSettingsStore.data?.AI_AGENT_HIDE_ENTRY !== true &&
    userStore.superUser === true,
)

// 输入参数
const props = defineProps({
  modelValue: {
    type: Boolean,
    default: true,
  },
})

// 定义触发的自定义事件
const emit = defineEmits(['update:modelValue', 'close'])

// 弹窗显示状态
const visible = computed({
  get: () => props.modelValue,
  set: value => {
    emit('update:modelValue', value)
    if (!value) emit('close')
  },
})

/** 拼接全部日志 URL。 */
function allLoggingUrl() {
  return `${import.meta.env.VITE_API_BASE_URL}system/logging?length=-1`
}

/** 拼接主程序日志下载 URL。 */
function allLoggingDownloadUrl() {
  return `${import.meta.env.VITE_API_BASE_URL}system/logging/download/moviepilot`
}

/** 复用现有日志地址，网页按钮和原生 Sheet 菜单均触发同一打开行为。 */
function openLogging(download: boolean) {
  window.open(download ? allLoggingDownloadUrl() : allLoggingUrl(), '_blank', 'noopener')
}

/** 呼叫智能助手按提示词约束分析主程序日志；关闭日志弹窗，避免遮挡助手面板。 */
function diagnoseLogging() {
  if (!canDiagnose.value) return
  requestAgentAssistantDiagnostic(t('agentAssistant.diagnosticPrompt', { logfile: 'moviepilot.log' }))
  visible.value = false
}
</script>

<template>
  <VDialog
    v-if="visible"
    v-model="visible"
    :scrollable="display.mdAndUp.value"
    max-width="80rem"
    :fullscreen="!display.mdAndUp.value"
  >
    <VCard class="logging-dialog-card">
      <VDialogCloseBtn v-model="visible" />
      <LoggingDialogHeader
        :title="t('shortcut.log.subtitle')"
        :can-diagnose="canDiagnose"
        @download="openLogging(true)"
        @open-window="openLogging(false)"
        @diagnose="diagnoseLogging"
      />
      <VDivider />
      <VCardText class="logging-dialog-content pa-0">
        <LoggingView logfile="moviepilot.log" />
      </VCardText>
    </VCard>
  </VDialog>
</template>
