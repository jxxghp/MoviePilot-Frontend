<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import api from '@/api'
import type { TransferHistory } from '@/api/types'

const props = defineProps<{ history: TransferHistory; canManage: boolean }>()
const emit = defineEmits<{ close: []; updated: []; redo: []; queue: [] }>()
const { t, te } = useI18n()
const confirmed = ref(false)
const busy = ref(false)
const errorMessage = ref('')
const completed = ref(false)
const cleanupFailed = computed(() => props.history.cleanup_status === 'failed')
// 与历史列表共用失败阶段文案，并保留新后端阶段的原始值。
const stage = computed(() => {
  const value = props.history.failure_stage || 'unknown'
  const key = `transferHistory.failureStages.${value}`
  return te(key) ? t(key) : value
})

// 确认只更新恢复记录；错误保留在当前弹窗，方便用户修复后再次提交。
async function resolve() {
  if (
    !confirmed.value ||
    busy.value ||
    completed.value ||
    !props.canManage ||
    (!cleanupFailed.value && (!props.history.transfer_task_id || props.history.status))
  )
    return
  busy.value = true
  errorMessage.value = ''
  try {
    const action = cleanupFailed.value ? 'cleanup-resolved' : 'discard-corrupt'
    await api.post(`history/transfer/${props.history.id}/${action}`, undefined, { feedback: 'silent' })
    completed.value = true
    emit('updated')
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : t('transferRecovery.requestFailed')
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <VDialog scrollable max-width="42rem">
    <VCard :title="t('transferRecovery.title')">
      <VCardText class="transfer-recovery-content">
        <div>{{ history.title || `#${history.id}` }}</div>
        <div>
          <strong>{{ t('transferRecovery.source') }}</strong> {{ history.src || '-' }}
        </div>
        <div>
          <strong>{{ t('transferRecovery.target') }}</strong> {{ history.dest || t('transferRecovery.targetUnknown') }}
        </div>
        <template v-if="!history.status || cleanupFailed">
          <div>
            <strong>{{ t('transferRecovery.stage') }}</strong> {{ stage }}
          </div>
          <VAlert type="warning" variant="tonal">{{
            history.cleanup_error || history.errmsg || t('transferRecovery.unknownReason')
          }}</VAlert>
          <div>
            <strong>{{ t('transferRecovery.next') }}</strong>
            {{ history.recovery_action || t('transferRecovery.defaultAction') }}
          </div>
          <div v-if="history.retry_count != null">
            {{ t('transferRecovery.attempts', { count: history.retry_count }) }}
          </div>
          <VAlert v-if="history.auto_paused" type="info" variant="tonal">{{ t('transferRecovery.pauseHint') }}</VAlert>
          <VAlert v-if="cleanupFailed" type="info" variant="tonal">{{ t('transferRecovery.cleanupHint') }}</VAlert>
          <template v-if="canManage && !completed && (cleanupFailed || history.transfer_task_id)">
            <VCheckbox
              v-model="confirmed"
              :disabled="busy"
              hide-details
              :label="t(cleanupFailed ? 'transferRecovery.cleanupConfirm' : 'transferRecovery.detachConfirm')"
            />
            <VBtn :disabled="!confirmed || busy" :loading="busy" variant="tonal" @click="resolve">
              {{ t(cleanupFailed ? 'transferRecovery.resolveCleanup' : 'transferRecovery.detach') }}
            </VBtn>
          </template>
        </template>
        <VAlert v-if="completed" type="success" variant="tonal">{{
          t(cleanupFailed ? 'transferRecovery.cleanupDone' : 'transferRecovery.detachDone')
        }}</VAlert>
        <VAlert v-if="errorMessage" type="error" variant="tonal">{{ errorMessage }}</VAlert>
      </VCardText>
      <VCardActions class="transfer-recovery-actions">
        <VBtn :disabled="busy" @click="emit('close')">{{ t('common.close') }}</VBtn>
        <VSpacer />
        <VBtn v-if="canManage" :disabled="busy" @click="emit('queue')">{{ t('transferRecovery.queue') }}</VBtn>
        <VBtn v-if="canManage && !cleanupFailed" :disabled="busy" color="primary" @click="emit('redo')">{{
          t('transferHistory.actions.redo')
        }}</VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
</template>

<style scoped>
.transfer-recovery-content {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  min-inline-size: 0;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}
.transfer-recovery-content > * {
  flex-shrink: 0;
}
.transfer-recovery-actions {
  flex-wrap: wrap;
}
</style>
