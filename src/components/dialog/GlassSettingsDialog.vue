<script setup lang="ts">
import {
  cancelGlassPreview,
  commitGlassPreview,
  previewGlassSettings,
  useThemeCustomizer,
  type ThemeCustomizerGlassAppearance,
  type ThemeCustomizerGlassDynamicsMode,
  type ThemeCustomizerGlassQuality,
} from '@/composables/useThemeCustomizer'
import {
  GLASS_OPTICAL_STRENGTH_MAX,
  GLASS_OPTICAL_STRENGTH_MIN,
  getAvailableGlassOpticalPresets,
  getGlassOpticalPresetKey,
  getGlassOpticalPresetParameters,
  getGlassOpticalPresetParametersWithOverrides,
  normalizeGlassOpticalStrength,
  type GlassOpticalParameters,
  type GlassOpticalPreset,
  type GlassOpticalPresetOverrides,
} from '@/utils/glassOptics'
import { useGlassMobilePresentation } from '@/composables/useGlassPresentationCapabilities'
import { useDisplay } from 'vuetify'
import { useI18n } from 'vue-i18n'

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
const display = useDisplay()
const usesMobilePresentation = useGlassMobilePresentation()
const { settings } = useThemeCustomizer()
const draftAppearance = ref<ThemeCustomizerGlassAppearance>(settings.value.glassAppearance)
const draftDeformationStrength = ref(settings.value.glassDeformationStrength)
const draftDynamicsMode = ref<ThemeCustomizerGlassDynamicsMode>(settings.value.glassDynamicsMode)
const draftFlowStrength = ref(settings.value.glassFlowStrength)
const draftPreset = ref<GlassOpticalPreset>(settings.value.glassPreset)
const draftPresetOverrides = ref<GlassOpticalPresetOverrides>({ ...settings.value.glassPresetOverrides })
const draftQuality = ref<ThemeCustomizerGlassQuality>(settings.value.glassQuality)
const draftReflectionStrength = ref(settings.value.glassReflectionStrength)
const draftTransmissionStrength = ref(settings.value.glassTransmissionStrength)
const draftTranslationStrength = ref(settings.value.glassTranslationStrength)
const draftTransparencyStrength = ref(settings.value.glassTransparencyStrength)
const isSaving = ref(false)
const usesRealtimeOptics = computed(() => draftQuality.value !== 'css')
const showsDynamicsMode = computed(() => usesRealtimeOptics.value && !usesMobilePresentation.value)
const showsDynamicTuning = computed(() => showsDynamicsMode.value && draftDynamicsMode.value !== 'off')
const availablePresets = computed(() => getAvailableGlassOpticalPresets(draftQuality.value))
const activePreset = computed<GlassOpticalPreset>(() =>
  availablePresets.value.includes(draftPreset.value) ? draftPreset.value : 'natural',
)

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
      draftDeformationStrength.value = settings.value.glassDeformationStrength
      draftDynamicsMode.value = settings.value.glassDynamicsMode
      draftFlowStrength.value = settings.value.glassFlowStrength
      draftPreset.value = settings.value.glassPreset
      draftPresetOverrides.value = { ...settings.value.glassPresetOverrides }
      draftQuality.value = settings.value.glassQuality
      draftReflectionStrength.value = settings.value.glassReflectionStrength
      draftTransmissionStrength.value = settings.value.glassTransmissionStrength
      draftTranslationStrength.value = settings.value.glassTranslationStrength
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
const qualityHint = computed(() => {
  if (usesMobilePresentation.value && draftQuality.value !== 'css') return 'theme.glassQualityMobileHint'

  return qualityOptions.find(option => option.value === draftQuality.value)?.hint ?? ''
})
const presetOptions: Array<{ label: string; value: GlassOpticalPreset }> = [
  { label: 'theme.glassPresetNatural', value: 'natural' },
  { label: 'theme.glassPresetGlide', value: 'glide' },
  { label: 'theme.glassPresetLiquid', value: 'liquid' },
]
const visiblePresetOptions = computed(() =>
  presetOptions.filter(option => availablePresets.value.includes(option.value)),
)
const dynamicsModeOptions: Array<{
  hint: string
  label: string
  value: ThemeCustomizerGlassDynamicsMode
}> = [
  { hint: 'theme.glassDynamicsModeFluidHint', label: 'theme.glassDynamicsModeFluid', value: 'fluid' },
  { hint: 'theme.glassDynamicsModeRippleHint', label: 'theme.glassDynamicsModeRipple', value: 'ripple' },
  { hint: 'theme.glassDynamicsModeOffHint', label: 'theme.glassDynamicsModeOff', value: 'off' },
]
const dynamicsModeHint = computed(
  () => dynamicsModeOptions.find(option => option.value === draftDynamicsMode.value)?.hint ?? '',
)

/** 仅允许已实现的材质进入待保存设置。 */
function updateAppearance(value: unknown) {
  if (value !== 'clear' && value !== 'tinted' && value !== 'frosted') return

  draftAppearance.value = value
  applyPreset(activePreset.value)
}

/** 仅允许面板声明的质量档位进入待保存设置。 */
function updateQuality(value: unknown) {
  const option = qualityOptions.find(item => item.value === value)
  if (!option) return

  draftQuality.value = option.value
  applyPreset(activePreset.value)
}

/** 仅切换动态效果草稿，六个具体参数和预设覆盖保持原值。 */
function updateDynamicsMode(value: unknown) {
  const option = dynamicsModeOptions.find(item => item.value === value)
  if (!option) return

  draftDynamicsMode.value = option.value
  previewDraftParameters()
}

/** 将材质、质量、预设归属与六个具体参数作为一个预览事务同步。 */
function previewDraftParameters() {
  previewGlassSettings({
    glassAppearance: draftAppearance.value,
    glassDeformationStrength: draftDeformationStrength.value,
    glassDynamicsMode: draftDynamicsMode.value,
    glassFlowStrength: draftFlowStrength.value,
    glassPreset: draftPreset.value,
    glassPresetOverrides: draftPresetOverrides.value,
    glassQuality: draftQuality.value,
    glassReflectionStrength: draftReflectionStrength.value,
    glassTransmissionStrength: draftTransmissionStrength.value,
    glassTranslationStrength: draftTranslationStrength.value,
    glassTransparencyStrength: draftTransparencyStrength.value,
  })
}

/** 读取草稿中当前显示的六参数。 */
function getDraftParameters(): GlassOpticalParameters {
  return {
    deformation: draftDeformationStrength.value,
    flow: draftFlowStrength.value,
    reflection: draftReflectionStrength.value,
    transmission: draftTransmissionStrength.value,
    translation: draftTranslationStrength.value,
    transparency: draftTransparencyStrength.value,
  }
}

/** 切换方案时优先恢复该组合的草稿覆盖，没有覆盖才使用矩阵。 */
function applyPreset(value: unknown) {
  if (value !== 'natural' && value !== 'glide' && value !== 'liquid') return
  const effectivePreset = availablePresets.value.includes(value) ? value : 'natural'
  const parameters = getGlassOpticalPresetParametersWithOverrides(
    draftAppearance.value,
    draftQuality.value,
    effectivePreset,
    draftPresetOverrides.value,
  )
  draftPreset.value = effectivePreset
  draftDeformationStrength.value = parameters.deformation
  draftFlowStrength.value = parameters.flow
  draftReflectionStrength.value = parameters.reflection
  draftTransmissionStrength.value = parameters.transmission
  draftTranslationStrength.value = parameters.translation
  draftTransparencyStrength.value = parameters.transparency
  previewDraftParameters()
}

/** 用调整后的当前六参数覆盖当前材质、质量与方案组合。 */
function updateDraftPresetOverride() {
  const key = getGlassOpticalPresetKey(draftAppearance.value, draftQuality.value, draftPreset.value)
  draftPresetOverrides.value = {
    ...draftPresetOverrides.value,
    [key]: getDraftParameters(),
  }
  previewDraftParameters()
}

/** 将采样平移限制为 renderer 支持的稳定范围。 */
function updateTranslationStrength(value: unknown) {
  draftTranslationStrength.value = normalizeGlassOpticalStrength(Array.isArray(value) ? value[0] : value)
  updateDraftPresetOverride()
}

/** 将局部形变限制为质量档软上限所消费的用户范围。 */
function updateDeformationStrength(value: unknown) {
  draftDeformationStrength.value = normalizeGlassOpticalStrength(Array.isArray(value) ? value[0] : value)
  updateDraftPresetOverride()
}

/** 将尾波、惯性与收敛输入限制为 renderer 的稳定范围。 */
function updateFlowStrength(value: unknown) {
  draftFlowStrength.value = normalizeGlassOpticalStrength(Array.isArray(value) ? value[0] : value)
  updateDraftPresetOverride()
}

/** 将滑杆输入限制为 renderer 的稳定范围并即时预览反射亮度。 */
function updateReflectionStrength(value: unknown) {
  draftReflectionStrength.value = normalizeGlassOpticalStrength(Array.isArray(value) ? value[0] : value)
  updateDraftPresetOverride()
}

/** 将透射亮度限制为稳定范围并即时调整卡片内部壁纸的明暗。 */
function updateTransmissionStrength(value: unknown) {
  draftTransmissionStrength.value = normalizeGlassOpticalStrength(Array.isArray(value) ? value[0] : value)
  updateDraftPresetOverride()
}

/** 将通透度限制为稳定范围并即时调整材质与真实壁纸的占比。 */
function updateTransparencyStrength(value: unknown) {
  draftTransparencyStrength.value = normalizeGlassOpticalStrength(Array.isArray(value) ? value[0] : value)
  updateDraftPresetOverride()
}

/** 删除当前组合覆盖并恢复该方案矩阵，不影响其他组合。 */
function resetSettings() {
  const key = getGlassOpticalPresetKey(draftAppearance.value, draftQuality.value, draftPreset.value)
  const nextOverrides = { ...draftPresetOverrides.value }
  delete nextOverrides[key]
  draftPresetOverrides.value = nextOverrides
  const parameters = getGlassOpticalPresetParameters(draftAppearance.value, draftQuality.value, draftPreset.value)
  draftDeformationStrength.value = parameters.deformation
  draftFlowStrength.value = parameters.flow
  draftReflectionStrength.value = parameters.reflection
  draftTransmissionStrength.value = parameters.transmission
  draftTranslationStrength.value = parameters.translation
  draftTransparencyStrength.value = parameters.transparency
  previewDraftParameters()
}

/** 一次提交当前预览，持久化后关闭不会发生视觉回跳。 */
async function saveSettings() {
  if (isSaving.value) return

  isSaving.value = true

  try {
    previewGlassSettings({
      glassAppearance: draftAppearance.value,
      glassDeformationStrength: draftDeformationStrength.value,
      glassDynamicsMode: draftDynamicsMode.value,
      glassFlowStrength: draftFlowStrength.value,
      glassPreset: draftPreset.value,
      glassPresetOverrides: draftPresetOverrides.value,
      glassQuality: draftQuality.value,
      glassReflectionStrength: draftReflectionStrength.value,
      glassTransmissionStrength: draftTransmissionStrength.value,
      glassTranslationStrength: draftTranslationStrength.value,
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
  <VDialog
    v-if="visible"
    v-model="visible"
    width="100%"
    max-width="30rem"
    scrollable
    :fullscreen="display.smAndDown.value"
  >
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
          <p class="glass-settings-dialog__hint">{{ t('theme.glassAppearanceHint') }}</p>
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

        <section v-if="usesRealtimeOptics">
          <div class="glass-settings-dialog__preset-header">
            <h3 class="glass-settings-dialog__label">{{ t('theme.glassPreset') }}</h3>
          </div>
          <VBtnToggle
            :model-value="activePreset"
            mandatory
            color="primary"
            variant="text"
            class="glass-settings-dialog__preset"
            @update:model-value="applyPreset"
          >
            <VBtn
              v-for="option in visiblePresetOptions"
              :key="option.value"
              :value="option.value"
              class="glass-settings-dialog__preset-option"
            >
              {{ t(option.label) }}
            </VBtn>
          </VBtnToggle>
          <p class="glass-settings-dialog__hint">{{ t('theme.glassPresetHint') }}</p>
        </section>

        <section v-if="showsDynamicsMode" class="glass-settings-dialog__dynamics-mode-section">
          <h3 class="glass-settings-dialog__label">{{ t('theme.glassDynamicsMode') }}</h3>
          <VBtnToggle
            :model-value="draftDynamicsMode"
            mandatory
            color="primary"
            variant="text"
            class="glass-settings-dialog__dynamics-mode"
            @update:model-value="updateDynamicsMode"
          >
            <VBtn
              v-for="option in dynamicsModeOptions"
              :key="option.value"
              :value="option.value"
              class="glass-settings-dialog__dynamics-mode-option"
            >
              {{ t(option.label) }}
            </VBtn>
          </VBtnToggle>
          <p class="glass-settings-dialog__hint">{{ t(dynamicsModeHint) }}</p>
        </section>

        <section class="glass-settings-dialog__tuning">
          <h3 class="glass-settings-dialog__group-label">{{ t('theme.glassMaterialTuning') }}</h3>
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

          <div class="glass-settings-dialog__slider-header glass-settings-dialog__slider-header--spaced">
            <h3 class="glass-settings-dialog__label">{{ t('theme.glassTransmissionStrength') }}</h3>
            <output>{{ draftTransmissionStrength }}%</output>
          </div>
          <VSlider
            :model-value="draftTransmissionStrength"
            :aria-label="t('theme.glassTransmissionStrength')"
            :min="GLASS_OPTICAL_STRENGTH_MIN"
            :max="GLASS_OPTICAL_STRENGTH_MAX"
            :step="1"
            color="primary"
            density="comfortable"
            hide-details
            thumb-label
            @update:model-value="updateTransmissionStrength"
          />

          <div class="glass-settings-dialog__slider-header glass-settings-dialog__slider-header--spaced">
            <h3 class="glass-settings-dialog__label">{{ t('theme.glassReflectionStrength') }}</h3>
            <output>{{ draftReflectionStrength }}%</output>
          </div>
          <VSlider
            :model-value="draftReflectionStrength"
            :aria-label="t('theme.glassReflectionStrength')"
            :min="GLASS_OPTICAL_STRENGTH_MIN"
            :max="GLASS_OPTICAL_STRENGTH_MAX"
            :step="1"
            color="primary"
            density="comfortable"
            hide-details
            thumb-label
            @update:model-value="updateReflectionStrength"
          />
          <p class="glass-settings-dialog__hint">
            {{ t('theme.glassMaterialStrengthHint') }}
          </p>

          <div v-if="showsDynamicTuning" class="glass-settings-dialog__live-controls">
            <h3 class="glass-settings-dialog__group-label">{{ t('theme.glassDynamicTuning') }}</h3>
            <div class="glass-settings-dialog__slider-header">
              <h3 class="glass-settings-dialog__label">{{ t('theme.glassTranslationStrength') }}</h3>
              <output>{{ draftTranslationStrength }}%</output>
            </div>
            <VSlider
              :model-value="draftTranslationStrength"
              :aria-label="t('theme.glassTranslationStrength')"
              :min="GLASS_OPTICAL_STRENGTH_MIN"
              :max="GLASS_OPTICAL_STRENGTH_MAX"
              :step="1"
              color="primary"
              density="comfortable"
              hide-details
              thumb-label
              @update:model-value="updateTranslationStrength"
            />

            <div class="glass-settings-dialog__slider-header glass-settings-dialog__slider-header--spaced">
              <h3 class="glass-settings-dialog__label">{{ t('theme.glassDeformationStrength') }}</h3>
              <output>{{ draftDeformationStrength }}%</output>
            </div>
            <VSlider
              :model-value="draftDeformationStrength"
              :aria-label="t('theme.glassDeformationStrength')"
              :min="GLASS_OPTICAL_STRENGTH_MIN"
              :max="GLASS_OPTICAL_STRENGTH_MAX"
              :step="1"
              color="primary"
              density="comfortable"
              hide-details
              thumb-label
              @update:model-value="updateDeformationStrength"
            />

            <div class="glass-settings-dialog__slider-header glass-settings-dialog__slider-header--spaced">
              <h3 class="glass-settings-dialog__label">{{ t('theme.glassFlowStrength') }}</h3>
              <output>{{ draftFlowStrength }}%</output>
            </div>
            <VSlider
              :model-value="draftFlowStrength"
              :aria-label="t('theme.glassFlowStrength')"
              :min="GLASS_OPTICAL_STRENGTH_MIN"
              :max="GLASS_OPTICAL_STRENGTH_MAX"
              :step="1"
              color="primary"
              density="comfortable"
              hide-details
              thumb-label
              @update:model-value="updateFlowStrength"
            />
            <p class="glass-settings-dialog__hint">
              {{ t('theme.glassOpticalStrengthHint') }}
            </p>
          </div>
        </section>
      </VCardText>

      <VDivider />
      <VCardActions class="glass-settings-dialog__actions justify-center">
        <VBtn :slim="false" variant="outlined" prepend-icon="mdi-refresh" class="me-2" @click="resetSettings">
          {{ t('common.reset') }}
        </VBtn>
        <VBtn
          :slim="false"
          color="primary"
          variant="elevated"
          prepend-icon="mdi-content-save"
          :loading="isSaving"
          @click="saveSettings"
        >
          {{ t('common.save') }}
        </VBtn>
      </VCardActions>
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

.glass-settings-dialog__actions {
  flex: none;
  padding: 16px 24px;
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

.glass-settings-dialog__group-label {
  margin: 0 0 14px;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 0.75rem;
  font-weight: 600;
  line-height: 1.4;
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
  border-block-start: 1px solid rgba(var(--v-theme-on-surface), 0.1);
  margin-block-start: 24px;
  padding-block-start: 20px;

  :deep(.v-slider) {
    margin-block-start: 4px;
  }
}

.glass-settings-dialog__preset-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;

  .glass-settings-dialog__label {
    margin-block-end: 0;
  }
}

.glass-settings-dialog__appearance,
.glass-settings-dialog__dynamics-mode,
.glass-settings-dialog__quality,
.glass-settings-dialog__preset {
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

.glass-settings-dialog__dynamics-mode {
  block-size: 42px !important;
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.glass-settings-dialog__quality {
  block-size: 42px !important;
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.glass-settings-dialog__preset {
  block-size: 42px !important;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  margin-block-start: 10px;
}

.glass-settings-dialog__appearance-option {
  block-size: 32px !important;
  inline-size: 100%;
  letter-spacing: 0;
}

.glass-settings-dialog__appearance-option,
.glass-settings-dialog__dynamics-mode-option,
.glass-settings-dialog__quality-option,
.glass-settings-dialog__preset-option {
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

.glass-settings-dialog__dynamics-mode-option {
  block-size: 32px !important;
}

.glass-settings-dialog__preset-option {
  block-size: 32px !important;
}

.glass-settings-dialog__appearance-option:deep(.v-btn--active),
.glass-settings-dialog__dynamics-mode-option:deep(.v-btn--active),
.glass-settings-dialog__quality-option:deep(.v-btn--active),
.glass-settings-dialog__preset-option:deep(.v-btn--active) {
  background-color: rgba(var(--v-theme-primary), 0.14) !important;
  box-shadow: inset 0 0 0 1px rgba(var(--v-theme-primary), 0.38) !important;
}
</style>
