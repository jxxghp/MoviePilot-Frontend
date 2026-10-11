<script setup lang="ts">
import type { Subscribe } from '@/api/types'
import { formatSeasonLabel } from '@/@core/utils/season'
import { useI18n } from 'vue-i18n'
import { useDisplay } from 'vuetify'

const LoggingView = defineAsyncComponent(() => import('@/views/system/LoggingView.vue'))

/** 单个订阅的日志弹窗，仅通过订阅 ID 请求服务端授权的数据源。 */
const props = withDefaults(
  defineProps<{
    modelValue?: boolean
    subscription: Subscribe
  }>(),
  { modelValue: true },
)
const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  close: []
}>()
const { t } = useI18n()
const display = useDisplay()
const visible = computed({
  get: () => props.modelValue !== false,
  set: value => {
    emit('update:modelValue', value)
    if (!value) emit('close')
  },
})
const logUrl = `${import.meta.env.VITE_API_BASE_URL}subscribe/${props.subscription.id}/logs`
const title = computed(() =>
  [
    props.subscription.name,
    props.subscription.year,
    props.subscription.type === '电视剧' ? formatSeasonLabel(props.subscription.season, t('media.specials')) : '',
  ]
    .filter(Boolean)
    .join(' · '),
)
const state = computed(() => {
  const execution = props.subscription.execution_status
  if (!execution) return ''
  const terminal = ['completed', 'failed', 'cancelled', 'skipped'].includes(execution.state)
  return t(`subscribe.execution.state.${terminal ? execution.state : execution.phase || execution.state}`)
})

/** 下载接口使用现有资源 Cookie，凭据不进入 URL。 */
function downloadLogs() {
  window.open(`${logUrl}/download`, '_blank', 'noopener')
}

/** 用独立窗口查看服务器返回的原始日志文本。 */
function openLogWindow() {
  window.open(`${logUrl}?length=-1`, '_blank', 'noopener')
}
</script>

<template>
  <VDialog v-if="visible" v-model="visible" max-width="72rem" :fullscreen="!display.mdAndUp.value" scrollable>
    <VCard class="subscription-log-card">
      <VDialogCloseBtn v-model="visible" />
      <VCardItem>
        <VCardTitle>{{ t('subscribe.logTitle') }}</VCardTitle>
        <VCardSubtitle>{{ title }}</VCardSubtitle>
        <div class="d-flex flex-wrap align-center ga-2 mt-3">
          <VChip v-if="state" size="small">{{ t('subscribe.logState') }}：{{ state }}</VChip>
          <VBtn size="small" variant="tonal" prepend-icon="mdi-download" @click="downloadLogs">
            {{ t('common.download') }}
          </VBtn>
          <VBtn size="small" variant="text" prepend-icon="mdi-open-in-new" @click="openLogWindow">
            {{ t('common.openInNewWindow') }}
          </VBtn>
        </div>
      </VCardItem>
      <VDivider />
      <VCardText class="subscription-log-content pa-0">
        <LoggingView :key="subscription.id" :stream-url="logUrl" :empty-text="t('subscribe.logEmpty')" />
      </VCardText>
    </VCard>
  </VDialog>
</template>

<style scoped>
.subscription-log-card {
  display: flex;
  flex-direction: column;
  max-block-size: 90vh;
}

.subscription-log-content {
  flex: 1 1 auto;
  min-block-size: 0;
  overflow: hidden;
}

.subscription-log-content :deep(.logging-view) {
  block-size: 100% !important;
  min-block-size: min(30rem, 55vh);
}

@media (width <= 960px) {
  .subscription-log-card {
    block-size: 100%;
    max-block-size: 100%;
  }
}
</style>
