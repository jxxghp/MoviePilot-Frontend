<script setup lang="ts">
import type { Plugin } from '@/api/types'
import { useI18n } from 'vue-i18n'
import { useDisplay } from 'vuetify'

const LoggingView = defineAsyncComponent(() => import('@/views/system/LoggingView.vue'))

// 多语言
const { t } = useI18n()

// 显示器宽度
const display = useDisplay()

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
      <VCardItem>
        <VCardTitle class="d-inline-flex">
          <VIcon icon="mdi-file-document" class="me-2" />
          {{ t('plugin.logTitle') }}
          <span class="ms-4 d-inline-flex align-center ga-1">
            <a class="d-inline-flex align-center cursor-pointer" @click="downloadLogger">
              <VChip color="grey-darken-1" size="small">
                <VIcon icon="mdi-download" size="small" start />
                {{ t('common.download') }}
              </VChip>
            </a>
            <a class="d-inline-flex align-center cursor-pointer" @click="openLoggerWindow">
              <VChip color="grey-darken-1" size="small">
                <VIcon icon="mdi-open-in-new" size="small" start />
                {{ t('common.openInNewWindow') }}
              </VChip>
            </a>
          </span>
        </VCardTitle>
      </VCardItem>
      <VDivider />
      <VCardText class="logging-dialog-content pa-0">
        <LoggingView :logfile="`plugins/${props.plugin?.id?.toLowerCase()}.log`" />
      </VCardText>
    </VCard>
  </VDialog>
</template>

<style scoped>
@media (width <= 960px) {
  .logging-dialog-card {
    display: flex;
    flex-direction: column;
    overflow: hidden;
    block-size: 100%;
  }

  .logging-dialog-content {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    inline-size: 100%;
    min-block-size: 0;
    overflow: hidden;
  }
}
</style>
