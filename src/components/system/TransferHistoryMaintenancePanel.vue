<script setup lang="ts">
import { clearLegacyTransferHistory } from '@/api/history'
import { useConfirm } from '@/composables/useConfirm'
import { useUserStore } from '@/stores'
import { useI18n } from 'vue-i18n'
import { useToast } from 'vue-toastification'

const { t } = useI18n()
const toast = useToast()
const createConfirm = useConfirm()
const userStore = useUserStore()
const clearing = ref(false)

/** 确认后清空可安全移除的旧整理历史，并阻止重复提交。 */
async function clearTransferHistory() {
  if (!userStore.superUser || clearing.value) return

  clearing.value = true
  try {
    const confirmed = await createConfirm({
      type: 'warn',
      icon: 'mdi-delete-sweep-outline',
      title: t('setting.system.transferHistoryClearTitle'),
      content: t('setting.system.transferHistoryClearConfirm'),
      confirmText: t('setting.system.transferHistoryClear'),
    })
    if (!confirmed) return

    await clearLegacyTransferHistory()
    toast.success(t('setting.system.transferHistoryClearSuccess'))
  } catch {
    toast.error(t('setting.system.transferHistoryClearFailed'))
  } finally {
    clearing.value = false
  }
}
</script>

<template>
  <section
    v-if="userStore.superUser"
    class="transfer-history-maintenance-panel"
    :aria-label="t('setting.system.transferHistoryMaintenance')"
  >
    <VDivider class="mb-5" />

    <div class="transfer-history-maintenance-panel__content">
      <div class="min-w-0">
        <div class="d-flex align-center text-subtitle-1 font-weight-medium">
          <VIcon icon="mdi-database-remove-outline" class="me-2" />
          {{ t('setting.system.transferHistoryMaintenance') }}
        </div>
        <div class="text-body-2 text-medium-emphasis mt-1">
          {{ t('setting.system.transferHistoryMaintenanceHint') }}
        </div>
      </div>

      <VBtn
        class="transfer-history-maintenance-panel__action"
        color="error"
        variant="tonal"
        prepend-icon="mdi-delete-sweep-outline"
        :loading="clearing"
        :disabled="clearing"
        @click="clearTransferHistory"
      >
        {{ t('setting.system.transferHistoryClear') }}
      </VBtn>
    </div>
  </section>
</template>

<style scoped>
.transfer-history-maintenance-panel__content {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.transfer-history-maintenance-panel__action {
  flex: 0 0 auto;
}

@media (max-width: 600px) {
  .transfer-history-maintenance-panel__content {
    align-items: stretch;
    flex-direction: column;
  }

  .transfer-history-maintenance-panel__action {
    inline-size: 100%;
  }
}
</style>
