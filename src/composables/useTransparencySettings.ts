import { computed, ref } from 'vue'

export type TransparencyGlassQuality = 'lightweight' | 'realtime'

export interface TransparencySettings {
  backgroundBlur: number
  backgroundPosterOpacity: number
  blur: number
  glassQuality: TransparencyGlassQuality
  level: string
  opacity: number
}

export const transparencyPresets = {
  low: { opacity: 0.6, blur: 5 },
  medium: { opacity: 0.3, blur: 10 },
  high: { opacity: 0.1, blur: 15 },
}

export const TRANSPARENCY_SETTINGS_CHANGED_EVENT = 'transparency-settings-changed'

/** 将数值限制在指定范围内。 */
function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

/** 读取玻璃质量档位，未知值回落到默认的轻量玻璃路径。 */
function readGlassQuality(): TransparencyGlassQuality {
  const storedQuality = localStorage.getItem('transparency-glass-quality')

  return storedQuality === 'realtime' ? 'realtime' : 'lightweight'
}

/** 从本地存储读取透明主题设置。 */
export function readTransparencySettings(): TransparencySettings {
  return {
    opacity: parseFloat(localStorage.getItem('transparency-opacity') || '0.3'),
    blur: parseFloat(localStorage.getItem('transparency-blur') || '10'),
    backgroundPosterOpacity: parseFloat(localStorage.getItem('transparency-background-poster-opacity') || '0'),
    backgroundBlur: parseFloat(localStorage.getItem('transparency-background-blur') || '16'),
    glassQuality: readGlassQuality(),
    level: localStorage.getItem('transparency-level') || 'medium',
  }
}

/** 应用透明主题设置并写入本地存储。 */
export function applyTransparencySettings(settings: TransparencySettings) {
  const normalized: TransparencySettings = {
    opacity: Number.isFinite(settings.opacity) ? clamp(settings.opacity, 0, 1) : 0.3,
    blur: Number.isFinite(settings.blur) ? clamp(settings.blur, 0, 30) : 10,
    backgroundPosterOpacity: Number.isFinite(settings.backgroundPosterOpacity)
      ? clamp(settings.backgroundPosterOpacity, 0, 1)
      : 0,
    backgroundBlur: Number.isFinite(settings.backgroundBlur) ? clamp(settings.backgroundBlur, 0, 30) : 16,
    glassQuality: settings.glassQuality === 'realtime' ? 'realtime' : 'lightweight',
    level: settings.level,
  }

  const root = document.documentElement
  root.style.setProperty('--transparent-opacity', normalized.opacity.toString())
  root.style.setProperty('--transparent-opacity-light', (normalized.opacity * 0.67).toString())
  root.style.setProperty('--transparent-opacity-heavy', (normalized.opacity * 1.67).toString())
  root.style.setProperty('--transparent-blur', `${normalized.blur}px`)
  root.style.setProperty('--transparent-blur-light', `${normalized.blur * 0.6}px`)
  root.style.setProperty('--transparent-blur-heavy', `${normalized.blur * 1.6}px`)
  root.style.setProperty('--transparent-background-poster-opacity', (1 - normalized.backgroundPosterOpacity).toString())
  root.style.setProperty('--transparent-background-blur', `${normalized.backgroundBlur}px`)
  root.classList.toggle('transparent-blur-disabled', normalized.blur <= 0)
  root.classList.toggle('transparent-background-blur-disabled', normalized.backgroundBlur <= 0)
  root.classList.toggle('transparent-glass-lightweight', normalized.glassQuality === 'lightweight')
  root.classList.toggle('transparent-glass-realtime', normalized.glassQuality === 'realtime')

  localStorage.setItem('transparency-opacity', normalized.opacity.toString())
  localStorage.setItem('transparency-blur', normalized.blur.toString())
  localStorage.setItem('transparency-background-poster-opacity', normalized.backgroundPosterOpacity.toString())
  localStorage.setItem('transparency-background-blur', normalized.backgroundBlur.toString())
  localStorage.setItem('transparency-glass-quality', normalized.glassQuality)
  localStorage.setItem('transparency-level', normalized.level)

  window.dispatchEvent(new CustomEvent<TransparencySettings>(TRANSPARENCY_SETTINGS_CHANGED_EVENT, { detail: normalized }))

  return normalized
}

/** 按本地存储中的最新值应用透明主题设置。 */
export function applyStoredTransparencySettings() {
  return applyTransparencySettings(readTransparencySettings())
}

/** 提供透明主题设置的响应式状态和操作方法。 */
export function useTransparencySettings() {
  const storedSettings = readTransparencySettings()
  const transparencyOpacity = ref(storedSettings.opacity)
  const transparencyBlur = ref(storedSettings.blur)
  const backgroundPosterOpacity = ref(storedSettings.backgroundPosterOpacity)
  const backgroundBlur = ref(storedSettings.backgroundBlur)
  const transparencyGlassQuality = ref<TransparencyGlassQuality>(storedSettings.glassQuality)
  const transparencyLevel = ref(storedSettings.level)

  const currentPresetLevel = computed(() => {
    for (const [level, preset] of Object.entries(transparencyPresets)) {
      if (
        Math.abs(transparencyOpacity.value - preset.opacity) < 0.01 &&
        Math.abs(transparencyBlur.value - preset.blur) < 0.1
      ) {
        return level
      }
    }

    return null
  })

  /** 同步当前响应式状态到 CSS 变量和本地存储。 */
  function syncTransparencySettings() {
    const normalized = applyTransparencySettings({
      opacity: transparencyOpacity.value,
      blur: transparencyBlur.value,
      backgroundPosterOpacity: backgroundPosterOpacity.value,
      backgroundBlur: backgroundBlur.value,
      glassQuality: transparencyGlassQuality.value,
      level: transparencyLevel.value,
    })

    transparencyOpacity.value = normalized.opacity
    transparencyBlur.value = normalized.blur
    backgroundPosterOpacity.value = normalized.backgroundPosterOpacity
    backgroundBlur.value = normalized.backgroundBlur
    transparencyGlassQuality.value = normalized.glassQuality
    transparencyLevel.value = normalized.level
  }

  /** 按预设级别调整透明度和模糊度。 */
  function adjustTransparency(level: string) {
    transparencyLevel.value = level

    switch (level) {
      case 'low':
        transparencyOpacity.value = transparencyPresets.low.opacity
        transparencyBlur.value = transparencyPresets.low.blur
        break
      case 'medium':
        transparencyOpacity.value = transparencyPresets.medium.opacity
        transparencyBlur.value = transparencyPresets.medium.blur
        break
      case 'high':
        transparencyOpacity.value = transparencyPresets.high.opacity
        transparencyBlur.value = transparencyPresets.high.blur
        break
    }

    syncTransparencySettings()
  }

  /** 处理手动调整面板透明度。 */
  function onOpacityChange() {
    transparencyLevel.value = ''
    syncTransparencySettings()
  }

  /** 处理手动调整面板模糊度。 */
  function onBlurChange() {
    transparencyLevel.value = ''
    syncTransparencySettings()
  }

  /** 处理背景海报透明度变化。 */
  function onBackgroundPosterOpacityChange() {
    syncTransparencySettings()
  }

  /** 处理背景磨砂变化。 */
  function onBackgroundBlurChange() {
    syncTransparencySettings()
  }

  /** 处理玻璃质量档位变化。 */
  function onGlassQualityChange() {
    syncTransparencySettings()
  }

  /** 重置透明主题设置为默认值。 */
  function resetTransparencySettings() {
    transparencyOpacity.value = transparencyPresets.medium.opacity
    transparencyBlur.value = transparencyPresets.medium.blur
    backgroundPosterOpacity.value = 0
    backgroundBlur.value = 16
    transparencyGlassQuality.value = 'lightweight'
    transparencyLevel.value = 'medium'
    syncTransparencySettings()
  }

  return {
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
    syncTransparencySettings,
    transparencyBlur,
    transparencyGlassQuality,
    transparencyOpacity,
    transparencyLevel,
  }
}
