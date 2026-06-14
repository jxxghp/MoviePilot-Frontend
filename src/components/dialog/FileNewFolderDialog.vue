<script lang="ts" setup>
import { useI18n } from 'vue-i18n'

const props = defineProps({
  modelValue: {
    type: Boolean,
    default: true,
  },
  name: {
    type: String,
    default: '',
  },
})

const emit = defineEmits<{
  (event: 'close'): void
  (event: 'create'): void
  (event: 'update:modelValue', value: boolean): void
  (event: 'update:name', value: string): void
}>()

const { t } = useI18n()

const dialogVisible = computed({
  get: () => props.modelValue,
  set: value => emit('update:modelValue', value),
})

const folderName = computed({
  get: () => props.name,
  set: value => emit('update:name', value),
})

// 关闭新建目录弹窗并通知共享弹窗 Host 回收实例。
function closeDialog() {
  emit('close')
  emit('update:modelValue', false)
}
</script>

<template>
  <VDialog v-model="dialogVisible" max-width="35rem">
    <VCard>
      <VCardItem>
        <template #prepend>
          <VIcon icon="mdi-folder-plus-outline" class="me-2" />
        </template>
        <VCardTitle>{{ t('file.newFolder') }}</VCardTitle>
      </VCardItem>
      <VDialogCloseBtn @click="closeDialog" />
      <VDivider />
      <VCardText>
        <VTextField v-model="folderName" :label="t('common.name')" prepend-inner-icon="mdi-format-text" />
      </VCardText>
      <VCardActions class="app-dialog-actions">
        <VSpacer />
        <VBtn
          color="primary"
          variant="flat"
          :disabled="!folderName"
          prepend-icon="mdi-folder-plus"
          class="px-5"
          @click="emit('create')"
        >
          {{ t('common.create') }}
        </VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
</template>
