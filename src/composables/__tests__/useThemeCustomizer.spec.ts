import {
  applyThemeCustomizerRootSettings,
  cancelGlassPreview,
  commitGlassPreview,
  persistPartialThemeCustomizerSettings,
  previewGlassSettings,
  readThemeCustomizerSettings,
  THEME_CUSTOMIZER_STORAGE_KEY,
  useEffectiveGlassSettings,
} from '@/composables/useThemeCustomizer'
import { beforeEach, describe, expect, it } from 'vitest'

describe('useThemeCustomizer glass settings', () => {
  beforeEach(() => {
    cancelGlassPreview()
    localStorage.clear()
    persistPartialThemeCustomizerSettings({ glassAppearance: 'clear', glassQuality: 'css' })
    localStorage.clear()
  })

  it('uses the checkpoint appearance, quality, and strength values by default', () => {
    const settings = readThemeCustomizerSettings()

    expect(settings.glassAppearance).toBe('clear')
    expect(settings.glassMotionStrength).toBe(50)
    expect(settings.glassQuality).toBe('balanced')
    expect(settings.glassReflectionStrength).toBe(50)
    expect(settings.glassTransparencyStrength).toBe(50)
  })

  it.each(['balanced', 'high'] as const)('preserves the %s quality contract', quality => {
    localStorage.setItem(THEME_CUSTOMIZER_STORAGE_KEY, JSON.stringify({ glassQuality: quality }))

    expect(readThemeCustomizerSettings().glassQuality).toBe(quality)
  })

  it.each(['clear', 'tinted', 'frosted'] as const)('preserves the %s material contract', glassAppearance => {
    localStorage.setItem(THEME_CUSTOMIZER_STORAGE_KEY, JSON.stringify({ glassAppearance }))

    expect(readThemeCustomizerSettings().glassAppearance).toBe(glassAppearance)
  })

  it('falls back when stored glass settings are invalid', () => {
    localStorage.setItem(
      THEME_CUSTOMIZER_STORAGE_KEY,
      JSON.stringify({ glassAppearance: 'opaque', glassQuality: 'ultra' }),
    )

    const settings = readThemeCustomizerSettings()

    expect(settings.glassAppearance).toBe('clear')
    expect(settings.glassQuality).toBe('balanced')
  })

  it('rounds and clamps persisted optical strength values', () => {
    localStorage.setItem(
      THEME_CUSTOMIZER_STORAGE_KEY,
      JSON.stringify({ glassMotionStrength: -12, glassReflectionStrength: 140.6, glassTransparencyStrength: 83.7 }),
    )

    expect(readThemeCustomizerSettings()).toMatchObject({
      glassMotionStrength: 0,
      glassReflectionStrength: 100,
      glassTransparencyStrength: 84,
    })
  })

  it('syncs glass settings to the document roots', () => {
    const settings = readThemeCustomizerSettings()

    applyThemeCustomizerRootSettings({
      ...settings,
      glassAppearance: 'tinted',
      glassQuality: 'high',
    })

    expect(document.documentElement.dataset.glassAppearance).toBe('tinted')
    expect(document.documentElement.dataset.glassQuality).toBe('high')
    expect(document.body.dataset.glassAppearance).toBe('tinted')
    expect(document.body.dataset.glassQuality).toBe('high')
    expect(document.documentElement.style.getPropertyValue('--glass-reflection')).toBe('0.5')
    expect(document.body.style.getPropertyValue('--glass-reflection')).toBe('0.5')
    expect(document.documentElement.style.getPropertyValue('--glass-transparency')).toBe('0.5')
    expect(document.body.style.getPropertyValue('--glass-transparency')).toBe('0.5')
  })

  it('previews glass settings without persisting them', () => {
    const storedBeforePreview = localStorage.getItem(THEME_CUSTOMIZER_STORAGE_KEY)

    previewGlassSettings({ glassAppearance: 'tinted' })

    expect(document.documentElement.dataset.glassAppearance).toBe('tinted')
    expect(readThemeCustomizerSettings().glassAppearance).toBe('clear')
    expect(localStorage.getItem(THEME_CUSTOMIZER_STORAGE_KEY)).toBe(storedBeforePreview)
  })

  it('commits the latest glass preview as one persisted state', () => {
    previewGlassSettings({ glassAppearance: 'tinted' })
    previewGlassSettings({ glassAppearance: 'clear' })
    previewGlassSettings({
      glassAppearance: 'tinted',
      glassMotionStrength: 74,
      glassQuality: 'css',
      glassReflectionStrength: 81,
      glassTransparencyStrength: 80,
    })

    commitGlassPreview()

    expect(readThemeCustomizerSettings()).toMatchObject({
      glassAppearance: 'tinted',
      glassMotionStrength: 74,
      glassQuality: 'css',
      glassReflectionStrength: 81,
      glassTransparencyStrength: 80,
    })
    expect(document.documentElement.dataset.glassAppearance).toBe('tinted')
  })

  it('previews and commits frosted material without changing quality', () => {
    previewGlassSettings({ glassAppearance: 'frosted' })

    expect(document.documentElement.dataset.glassAppearance).toBe('frosted')
    expect(readThemeCustomizerSettings()).toMatchObject({ glassAppearance: 'clear', glassQuality: 'balanced' })

    commitGlassPreview()

    expect(readThemeCustomizerSettings()).toMatchObject({ glassAppearance: 'frosted', glassQuality: 'css' })
  })

  it('restores persisted glass settings when a preview is cancelled', () => {
    const effective = useEffectiveGlassSettings()
    persistPartialThemeCustomizerSettings({
      glassAppearance: 'tinted',
      glassMotionStrength: 42,
      glassReflectionStrength: 66,
      glassTransparencyStrength: 72,
    })
    previewGlassSettings({
      glassAppearance: 'clear',
      glassMotionStrength: 90,
      glassReflectionStrength: 12,
      glassTransparencyStrength: 94,
    })
    expect(effective.value).toMatchObject({
      glassAppearance: 'clear',
      glassMotionStrength: 90,
      glassReflectionStrength: 12,
      glassTransparencyStrength: 94,
    })

    cancelGlassPreview()

    expect(document.documentElement.dataset.glassAppearance).toBe('tinted')
    expect(effective.value).toMatchObject({
      glassAppearance: 'tinted',
      glassMotionStrength: 42,
      glassReflectionStrength: 66,
      glassTransparencyStrength: 72,
    })
  })
})
