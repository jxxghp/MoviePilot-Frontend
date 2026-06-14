<script lang="ts" setup>
import api from '@/api'
import { useI18n } from 'vue-i18n'
import { useDisplay } from 'vuetify'

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

// 完成
async function handleDone() {
  await savaRcloneConfig()
  emit('done')
}

// 保存rclone设置
async function savaRcloneConfig() {
  try {
    await api.post(`storage/save/rclone`, props.conf)
  } catch (e) {
    console.error(e)
  }
}

// 重置配置
async function handleReset() {
  try {
    const result: { [key: string]: any } = await api.get('/storage/reset/rclone')
    if (result.success) {
      handleDone()
    }
  } catch (e) {
    console.error(e)
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
            >
            </VAceEditor>
          </VCol>
        </VRow>
      </VCardText>
      <VCardActions class="app-dialog-actions">
        <VBtn color="error" variant="tonal" @click="handleReset" prepend-icon="mdi-restore">
          {{ t('dialog.rcloneConfig.reset') }}
        </VBtn>
        <VSpacer />
        <VBtn color="primary" variant="flat" @click="handleDone" prepend-icon="mdi-check" class="px-5">
          {{ t('dialog.rcloneConfig.complete') }}
        </VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
</template>
