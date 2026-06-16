<script setup lang="ts">
import type { CSSProperties } from 'vue'
import {
  themeCustomizerPrimaryColors,
  useThemeCustomizer,
  type ThemeCustomizerLayout,
  type ThemeCustomizerRadius,
  type ThemeCustomizerShadow,
  type ThemeCustomizerSkin,
  type ThemeCustomizerTheme,
} from '@/composables/useThemeCustomizer'
import { usePWA } from '@/composables/usePWA'
import { useI18n } from 'vue-i18n'
import { useTheme } from 'vuetify'

const emit = defineEmits<{
  'close': []
}>()

const customColorInput = ref<HTMLInputElement | null>(null)

const {
  isCustomized,
  resetSettings,
  setLayout,
  setPrimaryColor,
  setRadius,
  setSemiDarkMenu,
  setShadow,
  setSkin,
  setTheme,
  settings,
} = useThemeCustomizer()
const { appMode } = usePWA()
const { t } = useI18n()
const { global: globalTheme } = useTheme()
const defaultPrimaryColor = themeCustomizerPrimaryColors[0].value
const customizerViewportHeight = ref('100dvh')

function getVisibleViewportHeight() {
  if (typeof window === 'undefined') return '100dvh'

  const height = window.visualViewport?.height || window.innerHeight || document.documentElement.clientHeight

  return height > 0 ? `${Math.round(height)}px` : '100dvh'
}

// iOS 小屏的可见视口会随地址栏和独立模式 safe area 变化，面板高度需要跟随真实可见高度。
function syncCustomizerViewportHeight() {
  customizerViewportHeight.value = getVisibleViewportHeight()
}

// 将主题定制器打开状态同步到根节点，供全局悬浮按钮避让右侧面板。
function syncThemeCustomizerOpenState(isOpen: boolean) {
  if (typeof document === 'undefined') return

  if (isOpen) {
    document.documentElement.setAttribute('data-theme-customizer-open', 'true')
    document.body.setAttribute('data-theme-customizer-open', 'true')

    return
  }

  document.documentElement.removeAttribute('data-theme-customizer-open')
  document.body.removeAttribute('data-theme-customizer-open')
}

// 组件卸载时清理根节点状态，避免路由切换后悬浮按钮继续保持让位。
function clearThemeCustomizerOpenState() {
  syncThemeCustomizerOpenState(false)
}

function handleGlobalKeydown(event: KeyboardEvent) {
  // 固定侧栏不再依赖 Vuetify overlay，手动补上常见的 Esc 关闭行为。
  if (event.key === 'Escape') emit('close')
}

onMounted(() => {
  syncCustomizerViewportHeight()
  window.addEventListener('keydown', handleGlobalKeydown)
  window.addEventListener('resize', syncCustomizerViewportHeight)
  window.addEventListener('orientationchange', syncCustomizerViewportHeight)
  window.visualViewport?.addEventListener('resize', syncCustomizerViewportHeight)
  window.visualViewport?.addEventListener('scroll', syncCustomizerViewportHeight)
})

onScopeDispose(clearThemeCustomizerOpenState)
onScopeDispose(() => {
  if (typeof window === 'undefined') return

  window.removeEventListener('keydown', handleGlobalKeydown)
  window.removeEventListener('resize', syncCustomizerViewportHeight)
  window.removeEventListener('orientationchange', syncCustomizerViewportHeight)
  window.visualViewport?.removeEventListener('resize', syncCustomizerViewportHeight)
  window.visualViewport?.removeEventListener('scroll', syncCustomizerViewportHeight)
})

const customizerContainerStyle = computed<CSSProperties>(() => ({
  '--theme-customizer-viewport-height': customizerViewportHeight.value,
}))

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

const shadowOptions = computed<
  Array<{
    title: string
    value: ThemeCustomizerShadow
  }>
>(() => [
  {
    title: t('theme.customizer.shadowNone'),
    value: 'none',
  },
  {
    title: t('theme.customizer.shadowLow'),
    value: 'low',
  },
  {
    title: t('theme.customizer.shadowMedium'),
    value: 'medium',
  },
  {
    title: t('theme.customizer.shadowHigh'),
    value: 'high',
  },
])

const radiusOptions = computed<
  Array<{
    previewRadius: string
    title: string
    value: ThemeCustomizerRadius
  }>
>(() => [
  {
    previewRadius: '4px',
    title: t('theme.customizer.radiusSmall'),
    value: 'small',
  },
  {
    previewRadius: '8px',
    title: t('theme.customizer.radiusDefault'),
    value: 'default',
  },
  {
    previewRadius: '12px',
    title: t('theme.customizer.radiusLarge'),
    value: 'large',
  },
  {
    previewRadius: '16px',
    title: t('theme.customizer.radiusExtra'),
    value: 'extra',
  },
  {
    previewRadius: '24px',
    title: t('theme.customizer.radiusHuge'),
    value: 'huge',
  },
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
    settings.value.radius !== 'default' ||
    settings.value.shadow !== 'none' ||
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
  await setRadius('default')
  await setShadow('none')
  await setSkin('default')
  await setTheme('auto')
}
</script>

<template>
  <aside
    class="theme-customizer-panel-host"
    :style="customizerContainerStyle"
    role="dialog"
    :aria-label="t('theme.customizer.title')"
  >
    <div class="theme-customizer-panel" :class="{ 'theme-customizer-panel--dialog': appMode, 'app-surface': appMode }">
      <div class="theme-customizer-header py-5 px-4">
        <div>
          <h2 class="theme-customizer-title">{{ t('theme.customizer.title') }}</h2>
        </div>
        <div class="theme-customizer-header-actions">
          <VBadge color="error" dot :model-value="showResetBadge" location="top end" offset-x="2" offset-y="2">
            <IconBtn :aria-label="t('theme.customizer.reset')" @click="handleResetSettings">
              <VIcon class="text-high-emphasis" icon="mdi-refresh" />
            </IconBtn>
          </VBadge>
          <IconBtn :aria-label="t('common.close')" @click="emit('close')">
            <VIcon class="text-high-emphasis" icon="mdi-close" />
          </IconBtn>
        </div>
      </div>

      <VDivider />

      <PerfectScrollbar class="theme-customizer-body" :options="{ wheelPropagation: false }">
        <section class="theme-customizer-section">
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

          <VDivider class="mt-7" />

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

          <VDivider class="mt-7" />

          <h3 class="theme-customizer-section-title">{{ t('theme.customizer.radius') }}</h3>
          <div class="theme-customizer-preview-grid theme-customizer-preview-grid--radius">
            <div
              v-for="radius in radiusOptions"
              :key="radius.value"
              class="theme-customizer-preview-option"
              :class="{ 'is-active': settings.radius === radius.value }"
              @click="setRadius(radius.value)"
            >
              <span
                class="theme-customizer-radius-scene"
                :style="{ '--theme-customizer-radius-preview': radius.previewRadius }"
              >
                <span class="theme-customizer-radius-scene__card">
                  <span class="theme-customizer-radius-scene__badge" />
                  <span class="theme-customizer-radius-scene__line" />
                  <span class="theme-customizer-radius-scene__line theme-customizer-radius-scene__line--short" />
                </span>
              </span>
              <span>{{ radius.title }}</span>
            </div>
          </div>

          <VDivider class="mt-7" />

          <h3 class="theme-customizer-section-title">{{ t('theme.customizer.shadow') }}</h3>
          <div class="theme-customizer-preview-grid theme-customizer-preview-grid--shadow">
            <div
              v-for="shadow in shadowOptions"
              :key="shadow.value"
              class="theme-customizer-preview-option"
              :class="{ 'is-active': settings.shadow === shadow.value }"
              @click="setShadow(shadow.value)"
            >
              <span class="theme-customizer-shadow-scene" :class="`theme-customizer-shadow-scene--${shadow.value}`">
                <span class="theme-customizer-shadow-scene__panel">
                  <span class="theme-customizer-shadow-scene__panel-line" />
                  <span
                    class="theme-customizer-shadow-scene__panel-line theme-customizer-shadow-scene__panel-line--short"
                  />
                </span>

                <span class="theme-customizer-shadow-scene__card">
                  <span class="theme-customizer-shadow-scene__badge" />
                  <span class="theme-customizer-shadow-scene__line theme-customizer-shadow-scene__line--short" />
                  <span class="theme-customizer-shadow-scene__line" />
                </span>
              </span>
              <span>{{ shadow.title }}</span>
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
          <h3 class="theme-customizer-section-title">{{ t('theme.customizer.layout') }}</h3>
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
  </aside>
</template>

<style lang="scss" scoped>
/* stylelint-disable no-descending-specificity */

.theme-customizer-panel-host {
  position: fixed !important;
  z-index: 2102 !important;
  display: flex;
  overflow: hidden;
  border-radius: 0;
  background: rgb(var(--v-theme-surface));
  block-size: var(--theme-customizer-viewport-height, 100dvh) !important;
  border-inline-start: 1px solid rgba(var(--v-theme-on-surface), 0.08) !important;
  box-shadow: var(--app-surface-shadow) !important;
  inline-size: 420px !important;
  inset-block-start: 0 !important;
  inset-inline-end: 0 !important;
  max-block-size: var(--theme-customizer-viewport-height, 100dvh) !important;
}

.theme-customizer-panel {
  position: relative;
  display: flex;
  flex-direction: column;
  block-size: 100%;
  inline-size: 100%;
  min-block-size: 0;
}

.theme-customizer-panel--dialog {
  overflow: hidden;
  block-size: 100%;
  max-block-size: 100%;

  /* 独立 App 模式会贴近 viewport-fit=cover 顶部，面板内部需要避开 iOS 状态栏。 */
  padding-block-start: env(safe-area-inset-top);
}

.theme-customizer-panel--dialog .theme-customizer-body {
  block-size: auto;
  padding-block-end: env(safe-area-inset-bottom);
}

@media (width <= 600px) {
  .theme-customizer-panel-host {
    inline-size: 100vw !important;
  }
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
  padding-block-end: 28px;
  padding-inline: 32px;
}

.theme-customizer-section-title {
  color: rgba(var(--v-theme-on-surface), var(--v-high-emphasis-opacity));
  font-size: 1.1rem;
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

.theme-customizer-preview-grid--shadow {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.theme-customizer-preview-grid--radius {
  grid-template-columns: repeat(auto-fit, minmax(92px, 1fr));
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

    .theme-customizer-mini-layout,
    .theme-customizer-radius-scene,
    .theme-customizer-shadow-scene {
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

  .mini-sidebar {
    flex-direction: row;
    align-items: center;
  }
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

.theme-customizer-radius-scene {
  position: relative;
  display: block;
  overflow: hidden;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.12);
  border-radius: 10px;
  background:
    linear-gradient(180deg, rgba(var(--v-theme-on-surface), 0.02), rgba(var(--v-theme-on-surface), 0.05)),
    rgb(var(--v-theme-surface));
  block-size: 90px;
  inline-size: 100%;
  min-inline-size: 0;
}

.theme-customizer-radius-scene__card {
  position: absolute;
  display: flex;
  flex-direction: column;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.08);
  border-radius: var(--theme-customizer-radius-preview);
  background: rgb(var(--v-theme-surface));
  gap: 8px;
  inset: 16px;
  padding-block: 12px;
  padding-inline: 14px;
}

.theme-customizer-radius-scene__badge,
.theme-customizer-radius-scene__line {
  display: block;
  border-radius: 999px;
  background: rgba(var(--v-theme-on-surface), 0.1);
}

.theme-customizer-radius-scene__badge {
  block-size: 8px;
  inline-size: 42%;
  min-inline-size: 28px;
}

.theme-customizer-radius-scene__line {
  block-size: 7px;
}

.theme-customizer-radius-scene__line--short {
  inline-size: 66%;
}

.theme-customizer-shadow-scene {
  position: relative;
  display: block;
  overflow: hidden;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.12);
  border-radius: 10px;
  background:
    linear-gradient(180deg, rgba(var(--v-theme-on-surface), 0.02), rgba(var(--v-theme-on-surface), 0.06)),
    rgb(var(--v-theme-surface));
  block-size: 110px;
  inline-size: 100%;
  min-inline-size: 0;
}

.theme-customizer-shadow-scene__panel,
.theme-customizer-shadow-scene__card {
  position: absolute;
  display: flex;
  flex-direction: column;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.08);
  background: rgb(var(--v-theme-surface));
  box-shadow: none;
  transition: box-shadow 0.18s ease;
}

.theme-customizer-shadow-scene__panel {
  padding: 12px;
  gap: 8px;
  inset-block-start: 16px;
  inset-inline: 14px;
  min-block-size: 54px;
}

.theme-customizer-shadow-scene__card {
  gap: 8px;
  inset-block-end: 12px;
  inset-inline: 20px 16px;
  min-block-size: 46px;
  padding-block: 10px;
  padding-inline: 12px;
}

.theme-customizer-shadow-scene__panel-line,
.theme-customizer-shadow-scene__line,
.theme-customizer-shadow-scene__badge {
  display: block;
  border-radius: 999px;
  background: rgba(var(--v-theme-on-surface), 0.1);
}

.theme-customizer-shadow-scene__badge {
  block-size: 6px;
  inline-size: 34%;
  min-inline-size: 28px;
}

.theme-customizer-shadow-scene__panel-line,
.theme-customizer-shadow-scene__line {
  block-size: 7px;
}

.theme-customizer-shadow-scene__panel-line--short,
.theme-customizer-shadow-scene__line--short {
  inline-size: 62%;
}

.theme-customizer-shadow-scene--low {
  .theme-customizer-shadow-scene__panel {
    box-shadow:
      0 8px 18px rgba(var(--v-theme-on-surface), 0.08),
      0 2px 6px rgba(var(--v-theme-on-surface), 0.05);
  }

  .theme-customizer-shadow-scene__card {
    box-shadow:
      0 10px 22px rgba(var(--v-theme-on-surface), 0.1),
      0 4px 10px rgba(var(--v-theme-on-surface), 0.06);
  }
}

.theme-customizer-shadow-scene--medium {
  .theme-customizer-shadow-scene__panel {
    box-shadow:
      0 12px 28px rgba(var(--v-theme-on-surface), 0.12),
      0 4px 12px rgba(var(--v-theme-on-surface), 0.08);
  }

  .theme-customizer-shadow-scene__card {
    box-shadow:
      0 16px 34px rgba(var(--v-theme-on-surface), 0.14),
      0 6px 16px rgba(var(--v-theme-on-surface), 0.09);
  }
}

.theme-customizer-shadow-scene--high {
  .theme-customizer-shadow-scene__panel {
    box-shadow:
      0 16px 38px rgba(var(--v-theme-on-surface), 0.16),
      0 6px 18px rgba(var(--v-theme-on-surface), 0.1);
  }

  .theme-customizer-shadow-scene__card {
    box-shadow:
      0 22px 48px rgba(var(--v-theme-on-surface), 0.18),
      0 8px 22px rgba(var(--v-theme-on-surface), 0.12);
  }
}

@media (width <= 600px) {
  .theme-customizer-header,
  .theme-customizer-section {
    padding-inline: 22px;
  }

  .theme-customizer-preview-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
