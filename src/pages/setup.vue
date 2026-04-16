<script lang="ts" setup>
import { onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useSetupWizard } from '@/composables/useSetupWizard'
import BasicSettingsStep from '@/views/setup/BasicSettingsStep.vue'
import SiteAuthSettingsStep from '@/views/setup/SiteAuthSettingsStep.vue'
import StorageSettingsStep from '@/views/setup/StorageSettingsStep.vue'
import DownloaderSettingsStep from '@/views/setup/DownloaderSettingsStep.vue'
import MediaServerSettingsStep from '@/views/setup/MediaServerSettingsStep.vue'
import NotificationSettingsStep from '@/views/setup/NotificationSettingsStep.vue'
import AgentSettingsStep from '@/views/setup/AgentSettingsStep.vue'
import PreferencesSettingsStep from '@/views/setup/PreferencesSettingsStep.vue'
import ConnectivityTest from '@/views/setup/ConnectivityTest.vue'
import { useDisplay } from 'vuetify'

const { t } = useI18n()
const router = useRouter()

// 显示器宽度
const display = useDisplay()

const {
  currentStep,
  totalSteps,
  stepTitles,
  connectivityTest,
  nextStep,
  prevStep,
  completeWizard,
  initialize,
  isLoading,
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
        <!-- 左侧占位 -->
        <div v-if="display.mdAndUp.value" style="inline-size: 96px"></div>

        <!-- 中间标题 -->
        <div class="d-flex align-center text-center">
          <div>
            <h1 class="text-h3 font-weight-bold text-moviepilot mb-3">{{ t('setupWizard.title') }}</h1>
            <p class="text-body-1 text-medium-emphasis">{{ t('setupWizard.subtitle') }}</p>
          </div>
        </div>

        <!-- 右侧按钮组 -->
        <div v-if="display.mdAndUp.value" class="d-flex gap-2 px-3">
          <VBtn
            variant="text"
            icon="mdi-cog"
            @click="router.push('/setting')"
            size="small"
            class="text-medium-emphasis"
          />
          <VBtn variant="text" icon="mdi-close" @click="router.push('/')" size="small" />
        </div>
      </div>
    </div>

    <!-- 向导内容 -->
    <VCard max-width="800px" class="mx-auto my-5">
      <VCardText class="px-1">
        <!-- 加载状态 -->
        <div v-if="isLoading" class="d-flex flex-column align-center justify-center py-16">
          <VProgressCircular indeterminate color="primary" size="64" class="mb-4" />
          <p class="text-body-1 text-medium-emphasis">{{ t('setupWizard.loading') }}</p>
        </div>

        <!-- 使用 VStepper 组件 -->
        <VStepper v-else v-model="currentStep" class="elevation-0" flat alt-labels :mobile="display.smAndDown.value">
          <!-- 步骤标题 -->
          <VStepperHeader class="elevation-0">
            <template v-for="(step, index) in stepTitles" :key="index">
              <VStepperItem
                :value="index + 1"
                :complete="currentStep > index + 1"
                :color="currentStep >= index + 1 ? 'primary' : 'default'"
                complete-icon="mdi-check-circle"
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

            <!-- 步骤2：用户认证 -->
            <VStepperWindowItem :value="2">
              <SiteAuthSettingsStep />
            </VStepperWindowItem>

            <!-- 步骤3：存储目录 -->
            <VStepperWindowItem :value="3">
              <StorageSettingsStep />
            </VStepperWindowItem>

            <!-- 步骤4：下载器 -->
            <VStepperWindowItem :value="4">
              <DownloaderSettingsStep />
            </VStepperWindowItem>

            <!-- 步骤5：媒体服务器 -->
            <VStepperWindowItem :value="5">
              <MediaServerSettingsStep />
            </VStepperWindowItem>

            <!-- 步骤6：通知 -->
            <VStepperWindowItem :value="6">
              <NotificationSettingsStep />
            </VStepperWindowItem>

            <!-- 步骤7：智能助手 -->
            <VStepperWindowItem :value="7">
              <AgentSettingsStep />
            </VStepperWindowItem>

            <!-- 步骤8：资源偏好 -->
            <VStepperWindowItem :value="8">
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
      </VCardText>
    </VCard>
  </div>
</template>

<style scoped>
.setup-wizard-fullscreen {
  position: fixed;
  background-color: rgb(var(--v-theme-background));
  inset: 0;
  overflow-y: auto;
}

.setup-wizard-header {
  position: sticky;
  z-index: 2000;
  background-color: rgb(var(--v-theme-surface));
  border-block-end: 1px solid rgb(var(--v-theme-outline-variant));
  box-shadow: 0 0 5px rgba(0, 0, 0, 4%);
  inset-block-start: 0;
  padding-block: calc(16px + env(safe-area-inset-top)) 16px;
}
</style>
