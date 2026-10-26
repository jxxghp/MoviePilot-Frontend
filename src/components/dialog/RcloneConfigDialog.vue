<script lang="ts" setup>
import { manageStorage } from '@/api/manage'
import { useI18n } from 'vue-i18n'
import { useDisplay } from 'vuetify'
import { configureAceEditorPadding } from '@/utils/aceEditor'

// 显示器宽度
const display = useDisplay()

// 多语言支持
const { t } = useI18n()

// 定义输入
const props = defineProps({
  conf: {
    type: Object as PropType<{ [key: string]: any }>,
    required: true,
  },
})

if (!props.conf.filepath) {
  props.conf.filepath = '/moviepilot/.config/rclone/rclone.conf'
}

if (!props.conf.content) {
  props.conf.content = t('dialog.rcloneConfig.defaultContent')
}

// 定义事件
const emit = defineEmits(['done', 'close'])

// 保存和重置共享互斥状态，失败时保留编辑内容。
const saving = ref(false)

// 完成
async function handleDone() {
  if (saving.value) return
  saving.value = true
  try {
    await manageStorage('rclone', 'save_config', { conf: { ...props.conf } })
    emit('done')
  } catch (error) {
    console.error(error)
  } finally {
    saving.value = false
  }
}

// 重置成功后直接完成，避免重新写入旧配置。
async function handleReset() {
  if (saving.value) return
  saving.value = true
  try {
    await manageStorage('rclone', 'reset_config')
    emit('done')
  } catch (error) {
    console.error(error)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <VDialog width="50rem" scrollable :fullscreen="!display.mdAndUp.value">
    <VCard>
      <VDialogCloseBtn @click="emit('close')" />
      <VCardItem>
        <template #prepend>
          <VIcon icon="mdi-cog-outline" class="me-2" />
        </template>
        <VCardTitle>
          {{ t('dialog.rcloneConfig.title') }}
        </VCardTitle>
      </VCardItem>
      <VDivider />
      <VCardText>
        <VRow>
          <VCol cols="12">
            <VTextField
              v-model="props.conf.filepath"
              :label="t('dialog.rcloneConfig.filePath')"
              prepend-inner-icon="mdi-file-document"
            />
          </VCol>
          <VCol cols="12">
            <VAceEditor
              v-model:value="props.conf.content"
              lang="ini"
              theme="monokai"
              class="rounded h-full min-h-[30rem]"
              @init="configureAceEditorPadding"
            >
            </VAceEditor>
          </VCol>
        </VRow>
      </VCardText>
      <VCardActions class="app-dialog-actions">
        <VBtn color="error" variant="tonal" @click="handleReset" :disabled="saving" prepend-icon="mdi-restore">
          {{ t('dialog.rcloneConfig.reset') }}
        </VBtn>
        <VSpacer />
        <VBtn
          color="primary"
          variant="flat"
          @click="handleDone"
          :loading="saving"
          :disabled="saving"
          prepend-icon="mdi-check"
          class="px-5"
        >
          {{ t('dialog.rcloneConfig.complete') }}
        </VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
</template>
