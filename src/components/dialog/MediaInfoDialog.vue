<script setup lang="ts">
import { Context } from '@/api/types'
import MediaInfoCard from '../cards/MediaInfoCard.vue'
import { useI18n } from 'vue-i18n'

// 多语言支持
const { t } = useI18n()

// 输入参数
defineProps({
  context: Object as PropType<Context>,
})

// 定义事件
const emit = defineEmits(['close'])
</script>
<template>
  <VDialog max-width="50rem" max-height="90dvh" scrollable :aria-label="t('setting.cache.recognitionResult')">
    <VCard>
      <VDialogCloseBtn @click="emit('close')" />
      <VCardText data-native-dialog-content class="pa-4">
        <MediaInfoCard :context="context" />
      </VCardText>
    </VCard>
  </VDialog>
</template>
