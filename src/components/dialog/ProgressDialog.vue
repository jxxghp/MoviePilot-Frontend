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
  <VDialog :scrim="false" width="25rem" data-native-progress :aria-label="t('dialog.progress.processing')">
    <!-- 弹窗材质可能覆盖背景色，文字需跟随表面语义色，避免浅色玻璃上的白字。 -->
    <VCard elevation="3" class="text-on-surface">
      <VCardText class="text-center">
        <span data-native-progress-text>{{ props.text || t('dialog.progress.processing') }}</span>
        <VProgressLinear
          data-native-progress-value
          color="primary"
          class="mb-0 mt-1"
          :model-value="hasProgressValue ? props.value : undefined"
          :indeterminate="!hasProgressValue"
        />
      </VCardText>
    </VCard>
  </VDialog>
</template>
