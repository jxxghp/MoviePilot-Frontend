<script setup lang="ts">
import {
  cancelGlassPreview,
  commitGlassPreview,
  previewGlassSettings,
  useThemeCustomizer,
  type ThemeCustomizerGlassAppearance,
  type ThemeCustomizerGlassQuality,
} from '@/composables/useThemeCustomizer'
import {
  GLASS_OPTICAL_STRENGTH_DEFAULT,
  GLASS_OPTICAL_STRENGTH_MAX,
  GLASS_OPTICAL_STRENGTH_MIN,
  normalizeGlassOpticalStrength,
} from '@/utils/glassOptics'
import { useI18n } from 'vue-i18n'
import { useDisplay } from 'vuetify'

const props = withDefaults(
  defineProps<{
    modelValue?: boolean
  }>(),
  {
    modelValue: true,
  },
)

const emit = defineEmits<{
  (event: 'close'): void
  (event: 'update:modelValue', value: boolean): void
}>()

const { t } = useI18n()
const { mdAndUp } = useDisplay()
const { settings } = useThemeCustomizer()
const draftAppearance = ref<ThemeCustomizerGlassAppearance>(settings.value.glassAppearance)
const draftMotionStrength = ref(settings.value.glassMotionStrength)
const draftQuality = ref<ThemeCustomizerGlassQuality>(settings.value.glassQuality)
const draftReflectionStrength = ref(settings.value.glassReflectionStrength)
const draftTransparencyStrength = ref(settings.value.glassTransparencyStrength)
const isSaving = ref(false)
const usesRealtimeOptics = computed(() => draftQuality.value !== 'css')
const showsMotionTuning = computed(() => mdAndUp.value)

const visible = computed({
  get: () => props.modelValue,
  set: value => {
    if (!value) cancelGlassPreview()
    emit('update:modelValue', value)
    if (!value) emit('close')
  },
})

/** 父级控制弹窗生命周期时，同步结束旧预览并重建持久化草稿。 */
watch(
  () => props.modelValue,
  (value, previous) => {
    if (value) {
      draftAppearance.value = settings.value.glassAppearance
      draftMotionStrength.value = settings.value.glassMotionStrength
      draftQuality.value = settings.value.glassQuality
      draftReflectionStrength.value = settings.value.glassReflectionStrength
      draftTransparencyStrength.value = settings.value.glassTransparencyStrength
    } else if (previous) {
      cancelGlassPreview()
    }
  },
)

const appearanceOptions: Array<{
  label: string
  value: ThemeCustomizerGlassAppearance
}> = [
  { label: 'theme.glassAppearanceClear', value: 'clear' },
  { label: 'theme.glassAppearanceTinted', value: 'tinted' },
  { label: 'theme.glassAppearanceFrosted', value: 'frosted' },
]

const qualityOptions: Array<{
  hint: string
  label: string
  value: ThemeCustomizerGlassQuality
}> = [
  { hint: 'theme.glassQualityCssHint', label: 'theme.glassQualityCss', value: 'css' },
  { hint: 'theme.glassQualityBalancedHint', label: 'theme.glassQualityBalanced', value: 'balanced' },
  { hint: 'theme.glassQualityHighHint', label: 'theme.glassQualityHigh', value: 'high' },
]
const qualityHint = computed(() =>
  showsMotionTuning.value
    ? (qualityOptions.find(option => option.value === draftQuality.value)?.hint ?? '')
    : 'theme.glassQualityMobileHint',
)

/** 仅允许已实现的材质进入待保存设置。 */
function updateAppearance(value: unknown) {
  if (value !== 'clear' && value !== 'tinted' && value !== 'frosted') return

  draftAppearance.value = value
  previewGlassSettings({ glassAppearance: value })
}

/** 仅允许面板声明的质量档位进入待保存设置。 */
function updateQuality(value: unknown) {
  const option = qualityOptions.find(item => item.value === value)
  if (!option) return

  draftQuality.value = option.value
  previewGlassSettings({ glassQuality: option.value })
}

/** 将滑杆输入限制为 renderer 的稳定范围并即时预览流动强度。 */
function updateMotionStrength(value: unknown) {
  draftMotionStrength.value = normalizeGlassOpticalStrength(Array.isArray(value) ? value[0] : value)
  previewGlassSettings({ glassMotionStrength: draftMotionStrength.value })
}

/** 将滑杆输入限制为 renderer 的稳定范围并即时预览反射亮度。 */
function updateReflectionStrength(value: unknown) {
  draftReflectionStrength.value = normalizeGlassOpticalStrength(Array.isArray(value) ? value[0] : value)
  previewGlassSettings({ glassReflectionStrength: draftReflectionStrength.value })
}

/** 将通透度限制为稳定范围并即时调整材质与真实壁纸的占比。 */
function updateTransparencyStrength(value: unknown) {
  draftTransparencyStrength.value = normalizeGlassOpticalStrength(Array.isArray(value) ? value[0] : value)
  previewGlassSettings({ glassTransparencyStrength: draftTransparencyStrength.value })
}

/** 将当前草稿恢复为玻璃主题默认值并立即预览。 */
function resetSettings() {
  draftAppearance.value = 'clear'
  draftMotionStrength.value = GLASS_OPTICAL_STRENGTH_DEFAULT
  draftQuality.value = 'balanced'
  draftReflectionStrength.value = GLASS_OPTICAL_STRENGTH_DEFAULT
  draftTransparencyStrength.value = GLASS_OPTICAL_STRENGTH_DEFAULT
  previewGlassSettings({
    glassAppearance: draftAppearance.value,
    glassMotionStrength: draftMotionStrength.value,
    glassQuality: draftQuality.value,
    glassReflectionStrength: draftReflectionStrength.value,
    glassTransparencyStrength: draftTransparencyStrength.value,
  })
}

/** 一次提交当前预览，持久化后关闭不会发生视觉回跳。 */
async function saveSettings() {
  if (isSaving.value) return

  isSaving.value = true

  try {
    previewGlassSettings({
      glassAppearance: draftAppearance.value,
      glassMotionStrength: draftMotionStrength.value,
      glassQuality: draftQuality.value,
      glassReflectionStrength: draftReflectionStrength.value,
      glassTransparencyStrength: draftTransparencyStrength.value,
    })
    commitGlassPreview()
    visible.value = false
  } finally {
    isSaving.value = false
  }
}

// 弹窗的任意未保存销毁路径都应恢复持久化快照。
onScopeDispose(cancelGlassPreview)
</script>

<template>
  <VDialog v-if="visible" v-model="visible" width="100%" max-width="30rem" scrollable>
    <VCard>
      <VCardItem>
        <VCardTitle>
          <VIcon icon="mdi-blur-radial" class="me-2" />
          {{ t('theme.glassSettings') }}
        </VCardTitle>
        <VDialogCloseBtn v-model="visible" />
      </VCardItem>
      <VDivider />

      <VCardText class="glass-settings-dialog__body">
        <section>
          <h3 class="glass-settings-dialog__label">{{ t('theme.glassAppearance') }}</h3>
          <VBtnToggle
            :model-value="draftAppearance"
            mandatory
            color="primary"
            variant="text"
            class="glass-settings-dialog__appearance"
            @update:model-value="updateAppearance"
          >
            <VBtn
              v-for="option in appearanceOptions"
              :key="option.value"
              :value="option.value"
              class="glass-settings-dialog__appearance-option"
            >
              {{ t(option.label) }}
            </VBtn>
          </VBtnToggle>
        </section>

        <section>
          <h3 class="glass-settings-dialog__label">{{ t('theme.glassQuality') }}</h3>
          <VBtnToggle
            :model-value="draftQuality"
            mandatory
            color="primary"
            variant="text"
            class="glass-settings-dialog__quality"
            @update:model-value="updateQuality"
          >
            <VBtn
              v-for="option in qualityOptions"
              :key="option.value"
              :value="option.value"
              class="glass-settings-dialog__quality-option"
            >
              {{ t(option.label) }}
            </VBtn>
          </VBtnToggle>
          <p class="glass-settings-dialog__hint">{{ t(qualityHint) }}</p>
        </section>

        <section class="glass-settings-dialog__tuning">
          <div class="glass-settings-dialog__slider-header">
            <h3 class="glass-settings-dialog__label">{{ t('theme.glassTransparencyStrength') }}</h3>
            <output>{{ draftTransparencyStrength }}%</output>
          </div>
          <VSlider
            :model-value="draftTransparencyStrength"
            :aria-label="t('theme.glassTransparencyStrength')"
            :min="GLASS_OPTICAL_STRENGTH_MIN"
            :max="GLASS_OPTICAL_STRENGTH_MAX"
            :step="1"
            color="primary"
            density="comfortable"
            hide-details
            thumb-label
            @update:model-value="updateTransparencyStrength"
          />

          <div class="glass-settings-dialog__live-controls" :class="{ 'is-disabled': !usesRealtimeOptics }">
            <template v-if="showsMotionTuning">
              <div class="glass-settings-dialog__slider-header">
                <h3 class="glass-settings-dialog__label">{{ t('theme.glassMotionStrength') }}</h3>
                <output>{{ draftMotionStrength }}%</output>
              </div>
              <VSlider
                :model-value="draftMotionStrength"
                :aria-label="t('theme.glassMotionStrength')"
                :disabled="!usesRealtimeOptics"
                :min="GLASS_OPTICAL_STRENGTH_MIN"
                :max="GLASS_OPTICAL_STRENGTH_MAX"
                :step="1"
                color="primary"
                density="comfortable"
                hide-details
                thumb-label
                @update:model-value="updateMotionStrength"
              />
            </template>

            <div
              class="glass-settings-dialog__slider-header"
              :class="{ 'glass-settings-dialog__slider-header--spaced': showsMotionTuning }"
            >
              <h3 class="glass-settings-dialog__label">{{ t('theme.glassReflectionStrength') }}</h3>
              <output>{{ draftReflectionStrength }}%</output>
            </div>
            <VSlider
              :model-value="draftReflectionStrength"
              :aria-label="t('theme.glassReflectionStrength')"
              :disabled="!usesRealtimeOptics"
              :min="GLASS_OPTICAL_STRENGTH_MIN"
              :max="GLASS_OPTICAL_STRENGTH_MAX"
              :step="1"
              color="primary"
              density="comfortable"
              hide-details
              thumb-label
              @update:model-value="updateReflectionStrength"
            />
          </div>
          <p v-if="showsMotionTuning" class="glass-settings-dialog__hint">
            {{ t(usesRealtimeOptics ? 'theme.glassOpticalStrengthHint' : 'theme.glassOpticalStrengthUnavailableHint') }}
          </p>
        </section>
      </VCardText>

      <VDivider />
      <VCardText class="text-center">
        <VBtn variant="outlined" prepend-icon="mdi-refresh" class="me-2" @click="resetSettings">
          {{ t('common.reset') }}
        </VBtn>
        <VBtn color="primary" prepend-icon="mdi-content-save" :loading="isSaving" @click="saveSettings">
          {{ t('common.save') }}
        </VBtn>
      </VCardText>
    </VCard>
  </VDialog>
</template>

<style scoped lang="scss">
.glass-settings-dialog__body {
  display: grid;
  align-content: start;
  gap: 24px;
  grid-auto-rows: max-content;
  padding: 20px 24px 24px;
}

.glass-settings-dialog__label {
  margin: 0 0 10px;
  color: rgba(var(--v-theme-on-surface), var(--v-high-emphasis-opacity));
  font-size: 0.8125rem;
  font-weight: 600;
  line-height: 1.4;
}

.glass-settings-dialog__hint {
  margin: 8px 0 0;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 0.75rem;
  line-height: 1.45;
}

.glass-settings-dialog__slider-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;

  .glass-settings-dialog__label {
    margin-block-end: 0;
  }

  output {
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
    font-size: 0.75rem;
    font-variant-numeric: tabular-nums;
  }
}

.glass-settings-dialog__slider-header--spaced,
.glass-settings-dialog__slider-header + .glass-settings-dialog__slider-header {
  margin-block-start: 18px;
}

.glass-settings-dialog__live-controls {
  margin-block-start: 18px;
  transition: opacity 160ms ease;

  &.is-disabled {
    opacity: 0.58;
  }

  :deep(.v-slider) {
    margin-block-start: 4px;
  }
}

.glass-settings-dialog__appearance,
.glass-settings-dialog__quality {
  display: grid;
  overflow: hidden;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.12);
  border-radius: 10px;
  background: rgba(var(--v-theme-on-surface), 0.035);
  gap: 4px;
  inline-size: 100%;
  padding: 4px;
}

.glass-settings-dialog__appearance {
  block-size: 42px !important;
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.glass-settings-dialog__quality {
  block-size: 42px !important;
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.glass-settings-dialog__appearance-option {
  block-size: 32px !important;
  inline-size: 100%;
  letter-spacing: 0;
}

.glass-settings-dialog__appearance-option,
.glass-settings-dialog__quality-option {
  border: 0 !important;
  border-radius: 7px !important;
  box-shadow: none !important;
  min-inline-size: 0;
  inline-size: 100%;
  letter-spacing: 0;
  padding-inline: 8px;
}

.glass-settings-dialog__quality-option {
  block-size: 32px !important;
}

.glass-settings-dialog__appearance-option:deep(.v-btn--active),
.glass-settings-dialog__quality-option:deep(.v-btn--active) {
  background-color: rgba(var(--v-theme-primary), 0.14) !important;
  box-shadow: inset 0 0 0 1px rgba(var(--v-theme-primary), 0.38) !important;
}
</style>
