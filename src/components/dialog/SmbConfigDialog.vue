<script lang="ts" setup>
import { manageStorage } from '@/api/manage'
import { useI18n } from 'vue-i18n'
import { useDisplay } from 'vuetify'
import { computed, reactive, ref } from 'vue'

// 显示器宽度
const display = useDisplay()

// 多语言支持
const { t } = useI18n()

/** 单一服务器凭据及兼容的单共享、多共享路径配置。 */
interface SmbConfig {
  host?: string
  share?: string
  shares?: string[]
  username?: string
  password?: string
  domain?: string
  [key: string]: unknown
}

// 定义输入
const props = defineProps({
  conf: {
    type: Object as PropType<SmbConfig>,
    required: true,
  },
})

// 定义事件
const emit = defineEmits(['done', 'close'])

// 编辑副本，取消或保存失败时不污染调用方配置。
const draft = reactive<SmbConfig>({ ...props.conf, share: props.conf.share ?? props.conf.shares?.[0] ?? '' })
const multiShare = ref(Array.isArray(props.conf.shares))
const sharesText = ref((props.conf.shares ?? [props.conf.share || '']).join('\n'))
const saving = ref(false)
const shareNames = computed(() =>
  sharesText.value
    .split(/\r?\n/)
    .map((name: string) => name.trim())
    .filter(Boolean),
)
const sharesError = computed(() => {
  if (!multiShare.value) return ''
  if (!shareNames.value.length) return t('dialog.smbConfig.sharesRequired')
  if (
    shareNames.value.some(
      (name: string) => ['.', '..'].includes(name) || /[/\\:]/.test(name) || name.includes(String.fromCharCode(0)),
    )
  )
    return t('dialog.smbConfig.sharesInvalid')
  if (new Set(shareNames.value.map((name: string) => name.toLowerCase())).size !== shareNames.value.length)
    return t('dialog.smbConfig.sharesDuplicate')
  return ''
})

/** 保存明确的共享模式，旧配置默认继续使用共享内路径。 */
async function handleDone() {
  if (saving.value || sharesError.value) return
  saving.value = true
  try {
    const conf = { ...draft }
    if (multiShare.value) {
      conf.shares = shareNames.value
      delete conf.share
    } else {
      delete conf.shares
    }
    await manageStorage('smb', 'save_config', { conf })
    emit('done')
  } catch (e) {
    console.error(e)
  } finally {
    saving.value = false
  }
}

/** 重置成功后刷新列表，不再次保存当前表单的旧配置。 */
async function handleReset() {
  if (saving.value) return
  saving.value = true
  try {
    await manageStorage('smb', 'reset_config')
    emit('done')
  } catch (e) {
    console.error(e)
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
              v-model="draft.host"
              :hint="t('dialog.smbConfig.hostHint')"
              :label="t('dialog.smbConfig.host')"
              persistent-hint
              prepend-inner-icon="mdi-server"
              placeholder="192.168.1.100"
            />
          </VCol>
          <VCol v-if="!multiShare" cols="12" md="6">
            <VTextField
              v-model="draft.share"
              :hint="t('dialog.smbConfig.shareHint')"
              :label="t('dialog.smbConfig.share')"
              persistent-hint
              prepend-inner-icon="mdi-folder-network"
              placeholder="shared_folder"
            />
          </VCol>
          <VCol cols="12">
            <VSwitch v-model="multiShare" :label="t('dialog.smbConfig.multiShare')" />
            <template v-if="multiShare">
              <VTextarea
                v-model="sharesText"
                :label="t('dialog.smbConfig.shares')"
                :hint="t('dialog.smbConfig.sharesHint')"
                :error-messages="sharesError"
                persistent-hint
                rows="3"
                auto-grow
                placeholder="video&#10;downloads"
              />
            </template>
            <VAlert v-if="multiShare || Array.isArray(props.conf.shares)" type="info" variant="tonal" class="mt-4">
              {{ t('dialog.smbConfig.namespaceHint') }}
            </VAlert>
          </VCol>
          <VCol cols="12" md="6">
            <VTextField
              v-model="draft.username"
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
              v-model="draft.password"
              :hint="t('dialog.smbConfig.passwordHint')"
              :label="t('dialog.smbConfig.password')"
              persistent-hint
              prepend-inner-icon="mdi-lock"
              placeholder="your_password"
            />
          </VCol>
          <VCol cols="12" md="6">
            <VTextField
              v-model="draft.domain"
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
        <VBtn color="error" variant="tonal" :disabled="saving" @click="handleReset" prepend-icon="mdi-restore">
          {{ t('dialog.smbConfig.reset') }}
        </VBtn>
        <VSpacer />
        <VBtn
          color="primary"
          variant="flat"
          :loading="saving"
          :disabled="!!sharesError"
          @click="handleDone"
          prepend-icon="mdi-check"
          class="px-5"
        >
          {{ t('dialog.smbConfig.complete') }}
        </VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
</template>
