<script setup lang="ts">
import type { LlmProviderAuthSession } from '@/composables/useLlmProviderDirectory'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const props = withDefaults(
  defineProps<{
    authSession?: LlmProviderAuthSession | null
    modelValue?: boolean
    polling?: boolean
    popupBlocked?: boolean
  }>(),
  {
    authSession: null,
    modelValue: true,
    polling: false,
    popupBlocked: false,
  },
)

const emit = defineEmits<{
  (event: 'close'): void
  (event: 'openAuthPage'): void
  (event: 'poll'): void
  (event: 'update:modelValue', value: boolean): void
}>()

const visible = computed({
  get: () => props.modelValue,
  set: value => {
    emit('update:modelValue', value)
    if (!value) emit('close')
  },
})

// 关闭授权弹窗并通知调用方停止轮询。
function closeDialog() {
  visible.value = false
}
</script>

<template>
  <VDialog v-if="visible" v-model="visible" max-width="560">
    <VCard>
      <VCardItem>
        <VCardTitle>{{ t('setting.system.llmProviderAuthDialogTitle') }}</VCardTitle>
      </VCardItem>
      <VDivider />
      <VCardText class="d-flex flex-column ga-4">
        <VAlert v-if="props.authSession?.instructions" type="info" variant="tonal">
          {{ props.authSession.instructions }}
        </VAlert>

        <VAlert v-if="props.popupBlocked" type="warning" variant="tonal">
          {{ t('setting.system.llmProviderPopupBlocked') }}
        </VAlert>

        <div v-if="props.authSession?.user_code">
          <div class="text-caption text-medium-emphasis mb-1">{{ t('setting.system.llmProviderDeviceCode') }}</div>
          <div class="text-h5 font-weight-bold">{{ props.authSession.user_code }}</div>
        </div>

        <div v-if="props.authSession?.message" class="text-body-2">
          {{ props.authSession.message }}
        </div>

        <div class="d-flex flex-wrap ga-2">
          <VBtn color="primary" prepend-icon="mdi-open-in-new" @click="emit('openAuthPage')">
            {{ t('setting.system.llmProviderOpenAuthPage') }}
          </VBtn>
          <VBtn variant="tonal" prepend-icon="mdi-refresh" :loading="props.polling" @click="emit('poll')">
            {{ t('setting.system.llmProviderCheckAuthStatus') }}
          </VBtn>
        </div>
      </VCardText>
      <VCardActions class="app-dialog-actions">
        <VSpacer />
        <VBtn color="primary" variant="flat" class="px-5" @click="closeDialog">
          {{ t('common.close') }}
        </VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
</template>
