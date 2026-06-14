<script lang="ts" setup>
import type { FileItem } from '@/api/types'
import { useI18n } from 'vue-i18n'

const props = defineProps({
  item: Object as PropType<FileItem>,
  loading: {
    type: Boolean,
    default: false,
  },
  modelValue: {
    type: Boolean,
    default: true,
  },
  name: {
    type: String,
    default: '',
  },
  recursive: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits<{
  (event: 'auto-name'): void
  (event: 'close'): void
  (event: 'rename'): void
  (event: 'update:modelValue', value: boolean): void
  (event: 'update:name', value: string): void
  (event: 'update:recursive', value: boolean): void
}>()

const { t } = useI18n()

const dialogVisible = computed({
  get: () => props.modelValue,
  set: value => emit('update:modelValue', value),
})

const renameName = computed({
  get: () => props.name,
  set: value => emit('update:name', value),
})

const includeSubfolders = computed({
  get: () => props.recursive,
  set: value => emit('update:recursive', value),
})

// 关闭弹窗并通知共享弹窗 Host 回收当前实例。
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
          <VIcon icon="mdi-pencil" class="me-2" />
        </template>
        <VCardTitle>{{ t('file.rename') }}</VCardTitle>
      </VCardItem>
      <VDialogCloseBtn @click="closeDialog" />
      <VDivider />
      <VCardText>
        <VRow>
          <VCol cols="12">
            <VTextField
              v-model="renameName"
              :label="t('file.newName')"
              :loading="loading"
              prepend-inner-icon="mdi-format-text"
            />
          </VCol>
          <VCol v-if="item && item.type == 'dir'" cols="12">
            <VSwitch v-model="includeSubfolders" :label="t('file.includeSubfolders')" />
          </VCol>
        </VRow>
      </VCardText>
      <VCardActions class="app-dialog-actions">
        <VBtn color="success" variant="tonal" prepend-icon="mdi-magic" @click="emit('auto-name')">
          {{ t('file.autoRecognizeName') }}
        </VBtn>
        <VSpacer />
        <VBtn
          color="primary"
          variant="flat"
          :disabled="!renameName"
          prepend-icon="mdi-check"
          class="px-5"
          @click="emit('rename')"
        >
          {{ t('common.confirm') }}
        </VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
</template>
