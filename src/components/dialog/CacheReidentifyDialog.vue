<script setup lang="ts">
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const props = withDefaults(
  defineProps<{
    itemTitle?: string
    loading?: boolean
    modelValue?: boolean
    recognizeSource?: string
  }>(),
  {
    itemTitle: '',
    loading: false,
    modelValue: true,
    recognizeSource: '',
  },
)

const emit = defineEmits<{
  (event: 'close'): void
  (event: 'confirm', payload: { doubanId?: string; tmdbId?: number }): void
  (event: 'update:modelValue', value: boolean): void
}>()

const tmdbId = ref<number | undefined>()
const doubanId = ref<string | undefined>()

const visible = computed({
  get: () => props.modelValue,
  set: value => {
    emit('update:modelValue', value)
    if (!value) emit('close')
  },
})

// 提交重新识别参数给缓存页执行接口调用。
function submitReidentify() {
  emit('confirm', {
    doubanId: doubanId.value,
    tmdbId: tmdbId.value,
  })
}
</script>

<template>
  <VDialog v-if="visible" v-model="visible" scrollable max-width="35rem">
    <VCard>
      <VCardItem class="py-2">
        <template #prepend>
          <VIcon>mdi-text-recognition</VIcon>
        </template>
        <VCardTitle>{{ t('setting.cache.reidentifyDialog.title') }}</VCardTitle>
        <VCardSubtitle>{{ props.itemTitle }}</VCardSubtitle>
      </VCardItem>
      <VDialogCloseBtn v-model="visible" />
      <VDivider />
      <VCardText>
        <VRow>
          <VCol cols="12">
            <VTextField
              v-if="props.recognizeSource === 'themoviedb'"
              v-model="tmdbId"
              :label="t('setting.cache.reidentifyDialog.tmdbId')"
              :hint="t('setting.cache.reidentifyDialog.tmdbIdHint')"
              clearable
              prepend-inner-icon="mdi-id-card"
              persistent-hint
            />
            <VTextField
              v-else
              v-model="doubanId"
              :label="t('setting.cache.reidentifyDialog.doubanId')"
              :hint="t('setting.cache.reidentifyDialog.doubanIdHint')"
              clearable
              prepend-inner-icon="mdi-id-card"
              persistent-hint
            />
          </VCol>
        </VRow>
        <VAlert type="info" variant="tonal" class="mt-4">
          {{ t('setting.cache.reidentifyDialog.autoHint') }}
        </VAlert>
      </VCardText>

      <VCardActions class="app-dialog-actions">
        <VSpacer />
        <VBtn
          color="primary"
          variant="flat"
          :loading="props.loading"
          prepend-icon="mdi-check"
          class="px-5"
          @click="submitReidentify"
        >
          {{ t('setting.cache.reidentifyDialog.confirm') }}
        </VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
</template>
