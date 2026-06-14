<script lang="ts" setup>
import { useI18n } from 'vue-i18n'

// 多语言支持
const { t } = useI18n()

// 输入参数
const props = defineProps({
  title: String,
  dataType: String,
})

// 代码
const codeString = ref('')

// 定义事件
const emit = defineEmits(['close', 'save'])

// 导入
function handleImport() {
  emit('save', props.dataType, codeString)
  emit('close')
}
</script>

<template>
  <VDialog width="40rem" scrollable max-height="85vh">
    <VCard>
      <VCardItem>
        <template #prepend>
          <VIcon icon="mdi-code-json" class="me-2" />
        </template>
        <VCardTitle>{{ props.title }}</VCardTitle>
      </VCardItem>
      <VDialogCloseBtn @click="emit('close')" />
      <VCardText class="pt-2">
        <VTextarea v-model="codeString" prepend-inner-icon="mdi-code-json" />
      </VCardText>
      <VCardActions class="app-dialog-actions">
        <VSpacer />
        <VBtn color="primary" variant="flat" @click="handleImport" prepend-icon="mdi-import" class="px-5">
          {{ t('dialog.importCode.import') }}
        </VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
</template>
