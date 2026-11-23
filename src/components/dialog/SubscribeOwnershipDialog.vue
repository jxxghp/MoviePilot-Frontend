<script setup lang="ts">
import { getApiBusinessErrorMessage } from '@/api/client'
import {
  confirmSubscriptionOwner,
  listSubscriptionOwnerAccounts,
  type SubscriptionOwnerAccount,
} from '@/api/subscription'
import type { Subscribe } from '@/api/types'
import { useI18n } from 'vue-i18n'

const props = defineProps<{ subscription: Subscribe; kind: 'active' | 'history' }>()
const emit = defineEmits<{ close: []; saved: [] }>()
const { t } = useI18n()
const accounts = ref<SubscriptionOwnerAccount[]>([])
const account = ref<SubscriptionOwnerAccount | null>(null)
const loading = ref(true)
const saving = ref(false)
const error = ref('')
const titleId = useId()

onMounted(async () => {
  try {
    accounts.value = await listSubscriptionOwnerAccounts()
  } catch {
    error.value = t('subscriptionOwnership.loadFailed')
  } finally {
    loading.value = false
  }
})

async function save() {
  const { id, ownership_revision: revision } = props.subscription
  if (!account.value || !revision || saving.value) return
  saving.value = true
  error.value = ''
  try {
    await confirmSubscriptionOwner(props.kind, id, revision, account.value)
    emit('saved')
    emit('close')
  } catch (reason) {
    error.value = getApiBusinessErrorMessage(reason) || t('subscriptionOwnership.saveFailed')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <VDialog max-width="30rem" :aria-labelledby="titleId" @update:model-value="visible => !visible && emit('close')">
    <VCard>
      <VCardTitle :id="titleId">{{ t('subscriptionOwnership.title') }}</VCardTitle>
      <VCardText>
        <div class="font-weight-medium">{{ subscription.name }}</div>
        <div class="text-medium-emphasis mb-4">
          {{ t('subscriptionOwnership.previous') }} · {{ subscription.username || t('subscriptionOwnership.none') }}
        </div>
        <VAutocomplete
          v-model="account"
          :items="accounts"
          item-title="name"
          item-value="id"
          :label="t('subscriptionOwnership.account')"
          :hint="t('subscriptionOwnership.hint')"
          persistent-hint
          :loading="loading"
          :disabled="loading || saving"
          return-object
        />
        <VAlert v-if="error" class="mt-3" type="error" variant="tonal">{{ error }}</VAlert>
      </VCardText>
      <VCardActions>
        <VSpacer />
        <VBtn :disabled="saving" @click="emit('close')">{{ t('common.cancel') }}</VBtn>
        <VBtn color="primary" variant="flat" :loading="saving" :disabled="!account" @click="save">
          {{ t('common.confirm') }}
        </VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
</template>
