<script setup lang="ts">
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const props = defineProps({
  value: Number,
  text: String,
})

// 有明确进度值时显示确定进度，否则显示不确定进度条。
const hasProgressValue = computed(() => typeof props.value === 'number' && Number.isFinite(props.value))
</script>
<template>
  <!-- Progress Dialog -->
  <VDialog :scrim="false" width="25rem">
    <VCard elevation="3" color="primary">
      <VCardText class="text-center">
        {{ props.text || t('dialog.progress.processing') }}
        <VProgressLinear
          color="white"
          class="mb-0 mt-1"
          :model-value="hasProgressValue ? props.value : undefined"
          :indeterminate="!hasProgressValue"
        />
      </VCardText>
    </VCard>
  </VDialog>
</template>
