<script lang="ts" setup>
import { useI18n } from 'vue-i18n'
import { useSetupWizard } from '@/composables/useSetupWizard'

const { t } = useI18n()
const { wizardData } = useSetupWizard()

// 整理方式选项
const transferTypeItems = [
  { title: '硬链接', value: 'link' },
  { title: '软链接', value: 'softlink' },
  { title: '复制', value: 'copy' },
  { title: '移动', value: 'move' },
]

// 覆盖模式选项
const overwriteModeItems = [
  { title: '从不覆盖', value: 'never' },
  { title: '总是覆盖', value: 'always' },
  { title: '按文件大小', value: 'size' },
  { title: '仅保留最新', value: 'latest' },
]
</script>

<template>
  <VCard variant="outlined">
    <VCardText>
      <div class="text-center mb-6">
        <h3 class="text-h4 mb-2">{{ t('setupWizard.storage.title') }}</h3>
        <p class="text-body-1 text-medium-emphasis">{{ t('setupWizard.storage.description') }}</p>
      </div>
      <VRow>
        <VCol cols="12">
          <VAlert type="info" variant="tonal" class="mb-4">
            <VAlertTitle>{{ t('setupWizard.storage.info') }}</VAlertTitle>
            {{ t('setupWizard.storage.infoDesc') }}
          </VAlert>
        </VCol>
        <VCol cols="12" md="6">
          <VTextField
            v-model="wizardData.storage.downloadPath"
            :label="t('setupWizard.storage.downloadPath')"
            :hint="t('setupWizard.storage.downloadPathHint')"
            persistent-hint
            prepend-inner-icon="mdi-download"
            placeholder="/downloads"
          />
        </VCol>
        <VCol cols="12" md="6">
          <VTextField
            v-model="wizardData.storage.libraryPath"
            :label="t('setupWizard.storage.libraryPath')"
            :hint="t('setupWizard.storage.libraryPathHint')"
            persistent-hint
            prepend-inner-icon="mdi-folder-multiple"
            placeholder="/media"
          />
        </VCol>
        <VCol cols="12" md="6">
          <VSelect
            v-model="wizardData.storage.transferType"
            :label="t('directory.transferType')"
            :hint="t('directory.transferTypeHint')"
            persistent-hint
            :items="transferTypeItems"
            prepend-inner-icon="mdi-swap-horizontal"
          />
        </VCol>
        <VCol cols="12" md="6">
          <VSelect
            v-model="wizardData.storage.overwriteMode"
            :label="t('directory.overwriteMode')"
            :hint="t('directory.overwriteModeHint')"
            persistent-hint
            :items="overwriteModeItems"
            prepend-inner-icon="mdi-file-replace"
          />
        </VCol>
      </VRow>
    </VCardText>
  </VCard>
</template>