<script setup lang="ts">
import {
  cancelGlassPreview,
  commitGlassPreview,
  previewGlassSettings,
  useThemeCustomizer,
  type ThemeCustomizerGlassAppearance,
  type ThemeCustomizerGlassQuality,
} from '@/composables/useThemeCustomizer'
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
const display = useDisplay()
const { settings } = useThemeCustomizer()
const draftAppearance = ref<ThemeCustomizerGlassAppearance>(settings.value.glassAppearance)
const draftQuality = ref<ThemeCustomizerGlassQuality>(settings.value.glassQuality)
const isSaving = ref(false)

const visible = computed({
  get: () => props.modelValue,
  set: value => {
    if (!value) cancelGlassPreview()
    emit('update:modelValue', value)
    if (!value) emit('close')
  },
})

const appearanceOptions: Array<{
  label: string
  value: ThemeCustomizerGlassAppearance
}> = [
  { label: 'theme.glassAppearanceClear', value: 'clear' },
  { label: 'theme.glassAppearanceTinted', value: 'tinted' },
  { label: 'theme.glassAppearanceFrosted', value: 'frosted' },
]

const qualityOptions: Array<{
  label: string
  value: ThemeCustomizerGlassQuality
}> = [
  { label: 'theme.glassQualityCss', value: 'css' },
  { label: 'theme.glassQualityBalanced', value: 'balanced' },
  { label: 'theme.glassQualityHigh', value: 'high' },
]

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

/** 一次提交当前预览，持久化后关闭不会发生视觉回跳。 */
async function saveSettings() {
  if (isSaving.value) return

  isSaving.value = true

  try {
    previewGlassSettings({
      glassAppearance: draftAppearance.value,
      glassQuality: draftQuality.value,
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
  <VDialog v-if="visible" v-model="visible" max-width="28rem" scrollable :fullscreen="display.xs.value">
    <VCard class="glass-settings-dialog">
      <VCardItem class="glass-settings-dialog__header py-3">
        <template #prepend>
          <VAvatar color="primary" variant="tonal" rounded size="40" class="me-2">
            <VIcon icon="mdi-blur-radial" size="22" />
          </VAvatar>
        </template>
        <VCardTitle>
          {{ t('theme.glassSettings') }}
        </VCardTitle>
        <VDialogCloseBtn v-model="visible" />
      </VCardItem>

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
        </section>
      </VCardText>

      <VCardActions class="app-dialog-actions glass-settings-dialog__actions">
        <VSpacer />
        <VBtn
          color="primary"
          variant="flat"
          prepend-icon="mdi-content-save"
          class="px-5"
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
.glass-settings-dialog {
  overflow: hidden;
  max-block-size: calc(100dvh - 2rem);
}

.glass-settings-dialog__header {
  border-block-end: 1px solid rgba(var(--v-theme-on-surface), 0.08);
}

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

.glass-settings-dialog__actions {
  border-block-start: 1px solid rgba(var(--v-theme-on-surface), 0.08);
  padding-block: 0.875rem;
  padding-inline: 1rem;
}

@media (width <= 600px) {
  .glass-settings-dialog {
    block-size: 100dvh;
    max-block-size: 100dvh;
  }

  .glass-settings-dialog__body {
    padding-inline: 18px;
  }

  .glass-settings-dialog__actions {
    padding-block-end: max(0.875rem, calc(env(safe-area-inset-bottom) + 0.75rem));
  }
}
</style>
