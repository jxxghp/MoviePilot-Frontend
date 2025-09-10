<script lang="ts" setup>
import { useI18n } from 'vue-i18n'
import { useSetupWizard } from '@/composables/useSetupWizard'

const { t } = useI18n()
const { connectivityTest } = useSetupWizard()
</script>

<template>
  <!-- 连通性测试进度条 -->
  <VCard v-if="connectivityTest.isTesting || connectivityTest.showResult" variant="outlined" class="mx-4 mb-4">
    <VCardText class="text-center py-4">
      <!-- 测试中 -->
      <div v-if="connectivityTest.isTesting">
        <VIcon icon="mdi-cog-sync" class="rotating mb-2" color="primary" size="24" />
        <div class="text-body-2 mb-2">{{ connectivityTest.testMessage }}</div>
        <VProgressLinear
          v-model="connectivityTest.testProgress"
          color="primary"
          height="6"
          rounded
          class="mb-2"
        />
        <div class="text-caption text-medium-emphasis">{{ Math.round(connectivityTest.testProgress) }}%</div>
      </div>

      <!-- 测试结果 -->
      <div v-else-if="connectivityTest.showResult">
        <VIcon
          :icon="connectivityTest.testResult === 'success' ? 'mdi-check-circle' : 'mdi-alert-circle'"
          :color="connectivityTest.testResult === 'success' ? 'success' : 'error'"
          size="24"
          class="mb-2"
        />
        <div
          :class="connectivityTest.testResult === 'success' ? 'text-success' : 'text-error'"
          class="text-body-2 mb-2 font-weight-medium"
        >
          {{ connectivityTest.testMessage }}
        </div>
        <div v-if="connectivityTest.testResult === 'error'" class="text-caption text-medium-emphasis">
          {{ t('setupWizard.testFailedHint') }}
        </div>
      </div>
    </VCardText>
  </VCard>
</template>

<style scoped>
/* 旋转动画 */
.rotating {
  animation: rotate 2s linear infinite;
}

@keyframes rotate {
  from {
    transform: rotate(0deg);
  }

  to {
    transform: rotate(360deg);
  }
}
</style>