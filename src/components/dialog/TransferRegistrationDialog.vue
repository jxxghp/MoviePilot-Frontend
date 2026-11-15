<script setup lang="ts">
import { computed, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import type { TransferHistory } from '@/api/types'
import VDialogCloseBtn from '@/@core/components/DialogCloseBtn.vue'

const props = defineProps<{ history: TransferHistory; returnFocus?: HTMLElement }>()
const emit = defineEmits<{ close: [] }>()
const { t, te, locale } = useI18n()
const audit = computed(() => (props.history.origin === 'external' ? props.history.registration : undefined))
const registeredAt = computed(() => {
  const value = audit.value?.registered_at
  if (!value) return t('common.unknown')
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString(locale.value)
})
const verification = computed(() => {
  const value = audit.value?.verification
  if (!value) return t('common.unknown')
  const key = `transferHistory.registrationVerification.${value}`
  return te(key) ? t(key) : value
})

// 共享 Host 关闭时卸载弹窗，恢复仍存在的来源入口，不抢占其他已获得焦点的控件。
onUnmounted(() => {
  if (props.returnFocus?.isConnected && document.activeElement === document.body) {
    props.returnFocus.focus({ preventScroll: true })
  }
})
</script>

<template>
  <VDialog scrollable max-width="28rem" :aria-label="t('transferHistory.externalRegistration')">
    <VCard>
      <VCardItem class="pe-16">
        <template #prepend><VIcon icon="mdi-import" /></template>
        <VCardTitle>{{ t('transferHistory.externalRegistration') }}</VCardTitle>
      </VCardItem>
      <VDialogCloseBtn @click="emit('close')" />
      <VDivider />
      <VCardText class="transfer-registration-content">
        <p class="text-subtitle-1 font-weight-medium mb-4">{{ history.title || `#${history.id}` }}</p>
        <dl v-if="audit" class="transfer-registration-details">
          <div>
            <dt>{{ t('transferHistory.registrationActor') }}</dt>
            <dd>{{ audit.actor_name || t('common.unknown') }}</dd>
          </div>
          <div>
            <dt>{{ t('transferHistory.registrationTime') }}</dt>
            <dd>
              <time :datetime="audit.registered_at">{{ registeredAt }}</time>
            </dd>
          </div>
          <div>
            <dt>{{ t('transferHistory.registrationScope') }}</dt>
            <dd>{{ verification }}</dd>
          </div>
        </dl>
        <p v-else class="text-medium-emphasis mb-0">{{ t('transferHistory.registrationUnavailable') }}</p>
      </VCardText>
    </VCard>
  </VDialog>
</template>

<style scoped>
.transfer-registration-content {
  min-inline-size: 0;
  overflow-wrap: anywhere;
}

.transfer-registration-details {
  display: grid;
  gap: 1rem;
}

.transfer-registration-details dt {
  margin-block-end: 0.25rem;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 0.8125rem;
}

.transfer-registration-details dd {
  margin: 0;
}
</style>
