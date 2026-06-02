<script setup lang="ts">
import {
  themeCustomizerPrimaryColors,
  useThemeCustomizer,
  type ThemeCustomizerLayout,
  type ThemeCustomizerSkin,
  type ThemeCustomizerTheme,
} from '@/composables/useThemeCustomizer'
import { usePWA } from '@/composables/usePWA'
import { useI18n } from 'vue-i18n'
import { useTheme } from 'vuetify'
import { VDialog, VNavigationDrawer } from 'vuetify/components'
import { useDisplay } from 'vuetify'

const props = withDefaults(
  defineProps<{
    modelValue?: boolean
  }>(),
  {
    modelValue: false,
  },
)

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()

const customColorInput = ref<HTMLInputElement | null>(null)

const { isCustomized, resetSettings, setLayout, setPrimaryColor, setSemiDarkMenu, setSkin, setTheme, settings } =
  useThemeCustomizer()
const { appMode } = usePWA()
const { t } = useI18n()
const { global: globalTheme } = useTheme()
const display = useDisplay()
const defaultPrimaryColor = themeCustomizerPrimaryColors[0].value

const drawer = computed({
  get: () => props.modelValue,
  set: value => emit('update:modelValue', value),
})

const customizerContainer = computed(() => (appMode.value ? VDialog : VNavigationDrawer))

const customizerContainerProps = computed(() => {
  if (appMode.value && display.mdAndDown.value) {
    return {
      class: 'theme-customizer-dialog-overlay',
      scrim: true,
      fullscreen: !display.mdAndUp.value,
      scrollable: true,
    }
  }

  return {
    class: 'theme-customizer-drawer',
    location: 'right' as const,
    scrim: false,
    temporary: true,
    width: 420,
    persistent: false,
  }
})

const themeOptions = computed<Array<{ icon: string; title: string; value: ThemeCustomizerTheme }>>(() => [
  { title: t('theme.light'), value: 'light', icon: 'mdi-white-balance-sunny' },
  { title: t('theme.dark'), value: 'dark', icon: 'mdi-weather-night' },
  { title: t('theme.auto'), value: 'auto', icon: 'mdi-monitor' },
  { title: t('theme.purple'), value: 'purple', icon: 'mdi-theme-light-dark' },
  { title: t('theme.transparent'), value: 'transparent', icon: 'mdi-blur' },
])

const skinOptions = computed<Array<{ title: string; value: ThemeCustomizerSkin }>>(() => [
  { title: t('theme.customizer.skinDefault'), value: 'default' },
  { title: t('theme.customizer.skinBordered'), value: 'bordered' },
])

const layoutOptions = computed<Array<{ icon: string; title: string; value: ThemeCustomizerLayout }>>(() => [
  { title: t('theme.customizer.layoutVertical'), value: 'vertical', icon: 'mdi-dock-left' },
  { title: t('theme.customizer.layoutCollapsed'), value: 'collapsed', icon: 'mdi-dock-window' },
  { title: t('theme.customizer.layoutHorizontal'), value: 'horizontal', icon: 'mdi-dock-top' },
])

const showLayoutSection = computed(() => !appMode.value)

const hasAppModeCustomization = computed(() => {
  return (
    settings.value.primaryColor !== defaultPrimaryColor ||
    settings.value.skin !== 'default' ||
    settings.value.theme !== 'auto'
  )
})

const showResetBadge = computed(() => (appMode.value ? hasAppModeCustomization.value : isCustomized.value))

const showSemiDarkMenuOption = computed(() => {
  return (
    !appMode.value &&
    !globalTheme.current.value.dark &&
    (settings.value.layout === 'vertical' || settings.value.layout === 'collapsed')
  )
})

function openColorPicker() {
  customColorInput.value?.click()
}

function handleCustomColorInput(event: Event) {
  const color = (event.target as HTMLInputElement).value

  setPrimaryColor(color)
}

function handleLayoutChange(layout: ThemeCustomizerLayout) {
  // App 模式固定使用移动端导航，避免切换桌面布局后破坏底部导航体验。
  if (appMode.value) return

  setLayout(layout)
}

async function handleResetSettings() {
  if (!appMode.value) {
    await resetSettings()

    return
  }

  // App 模式共享定制器，但保留桌面导航相关偏好，只重置 App 侧可调整的外观设置。
  await setPrimaryColor(defaultPrimaryColor)
  await setSkin('default')
  await setTheme('auto')
}
</script>

<template>
  <component :is="customizerContainer" v-model="drawer" v-bind="customizerContainerProps">
    <div class="theme-customizer-panel" :class="{ 'theme-customizer-panel--dialog': appMode }">
      <div class="theme-customizer-header py-5 px-4">
        <div>
          <h2 class="theme-customizer-title">{{ t('theme.customizer.title') }}</h2>
        </div>
        <div class="theme-customizer-header-actions">
          <VBadge color="error" dot :model-value="showResetBadge" location="top end" offset-x="2" offset-y="2">
            <IconBtn
              class="theme-customizer-header-icon-btn"
              :aria-label="t('theme.customizer.reset')"
              @click="handleResetSettings"
            >
              <VIcon class="theme-customizer-header-icon" icon="mdi-refresh" />
            </IconBtn>
          </VBadge>
          <IconBtn class="theme-customizer-header-icon-btn" :aria-label="t('common.close')" @click="drawer = false">
            <VIcon class="theme-customizer-header-icon" icon="mdi-close" />
          </IconBtn>
        </div>
      </div>

      <VDivider />

      <PerfectScrollbar class="theme-customizer-body" :options="{ wheelPropagation: false }">
        <section class="theme-customizer-section">
          <span class="theme-customizer-chip">{{ t('theme.customizer.theming') }}</span>

          <h3 class="theme-customizer-section-title">{{ t('theme.customizer.primaryColor') }}</h3>
          <div class="theme-customizer-color-grid">
            <div
              v-for="color in themeCustomizerPrimaryColors"
              :key="color.value"
              class="theme-customizer-color-option"
              :class="{ 'is-active': settings.primaryColor === color.value }"
              :aria-label="t('theme.customizer.usePrimaryColor', { color: color.name })"
              @click="setPrimaryColor(color.value)"
            >
              <span class="theme-customizer-color-swatch" :style="{ backgroundColor: color.value }" />
            </div>

            <div
              v-if="!appMode"
              class="theme-customizer-color-option theme-customizer-color-option--picker"
              :class="{
                'is-active': !themeCustomizerPrimaryColors.some(color => color.value === settings.primaryColor),
              }"
              :aria-label="t('theme.customizer.chooseCustomColor')"
              @click="openColorPicker"
            >
              <VIcon class="theme-customizer-native-icon" icon="mdi-palette-outline" size="30" />
              <input
                ref="customColorInput"
                class="theme-customizer-native-color"
                type="color"
                :value="settings.primaryColor"
                @input="handleCustomColorInput"
              />
            </div>
          </div>

          <h3 class="theme-customizer-section-title">{{ t('common.theme') }}</h3>
          <div class="theme-customizer-option-grid theme-customizer-option-grid--theme">
            <div
              v-for="theme in themeOptions"
              :key="theme.value"
              class="theme-customizer-card-option"
              :class="{ 'is-active': settings.theme === theme.value }"
              @click="setTheme(theme.value)"
            >
              <VIcon class="theme-customizer-theme-icon" :icon="theme.icon" size="36" />
              <span>{{ theme.title }}</span>
            </div>
          </div>

          <h3 class="theme-customizer-section-title">{{ t('theme.customizer.skins') }}</h3>
          <div class="theme-customizer-preview-grid theme-customizer-preview-grid--skins">
            <div
              v-for="skin in skinOptions"
              :key="skin.value"
              class="theme-customizer-preview-option"
              :class="{ 'is-active': settings.skin === skin.value }"
              @click="setSkin(skin.value)"
            >
              <span class="theme-customizer-mini-layout" :class="`theme-customizer-mini-layout--${skin.value}`">
                <span class="mini-sidebar">
                  <i />
                  <i />
                  <i />
                  <i />
                </span>
                <span class="mini-content">
                  <i />
                  <i />
                  <i />
                </span>
              </span>
              <span>{{ skin.title }}</span>
            </div>
          </div>

          <div v-if="showSemiDarkMenuOption" class="theme-customizer-semi-dark">
            <span>{{ t('theme.customizer.semiDarkMenu') }}</span>
            <VSwitch
              :model-value="settings.semiDarkMenu"
              color="primary"
              inset
              hide-details
              @update:model-value="setSemiDarkMenu(Boolean($event))"
            />
          </div>
        </section>

        <VDivider v-if="showLayoutSection" />

        <section v-if="showLayoutSection" class="theme-customizer-section">
          <span class="theme-customizer-chip">{{ t('theme.customizer.layout') }}</span>

          <h3 class="theme-customizer-section-title"></h3>
          <div class="theme-customizer-preview-grid">
            <div
              v-for="layout in layoutOptions"
              :key="layout.value"
              class="theme-customizer-preview-option"
              :class="{ 'is-active': settings.layout === layout.value, 'is-disabled': appMode }"
              @click="handleLayoutChange(layout.value)"
            >
              <span class="theme-customizer-mini-layout" :class="`theme-customizer-mini-layout--${layout.value}`">
                <span class="mini-sidebar">
                  <i />
                  <i />
                  <i />
                </span>
                <span class="mini-content">
                  <i />
                  <i />
                  <i />
                </span>
              </span>
              <span>{{ layout.title }}</span>
            </div>
          </div>
        </section>
      </PerfectScrollbar>
    </div>
  </component>
</template>

<style lang="scss">
/* stylelint-disable no-descending-specificity */

.theme-customizer-drawer {
  position: fixed !important;
  z-index: 12000 !important;
  block-size: 100dvh !important;
  border-inline-start: 1px solid rgba(var(--v-theme-on-surface), 0.08) !important;
  box-shadow: -2px 0 6px rgba(0, 0, 0, 10%) !important;
  inset-block: 0 !important;
  inset-inline-end: 0 !important;
  max-block-size: 100dvh !important;

  .v-navigation-drawer__content {
    display: flex;
    overflow: hidden;
    flex-direction: column;
    block-size: 100%;
  }
}

.theme-customizer-dialog-overlay {
  z-index: 12000 !important;
}

.theme-customizer-panel {
  display: flex;
  flex-direction: column;
  block-size: 100%;
  min-block-size: 0;
}

.theme-customizer-panel--dialog {
  overflow: hidden;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.08);
  border-radius: 16px;
  background: rgb(var(--v-theme-surface));
  block-size: 100dvh;
}

.theme-customizer-panel--dialog .theme-customizer-body {
  block-size: calc(100dvh - 80px - env(safe-area-inset-bottom) - env(safe-area-inset-top));
}

.theme-customizer-drawer.v-theme--transparent,
.v-theme--transparent .theme-customizer-drawer,
html[data-theme='transparent'] .theme-customizer-drawer,
.v-theme--transparent .theme-customizer-panel--dialog,
html[data-theme='transparent'] .theme-customizer-panel--dialog {
  backdrop-filter: blur(var(--transparent-blur-heavy, 16px));
  background-color: rgba(var(--v-theme-surface), var(--transparent-opacity-heavy, 0.5)) !important;
}

// 透明主题的全局 overlay 毛玻璃会影响临时抽屉绘制，主题定制器改由 drawer 自身承担背景。
html[data-theme='transparent'] .v-overlay__content:has(.theme-customizer-drawer),
.v-theme--transparent .v-overlay__content:has(.theme-customizer-drawer),
html[data-theme='transparent'] .v-overlay__content:has(.theme-customizer-panel--dialog),
.v-theme--transparent .v-overlay__content:has(.theme-customizer-panel--dialog) {
  border-radius: 0 !important;
  backdrop-filter: none !important;
  background: transparent !important;
  box-shadow: none !important;
}

:is(html[data-theme='transparent'], .v-theme--transparent) .theme-customizer-card-option .theme-customizer-theme-icon,
:is(html[data-theme='transparent'], .v-theme--transparent) .theme-customizer-color-option .theme-customizer-native-icon,
:is(html[data-theme='transparent'], .v-theme--transparent) .theme-customizer-header-icon {
  backdrop-filter: none !important;
  background: transparent !important;
  box-shadow: none !important;
}

.theme-customizer-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.theme-customizer-title {
  margin: 0;
  color: rgba(var(--v-theme-on-surface), var(--v-high-emphasis-opacity));
  font-size: 1.45rem;
  font-weight: 600;
  line-height: 1.2;
}

.theme-customizer-header-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}

.theme-customizer-body {
  flex: 1 1 auto;
  min-block-size: 0;
}

.theme-customizer-section {
  padding-block: 28px;
  padding-inline: 32px;
}

.theme-customizer-chip {
  display: inline-flex;
  align-items: center;
  border-radius: 6px;
  background: rgba(var(--v-theme-primary), 0.14);
  color: rgb(var(--v-theme-primary));
  font-size: 1.25rem;
  font-weight: 600;
  line-height: 1.1;
  padding-block: 6px;
  padding-inline: 14px;
}

.theme-customizer-section-title {
  color: rgba(var(--v-theme-on-surface), var(--v-high-emphasis-opacity));
  font-size: 1rem;
  font-weight: 600;
  line-height: 1.25;
  margin-block: 28px 16px;
}

.theme-customizer-section-note {
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 0.875rem;
  line-height: 1.45;
  margin-block: -6px 16px;
}

.theme-customizer-color-grid {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(auto-fill, 48px);
}

.theme-customizer-color-option {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.12);
  border-radius: 10px;
  appearance: none;
  block-size: 48px;
  color: rgba(var(--v-theme-on-surface), var(--v-high-emphasis-opacity));
  cursor: pointer;
  inline-size: 48px;
  transition:
    border-color 0.18s ease,
    background-color 0.18s ease,
    box-shadow 0.18s ease;

  &.is-active {
    border-width: 2px;
    border-color: rgb(var(--v-theme-primary));
    box-shadow: 0 0 0 3px rgba(var(--v-theme-primary), 0.12);
  }
}

.theme-customizer-color-swatch {
  display: block;
  border-radius: 8px;
  block-size: 30px;
  inline-size: 30px;
}

.theme-customizer-color-option--picker {
  background: rgba(var(--v-theme-on-surface), 0.04);
}

.theme-customizer-native-color {
  position: absolute;
  block-size: 1px;
  inline-size: 1px;
  inset-block: 50% auto;
  inset-inline: 50% auto;
  opacity: 0;
  pointer-events: none;
}

.theme-customizer-option-grid {
  display: grid;
  gap: 16px;
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.theme-customizer-option-grid--theme {
  grid-template-columns: repeat(auto-fit, minmax(96px, 1fr));
}

.theme-customizer-card-option,
.theme-customizer-preview-option {
  display: flex;
  flex-direction: column;
  align-items: center;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.12);
  border-radius: 10px;
  appearance: none;
  color: rgba(var(--v-theme-on-surface), var(--v-high-emphasis-opacity));
  cursor: pointer;
  font-size: 1rem;
  gap: 10px;
  transition:
    border-color 0.18s ease,
    background-color 0.18s ease,
    color 0.18s ease,
    box-shadow 0.18s ease;

  &.is-active {
    border-width: 2px;
    border-color: rgb(var(--v-theme-primary));
    background: rgba(var(--v-theme-primary), 0.08);
    box-shadow: 0 0 0 3px rgba(var(--v-theme-primary), 0.12);
    color: rgb(var(--v-theme-primary));
  }
}

.theme-customizer-card-option {
  justify-content: center;
  padding: 16px;
  min-block-size: 112px;
}

.theme-customizer-preview-grid {
  display: grid;
  gap: 16px;
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.theme-customizer-preview-grid--skins {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.theme-customizer-preview-option {
  align-items: flex-start;
  padding: 0;
  border: 0;
  background: transparent;
  box-shadow: none !important;

  &.is-active {
    background: transparent;
    box-shadow: none !important;

    .theme-customizer-mini-layout {
      border-width: 2px;
      border-color: rgb(var(--v-theme-primary));
      background: rgba(var(--v-theme-primary), 0.04);
    }
  }

  > span:last-child {
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
    padding-inline-start: 2px;
  }

  &.is-disabled {
    cursor: not-allowed;
    opacity: 0.52;
  }
}

.theme-customizer-semi-dark {
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: rgba(var(--v-theme-on-surface), var(--v-high-emphasis-opacity));
  font-size: 1.1rem;
  font-weight: 600;
  margin-block-start: 28px;
  margin-inline: -32px;
  padding-inline: 32px;
}

.theme-customizer-mini-layout {
  display: grid;
  overflow: hidden;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.12);
  border-radius: 10px;
  block-size: 74px;
  grid-template-columns: 34% 1fr;
  inline-size: 100%;
  min-inline-size: 92px;
}

.theme-customizer-mini-layout--collapsed {
  grid-template-columns: 18% 1fr;
}

.theme-customizer-mini-layout--horizontal {
  grid-template-columns: 1fr;
  grid-template-rows: 24% 1fr;
}

.mini-sidebar,
.mini-content {
  display: flex;
  flex-direction: column;
  padding: 10px;
  gap: 8px;
}

.mini-sidebar {
  background: rgba(var(--v-theme-on-surface), 0.04);
}

.mini-sidebar i,
.mini-content i {
  display: block;
  border-radius: 4px;
  background: rgba(var(--v-theme-on-surface), 0.12);
  block-size: 6px;
}

.mini-content i {
  background: rgba(var(--v-theme-on-surface), 0.06);
  block-size: 18px;
}

.theme-customizer-mini-layout--bordered {
  .mini-content i,
  .mini-sidebar i {
    border: 1px solid rgba(var(--v-theme-on-surface), 0.12);
    background: transparent;
  }
}

.theme-customizer-mini-layout--horizontal {
  .mini-sidebar {
    flex-direction: row;
    align-items: center;
  }
}

@media (width <= 600px) {
  .theme-customizer-drawer {
    inline-size: min(100vw, 420px) !important;
  }

  .theme-customizer-header,
  .theme-customizer-section {
    padding-inline: 22px;
  }

  .theme-customizer-preview-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
