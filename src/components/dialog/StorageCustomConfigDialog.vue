<script setup lang="ts">
import type { StorageConf } from '@/api/types'
import { useI18n } from 'vue-i18n'
import { useDisplay } from 'vuetify'

// 显示器宽度
const display = useDisplay()

// 国际化
const { t } = useI18n()

// 定义输入
const props = defineProps({
  modelValue: {
    type: Boolean,
    default: true,
  },
  storage: {
    type: Object as PropType<StorageConf>,
    required: true,
  },
})

// 定义事件
const emit = defineEmits(['update:modelValue', 'close', 'done'])

// 自定义存储名称
const customName = ref(props.storage.name)

// 自定义存储类型
const storageType = ref(props.storage.type)

// 自定义存储配置对话框
const customConfigDialog = computed({
  get: () => props.modelValue,
  set: value => {
    emit('update:modelValue', value)
    if (!value) emit('close')
  },
})

/** 保存自定义存储基础信息并通知父级刷新。 */
function handleDone() {
  const nextStorage = {
    ...props.storage,
    name: customName.value,
    type: storageType.value,
  }
  customConfigDialog.value = false
  emit('done', nextStorage)
}
</script>

<template>
  <VDialog
    v-if="customConfigDialog"
    v-model="customConfigDialog"
    scrollable
    max-width="30rem"
    :fullscreen="!display.mdAndUp.value"
  >
    <VCard>
      <VCardItem>
        <template #prepend>
          <VIcon icon="mdi-cog" />
        </template>
        <VCardTitle>{{ t('storage.custom') }}</VCardTitle>
        <VDialogCloseBtn v-model="customConfigDialog" />
      </VCardItem>
      <VDivider />
      <VCardText>
        <VRow>
          <VCol cols="12" md="6">
            <VTextField
              v-model="storageType"
              :label="t('storage.type')"
              :hint="t('storage.customTypeHint')"
              persistent-hint
              prepend-inner-icon="mdi-database"
            />
          </VCol>
          <VCol cols="12" md="6">
            <VTextField
              v-model="customName"
              :label="t('storage.name')"
              persistent-hint
              prepend-inner-icon="mdi-label"
            />
          </VCol>
        </VRow>
      </VCardText>
      <VCardActions class="app-dialog-actions">
        <VSpacer />
        <VBtn color="primary" variant="flat" @click="handleDone" prepend-icon="mdi-content-save" class="px-5">
          {{ t('common.save') }}
        </VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
</template>
