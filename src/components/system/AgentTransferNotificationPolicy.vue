<script setup lang="ts">
import { computed, onMounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useToast } from 'vue-toastification'
import { useNotificationPoliciesStore } from '@/stores/notificationPolicies'

const props = withDefaults(defineProps<{ active?: boolean }>(), { active: true })
const { t } = useI18n()
const toast = useToast()
const policies = useNotificationPoliciesStore()
const disabled = computed(() => !policies.loaded || policies.loading || policies.saving || policies.loadFailed)
const items = computed(() =>
  ['all', 'attention', 'off'].map(value => ({ value, title: t(`setting.notification.agentTransferPolicy.${value}`) })),
)

async function save() {
  if (await policies.save()) toast.success(t('setting.notification.agentTransferPolicy.saved'))
}

onMounted(() => policies.load())
watch(
  () => props.active,
  active => {
    if (active) void policies.load(true)
  },
)
</script>

<template>
  <section :aria-label="t('setting.notification.agentTransferPolicy.title')">
    <VSelect
      v-model="policies.mode"
      :label="t('setting.notification.agentTransferPolicy.title')"
      :items="items"
      :hint="t('setting.notification.agentTransferPolicy.hint')"
      persistent-hint
      :disabled="disabled"
      :menu-props="{
        activatorProps: {
          'aria-label': t('setting.notification.agentTransferPolicy.title'),
          'aria-disabled': disabled,
        },
      }"
      :loading="policies.loading"
    />
    <VAlert v-if="policies.loadFailed" type="warning" variant="tonal" class="mt-3">
      {{ t('setting.notification.agentTransferPolicy.loadFailed') }}
      <VBtn variant="text" @click="policies.load(true)">{{ t('common.retry') }}</VBtn>
    </VAlert>
    <VAlert v-if="policies.saveFailed" type="error" variant="tonal" class="mt-3">
      {{ t('setting.notification.agentTransferPolicy.saveFailed') }}
    </VAlert>
    <VBtn
      class="mt-4"
      :loading="policies.saving"
      :disabled="!policies.loaded || policies.loading || !policies.dirty || policies.loadFailed"
      prepend-icon="mdi-content-save"
      @click="save"
    >
      {{ t('setting.notification.agentTransferPolicy.save') }}
    </VBtn>
  </section>
</template>
