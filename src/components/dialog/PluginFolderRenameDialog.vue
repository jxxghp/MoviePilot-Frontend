<script setup lang="ts">
import { useI18n } from 'vue-i18n'

// 多语言
const { t } = useI18n()

// 输入参数
const props = defineProps({
  modelValue: {
    type: Boolean,
    default: true,
  },
  folderName: {
    type: String,
    default: '',
  },
})

// 定义触发的自定义事件
const emit = defineEmits(['update:modelValue', 'close', 'rename'])

// 新名称
const newFolderName = ref(props.folderName)

// 弹窗显示状态
const visible = computed({
  get: () => props.modelValue,
  set: value => {
    emit('update:modelValue', value)
    if (!value) emit('close')
  },
})

/** 提交文件夹重命名。 */
function confirmRename() {
  emit('rename', newFolderName.value)
}
</script>

<template>
  <VDialog v-if="visible" v-model="visible" max-width="400">
    <VCard>
      <VCardItem>
        <template #prepend>
          <VIcon icon="mdi-pencil" class="me-2" />
        </template>
        <VCardTitle>{{ t('folder.renameFolder') }}</VCardTitle>
      </VCardItem>
      <VDialogCloseBtn v-model="visible" />
      <VDivider />
      <VCardText>
        <VTextField
          v-model="newFolderName"
          :label="t('folder.folderName')"
          variant="outlined"
          autofocus
          @keyup.enter="confirmRename"
        />
      </VCardText>
      <VCardActions class="app-dialog-actions">
        <VSpacer />
        <VBtn color="primary" variant="flat" prepend-icon="mdi-check" class="px-5" @click="confirmRename">确认</VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
</template>
