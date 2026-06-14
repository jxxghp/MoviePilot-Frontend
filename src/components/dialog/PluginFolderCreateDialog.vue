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

// 关闭插件文件夹新建弹窗。
function closeDialog() {
  emit('close')
  emit('update:modelValue', false)
}
</script>

<template>
  <VDialog v-model="dialogVisible" max-width="400">
    <VCard>
      <VDialogCloseBtn @click="closeDialog" />
      <VCardItem>
        <VCardTitle>{{ t('plugin.newFolder') }}</VCardTitle>
      </VCardItem>
      <VDivider />
      <VCardText>
        <VTextField
          v-model="folderName"
          :label="t('plugin.folderName')"
          variant="outlined"
          @keyup.enter="emit('create')"
        />
      </VCardText>
      <VCardActions class="app-dialog-actions">
        <VSpacer />
        <VBtn color="primary" variant="flat" prepend-icon="mdi-folder-plus" class="px-5" @click="emit('create')">
          {{ t('plugin.create') }}
        </VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
</template>
