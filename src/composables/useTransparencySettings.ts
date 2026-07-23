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

let transparencyPreviewSnapshot: TransparencySettings | null = null
let transparencyPreviewState: TransparencySettings | null = null

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

/** 校验透明主题设置并限制数值范围。 */
function normalizeTransparencySettings(settings: TransparencySettings): TransparencySettings {
  return {
    opacity: Number.isFinite(settings.opacity) ? clamp(settings.opacity, 0, 1) : 0.3,
    blur: Number.isFinite(settings.blur) ? clamp(settings.blur, 0, 30) : 10,
    backgroundPosterOpacity: Number.isFinite(settings.backgroundPosterOpacity)
      ? clamp(settings.backgroundPosterOpacity, 0, 1)
      : 0,
    backgroundBlur: Number.isFinite(settings.backgroundBlur) ? clamp(settings.backgroundBlur, 0, 30) : 16,
    glassQuality: settings.glassQuality === 'realtime' ? 'realtime' : 'lightweight',
    level: settings.level,
  }
}

/** 将透明主题设置应用到当前页面，不改变持久化状态。 */
function applyTransparencyAppearance(settings: TransparencySettings) {
  const normalized = normalizeTransparencySettings(settings)

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

  window.dispatchEvent(
    new CustomEvent<TransparencySettings>(TRANSPARENCY_SETTINGS_CHANGED_EVENT, { detail: normalized }),
  )

  return normalized
}

/** 将透明主题设置写入本地存储。 */
function persistTransparencySettings(settings: TransparencySettings) {
  const normalized = normalizeTransparencySettings(settings)

  localStorage.setItem('transparency-opacity', normalized.opacity.toString())
  localStorage.setItem('transparency-blur', normalized.blur.toString())
  localStorage.setItem('transparency-background-poster-opacity', normalized.backgroundPosterOpacity.toString())
  localStorage.setItem('transparency-background-blur', normalized.backgroundBlur.toString())
  localStorage.setItem('transparency-glass-quality', normalized.glassQuality)
  localStorage.setItem('transparency-level', normalized.level)

  return normalized
}

/** 应用透明主题设置并写入本地存储。 */
export function applyTransparencySettings(settings: TransparencySettings) {
  const normalized = persistTransparencySettings(settings)

  return applyTransparencyAppearance(normalized)
}

/** 按本地存储中的最新值应用透明主题设置。 */
export function applyStoredTransparencySettings() {
  transparencyPreviewSnapshot = null
  transparencyPreviewState = null

  return applyTransparencySettings(readTransparencySettings())
}

/** 临时预览透明主题设置，关闭设置面板时可恢复已保存快照。 */
export function previewTransparencySettings(patch: Partial<TransparencySettings>) {
  if (!transparencyPreviewSnapshot) {
    transparencyPreviewSnapshot = normalizeTransparencySettings(readTransparencySettings())
  }

  transparencyPreviewState = applyTransparencyAppearance(
    normalizeTransparencySettings({
      ...transparencyPreviewSnapshot,
      ...transparencyPreviewState,
      ...patch,
    }),
  )

  return transparencyPreviewState
}

/** 将当前透明主题预览作为一次设置事务持久化。 */
export function commitTransparencyPreview() {
  const settings = transparencyPreviewState

  transparencyPreviewSnapshot = null
  transparencyPreviewState = null

  return settings ? applyTransparencySettings(settings) : normalizeTransparencySettings(readTransparencySettings())
}

/** 丢弃透明主题预览并恢复打开设置面板前的持久化快照。 */
export function cancelTransparencyPreview() {
  const snapshot = transparencyPreviewSnapshot

  transparencyPreviewSnapshot = null
  transparencyPreviewState = null

  return snapshot ? applyTransparencyAppearance(snapshot) : normalizeTransparencySettings(readTransparencySettings())
}

/** 提供透明主题设置的响应式状态和操作方法。 */
export function useTransparencySettings() {
  const storedSettings = normalizeTransparencySettings(readTransparencySettings())
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

  /** 将当前响应式状态同步为未持久化预览。 */
  function syncTransparencySettings() {
    const normalized = previewTransparencySettings({
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

  /** 将当前预览写入本地存储。 */
  function saveTransparencySettings() {
    const normalized = commitTransparencyPreview()

    syncReactiveState(normalized)
  }

  /** 丢弃当前预览并恢复持久化设置。 */
  function cancelTransparencySettings() {
    const normalized = cancelTransparencyPreview()

    syncReactiveState(normalized)
  }

  /** 使用指定设置刷新面板草稿。 */
  function syncReactiveState(settings: TransparencySettings) {
    transparencyOpacity.value = settings.opacity
    transparencyBlur.value = settings.blur
    backgroundPosterOpacity.value = settings.backgroundPosterOpacity
    backgroundBlur.value = settings.backgroundBlur
    transparencyGlassQuality.value = settings.glassQuality
    transparencyLevel.value = settings.level
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
    cancelTransparencySettings,
    currentPresetLevel,
    onBackgroundBlurChange,
    onBackgroundPosterOpacityChange,
    onBlurChange,
    onGlassQualityChange,
    onOpacityChange,
    resetTransparencySettings,
    saveTransparencySettings,
    syncTransparencySettings,
    transparencyBlur,
    transparencyGlassQuality,
    transparencyOpacity,
    transparencyLevel,
  }
}
