<script setup lang="ts">
import {
  themeCustomizerPrimaryColors,
  themeCustomizerShadowLevels,
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

// 处理固定面板的全局 Esc 关闭快捷键。
function handleGlobalKeydown(event: KeyboardEvent) {
  // 固定侧栏不再依赖 Vuetify overlay，手动补上常见的 Esc 关闭行为。
  if (event.key === 'Escape') emit('close')
}

onMounted(() => {
  // 面板一挂载就代表已打开，及时同步根节点状态让全局 FAB 预留右侧空间。
  syncThemeCustomizerOpenState(true)
  window.addEventListener('keydown', handleGlobalKeydown)
})

onScopeDispose(clearThemeCustomizerOpenState)
onScopeDispose(() => {
  if (typeof window === 'undefined') return

  window.removeEventListener('keydown', handleGlobalKeydown)
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

// 当前阴影滑杆数值，界面使用 number，主题设置继续存储 Vuetify elevation 字符串档位。
const shadowSliderValue = computed(() => Number(settings.value.shadow))

const radiusOptions = computed<
  Array<{
    title: string
    value: ThemeCustomizerRadius
  }>
>(() => [
  {
    title: t('theme.customizer.radiusNone'),
    value: 'none',
  },
  {
    title: t('theme.customizer.radiusSmall'),
    value: 'small',
  },
  {
    title: t('theme.customizer.radiusDefault'),
    value: 'default',
  },
  {
    title: t('theme.customizer.radiusLarge'),
    value: 'large',
  },
  {
    title: t('theme.customizer.radiusExtra'),
    value: 'extra',
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
    settings.value.shadow !== '0' ||
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

// 打开原生颜色选择器。
function openColorPicker() {
  customColorInput.value?.click()
}

// 处理原生颜色选择器的自定义主色输入。
function handleCustomColorInput(event: Event) {
  const color = (event.target as HTMLInputElement).value

  setPrimaryColor(color)
}

// 切换布局类型，App 模式下保留移动端固定布局。
function handleLayoutChange(layout: ThemeCustomizerLayout) {
  // App 模式固定使用移动端导航，避免切换桌面布局后破坏底部导航体验。
  if (appMode.value) return

  setLayout(layout)
}

// 将 Vuetify 滑杆的数字步进写回字符串型 elevation 档位。
function handleShadowSliderChange(value: unknown) {
  const rawValue = Array.isArray(value) ? value[0] : value
  const numericValue = Number(rawValue)

  if (!Number.isFinite(numericValue)) return

  const clampedValue = Math.min(24, Math.max(0, Math.round(numericValue)))
  const shadow = String(clampedValue) as ThemeCustomizerShadow

  if (themeCustomizerShadowLevels.includes(shadow)) setShadow(shadow)
}

// 重置主题定制设置，App 模式只恢复可调整的外观项。
async function handleResetSettings() {
  if (!appMode.value) {
    await resetSettings()

    return
  }

  // App 模式共享定制器，但保留桌面导航相关偏好，只重置 App 侧可调整的外观设置。
  await setPrimaryColor(defaultPrimaryColor)
  await setRadius('default')
  await setShadow('0')
  await setSkin('default')
  await setTheme('auto')
}
</script>

<template>
  <aside
    class="theme-customizer-panel-host"
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

      <div class="theme-customizer-body">
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
              <span class="theme-customizer-border-scene" :class="`theme-customizer-border-scene--${skin.value}`">
                <span class="theme-customizer-border-scene__card">
                  <i />
                  <i />
                </span>
                <span class="theme-customizer-border-scene__dialog">
                  <i />
                </span>
                <span class="theme-customizer-border-scene__menu">
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
                :class="`theme-customizer-radius-scene--${radius.value}`"
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
          <div class="theme-customizer-shadow-slider">
            <div class="theme-customizer-shadow-slider__header">
              <span>{{ t('theme.customizer.shadowLevel', { level: settings.shadow }) }}</span>
              <span>0 - 24</span>
            </div>
            <div class="theme-customizer-shadow-slider__control">
              <span
                class="theme-customizer-shadow-slider__sample"
                :style="{ boxShadow: `var(--app-elevation-${settings.shadow})` }"
              >
                <span class="theme-customizer-shadow-slider__sample-accent" />
                <span class="theme-customizer-shadow-slider__sample-line" />
                <span class="theme-customizer-shadow-slider__sample-line theme-customizer-shadow-slider__sample-line--short" />
              </span>
              <VSlider
                :model-value="shadowSliderValue"
                :aria-label="t('theme.customizer.shadow')"
                :max="24"
                :min="0"
                :step="1"
                color="primary"
                density="comfortable"
                hide-details
                show-ticks="always"
                thumb-label
                tick-size="2"
                @update:model-value="handleShadowSliderChange"
              />
            </div>
            <div
              class="theme-customizer-shadow-slider__scale"
              aria-hidden="true"
            >
              <span>0</span>
              <span>24</span>
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
      </div>
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

  /* 背景层保持完整视口高度，避免 iOS 键盘触发 visual viewport resize 后露出底层页面。 */
  block-size: 100vh !important;
  border-inline-start: 1px solid rgba(var(--v-theme-on-surface), 0.08) !important;
  box-shadow: var(--app-surface-shadow) !important;
  inline-size: 420px !important;
  inset-block-start: 0 !important;
  inset-inline-end: 0 !important;
  max-block-size: none !important;
  min-block-size: 100vh !important;
}

@supports (block-size: 100lvh) {
  .theme-customizer-panel-host {
    block-size: 100lvh !important;
    min-block-size: 100lvh !important;
  }
}

.theme-customizer-panel {
  position: relative;
  display: flex;
  flex-direction: column;
  block-size: 100vh;
  inline-size: 100%;
  min-block-size: 0;
}

@supports (block-size: 100dvh) {
  .theme-customizer-panel {
    block-size: 100dvh;
  }
}

.theme-customizer-panel--dialog {
  overflow: hidden;
  block-size: 100%;
  max-block-size: 100%;

  /* 独立 App 模式会贴近 viewport-fit=cover 顶部，面板内部需要避开 iOS 状态栏。 */
  padding-block-start: env(safe-area-inset-top, 0px);
}

.theme-customizer-panel--dialog .theme-customizer-body {
  block-size: auto;
  padding-block-end: env(safe-area-inset-bottom, 0px);
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
  -webkit-overflow-scrolling: touch;
  -ms-overflow-style: none;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }
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
    .theme-customizer-border-scene,
    .theme-customizer-radius-scene {
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

.theme-customizer-border-scene {
  position: relative;
  display: block;
  overflow: hidden;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.12);
  border-radius: 10px;
  background:
    linear-gradient(180deg, rgba(var(--v-theme-on-surface), 0.02), rgba(var(--v-theme-on-surface), 0.05)),
    rgb(var(--v-theme-surface));
  block-size: 74px;
  inline-size: 100%;
  min-inline-size: 92px;
}

.theme-customizer-border-scene__card,
.theme-customizer-border-scene__dialog,
.theme-customizer-border-scene__menu {
  position: absolute;
  display: flex;
  flex-direction: column;
  border: 0 solid rgba(var(--v-theme-on-surface), 0.14);
  border-radius: 6px;
  background: rgba(var(--v-theme-surface), 0.92);
  gap: 5px;
  padding: 7px;
  box-shadow: var(--app-elevation-0);
}

.theme-customizer-border-scene__card {
  block-size: 36px;
  inline-size: 46%;
  inset-block-start: 12px;
  inset-inline-start: 10px;
}

.theme-customizer-border-scene__dialog {
  block-size: 42px;
  inline-size: 38%;
  inset-block-start: 18px;
  inset-inline-end: 13px;
}

.theme-customizer-border-scene__menu {
  block-size: 30px;
  inline-size: 30%;
  inset-block-end: 10px;
  inset-inline-start: 34%;
}

.theme-customizer-border-scene__card i,
.theme-customizer-border-scene__dialog i,
.theme-customizer-border-scene__menu i {
  display: block;
  border-radius: 3px;
  background: rgba(var(--v-theme-on-surface), 0.1);
  block-size: 5px;
}

.theme-customizer-border-scene--bordered {
  .theme-customizer-border-scene__card,
  .theme-customizer-border-scene__dialog,
  .theme-customizer-border-scene__menu {
    border-width: 1px;
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

  --theme-customizer-preview-control-radius: var(--app-vuetify-rounded);
  --theme-customizer-preview-surface-radius: var(--app-vuetify-rounded-lg);
}

.theme-customizer-radius-scene--none {
  --theme-customizer-preview-control-radius: var(--app-vuetify-rounded-sm);
  --theme-customizer-preview-surface-radius: var(--app-vuetify-rounded-sm);
}

.theme-customizer-radius-scene--small {
  --theme-customizer-preview-control-radius: var(--app-vuetify-rounded);
  --theme-customizer-preview-surface-radius: var(--app-vuetify-rounded);
}

.theme-customizer-radius-scene--large {
  --theme-customizer-preview-control-radius: var(--app-vuetify-rounded-lg);
  --theme-customizer-preview-surface-radius: var(--app-vuetify-rounded-lg);
}

.theme-customizer-radius-scene--extra {
  --theme-customizer-preview-control-radius: var(--app-vuetify-rounded-xl);
  --theme-customizer-preview-surface-radius: var(--app-vuetify-rounded-xl);
}

.theme-customizer-radius-scene__card {
  position: absolute;
  display: flex;
  flex-direction: column;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.08);
  border-radius: var(--theme-customizer-preview-surface-radius);
  background: rgb(var(--v-theme-surface));
  gap: 8px;
  inset: 16px;
  padding-block: 12px;
  padding-inline: 14px;
}

.theme-customizer-radius-scene__badge,
.theme-customizer-radius-scene__line {
  display: block;
  background: rgba(var(--v-theme-on-surface), 0.1);
}

.theme-customizer-radius-scene__badge {
  border-radius: var(--theme-customizer-preview-control-radius);
  block-size: 8px;
  inline-size: 42%;
  min-inline-size: 28px;
}

.theme-customizer-radius-scene__line {
  border-radius: var(--theme-customizer-preview-control-radius);
  block-size: 7px;
}

.theme-customizer-radius-scene__line--short {
  inline-size: 66%;
}

.theme-customizer-shadow-slider {
  padding: 16px 18px 12px;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.12);
  border-radius: var(--app-vuetify-rounded-lg);
  background: rgba(var(--v-theme-surface), 0.72);
}

.theme-customizer-shadow-slider__header,
.theme-customizer-shadow-slider__scale {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.theme-customizer-shadow-slider__header {
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 0.875rem;
  line-height: 1.3;
  margin-block-end: 14px;

  > span:first-child {
    color: rgba(var(--v-theme-on-surface), var(--v-high-emphasis-opacity));
    font-weight: 600;
  }
}

.theme-customizer-shadow-slider__control {
  display: grid;
  align-items: center;
  gap: 16px;
  grid-template-columns: 56px minmax(0, 1fr);
}

.theme-customizer-shadow-slider__sample {
  display: flex;
  flex-direction: column;
  justify-content: center;
  border-radius: var(--app-vuetify-rounded);
  border: 1px solid rgba(var(--v-theme-on-surface), 0.08);
  background: rgb(var(--v-theme-surface));
  block-size: 42px;
  gap: 5px;
  inline-size: 42px;
  padding-block: 8px;
  padding-inline: 9px;
}

.theme-customizer-shadow-slider__sample-accent,
.theme-customizer-shadow-slider__sample-line {
  display: block;
  border-radius: 999px;
}

.theme-customizer-shadow-slider__sample-accent {
  background: rgba(var(--v-theme-primary), 0.48);
  block-size: 5px;
  inline-size: 44%;
}

.theme-customizer-shadow-slider__sample-line {
  background: rgba(var(--v-theme-on-surface), 0.12);
  block-size: 4px;
  inline-size: 100%;
}

.theme-customizer-shadow-slider__sample-line--short {
  inline-size: 68%;
}

.theme-customizer-shadow-slider__scale {
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 0.75rem;
  line-height: 1;
  margin-block-start: 2px;
  margin-inline-start: 72px;
}

.theme-customizer-shadow-slider :deep(.v-slider.v-input) {
  margin: 0;
}

.theme-customizer-shadow-slider :deep(.v-slider-track__tick) {
  opacity: 0.5;
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
