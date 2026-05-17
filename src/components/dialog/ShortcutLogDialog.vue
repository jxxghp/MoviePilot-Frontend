<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useDisplay } from 'vuetify'

const LoggingView = defineAsyncComponent(() => import('@/views/system/LoggingView.vue'))

// 国际化
const { t } = useI18n()

// 显示器宽度
const display = useDisplay()

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
</script>

<template>
  <VDialog v-if="visible" v-model="visible" scrollable max-width="80rem" :fullscreen="!display.mdAndUp.value">
    <VCard>
      <VDialogCloseBtn v-model="visible" />
      <VCardItem>
        <VCardTitle class="d-inline-flex">
          <VIcon icon="mdi-file-document" class="me-2" />
          {{ t('shortcut.log.subtitle') }}
          <a class="mx-2 d-inline-flex align-center" :href="allLoggingUrl()" target="_blank">
            <VChip color="grey-darken-1" size="small" class="ml-2">
              <VIcon icon="mdi-open-in-new" size="small" start />
              {{ t('common.openInNewWindow') }}
            </VChip>
          </a>
        </VCardTitle>
      </VCardItem>
      <VDivider />
      <VCardText class="pa-0">
        <LoggingView logfile="moviepilot.log" />
      </VCardText>
    </VCard>
  </VDialog>
</template>
