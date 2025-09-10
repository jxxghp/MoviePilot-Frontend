<script lang="ts" setup>
import { onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useToast } from 'vue-toastification'
import { useSetupWizard } from '@/composables/useSetupWizard'
import BasicSettingsStep from '@/views/setup/BasicSettingsStep.vue'
import StorageSettingsStep from '@/views/setup/StorageSettingsStep.vue'
import DownloaderSettingsStep from '@/views/setup/DownloaderSettingsStep.vue'
import MediaServerSettingsStep from '@/views/setup/MediaServerSettingsStep.vue'
import NotificationSettingsStep from '@/views/setup/NotificationSettingsStep.vue'
import PreferencesSettingsStep from '@/views/setup/PreferencesSettingsStep.vue'
import ConnectivityTest from '@/views/setup/ConnectivityTest.vue'

const { t } = useI18n()
const router = useRouter()
const $toast = useToast()

const {
  currentStep,
  totalSteps,
  stepTitles,
  stepDescriptions,
  connectivityTest,
  nextStep,
  prevStep,
  completeWizard,
  initialize,
} = useSetupWizard()

// 初始化
onMounted(async () => {
  await initialize()
})
</script>

<template>
  <div class="setup-wizard-fullscreen">
    <!-- 全屏头部 -->
    <div class="setup-wizard-header">
      <div class="d-flex align-center justify-space-between">
        <div class="d-flex align-center text-center mx-auto">
          <div>
            <h1 class="text-h3 font-weight-bold text-moviepilot mb-3">{{ t('setupWizard.title') }}</h1>
            <p class="text-body-1 text-medium-emphasis">{{ t('setupWizard.subtitle') }}</p>
          </div>
        </div>
      </div>
    </div>

    <!-- 向导内容 -->
    <div class="setup-wizard-content">
      <div class="setup-wizard">
        <!-- 使用 VStepper 组件 -->
        <VStepper v-model="currentStep" class="elevation-0" flat>
          <!-- 步骤标题 -->
          <VStepperHeader class="elevation-0">
            <template v-for="(step, index) in stepTitles" :key="index">
              <VStepperItem
                :value="index + 1"
                :complete="currentStep > index + 1"
                :color="currentStep >= index + 1 ? 'primary' : 'default'"
              >
                <template #title>
                  <span class="text-caption">{{ step }}</span>
                </template>
              </VStepperItem>
              <VDivider v-if="index < stepTitles.length - 1" />
            </template>
          </VStepperHeader>

          <!-- 步骤内容 -->
          <VStepperWindow>
            <!-- 步骤1：基础参数 -->
            <VStepperWindowItem :value="1">
              <BasicSettingsStep />
            </VStepperWindowItem>

            <!-- 步骤2：存储目录 -->
            <VStepperWindowItem :value="2">
              <StorageSettingsStep />
            </VStepperWindowItem>

            <!-- 步骤3：下载器 -->
            <VStepperWindowItem :value="3">
              <DownloaderSettingsStep />
            </VStepperWindowItem>

            <!-- 步骤4：媒体服务器 -->
            <VStepperWindowItem :value="4">
              <MediaServerSettingsStep />
            </VStepperWindowItem>

            <!-- 步骤5：通知 -->
            <VStepperWindowItem :value="5">
              <NotificationSettingsStep />
            </VStepperWindowItem>

            <!-- 步骤6：资源偏好 -->
            <VStepperWindowItem :value="6">
              <PreferencesSettingsStep />
            </VStepperWindowItem>
          </VStepperWindow>

          <!-- 连通性测试进度条 -->
          <ConnectivityTest />

          <!-- 操作按钮 -->
          <VCardActions class="justify-space-between">
            <div class="d-flex gap-2">
              <VBtn
                v-if="currentStep !== 1"
                prepend-icon="mdi-chevron-left"
                @click="prevStep"
                :disabled="connectivityTest.isTesting"
              >
                {{ t('common.previous') }}
              </VBtn>
              <VBtn
                v-else
                color="primary"
                prepend-icon="mdi-keyboard-return"
                @click="router.push('/')"
                :disabled="connectivityTest.isTesting"
              >
                {{ t('common.skip') }}
              </VBtn>
            </div>

            <div class="d-flex gap-2">
              <VBtn
                v-if="currentStep < totalSteps"
                color="primary"
                append-icon="mdi-chevron-right"
                @click="nextStep"
                :disabled="connectivityTest.isTesting"
              >
                {{ connectivityTest.isTesting ? t('setupWizard.testing') : t('common.next') }}
              </VBtn>
              <VBtn
                v-else
                color="success"
                prepend-icon="mdi-check"
                @click="completeWizard"
                :disabled="connectivityTest.isTesting"
              >
                {{ t('setupWizard.complete') }}
              </VBtn>
            </div>
          </VCardActions>
        </VStepper>
      </div>
    </div>
  </div>
</template>

<style scoped>
.setup-wizard-fullscreen {
  position: fixed;
  z-index: 9999;
  background-color: rgb(var(--v-theme-surface));
  inset: 0;
  overflow-y: auto;
}

.setup-wizard-header {
  position: sticky;
  z-index: 1000;
  background-color: rgb(var(--v-theme-surface));
  border-block-end: 1px solid rgb(var(--v-theme-outline-variant));
  inset-block-start: 0;
  padding-block: 16px;
  padding-inline: 24px;
}

.setup-wizard-content {
  padding: 24px;
  min-block-size: calc(100vh - 80px);
}

.setup-wizard {
  padding: 20px;
  margin-block: 0;
  margin-inline: auto;
  max-inline-size: 800px;
}
</style>