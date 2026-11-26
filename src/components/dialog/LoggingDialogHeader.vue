<script setup lang="ts">
import { useI18n } from 'vue-i18n'

/** 日志弹窗共用标题栏参数。 */
interface Props {
  /** 弹窗标题，供网页头部展示及原生 Sheet 标题栏提取。 */
  title: string
  /** 是否显示仅系统管理员可用的 AI 诊断入口。 */
  canDiagnose?: boolean
}

withDefaults(defineProps<Props>(), {
  canDiagnose: false,
})

const emit = defineEmits<{
  /** 下载当前日志文件或压缩包。 */
  download: []
  /** 在新窗口中打开完整原始日志。 */
  openWindow: []
  /** 呼叫智能助手分析当前日志。 */
  diagnose: []
}>()

const { t } = useI18n()
</script>

<template>
  <VCardItem class="logging-dialog-header" data-native-sheet-actions>
    <VCardTitle class="logging-dialog-title">
      <span class="logging-dialog-title__main">
        <VIcon icon="mdi-file-document" class="me-2 flex-shrink-0" />
        <span class="text-truncate" data-native-dialog-title>{{ title }}</span>
      </span>
      <span class="logging-dialog-title__actions">
        <button
          type="button"
          class="logging-dialog-action"
          data-native-sheet-action="mdi-download"
          :aria-label="t('common.download')"
          @click="emit('download')"
        >
          <VChip color="grey-darken-1" size="small">
            <VIcon icon="mdi-download" size="small" start />
            {{ t('common.download') }}
          </VChip>
        </button>
        <button
          type="button"
          class="logging-dialog-action"
          data-native-sheet-action="mdi-open-in-new"
          :aria-label="t('common.openInNewWindow')"
          @click="emit('openWindow')"
        >
          <VChip color="grey-darken-1" size="small">
            <VIcon icon="mdi-open-in-new" size="small" start />
            {{ t('common.openInNewWindow') }}
          </VChip>
        </button>
        <button
          v-if="canDiagnose"
          type="button"
          class="logging-dialog-action"
          data-native-sheet-action="mdi-robot-happy-outline"
          :aria-label="t('agentAssistant.diagnosticAction')"
          @click="emit('diagnose')"
        >
          <VChip color="primary" size="small">
            <VIcon icon="mdi-robot-happy-outline" size="small" start />
            {{ t('agentAssistant.diagnosticAction') }}
          </VChip>
        </button>
      </span>
    </VCardTitle>
  </VCardItem>
</template>

<style lang="scss" src="@/styles/logging-dialog.scss"></style>
