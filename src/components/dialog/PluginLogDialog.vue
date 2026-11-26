<script setup lang="ts">
import type { Plugin } from '@/api/types'
import LoggingDialogHeader from '@/components/dialog/LoggingDialogHeader.vue'
import { useGlobalSettingsStore, useUserStore } from '@/stores'
import { requestAgentAssistantDiagnostic } from '@/utils/agentAssistantDiagnostic'
import { useI18n } from 'vue-i18n'
import { useDisplay } from 'vuetify'

const LoggingView = defineAsyncComponent(() => import('@/views/system/LoggingView.vue'))

// 多语言
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
  plugin: {
    type: Object as PropType<Plugin>,
    required: true,
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

/** 打开当前插件日志的新窗口。 */
function openLoggerWindow() {
  const url = `${
    import.meta.env.VITE_API_BASE_URL
  }system/logging?length=-1&logfile=plugins/${props.plugin?.id?.toLowerCase()}.log`
  window.open(url, '_blank')
}

/** 下载当前插件日志压缩包。 */
function downloadLogger() {
  const url = `${import.meta.env.VITE_API_BASE_URL}system/logging/download/${props.plugin?.id?.toLowerCase()}`
  window.open(url, '_blank')
}

/** 呼叫智能助手按提示词约束分析当前插件日志；关闭日志弹窗，避免遮挡助手面板。 */
function diagnoseLogger() {
  if (!canDiagnose.value) return
  const logfile = `plugins/${props.plugin?.id?.toLowerCase()}.log`
  requestAgentAssistantDiagnostic(t('agentAssistant.diagnosticPrompt', { logfile }))
  visible.value = false
}
</script>

<template>
  <VDialog
    v-if="visible"
    v-model="visible"
    :scrollable="display.mdAndUp.value"
    max-width="72rem"
    :fullscreen="!display.mdAndUp.value"
  >
    <VCard class="logging-dialog-card">
      <VDialogCloseBtn v-model="visible" />
      <LoggingDialogHeader
        :title="t('plugin.logTitle')"
        :can-diagnose="canDiagnose"
        @download="downloadLogger"
        @open-window="openLoggerWindow"
        @diagnose="diagnoseLogger"
      />
      <VDivider />
      <VCardText class="logging-dialog-content pa-0">
        <LoggingView :logfile="`plugins/${props.plugin?.id?.toLowerCase()}.log`" />
      </VCardText>
    </VCard>
  </VDialog>
</template>
