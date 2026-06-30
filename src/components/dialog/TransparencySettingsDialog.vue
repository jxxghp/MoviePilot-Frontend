<script setup lang="ts">
import { useTransparencySettings } from '@/composables/useTransparencySettings'
import { useI18n } from 'vue-i18n'
import { useDisplay } from 'vuetify'

// 国际化
const { t } = useI18n()

// 显示器宽度
const display = useDisplay()

// 输入参数
const props = withDefaults(
  defineProps<{
    modelValue?: boolean
  }>(),
  {
    modelValue: true,
  },
)

// 定义触发的自定义事件
const emit = defineEmits<{
  (e: 'close'): void
  (e: 'update:modelValue', value: boolean): void
}>()

// 弹窗显示状态
const visible = computed({
  get: () => props.modelValue,
  set: value => {
    emit('update:modelValue', value)
    if (!value) emit('close')
  },
})

const {
  adjustTransparency,
  backgroundBlur,
  backgroundPosterOpacity,
  currentPresetLevel,
  onBackgroundBlurChange,
  onBackgroundPosterOpacityChange,
  onBlurChange,
  onGlassQualityChange,
  onOpacityChange,
  resetTransparencySettings,
  transparencyBlur,
  transparencyGlassQuality,
  transparencyOpacity,
} = useTransparencySettings()
</script>

<template>
  <VDialog v-if="visible" v-model="visible" max-width="30rem" scrollable :fullscreen="!display.mdAndUp.value">
    <VCard>
      <VCardItem>
        <VCardTitle>
          <VIcon icon="mdi-opacity" class="me-2" />
          {{ t('theme.transparencyAdjust') }}
        </VCardTitle>
        <VDialogCloseBtn v-model="visible" />
      </VCardItem>
      <VDivider />
      <VCardText>
        <div class="space-y-6">
          <div>
            <div class="d-flex align-center justify-space-between mb-2">
              <span class="text-body-2">{{ t('theme.transparencyOpacity') }}</span>
              <span class="text-caption">{{ Math.round(transparencyOpacity * 100) }}%</span>
            </div>
            <VSlider
              v-model="transparencyOpacity"
              :min="0"
              :max="1"
              :step="0.01"
              color="primary"
              @update:model-value="onOpacityChange"
            />
          </div>

          <div>
            <div class="d-flex align-center justify-space-between mb-2">
              <span class="text-body-2">{{ t('theme.transparencyBlur') }}</span>
              <span class="text-caption">{{ transparencyBlur }}px</span>
            </div>
            <VSlider
              v-model="transparencyBlur"
              :min="0"
              :max="30"
              :step="1"
              color="primary"
              @update:model-value="onBlurChange"
            />
          </div>

          <div>
            <div class="d-flex align-center justify-space-between mb-2">
              <span class="text-body-2">{{ t('theme.backgroundPosterOpacity') }}</span>
              <span class="text-caption">{{ Math.round(backgroundPosterOpacity * 100) }}%</span>
            </div>
            <VSlider
              v-model="backgroundPosterOpacity"
              :min="0"
              :max="1"
              :step="0.01"
              color="primary"
              @update:model-value="onBackgroundPosterOpacityChange"
            />
          </div>

          <div>
            <div class="d-flex align-center justify-space-between mb-2">
              <span class="text-body-2">{{ t('theme.backgroundBlur') }}</span>
              <span class="text-caption">{{ backgroundBlur }}px</span>
            </div>
            <VSlider
              v-model="backgroundBlur"
              :min="0"
              :max="30"
              :step="1"
              color="primary"
              @update:model-value="onBackgroundBlurChange"
            />
          </div>

          <div>
            <span class="text-body-2 d-block mb-2">{{ t('theme.transparencyGlassQuality') }}</span>
            <VBtnToggle
              v-model="transparencyGlassQuality"
              mandatory
              divided
              density="comfortable"
              variant="outlined"
              color="primary"
              class="w-full"
              @update:model-value="onGlassQualityChange"
            >
              <VBtn value="lightweight" class="flex-1">
                {{ t('theme.transparencyGlassQualityLightweight') }}
              </VBtn>
              <VBtn value="realtime" class="flex-1">
                {{ t('theme.transparencyGlassQualityRealtime') }}
              </VBtn>
            </VBtnToggle>
            <p class="text-caption text-medium-emphasis mt-2 mb-0">
              {{
                transparencyGlassQuality === 'realtime'
                  ? t('theme.transparencyGlassQualityRealtimeHint')
                  : t('theme.transparencyGlassQualityLightweightHint')
              }}
            </p>
          </div>

          <div>
            <span class="text-body-2 d-block mb-2">{{ t('common.preset') }}</span>
            <VBtnGroup density="compact" variant="outlined" class="w-full">
              <VBtn
                size="small"
                :color="currentPresetLevel === 'low' ? 'primary' : undefined"
                @click="adjustTransparency('low')"
                class="flex-1"
              >
                {{ t('theme.transparencyLow') }}
              </VBtn>
              <VBtn
                size="small"
                :color="currentPresetLevel === 'medium' ? 'primary' : undefined"
                @click="adjustTransparency('medium')"
                class="flex-1"
              >
                {{ t('theme.transparencyMedium') }}
              </VBtn>
              <VBtn
                size="small"
                :color="currentPresetLevel === 'high' ? 'primary' : undefined"
                @click="adjustTransparency('high')"
                class="flex-1"
              >
                {{ t('theme.transparencyHigh') }}
              </VBtn>
            </VBtnGroup>
          </div>
        </div>
      </VCardText>
      <VDivider />
      <VCardText class="text-center">
        <VBtn @click="resetTransparencySettings" variant="outlined" class="me-2">
          <template #prepend>
            <VIcon icon="mdi-refresh" />
          </template>
          {{ t('theme.transparencyReset') }}
        </VBtn>
        <VBtn @click="visible = false" color="primary">
          {{ t('common.confirm') }}
        </VBtn>
      </VCardText>
    </VCard>
  </VDialog>
</template>
