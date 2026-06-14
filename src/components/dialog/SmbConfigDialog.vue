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

// 定义事件
const emit = defineEmits(['done', 'close'])

// 完成
async function handleDone() {
  await saveSmbConfig()
  emit('done')
}

// 重置配置
async function handleReset() {
  try {
    const result: { [key: string]: any } = await api.get('/storage/reset/smb')
    if (result.success) {
      // 重置成功
      handleDone()
    }
  } catch (e) {
    console.error(e)
  }
}

// 保存 SMB 设置
async function saveSmbConfig() {
  try {
    await api.post(`storage/save/smb`, props.conf)
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
          <VIcon icon="mdi-folder-network-outline" class="me-2" />
        </template>
        <VCardTitle>
          {{ t('dialog.smbConfig.title') }}
        </VCardTitle>
      </VCardItem>
      <VDivider />
      <VCardText>
        <VRow>
          <VCol cols="12" md="6">
            <VTextField
              v-model="props.conf.host"
              :hint="t('dialog.smbConfig.hostHint')"
              :label="t('dialog.smbConfig.host')"
              persistent-hint
              prepend-inner-icon="mdi-server"
              placeholder="192.168.1.100"
            />
          </VCol>
          <VCol cols="12" md="6">
            <VTextField
              v-model="props.conf.share"
              :hint="t('dialog.smbConfig.shareHint')"
              :label="t('dialog.smbConfig.share')"
              persistent-hint
              prepend-inner-icon="mdi-folder-network"
              placeholder="shared_folder"
            />
          </VCol>
          <VCol cols="12" md="6">
            <VTextField
              v-model="props.conf.username"
              :hint="t('dialog.smbConfig.usernameHint')"
              :label="t('dialog.smbConfig.username')"
              persistent-hint
              prepend-inner-icon="mdi-account"
              placeholder="your_username"
            />
          </VCol>
          <VCol cols="12" md="6">
            <VTextField
              type="password"
              v-model="props.conf.password"
              :hint="t('dialog.smbConfig.passwordHint')"
              :label="t('dialog.smbConfig.password')"
              persistent-hint
              prepend-inner-icon="mdi-lock"
              placeholder="your_password"
            />
          </VCol>
          <VCol cols="12" md="6">
            <VTextField
              v-model="props.conf.domain"
              :hint="t('dialog.smbConfig.domainHint')"
              :label="t('dialog.smbConfig.domain')"
              persistent-hint
              prepend-inner-icon="mdi-domain"
              placeholder="WORKGROUP"
            />
          </VCol>
        </VRow>
      </VCardText>
      <VCardActions class="app-dialog-actions">
        <VBtn color="error" variant="tonal" @click="handleReset" prepend-icon="mdi-restore">
          {{ t('dialog.smbConfig.reset') }}
        </VBtn>
        <VSpacer />
        <VBtn color="primary" variant="flat" @click="handleDone" prepend-icon="mdi-check" class="px-5">
          {{ t('dialog.smbConfig.complete') }}
        </VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
</template>
