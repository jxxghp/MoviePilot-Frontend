<script setup lang="ts">
import DialogCloseBtn from '@/@core/components/DialogCloseBtn.vue'
import { useDisplay } from 'vuetify'

const emit = defineEmits<{ close: [] }>()
const { t } = useI18n()
const display = useDisplay()
const AccountSettingNotification = defineAsyncComponent(() => import('@/views/setting/AccountSettingNotification.vue'))
</script>

<template>
  <VDialog
    :model-value="true"
    :retain-focus="false"
    :fullscreen="!display.mdAndUp.value"
    max-width="80rem"
    scrollable
    @update:model-value="open => !open && emit('close')"
  >
    <VCard :title="t('channelSettings.globalNotifications')">
      <DialogCloseBtn @click="emit('close')" />
      <VDivider />
      <VCardText>
        <AccountSettingNotification active />
      </VCardText>
    </VCard>
  </VDialog>
</template>
