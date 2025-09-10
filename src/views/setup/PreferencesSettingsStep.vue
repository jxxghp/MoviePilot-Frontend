<script lang="ts" setup>
import { useI18n } from 'vue-i18n'
import { useSetupWizard } from '@/composables/useSetupWizard'

const { t } = useI18n()
const { wizardData, selectedPreset, selectPreset } = useSetupWizard()

// 质量偏好选项
const qualityItems = [
  { title: '4K 优先', value: '4K' },
  { title: '1080P 优先', value: '1080P' },
  { title: '720P 优先', value: '720P' },
]

// 字幕偏好选项
const subtitleItems = [
  { title: '中文字幕优先', value: 'chinese' },
  { title: '英文字幕优先', value: 'english' },
  { title: '双语字幕优先', value: 'bilingual' },
]

// 分辨率选项
const resolutionItems = [
  { title: '2160P (4K)', value: '2160p' },
  { title: '1080P', value: '1080p' },
  { title: '720P', value: '720p' },
]
</script>

<template>
  <VCard variant="outlined">
    <VCardText>
      <div class="text-center mb-6">
        <h3 class="text-h4 mb-2">{{ t('setupWizard.preferences.title') }}</h3>
        <p class="text-body-1 text-medium-emphasis">{{ t('setupWizard.preferences.description') }}</p>
      </div>
      <VRow>
        <VCol cols="12">
          <VAlert type="info" variant="tonal" class="mb-4">
            <VAlertTitle>{{ t('setupWizard.preferences.info') }}</VAlertTitle>
            {{ t('setupWizard.preferences.infoDesc') }}
          </VAlert>
        </VCol>

        <!-- 预设规则选择 -->
        <VCol cols="12">
          <VCard>
            <VCardTitle class="text-h6">{{ t('setupWizard.preferences.presetRules') }}</VCardTitle>
            <VCardText>
              <VRow>
                <VCol cols="12" md="4">
                  <VCard
                    :color="selectedPreset === '4k' ? 'primary' : 'default'"
                    :variant="selectedPreset === '4k' ? 'tonal' : 'outlined'"
                    class="cursor-pointer"
                    @click="selectPreset('4k')"
                  >
                    <VCardText class="text-center">
                      <VIcon icon="mdi-4k" size="48" class="mb-2" />
                      <div class="text-h6">4K 优先</div>
                    </VCardText>
                  </VCard>
                </VCol>
                <VCol cols="12" md="4">
                  <VCard
                    :color="selectedPreset === 'balanced' ? 'primary' : 'default'"
                    :variant="selectedPreset === 'balanced' ? 'tonal' : 'outlined'"
                    class="cursor-pointer"
                    @click="selectPreset('balanced')"
                  >
                    <VCardText class="text-center">
                      <VIcon icon="mdi-balance-scale" size="48" class="mb-2" />
                      <div class="text-h6">平衡模式</div>
                    </VCardText>
                  </VCard>
                </VCol>
                <VCol cols="12" md="4">
                  <VCard
                    :color="selectedPreset === 'chinese' ? 'primary' : 'default'"
                    :variant="selectedPreset === 'chinese' ? 'tonal' : 'outlined'"
                    class="cursor-pointer"
                    @click="selectPreset('chinese')"
                  >
                    <VCardText class="text-center">
                      <VIcon icon="mdi-translate" size="48" class="mb-2" />
                      <div class="text-h6">中文字幕</div>
                    </VCardText>
                  </VCard>
                </VCol>
              </VRow>
            </VCardText>
          </VCard>
        </VCol>

        <!-- 详细配置 -->
        <VCol cols="12">
          <VCard>
            <VCardTitle class="text-h6">{{ t('setupWizard.preferences.detailedConfig') }}</VCardTitle>
            <VCardText>
              <VRow>
                <VCol cols="12" md="4">
                  <VSelect
                    v-model="wizardData.preferences.quality"
                    :label="t('setupWizard.preferences.quality')"
                    :hint="t('setupWizard.preferences.qualityHint')"
                    persistent-hint
                    :items="qualityItems"
                    prepend-inner-icon="mdi-star"
                  />
                </VCol>
                <VCol cols="12" md="4">
                  <VSelect
                    v-model="wizardData.preferences.subtitle"
                    :label="t('setupWizard.preferences.subtitle')"
                    :hint="t('setupWizard.preferences.subtitleHint')"
                    persistent-hint
                    :items="subtitleItems"
                    prepend-inner-icon="mdi-subtitles"
                  />
                </VCol>
                <VCol cols="12" md="4">
                  <VSelect
                    v-model="wizardData.preferences.resolution"
                    :label="t('setupWizard.preferences.resolution')"
                    :hint="t('setupWizard.preferences.resolutionHint')"
                    persistent-hint
                    :items="resolutionItems"
                    prepend-inner-icon="mdi-monitor"
                  />
                </VCol>
              </VRow>
            </VCardText>
          </VCard>
        </VCol>
      </VRow>
    </VCardText>
  </VCard>
</template>

<style scoped>
.cursor-pointer {
  cursor: pointer;
  transition: all 0.2s ease;
}

.cursor-pointer:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 15%);
  transform: translateY(-2px);
}

.cursor-pointer:active {
  transform: translateY(0);
}

/* 选中状态的样式 */
.v-card--variant-tonal.v-theme--light {
  background-color: rgb(var(--v-theme-primary), 0.12);
}

.v-card--variant-tonal.v-theme--dark {
  background-color: rgb(var(--v-theme-primary), 0.2);
}
</style>