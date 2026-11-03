<script setup lang="ts">
import VDialogCloseBtn from '@/@core/components/DialogCloseBtn.vue'
import { onBeforeUnmount, ref } from 'vue'
import api from '@/api'
import type { Workflow } from '@/api/types'
import WorkflowTaskCard from '@/components/cards/WorkflowTaskCard.vue'
import { useI18n } from 'vue-i18n'
const props = defineProps<{ workflow: Workflow }>()
const emit = defineEmits(['close'])
const { t } = useI18n()
const workflow = ref(props.workflow)
const failed = ref(false)
let disposed = false
onBeforeUnmount(() => {
  disposed = true
})
async function refresh() {
  failed.value = false
  try {
    const next = await api.get<Workflow>(`workflow/${props.workflow.id}`)
    if (!disposed) workflow.value = next
  } catch {
    if (!disposed) failed.value = true
  }
}
</script>
<template>
  <VDialog :model-value="true" max-width="50rem" scrollable @update:model-value="!$event && emit('close')">
    <VCard>
      <VCardTitle>{{ workflow.name }}</VCardTitle>
      <VDialogCloseBtn @click="emit('close')" />
      <VCardText>
        <VAlert v-if="failed" type="error">{{ t('common.error') }}</VAlert>
        <WorkflowTaskCard :workflow="workflow" :event-types="[]" @refresh="refresh" />
        <p class="mt-3 text-pre-wrap">{{ workflow.result }}</p>
      </VCardText>
      <VCardActions
        ><VSpacer /><VBtn @click="refresh">{{ t('common.refresh') }}</VBtn></VCardActions
      >
    </VCard>
  </VDialog>
</template>
